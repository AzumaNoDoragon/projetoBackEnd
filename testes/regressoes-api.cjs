const assert = require('node:assert/strict');

module.exports = async function ({ registrar, requisicao, pool, ana, tokenA, tokenB, categoriaA, fonteA, fonteB, novoLancamento }) {
    const Categoria = require('../models/categorias');
    const Lancamentos = require('../models/Lancamentos');
    const FonteDestino = require('../models/FonteDestino');
    const Relatorio = require('../models/Relatorio');
    const RelatorioCategoria = require('../models/RelatorioCategoria');
    const { periodoAnterior } = require('../utils/datas');
    let cartao, compra;

    await registrar('Senha: limites ASCII e UTF-8, sem truncar nem remover espacos', async () => {
        const casos = [
            ['A1' + 'a'.repeat(70), '11144477735'],
            ['A1' + 'é'.repeat(35), '12345678909'],
            [' A1abcde ', '98765432100']
        ];
        for (let i = 0; i < casos.length; i++) {
            const [senha, cpf] = casos[i];
            const email = `senha${i}@example.com`;
            assert.ok(Buffer.byteLength(senha, 'utf8') <= 72);
            await requisicao('POST', '/auth/cadastro', null, { nome: 'Teste senha', email, cpf, senha }, 201);
            await requisicao('POST', '/auth/login', null, { email, senha });
            if (i < 2) {
                for (const sufixo of ['x', 'y']) {
                    await requisicao('POST', '/auth/cadastro', null, { nome: 'Senha longa', email, cpf, senha: senha + sufixo }, 400);
                    await requisicao('POST', '/auth/login', null, { email, senha: senha + sufixo }, 400);
                }
            } else {
                await requisicao('POST', '/auth/login', null, { email, senha: senha.trim() }, 401);
            }
        }
        // 37 caracteres, mas 73 bytes.
        await requisicao('POST', '/auth/cadastro', null, {
            nome: 'UTF8', email: 'utf8@example.com', cpf: '11144477735', senha: 'A' + 'é'.repeat(36)
        }, 400);
    });

    await registrar('Categoria vinculada: conflito de tipo, renomear, no-op e isolamento', async () => {
        const id = categoriaA('saida');
        const original = await Categoria.buscarPorId(id, ana.id);
        await requisicao('PUT', '/categorias/' + id, tokenA, { nome: original.nome, tipo: 'entrada' }, 409);
        await requisicao('PUT', '/categorias/' + id, tokenB, { nome: original.nome, tipo: 'entrada' }, 404);
        for (let i = 0; i < 2; i++) {
            await requisicao('PUT', '/categorias/' + id, tokenA, { nome: 'Saidas renomeadas', tipo: 'saida' });
        }
        assert.equal((await Categoria.buscarPorId(id, ana.id)).tipo, 'saida');
    });

    await registrar('Parcelamento: centavo minimo, divisao 250/7 e atualizacao preserva cartao e saida', async () => {
        cartao = (await requisicao('POST', '/fontes-destinos', tokenA, {
            nome: 'Cartao regressao', tipo: 'cartao_credito', dia_fechamento: 28, dia_vencimento: 5, limite: '1000.00'
        }, 201)).dados;
        const dados = { ...novoLancamento('saida', 0.01, '2026-12-28', categoriaA('saida'), cartao.id), parcelas: 2 };
        const [[antes]] = await pool.query('SELECT COUNT(*) AS n FROM lancamentos');
        const erro = await requisicao('POST', '/lancamentos', tokenA, dados, 400);
        assert.ok(erro.campos.parcelas);
        const [[depois]] = await pool.query('SELECT COUNT(*) AS n FROM lancamentos');
        assert.equal(depois.n, antes.n);
        compra = await requisicao('POST', '/lancamentos', tokenA, { ...dados, valor: 250, parcelas: 7 }, 201);
        const [parcelas] = await pool.query('SELECT valor FROM lancamentos WHERE grupo_parcelamento = ? ORDER BY parcela_atual', [compra.grupoParcelamento]);
        assert.deepEqual(parcelas.map(p => Number(p.valor)), [35.74, 35.71, 35.71, 35.71, 35.71, 35.71, 35.71]);
        const edicao = { ...dados, valor: 35.74 };
        for (const fonteDestinoId of [fonteA, (await FonteDestino.criar(ana.id, { nome: 'Renda teste', tipo: 'renda' })).id]) {
            await requisicao('PUT', '/lancamentos/' + compra.id, tokenA, { ...edicao, fonteDestinoId }, 400);
        }
        await requisicao('PUT', '/lancamentos/' + compra.id, tokenA, { ...edicao, tipo: 'entrada', categoriaId: categoriaA('entrada') }, 400);
        await requisicao('PUT', '/lancamentos/' + compra.id, tokenA, { ...edicao, fonteDestinoId: fonteB }, 404);
        await requisicao('PUT', '/lancamentos/' + compra.id, tokenA, { ...edicao, categoriaId: categoriaA('entrada') }, 400);
        await requisicao('PUT', '/lancamentos/' + compra.id, tokenA, edicao);
        const salvo = await Lancamentos.findById(compra.id, ana.id);
        assert.equal(salvo.parcela, '1/7');
        assert.equal(salvo.fonteDestino.id, cartao.id);
    });

    await registrar('Faturas: fechamento, virada do ano, fevereiro, parcelas e limite', async () => {
        const rel = await Relatorio.faturas(ana.id, 6, '2026-12-28');
        const c = rel.cartoes.find(c => c.id === cartao.id);
        assert.equal(c.faturaAtual.fechamento, '2027-01-28');
        assert.equal(c.faturaAtual.vencimento, '2027-02-05');
        assert.equal(c.faturaAtual.total, 35.74);
        assert.equal(c.proximasFaturas[0].fechamento, '2027-02-28');
        assert.equal(c.proximasFaturas[0].total, 35.71);
        assert.deepEqual(c.limite, { total: 1000, utilizado: 250, disponivel: 750 });
        assert.equal(c.faturaAtual.total + c.proximasFaturas.reduce((n, f) => n + Math.round(f.total * 100), 0) / 100, 250);
        assert.equal((await Relatorio.faturas(ana.id, 1, '2027-02-06')).cartoes.find(c => c.id === cartao.id).limite.utilizado, 214.26);
        assert.ok(!(await requisicao('GET', '/relatorios/faturas', tokenB)).cartoes.some(c => c.id === cartao.id));
    });

    await registrar('Exclusao individual e grupo: 204 vazio e confirmacao no banco', async () => {
        assert.equal(await requisicao('DELETE', '/lancamentos/' + compra.id, tokenA, undefined, 204), null);
        await requisicao('GET', '/lancamentos/' + compra.id, tokenA, undefined, 404);
        const [restantes] = await pool.query('SELECT id FROM lancamentos WHERE grupo_parcelamento = ?', [compra.grupoParcelamento]);
        assert.equal(restantes.length, 6);
        assert.equal(await requisicao('DELETE', '/lancamentos/' + restantes[0].id + '?todasParcelas=true', tokenA, undefined, 204), null);
        const [[contagem]] = await pool.query('SELECT COUNT(*) AS n FROM lancamentos WHERE grupo_parcelamento = ?', [compra.grupoParcelamento]);
        assert.equal(contagem.n, 0);
        await requisicao('DELETE', '/lancamentos/' + restantes[0].id, tokenA, undefined, 404);
    });

    await registrar('Concorrencia: categoria e fonte versus criacao/edicao de lancamento', async () => {
        // Os dois ordenamentos sao exercitados com bloqueio real do cadastro.
        async function disputar(tipoRecurso, editar) {
            const categoria = await Categoria.criar(ana.id, { nome: `Concorrente ${tipoRecurso} ${editar}`, tipo: 'saida' });
            const fonte = await FonteDestino.criar(ana.id, { nome: `Fonte concorrente ${tipoRecurso} ${editar}`, tipo: 'cartao_credito', dia_fechamento: 10, dia_vencimento: 20, limite: '100.00' });
            const dados = { ...novoLancamento('saida', 1, '2026-11-12', categoria, fonte.id), parcelas: 2 };
            let id;
            if (editar) id = (await Lancamentos.create(dados, ana.id)).id;
            const bloqueio = await pool.getConnection();
            const getConnection = pool.getConnection;
            const operacoes = [];
            try {
                await bloqueio.beginTransaction();
                const tabela = tipoRecurso === 'categoria' ? 'categorias' : 'fontes_destinos';
                const chave = tipoRecurso === 'categoria' ? categoria : fonte.id;
                await bloqueio.query(`SELECT id FROM ${tabela} WHERE id = ? FOR UPDATE`, [chave]);
                const alterarCadastro = () => tipoRecurso === 'categoria'
                    ? Categoria.atualizar(categoria, ana.id, { nome: 'Tipo alterado', tipo: 'entrada' })
                    : FonteDestino.atualizar(ana.id, fonte.id, { tipo: 'conta', dia_fechamento: null, dia_vencimento: null, limite: null });
                const gravar = () => editar ? Lancamentos.update(id, ana.id, dados) : Lancamentos.create(dados, ana.id);
                // Confirma as duas operacoes com conexoes obtidas antes de liberar o bloqueio.
                let obtidas = 0;
                let prontas;
                const ambas = new Promise(resolve => { prontas = resolve; });
                pool.getConnection = async () => {
                    const conexao = await getConnection.call(pool);
                    if (++obtidas === 2) prontas();
                    return conexao;
                };
                operacoes.push(alterarCadastro(), gravar());
                const resultados = Promise.allSettled(operacoes);
                let timer;
                try {
                    await Promise.race([ambas, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Operacoes nao obtiveram conexao')), 5000); })]);
                } finally { clearTimeout(timer); }
                await bloqueio.commit();
                const final = await resultados;
                assert.ok(final.some(r => r.status === 'fulfilled'));
                for (const r of final.filter(r => r.status === 'rejected')) {
                    assert.ok([400, 409].includes(r.reason.status), 'Falha deve ser conflito ou validacao, sem erro SQL exposto');
                }
                const [[inconsistentes]] = await pool.query(`SELECT COUNT(*) AS n FROM lancamentos l
                    JOIN categorias c ON c.id = l.categoria_id
                    JOIN fontes_destinos f ON f.id = l.fonte_destino_id
                    WHERE l.usuario_id = ? AND (l.tipo <> c.tipo OR
                    (l.total_parcelas > 1 AND (l.tipo <> 'saida' OR f.tipo <> 'cartao_credito')))`, [ana.id]);
                assert.equal(inconsistentes.n, 0);
            } finally {
                pool.getConnection = getConnection;
                await bloqueio.rollback();
                bloqueio.release();
                await Promise.allSettled(operacoes);
            }
        }
        for (const recurso of ['categoria', 'fonte']) {
            for (const editar of [false, true]) await disputar(recurso, editar);
        }
    });

    await registrar('Relatorio de categorias delega ao mesmo calculo e periodo anterior', async () => {
        for (const [inicio, fim] of [['2026-11-01', '2026-11-30'], ['2026-11-10', '2026-11-15'], ['2027-01-01', '2027-01-31'], ['2024-02-01', '2024-02-29']]) {
            const anterior = periodoAnterior(inicio, fim);
            const esperado = await RelatorioCategoria.gerar(ana.id, inicio, fim, anterior.inicio, anterior.fim);
            assert.deepEqual(await Relatorio.categorias(ana.id, inicio, fim), esperado);
            assert.deepEqual(await requisicao('GET', `/relatorios/categorias?inicio=${inicio}&fim=${fim}`, tokenA), esperado);
        }
    });
};
