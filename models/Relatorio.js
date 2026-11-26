const { pool } = require('../database/connection');
const { calcularFatura } = require('../utils/faturas');
const { hojeISO, periodoAnterior } = require('../utils/datas');

const emCentavos = (valor) => Math.round(Number(valor) * 100);
const emReais = (centavos) => centavos / 100;
const arredondar = (n) => Math.round(n * 100) / 100;

class Relatorio {
    async categorias(usuarioId, inicio, fim) {
        const anterior = periodoAnterior(inicio, fim);

        const [linhas] = await pool.query(
            `SELECT c.id, c.nome, l.tipo,
                    SUM(CASE WHEN l.data BETWEEN ? AND ? THEN l.valor ELSE 0 END) AS total,
                    SUM(CASE WHEN l.data BETWEEN ? AND ? THEN l.valor ELSE 0 END) AS anterior
             FROM lancamentos l
             JOIN categorias c ON c.id = l.categoria_id
             WHERE l.usuario_id = ? AND l.data BETWEEN ? AND ?
             GROUP BY c.id, c.nome, l.tipo`,
            [inicio, fim, anterior.inicio, anterior.fim, usuarioId, anterior.inicio, fim]
        );

        const montar = (tipo) => {
            const itens = linhas
                .filter((l) => l.tipo === tipo)
                .map((l) => ({ id: l.id, nome: l.nome, total: emCentavos(l.total), anterior: emCentavos(l.anterior) }))
                .filter((l) => l.total > 0 || l.anterior > 0)
                .sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome));

            const totalGeral = itens.reduce((soma, l) => soma + l.total, 0);

            return {
                total: emReais(totalGeral),
                categorias: itens.map((l) => ({
                    id: l.id,
                    nome: l.nome,
                    total: emReais(l.total),
                    percentual: totalGeral > 0 ? arredondar((l.total / totalGeral) * 100) : 0,
                    anterior: emReais(l.anterior),
                    // sem base de comparação (período anterior zerado), a variação não existe
                    variacao: l.anterior > 0 ? arredondar(((l.total - l.anterior) / l.anterior) * 100) : null
                }))
            };
        };

        return {
            periodo: { inicio, fim },
            periodoAnterior: anterior,
            saidas: montar('saida'),
            entradas: montar('entrada')
        };
    }

    // RF8 — Entradas por fonte, saídas por destino e saldo das contas no período.
    async fontesDestinos(usuarioId, inicio, fim) {
        const [linhas] = await pool.query(
            `SELECT f.id, f.nome, f.tipo,
                    COALESCE(SUM(CASE WHEN l.tipo = 'entrada' THEN l.valor END), 0) AS entradas,
                    COALESCE(SUM(CASE WHEN l.tipo = 'saida' THEN l.valor END), 0) AS saidas
             FROM fontes_destinos f
             LEFT JOIN lancamentos l
                    ON l.fonte_destino_id = f.id AND l.usuario_id = ? AND l.data BETWEEN ? AND ?
             WHERE f.usuario_id = ?
             GROUP BY f.id, f.nome, f.tipo
             ORDER BY f.nome`,
            [usuarioId, inicio, fim, usuarioId]
        );

        const itens = linhas.map((l) => ({
            id: l.id,
            nome: l.nome,
            tipo: l.tipo,
            entradas: emCentavos(l.entradas),
            saidas: emCentavos(l.saidas)
        }));

        const lista = (campo) => {
            const filtrados = itens.filter((i) => i[campo] > 0).sort((a, b) => b[campo] - a[campo]);
            return {
                total: emReais(filtrados.reduce((soma, i) => soma + i[campo], 0)),
                itens: filtrados.map((i) => ({ id: i.id, nome: i.nome, tipo: i.tipo, total: emReais(i[campo]) }))
            };
        };

        const entradas = lista('entradas');
        const saidas = lista('saidas');

        return {
            periodo: { inicio, fim },
            entradas: { total: entradas.total, fontes: entradas.itens },
            saidas: { total: saidas.total, destinos: saidas.itens },
            contas: itens
                .filter((i) => i.tipo === 'conta')
                .map((i) => ({
                    id: i.id,
                    nome: i.nome,
                    entradas: emReais(i.entradas),
                    saidas: emReais(i.saidas),
                    saldo: emReais(i.entradas - i.saidas)
                }))
        };
    }

    async faturas(usuarioId, meses, hoje = hojeISO()) {
        const [cartoes] = await pool.query(
            `SELECT id, nome, dia_fechamento, dia_vencimento, limite
             FROM fontes_destinos
             WHERE usuario_id = ? AND tipo = 'cartao_credito'
             ORDER BY nome`,
            [usuarioId]
        );

        if (cartoes.length === 0) {
            return { dataReferencia: hoje, cartoes: [] };
        }

        const [lancamentos] = await pool.query(
            `SELECT id, descricao, valor, data, parcela_atual, total_parcelas, fonte_destino_id
             FROM lancamentos
             WHERE usuario_id = ? AND tipo = 'saida' AND fonte_destino_id IN (?)
             ORDER BY data, id`,
            [usuarioId, cartoes.map((c) => c.id)]
        );

        const resultado = cartoes.map((cartao) => {
            const regra = {
                diaFechamento: cartao.dia_fechamento,
                diaVencimento: cartao.dia_vencimento
            };

            // Uma compra feita hoje cai na fatura aberta; a parcela k+1 cai k meses depois.
            const janela = [];
            for (let k = 0; k <= meses; k++) {
                const datas = calcularFatura(hoje, regra, k + 1);
                janela.push({ ...datas, centavos: 0, lancamentos: [] });
            }
            const porReferencia = new Map(janela.map((f) => [f.referencia, f]));

            let utilizado = 0; // soma das parcelas cuja fatura ainda não venceu
            for (const l of lancamentos) {
                if (l.fonte_destino_id !== cartao.id) continue;

                const fatura = calcularFatura(l.data, regra, l.parcela_atual);
                const centavos = emCentavos(l.valor);

                if (fatura.vencimento >= hoje) utilizado += centavos;

                const alvo = porReferencia.get(fatura.referencia);
                if (alvo) {
                    const parcela = `${l.parcela_atual}/${l.total_parcelas}`;
                    alvo.centavos += centavos;
                    alvo.lancamentos.push({
                        id: l.id,
                        descricao: l.total_parcelas > 1 ? `${l.descricao} — ${parcela}` : l.descricao,
                        data: l.data,
                        parcela,
                        valor: emReais(centavos)
                    });
                }
            }

            const formatarFatura = (f) => ({
                referencia: f.referencia,
                fechamento: f.fechamento,
                vencimento: f.vencimento,
                total: emReais(f.centavos),
                lancamentos: f.lancamentos
            });

            const limiteCentavos = emCentavos(cartao.limite);

            return {
                id: cartao.id,
                nome: cartao.nome,
                diaFechamento: cartao.dia_fechamento,
                diaVencimento: cartao.dia_vencimento,
                limite: {
                    total: emReais(limiteCentavos),
                    utilizado: emReais(utilizado),
                    disponivel: emReais(limiteCentavos - utilizado)
                },
                faturaAtual: formatarFatura(janela[0]),
                proximasFaturas: janela.slice(1).map(formatarFatura)
            };
        });

        return { dataReferencia: hoje, cartoes: resultado };
    }
}

module.exports = new Relatorio();