const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const { configuracao } = require('../database/config');
const fs = require('node:fs');
const path = require('node:path');

test('db:init e seed SQL/JS em banco novo exclusivo, repeticao segura e falhas com exit 1', async () => {
    const nome = 'teste_financas_seed_' + Date.now() + '_' + randomBytes(4).toString('hex');
    assert.match(nome, /^teste_financas_seed_\d+_[a-f0-9]{8}$/);
    const admin = await mysql.createConnection({ ...configuracao(null), multipleStatements: true });
    let criado = false;
    function comando(arquivo, esperado, extras = {}) {
        const r = spawnSync(process.execPath, [arquivo], {
            cwd: path.resolve(__dirname, '..'), encoding: 'utf8', timeout: 30000,
            env: { ...process.env, DB_NAME: nome, ...extras }
        });
        assert.equal(r.status, esperado, `${arquivo}: ${r.stdout || ''} ${r.stderr || ''}`);
    }
    try {
        const [antes] = await admin.query('SHOW DATABASES LIKE ?', [nome]);
        assert.equal(antes.length, 0);
        // Reserva somente o nome desta execucao; init deve criar as tabelas ausentes.
        await admin.query('CREATE DATABASE ?? CHARACTER SET utf8mb4', [nome]);
        criado = true;
        // Exerce tambem o CREATE DATABASE do inicializador em banco ainda ausente.
        await admin.query('DROP DATABASE ??', [nome]);
        comando('database/init.js', 0);
        await admin.changeUser({ database: nome });
        const [[selecionado]] = await admin.query('SELECT DATABASE() AS nome');
        assert.equal(selecionado.nome, nome);
        const [tabelas] = await admin.query('SHOW TABLES');
        assert.equal(tabelas.length, 4);
        comando('database/seed.js', 0);
        const [usuarios] = await admin.query('SELECT email, senha_hash FROM usuarios ORDER BY id');
        assert.equal(usuarios.length, 2);
        for (const u of usuarios) assert.ok(await bcrypt.compare('Senha1234', u.senha_hash));
        const [[meses]] = await admin.query("SELECT COUNT(DISTINCT DATE_FORMAT(data, '%Y-%m')) AS n FROM lancamentos");
        assert.ok(meses.n >= 3);
        const [[parcelas]] = await admin.query("SELECT COUNT(*) AS n FROM lancamentos l JOIN fontes_destinos f ON f.id = l.fonte_destino_id WHERE total_parcelas > 1 AND f.tipo = 'cartao_credito'");
        assert.ok(parcelas.n > 0);
        const fotografia = async () => {
            const dados = [];
            for (const tabela of ['usuarios', 'categorias', 'fontes_destinos', 'lancamentos']) {
                const [linhas] = await admin.query('SELECT * FROM ?? ORDER BY id', [tabela]);
                dados.push(linhas);
            }
            return dados;
        };
        const dadosAntes = await fotografia();
        comando('database/init.js', 0);
        comando('database/seed.js', 1);
        assert.deepEqual(await fotografia(), dadosAntes);
        // Confirma as restricoes efetivamente instaladas.
        await assert.rejects(admin.query("INSERT INTO lancamentos (usuario_id,tipo,descricao,valor,data,categoria_id,fonte_destino_id) VALUES (1,'saida','zero',0,'2026-11-01',3,1)"), e => e.code === 'ER_CHECK_CONSTRAINT_VIOLATED');
        await assert.rejects(admin.query("UPDATE categorias SET usuario_id = 2147483647 WHERE id = 1"), e => e.code === 'ER_NO_REFERENCED_ROW_2');
        await assert.rejects(admin.query("UPDATE usuarios SET email = 'ana@email.com' WHERE id = 2"), e => e.code === 'ER_DUP_ENTRY');
        comando('database/init.js', 1, { DB_NAME: 'invalido; SQL' });
        comando('database/seed.js', 1, { DB_NAME: 'invalido; SQL' });
        // O SQL versionado tambem funciona diretamente em cliente MySQL (DELIMITER).
        // Apenas o banco criado por este teste e esvaziado para validar a segunda forma.
        for (const tabela of ['lancamentos', 'fontes_destinos', 'categorias', 'usuarios']) await admin.query('DELETE FROM ??', [tabela]);
        const sql = fs.readFileSync(path.join(__dirname, '../database/seed.sql'), 'utf8');
        const gerado = await require('../database/seed').gerarSql();
        const semHash = texto => texto.replace(/\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}/g, '<hash-bcrypt>');
        assert.equal(semHash(gerado), semHash(sql), 'seed.js e seed.sql devem descrever os mesmos dados');
        const procedimento = sql.slice(sql.indexOf('CREATE PROCEDURE'), sql.indexOf('END$$') + 3);
        await admin.query(procedimento);
        try {
            await admin.query('CALL seed_financas_demo()');
            const [direto] = await admin.query('SELECT email FROM usuarios ORDER BY id');
            assert.deepEqual(direto.map(u => u.email), usuarios.map(u => u.email));
            const copia = await fotografia();
            await assert.rejects(admin.query('CALL seed_financas_demo()'), e => e.sqlState === '45000');
            assert.deepEqual(await fotografia(), copia);
        } finally { await admin.query('DROP PROCEDURE seed_financas_demo'); }
    } finally {
        try { if (criado) await admin.query('DROP DATABASE ??', [nome]); }
        finally { await admin.end(); }
    }
});
