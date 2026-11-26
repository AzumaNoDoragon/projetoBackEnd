'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { readFileSync } = require('node:fs');
const { createServer } = require('node:http');
const { join } = require('node:path');
const { compileFunction } = require('node:vm');
const express = require('express');
const ErroHttp = require('../utils/erros');
const datas = require('../utils/datas');

const ROTA = '/relatorios/fontes-destinos';
const USUARIO = 7;
const INICIO = '2026-11-01';
const FIM = '2026-11-30';
const PERIODO = { inicio: INICIO, fim: FIM };
const CONSULTA = ROTA + '?' + new URLSearchParams(PERIODO);
const RELATORIO = {
    periodo: PERIODO,
    entradas: [{ id: 12, nome: 'Conta', tipo: 'conta', total: 120.3 }],
    saidas: [{ id: 12, nome: 'Conta', tipo: 'conta', total: 140.1 }],
    contas: [{ id: 12, nome: 'Conta', entradas: 120.3, saidas: 140.1, saldo: -19.8 }]
};
const FATURAS = { dataReferencia: INICIO, cartoes: [] };
const IDENTIDADE_INVALIDA = {
    status: 401,
    corpo: { erro: 'Autenticação necessária ou identidade inválida.' }
};
const PERIODO_INVALIDO = {
    status: 400,
    corpo: {
        erro: 'Dados inválidos.',
        campos: {
            periodo: 'Informe inicio e fim uma única vez no formato AAAA-MM-DD, entre 1000-01-01 e 9999-12-31, com inicio <= fim.'
        }
    }
};
const RF8_BLOQUEADO = {
    status: 401,
    corpo: { erro: 'Autenticação JWT indisponível para o relatório de fontes e destinos.' }
};

function carregarIsolado(arquivo, dependencias, consoleTeste = console) {
    const caminho = join(__dirname, '..', arquivo);
    const executar = compileFunction(readFileSync(caminho, 'utf8'), ['require', 'module', 'console'], { filename: caminho });
    const modulo = { exports: {} };
    executar((nome) => {
        assert.ok(Object.hasOwn(dependencias, nome), 'Dependência indisponível no teste: ' + nome);
        return dependencias[nome];
    }, modulo, consoleTeste);
    return modulo.exports;
}

function montarServidorPrincipal(t, router) {
    const app = express();
    let tratarErros;
    const registrarErro = t.mock.fn();
    const autenticacaoTemporaria = t.mock.fn((req, _res, next) => {
        req.auth = { id: 2 };
        next();
    });

    // Executa os registros reais de server.js com dependências isoladas e intercepta listen.
    function criarExpress() {
        return {
            use(...args) {
                if (args.length === 1 && typeof args[0] === 'function' && args[0].length === 4) {
                    tratarErros = args[0];
                }
                app.use(...args);
            },
            listen() {}
        };
    }
    criarExpress.json = express.json;

    carregarIsolado('server.js', {
        express: criarExpress,
        dotenv: { config() {} },
        './utils/erros': ErroHttp,
        './middleware/authMock': autenticacaoTemporaria,
        './routes/auth': express.Router(),
        './routes/lancamentos': express.Router(),
        './routes/relatorios': router,
        './routes/fontesDestinos': express.Router()
    }, { error: registrarErro });

    assert.equal(typeof tratarErros, 'function', 'Middleware global de erros não encontrado.');
    return { app, tratarErros, autenticacaoTemporaria, registrarErro };
}

function montarRouterIsolado(router, tratarErros) {
    const app = express();
    app.use('/relatorios', (req, _res, next) => {
        // JSON preserva o tipo de req.auth.id enviado pelo teste.
        const auth = req.get('x-auth-teste');
        if (auth !== undefined) req.auth = JSON.parse(auth);
        next();
    }, router);
    app.use(tratarErros);
    return app;
}

