const express = require('express');
const FonteDestino = require('../models/FonteDestino');

const router = express.Router();

// No server.js, monte este router após o middleware JWT real, que define req.auth.id,
// e após express.json(). Esta verificação de identidade não valida tokens JWT.
function executar(operacao) {
    return async (req, res) => {
        const usuarioId = req.auth?.id;
        const formatoValido = (typeof usuarioId === 'number' && Number.isInteger(usuarioId)) ||
            (typeof usuarioId === 'string' && /^\d+$/.test(usuarioId));
        const id = formatoValido ? Number(usuarioId) : NaN;

        if (!Number.isSafeInteger(id) || id < 1 || id > 2147483647) {
            return res.status(401).json({
                erro: { codigo: 'NAO_AUTENTICADO', mensagem: 'Autenticação necessária ou identidade inválida.' }
            });
        }

        try {
            return await operacao(req, res, id);
        } catch (erro) {
            if (erro instanceof FonteDestino.ErroFonteDestino) {
                return res.status(erro.status).json({
                    erro: { codigo: erro.codigo, mensagem: erro.message }
                });
            }
            return res.status(500).json({
                erro: { codigo: 'ERRO_INTERNO', mensagem: 'Não foi possível concluir a operação.' }
            });
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
