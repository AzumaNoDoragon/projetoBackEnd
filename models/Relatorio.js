const { pool } = require('../database/connection');
const { calcularFatura } = require('../utils/faturas');
const { hojeISO } = require('../utils/datas');

const emCentavos = (valor) => Math.round(Number(valor) * 100);
const emReais = (centavos) => centavos / 100;

class Relatorio {
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