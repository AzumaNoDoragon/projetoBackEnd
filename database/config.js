const mysql = require('mysql2');
require('dotenv').config({ quiet: true });

function nomeBanco() {
    const nome = process.env.DB_NAME;
    if (typeof nome !== 'string' || !/^[A-Za-z0-9_][A-Za-z0-9_-]{0,63}$/.test(nome)) {
        throw new Error('DB_NAME deve ter de 1 a 64 caracteres: letras, numeros, _ ou - (sem hifen inicial).');
    }
    return nome;
}

function configuracao(database = nomeBanco()) {
    return {
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT || 3306,
        dateStrings: true,
        ...(database === null ? {} : { database })
    };
}

function identificadorBanco() { return mysql.escapeId(nomeBanco()); }
module.exports = { nomeBanco, configuracao, identificadorBanco };