async function iniciarHttp(t, app) {
    const servidor = createServer(app);
    t.after(async () => {
        if (!servidor.listening) return;
        await new Promise((resolve, reject) => {
            servidor.close((erro) => erro ? reject(erro) : resolve());
            servidor.closeAllConnections();
        });
    });

    const escutando = once(servidor, 'listening');
    servidor.listen(0, '127.0.0.1');
    await escutando;
    const origem = 'http://127.0.0.1:' + servidor.address().port;

    return async (caminho = CONSULTA, { auth = { id: USUARIO }, metodo = 'GET' } = {}) => {
        const headers = auth === null ? {} : { 'x-auth-teste': JSON.stringify(auth) };
        const resposta = await fetch(origem + caminho, {
            method: metodo,
            headers,
            redirect: 'error',
            signal: AbortSignal.timeout(5000)
        });
        const texto = await resposta.text();
        return { status: resposta.status, corpo: texto === '' ? undefined : JSON.parse(texto) };
    };
}

async function preparar(t, { servidorPrincipal = false } = {}) {
    const model = {
        fontesDestinos: t.mock.fn(async () => RELATORIO),
        faturas: t.mock.fn(async () => FATURAS)
    };
    const router = carregarIsolado('routes/relatorios.js', {
        express,
        '../models/Relatorio': model,
        '../utils/erros': ErroHttp,
        '../utils/datas': datas
    });
    const { app, tratarErros, autenticacaoTemporaria, registrarErro } = montarServidorPrincipal(t, router);
    const requisitar = await iniciarHttp(t, servidorPrincipal ? app : montarRouterIsolado(router, tratarErros));
    return { requisitar, model, autenticacaoTemporaria, registrarErro };
}

function urlPeriodo(inicio, fim) {
    return ROTA + '?' + new URLSearchParams({ inicio, fim });
}

function argumentos(funcao) {
    return funcao.mock.calls.map((chamada) => chamada.arguments);
}

async function conferirPeriodosInvalidos({ requisitar, model }, caminhos) {
    for (const caminho of caminhos) {
        assert.deepEqual(await requisitar(caminho), PERIODO_INVALIDO);
    }
    assert.equal(model.fontesDestinos.mock.callCount(), 0);
}

test('rejeita requisição sem identidade autenticada com 401', async (t) => {
    const { requisitar, model } = await preparar(t);
    assert.deepEqual(await requisitar(CONSULTA + '&usuario_id=7', { auth: null }), IDENTIDADE_INVALIDA);
    assert.equal(model.fontesDestinos.mock.callCount(), 0);
});

test('rejeita identidade inválida com 401', async (t) => {
    const { requisitar, model } = await preparar(t);
    for (const auth of [{}, ...[null, 0, -1, 1.5, 2147483648, true, [7], 'abc', '1e2'].map((id) => ({ id }))]) {
        assert.deepEqual(await requisitar(CONSULTA, { auth }), IDENTIDADE_INVALIDA);
    }
    assert.equal(model.fontesDestinos.mock.callCount(), 0);
});

test('aceita identidade numérica nos limites positivos do INT', async (t) => {
    const { requisitar, model } = await preparar(t);
    assert.equal((await requisitar(CONSULTA, { auth: { id: 1 } })).status, 200);
    assert.equal((await requisitar(CONSULTA, { auth: { id: 2147483647 } })).status, 200);
    assert.deepEqual(argumentos(model.fontesDestinos), [[1, INICIO, FIM], [2147483647, INICIO, FIM]]);
});

test('normaliza uma identidade textual para número', async (t) => {
    const { requisitar, model } = await preparar(t);
    assert.equal((await requisitar(CONSULTA, { auth: { id: '007' } })).status, 200);
    assert.deepEqual(argumentos(model.fontesDestinos), [[USUARIO, INICIO, FIM]]);
});

test('ignora usuario_id enviado na query pelo cliente', async (t) => {
    const { requisitar, model } = await preparar(t);
    assert.equal((await requisitar(CONSULTA + '&usuario_id=91')).status, 200);
    assert.deepEqual(argumentos(model.fontesDestinos), [[USUARIO, INICIO, FIM]]);
});

test('encaminha ao model apenas o ID de cada identidade autenticada e o período', async (t) => {
    const { requisitar, model } = await preparar(t);
    const caminho = CONSULTA + '&id=91&usuario_id=92';
    assert.equal((await requisitar(caminho, { auth: { id: 31, usuario_id: 81 } })).status, 200);
    assert.equal((await requisitar(caminho, { auth: { id: 32, usuario_id: 82 } })).status, 200);
    assert.deepEqual(argumentos(model.fontesDestinos), [[31, INICIO, FIM], [32, INICIO, FIM]]);
});

