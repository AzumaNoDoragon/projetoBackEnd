const express = require('express');
const routes = express.Router();

const Lancamentos = require('../models/Lancamentos');
const autenticacao = require('../middleware/authMock');

routes.get('/', autenticacao, (req, res) => {
    Lancamentos.read(req.auth.id, req.query, (erro, resultados) => {
        if (erro) {
            return res.status(500).json({ erro: erro.mensage })
        }
        return res.status(200).json(resultados)
    })
})

routes.get('/:id', autenticacao, (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({
            erro: 'ID inválido'
        });
    }
    Lancamentos.read(id, req.auth.id, (erro, resultado) => {
        if (erro) {
            return res.status(500).json({ erro: erro.message })
        }
        if (resultado.length === 0) {
            return res.status(404).json({
                erro: 'Lançamento não encontrado'
            })
        }
        return res.status(200).json(resultado[0])
    })
})

routes.post('/', autenticacao, (req, res) => {
    console.log('Rota POST /');
    Lancamentos.create()
    const mensagem = Lancamentos.teste();

    res.status(200).send(mensagem)
})

routes.put('/:id', autenticacao, (req, res) => {
    Lancamentos.update(
        req.params.id, req.auth.id, req.body, (erro, resultados) => {
        if (erro) {
            return res.status(500).json({ erro: erro.message })
        }
        if (resultados.affectedRows === 0) {
            return res.status(404).json({
                erro: 'Lançamento não encontrado'
            });
        }
        return res.status(200).json({
            mensagem: 'Lançamento atualizado com sucesso'
        })
    })
})

routes.delete('/:id', autenticacao, (req, res) => {
    const id = Number(req.params.id)

    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({
            erro: 'ID inválido'
        });
    }

    Lancamentos.delete(id, req.auth.id, (erro, resultados) => {
        if (erro) {
            return res.status(500).json({ erro: erro.message })
        }
        if (resultados.affectedRows === 0) {
            return res.status(404).json({
                erro: 'Lançamento não encontrado'
            });
        }
        return res.status(200).json({
            mensagem: 'Lançamento excluído com sucesso'
        })
    })
})

module.exports = routes;