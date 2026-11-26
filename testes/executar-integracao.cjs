// Prepara somente financas_teste novo; recusa reutilizar um banco preexistente.
const { spawn } = require('node:child_process');
const mysql = require('mysql2/promise');
const { configuracao } = require('../database/config');

async function executar(args, env) {
    const codigo = await new Promise((resolve, reject) => {
        const filho = spawn(process.execPath, args, { env, stdio: 'inherit' });
        filho.once('error', reject);
        filho.once('exit', resolve);
    });
    if (codigo !== 0) throw new Error('Etapa de integracao falhou.');
}

async function main() {
    const nome = 'financas_teste';
    const env = { ...process.env, DB_NAME: nome, DOTENV_OVERRIDE: 'false' };
    const admin = await mysql.createConnection(configuracao(null));
    let criado = false;
    try {
        const [existentes] = await admin.query('SHOW DATABASES LIKE ?', [nome]);
        if (existentes.length) throw new Error('financas_teste ja existe. Use instancia de testes sem esse banco; o executor nao remove bancos preexistentes.');
        await admin.query('CREATE DATABASE ?? CHARACTER SET utf8mb4', [nome]);
        criado = true;
        await executar(['database/init.js'], env);
        await executar(['--test', '--test-concurrency=1',
            'testes/fontesDestinos.rotas.test.js', 'testes/fontesDestinos.integracao.test.js',
            'testes/relatorioFontesDestinos.rotas.test.js', 'testes/relatorioFontesDestinos.integracao.test.js',
            'testes/fontesDestinos.e2e.test.js', 'testes/integracao-a.cjs', 'testes/banco-seed.cjs'], env);
    } finally {
        try {
            if (criado) {
                await admin.query('DROP DATABASE ??', [nome]);
                console.log('Banco financas_teste criado pelo executor foi removido.');
            }
        } finally { await admin.end(); }
    }
}
main().catch(erro => {
    // Nao imprime objetos de conexao, SQL com dados nem credenciais.
    console.error(erro.message.startsWith('financas_teste') ? erro.message : 'Falha na execucao da integracao. Consulte os resultados acima e a configuracao do MySQL.');
    process.exitCode = 1;
});
