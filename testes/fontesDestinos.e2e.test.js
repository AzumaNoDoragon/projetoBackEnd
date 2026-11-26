'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes, randomInt, randomUUID } = require('node:crypto');
const { once } = require('node:events');
const { Server } = require('node:http');

const BANCO_TESTE = 'financas_teste';
const FONTES = '/fontes-destinos';
const PERIODO = { inicio: '2026-11-01', fim: '2026-11-30' };
const RF8 = '/relatorios/fontes-destinos?' + new URLSearchParams(PERIODO);

function exigirBancoDeTeste() {
    assert.ok(process.env.DB_NAME === BANCO_TESTE, 'Execute com DB_NAME=financas_teste.');
}

function erroDeBanco(mensagem, erro) {
    const codigo = /^[A-Z0-9_]+$/.test(erro.code ?? '') ? ' (' + erro.code + ')' : '';
    return new Error(mensagem + codigo);
}

async function confirmarBanco(banco) {
    let linhas;
    try {
        [linhas] = await banco.query('SELECT DATABASE() AS nome');
    } catch (erro) {
        throw erroDeBanco('Falha ao confirmar a conexão com financas_teste.', erro);
    }
    assert.ok(linhas[0]?.nome === BANCO_TESTE, 'O MySQL deve selecionar financas_teste.');
}

function gerarCpf(sufixo) {
    const base = String(randomInt(10 ** 7)).padStart(7, '0') + '1' + sufixo;
    function digito(texto) {
        const soma = [...texto].reduce((total, numero, i) => total + Number(numero) * (texto.length + 1 - i), 0);
        return (soma * 10 % 11) % 10;
    }
    const parcial = base + digito(base);
    return parcial + digito(parcial);
}

async function limparUsuarios(pool, usuarios) {
    let banco;
    try {
        banco = await pool.getConnection();
    } catch (erro) {
        throw erroDeBanco('Falha ao obter a conexão para a limpeza E2E.', erro);
    }

    const falhas = [];
    try {
        await confirmarBanco(banco);
        for (const { email, cpf, nome } of usuarios) {
            try {
                const identidade = [email, cpf, nome];
                const [[usuario]] = await banco.execute(
                    'SELECT id FROM usuarios WHERE email = ? AND cpf = ? AND nome = ?', identidade
                );
                if (!usuario) continue;

                await banco.execute('DELETE FROM lancamentos WHERE usuario_id = ?', [usuario.id]);
                // As FKs removem as categorias e as fontes pertencentes ao usuário fictício.
                const [resultado] = await banco.execute(
                    'DELETE FROM usuarios WHERE id = ? AND email = ? AND cpf = ? AND nome = ?',
                    [usuario.id, ...identidade]
                );
                assert.equal(resultado.affectedRows, 1, 'O usuário fictício deve ser removido.');
            } catch (erro) {
                falhas.push(erroDeBanco('Falha ao limpar um usuário fictício.', erro));
            }
        }
    } finally {
        banco.release();
    }
    if (falhas.length) throw new AggregateError(falhas, 'A limpeza dos dados E2E ficou incompleta.');
}

function movimento({ id, nome, tipo }, total) {
    return { id, nome, tipo, total };
}

function saldoConta({ id, nome }, entradas, saidas, saldo) {
    return { id, nome, entradas, saidas, saldo };
}

