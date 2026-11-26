const express = require('express');
const Categoria = require('../models/categorias');

const router = express.Router();

function validarDados(corpo) {
    const { nome, tipo } = corpo ?? {};
    const erros = {};

    if (typeof nome !== 'string' || !nome.trim() || nome.trim().length > 60) {
        erros.nome = 'informe um nome com até 60 caracteres.';
    }

    if (!['entrada', 'saida'].includes(tipo)) {
        erros.tipo = 'o tipo deve ser entrada ou saida.';
    }

    return erros;
}

function tratarErro(erro, res, next) {
    if (erro.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({
            erro: 'já existe uma categoria com este nome e tipo.'
        });
    }

    if (erro.code === 'ER_ROW_IS_REFERENCED_2') {
        return res.status(409).json({
            erro: 'não é possível excluir uma categoria com lançamentos vinculados.'
        });
    }

    return next(erro);
}

router.param('id', (req, res, next, id) => {
    if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id) < 1) {
        return res.status(400).json({
            erro: 'dados inválidos.',
            campos: { id: 'informe um ID inteiro positivo.' }
        });
    }

    return next();
});

router.get('/', async (req, res, next) => {
    const { tipo } = req.query;

    if (tipo !== undefined && !['entrada', 'saida'].includes(tipo)) {
        return res.status(400).json({
            erro: 'dados inválidos.',
            campos: { tipo: 'o tipo deve ser entrada ou saida.' }
        });
    }

    try {
        const categorias = await Categoria.listar(req.auth.id, tipo);

        return res.status(200).json(categorias);
    } catch (erro) {
        return next(erro);
    }
});

router.post('/', async (req, res, next) => {
    const erros = validarDados(req.body);

    if (Object.keys(erros).length > 0) {
        return res.status(400).json({
            erro: 'dados inválidos.',
            campos: erros
        });
    }

    const dados = {
        nome: req.body.nome.trim(),
        tipo: req.body.tipo
    };

    try {
        const id = await Categoria.criar(req.auth.id, dados);

        return res.status(201).json({ id, ...dados });
    } catch (erro) {
        return tratarErro(erro, res, next);
    }
});

router.put('/:id', async (req, res, next) => {
    const erros = validarDados(req.body);

    if (Object.keys(erros).length > 0) {
        return res.status(400).json({
            erro: 'dados inválidos.',
            campos: erros
        });
    }

    const id = Number(req.params.id);

    const dados = {
        nome: req.body.nome.trim(),
        tipo: req.body.tipo
    };

    try {
        const alteradas = await Categoria.atualizar(
            id,
            req.auth.id,
            dados
        );

        if (alteradas === 0) {
            return res.status(404).json({
                erro: 'categoria não encontrada.'
            });
        }

        return res.status(200).json({ id, ...dados });
    } catch (erro) {
        return tratarErro(erro, res, next);
    }
});

router.delete('/:id', async (req, res, next) => {
    try {
        const excluidas = await Categoria.excluir(
            Number(req.params.id),
            req.auth.id
        );

        if (excluidas === 0) {
            return res.status(404).json({
                erro: 'categoria não encontrada.'
            });
        }

        return res.status(204).end();
    } catch (erro) {
        return tratarErro(erro, res, next);
    }
});

module.exports = router;