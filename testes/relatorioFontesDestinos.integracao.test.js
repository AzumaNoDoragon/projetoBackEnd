/*
 * Execução futura a partir da raiz do projeto
 *   DOTENV_OVERRIDE=false DB_NAME=financas_teste node --test testes/relatorioFontesDestinos.integracao.test.js
 *
 * Prepare financas_teste previamente com as tabelas do schema e configure as
 * credenciais MySQL. Não use db:init para preparar o banco isolado, pois
 * database/schema.sql seleciona explicitamente o banco financas.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { randomInt, randomUUID } = require('node:crypto');

const BANCO_TESTE = 'financas_teste';
const INICIO = '2026-11-01';
const FIM = '2026-11-30';
const DIA = '2026-11-15';
const ANTES = '2026-10-31';
const DEPOIS = '2026-12-01';
const DIA_SEGUNDA_PARCELA = '2026-11-20';

function exigirBancoDeTeste() {
    assert.equal(process.env.DB_NAME, BANCO_TESTE, 'Execução bloqueada. Use DB_NAME=financas_teste.');
}

function movimento(fonte, total) {
    return { ...fonte, total };
}

function conta({ id, nome }, entradas, saidas, saldo) {
    return { id, nome, entradas, saidas, saldo };
}

test('Relatorio.fontesDestinos com MySQL isolado', { concurrency: false }, async (t) => {
    exigirBancoDeTeste();
    const { pool } = require('../database/connection');

    const registros = { lancamentos: [], fontes_destinos: [], categorias: [], usuarios: [] };
    let banco;
    let bancosConfirmados = false;

    t.after(async () => {
        const erros = [];
        try {
            if (bancosConfirmados) await limparRegistros(erros);
        } catch (erro) {
            erros.push(erro);
        }

        if (banco) {
            try {
                await banco.end();
            } catch (erro) {
                erros.push(erro);
                try {
                    banco.destroy();
                } catch (erroDescarte) {
                    erros.push(erroDescarte);
                }
            }
        }

        try {
            await pool.end();
        } catch (erro) {
            erros.push(erro);
        }
        if (erros.length) throw new AggregateError(erros, 'Falha ao limpar as fixtures ou encerrar as conexões.');
    });

    // A conexão carrega dotenv. Confira DB_NAME novamente antes de carregar o model.
    exigirBancoDeTeste();
    const Relatorio = require('../models/Relatorio');
    const mysql = require('mysql2/promise');

    const [[bancoDoPool]] = await pool.query('SELECT DATABASE() AS nome');
    assert.equal(bancoDoPool.nome, BANCO_TESTE, 'Execução bloqueada. O pool deve usar financas_teste.');

    banco = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT || 3306,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: BANCO_TESTE,
        dateStrings: true,
        multipleStatements: false
    });
    const [[bancoAuxiliar]] = await banco.execute('SELECT DATABASE() AS nome');
    assert.equal(bancoAuxiliar.nome, BANCO_TESTE, 'Execução bloqueada. A conexão auxiliar deve usar financas_teste.');
    bancosConfirmados = true;

    const marca = 'rf8_' + randomUUID().replace(/-/g, '');
    const nome = (sufixo) => marca + '_' + sufixo;
    const cpfs = new Set();

    function exigirBancosConfirmados() {
        exigirBancoDeTeste();
        assert.ok(bancosConfirmados, 'Confirme o banco das duas conexões antes de acessar os dados.');
    }

    async function sql(texto, parametros) {
        exigirBancosConfirmados();
        return banco.execute(texto, parametros);
    }

    async function consultar(usuarioId, inicio = INICIO, fim = FIM) {
        exigirBancosConfirmados();
        return Relatorio.fontesDestinos(usuarioId, inicio, fim);
    }

    async function criarUsuario(sufixo) {
        let cpf;
        do {
            cpf = String(randomInt(0, 100000000000)).padStart(11, '0');
        } while (cpfs.has(cpf));
        cpfs.add(cpf);

        const email = nome(sufixo) + '@example.invalid';
        const [resultado] = await sql(
            'INSERT INTO usuarios (nome, email, cpf, senha_hash) VALUES (?, ?, ?, ?)',
            [nome(sufixo), email, cpf, 'hash-apenas-fixture']
        );
        registros.usuarios.push({ id: resultado.insertId, email, cpf });
        return resultado.insertId;
    }

    async function criarCategoria(usuarioId, tipo) {
        const [resultado] = await sql(
            'INSERT INTO categorias (usuario_id, nome, tipo) VALUES (?, ?, ?)',
            [usuarioId, nome(tipo), tipo]
        );
        registros.categorias.push({ id: resultado.insertId, usuarioId });
        return { id: resultado.insertId, tipo };
    }

    async function criarFonte(usuarioId, sufixo, tipo, limite = null) {
        const nomeFonte = nome(sufixo);
        const dias = tipo === 'cartao_credito' ? [5, 12] : [null, null];
        const [resultado] = await sql(
            `INSERT INTO fontes_destinos
                (usuario_id, nome, tipo, dia_fechamento, dia_vencimento, limite)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [usuarioId, nomeFonte, tipo, ...dias, limite]
        );
        registros.fontes_destinos.push({ id: resultado.insertId, usuarioId });
        return { id: resultado.insertId, nome: nomeFonte, tipo };
    }

    async function lancar(usuarioId, categoria, fonte, valor, data = DIA, { atual = 1, total = 1, grupo = null } = {}) {
        const descricao = nome('lancamento_' + (registros.lancamentos.length + 1));
        const [resultado] = await sql(
            `INSERT INTO lancamentos
                (usuario_id, tipo, descricao, valor, data, categoria_id, fonte_destino_id,
                 parcela_atual, total_parcelas, grupo_parcelamento)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [usuarioId, categoria.tipo, descricao, valor, data, categoria.id, fonte.id, atual, total, grupo]
        );
        registros.lancamentos.push({ id: resultado.insertId, usuarioId });
        return resultado.insertId;
    }

    async function limparRegistros(erros) {
        async function excluir(tabela, id, texto, parametros) {
            try {
                const [resultado] = await sql(texto, parametros);
                assert.equal(resultado.affectedRows, 1, 'Limpeza incompleta de ' + tabela + ', ID ' + id + '.');
            } catch (erro) {
                erros.push(erro);
            }
        }

        for (const tabela of ['lancamentos', 'fontes_destinos', 'categorias']) {
            for (const { id, usuarioId } of registros[tabela]) {
                await excluir(tabela, id, 'DELETE FROM ' + tabela + ' WHERE id = ? AND usuario_id = ?', [id, usuarioId]);
            }
        }

        for (const { id, email, cpf } of registros.usuarios) {
            // Só remove o usuário se a exclusão não acionar uma cascata.
            await excluir('usuarios', id,
                `DELETE FROM usuarios WHERE id = ? AND email = ? AND cpf = ?
                 AND NOT EXISTS (SELECT 1 FROM lancamentos WHERE usuario_id = ?)
                 AND NOT EXISTS (SELECT 1 FROM fontes_destinos WHERE usuario_id = ?)
                 AND NOT EXISTS (SELECT 1 FROM categorias WHERE usuario_id = ?)`,
                [id, email, cpf, id, id, id]
            );
        }
    }

    async function estadoDasFixtures() {
        const ids = registros.usuarios.map(({ id }) => id);
        const marcadores = ids.map(() => '?').join(', ');
        const estado = {};
        for (const tabela of Object.keys(registros)) {
            const coluna = tabela === 'usuarios' ? 'id' : 'usuario_id';
            const [linhas] = await sql(
                'SELECT * FROM ' + tabela + ' WHERE ' + coluna + ' IN (' + marcadores + ') ORDER BY id',
                ids
            );
            estado[tabela] = linhas;
        }
        return estado;
    }

    const usuario = await criarUsuario('principal');
    const outro = await criarUsuario('outro');
    const semFontes = await criarUsuario('sem_fontes');

    const entrada = await criarCategoria(usuario, 'entrada');
    const saida = await criarCategoria(usuario, 'saida');
    const entradaAlheia = await criarCategoria(outro, 'entrada');
    const saidaAlheia = await criarCategoria(outro, 'saida');

    const salario = await criarFonte(usuario, '01_salario', 'renda');
    const extra = await criarFonte(usuario, '02_extra', 'renda');
    const positiva = await criarFonte(usuario, '03_positiva', 'conta');
    const negativa = await criarFonte(usuario, '04_negativa', 'conta');
    const parada = await criarFonte(usuario, '05_parada', 'conta');
    const semLancamentos = await criarFonte(usuario, '06_sem_lancamentos', 'conta');
    const cartao = await criarFonte(usuario, '07_cartao', 'cartao_credito', '5000.00');
    const cartaoParado = await criarFonte(usuario, '08_cartao_parado', 'cartao_credito', '9000.00');
    const alheia = await criarFonte(outro, '09_alheia', 'conta');

    await lancar(usuario, entrada, salario, '120.10', INICIO);
    await lancar(usuario, entrada, salario, '79.90', FIM);
    await lancar(usuario, entrada, salario, '900.00', ANTES);
    await lancar(usuario, entrada, salario, '800.00', DEPOIS);
    await lancar(usuario, entrada, extra, '35.40');
    await lancar(usuario, entrada, positiva, '0.10');
    await lancar(usuario, entrada, positiva, '0.20');
    await lancar(usuario, saida, positiva, '0.10');
    await lancar(usuario, entrada, negativa, '10.25');
    await lancar(usuario, saida, negativa, '7.50');
    await lancar(usuario, saida, negativa, '12.75');
    await lancar(usuario, entrada, parada, '37.00', ANTES);

    const grupo = randomUUID();
    await lancar(usuario, saida, cartao, '17.35', DIA, { atual: 1, total: 3, grupo });
    await lancar(usuario, saida, cartao, '17.36', DIA_SEGUNDA_PARCELA, { atual: 2, total: 3, grupo });
    await lancar(usuario, saida, cartao, '17.35', '2026-12-15', { atual: 3, total: 3, grupo });

    await lancar(outro, entradaAlheia, alheia, '410.00');
    await lancar(outro, saidaAlheia, alheia, '52.25');

    // As FKs referenciam IDs individualmente. Só a fonte do lançamento pertence a outro usuário.
    const cruzadoDoOutro = await lancar(outro, entradaAlheia, positiva, '777.77');
    const cruzadoDoPrincipal = await lancar(usuario, saida, alheia, '888.88');

    const periodo = { inicio: INICIO, fim: FIM };
    const esperado = {
        periodo,
        entradas: [
            movimento(salario, 200),
            movimento(extra, 35.4),
            movimento(positiva, 0.3),
            movimento(negativa, 10.25)
        ],
        saidas: [
            movimento(positiva, 0.1),
            movimento(negativa, 20.25),
            movimento(cartao, 34.71)
        ],
        contas: [
            conta(positiva, 0.3, 0.1, 0.2),
            conta(negativa, 10.25, 20.25, -10),
            conta(parada, 0, 0, 0),
            conta(semLancamentos, 0, 0, 0)
        ]
    };
    const esperadoOutro = {
        periodo,
        entradas: [movimento(alheia, 410)],
        saidas: [movimento(alheia, 52.25)],
        contas: [conta(alheia, 410, 52.25, 357.75)]
    };

    const estadoInicial = await estadoDasFixtures();
    const relatorio = await consultar(usuario);

    await t.test('agrupa múltiplas entradas da mesma renda', () => {
        assert.deepEqual(relatorio.entradas.find(({ id }) => id === salario.id), movimento(salario, 200));
    });

    await t.test('separa diferentes fontes de renda', () => {
        assert.deepEqual(relatorio.entradas.filter(({ tipo }) => tipo === 'renda'), [
            movimento(salario, 200), movimento(extra, 35.4)
        ]);
    });

    await t.test('agrupa múltiplas despesas do mesmo destino', () => {
        assert.deepEqual(relatorio.saidas.find(({ id }) => id === negativa.id), movimento(negativa, 20.25));
    });

    await t.test('diferencia despesas de contas e cartões', () => {
        assert.deepEqual(relatorio.saidas, esperado.saidas);
    });

    await t.test('contabiliza entradas vinculadas a contas', () => {
        assert.deepEqual(relatorio.entradas.filter(({ tipo }) => tipo === 'conta'), [
            movimento(positiva, 0.3), movimento(negativa, 10.25)
        ]);
    });

    await t.test('calcula saldo positivo', () => {
        assert.deepEqual(relatorio.contas.find(({ id }) => id === positiva.id), conta(positiva, 0.3, 0.1, 0.2));
    });

    await t.test('calcula saldo negativo', () => {
        assert.deepEqual(relatorio.contas.find(({ id }) => id === negativa.id), conta(negativa, 10.25, 20.25, -10));
    });

    await t.test('mantém contas sem movimento no período com saldo zero', () => {
        assert.deepEqual(relatorio.contas.filter(({ id }) => id === parada.id || id === semLancamentos.id), [
            conta(parada, 0, 0, 0), conta(semLancamentos, 0, 0, 0)
        ]);
        assert.ok(!relatorio.entradas.some(({ id }) => id === parada.id));
    });

    await t.test('exclui lançamentos anteriores e posteriores ao período', async () => {
        assert.deepEqual(relatorio.entradas.find(({ id }) => id === salario.id), movimento(salario, 200));
        assert.deepEqual((await consultar(usuario, ANTES, ANTES)).entradas, [movimento(salario, 900), movimento(parada, 37)]);
        assert.deepEqual((await consultar(usuario, DEPOIS, DEPOIS)).entradas, [movimento(salario, 800)]);
    });

    await t.test('inclui lançamentos exatamente nas datas inicial e final', async () => {
        assert.deepEqual((await consultar(usuario, INICIO, INICIO)).entradas, [movimento(salario, 120.1)]);
        assert.deepEqual((await consultar(usuario, FIM, FIM)).entradas, [movimento(salario, 79.9)]);
    });

    await t.test('aceita período de um único dia', async () => {
        assert.deepEqual(await consultar(usuario, DIA, DIA), {
            periodo: { inicio: DIA, fim: DIA },
            entradas: [movimento(extra, 35.4), movimento(positiva, 0.3), movimento(negativa, 10.25)],
            saidas: [movimento(positiva, 0.1), movimento(negativa, 20.25), movimento(cartao, 17.35)],
            contas: esperado.contas
        });
    });

    await t.test('isola os registros dos usuários', async () => {
        for (const lista of [relatorio.entradas, relatorio.saidas, relatorio.contas]) {
            assert.ok(!lista.some(({ id }) => id === alheia.id));
        }
        assert.deepEqual(await consultar(outro), esperadoOutro);
    });

    await t.test('ignora lançamentos cruzados entre usuários nos dois sentidos', async () => {
        const [cruzados] = await sql(
            'SELECT usuario_id, fonte_destino_id, valor FROM lancamentos WHERE id IN (?, ?) ORDER BY id',
            [cruzadoDoOutro, cruzadoDoPrincipal]
        );
        assert.deepEqual(cruzados, [
            { usuario_id: outro, fonte_destino_id: positiva.id, valor: '777.77' },
            { usuario_id: usuario, fonte_destino_id: alheia.id, valor: '888.88' }
        ]);
        assert.deepEqual(relatorio, esperado);
        assert.deepEqual(await consultar(outro), esperadoOutro);
    });

    await t.test('preserva a precisão de 0.10 + 0.20 e do saldo decimal', () => {
        assert.equal(relatorio.entradas.find(({ id }) => id === positiva.id)?.total, 0.3);
        assert.equal(relatorio.contas.find(({ id }) => id === positiva.id)?.saldo, 0.2);
    });

    await t.test('soma parcelas pelo valor registrado e exclui a parcela fora do período', async () => {
        assert.deepEqual(relatorio.saidas.find(({ id }) => id === cartao.id), movimento(cartao, 34.71));
        const segundaParcela = await consultar(usuario, DIA_SEGUNDA_PARCELA, DIA_SEGUNDA_PARCELA);
        assert.deepEqual(segundaParcela.saidas, [movimento(cartao, 17.36)]);
    });

    await t.test('retorna arrays vazios para usuário sem fontes ou destinos', async () => {
        assert.deepEqual(await consultar(semFontes), { periodo, entradas: [], saidas: [], contas: [] });
    });

    await t.test('exclui cartões dos saldos e não usa seus limites como movimentação', () => {
        assert.ok(!relatorio.contas.some(({ id }) => id === cartao.id || id === cartaoParado.id));
        assert.deepEqual(relatorio.saidas.filter(({ tipo }) => tipo === 'cartao_credito'), [movimento(cartao, 34.71)]);
        assert.ok(!relatorio.entradas.some(({ id }) => id === cartaoParado.id));
    });

    await t.test('retorna a estrutura JSON esperada com valores numéricos', () => {
        assert.deepEqual(JSON.parse(JSON.stringify(relatorio)), esperado);
    });

    await t.test('preserva os registros consultados', async () => {
        assert.deepEqual(await estadoDasFixtures(), estadoInicial);
    });
});