test('Issues #12 e #13 com API, JWT e MySQL reais', async (t) => {
    exigirBancoDeTeste();
    const ambiente = {
        DOTENV_OVERRIDE: 'false',
        DOTENV_QUIET: 'true',
        DOTENV_DEBUG: 'false',
        JWT_SECRET: randomBytes(32).toString('hex')
    };
    const anteriores = Object.keys(ambiente).map((nome) => [nome, process.env[nome]]);
    const cadastrosTentados = [];
    let pool;
    let servidor;

    t.after(async () => {
        try {
            if (servidor?.listening) {
                await new Promise((resolve, reject) => {
                    servidor.close((erro) => erro ? reject(erro) : resolve());
                });
            }
        } finally {
            try {
                if (cadastrosTentados.length) await limparUsuarios(pool, cadastrosTentados);
            } finally {
                try {
                    await pool?.end();
                } finally {
                    for (const [nome, valor] of anteriores) {
                        if (valor === undefined) delete process.env[nome];
                        else process.env[nome] = valor;
                    }
                }
            }
        }
    });

    Object.assign(process.env, ambiente);
    ({ pool } = require('../database/connection'));
    exigirBancoDeTeste();
    await confirmarBanco(pool);

    const marca = randomUUID();
    const [a, b] = [2, 3].map((sufixo) => ({
        nome: 'E2E ' + marca + ' ' + sufixo,
        email: 'e2e.' + marca + '.' + sufixo + '@example.invalid',
        cpf: gerarCpf(sufixo),
        senha: 'A1' + randomBytes(16).toString('hex')
    }));
    let existentes;
    try {
        [existentes] = await pool.execute(
            'SELECT id FROM usuarios WHERE email IN (?, ?) OR cpf IN (?, ?)',
            [a.email, b.email, a.cpf, b.cpf]
        );
    } catch (erro) {
        throw erroDeBanco('Falha ao verificar a exclusividade dos usuários fictícios.', erro);
    }
    assert.equal(existentes.length, 0, 'Os identificadores fictícios devem estar livres.');

    const listen = Server.prototype.listen;
    Server.prototype.listen = function (_porta, callback) {
        servidor = this;
        return listen.call(this, 0, '127.0.0.1', callback);
    };
    try {
        require('../server');
    } finally {
        Server.prototype.listen = listen;
    }
    assert.ok(servidor, 'A montagem da API deve iniciar o servidor HTTP.');
    await once(servidor, 'listening');
    exigirBancoDeTeste();
    const origem = 'http://127.0.0.1:' + servidor.address().port;

    async function requisitar(metodo, rota, status, { token, dados } = {}) {
        const headers = {};
        if (token) headers.authorization = 'Bearer ' + token;
        if (dados !== undefined) headers['content-type'] = 'application/json';
        const resposta = await fetch(origem + rota, {
            method: metodo, headers, body: JSON.stringify(dados), redirect: 'error'
        });
        const texto = await resposta.text();
        assert.equal(resposta.status, status, metodo + ' ' + rota);
        if (texto === '') return undefined;
        try {
            return JSON.parse(texto);
        } catch {
            throw new Error(metodo + ' ' + rota + ' retornou JSON inválido.');
        }
    }

    async function cadastrarEAutenticar(dados) {
        // Registra a tentativa antes do POST para cobrir falhas após a gravação.
        const { email, senha, nome, cpf } = dados;
        cadastrosTentados.push({ email, nome, cpf });
        const cadastrado = await requisitar('POST', '/auth/cadastro', 201, { dados });
        assert.ok(Number.isInteger(cadastrado.id) && cadastrado.id > 0, 'O cadastro deve devolver um ID.');
        const login = await requisitar('POST', '/auth/login', 200, { dados: { email, senha } });
        assert.ok(login.usuario?.id === cadastrado.id, 'O login deve pertencer ao usuário cadastrado.');
        assert.ok(typeof login.token === 'string' && login.token.length > 0, 'O login deve devolver um JWT.');
        return { id: cadastrado.id, token: login.token };
    }

    async function criarFonte(token, dados) {
        const resposta = await requisitar('POST', FONTES, 201, { token, dados });
        return resposta.dados;
    }

    const usuarioA = await cadastrarEAutenticar(a);
    const usuarioB = await cadastrarEAutenticar(b);
    assert.notEqual(usuarioA.id, usuarioB.id);
    const { dados: listaA } = await requisitar('GET', FONTES, 200, { token: usuarioA.token });
    const { dados: listaB } = await requisitar('GET', FONTES, 200, { token: usuarioB.token });
    const [padraoA] = listaA;
    const [padraoB] = listaB;

    await t.test('cadastro e login dão acesso à conta corrente padrão de cada usuário', () => {
        for (const [lista, usuario] of [[listaA, usuarioA], [listaB, usuarioB]]) {
            assert.equal(lista.length, 1);
            const [{ nome, tipo, usuario_id }] = lista;
            assert.deepEqual({ nome, tipo, usuario_id },
                { nome: 'Conta corrente', tipo: 'conta', usuario_id: usuario.id });
        }
    });

    await t.test('CRUD e RF8 exigem um JWT válido', async () => {
        const esperado = { erro: 'Token ausente, inválido ou expirado.' };
        for (const rota of [FONTES, RF8]) {
            assert.deepEqual(await requisitar('GET', rota, 401), esperado);
            assert.deepEqual(await requisitar('GET', rota, 401, { token: 'jwt-invalido' }), esperado);
        }
    });

    const { token } = usuarioA;
    const renda = await criarFonte(token, { nome: '01 Renda E2E', tipo: 'renda' });
    const conta = await criarFonte(token, { nome: '02 Conta E2E', tipo: 'conta' });
    const cartao = await criarFonte(token, {
        nome: '03 Cartão E2E', tipo: 'cartao_credito', dia_fechamento: 5, dia_vencimento: 12, limite: '1250.50'
    });

    await t.test('cria, lista, consulta, atualiza e exclui fontes com isolamento entre usuários', async () => {
        for (const [fonte, tipo] of [[renda, 'renda'], [conta, 'conta'], [cartao, 'cartao_credito']]) {
            assert.equal(fonte.tipo, tipo);
            assert.equal(fonte.usuario_id, usuarioA.id);
        }
        assert.equal(cartao.limite, '1250.50');
        assert.equal(cartao.dia_fechamento, 5);
        assert.equal(cartao.dia_vencimento, 12);
        const listagem = await requisitar('GET', FONTES, 200, { token });
        assert.deepEqual(listagem.dados, [renda, conta, cartao, padraoA]);

        const rotaCartao = FONTES + '/' + cartao.id;
        const alteracoes = { limite: '1500.00' };
        assert.deepEqual(await requisitar('GET', rotaCartao, 200, { token }), { dados: cartao });
        for (const metodo of ['GET', 'PUT', 'DELETE']) {
            await requisitar(metodo, rotaCartao, 404, {
                token: usuarioB.token, dados: metodo === 'PUT' ? alteracoes : undefined
            });
        }
        const esperado = { dados: { ...cartao, ...alteracoes } };
        assert.deepEqual(await requisitar('PUT', rotaCartao, 200, { token, dados: alteracoes }), esperado);
        assert.deepEqual(await requisitar('GET', rotaCartao, 200, { token }), esperado);
        assert.deepEqual(await requisitar('GET', FONTES, 200, { token: usuarioB.token }), { dados: [padraoB] });

        const temporaria = await criarFonte(token, { nome: '04 Conta removível E2E', tipo: 'conta' });
        const rotaTemporaria = FONTES + '/' + temporaria.id;
        assert.equal(await requisitar('DELETE', rotaTemporaria, 204, { token }), undefined);
        await requisitar('GET', rotaTemporaria, 404, { token });
    });

    async function lancarMovimentos(usuario, movimentos) {
        const { token } = usuario;
        const categorias = await requisitar('GET', '/categorias', 200, { token });
        for (const [tipo, fonte, valor, data] of movimentos) {
            const categoria = categorias.find((item) => item.tipo === tipo);
            assert.ok(categoria, 'O cadastro deve ter criado uma categoria de ' + tipo + '.');
            await requisitar('POST', '/lancamentos', 201, {
                token,
                dados: {
                    descricao: 'Movimento E2E ' + marca, tipo, valor, data,
                    categoriaId: categoria.id, fonteDestinoId: fonte.id
                }
            });
        }
    }

    await t.test('RF8 consolida os lançamentos da API e separa os resultados dos dois usuários', async () => {
        await lancarMovimentos(usuarioA, [
            ['entrada', renda, 120.3, PERIODO.inicio],
            ['entrada', renda, 79.7, PERIODO.fim],
            ['entrada', conta, 50.25, PERIODO.inicio],
            ['saida', conta, 80.5, PERIODO.fim],
            ['saida', cartao, 19.75, PERIODO.fim],
            ['entrada', conta, 999, '2026-12-01']
        ]);
        await lancarMovimentos(usuarioB, [
            ['entrada', padraoB, 410, PERIODO.inicio],
            ['saida', padraoB, 52.25, PERIODO.fim]
        ]);

        assert.deepEqual(await requisitar('GET', RF8 + '&usuario_id=' + usuarioB.id, 200, { token }), {
            periodo: PERIODO,
            entradas: [movimento(renda, 200), movimento(conta, 50.25)],
            saidas: [movimento(conta, 80.5), movimento(cartao, 19.75)],
            contas: [saldoConta(conta, 50.25, 80.5, -30.25), saldoConta(padraoA, 0, 0, 0)]
        });
        assert.deepEqual(await requisitar('GET', RF8, 200, { token: usuarioB.token }), {
            periodo: PERIODO,
            entradas: [movimento(padraoB, 410)],
            saidas: [movimento(padraoB, 52.25)],
            contas: [saldoConta(padraoB, 410, 52.25, 357.75)]
        });
    });
});
