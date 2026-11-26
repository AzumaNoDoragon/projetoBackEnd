const { pool } = require('../database/connection');
const ErroHttp = require('../utils/erros');
const { emTransacao } = require('../utils/transacao');

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
        return emTransacao(async (banco) => {
            const [categorias] = await banco.execute(
                'SELECT id, tipo FROM categorias WHERE id = ? AND usuario_id = ? FOR UPDATE',
                [id, usuarioId]
            );
            if (!categorias.length) return 0;
            if (categorias[0].tipo !== tipo) {
                const [vinculados] = await banco.execute(
                    `SELECT id FROM lancamentos
                     WHERE categoria_id = ? AND usuario_id = ? AND tipo <> ? LIMIT 1 FOR UPDATE`,
                    [id, usuarioId, tipo]
                );
                if (vinculados.length) {
                    throw new ErroHttp(409, 'Não é possível alterar o tipo da categoria: há lançamentos incompatíveis vinculados.');
                }
            }
            await banco.execute(
                `UPDATE categorias SET nome = ?, tipo = ? WHERE id = ? AND usuario_id = ?`,
                [nome, tipo, id, usuarioId]
            );
            // A existência foi confirmada sob bloqueio, inclusive para edições sem mudanças.
            return 1;
        });
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