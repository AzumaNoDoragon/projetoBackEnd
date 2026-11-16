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

    read(id, usuarioId, callback) {
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
                callback(erro, resultado)
            });
        })
    }

    update(id, usuarioId, dados, callback) {
        conectar((erro, connection) => {
            if (erro) {
                return callback(erro);
            }
            
            const sql = `
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
            
            connection.query(sql, valores, (erro, resultado) => {
                connection.end();
                callback(erro, resultado)
            });
        })
    }

    delete(id, usuarioId, callback) {
        conectar((erro, connection) => {
            if (erro) {
                return callback(erro);
            }
            const sql = `
                DELETE FROM financas.lancamentos
                WHERE id = ? AND usuario_id = ?
            `;
            
            connection.query(sql, [id, usuarioId], (erro, resultado) => {
                connection.end();
                callback(erro, resultado)
            });
        })
    }
}

module.exports = new Lancamentos();