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

// TODO (colegas): GET /relatorios/categorias (RF7) e GET /relatorios/fontes-destinos (RF8)
// entram neste mesmo Router, com os métodos correspondentes em models/Relatorio.js.

module.exports = router;
