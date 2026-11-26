// Testa TODAS as rotas da API (auth, categorias, fontes-destinos, lancamentos, relatorios).
// Pré-requisitos: banco novo com npm run db:init + npm run db:seed, API rodando (npm run dev).
// Uso: npm run test:rotas     (ou: node testes/smoke.js)
// Variável opcional: BASE_URL (padrão http://localhost:3000)
// Faz login sozinho com os usuários do seed (senha Senha1234): bruno@email.com (id 2) e ana@email.com (id 1).
// Limpa o que cria, exceto o usuário novo do teste de cadastro (não existe rota de exclusão de usuário);
// cada execução cria um usuário com e-mail/CPF únicos, então pode rodar várias vezes.
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const SENHA = 'Senha1234';

// IDs fixos do seed
const CAT_ENTRADA = 10, CAT_SAIDA = 12;          // Bruno: Salário, Alimentação
const FONTE_CONTA = 6, FONTE_CARTAO = 8;         // Bruno: Conta corrente, Cartão Nubank
const CAT_ANA = 3, FONTE_ANA = 1;                // pertencem à Ana
const DATA = '2026-11-20';

async function chamar(metodo, caminho, { corpo, token, bruto } = {}) {
    const headers = {};
    if (corpo !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    const r = await fetch(BASE + caminho, {
        method: metodo, headers,
        signal: AbortSignal.timeout(10000),
        body: corpo === undefined ? undefined : (bruto ? corpo : JSON.stringify(corpo)),
    });
    const texto = await r.text();
    let json = null;
    try { json = texto ? JSON.parse(texto) : null; } catch { /* corpo vazio ou não-JSON */ }
    return { status: r.status, json, texto };
}

let ok = 0, falhas = 0;
async function teste(nome, fn) {
    try { await fn(); ok++; console.log(`  OK     ${nome}`); }
    catch (e) { falhas++; console.log(`  FALHOU ${nome}\n         -> ${e.message}`); }
}
const esperar = (cond, msg) => { if (!cond) throw new Error(msg); };
const status = (r, esperado) => esperar(r.status === esperado, `status ${r.status} (esperado ${esperado}) — ${r.texto.slice(0, 220)}`);
const erroPadrao = (r, codigo) => { status(r, codigo); esperar(r.json && typeof r.json.erro === 'string', 'resposta de erro sem o campo "erro" em JSON'); };
const comCampo = (r, campo) => { status(r, 400); esperar(r.json && r.json.campos && r.json.campos[campo], `esperava campos.${campo}, veio ${r.texto.slice(0, 200)}`); };
const semSenhaHash = (r) => esperar(!/senha_hash|senhaHash/i.test(r.texto), 'a resposta contém senha_hash');
const dadosDe = (r) => (r.json && r.json.dados !== undefined ? r.json.dados : r.json); // fontes devolvem { dados }

function gerarCpf() {
    const dv = (a) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * (a.length + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
    const d = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
    d.push(dv(d)); d.push(dv(d));
    const c = d.join('');
    return /^(\d)\1{10}$/.test(c) ? gerarCpf() : c;
}
const formatarCpf = (c) => `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}`;

(async () => {
    console.log(`Testando ${BASE}\n`);

    // ---------- login com os usuários do seed ----------
    const lb = await chamar('POST', '/auth/login', { corpo: { email: 'bruno@email.com', senha: SENHA } });
    const la = await chamar('POST', '/auth/login', { corpo: { email: 'ana@email.com', senha: SENHA } });
    if (lb.status !== 200 || la.status !== 200 || !lb.json?.token || !la.json?.token) {
        console.log(`Não foi possível entrar com os usuários do seed (login Bruno: ${lb.status}, Ana: ${la.status}).`);
        console.log('Rode "npm run db:init" e "npm run db:seed" em um banco vazio e confira o .env (JWT_SECRET preenchido).');
        process.exitCode = 1;
        return;
    }
    const T = lb.json.token;      // Bruno (id 2)
    const TA = la.json.token;     // Ana (id 1)

    // ---------- AUTH ----------
    console.log('Auth');
    const cpf = gerarCpf();
    const email = `teste.${Date.now()}@email.com`;
    let tokenNovo;
    await teste('POST /auth/cadastro → 201 com id, nome e email (sem senha_hash)', async () => {
        const r = await chamar('POST', '/auth/cadastro', { corpo: { nome: 'Usuário Teste', email, cpf: formatarCpf(cpf), senha: SENHA } });
        status(r, 201); semSenhaHash(r);
        esperar(r.json.id && r.json.nome === 'Usuário Teste' && r.json.email === email, 'corpo inesperado');
    });
    await teste('Cadastro com o MESMO e-mail em MAIÚSCULAS → 409 indicando email', async () => {
        const r = await chamar('POST', '/auth/cadastro', { corpo: { nome: 'X', email: email.toUpperCase(), cpf: gerarCpf(), senha: SENHA } });
        status(r, 409); esperar(r.json.campos && r.json.campos.email, 'campos.email ausente');
    });
    await teste('Cadastro com o MESMO CPF (sem pontuação) → 409 indicando cpf', async () => {
        const r = await chamar('POST', '/auth/cadastro', { corpo: { nome: 'X', email: `outro.${Date.now()}@email.com`, cpf, senha: SENHA } });
        status(r, 409); esperar(r.json.campos && r.json.campos.cpf, 'campos.cpf ausente');
    });
    await teste('Cadastro inválido → 400 com campos (e-mail, CPF, senha curta, senha sem número, vazio)', async () => {
        const base = { nome: 'X', email: `v.${Date.now()}@email.com`, cpf: gerarCpf(), senha: SENHA };
        comCampo(await chamar('POST', '/auth/cadastro', { corpo: { ...base, email: 'sem-arroba' } }), 'email');
        comCampo(await chamar('POST', '/auth/cadastro', { corpo: { ...base, cpf: '529.982.247-24' } }), 'cpf');
        comCampo(await chamar('POST', '/auth/cadastro', { corpo: { ...base, senha: 'abc12' } }), 'senha');
        comCampo(await chamar('POST', '/auth/cadastro', { corpo: { ...base, senha: 'somenteletras' } }), 'senha');
        comCampo(await chamar('POST', '/auth/cadastro', { corpo: { ...base, nome: '' } }), 'nome');
        status(await chamar('POST', '/auth/cadastro', { corpo: {} }), 400);
    });
    await teste('POST /auth/login → 200 com token e usuário (sem senha_hash)', async () => {
        const r = await chamar('POST', '/auth/login', { corpo: { email: email.toUpperCase(), senha: SENHA } });
        status(r, 200); semSenhaHash(r);
        esperar(r.json.token && r.json.usuario && r.json.usuario.email === email, 'sem token/usuário');
        tokenNovo = r.json.token;
    });
    await teste('Login com senha errada e com e-mail inexistente → 401 com a MESMA mensagem', async () => {
        const a = await chamar('POST', '/auth/login', { corpo: { email, senha: 'SenhaErrada9' } });
        const b = await chamar('POST', '/auth/login', { corpo: { email: `nao.existe.${Date.now()}@email.com`, senha: SENHA } });
        erroPadrao(a, 401); erroPadrao(b, 401);
        esperar(a.json.erro === b.json.erro, 'mensagens diferentes revelam se o e-mail existe');
    });
    await teste('Login com corpo inválido → 400', async () => {
        status(await chamar('POST', '/auth/login', { corpo: {} }), 400);
    });
    await teste('GET /auth/me → 200 com os dados do dono do token (sem senha_hash)', async () => {
        const r = await chamar('GET', '/auth/me', { token: tokenNovo }); status(r, 200); semSenhaHash(r);
        esperar(r.json.email === email, 'não devolveu o usuário do token');
    });
    await teste('Sem token / token inválido → 401 em JSON (não HTML)', async () => {
        for (const t of [undefined, 'abc.def.ghi']) {
            const r = await chamar('GET', '/auth/me', { token: t }); erroPadrao(r, 401);
        }
    });
    await teste('Usuário novo recebeu 9 categorias padrão e a fonte "Conta corrente"', async () => {
        const c = await chamar('GET', '/categorias', { token: tokenNovo }); status(c, 200);
        esperar(Array.isArray(c.json) && c.json.length === 9, `${c.json && c.json.length} categorias (esperado 9)`);
        const f = await chamar('GET', '/fontes-destinos', { token: tokenNovo }); status(f, 200);
        const lista = dadosDe(f);
        esperar(lista.length === 1 && lista[0].nome === 'Conta corrente', 'fonte padrão ausente');
    });

    // ---------- CATEGORIAS ----------
    console.log('\nCategorias');
    let idCat;
    await teste('GET /categorias e filtro ?tipo=saida', async () => {
        const r = await chamar('GET', '/categorias', { token: T }); status(r, 200);
        esperar(r.json.length >= 9, 'poucas categorias (seed?)');
        const s = await chamar('GET', '/categorias?tipo=saida', { token: T }); status(s, 200);
        esperar(s.json.length > 0 && s.json.every(c => c.tipo === 'saida'), 'filtro não funcionou');
        erroPadrao(await chamar('GET', '/categorias?tipo=xyz', { token: T }), 400);
    });
    await teste('POST /categorias → 201; nome repetido no mesmo tipo → 409; mesmo nome em outro tipo → 201', async () => {
        const r = await chamar('POST', '/categorias', { token: T, corpo: { nome: 'TESTE categoria', tipo: 'saida' } });
        status(r, 201); idCat = r.json.id; esperar(idCat, 'sem id');
        erroPadrao(await chamar('POST', '/categorias', { token: T, corpo: { nome: 'TESTE categoria', tipo: 'saida' } }), 409);
        const outro = await chamar('POST', '/categorias', { token: T, corpo: { nome: 'TESTE categoria', tipo: 'entrada' } });
        status(outro, 201);
        status(await chamar('DELETE', `/categorias/${outro.json.id}`, { token: T }), 204);
    });
    await teste('POST /categorias inválido → 400', async () => {
        status(await chamar('POST', '/categorias', { token: T, corpo: { nome: '', tipo: 'saida' } }), 400);
        status(await chamar('POST', '/categorias', { token: T, corpo: { nome: 'x', tipo: 'outro' } }), 400);
        status(await chamar('POST', '/categorias', { token: T, corpo: {} }), 400);
    });
    await teste('PUT /categorias/:id → 200; inexistente, de outro usuário → 404; id inválido → 400', async () => {
        const r = await chamar('PUT', `/categorias/${idCat}`, { token: T, corpo: { nome: 'TESTE renomeada', tipo: 'saida' } });
        status(r, 200); esperar(r.json.nome === 'TESTE renomeada', 'não renomeou');
        erroPadrao(await chamar('PUT', '/categorias/999999', { token: T, corpo: { nome: 'x', tipo: 'saida' } }), 404);
        erroPadrao(await chamar('PUT', `/categorias/${CAT_ANA}`, { token: T, corpo: { nome: 'invasão', tipo: 'saida' } }), 404);
        status(await chamar('PUT', '/categorias/abc', { token: T, corpo: { nome: 'x', tipo: 'saida' } }), 400);
    });
    await teste('DELETE /categorias/:id → 204; de outro usuário → 404; com lançamentos vinculados → 409', async () => {
        erroPadrao(await chamar('DELETE', `/categorias/${CAT_ANA}`, { token: T }), 404);
        erroPadrao(await chamar('DELETE', `/categorias/${CAT_SAIDA}`, { token: T }), 409);
        const r = await chamar('DELETE', `/categorias/${idCat}`, { token: T }); status(r, 204);
        esperar(r.texto === '', '204 deve vir sem corpo');
        erroPadrao(await chamar('DELETE', `/categorias/${idCat}`, { token: T }), 404);
    });

    // ---------- FONTES / DESTINOS ----------
    console.log('\nFontes e destinos');
    let idFonte, idCartao;
    await teste('GET /fontes-destinos → 200 só com as fontes do usuário', async () => {
        const r = await chamar('GET', '/fontes-destinos', { token: T }); status(r, 200);
        const lista = dadosDe(r);
        esperar(Array.isArray(lista) && lista.length >= 3, 'poucas fontes (seed?)');
        esperar(lista.every(f => [6, 7, 8].includes(f.id) || f.nome.startsWith('TESTE')), 'apareceram fontes de outro usuário');
    });
    await teste('POST conta → 201; nome repetido → 409', async () => {
        const r = await chamar('POST', '/fontes-destinos', { token: T, corpo: { nome: 'TESTE conta', tipo: 'conta' } });
        status(r, 201); idFonte = dadosDe(r).id; esperar(idFonte, 'sem id');
        erroPadrao(await chamar('POST', '/fontes-destinos', { token: T, corpo: { nome: 'TESTE conta', tipo: 'conta' } }), 409);
    });
    await teste('POST cartão completo → 201', async () => {
        const r = await chamar('POST', '/fontes-destinos', { token: T, corpo: { nome: 'TESTE cartão', tipo: 'cartao_credito', dia_fechamento: 10, dia_vencimento: 17, limite: '2500.00' } });
        status(r, 201); idCartao = dadosDe(r).id; esperar(idCartao, 'sem id');
    });
    await teste('POST inválido → 400 (tipo, cartão sem dias/limite, dia 32, limite 0)', async () => {
        const p = (corpo) => chamar('POST', '/fontes-destinos', { token: T, corpo });
        erroPadrao(await p({ nome: 'x', tipo: 'poupanca' }), 400);
        erroPadrao(await p({ nome: 'TESTE x', tipo: 'cartao_credito' }), 400);
        erroPadrao(await p({ nome: 'TESTE x', tipo: 'cartao_credito', dia_fechamento: 32, dia_vencimento: 5, limite: '100.00' }), 400);
        erroPadrao(await p({ nome: 'TESTE x', tipo: 'cartao_credito', dia_fechamento: 5, dia_vencimento: 10, limite: '0' }), 400);
        erroPadrao(await p({ nome: '', tipo: 'conta' }), 400);
    });
    await teste('POST cartão com limite NUMÉRICO → 201, decimal normalizado e limpeza', async () => {
        const r = await chamar('POST', '/fontes-destinos', { token: T, corpo: { nome: 'TESTE limite numérico', tipo: 'cartao_credito', dia_fechamento: 1, dia_vencimento: 8, limite: 2500.50 } });
        status(r, 201);
        const cartao = dadosDe(r);
        try {
            esperar(cartao.limite === '2500.50', 'limite numérico não normalizado');
            const salvo = await chamar('GET', `/fontes-destinos/${cartao.id}`, { token: T });
            status(salvo, 200);
            esperar(dadosDe(salvo).limite === '2500.50', 'limite numérico não persistido');
        } finally {
            status(await chamar('DELETE', `/fontes-destinos/${cartao.id}`, { token: T }), 204);
        }
    });
    await teste('GET /fontes-destinos/:id → 200; de outro usuário → 404; id inválido → 400', async () => {
        status(await chamar('GET', `/fontes-destinos/${idFonte}`, { token: T }), 200);
        erroPadrao(await chamar('GET', `/fontes-destinos/${FONTE_ANA}`, { token: T }), 404);
        erroPadrao(await chamar('GET', '/fontes-destinos/abc', { token: T }), 400);
    });
    await teste('PUT /fontes-destinos/:id → 200; de outro usuário → 404', async () => {
        const r = await chamar('PUT', `/fontes-destinos/${idFonte}`, { token: T, corpo: { nome: 'TESTE conta renomeada' } });
        status(r, 200); esperar(dadosDe(r).nome === 'TESTE conta renomeada', 'não renomeou');
        erroPadrao(await chamar('PUT', `/fontes-destinos/${FONTE_ANA}`, { token: T, corpo: { nome: 'invasão' } }), 404);
    });
    await teste('DELETE /fontes-destinos/:id → 204; em uso (com lançamentos) → 409; de outro usuário → 404', async () => {
        erroPadrao(await chamar('DELETE', `/fontes-destinos/${FONTE_CONTA}`, { token: T }), 409);
        erroPadrao(await chamar('DELETE', `/fontes-destinos/${FONTE_ANA}`, { token: T }), 404);
        status(await chamar('DELETE', `/fontes-destinos/${idFonte}`, { token: T }), 204);
        status(await chamar('DELETE', `/fontes-destinos/${idCartao}`, { token: T }), 204);
        erroPadrao(await chamar('DELETE', `/fontes-destinos/${idFonte}`, { token: T }), 404);
    });

    // ---------- LANÇAMENTOS ----------
    console.log('\nLançamentos');
    let idSimples, idParcela, idAna;
    await teste('GET /lancamentos (mês corrente) tem periodo, resumo, pagina e itens', async () => {
        const r = await chamar('GET', '/lancamentos', { token: T }); status(r, 200);
        for (const k of ['periodo', 'resumo', 'pagina', 'totalPaginas', 'itens']) esperar(k in r.json, `falta "${k}"`);
        for (const k of ['entradas', 'saidas', 'saldo']) esperar(typeof r.json.resumo[k] === 'number', `resumo.${k} não é número`);
    });
    await teste('GET /lancamentos com filtros e paginação', async () => {
        const r = await chamar('GET', `/lancamentos?inicio=2026-09-01&fim=2026-11-30&tipo=saida&categoriaId=${CAT_SAIDA}&fonteDestinoId=${FONTE_CONTA}&pagina=1`, { token: T });
        status(r, 200);
        esperar(r.json.itens.length > 0, 'nenhum item (o seed foi executado?)');
        esperar(r.json.itens.every(i => i.tipo === 'saida' && i.categoria.id === CAT_SAIDA && i.fonteDestino.id === FONTE_CONTA), 'item fora do filtro');
        esperar(typeof r.json.itens[0].valor === 'number' && /^\d{4}-\d{2}-\d{2}$/.test(r.json.itens[0].data), 'valor/data em formato errado');
        const a = await chamar('GET', '/lancamentos?inicio=2026-09-01&fim=2026-11-30', { token: TA }); status(a, 200);
        idAna = a.json.itens[0] && a.json.itens[0].id; esperar(idAna, 'Ana sem lançamentos (seed?)');
    });
    await teste('GET /lancamentos com tipo inválido, período invertido e página 0 → 400', async () => {
        status(await chamar('GET', '/lancamentos?tipo=xyz', { token: T }), 400);
        status(await chamar('GET', '/lancamentos?inicio=2026-11-30&fim=2026-11-01', { token: T }), 400);
        status(await chamar('GET', '/lancamentos?pagina=0', { token: T }), 400);
    });
    await teste('POST /lancamentos simples → 201; GET /:id → 200', async () => {
        const r = await chamar('POST', '/lancamentos', { token: T, corpo: { tipo: 'saida', descricao: 'TESTE simples', valor: 45.9, data: DATA, categoriaId: CAT_SAIDA, fonteDestinoId: FONTE_CONTA } });
        status(r, 201); idSimples = r.json.id; esperar(idSimples, 'sem id');
        const g = await chamar('GET', `/lancamentos/${idSimples}`, { token: T }); status(g, 200);
        esperar(g.json.valor === 45.9 && g.json.parcela === '1/1' && g.json.categoria.id === CAT_SAIDA, 'conteúdo inesperado');
    });
    await teste('PUT /lancamentos/:id → 200 e altera os dados', async () => {
        const r = await chamar('PUT', `/lancamentos/${idSimples}`, { token: T, corpo: { tipo: 'saida', descricao: 'TESTE atualizado', valor: 50, data: DATA, categoriaId: CAT_SAIDA, fonteDestinoId: FONTE_CONTA } });
        status(r, 200);
        const salvo = await chamar('GET', `/lancamentos/${idSimples}`, { token: T });
        status(salvo, 200);
        esperar(salvo.json.descricao === 'TESTE atualizado' && salvo.json.valor === 50, 'não persistiu a atualização');
    });
    await teste('POST parcelado (R$ 100 em 3x no cartão) → 33,34 + 33,33 + 33,33 com o mesmo grupo', async () => {
        status(await chamar('POST', '/lancamentos', { token: T, corpo: { tipo: 'saida', descricao: 'TESTE parcelado', valor: 100, data: DATA, categoriaId: CAT_SAIDA, fonteDestinoId: FONTE_CARTAO, parcelas: 3 } }), 201);
        const l = await chamar('GET', `/lancamentos?inicio=${DATA}&fim=${DATA}&fonteDestinoId=${FONTE_CARTAO}`, { token: T }); status(l, 200);
        const ps = l.json.itens.filter(i => i.descricao === 'TESTE parcelado').sort((a, b) => a.id - b.id);
        esperar(ps.length === 3, `${ps.length} parcelas (esperado 3)`);
        esperar(JSON.stringify(ps.map(p => p.valor)) === '[33.34,33.33,33.33]', `valores ${ps.map(p => p.valor)}`);
        esperar(ps.map(p => p.parcela).join() === '1/3,2/3,3/3', 'parcelas fora de ordem');
        esperar(ps[0].grupoParcelamento && new Set(ps.map(p => p.grupoParcelamento)).size === 1, 'grupo_parcelamento diferente');
        idParcela = ps[1].id;
    });
    await teste('Validações do POST → 400 com campos', async () => {
        const base = { tipo: 'saida', descricao: 'x', valor: 10, data: DATA, categoriaId: CAT_SAIDA, fonteDestinoId: FONTE_CONTA };
        const casos = [
            [{ ...base, categoriaId: CAT_ENTRADA }, 'categoriaId'],   // saída com categoria de entrada
            [{ ...base, valor: 0 }, 'valor'], [{ ...base, valor: -5 }, 'valor'],
            [{ ...base, data: '2026-02-30' }, 'data'], [{ ...base, tipo: 'outro' }, 'tipo'],
            [{ ...base, descricao: '   ' }, 'descricao'], [{ ...base, parcelas: 49 }, 'parcelas'],
            [{ ...base, parcelas: 2 }, 'parcelas'],                    // parcelar fora do cartão
        ];
        for (const [corpo, campo] of casos) comCampo(await chamar('POST', '/lancamentos', { token: T, corpo }), campo);
        status(await chamar('POST', '/lancamentos', { token: T, corpo: {} }), 400);
    });
    await teste('Categoria / fonte de outro usuário ou inexistente → 404', async () => {
        const base = { tipo: 'saida', descricao: 'x', valor: 10, data: DATA, categoriaId: CAT_SAIDA, fonteDestinoId: FONTE_CONTA };
        status(await chamar('POST', '/lancamentos', { token: T, corpo: { ...base, categoriaId: CAT_ANA } }), 404);
        status(await chamar('POST', '/lancamentos', { token: T, corpo: { ...base, fonteDestinoId: FONTE_ANA } }), 404);
        status(await chamar('POST', '/lancamentos', { token: T, corpo: { ...base, categoriaId: 999999 } }), 404);
    });
    await teste('ID inexistente → 404; ID inválido → 400', async () => {
        status(await chamar('GET', '/lancamentos/999999', { token: T }), 404);
        status(await chamar('PUT', '/lancamentos/999999', { token: T, corpo: { tipo: 'saida', descricao: 'x', valor: 1, data: DATA, categoriaId: CAT_SAIDA, fonteDestinoId: FONTE_CONTA } }), 404);
        status(await chamar('DELETE', '/lancamentos/999999', { token: T }), 404);
        status(await chamar('GET', '/lancamentos/abc', { token: T }), 400);
    });
    await teste('Isolamento: lançamento da Ana → 404 em GET, PUT e DELETE para o Bruno', async () => {
        status(await chamar('GET', `/lancamentos/${idAna}`, { token: T }), 404);
        status(await chamar('PUT', `/lancamentos/${idAna}`, { token: T, corpo: { tipo: 'saida', descricao: 'x', valor: 1, data: DATA, categoriaId: CAT_SAIDA, fonteDestinoId: FONTE_CONTA } }), 404);
        status(await chamar('DELETE', `/lancamentos/${idAna}`, { token: T }), 404);
        status(await chamar('GET', `/lancamentos/${idAna}`, { token: TA }), 200); // continua existindo para a dona
    });
    await teste('DELETE de uma parcela → 204 e as outras permanecem', async () => {
        const r = await chamar('DELETE', `/lancamentos/${idParcela}`, { token: T }); status(r, 204);
        esperar(r.texto === '', '204 deve vir sem corpo');
        const l = await chamar('GET', `/lancamentos?inicio=${DATA}&fim=${DATA}&fonteDestinoId=${FONTE_CARTAO}`, { token: T });
        esperar(l.json.itens.filter(i => i.descricao === 'TESTE parcelado').length === 2, 'deveriam restar 2 parcelas');
    });
    await teste('DELETE ?todasParcelas=true → 204 e remove o grupo inteiro', async () => {
        const l = await chamar('GET', `/lancamentos?inicio=${DATA}&fim=${DATA}&fonteDestinoId=${FONTE_CARTAO}`, { token: T });
        const restante = l.json.itens.find(i => i.descricao === 'TESTE parcelado');
        status(await chamar('DELETE', `/lancamentos/${restante.id}?todasParcelas=true`, { token: T }), 204);
        const d = await chamar('GET', `/lancamentos?inicio=${DATA}&fim=${DATA}&fonteDestinoId=${FONTE_CARTAO}`, { token: T });
        esperar(!d.json.itens.some(i => i.descricao === 'TESTE parcelado'), 'ainda há parcelas');
    });
    await teste('DELETE do lançamento simples (limpeza) → 204', async () => {
        status(await chamar('DELETE', `/lancamentos/${idSimples}`, { token: T }), 204);
        status(await chamar('GET', `/lancamentos/${idSimples}`, { token: T }), 404);
    });

    // ---------- RELATÓRIOS ----------
    console.log('\nRelatórios');
    await teste('GET /relatorios/categorias → saídas, entradas, % e período anterior', async () => {
        const r = await chamar('GET', '/relatorios/categorias?inicio=2026-10-01&fim=2026-10-31', { token: T }); status(r, 200);
        esperar(r.json.periodoAnterior.inicio === '2026-09-01' && r.json.periodoAnterior.fim === '2026-09-30', 'período anterior errado');
        const cats = r.json.saidas.categorias;
        esperar(cats.length > 0, 'sem saídas (seed?)');
        esperar(cats.every((c, i) => i === 0 || cats[i - 1].total >= c.total), 'fora de ordem decrescente');
        esperar(Math.abs(cats.reduce((s, c) => s + c.percentual, 0) - 100) < 0.1, 'percentuais não somam 100');
        esperar(typeof cats[0].total === 'number' && 'anterior' in cats[0] && 'variacao' in cats[0], 'campos/tipos errados');
    });
    await teste('GET /relatorios/categorias sem período / invertido → 400', async () => {
        status(await chamar('GET', '/relatorios/categorias', { token: T }), 400);
        status(await chamar('GET', '/relatorios/categorias?inicio=2026-10-31&fim=2026-10-01', { token: T }), 400);
    });
    await teste('GET /relatorios/fontes-destinos → entradas, saídas e saldo das contas', async () => {
        const r = await chamar('GET', '/relatorios/fontes-destinos?inicio=2026-11-01&fim=2026-11-30', { token: T }); status(r, 200);
        for (const k of ['entradas', 'saidas', 'contas']) esperar(k in r.json, `falta "${k}"`);
        esperar(r.json.contas.length > 0 && r.json.contas.every(c => Math.abs(c.saldo - (c.entradas - c.saidas)) < 0.005), 'saldo ≠ entradas − saídas');
        status(await chamar('GET', '/relatorios/fontes-destinos', { token: T }), 400);
        status(await chamar('GET', '/relatorios/fontes-destinos?inicio=2026-11-30&fim=2026-11-01', { token: T }), 400);
    });
    await teste('GET /relatorios/faturas → limite, fatura atual e próximas; meses=1', async () => {
        const r = await chamar('GET', '/relatorios/faturas', { token: T }); status(r, 200);
        esperar(r.json.cartoes.length > 0, 'sem cartões (seed?)');
        const c = r.json.cartoes[0];
        esperar(c.proximasFaturas.length === 3 && c.faturaAtual.referencia, 'esperava fatura atual + 3 próximas');
        esperar(Math.abs(c.limite.total - c.limite.utilizado - c.limite.disponivel) < 0.005, 'limite inconsistente');
        const um = await chamar('GET', '/relatorios/faturas?meses=1', { token: T }); status(um, 200);
        esperar(um.json.cartoes[0].proximasFaturas.length === 1, 'meses=1 deveria trazer 1 próxima');
    });
    await teste('GET /relatorios/faturas?meses inválido → 400', async () => {
        for (const m of ['0', '13', 'abc']) status(await chamar('GET', `/relatorios/faturas?meses=${m}`, { token: T }), 400);
    });

    // ---------- GERAL ----------
    console.log('\nGeral');
    await teste('Todas as rotas protegidas sem token → 401 em JSON', async () => {
        const rotas = ['/categorias', '/fontes-destinos', '/lancamentos', '/lancamentos/1', '/relatorios/faturas',
            '/relatorios/categorias?inicio=2026-10-01&fim=2026-10-31', '/relatorios/fontes-destinos?inicio=2026-10-01&fim=2026-10-31'];
        for (const rota of rotas) erroPadrao(await chamar('GET', rota), 401);
        erroPadrao(await chamar('POST', '/lancamentos', { corpo: {} }), 401);
        erroPadrao(await chamar('POST', '/categorias', { corpo: {} }), 401);
    });
    await teste('Rota inexistente → 404 em JSON', async () => erroPadrao(await chamar('GET', '/nao-existe', { token: T }), 404));
    await teste('JSON malformado → 400 em JSON', async () => erroPadrao(await chamar('POST', '/lancamentos', { token: T, corpo: '{quebrado', bruto: true }), 400));

    console.log(`\n${ok} passaram, ${falhas} falharam.`);
    process.exitCode = falhas ? 1 : 0;
})().catch((e) => { console.error(`Não foi possível chamar a API em ${BASE}: ${e.message}`); process.exitCode = 1; });