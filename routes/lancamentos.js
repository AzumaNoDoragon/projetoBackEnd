const express = require('express');
const router = express.Router();

const Lancamentos = require('../models/Lancamentos');
const ErroHttp = require('../utils/erros');
const { idValido, validarLancamento } = require('../utils/validacoes');

function lerId(valor) {
    if (!idValido(valor)) {
        throw new ErroHttp(400, 'ID inválido.');
    }
    return Number(valor);
}

router.get('/', async (req, res) => {
    const resultado = await Lancamentos.read(req.query, req.auth.id);
    return res.status(200).json(resultado);
});

router.get('/:id', async (req, res) => {
    const id = lerId(req.params.id);
    const lancamento = await Lancamentos.findById(id, req.auth.id);
    if (!lancamento) {
        throw new ErroHttp(404, 'Lançamento não encontrado.');
    }
    return res.status(200).json(lancamento);
});

router.post('/', async (req, res) => {
    const dados = validarLancamento(req.body, true);
    const criado = await Lancamentos.create(dados, req.auth.id);
    return res.status(201).json({
        mensagem: criado.parcelas > 1
            ? `Lançamento criado em ${criado.parcelas} parcelas.`
            : 'Lançamento criado com sucesso.',
        ...criado
    });
});

router.put('/:id', async (req, res) => {
    const id = lerId(req.params.id);
    const dados = validarLancamento(req.body, false);
    const atualizado = await Lancamentos.update(id, req.auth.id, dados);
    return res.status(200).json(atualizado);
});

router.delete('/:id', async (req, res) => {
    const id = lerId(req.params.id);
    const todasParcelas = req.query.todasParcelas === 'true';
    await Lancamentos.delete(id, req.auth.id, todasParcelas);
    return res.status(204).send();
});

module.exports = router;