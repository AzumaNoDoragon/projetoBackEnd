// Executar na raiz do projeto: node testes/integracao-a.cjs
// Cria um banco EXCLUSIVO para a execucao e o remove no finally.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { randomBytes } = require('node:crypto');

const raiz = process.env.API_PROJECT_ROOT || path.resolve(__dirname, '..');
const carregar = createRequire(path.join(raiz, 'package.json'));
carregar('dotenv').config({ path: path.join(raiz, '.env'), quiet: true });
const mysql = carregar('mysql2/promise');
const bcrypt = carregar('bcrypt');
const jwt = carregar('jsonwebtoken');
const nomeBanco = 'teste_financas_a_' + Date.now() + '_' + randomBytes(4).toString('hex');
const senha = 'TesteIntegracao123';

test('Integracao do integrante A e fluxos compartilhados', { timeout: 90000 }, async t => {
    let admin, pool, servidor;
    let bancoCriado = false;
    let base;
    const resultados = [];
    const registrar = async (nome, funcao) => t.test(nome, async () => {
        try {
            await funcao();
            resultados.push({ nome, passou: true });
        } catch (erro) {
            resultados.push({ nome, passou: false, erro: erro.message });
            throw erro;
        }
    });
    async function requisicao(metodo, rota, token, corpo, esperado = 200) {
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers.Authorization = 'Bearer ' + token;
        const resposta = await fetch(base + rota, {
            method: metodo, headers,
            body: corpo === undefined ? undefined : JSON.stringify(corpo),
            signal: AbortSignal.timeout(10000)
        });
        const texto = await resposta.text();
        assert.equal(resposta.status, esperado, `${metodo} ${rota}: ${texto}`);
        const dados = texto ? JSON.parse(texto) : null;
        assert(!/"senha_hash"\s*:/.test(texto), 'Resposta nao deve expor hash');
        if (resposta.status < 400) assert(!/"senha"\s*:/.test(texto), 'Resposta nao deve expor senha');
        return dados;
    }
    try {
        assert(process.env.JWT_SECRET, 'Configure JWT_SECRET no .env');
        admin = await mysql.createConnection({
            host: process.env.DB_HOST, port: process.env.DB_PORT || 3306,
            user: process.env.DB_USER, password: process.env.DB_PASSWORD,
            multipleStatements: true
        });
        assert(/^teste_financas_a_\d+_[a-f0-9]{8}$/.test(nomeBanco));
        await admin.query('CREATE DATABASE `' + nomeBanco + '` CHARACTER SET utf8mb4');
        bancoCriado = true;
        await admin.changeUser({ database: nomeBanco });
        const schema = fs.readFileSync(path.join(raiz, 'database/schema.sql'), 'utf8')
            .replace(/^\s*CREATE DATABASE[^;]*;/im, '')
            .replace(/^\s*USE\s+[^;]*;/im, '');
        assert(!/\b(?:CREATE\s+DATABASE|USE\s+`?financas)\b/i.test(schema));
        await admin.query(schema);
        process.env.DB_NAME = nomeBanco;
        // O dotenv do projeto nao sobrescreve variaveis ja definidas.
        ({ pool } = carregar('./database/connection'));
        const filho = `const http = require('node:http');
const original = http.Server.prototype.listen;
http.Server.prototype.listen = function(...args) {
 this.once('listening', () => process.send({ porta: this.address().port }));
 return original.apply(this, args);
};
require(${JSON.stringify(path.join(raiz, 'server.js'))});`;
        servidor = spawn(process.execPath, ['-e', filho], {
            cwd: raiz, env: { ...process.env, PORT: '0' },
            stdio: ['ignore', 'ignore', 'pipe', 'ipc']
        });
        let errosServidor = '';
        servidor.stderr.on('data', d => { errosServidor += d.toString(); });
        const porta = await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Servidor nao iniciou: ' + errosServidor)), 10000);
            servidor.once('message', msg => { clearTimeout(timer); resolve(msg.porta); });
            servidor.once('exit', codigo => { clearTimeout(timer); reject(new Error('Servidor encerrou: ' + codigo + ': ' + errosServidor)); });
        });
        base = 'http://127.0.0.1:' + porta;
        let ana, bruno, tokenA, tokenB, catsA, catsB, fonteA, fonteB, lancamento;
        const cadastroA = { nome: '  Ana Integracao  ', email: '  ANA.INTEGRACAO@example.com  ', cpf: '529.982.247-25', senha };
        const cadastroB = { nome: 'Bruno Integracao', email: 'bruno.integracao@example.com', cpf: '16899535009', senha };

        await registrar('Cadastro normaliza dados, aplica bcrypt e cria os registros padrao', async () => {
            ana = await requisicao('POST', '/auth/cadastro', null, cadastroA, 201);
            bruno = await requisicao('POST', '/auth/cadastro', null, cadastroB, 201);
            assert.equal(ana.nome, 'Ana Integracao');
            assert.equal(ana.email, 'ana.integracao@example.com');
            const [[usuario]] = await pool.query('SELECT * FROM usuarios WHERE id = ?', [ana.id]);
            assert.equal(usuario.cpf, '52998224725');
            assert.notEqual(usuario.senha_hash, senha);
            assert(await bcrypt.compare(senha, usuario.senha_hash));
            const [[contagens]] = await pool.query('SELECT COUNT(*) AS total FROM categorias WHERE usuario_id = ?', [ana.id]);
            assert.equal(Number(contagens.total), 9);
            const [[fonte]] = await pool.query('SELECT id, tipo FROM fontes_destinos WHERE usuario_id = ?', [ana.id]);
            fonteA = fonte.id;
            assert.equal(fonte.tipo, 'conta');
            const [[outraFonte]] = await pool.query('SELECT id FROM fontes_destinos WHERE usuario_id = ?', [bruno.id]);
            fonteB = outraFonte.id;
        });
        await registrar('Cadastro rejeita campos invalidos e CPF com digito incorreto', async () => {
            const erro = await requisicao('POST', '/auth/cadastro', null, { nome: '', email: 'invalido', cpf: '11111111111', senha: 'abc' }, 400);
            assert.deepEqual(Object.keys(erro.campos).sort(), ['cpf', 'email', 'nome', 'senha']);
            await requisicao('POST', '/auth/cadastro', null, { ...cadastroA, cpf: '52998224724' }, 400);
        });
        await registrar('E-mail e CPF duplicados retornam 409 indicando o campo', async () => {
            const email = await requisicao('POST', '/auth/cadastro', null, { ...cadastroA, cpf: '11144477735' }, 409);
            assert(email.campos.email);
            const cpf = await requisicao('POST', '/auth/cadastro', null, { ...cadastroA, email: 'outra@example.com' }, 409);
            assert(cpf.campos.cpf);
            const [[total]] = await pool.query('SELECT COUNT(*) AS total FROM usuarios');
            assert.equal(Number(total.total), 2);
        });
        await registrar('Login valida credenciais, emite JWT com expiracao e permite consultar /me', async () => {
            tokenA = (await requisicao('POST', '/auth/login', null, { email: cadastroA.email, senha })).token;
            tokenB = (await requisicao('POST', '/auth/login', null, { email: cadastroB.email, senha })).token;
            const payload = jwt.verify(tokenA, process.env.JWT_SECRET, { algorithms: ['HS256'] });
            assert.equal(payload.id, ana.id);
            assert(payload.exp > payload.iat);
            assert.equal((await requisicao('GET', '/auth/me', tokenA)).id, ana.id);
            await requisicao('POST', '/auth/login', null, { email: cadastroA.email, senha: 'errada' }, 401);
            await requisicao('POST', '/auth/login', null, { email: 'ausente@example.com', senha }, 401);
            await requisicao('POST', '/auth/login', null, {}, 400);
        });
        await registrar('Rotas protegidas rejeitam token ausente, adulterado e expirado', async () => {
            for (const rota of ['/auth/me', '/categorias', '/lancamentos', '/relatorios/categorias', '/relatorios/faturas']) {
                await requisicao('GET', rota, null, undefined, 401);
            }
            await requisicao('GET', '/auth/me', 'token.invalido.assinatura', undefined, 401);
            const expirado = jwt.sign({ id: ana.id }, process.env.JWT_SECRET, { expiresIn: -1 });
            await requisicao('GET', '/auth/me', expirado, undefined, 401);
        });
        await registrar('Categorias permitem CRUD, filtro e repeticao do nome em tipos diferentes', async () => {
            catsA = await requisicao('GET', '/categorias', tokenA);
            catsB = await requisicao('GET', '/categorias', tokenB);
            assert.equal(catsA.length, 9);
            const categoria = await requisicao('POST', '/categorias', tokenA, { nome: '  Temporaria  ', tipo: 'saida', usuario_id: bruno.id }, 201);
            assert.equal(categoria.nome, 'Temporaria');
            assert((await requisicao('GET', '/categorias', tokenA)).some(c => c.id === categoria.id));
            assert(!(await requisicao('GET', '/categorias', tokenB)).some(c => c.id === categoria.id));
            await requisicao('POST', '/categorias', tokenA, { nome: 'Temporaria', tipo: 'saida' }, 409);
            const outra = await requisicao('POST', '/categorias', tokenA, { nome: 'Temporaria', tipo: 'entrada' }, 201);
            await requisicao('PUT', '/categorias/' + categoria.id, tokenA, { nome: 'Editada', tipo: 'saida' });
            // Atualizar com os mesmos valores continua sendo sucesso.
            await requisicao('PUT', '/categorias/' + categoria.id, tokenA, { nome: 'Editada', tipo: 'saida' });
            assert((await requisicao('GET', '/categorias?tipo=saida', tokenA)).every(c => c.tipo === 'saida'));
            for (const id of [categoria.id, outra.id]) await requisicao('DELETE', '/categorias/' + id, tokenA, undefined, 204);
            await requisicao('DELETE', '/categorias/' + categoria.id, tokenA, undefined, 404);
        });
        await registrar('Categorias rejeitam IDs e dados invalidos e isolam edicao/exclusao', async () => {
            await requisicao('POST', '/categorias', tokenA, { nome: 'Teste', tipo: 'poupanca' }, 400);
            await requisicao('POST', '/categorias', tokenA, { nome: 'a'.repeat(61), tipo: 'saida' }, 400);
            await requisicao('GET', '/categorias?tipo=invalido', tokenA, undefined, 400);
            await requisicao('PUT', '/categorias/abc', tokenA, { nome: 'Teste', tipo: 'saida' }, 400);
            await requisicao('PUT', '/categorias/' + catsB[0].id, tokenA, { nome: 'Invasao', tipo: catsB[0].tipo }, 404);
            await requisicao('DELETE', '/categorias/' + catsB[0].id, tokenA, undefined, 404);
            assert.deepEqual(await requisicao('GET', '/categorias', tokenB), catsB);
        });
        const categoriaA = tipo => catsA.find(c => c.tipo === tipo).id;
        const novoLancamento = (tipo, valor, data, categoriaId = categoriaA(tipo), fonteDestinoId = fonteA) => ({ tipo, valor, data, categoriaId, fonteDestinoId, descricao: 'Teste de integracao' });
        await registrar('Lancamentos usam usuario do token e validam propriedade e tipo dos vinculos', async () => {
            lancamento = await requisicao('POST', '/lancamentos', tokenA, { ...novoLancamento('saida', 200, '2026-11-15'), usuario_id: bruno.id }, 201);
            await requisicao('GET', '/lancamentos/' + lancamento.id, tokenA);
            await requisicao('GET', '/lancamentos/' + lancamento.id, tokenB, undefined, 404);
            await requisicao('PUT', '/lancamentos/' + lancamento.id, tokenB, novoLancamento('saida', 50, '2026-11-15', catsB.find(c => c.tipo === 'saida').id, fonteB), 404);
            await requisicao('DELETE', '/lancamentos/' + lancamento.id, tokenB, undefined, 404);
            await requisicao('POST', '/lancamentos', tokenA, novoLancamento('saida', 10, '2026-11-15', catsB.find(c => c.tipo === 'saida').id), 404);
            await requisicao('POST', '/lancamentos', tokenA, novoLancamento('saida', 10, '2026-11-15', categoriaA('saida'), fonteB), 404);
            await requisicao('POST', '/lancamentos', tokenA, novoLancamento('saida', 10, '2026-11-15', categoriaA('entrada')), 400);
        });
        await registrar('Categoria com lancamento vinculado nao pode ser excluida', async () => {
            const erro = await requisicao('DELETE', '/categorias/' + categoriaA('saida'), tokenA, undefined, 409);
            assert(/lançamentos vinculados/.test(erro.erro));
        });
        await registrar('Relatorio agrega categorias, ordena totais, calcula percentuais e variacoes', async () => {
            const segundaSaida = catsA.filter(c => c.tipo === 'saida')[1].id;
            const terceiraSaida = catsA.filter(c => c.tipo === 'saida')[2].id;
            for (const dados of [
                novoLancamento('saida', 100, '2026-10-15'),
                novoLancamento('saida', 50, '2026-11-01', segundaSaida),
                novoLancamento('saida', 50, '2026-11-30', segundaSaida),
                novoLancamento('saida', 25, '2026-10-15', terceiraSaida),
                novoLancamento('entrada', 800, '2026-10-15'),
                novoLancamento('entrada', 1000, '2026-11-15'),
                novoLancamento('saida', 999, '2026-10-01')
            ]) await requisicao('POST', '/lancamentos', tokenA, dados, 201);
            await requisicao('POST', '/lancamentos', tokenB, novoLancamento('saida', 9999, '2026-11-15', catsB.find(c => c.tipo === 'saida').id, fonteB), 201);
            const rel = await requisicao('GET', '/relatorios/categorias?inicio=2026-11-01&fim=2026-11-30', tokenA);
            assert.deepEqual(rel.periodoAnterior, { inicio: '2026-10-02', fim: '2026-10-31' });
            assert.equal(rel.saidas.total, 300);
            assert.equal(rel.entradas.total, 1000);
            assert.deepEqual(rel.saidas.categorias.map(c => c.total), [200, 100, 0]);
            const [principal, nova, anterior] = rel.saidas.categorias;
            assert.equal(principal.percentual, 66.67);
            assert.equal(principal.anterior, 100);
            assert.equal(principal.variacao, 100);
            assert.equal(nova.percentual, 33.33);
            assert.equal(nova.variacao, null);
            assert.equal(anterior.variacao, -100);
            assert.equal(rel.entradas.categorias[0].variacao, 25);
            const vazio = await requisicao('GET', '/relatorios/categorias?inicio=2025-01-01&fim=2025-01-31', tokenA);
            assert.deepEqual(vazio.saidas, { total: 0, categorias: [] });
            assert.deepEqual(vazio.entradas, { total: 0, categorias: [] });
        });
        await registrar('Relatorio rejeita datas ausentes, impossiveis e periodo invertido', async () => {
            for (const consulta of ['', '?inicio=2026-02-30&fim=2026-03-10', '?inicio=2026-11-30&fim=2026-11-01', '?inicio=2026-11-01&inicio=2026-11-02&fim=2026-11-30', '?inicio=1000-01-01&fim=1000-01-02']) {
                await requisicao('GET', '/relatorios/categorias' + consulta, tokenA, undefined, 400);
            }
            await requisicao('GET', '/relatorios/categorias?inicio=2024-02-29&fim=2024-02-29', tokenA);
        });
        await registrar('Listagem, atualizacao e exclusao de lancamentos usam o model atualizado', async () => {
            const lista = await requisicao('GET', '/lancamentos?inicio=2026-11-01&fim=2026-11-30', tokenA);
            assert.equal(lista.resumo.entradas, 1000);
            assert.equal(lista.resumo.saidas, 300);
            assert.equal(lista.resumo.saldo, 700);
            const temporario = await requisicao('POST', '/lancamentos', tokenA, novoLancamento('saida', 5, '2026-12-01'), 201);
            await requisicao('PUT', '/lancamentos/' + temporario.id, tokenA, novoLancamento('saida', 7, '2026-12-02'));
            assert.equal((await requisicao('GET', '/lancamentos/' + temporario.id, tokenA)).valor, 7);
            const removido = await requisicao('DELETE', '/lancamentos/' + temporario.id, tokenA);
            assert.equal(removido.excluidos, 1);
            await requisicao('GET', '/lancamentos/' + temporario.id, tokenA, undefined, 404);
        });
        await registrar('Relatorio de faturas continua acessivel apos integrar categorias', async () => {
            const resultado = await requisicao('GET', '/relatorios/faturas?meses=3', tokenA);
            assert.deepEqual(resultado.cartoes, []);
            await requisicao('GET', '/relatorios/faturas?meses=13', tokenA, undefined, 400);
        });
        await registrar('Cadastro faz rollback real quando uma insercao de categoria falha', async () => {
            const Usuario = carregar('./models/Usuario');
            const getConnection = pool.getConnection;
            let conexao;
            let liberou = false;
            pool.getConnection = async () => {
                conexao = await getConnection.call(pool);
                const executar = conexao.execute.bind(conexao);
                const liberar = conexao.release.bind(conexao);
                let categorias = 0;
                conexao.execute = async (sql, params) => {
                    if (sql.includes('INSERT INTO categorias') && ++categorias === 2) throw new Error('FALHA_CONTROLADA_TESTE');
                    return executar(sql, params);
                };
                conexao.release = () => { liberou = true; liberar(); };
                return conexao;
            };
            try {
                await assert.rejects(Usuario.cadastrar({ nome: 'Rollback', email: 'rollback@example.com', cpf: '11144477735', senhaHash: await bcrypt.hash(senha, 10) }), /FALHA_CONTROLADA_TESTE/);
            } finally { pool.getConnection = getConnection; }
            assert(liberou, 'Conexao deve voltar ao pool');
            const [[usuario]] = await pool.query('SELECT COUNT(*) AS total FROM usuarios WHERE email = ?', ['rollback@example.com']);
            assert.equal(Number(usuario.total), 0);
            const [[orfas]] = await pool.query('SELECT COUNT(*) AS total FROM categorias c LEFT JOIN usuarios u ON u.id = c.usuario_id WHERE u.id IS NULL');
            assert.equal(Number(orfas.total), 0);
        });
        await registrar('JSON invalido recebe 400 e rota inexistente recebe 404', async () => {
            const resposta = await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{', signal: AbortSignal.timeout(10000) });
            assert.equal(resposta.status, 400);
            assert.equal(typeof (await resposta.json()).erro, 'string');
            await requisicao('GET', '/rota-inexistente', null, undefined, 404);
        });
    } finally {
        if (servidor && servidor.exitCode === null) {
            const saiu = once(servidor, 'exit');
            servidor.kill();
            await saiu;
        }
        if (pool) await pool.end();
        if (admin) {
            try {
                if (bancoCriado) await admin.query('DROP DATABASE `' + nomeBanco + '`');
            } finally { await admin.end(); }
        }
        const relatorio = [
            '# Testes do integrante A', '',
            'Execucao: ' + new Date().toISOString(), '',
            'Banco temporario exclusivo; servidor iniciado em porta livre; banco removido ao finalizar.', '',
            '| Caso | Resultado |', '| --- | --- |',
            ...resultados.map(r => '| ' + r.nome + ' | ' + (r.passou ? 'PASSOU' : 'FALHOU: ' + r.erro.replace(/\|/g, '/').replace(/\n/g, ' ')) + ' |'), '',
            'Limites: nao valida o CRUD de fontes/destinos, seu relatorio ou todos os calculos de faturas. Estes pertencem aos outros integrantes.', ''
        ].join('\n');
        fs.writeFileSync(path.join(__dirname, 'RESULTADO_INTEGRACAO_A.md'), relatorio);
    }
});
