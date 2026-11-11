const express = require('express')

const server = express()

server.use(express.json)

server.use(express.json)

server.use((req, res) => { res.status(404).json({ erro: "Rota não encontrada." }) })

server.use((erro, req, res, next) => {
    if (erro.name === "UnauthorizedError") {
        res.status(401).json({ erro: "Token ausente, expirado ou inválido." })
    }
    console.error(erro);
    return res.status(500).json({ erro: 'Erro interno do servidor!'})
})

server.listen(3000, () => {
    console.log("Servidor express rodando!");
})