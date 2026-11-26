const express = require('express');
const router = express.Router();

const Relatorio = require('../models/Relatorio');
const ErroHttp = require('../utils/erros');
const { validarPeriodo } = require('../utils/validacoes');

router.get('/categorias', async (req, res) => {
    const { inicio, fim } = validarPeriodo(req.query);
    const resultado = await Relatorio.categorias(req.auth.id, inicio, fim);
    return res.status(200).json(resultado);
});

router.get('/fontes-destinos', async (req, res) => {
    const { inicio, fim } = validarPeriodo(req.query);
    const resultado = await Relatorio.fontesDestinos(req.auth.id, inicio, fim);
    return res.status(200).json(resultado);
});

router.get('/faturas', async (req, res) => {
    let meses = 3;

    if (req.query.meses !== undefined) {
        meses = Number(req.query.meses);
        if (!Number.isInteger(meses) || meses < 1 || meses > 12) {
            throw new ErroHttp(400, 'Dados inválidos.', {
                meses: 'Informe um número inteiro de 1 a 12.'
            });
        }
    }

    const resultado = await Relatorio.faturas(req.auth.id, meses);
    return res.status(200).json(resultado);
});

module.exports = router;