const fs = require('node:fs/promises');
const path = require('node:path');
const mysql = require('mysql2/promise');

require('dotenv').config();

async function inicializar() {
    if (!process.env.DB_NAME || !process.env.DB_NAME.trim()) {
        console.error('Defina DB_NAME com o nome de um banco existente.');
        process.exitCode = 1;
        return;
    }

    const sql = await fs.readFile(path.join(__dirname, 'schema.sql'), 'utf8');
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT || 3306,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        multipleStatements: true
    });

    try {
        await connection.query(sql);
        console.log('Inicialização das tabelas concluída com sucesso!');
    } finally {
        await connection.end();
    }
}

inicializar().catch((erro) => {
    console.error('Não foi possível inicializar as tabelas:', erro.code || 'falha na inicialização');
    process.exitCode = 1;
});
