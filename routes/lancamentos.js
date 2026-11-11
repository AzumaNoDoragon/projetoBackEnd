const express = require('express');
const routes = express.Router();

const Lancamentos = require('../models/Lancamentos');

routes.get('/', (req, res) => {
    console.log('Rota GET acessada');
    const mensagem = Lancamentos.teste();

    res.status(200).send(mensagem)
})

module.exports = routes;