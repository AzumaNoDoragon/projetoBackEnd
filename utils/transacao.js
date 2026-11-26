const { pool } = require('../database/connection');
const ErroHttp = require('./erros');

async function tentarTransacao(operacao) {
    const banco = await pool.getConnection();
    let reutilizavel = true;
    try {
        await banco.beginTransaction();
        const resultado = await operacao(banco);
        await banco.commit();
        return resultado;
    } catch (erro) {
        try { await banco.rollback(); } catch { reutilizavel = false; }
        throw erro;
    } finally {
        if (reutilizavel) banco.release();
        else banco.destroy();
    }
}

async function emTransacao(operacao) {
    for (let tentativa = 0; tentativa < 3; tentativa++) {
        try {
            return await tentarTransacao(operacao);
        } catch (erro) {
            // O MySQL aborta uma das transacoes no deadlock. Refaz toda a leitura
            // e validacao; nenhuma operacao deste helper produz efeitos externos.
            if (erro.code !== 'ER_LOCK_DEADLOCK') throw erro;
            if (tentativa === 2) {
                throw new ErroHttp(409, 'Conflito entre alterações concorrentes. Tente novamente.');
            }
        }
    }
}

module.exports = { emTransacao };
