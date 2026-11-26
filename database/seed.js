// Usuários de teste (senha de ambos: Senha1234)
//  ana@email.com (id 1) e bruno@email.com (id 2)

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const mysql = require('mysql2');
const { configuracao } = require('./config');
const { dividirEmParcelas } = require('../utils/parcelas');

const SENHA = 'Senha1234';
const GRUPO_NOTEBOOK = '7f3c1d2e-5a4b-4c6d-8e9f-0a1b2c3d4e5f';
const GRUPO_CURSO = '2b9e6a10-3c7d-4f58-9a1e-6d4c8b2f7e31';
const GRUPO_GELADEIRA = 'c41d7e92-8b3a-4e65-a0f4-1d9b5c7e2a68';
const GRUPO_CELULAR = '9a5f3b27-6e1c-4d80-b7a2-4c8e1f6d9b05';

const CATEGORIAS = [
    ['Salário', 'entrada'], ['Outras entradas', 'entrada'],
    ['Alimentação', 'saida'], ['Moradia', 'saida'], ['Saúde', 'saida'],
    ['Mobilidade', 'saida'], ['Lazer', 'saida'], ['Educação', 'saida'], ['Outras saídas', 'saida'],
];

const usuarios = [
    { id: 1, nome: 'Ana Souza', email: 'ana@email.com', cpf: '52998224725' },
    { id: 2, nome: 'Bruno Lima', email: 'bruno@email.com', cpf: '11144477735' },
];

// id da categoria: 9 categorias por usuário, em sequência
const cat = (u, nome) => (u.id - 1) * 9 + CATEGORIAS.findIndex((c) => c[0] === nome) + 1;

// [id, usuario_id, nome, tipo, dia_fechamento, dia_vencimento, limite]
const fontes = [
    [1, 1, 'Conta corrente', 'conta', null, null, null],
    [2, 1, 'Salário', 'renda', null, null, null],
    [3, 1, 'Cartão Nubank', 'cartao_credito', 3, 10, 5000],
    [4, 1, 'Visa crédito', 'cartao_credito', 25, 5, 8000],
    [5, 1, 'Poupança', 'conta', null, null, null],
    [6, 2, 'Conta corrente', 'conta', null, null, null],
    [7, 2, 'Salário', 'renda', null, null, null],
    [8, 2, 'Cartão Nubank', 'cartao_credito', 3, 10, 3000],
];

const lancamentos = [];
function lancar(u, tipo, descricao, valor, data, categoria, fonteId, parcelas = 1, grupo = null) {
    dividirEmParcelas(valor, parcelas).forEach((v, i) => {
        lancamentos.push([u.id, tipo, descricao, v, data, cat(u, categoria), fonteId,
            i + 1, parcelas, parcelas > 1 ? grupo : null]);
    });
}

const [ana, bruno] = usuarios;
const meses = ['2026-09', '2026-10', '2026-11'];
const alimentacaoAna = [870.00, 980.50, 910.00];
const mobilidadeAna = [812.30, 769.50, 700.00];
const lazerAna = [150.00, 220.00, 180.00];
const alimentacaoBruno = [600.00, 640.00, 610.00];

meses.forEach((m, i) => {
    // Ana
    lancar(ana, 'entrada', 'Salário', 5200, `${m}-05`, 'Salário', 2);
    lancar(ana, 'saida', 'Aluguel', 1500, `${m}-10`, 'Moradia', 1);
    lancar(ana, 'saida', 'Supermercado', alimentacaoAna[i], `${m}-12`, 'Alimentação', 1);
    lancar(ana, 'saida', 'Transporte por aplicativo', mobilidadeAna[i], `${m}-15`, 'Mobilidade', 3);
    lancar(ana, 'saida', 'Cinema e restaurantes', lazerAna[i], `${m}-18`, 'Lazer', 4);
    // Bruno
    lancar(bruno, 'entrada', 'Salário', 3800, `${m}-05`, 'Salário', 7);
    lancar(bruno, 'saida', 'Aluguel', 1100, `${m}-10`, 'Moradia', 6);
    lancar(bruno, 'saida', 'Mercado', alimentacaoBruno[i], `${m}-12`, 'Alimentação', 6);
    lancar(bruno, 'saida', 'Combustível', 300, `${m}-16`, 'Mobilidade', 8);
});

