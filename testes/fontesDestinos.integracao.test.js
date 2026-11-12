/*
 * Execução futura, a partir da raiz do projeto (Node.js com node:test):
 *   DB_NAME=financas_teste node --test testes/fontesDestinos.integracao.test.js
 *
 * Pré-requisitos: financas_teste já existe e recebeu database/schema.sql;
 * DB_HOST, DB_PORT, DB_USER e DB_PASSWORD estão no ambiente ou no .env.
 * Este arquivo não cria bancos nem tabelas e não modifica o .env.
 * DB_NAME deve ser fornecido explicitamente no ambiente, mesmo usando .env.
 * O model abre conexões próprias: a limpeza é explícita, não por rollback.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, randomInt } = require('node:crypto');

function exigirBancoDeTeste() {
    assert.equal(process.env.DB_NAME, 'financas_teste',
        'Execução bloqueada: DB_NAME deve ser exatamente financas_teste.');
}

test('FonteDestino: integração isolada com MySQL', { concurrency: false }, async (t) => {
    // Antes até de carregar connection.js (que carrega dotenv) ou abrir conexões.
    exigirBancoDeTeste();
    const FonteDestino = require('../models/FonteDestino');
    const mysql = require('mysql2/promise');
    exigirBancoDeTeste();

    const banco = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT || 3306,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: 'financas_teste',
        multipleStatements: false
    });

    const marca = `it_${randomUUID().replace(/-/g, '')}`;
    const usuarios = [];
    const fontes = [];
    const categorias = [];
    const lancamentos = [];
    let falha;

    async function sql(texto, parametros = []) {
        exigirBancoDeTeste();
        return banco.execute(texto, parametros);
    }

    async function chamar(operacao, ...args) {
        exigirBancoDeTeste();
        return FonteDestino[operacao](...args);
    }

    async function criar(usuarioId, dados) {
        const registro = await chamar('criar', usuarioId, dados);
        fontes.push({ id: registro.id, usuarioId });
        return registro;
    }

    function erro(codigo, status) {
        return (recebido) => {
            assert.ok(recebido instanceof FonteDestino.ErroFonteDestino);
            assert.equal(recebido.codigo, codigo);
            assert.equal(recebido.status, status);
            return true;
        };
    }

    const nome = (sufixo) => `${marca}_${sufixo}`;
    const cartao = (sufixo) => ({
        nome: nome(sufixo), tipo: 'cartao_credito',
        dia_fechamento: 5, dia_vencimento: 12, limite: '001234.5'
    });

    try {
        const [[atual]] = await sql('SELECT DATABASE() AS nome');
        assert.equal(atual.nome, 'financas_teste');

        const cpfs = new Set();
        for (const sufixo of ['a', 'b']) {
            let cpf;
            do {
                cpf = String(randomInt(0, 100000000000)).padStart(11, '0');
            } while (cpfs.has(cpf));
            cpfs.add(cpf);
            const email = `${marca}_${sufixo}@example.invalid`;
            const [resultado] = await sql(
                'INSERT INTO usuarios (nome, email, cpf, senha_hash) VALUES (?, ?, ?, ?)',
                [nome(`usuario_${sufixo}`), email, cpf, 'hash-ficticio-integracao']
            );
            // Colisões de email/CPF falham; nunca consultamos ou reutilizamos usuários.
            usuarios.push({ id: resultado.insertId, email, cpf });
        }
        const [a, b] = usuarios.map((usuario) => usuario.id);

        await t.test('cria renda, conta e cartão válido e persiste os campos', async () => {
            for (const tipo of ['renda', 'conta', 'cartao_credito']) {
                const dados = tipo === 'cartao_credito'
                    ? cartao('valido') : { nome: `  ${nome(tipo)}  `, tipo };
                const criado = await criar(a, dados);
                assert.ok(Number.isInteger(criado.id) && criado.id > 0);
                assert.equal(criado.usuario_id, a);
                assert.equal(criado.nome, dados.nome.trim());
                assert.equal(criado.tipo, tipo);
                assert.equal(criado.dia_fechamento, tipo === 'cartao_credito' ? 5 : null);
                assert.equal(criado.dia_vencimento, tipo === 'cartao_credito' ? 12 : null);
                assert.equal(criado.limite, tipo === 'cartao_credito' ? '1234.50' : null);
                assert.deepEqual(await chamar('buscarPorId', a, criado.id), criado);
            }
        });

        await t.test('rejeita campos inválidos sem persistir registros', async () => {
            const antes = await chamar('listar', a);
            const casos = [
                null, [], {},
                { nome: '', tipo: 'renda' },
                { nome: '   ', tipo: 'conta' },
                { nome: 123, tipo: 'conta' },
                { nome: 'x'.repeat(61), tipo: 'renda' },
                { nome: nome('tipo'), tipo: 'invalido' },
                { nome: nome('extra'), tipo: 'conta', usuario_id: b },
                { nome: nome('dias'), tipo: 'renda', dia_fechamento: 1 },
                { nome: nome('limite_conta'), tipo: 'conta', limite: '1.00' },
                { nome: nome('incompleto'), tipo: 'cartao_credito' },
                ...[0, 32, 1.5, '5', null].flatMap((dia) => [
                    { ...cartao('dia_f'), dia_fechamento: dia },
                    { ...cartao('dia_v'), dia_vencimento: dia }
                ])
            ];
            for (const dados of casos) {
                await assert.rejects(() => criar(a, dados), erro('DADOS_INVALIDOS', 400));
            }
            assert.deepEqual(await chamar('listar', a), antes);
        });

        await t.test('rejeita limite não textual, zero, negativo ou fora do formato', async () => {
            const antes = await chamar('listar', a);
            const limites = [1234.5, 0, null, undefined, true, {}, [], '', '0', '0.00',
                '-1.00', '1,00', '1.234', '10000000000.00', ' 1.00', '1e3', 'NaN'];
            for (const limite of limites) {
                await assert.rejects(() => criar(a, { ...cartao('limite'), limite }),
                    erro('DADOS_INVALIDOS', 400));
            }
            assert.deepEqual(await chamar('listar', a), antes);
        });

        await t.test('impede nome duplicado por usuário e permite entre usuários', async () => {
            const dados = { nome: nome('compartilhado'), tipo: 'conta' };
            const primeiro = await criar(a, dados);
            await assert.rejects(() => criar(a, { ...dados, tipo: 'renda' }),
                erro('NOME_DUPLICADO', 409));
            const segundo = await criar(b, dados);
            assert.notEqual(primeiro.id, segundo.id);
            assert.equal(segundo.nome, primeiro.nome);
            assert.equal(segundo.usuario_id, b);
        });

        await t.test('lista somente o usuário autenticado e impede acesso a terceiros', async () => {
            const registrosA = await chamar('listar', a);
            const registrosB = await chamar('listar', b);
            for (const [usuarioId, registros] of [[a, registrosA], [b, registrosB]]) {
                assert.ok(registros.length > 0);
                assert.ok(registros.every((registro) => registro.usuario_id === usuarioId));
                assert.deepEqual(registros.map((registro) => registro.id).sort((x, y) => x - y),
                    fontes.filter((fonte) => fonte.usuarioId === usuarioId)
                        .map((fonte) => fonte.id).sort((x, y) => x - y));
            }
            const alheio = registrosB[0];
            assert.equal(await chamar('buscarPorId', a, alheio.id), null);
            await assert.rejects(() => chamar('atualizar', a, alheio.id, { nome: nome('invasao') }),
                erro('NAO_ENCONTRADO', 404));
            await assert.rejects(() => chamar('excluir', a, alheio.id), erro('NAO_ENCONTRADO', 404));
            assert.deepEqual(await chamar('buscarPorId', b, alheio.id), alheio);
        });

        await t.test('atualiza campos e valida as mudanças de tipo', async () => {
            const inicial = await criar(a, { nome: nome('editar'), tipo: 'renda' });
            let esperado = { ...inicial, nome: nome('renomeado') };
            assert.deepEqual(await chamar('atualizar', a, inicial.id, { nome: esperado.nome }), esperado);
            await assert.rejects(() => chamar('atualizar', a, inicial.id, { tipo: 'cartao_credito' }),
                erro('DADOS_INVALIDOS', 400));
            esperado = { ...esperado, tipo: 'conta' };
            assert.deepEqual(await chamar('atualizar', a, inicial.id, { tipo: 'conta' }), esperado);
            esperado = { ...esperado, ...cartao('editado'), limite: '1234.50' };
            assert.deepEqual(await chamar('atualizar', a, inicial.id, cartao('editado')), esperado);
            await assert.rejects(() => chamar('atualizar', a, inicial.id, { limite: 100 }),
                erro('DADOS_INVALIDOS', 400));
            await assert.rejects(() => chamar('atualizar', a, inicial.id, { tipo: 'renda' }),
                erro('DADOS_INVALIDOS', 400));
            assert.deepEqual(await chamar('buscarPorId', a, inicial.id), esperado);
            const mudanca = { tipo: 'renda', dia_fechamento: null, dia_vencimento: null, limite: null };
            esperado = { ...esperado, ...mudanca };
            assert.deepEqual(await chamar('atualizar', a, inicial.id, mudanca), esperado);
            assert.deepEqual(await chamar('buscarPorId', a, inicial.id), esperado);
        });

        await t.test('exclui registro sem lançamentos e trata registro inexistente', async () => {
            const criado = await criar(a, { nome: nome('excluir'), tipo: 'conta' });
            assert.equal(await chamar('excluir', a, criado.id), true);
            // ID obtido nesta execução e removido: não depende de IDs fixos.
            assert.equal(await chamar('buscarPorId', a, criado.id), null);
            await assert.rejects(() => chamar('atualizar', a, criado.id, { nome: nome('ausente') }),
                erro('NAO_ENCONTRADO', 404));
            await assert.rejects(() => chamar('excluir', a, criado.id), erro('NAO_ENCONTRADO', 404));
            assert.ok(!(await chamar('listar', a)).some((registro) => registro.id === criado.id));
        });

        await t.test('lançamentos impedem excluir a fonte e mudar seu tipo', async () => {
            const fonte = await criar(a, { nome: nome('em_uso'), tipo: 'conta' });
            const [categoria] = await sql(
                'INSERT INTO categorias (usuario_id, nome, tipo) VALUES (?, ?, ?)',
                [a, nome('categoria'), 'saida']
            );
            categorias.push({ id: categoria.insertId, usuarioId: a });
            const [lancamento] = await sql(
                `INSERT INTO lancamentos
                    (usuario_id, tipo, descricao, valor, data, categoria_id,
                     fonte_destino_id, parcela_atual, total_parcelas, grupo_parcelamento)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [a, 'saida', nome('lancamento'), '10.00', '2026-01-15',
                    categoria.insertId, fonte.id, 1, 1, null]
            );
            lancamentos.push({ id: lancamento.insertId, usuarioId: a });
            await assert.rejects(() => chamar('excluir', a, fonte.id), erro('RECURSO_EM_USO', 409));
            await assert.rejects(() => chamar('atualizar', a, fonte.id, { tipo: 'renda' }),
                erro('TIPO_EM_USO', 409));
            await assert.rejects(() => chamar('atualizar', a, fonte.id, cartao('bloqueado')),
                erro('TIPO_EM_USO', 409));
            assert.deepEqual(await chamar('buscarPorId', a, fonte.id), fonte);
            const [[persistido]] = await sql(
                'SELECT fonte_destino_id FROM lancamentos WHERE id = ? AND usuario_id = ?',
                [lancamento.insertId, a]
            );
            assert.equal(persistido.fonte_destino_id, fonte.id);
        });
    } catch (erroRecebido) {
        falha = erroRecebido;
    } finally {
        const erros = falha ? [falha] : [];
        // Cada DELETE usa IDs retornados pelos INSERTs desta execução.
        // Tentamos todos os passos e encerramos a conexão mesmo se algum falhar.
        for (const [tabela, registros] of [
            ['lancamentos', lancamentos], ['fontes_destinos', fontes], ['categorias', categorias]
        ]) {
            for (const registro of registros) {
                try {
                    await sql(`DELETE FROM ${tabela} WHERE id = ? AND usuario_id = ?`,
                        [registro.id, registro.usuarioId]);
                } catch (erroLimpeza) {
                    erros.push(erroLimpeza);
                }
            }
        }
        for (const usuario of usuarios) {
            try {
                // Não aciona CASCADE se ainda restar algum registro dependente.
                await sql(
                    `DELETE FROM usuarios WHERE id = ? AND email = ? AND cpf = ?
                     AND NOT EXISTS (SELECT 1 FROM lancamentos WHERE usuario_id = ?)
                     AND NOT EXISTS (SELECT 1 FROM fontes_destinos WHERE usuario_id = ?)
                     AND NOT EXISTS (SELECT 1 FROM categorias WHERE usuario_id = ?)`,
                    [usuario.id, usuario.email, usuario.cpf, usuario.id, usuario.id, usuario.id]
                ).then(([resultado]) => assert.equal(resultado.affectedRows, 1,
                    'A limpeza do usuário de teste não foi concluída.'));
            } catch (erroLimpeza) {
                erros.push(erroLimpeza);
            }
        }
        try {
            await banco.end();
        } catch (erroEncerramento) {
            banco.destroy();
            erros.push(erroEncerramento);
        }
        if (erros.length) throw new AggregateError(erros, 'Falha na integração ou na limpeza dos dados de teste.');
    }
});