for (const [titulo, caminho] of [
    ['rejeita ausência de inicio', ROTA + '?fim=' + FIM],
    ['rejeita ausência de fim', ROTA + '?inicio=' + INICIO],
    ['rejeita ausência das duas datas', ROTA]
]) {
    test(titulo, async (t) => {
        await conferirPeriodosInvalidos(await preparar(t), [caminho]);
    });
}

test('rejeita formatos diferentes de AAAA-MM-DD', async (t) => {
    await conferirPeriodosInvalidos(await preparar(t), [
        urlPeriodo('2026-11-1', FIM),
        urlPeriodo('01/11/2026', FIM),
        urlPeriodo(INICIO, '2026-11-30T00:00:00Z'),
        urlPeriodo(' ' + INICIO, FIM),
        urlPeriodo(INICIO, '')
    ]);
});

test('rejeita datas inexistentes', async (t) => {
    await conferirPeriodosInvalidos(await preparar(t), [
        urlPeriodo('2026-02-30', FIM),
        urlPeriodo('2026-02-29', FIM),
        urlPeriodo(INICIO, '2026-11-31')
    ]);
});

test('rejeita inicio posterior a fim', async (t) => {
    await conferirPeriodosInvalidos(await preparar(t), [urlPeriodo(FIM, INICIO)]);
});

test('aceita inicio igual a fim', async (t) => {
    const { requisitar, model } = await preparar(t);
    assert.equal((await requisitar(urlPeriodo(INICIO, INICIO))).status, 200);
    assert.deepEqual(argumentos(model.fontesDestinos), [[USUARIO, INICIO, INICIO]]);
});

test('rejeita parâmetros repetidos, inclusive após o limite padrão do parser do Express', async (t) => {
    await conferirPeriodosInvalidos(await preparar(t), [
        CONSULTA + '&inicio=' + INICIO,
        CONSULTA + '&f%69m=' + FIM,
        CONSULTA + '&x=1'.repeat(1000) + '&inicio=' + INICIO
    ]);
});

test('rejeita parâmetros em formato de array', async (t) => {
    await conferirPeriodosInvalidos(await preparar(t), [
        ROTA + '?' + new URLSearchParams({ 'inicio[]': INICIO, fim: FIM }),
        ROTA + '?' + new URLSearchParams({ inicio: INICIO, 'fim[0]': FIM }),
        CONSULTA + '&' + new URLSearchParams({ 'fim[]': FIM })
    ]);
});

test('rejeita datas fora da faixa do MySQL DATE e aceita seus limites', async (t) => {
    const ambiente = await preparar(t);
    await conferirPeriodosInvalidos(ambiente, [
        urlPeriodo('0999-12-31', FIM),
        urlPeriodo(INICIO, '10000-01-01')
    ]);
    const { requisitar, model } = ambiente;
    assert.equal((await requisitar(urlPeriodo('1000-01-01', '9999-12-31'))).status, 200);
    assert.deepEqual(argumentos(model.fontesDestinos), [[USUARIO, '1000-01-01', '9999-12-31']]);
});

test('aceita 29 de fevereiro em ano bissexto', async (t) => {
    const { requisitar, model } = await preparar(t);
    assert.equal((await requisitar(urlPeriodo('2024-02-29', '2024-03-01'))).status, 200);
    assert.deepEqual(argumentos(model.fontesDestinos), [[USUARIO, '2024-02-29', '2024-03-01']]);
});

test('só consulta o model após o período passar pela validação', async (t) => {
    const ambiente = await preparar(t);
    await conferirPeriodosInvalidos(ambiente, [ROTA, urlPeriodo('2026-02-30', FIM), urlPeriodo(FIM, INICIO)]);
    const { requisitar, model } = ambiente;
    assert.equal((await requisitar()).status, 200);
    assert.deepEqual(argumentos(model.fontesDestinos), [[USUARIO, INICIO, FIM]]);
});

test('retorna HTTP 200 para período válido', async (t) => {
    const { requisitar, model } = await preparar(t);
    assert.equal((await requisitar()).status, 200);
    assert.deepEqual(argumentos(model.fontesDestinos), [[USUARIO, INICIO, FIM]]);
});

