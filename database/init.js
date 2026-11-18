// Cria o banco e as tabelas executando database/schema.sql
const fs = require('fs');
const path = require('path');
const conectar = require('./connection');

const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');

conectar((erro, connection) => {
    if (erro) {
        console.error('Não foi possível inicializar o banco.');
        return;
    }

    connection.query(sql, (erro) => {
        if (erro) {
            console.error('Erro ao inicializar: ', erro);
        } else {
            console.log('Banco criado com sucesso!');
        }
        connection.end();
    });
}, null);
