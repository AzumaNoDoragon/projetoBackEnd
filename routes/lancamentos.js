const express = require('express');
const routes = express.Router();

const Lancamentos = require('../models/Lancamentos');

routes.get('/', (req, res) => {
    console.log('Rota GET /');
    Lancamentos.read(req.usuario.id, (erro, resultados) => {
        if (erro) {
            return res.status(500).json({ erro: erro.mensage })
        }
        return res.status(200).json(resultados)
    })

    res.status(200).send(mensagem)
})

routes.get('/:id', (req, res) => {
    console.log('Rota GET /:id = ', req.params.id);
    Lancamentos.read(req.params.id, (erro, resultados) => {
        if (erro) {
            return res.status(500).json({ erro: erro.message })
        }
        return res.status(200).json(resultados)
    })
})

routes.post('/', (req, res) => {
    console.log('Rota POST /');
    const mensagem = Lancamentos.teste();

    res.status(200).send(mensagem)
})

routes.put('/:id', (req, res) => {
    const id = req.params.id;
    console.log('Rota PUT acessada');
    const mensagem = Lancamentos.teste();

    res.status(200).send(mensagem)
})

routes.delete('/:id', (req, res) => {
    const id = req.params.id;
    console.log('Rota GET acessada');
    const mensagem = Lancamentos.teste();

    res.status(200).send(mensagem)
})

module.exports = routes;