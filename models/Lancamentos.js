const conectar = require('../database/connection');

class Lancamentos {
    create(dados, usuarioId, callback) {
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

        connection.query(sql, valores, callback)
    }

    read(id, callback) {
        conectar((erro, connection) => {
            if (erro) {
                return callback(erro);
            }
            const sql = `
                SELECT *
                FROM financas.lancamentos
                WHERE id = ?
                ORDER BY data DESC
            `;
            
            connection.query(sql, [id], (erro, resultado) => {
                connection.end();
                callback(erro, resultado)
            });
        })
    }

    update() {
        
    }

    delete(id, usuarioId, callback) {
        const sql = `
            DELETE FROM financas.lancamentos
            WHERE ID = ? AND usuario_id = ?
        `;

        connection.query(sql, [id, usuarioId], callback);
    }
}

module.exports = new Lancamentos();