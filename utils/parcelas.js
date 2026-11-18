function dividirEmParcelas(valorTotal, quantidade) {
    const centavos = Math.round(valorTotal * 100);
    const base = Math.floor(centavos / quantidade);
    const resto = centavos - base * quantidade;
    return Array.from({ length: quantidade }, (_, i) => (base + (i === 0 ? resto : 0)) / 100);
}

module.exports = { dividirEmParcelas };