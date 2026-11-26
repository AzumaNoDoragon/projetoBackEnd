const { pool } = require('../database/connection');
const { calcularFatura } = require('../utils/faturas');
const { hojeISO, periodoAnterior } = require('../utils/datas');

const emCentavos = (valor) => Math.round(Number(valor) * 100);
const emReais = (centavos) => centavos / 100;

class Relatorio {
    async categorias(usuarioId, inicio, fim) {
        const anterior = periodoAnterior(inicio, fim);
        return require('./RelatorioCategoria').gerar(usuarioId, inicio, fim, anterior.inicio, anterior.fim);
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

    async fontesDestinos(usuarioId, inicio, fim) {
        const [fontes] = await pool.execute(
            `SELECT f.id, f.nome, f.tipo,
                    SUM(CASE WHEN l.tipo = 'entrada' THEN l.valor END) AS entradas,
                    SUM(CASE WHEN l.tipo = 'saida' THEN l.valor END) AS saidas,
                    COALESCE(SUM(CASE l.tipo
                        WHEN 'entrada' THEN l.valor
                        WHEN 'saida' THEN -l.valor
                    END), 0) AS saldo
             FROM fontes_destinos f
             LEFT JOIN lancamentos l
                ON l.fonte_destino_id = f.id
               AND l.usuario_id = f.usuario_id
               AND l.data BETWEEN ? AND ?
             WHERE f.usuario_id = ?
             GROUP BY f.id, f.nome, f.tipo
             ORDER BY f.nome, f.id`,
            [inicio, fim, usuarioId]
        );

        const entradas = [];
        const saidas = [];
        const contas = [];

        for (const fonte of fontes) {
            const { id, nome, tipo } = fonte;
            const totalEntradas = Number(fonte.entradas ?? 0);
            const totalSaidas = Number(fonte.saidas ?? 0);

            // SUM retorna NULL quando não há lançamentos do tipo correspondente.
            if (fonte.entradas !== null) {
                entradas.push({ id, nome, tipo, total: totalEntradas });
            }
            if (fonte.saidas !== null) {
                saidas.push({ id, nome, tipo, total: totalSaidas });
            }
            if (tipo === 'conta') {
                contas.push({ id, nome, entradas: totalEntradas, saidas: totalSaidas, saldo: Number(fonte.saldo) });
            }
        }

        return { periodo: { inicio, fim }, entradas, saidas, contas };
    }
}

module.exports = new Relatorio();