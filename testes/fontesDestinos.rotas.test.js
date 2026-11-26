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

const USUARIO = 7;
const OUTRO_USUARIO = 8;
const DADOS_VALIDOS = { nome: 'Reserva', tipo: 'conta' };
const NAO_ENCONTRADO = 'Fonte ou destino não encontrado.';

function registro(id, usuarioId, nome) {
    return {
        id, usuario_id: usuarioId, nome, tipo: 'conta',
        dia_fechamento: null, dia_vencimento: null, limite: null
    };
}

const CONTA = registro(11, USUARIO, 'Conta');
const CONTA_ALHEIA = registro(22, OUTRO_USUARIO, 'Conta de outro usuário');
const CONTA_VINCULADA = registro(33, USUARIO, 'Conta com lançamentos');

class ErroFonteDestino extends Error {
    constructor(codigo, mensagem, status) {
        super(mensagem);
        this.name = 'ErroFonteDestino';
        this.codigo = codigo;
        this.status = status;
    }
}

function simularModel() {
    const chamadas = [];
    const registros = new Map([CONTA, CONTA_ALHEIA, CONTA_VINCULADA].map((item) => [item.id, { ...item }]));
    let proximoId = 34;

    function buscarDoUsuario(usuarioId, id) {
        const item = registros.get(Number(id));
        return item?.usuario_id === usuarioId ? item : null;
    }

    function exigirRegistro(usuarioId, id) {
        const item = buscarDoUsuario(usuarioId, id);
        if (!item) throw new ErroFonteDestino('NAO_ENCONTRADO', NAO_ENCONTRADO, 404);
        return item;
    }

    function validarDados(dados) {
        if (!dados || Object.hasOwn(dados, 'usuario_id')) {
            throw new ErroFonteDestino('DADOS_INVALIDOS', 'Campos inválidos.', 400);
        }
    }

    const model = {
        ErroFonteDestino,

        async criar(usuarioId, dados) {
            chamadas.push(['criar', usuarioId, dados]);
            validarDados(dados);
            if (typeof dados.nome !== 'string' || !dados.nome.trim()) {
                throw new ErroFonteDestino('DADOS_INVALIDOS', 'O nome é obrigatório.', 400);
            }
            if ([...registros.values()].some((item) => item.usuario_id === usuarioId && item.nome === dados.nome)) {
                throw new ErroFonteDestino('NOME_DUPLICADO', 'Já existe uma fonte ou destino com esse nome para o usuário.', 409);
            }
            const item = { ...registro(proximoId++, usuarioId, dados.nome), tipo: dados.tipo };
            registros.set(item.id, item);
            return item;
        },

        async listar(usuarioId) {
            chamadas.push(['listar', usuarioId]);
            return [...registros.values()].filter((item) => item.usuario_id === usuarioId);
        },

        async buscarPorId(usuarioId, id) {
            chamadas.push(['buscarPorId', usuarioId, id]);
            return buscarDoUsuario(usuarioId, id);
        },

        async atualizar(usuarioId, id, dados) {
            chamadas.push(['atualizar', usuarioId, id, dados]);
            validarDados(dados);
            const atual = exigirRegistro(usuarioId, id);
            if (atual.id === CONTA_VINCULADA.id && dados.tipo && dados.tipo !== atual.tipo) {
                throw new ErroFonteDestino('TIPO_EM_USO', 'O tipo não pode ser alterado porque há lançamentos associados.', 409);
            }
            const item = { ...atual, ...dados };
            registros.set(atual.id, item);
            return item;
        },

        async excluir(usuarioId, id) {
            chamadas.push(['excluir', usuarioId, id]);
            const item = exigirRegistro(usuarioId, id);
            if (item.id === CONTA_VINCULADA.id) {
                throw new ErroFonteDestino('RECURSO_EM_USO', 'A fonte ou destino possui registros associados e não pode ser excluída.', 409);
            }
            registros.delete(item.id);
            return true;
        }
    };

    return { model, chamadas };
}

// Carrega apenas os módulos fornecidos para cada arquivo, inclusive quando o código de produção muda.
function carregarIsolado(arquivo, dependencias, consoleLocal = console) {
    const caminho = join(__dirname, '..', arquivo);
    const executar = compileFunction(readFileSync(caminho, 'utf8'), ['require', 'module', 'console'], { filename: caminho });
    const modulo = { exports: {} };
    executar((nome) => {
        assert.ok(Object.hasOwn(dependencias, nome), 'Dependência indisponível no teste: ' + nome);
        return dependencias[nome];
    }, modulo, consoleLocal);
    return modulo.exports;
}

function carregarRouter(model) {
    return carregarIsolado('routes/fontesDestinos.js', {
        express,
        '../models/FonteDestino': model,
        '../utils/erros': ErroHttp
    });
}

