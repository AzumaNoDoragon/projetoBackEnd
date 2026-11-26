const test = require('node:test');
const assert = require('node:assert/strict');
const { dividirEmParcelas } = require('../utils/parcelas');
const { periodoAnterior } = require('../utils/datas');
const { calcularFatura } = require('../utils/faturas');
const { nomeBanco, identificadorBanco } = require('../database/config');

test('Parcelas preservam centavos, resto na primeira e rejeitam parcela zero', () => {
    assert.deepEqual(dividirEmParcelas(250, 7), [35.74, 35.71, 35.71, 35.71, 35.71, 35.71, 35.71]);
    assert.deepEqual(dividirEmParcelas(0.02, 2), [0.01, 0.01]);
    assert.throws(() => dividirEmParcelas(0.01, 2), e => e.status === 400);
    for (let n = 1; n <= 48; n++) {
        const valores = dividirEmParcelas(123.45, n);
        assert.equal(valores.reduce((s, v) => s + Math.round(v * 100), 0), 12345);
        assert.ok(valores.every(v => v >= 0.01));
    }
});

for (const [inicio, fim, anteriorInicio, anteriorFim] of require('./periodos.cjs')) {
    test(`Periodo anterior: meses completos ou dias parciais de ${inicio} a ${fim}`, () => {
        assert.deepEqual(periodoAnterior(inicio, fim), { inicio: anteriorInicio, fim: anteriorFim });
    });
}

test('Periodo anterior rejeita datas invalidas, ordem e saida da faixa aceita', () => {
    for (const [inicio, fim] of [['2026-02-30', '2026-03-01'], ['2026-11-30', '2026-11-01'],
        ['1000-01-01', '1000-01-31'], ['1000-01-01', '1000-01-02'], ['0999-12-31', '1000-01-01'], ['9999-12-31', '10000-01-01']]) {
        assert.throws(() => periodoAnterior(inicio, fim), e => e.status === 400);
    }
});

test('Faturas: fechamento inclusive, dezembro, fevereiro comum e bissexto', () => {
    const cartao = { diaFechamento: 31, diaVencimento: 5 };
    assert.equal(calcularFatura('2026-12-30', cartao).vencimento, '2027-01-05');
    assert.equal(calcularFatura('2026-12-31', cartao).vencimento, '2027-02-05');
    assert.equal(calcularFatura('2025-02-27', cartao).fechamento, '2025-02-28');
    assert.equal(calcularFatura('2025-02-28', cartao).fechamento, '2025-03-31');
    assert.equal(calcularFatura('2024-02-28', cartao).fechamento, '2024-02-29');
    assert.equal(calcularFatura('2024-02-29', cartao).fechamento, '2024-03-31');
});

test('DB_NAME valido e escapado como identificador; rejeita SQL e nomes invalidos', () => {
    const anterior = process.env.DB_NAME;
    try {
        process.env.DB_NAME = 'teste-financas_2026';
        assert.equal(identificadorBanco(), '`teste-financas_2026`');
        for (const nome of ['', 'a'.repeat(65), 'teste`; DROP DATABASE financas;--', '../financas', 'nome com espaco', '-teste']) {
            process.env.DB_NAME = nome;
            assert.throws(nomeBanco);
        }
    } finally {
        if (anterior === undefined) delete process.env.DB_NAME;
        else process.env.DB_NAME = anterior;
    }
});
