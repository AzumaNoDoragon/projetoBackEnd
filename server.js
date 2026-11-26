require('dotenv').config();
const express = require('express')
const ErroHttp = require('./utils/erros');

const protegerRota = require('./middleware/auth');

const server = express()
server.use(express.json())


server.use('/auth', require('./routes/auth'))
server.use('/categorias', protegerRota, require('./routes/categorias'))
server.use('/lancamentos', protegerRota, require('./routes/lancamentos'))
server.use('/relatorios', protegerRota, require('./routes/relatorios'));

server.use((req, res) => { res.status(404).json({ erro: "Rota não encontrada." }) })

server.use((erro, req, res, next) => {
    if (erro.name === 'UnauthorizedError') {
        return res.status(401).json({ erro: 'Token ausente, inválido ou expirado.' });
    }
    if (erro instanceof ErroHttp) {
        const corpo = { erro: erro.message };
        if (erro.campos) corpo.campos = erro.campos;
        return res.status(erro.status).json(corpo);
    }
    if (erro.type === 'entity.parse.failed') {
        return res.status(400).json({ erro: 'JSON inválido no corpo da requisição.' });
    }
    console.error(erro);
    return res.status(500).json({ erro: 'Erro interno do servidor.' });
});

server.listen(process.env.PORT || 3000, () => {
    console.log('API de finanças rodando.');
});