const mysql = require('mysql2');
require('dotenv').config();

function conectar(callback, database) {
    const connection = mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT || 3306,
        database: database === undefined ? undefined : process.env.DB_NAME,
        multipleStatements: true
    });
    
    connection.connect((erro) => {
        if (erro) {
            console.error('Erro ao conectar no banco:', erro);
            callback(erro, null);
            return;
        }
    
        console.log('Conectado ao MySQL');
        callback(null, connection);
    });
}

module.exports = conectar;