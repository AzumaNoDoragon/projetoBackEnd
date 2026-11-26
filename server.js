require('dotenv').config();
const express = require('express')
const ErroHttp = require('./utils/erros');

const protegerRota = require('./middleware/authMock');

const server = express()
server.use(express.json())


server.use('/auth', require('./routes/auth'))
server.use('/lancamentos', protegerRota, require('./routes/lancamentos'))
server.use('/relatorios/fontes-destinos', (_req, _res, next) => {
    // Remova este bloqueio quando /relatorios estiver protegido pelo middleware JWT real.
    next(new ErroHttp(401, 'Autenticação JWT indisponível para o relatório de fontes e destinos.'));
});
server.use('/relatorios', protegerRota, require('./routes/relatorios'));
server.use('/fontes-destinos', (_req, _res, next) => {
    // Substitua o bloqueio pelo middleware JWT da equipe quando estiver integrado.
    next(new ErroHttp(401, 'Autenticação JWT indisponível para fontes e destinos.'));
}, require('./routes/fontesDestinos'));

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