test('retorna periodo, entradas, saidas e contas exatamente como vieram do model', async (t) => {
    const { requisitar } = await preparar(t);
    assert.deepEqual(await requisitar(), { status: 200, corpo: RELATORIO });
});

test('retorna HTTP 200 com arrays vazios', async (t) => {
    const { requisitar, model } = await preparar(t);
    const vazio = { periodo: PERIODO, entradas: [], saidas: [], contas: [] };
    model.fontesDestinos.mock.mockImplementation(async () => vazio);

    assert.deepEqual(await requisitar(), { status: 200, corpo: vazio });
    assert.deepEqual(argumentos(model.fontesDestinos), [[USUARIO, INICIO, FIM]]);
});

test('preserva valores numéricos e saldo negativo no JSON', async (t) => {
    const { requisitar } = await preparar(t);
    const { status, corpo } = await requisitar();
    assert.equal(status, 200);
    assert.equal(corpo.entradas[0].total, 120.3);
    assert.equal(corpo.saidas[0].total, 140.1);
    const { entradas, saidas, saldo } = corpo.contas[0];
    assert.deepEqual({ entradas, saidas, saldo }, { entradas: 120.3, saidas: 140.1, saldo: -19.8 });
});

test('encaminha erro inesperado ao middleware global e retorna 500 sem expor detalhes', async (t) => {
    const { requisitar, model, registrarErro } = await preparar(t);
    const falha = new Error('Detalhe interno simulado do model');
    model.fontesDestinos.mock.mockImplementation(async () => { throw falha; });

    assert.deepEqual(await requisitar(), { status: 500, corpo: { erro: 'Erro interno do servidor.' } });
    assert.deepEqual(argumentos(registrarErro), [[falha]]);
    assert.deepEqual(argumentos(model.fontesDestinos), [[USUARIO, INICIO, FIM]]);
});

test('o servidor principal bloqueia o RF8 antes de chamar authMock ou o model', async (t) => {
    const { requisitar, model, autenticacaoTemporaria } = await preparar(t, { servidorPrincipal: true });
    assert.deepEqual(await requisitar(), RF8_BLOQUEADO);
    assert.equal(autenticacaoTemporaria.mock.callCount(), 0);
    assert.equal(model.fontesDestinos.mock.callCount(), 0);
});

test('bloqueia as variantes aceitas pelo router, incluindo maiúsculas, barra final e HEAD', async (t) => {
    const isolado = await preparar(t);
    const principal = await preparar(t, { servidorPrincipal: true });
    const variantes = [ROTA, ROTA + '/', '/RELATORIOS/FONTES-DESTINOS', '/Relatorios/Fontes-Destinos/'];

    for (const variante of variantes) {
        const caminho = variante + '?' + new URLSearchParams(PERIODO);
        assert.equal((await isolado.requisitar(caminho)).status, 200);
        assert.equal((await isolado.requisitar(caminho, { metodo: 'HEAD' })).status, 200);
        assert.deepEqual(await principal.requisitar(caminho), RF8_BLOQUEADO);
        assert.deepEqual(await principal.requisitar(caminho, { metodo: 'HEAD' }), { status: 401, corpo: undefined });
    }
    assert.equal(principal.autenticacaoTemporaria.mock.callCount(), 0);
    assert.equal(principal.model.fontesDestinos.mock.callCount(), 0);
});

test('o bloqueio do RF8 preserva /relatorios/faturas na montagem do servidor', async (t) => {
    const { requisitar, model, autenticacaoTemporaria } = await preparar(t, { servidorPrincipal: true });
    const esperado = { status: 200, corpo: FATURAS };
    assert.deepEqual(await requisitar('/relatorios/faturas'), esperado);
    assert.deepEqual(await requisitar('/relatorios/faturas?meses=7'), esperado);
    assert.deepEqual(await requisitar('/relatorios/faturas?meses=13'), {
        status: 400,
        corpo: {
            erro: 'Dados inválidos.',
            campos: { meses: 'Informe um número inteiro de 1 a 12.' }
        }
    });
    assert.deepEqual(argumentos(model.faturas), [[2, 3], [2, 7]]);
    assert.equal(autenticacaoTemporaria.mock.callCount(), 3);
    assert.equal(model.fontesDestinos.mock.callCount(), 0);
});
