const connection = require('../database/connection')

class Lancamentos {
    teste() {
        console.log('Método teste executado');
        return 'deu certo!';
    }
}

module.exports = new Lancamentos();