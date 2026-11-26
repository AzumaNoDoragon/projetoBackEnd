// Apenas cria recursos ausentes; nao apaga nem recria tabelas existentes.
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { configuracao, identificadorBanco } = require('./config');

async function inicializar() {
    const nome = identificadorBanco();
    const banco = await mysql.createConnection({ ...configuracao(null), multipleStatements: true });
    try {
        await banco.query(`CREATE DATABASE IF NOT EXISTS ${nome} CHARACTER SET utf8mb4`);
        await banco.query(`USE ${nome}`);
        await banco.query(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
        console.log('Banco configurado e tabelas inicializados.');
    } finally { await banco.end(); }
}

if (require.main === module) inicializar().catch(() => {
    console.error('Falha ao inicializar o banco configurado. Verifique a configuracao e as permissoes.');
    process.exitCode = 1;
});
module.exports = { inicializar };
