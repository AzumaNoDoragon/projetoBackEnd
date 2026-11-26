function autenticacao(req, res, next) {
    req.auth = {
        id: 2
    };

    next();
}

module.exports = autenticacao;