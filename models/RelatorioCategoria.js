const { pool } = require('../database/connection');

const { periodoAnterior } = require('../utils/datas');

const arredondar = (valor) => Number(valor.toFixed(2));

class RelatorioCategoria {
    async gerar(usuarioId, inicio, fim) {
        const { inicio: inicioAnterior, fim: fimAnterior } = periodoAnterior(inicio, fim);
        const [linhas] = await pool.execute(
            `SELECT
                c.id,
                c.nome,
                l.tipo,
                SUM(CASE
                    WHEN l.data BETWEEN ? AND ? THEN l.valor
                    ELSE 0
                END) AS total,
                SUM(CASE
                    WHEN l.data BETWEEN ? AND ? THEN l.valor
                    ELSE 0
                END) AS anterior
             FROM lancamentos l
             JOIN categorias c ON c.id = l.categoria_id
             WHERE l.usuario_id = ?
               AND c.usuario_id = ?
               AND l.data BETWEEN ? AND ?
             GROUP BY c.id, c.nome, l.tipo
             HAVING total > 0 OR anterior > 0
             ORDER BY total DESC, c.id`,
            [
                inicio, fim,
                inicioAnterior, fimAnterior,
                usuarioId, usuarioId,
                inicioAnterior, fim
            ]
        );

        const montarGrupo = (tipo) => {
            const categorias = linhas
                .filter((linha) => linha.tipo === tipo)
                .map((linha) => ({
                    id: linha.id,
                    nome: linha.nome,
                    total: Number(linha.total),
                    anterior: Number(linha.anterior)
                }));

            const totalCentavos = categorias.reduce(
                (soma, categoria) => soma + Math.round(categoria.total * 100),
                0
            );

            const total = totalCentavos / 100;

            return {
                total,
                categorias: categorias.map((categoria) => ({
                    ...categoria,
                    percentual: total === 0
                        ? 0
                        : arredondar((categoria.total / total) * 100),
                    variacao: categoria.anterior === 0
                        ? (categoria.total === 0 ? 0 : null)
                        : arredondar(
                            ((categoria.total - categoria.anterior) /
                                categoria.anterior) * 100
                        )
                }))
            };
        };

        return {
            periodo: { inicio, fim },
            periodoAnterior: {
                inicio: inicioAnterior,
                fim: fimAnterior
            },
            saidas: montarGrupo('saida'),
            entradas: montarGrupo('entrada')
        };
    }
}

module.exports = new RelatorioCategoria();