const ErroHttp = require('./erros');

function dividirEmParcelas(valorTotal, quantidade) {
    const centavos = Math.round(valorTotal * 100);
    const base = Math.floor(centavos / quantidade);
    if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > 48 || base < 1) {
        throw new ErroHttp(400, 'Dados inválidos.', {
            parcelas: 'Cada parcela deve ter pelo menos um centavo; reduza a quantidade de parcelas.'
        });
    }
    const resto = centavos - base * quantidade;
    return Array.from({ length: quantidade }, (_, i) => (base + (i === 0 ? resto : 0)) / 100);
}

module.exports = { dividirEmParcelas };