const express = require('express');
const router = express.Router();

const Relatorio = require('../models/Relatorio');
const ErroHttp = require('../utils/erros');
const { dataValida } = require('../utils/datas');

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

// TODO (colegas): GET /relatorios/categorias (RF7)
// entra neste mesmo Router, com o método correspondente em models/Relatorio.js.

module.exports = router;
