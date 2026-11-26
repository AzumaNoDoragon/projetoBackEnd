// Execute com npm run test:rotas:isolado. Nao reutiliza API nem banco existentes.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { once } = require('node:events');
const path = require('node:path');
const mysql = require('mysql2/promise');
const { configuracao } = require('../database/config');

async function executar(args, env) {
    const filho = spawn(process.execPath, args, { env, stdio: 'inherit' });
    const [codigo] = await once(filho, 'exit');
    assert.equal(codigo, 0, `Falha na etapa ${args.at(-1)}`);
}

async function main() {
    assert.ok(process.env.npm_execpath, 'Use npm run test:rotas:isolado.');
    const nome = 'teste_financas_smoke_' + Date.now() + '_' + randomBytes(4).toString('hex');
    assert.match(nome, /^teste_financas_smoke_\d+_[a-f0-9]{8}$/);
    const env = { ...process.env, DB_NAME: nome, PORT: '0', JWT_SECRET: randomBytes(32).toString('hex') };
    const admin = await mysql.createConnection(configuracao(null));
    let criado = false, servidor;
    try {
        const [existentes] = await admin.query('SHOW DATABASES LIKE ?', [nome]);
        assert.equal(existentes.length, 0);
        await admin.query('CREATE DATABASE ?? CHARACTER SET utf8mb4', [nome]);
        criado = true;
        await executar(['database/init.js'], env);
        await admin.changeUser({ database: nome });
        const [[selecionado]] = await admin.query('SELECT DATABASE() AS nome');
        assert.equal(selecionado.nome, nome);
        const [[vazio]] = await admin.query('SELECT COUNT(*) AS n FROM usuarios');
        assert.equal(vazio.n, 0, 'Seed somente em banco novo vazio.');
        await executar(['database/seed.js'], env);

        // O proprio processo da API confirma o banco do pool antes de abrir a porta.
        const bootstrap = `
            const http = require('node:http');
            const { pool } = require('./database/connection');
            let instancia;
            const listen = http.Server.prototype.listen;
            http.Server.prototype.listen = function (...args) {
                instancia = this;
                this.once('listening', () => process.send({ banco: process.env.DB_NAME, porta: this.address().port }));
                return listen.apply(this, args);
            };
            process.on('message', async msg => {
                if (msg !== 'encerrar') return;
                try {
                    if (instancia) {
                        await new Promise((resolve, reject) => {
                            instancia.close(e => e ? reject(e) : resolve());
                            instancia.closeAllConnections();
                        });
                    }
                    await pool.end();
                } catch { process.exitCode = 1; }
                finally { if (process.connected) process.disconnect(); }
            });
            (async () => {
                const [[atual]] = await pool.query('SELECT DATABASE() AS nome');
                if (atual.nome !== process.env.DB_NAME || !/^teste_financas_smoke_/.test(atual.nome)) throw new Error('Banco incorreto');
                require('./server');
            })().catch(async () => {
                process.exitCode = 1;
                await pool.end();
                if (process.connected) process.disconnect();
            });`;
        servidor = spawn(process.execPath, ['-e', bootstrap], {
            cwd: path.resolve(__dirname, '..'), env, stdio: ['ignore', 'inherit', 'inherit', 'ipc']
        });
        const pronto = await new Promise((resolve, reject) => {
            const timer = setTimeout(() => concluir(new Error('API nao iniciou em 10 segundos.')), 10000);
            const saiu = () => concluir(new Error('API encerrou antes de confirmar o banco.'));
            const erro = e => concluir(e);
            function concluir(e, msg) {
                clearTimeout(timer);
                servidor.off('exit', saiu);
                servidor.off('error', erro);
                servidor.off('message', mensagem);
                if (e) reject(e); else resolve(msg);
            }
            const mensagem = msg => concluir(null, msg);
            servidor.once('exit', saiu);
            servidor.once('error', erro);
            servidor.once('message', mensagem);
        });
        assert.equal(pronto.banco, nome);
        console.log('Banco confirmado pelo pool da instancia da API:', nome);
        await executar([process.env.npm_execpath, 'run', 'test:rotas'], {
            ...env, BASE_URL: `http://127.0.0.1:${pronto.porta}`
        });
    } finally {
        try {
            if (servidor && servidor.exitCode === null && servidor.signalCode === null) {
                const saiu = once(servidor, 'exit');
                const timer = setTimeout(() => servidor.kill(), 5000);
                try {
                    if (servidor.connected) servidor.send('encerrar');
                    else servidor.kill();
                    const [codigo] = await saiu;
                    assert.equal(codigo, 0, 'A instancia da API deve encerrar normalmente.');
                } finally { clearTimeout(timer); }
            }
        } finally {
            try {
                if (criado) {
                    await admin.query('DROP DATABASE ??', [nome]);
                    console.log('Banco exclusivo do smoke e processo da API encerrados.');
                }
            } finally { await admin.end(); }
        }
    }
}
main().catch(() => {
    console.error('Falha na validacao isolada do smoke; consulte a etapa acima.');
    process.exitCode = 1;
});
