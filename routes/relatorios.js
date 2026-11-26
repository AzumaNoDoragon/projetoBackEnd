const express = require('express');
const router = express.Router();

const Relatorio = require('../models/Relatorio');
const RelatorioCategoria = require('../models/RelatorioCategoria');
const ErroHttp = require('../utils/erros');
const { dataValida, periodoAnterior } = require('../utils/datas');

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

router.get('/fontes-destinos', async (req, res) => {
    const id = req.auth?.id;
    const usuarioId = typeof id === 'string' && /^\d+$/.test(id) ? Number(id) : id;
    if (!Number.isInteger(usuarioId) || usuarioId < 1 || usuarioId > 2147483647) {
        throw new ErroHttp(401, 'Autenticação necessária ou identidade inválida.');
    }

    // Lê a query completa para detectar repetições além do limite do parser do Express.
    const separador = req.originalUrl.indexOf('?');
    const consulta = new URLSearchParams(separador === -1 ? '' : req.originalUrl.slice(separador));
    const inicios = consulta.getAll('inicio');
    const fins = consulta.getAll('fim');
    const [inicio] = inicios;
    const [fim] = fins;
    const periodoComColchetes = [...consulta.keys()].some((campo) => /^(inicio|fim)\[/.test(campo));
    if (inicios.length !== 1 || fins.length !== 1 || periodoComColchetes ||
        !dataValida(inicio) || !dataValida(fim) ||
        inicio < '1000-01-01' || fim > '9999-12-31' || inicio > fim) {
        throw new ErroHttp(400, 'Dados inválidos.', {
            periodo: 'Informe inicio e fim uma única vez no formato AAAA-MM-DD, entre 1000-01-01 e 9999-12-31, com inicio <= fim.'
        });
    }

    const resultado = await Relatorio.fontesDestinos(usuarioId, inicio, fim);
    return res.status(200).json(resultado);
});

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

    const anterior = periodoAnterior(inicio, fim);
    if (anterior.inicio < '1000-01-01') {
        return res.status(400).json({
            erro: 'dados inválidos.',
            campos: {
                inicio: 'o período anterior deve permanecer a partir do ano 1000.'
            }
        });
    }

    const { inicio: inicioAnterior, fim: fimAnterior } = anterior;

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