// Ana: extras, cartão e compras parceladas
lancar(ana, 'entrada', 'Freelance', 800, '2026-10-18', 'Outras entradas', 1);
lancar(ana, 'entrada', 'Rendimento da poupança', 35, '2026-10-30', 'Outras entradas', 5);
lancar(ana, 'saida', 'Consulta médica', 120, '2026-10-15', 'Saúde', 1);
lancar(ana, 'saida', 'Notebook', 3000, '2026-10-28', 'Educação', 3, 10, GRUPO_NOTEBOOK);
lancar(ana, 'saida', 'Curso de inglês', 1000, '2026-09-15', 'Educação', 4, 4, GRUPO_CURSO);
lancar(ana, 'saida', 'Geladeira', 1800, '2026-11-20', 'Moradia', 4, 3, GRUPO_GELADEIRA);
// Bruno: compra parcelada no cartão
lancar(bruno, 'saida', 'Celular', 1200, '2026-11-10', 'Outras saídas', 8, 2, GRUPO_CELULAR);

async function gerarSql() {
    const hash = await bcrypt.hash(SENHA, 10);
    const f = mysql.format;
    // Sem USE: o banco deve ser selecionado explicitamente pelo executor.
    let sql = `-- Demonstracao ficticia; executar via npm run db:seed em banco vazio.
DELIMITER $$
CREATE PROCEDURE seed_financas_demo()
BEGIN
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;
    SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
    START TRANSACTION;
    IF EXISTS (SELECT id FROM usuarios) OR EXISTS (SELECT id FROM categorias)
       OR EXISTS (SELECT id FROM fontes_destinos) OR EXISTS (SELECT id FROM lancamentos) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Seed exige as quatro tabelas vazias; nenhum dado foi alterado.';
    END IF;
`;
    sql += f('INSERT INTO usuarios (id, nome, email, cpf, senha_hash) VALUES ?;\n',
        [usuarios.map((u) => [u.id, u.nome, u.email, u.cpf, hash])]);

    const categorias = usuarios.flatMap((u) =>
        CATEGORIAS.map(([nome, tipo]) => [cat(u, nome), u.id, nome, tipo]));
    sql += f('INSERT INTO categorias (id, usuario_id, nome, tipo) VALUES ?;\n', [categorias]);

    sql += f('INSERT INTO fontes_destinos (id, usuario_id, nome, tipo, dia_fechamento, dia_vencimento, limite) VALUES ?;\n', [fontes]);

    sql += f(`INSERT INTO lancamentos (usuario_id, tipo, descricao, valor, data, categoria_id,
    fonte_destino_id, parcela_atual, total_parcelas, grupo_parcelamento) VALUES ?;\n`, [lancamentos]);

    sql += '    COMMIT;\nEND$$\nDELIMITER ;\nCALL seed_financas_demo();\nDROP PROCEDURE seed_financas_demo;\n';
    return sql;
}

async function executarSeed(sql) {
    const banco = await require('mysql2/promise').createConnection({
        ...configuracao(), multipleStatements: true
    });
    let procedimentoCriado = false;
    try {
        // Executa separadamente para remover apenas a rotina criada nesta execucao.
        const procedimento = sql.slice(sql.indexOf('CREATE PROCEDURE'), sql.indexOf('END$$') + 3);
        await banco.query(procedimento);
        procedimentoCriado = true;
        await banco.query('CALL seed_financas_demo()');
        console.log('Dados ficticios de demonstracao inseridos.');
    } finally {
        try {
            if (procedimentoCriado) await banco.query('DROP PROCEDURE seed_financas_demo');
        } finally { await banco.end(); }
    }
}

async function main() {
    if (process.argv.includes('--gerar')) {
        fs.writeFileSync(path.join(__dirname, 'seed.sql'), await gerarSql());
        console.log('Arquivo database/seed.sql gerado, sem acessar o banco.');
        return;
    }
    await executarSeed(fs.readFileSync(path.join(__dirname, 'seed.sql'), 'utf8'));
}

if (require.main === module) main().catch(() => {
    console.error('Falha no seed: exige banco configurado vazio e permissao para criar rotinas. Nenhum dado existente deve ser removido.');
    process.exitCode = 1;
});
module.exports = { gerarSql, executarSeed };
