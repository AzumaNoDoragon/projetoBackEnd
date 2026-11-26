const { pool } = require('../database/connection');

const categoriasPadrao = [
    ['Salário', 'entrada'],
    ['Outras entradas', 'entrada'],
    ['Alimentação', 'saida'],
    ['Moradia', 'saida'],
    ['Mobilidade', 'saida'],
    ['Lazer', 'saida'],
    ['Saúde', 'saida'],
    ['Educação', 'saida'],
    ['Outras saídas', 'saida']
];

class Usuario {
    async inserir(db, { nome, email, cpf, senhaHash }) {
        const [resultado] = await db.execute(
            'INSERT INTO usuarios (nome, email, cpf, senha_hash) VALUES (?, ?, ?, ?)',
            [nome, email, cpf, senhaHash]
        );

        return resultado.insertId;
    }

    async cadastrar(dados) {
        const conexao = await pool.getConnection();

        try {
            await conexao.beginTransaction();

            const usuarioId = await this.inserir(conexao, dados);

            for (const [nome, tipo] of categoriasPadrao) {
                await conexao.execute(
                    'INSERT INTO categorias (usuario_id, nome, tipo) VALUES (?, ?, ?)',
                    [usuarioId, nome, tipo]
                );
            }

            await conexao.execute(
                'INSERT INTO fontes_destinos (usuario_id, nome, tipo) VALUES (?, ?, ?)',
                [usuarioId, 'Conta corrente', 'conta']
            );

            await conexao.commit();
            return usuarioId;
        } catch (erro) {
            try {
                await conexao.rollback();
            } catch (erroRollback) {
                console.error('Falha ao desfazer o cadastro:', erroRollback);
            }

            throw erro;
        } finally {
            conexao.release();
        }
    }

    async buscarPorEmail(email) {
        const [usuarios] = await pool.execute(
            'SELECT id, nome, email, senha_hash FROM usuarios WHERE email = ?',
            [email]
        );

        return usuarios[0] ?? null;
    }

    async buscarPorId(id) {
        const [usuarios] = await pool.execute(
            'SELECT id, nome, email, cpf, criado_em FROM usuarios WHERE id = ?',
            [id]
        );

        return usuarios[0] ?? null;
    }
}

module.exports = new Usuario();