function montarServidorPrincipal(router) {
    const app = express();
    const errosRegistrados = [];
    let tratarErros;

    // Preserva os registros de rotas de server.js e intercepta a chamada a listen.
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
        './middleware/authMock': () => assert.fail('O CRUD não deve executar authMock.'),
        './routes/auth': express.Router(),
        './routes/lancamentos': express.Router(),
        './routes/relatorios': express.Router(),
        './routes/fontesDestinos': router
    }, { error: (erro) => errosRegistrados.push(erro) });

    assert.equal(typeof tratarErros, 'function', 'Middleware global de erros não encontrado.');
    return { app, tratarErros, errosRegistrados };
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
    const url = 'http://127.0.0.1:' + servidor.address().port + '/fontes-destinos';

    return async (metodo, caminho = '', { usuario = USUARIO, dados } = {}) => {
        const headers = {};
        if (usuario !== null) headers['x-usuario-teste'] = String(usuario);
        if (dados !== undefined) headers['content-type'] = 'application/json';
        const resposta = await fetch(url + caminho, {
            method: metodo,
            headers,
            body: JSON.stringify(dados),
            signal: AbortSignal.timeout(5000)
        });
        const texto = await resposta.text();
        return { status: resposta.status, corpo: texto === '' ? undefined : JSON.parse(texto) };
    };
}

async function preparar(t) {
    const { model, chamadas } = simularModel();
    const router = carregarRouter(model);
    const { tratarErros, errosRegistrados } = montarServidorPrincipal(router);
    const app = express();
    app.use(express.json());
    app.use('/fontes-destinos', (req, _res, next) => {
        const id = req.get('x-usuario-teste');
        if (id !== undefined) req.auth = { id };
        next();
    }, router);
    app.use(tratarErros);
    const http = await iniciarHttp(t, app);
    return { http, chamadas, model, errosRegistrados };
}

function respostaEsperada(status, corpo) {
    return { status, corpo };
}

function erroEsperado(status, erro) {
    return respostaEsperada(status, { erro });
}

test('rejeita requisição sem identidade autenticada', async (t) => {
    const { http, chamadas } = await preparar(t);
    const resposta = await http('GET', '', { usuario: null });
    assert.deepEqual(resposta, erroEsperado(401, 'Autenticação necessária ou identidade inválida.'));
    assert.deepEqual(chamadas, []);
});

test('rejeita identidade inválida', async (t) => {
    const { http, chamadas } = await preparar(t);
    for (const usuario of ['abc', '0', '1.5', '2147483648']) {
        const resposta = await http('GET', '', { usuario });
        assert.deepEqual(resposta, erroEsperado(401, 'Autenticação necessária ou identidade inválida.'));
    }
    assert.deepEqual(chamadas, []);
});

test('as cinco operações entregam ao model o ID autenticado como número', async (t) => {
    const { http, chamadas } = await preparar(t);
    const alteracoes = { nome: 'Conta editada' };
    assert.equal((await http('POST', '', { dados: DADOS_VALIDOS })).status, 201);
    assert.equal((await http('GET')).status, 200);
    assert.equal((await http('GET', '/11')).status, 200);
    assert.equal((await http('PUT', '/11', { dados: alteracoes })).status, 200);
    assert.equal((await http('DELETE', '/11')).status, 204);
    assert.deepEqual(chamadas, [
        ['criar', USUARIO, DADOS_VALIDOS],
        ['listar', USUARIO],
        ['buscarPorId', USUARIO, '11'],
        ['atualizar', USUARIO, '11', alteracoes],
        ['excluir', USUARIO, '11']
    ]);
});

test('usuario_id no body ou na query não substitui a identidade autenticada', async (t) => {
    const { http, chamadas } = await preparar(t);
    const query = '?usuario_id=' + OUTRO_USUARIO;
    const dados = { ...DADOS_VALIDOS, usuario_id: OUTRO_USUARIO };

    assert.equal((await http('POST', query, { usuario: null, dados })).status, 401);
    assert.deepEqual(chamadas, []);
    assert.deepEqual(await http('POST', query, { dados }), erroEsperado(400, 'Campos inválidos.'));
    assert.deepEqual(await http('PUT', '/11' + query, { dados }), erroEsperado(400, 'Campos inválidos.'));
    assert.deepEqual(await http('GET', query), respostaEsperada(200, { dados: [CONTA, CONTA_VINCULADA] }));
    assert.deepEqual(chamadas, [
        ['criar', USUARIO, dados],
        ['atualizar', USUARIO, '11', dados],
        ['listar', USUARIO]
    ]);
});

test('impede consultar, alterar ou excluir a conta de outro usuário', async (t) => {
    const { http } = await preparar(t);
    const caminho = '/' + CONTA_ALHEIA.id;
    const esperado = erroEsperado(404, NAO_ENCONTRADO);
    assert.deepEqual(await http('GET', caminho), esperado);
    assert.deepEqual(await http('PUT', caminho, { dados: { nome: 'Alteração indevida' } }), esperado);
    assert.deepEqual(await http('DELETE', caminho), esperado);
    assert.deepEqual(await http('GET', caminho, { usuario: OUTRO_USUARIO }),
        respostaEsperada(200, { dados: CONTA_ALHEIA }));
});

