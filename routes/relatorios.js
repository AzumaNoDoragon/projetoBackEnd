const express = require('express');
const router = express.Router();

const Relatorio = require('../models/Relatorio');
const ErroHttp = require('../utils/erros');

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

// GET /relatorios/fontes-destinos pode ser adicionado neste mesmo Router.

const RelatorioCategoria = require('../models/RelatorioCategoria');

const DIA_EM_MS = 24 * 60 * 60 * 1000;

function converterData(texto) {
    if (typeof texto !== 'string' ||
        !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(texto)) {
        return null;
    }

    const data = new Date(texto + 'T00:00:00.000Z');

    if (Number.isNaN(data.getTime()) ||
        data.toISOString().slice(0, 10) !== texto) {
        return null;
    }

    return data;
}

router.get('/categorias', async (req, res, next) => {
    const { inicio, fim } = req.query;
    const dataInicio = converterData(inicio);
    const dataFim = converterData(fim);
    const erros = {};

    if (!dataInicio) {
        erros.inicio = 'informe uma data válida no formato AAAA-MM-DD, entre os anos 1000 e 9999.';
    }

    if (!dataFim) {
        erros.fim = 'informe uma data válida no formato AAAA-MM-DD, entre os anos 1000 e 9999.';
    }

    if (dataInicio && dataFim && dataInicio > dataFim) {
        erros.fim = 'a data final deve ser igual ou posterior à inicial.';
    }

    if (Object.keys(erros).length > 0) {
        return res.status(400).json({
            erro: 'dados inválidos.',
            campos: erros
        });
    }

    // Inclui tanto o primeiro quanto o último dia.
    const quantidadeDias = (dataFim - dataInicio) / DIA_EM_MS + 1;

    const dataFimAnterior = new Date(
        dataInicio.getTime() - DIA_EM_MS
    );

    const dataInicioAnterior = new Date(
        dataInicio.getTime() - quantidadeDias * DIA_EM_MS
    );

    if (dataInicioAnterior.getUTCFullYear() < 1000) {
        return res.status(400).json({
            erro: 'dados inválidos.',
            campos: {
                inicio: 'o período anterior deve permanecer a partir do ano 1000.'
            }
        });
    }

    const inicioAnterior = dataInicioAnterior.toISOString().slice(0, 10);
    const fimAnterior = dataFimAnterior.toISOString().slice(0, 10);

    try {
        const relatorio = await RelatorioCategoria.gerar(
            req.auth.id,
            inicio,
            fim,
            inicioAnterior,
            fimAnterior
        );

        return res.status(200).json(relatorio);
    } catch (erro) {
        return next(erro);
    }
});


module.exports = router;

