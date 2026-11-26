const mysql = require('mysql2');
const { configuracao, nomeBanco } = require('./config');
const configBase = configuracao(null);

// Conexao avulsa com callback, preservada para os consumidores existentes.
function conectar(callback, database = nomeBanco()) {
    const connection = mysql.createConnection({
        ...configBase,
        database: database,
        multipleStatements: true
    });

    connection.connect((erro) => {
        if (erro) {
            console.error('Erro ao conectar no banco.');
            connection.destroy();
            callback(erro, null);
            return;
        }

        callback(null, connection);
    });
}

const pool = mysql.createPool({
    ...configBase,
    database: nomeBanco(),
    waitForConnections: true,
    connectionLimit: 10
}).promise();

module.exports = conectar;
module.exports.pool = pool;
