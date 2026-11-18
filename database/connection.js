const mysql = require('mysql2');
require('dotenv').config();

const configBase = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT || 3306,
    dateStrings: true
};

// Conexão avulsa com callback (usada pelos scripts init.js e seed.js)
function conectar(callback, database = process.env.DB_NAME) {
    const connection = mysql.createConnection({
        ...configBase,
        database: database,
        multipleStatements: true
    });

    connection.connect((erro) => {
        if (erro) {
            console.error('Erro ao conectar no banco:', erro);
            callback(erro, null);
            return;
        }

        callback(null, connection);
    });
}

const pool = mysql.createPool({
    ...configBase,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10
}).promise();

module.exports = conectar;
module.exports.pool = pool;