test('POST cria uma fonte e retorna 201', async (t) => {
    const { http } = await preparar(t);
    assert.deepEqual(await http('POST', '', { dados: DADOS_VALIDOS }),
        respostaEsperada(201, { dados: registro(34, USUARIO, 'Reserva') }));
});

test('POST com dados inválidos retorna 400', async (t) => {
    const { http } = await preparar(t);
    assert.deepEqual(await http('POST', '', { dados: { tipo: 'conta' } }),
        erroEsperado(400, 'O nome é obrigatório.'));
});

test('POST com nome duplicado retorna 409', async (t) => {
    const { http } = await preparar(t);
    assert.deepEqual(await http('POST', '', { dados: { nome: CONTA.nome, tipo: CONTA.tipo } }),
        erroEsperado(409, 'Já existe uma fonte ou destino com esse nome para o usuário.'));
});

test('GET lista as fontes do usuário e retorna 200', async (t) => {
    const { http } = await preparar(t);
    assert.deepEqual(await http('GET'), respostaEsperada(200, { dados: [CONTA, CONTA_VINCULADA] }));
});

test('GET de um ID existente retorna 200', async (t) => {
    const { http } = await preparar(t);
    assert.deepEqual(await http('GET', '/11'), respostaEsperada(200, { dados: CONTA }));
});

test('GET de um ID inexistente retorna 404', async (t) => {
    const { http } = await preparar(t);
    assert.deepEqual(await http('GET', '/999'), erroEsperado(404, NAO_ENCONTRADO));
});

test('PUT atualiza uma fonte e retorna 200', async (t) => {
    const { http } = await preparar(t);
    const dados = { nome: 'Conta atualizada' };
    assert.deepEqual(await http('PUT', '/11', { dados }), respostaEsperada(200, { dados: { ...CONTA, ...dados } }));
});

test('PUT de um ID inexistente retorna 404', async (t) => {
    const { http } = await preparar(t);
    assert.deepEqual(await http('PUT', '/999', { dados: { nome: 'Conta atualizada' } }), erroEsperado(404, NAO_ENCONTRADO));
});

test('PUT com mudança de tipo em uma fonte vinculada retorna 409', async (t) => {
    const { http } = await preparar(t);
    assert.deepEqual(await http('PUT', '/33', { dados: { tipo: 'renda' } }),
        erroEsperado(409, 'O tipo não pode ser alterado porque há lançamentos associados.'));
});

test('DELETE exclui uma fonte e retorna 204 sem corpo', async (t) => {
    const { http } = await preparar(t);
    assert.deepEqual(await http('DELETE', '/11'), respostaEsperada(204, undefined));
    assert.deepEqual(await http('GET', '/11'), erroEsperado(404, NAO_ENCONTRADO));
});

test('DELETE de um ID inexistente retorna 404', async (t) => {
    const { http } = await preparar(t);
    assert.deepEqual(await http('DELETE', '/999'), erroEsperado(404, NAO_ENCONTRADO));
});

test('DELETE de uma fonte vinculada a lançamentos retorna 409', async (t) => {
    const { http } = await preparar(t);
    assert.deepEqual(await http('DELETE', '/33'),
        erroEsperado(409, 'A fonte ou destino possui registros associados e não pode ser excluída.'));
});

test('um erro assíncrono inesperado chega ao middleware global e retorna 500 genérico', async (t) => {
    const { http, model, errosRegistrados } = await preparar(t);
    const erroInterno = new Error('Detalhe interno do model simulado');
    model.listar = async () => { throw erroInterno; };

    assert.deepEqual(await http('GET'), erroEsperado(500, 'Erro interno do servidor.'));
    assert.deepEqual(errosRegistrados, [erroInterno]);
});

test('a montagem do servidor principal bloqueia os cinco endpoints sem chamar o model', async (t) => {
    const { model, chamadas } = simularModel();
    const { app } = montarServidorPrincipal(carregarRouter(model));
    const http = await iniciarHttp(t, app);
    const esperado = erroEsperado(401, 'Autenticação JWT indisponível para fontes e destinos.');
    assert.deepEqual(await http('POST', '', { dados: DADOS_VALIDOS }), esperado);
    assert.deepEqual(await http('GET'), esperado);
    assert.deepEqual(await http('GET', '/11'), esperado);
    assert.deepEqual(await http('PUT', '/11', { dados: { nome: 'Conta atualizada' } }), esperado);
    assert.deepEqual(await http('DELETE', '/11'), esperado);
    assert.deepEqual(chamadas, []);
});
