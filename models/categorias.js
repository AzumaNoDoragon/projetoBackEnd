const { pool } = require('../database/connection');

class Categoria {
    async listar(usuarioId, tipo) {
        let sql = `
            SELECT id, nome, tipo
            FROM categorias
            WHERE usuario_id = ?
        `;

        const parametros = [usuarioId];

        if (tipo !== undefined) {
            sql += ' AND tipo = ?';
            parametros.push(tipo);
        }

        sql += ' ORDER BY nome, id';

        const [categorias] = await pool.execute(sql, parametros);
        return categorias;
    }

    async buscarPorId(id, usuarioId) {
        const [categorias] = await pool.execute(
            `SELECT id, nome, tipo
             FROM categorias
             WHERE id = ? AND usuario_id = ?`,
            [id, usuarioId]
        );

        return categorias[0] ?? null;
    }

    async criar(usuarioId, { nome, tipo }) {
        const [resultado] = await pool.execute(
            `INSERT INTO categorias (usuario_id, nome, tipo)
             VALUES (?, ?, ?)`,
            [usuarioId, nome, tipo]
        );

        return resultado.insertId;
    }

    async atualizar(id, usuarioId, { nome, tipo }) {
        const [resultado] = await pool.execute(
            `UPDATE categorias
             SET nome = ?, tipo = ?
             WHERE id = ? AND usuario_id = ?`,
            [nome, tipo, id, usuarioId]
        );

        return resultado.affectedRows;
    }

    async excluir(id, usuarioId) {
        const [resultado] = await pool.execute(
            `DELETE FROM categorias
             WHERE id = ? AND usuario_id = ?`,
            [id, usuarioId]
        );

        return resultado.affectedRows;
    }
}

module.exports = new Categoria();