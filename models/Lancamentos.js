const conectar = require('../database/connection');

class Lancamentos {
    create(dados, usuarioId, callback) {
        conectar((erro, connection) => {
            if (erro) {
                return callback(erro);
            }
            const {
                tipo, descricao, valor, data, categoria_id,
                fonte_destino_id, parcela_atual = 1,
                total_parcelas = 1, grupo_parcelamento = null
            } = dados;

            const sql = `
                INSERT INTO financas.lancamentos (
                    usuario_id, tipo, descricao, valor, data,
                    categoria_id, fonte_destino_id, parcela_atual,
                    total_parcelas, grupo_parcelamento
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            const valores = [
                usuarioId, tipo, descricao, valor, data,
                categoria_id, fonte_destino_id, parcela_atual,
                total_parcelas, grupo_parcelamento
            ];

            connection.query(sql, valores, (erro, resultado) => {
                connection.end();
                callback(erro, resultado)
            });
        }) 
    }

    read(filtro, usuarioId, callback) {
        conectar((erro, connection) => {
            if (erro) {
                return callback(erro);
            }

            const pagina = Number(filtro.pagina || 1);

            if (!Number.isInteger(pagina) || pagina < 1) {
                connection.end();
                return callback(new Error('Página inválida'));
            }

            if (filtro.tipo && !['entrada', 'saida'].includes(filtro.tipo)) {
                connection.end();
                return callback(new Error('Tipo inválido'));
            }

            for (const campo of ['categoriaId', 'fonteDestinoId']) {
                if (filtro[campo] !== undefined) {
                    const id = Number(filtro[campo]);

                    if (!Number.isInteger(id) || id <= 0) {
                        connection.end();
                        return callback(new Error(`${campo} inválido`));
                    }
                }
            }

            const hoje = new Date();

            const primeiroDia = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`;

            const ultimoDia = new Date(
                hoje.getFullYear(),
                hoje.getMonth() + 1,
                0
            ).getDate();

            const ultimoDiaMes = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`;

            const inicio = filtro.inicio || primeiroDia;
            const fim = filtro.fim || ultimoDiaMes;

            // Validação das datas
            const dataValida = (data) => {
                if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
                    return false;
                }

                const [ano, mes, dia] = data.split('-').map(Number);

                const dataConvertida = new Date(Date.UTC(ano, mes - 1, dia));

                return dataConvertida.getUTCFullYear() === ano &&
                    dataConvertida.getUTCMonth() === mes - 1 &&
                    dataConvertida.getUTCDate() === dia;
            };

            if (!dataValida(inicio) || !dataValida(fim) || inicio > fim) {
                connection.end();
                return callback(new Error('Período inválido'));
            }

            let sql = `
                SELECT *
                FROM financas.lancamentos
                WHERE usuario_id = ?
                AND data BETWEEN ? AND ?
            `;

            const valores = [usuarioId, inicio, fim];

            if (filtro.tipo) {
                sql += ' AND tipo = ?';
                valores.push(filtro.tipo);
            }

            if (filtro.categoriaId) {
                sql += ' AND categoria_id = ?';
                valores.push(Number(filtro.categoriaId));
            }

            if (filtro.fonteDestinoId) {
                sql += ' AND fonte_destino_id = ?';
                valores.push(Number(filtro.fonteDestinoId));
            }

            sql += ' ORDER BY data DESC, id DESC LIMIT ? OFFSET ?';

            const limite = ITENS_POR_PAGINA;
            const deslocamento = (pagina - 1) * limite;

            const valoresPaginacao = [...valores, limite, deslocamento];

            connection.query(sql, valoresPaginacao, (erro, resultados) => {
                if (erro) {
                    connection.end();
                    return callback(erro);
                }

                const sqlResumo = `
                    SELECT
                        COUNT(*) AS totalRegistros,
                        COALESCE(SUM(CASE
                            WHEN tipo = 'entrada' THEN valor
                            ELSE 0
                        END), 0) AS entradas,

                        COALESCE(SUM(CASE
                            WHEN tipo = 'saida' THEN valor
                            ELSE 0
                        END), 0) AS saidas

                    FROM financas.lancamentos
                    WHERE usuario_id = ?
                    AND data BETWEEN ? AND ?
                    ${filtro.tipo ? 'AND tipo = ?' : ''}
                    ${filtro.categoriaId ? 'AND categoria_id = ?' : ''}
                    ${filtro.fonteDestinoId ? 'AND fonte_destino_id = ?' : ''}
                `;

                connection.query(sqlResumo, valores, (erro, resumo) => {
                    connection.end();

                    if (erro) {
                        return callback(erro);
                    }

                    const entradas = Number(resumo[0].entradas);
                    const saidas = Number(resumo[0].saidas);
                    const totalRegistros = Number(resumo[0].totalRegistros);

                    const totalPaginas = Math.ceil(
                        totalRegistros / ITENS_POR_PAGINA
                    );

                    callback(null, {
                        periodo: {
                            inicio,
                            fim
                        },
                        resumo: {
                            entradas,
                            saidas,
                            saldo: entradas - saidas
                        },
                        pagina,
                        totalPaginas,
                        itens: resultados
                    });
                });
            });
        });
    }

    findById(id, usuarioId, callback) {
        conectar((erro, connection) => {
            if (erro) {
                return callback(erro);
            }

            const sql = `
                SELECT *
                FROM financas.lancamentos
                WHERE id = ? AND usuario_id = ?
            `;
            
            connection.query(sql, [id, usuarioId], (erro, resultado) => {
                connection.end();
                callback(erro, resultado[0])
            });
        })
    }

    update(id, usuarioId, dados, callback) {
        conectar((erro, connection) => {
            if (erro) {
                return callback(erro);
            }

            const sqlCategoria = `
                SELECT id, tipo
                FROM financas.categorias
                WHERE id = ? AND usuario_id = ?
            `;

            connection.query(
                sqlCategoria,
                [dados.categoria_id, usuarioId],
                (erro, categorias) => {
                    if (erro) {
                        connection.end();
                        return callback(erro);
                    }

                    if (categorias.length === 0) {
                        connection.end();

                        const erro = new Error('Categoria não encontrada');
                        erro.statusCode = 404;

                        return callback(erro);
                    }

                    if (categorias[0].tipo !== dados.tipo) {
                        connection.end();

                        const erro = new Error(
                            'A categoria não corresponde ao tipo do lançamento'
                        );
                        erro.statusCode = 400;

                        return callback(erro);
                    }

                    const sqlFonteDestino = `
                        SELECT id
                        FROM financas.fontes_destinos
                        WHERE id = ? AND usuario_id = ?
                    `;

                    connection.query(
                        sqlFonteDestino,
                        [dados.fonte_destino_id, usuarioId],
                        (erro, fontesDestinos) => {
                            if (erro) {
                                connection.end();
                                return callback(erro);
                            }

                            if (fontesDestinos.length === 0) {
                                connection.end();

                                const erro = new Error(
                                    'Fonte/destino não encontrada'
                                );
                                erro.statusCode = 404;

                                return callback(erro);
                            }

                            const sqlUpdate = `
                                UPDATE financas.lancamentos
                                SET
                                    tipo = ?,
                                    descricao = ?,
                                    valor = ?,
                                    data = ?,
                                    categoria_id = ?,
                                    fonte_destino_id = ?
                                WHERE id = ? AND usuario_id = ?
                            `;

                            const valores = [
                                dados.tipo,
                                dados.descricao,
                                dados.valor,
                                dados.data,
                                dados.categoria_id,
                                dados.fonte_destino_id,
                                id,
                                usuarioId
                            ];

                            connection.query(
                                sqlUpdate,
                                valores,
                                (erro, resultado) => {
                                    connection.end();
                                    callback(erro, resultado);
                                }
                            );
                        }
                    );
                }
            );
        });
    }

    delete(id, usuarioId, todasParcelas, callback) {
        this.findById(id, usuarioId, (erro, resultado) => {
            if (erro) {
                return callback(erro);
            }

            if (resultado.length === 0) {
                return callback(null, null);
            }

            const lancamento = resultado[0];

            conectar((erro, connection) => {
                if (erro) {
                    return callback(erro);
                }

                let sql;
                let valores;

                if (todasParcelas && lancamento.grupo_parcelamento) {
                    sql = `
                        DELETE FROM financas.lancamentos
                        WHERE grupo_parcelamento = ?
                        AND usuario_id = ?
                    `;

                    valores = [
                        lancamento.grupo_parcelamento,
                        usuarioId
                    ];
                } else {
                    sql = `
                        DELETE FROM financas.lancamentos
                        WHERE id = ? AND usuario_id = ?
                    `;

                    valores = [id, usuarioId];
                }

                connection.query(sql, valores, (erro, resultados) => {
                    connection.end();
                    callback(erro, resultados);
                });
            });
        });
    }
}

module.exports = new Lancamentos();