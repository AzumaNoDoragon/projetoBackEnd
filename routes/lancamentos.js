const express = require('express');
const routes = express.Router();
const Lancamentos = require('../models/Lancamentos');
const autenticacao = require('../middleware/auth');
const ErroHttp = require('../utils/erros');
const { idValido, validarLancamento } = require('../utils/validacoes');

// Preserva os nomes usados anteriormente e aceita o formato do model atualizado.
function normalizarCampos(corpo) {
    const dados = corpo || {};
    return {
        ...dados,
        categoriaId: dados.categoriaId ?? dados.categoria_id,
        fonteDestinoId: dados.fonteDestinoId ?? dados.fonte_destino_id
    };
}

function validarId(id) {
    if (!idValido(id)) throw new ErroHttp(400, 'ID inválido.');
    return Number(id);
}

routes.get('/', autenticacao, async (req, res) => {
    const resultado = await Lancamentos.read(normalizarCampos(req.query), req.auth.id);
    return res.status(200).json(resultado);
});

routes.get('/:id', autenticacao, async (req, res) => {
    const resultado = await Lancamentos.findById(validarId(req.params.id), req.auth.id);
    if (!resultado) throw new ErroHttp(404, 'Lançamento não encontrado.');
    return res.status(200).json(resultado);
});

routes.post('/', autenticacao, async (req, res) => {
    const dados = validarLancamento(normalizarCampos(req.body), true);
    const resultado = await Lancamentos.create(dados, req.auth.id);
    return res.status(201).json({
        mensagem: 'Lançamento criado com sucesso',
        ...resultado
    });
});

routes.put('/:id', autenticacao, async (req, res) => {
    const id = validarId(req.params.id);
    const dados = validarLancamento(normalizarCampos(req.body));
    await Lancamentos.update(id, req.auth.id, dados);
    return res.status(200).json({ mensagem: 'Lançamento atualizado com sucesso' });
});

routes.delete('/:id', autenticacao, async (req, res) => {
    const id = validarId(req.params.id);
    const todasParcelas = req.query.todasParcelas === 'true';
    await Lancamentos.delete(id, req.auth.id, todasParcelas);
    return res.status(204).end();
});

module.exports = routes;
