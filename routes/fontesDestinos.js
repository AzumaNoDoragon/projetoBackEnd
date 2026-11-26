const express = require('express');
const FonteDestino = require('../models/FonteDestino');
const ErroHttp = require('../utils/erros');

const router = express.Router();

// O middleware JWT deve preencher req.auth.id antes de executar estas rotas.
function executar(operacao) {
    return async (req, res) => {
        const usuarioId = req.auth?.id;
        const formatoValido = (typeof usuarioId === 'number' && Number.isInteger(usuarioId)) ||
            (typeof usuarioId === 'string' && /^\d+$/.test(usuarioId));
        const id = formatoValido ? Number(usuarioId) : NaN;

        if (!Number.isSafeInteger(id) || id < 1 || id > 2147483647) {
            throw new ErroHttp(401, 'Autenticação necessária ou identidade inválida.');
        }

        try {
            return await operacao(req, res, id);
        } catch (erro) {
            if (erro instanceof FonteDestino.ErroFonteDestino) {
                throw new ErroHttp(erro.status, erro.message);
            }
            throw erro;
        }
    };
}

router.post('/', executar(async (req, res, usuarioId) => {
    const registro = await FonteDestino.criar(usuarioId, req.body);
    return res.status(201).json({ dados: registro });
}));

router.get('/', executar(async (req, res, usuarioId) => {
    const registros = await FonteDestino.listar(usuarioId);
    return res.status(200).json({ dados: registros });
}));

router.get('/:id', executar(async (req, res, usuarioId) => {
    const registro = await FonteDestino.buscarPorId(usuarioId, req.params.id);
    if (registro === null) {
        throw new FonteDestino.ErroFonteDestino('NAO_ENCONTRADO', 'Fonte ou destino não encontrado.', 404);
    }
    return res.status(200).json({ dados: registro });
}));

router.put('/:id', executar(async (req, res, usuarioId) => {
    const registro = await FonteDestino.atualizar(usuarioId, req.params.id, req.body);
    return res.status(200).json({ dados: registro });
}));

router.delete('/:id', executar(async (req, res, usuarioId) => {
    await FonteDestino.excluir(usuarioId, req.params.id);
    return res.status(204).end();
}));

module.exports = router;
