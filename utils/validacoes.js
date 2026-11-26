const ErroHttp = require('./erros');
const { dataValida } = require('./datas');

// Aceita número ou texto numérico (ex.: 7 ou "7"), nunca boolean/array/objeto
function ehNumeroOuTexto(valor) {
    return typeof valor === 'number' || (typeof valor === 'string' && valor.trim() !== '');
}

function idValido(valor) {
    if (!ehNumeroOuTexto(valor)) return false;
    const n = Number(valor);
    return Number.isInteger(n) && n > 0;
}

// Valida o corpo de POST/PUT de lançamentos. Lança ErroHttp 400 com todos os erros de uma vez.
function validarLancamento(corpo, comParcelas = false) {
    const c = corpo || {};
    const erros = {};

    if (!['entrada', 'saida'].includes(c.tipo)) {
        erros.tipo = 'Informe o tipo: "entrada" ou "saida".';
    }

    if (typeof c.descricao !== 'string' || c.descricao.trim() === '') {
        erros.descricao = 'Informe a descrição.';
    } else if (c.descricao.trim().length > 120) {
        erros.descricao = 'A descrição deve ter no máximo 120 caracteres.';
    }

    const valor = ehNumeroOuTexto(c.valor) ? Number(c.valor) : NaN;
    const centavos = Math.round(valor * 100);
    if (!Number.isFinite(valor) || centavos < 1 || valor >= 1e10) {
        erros.valor = 'O valor deve ser maior que zero.';
    }

    if (!dataValida(c.data)) {
        erros.data = 'Data inválida. Use o formato AAAA-MM-DD.';
    }

    if (!idValido(c.categoriaId)) erros.categoriaId = 'Informe a categoria.';
    if (!idValido(c.fonteDestinoId)) erros.fonteDestinoId = 'Informe a fonte/destino.';

    let parcelas = 1;
    if (comParcelas && c.parcelas !== undefined) {
        const n = ehNumeroOuTexto(c.parcelas) ? Number(c.parcelas) : NaN;
        if (!Number.isInteger(n) || n < 1 || n > 48) {
            erros.parcelas = 'A quantidade de parcelas deve estar entre 1 e 48.';
        } else {
            parcelas = n;
        }
    }

    if (Object.keys(erros).length > 0) {
        throw new ErroHttp(400, 'Dados inválidos.', erros);
    }

    return {
        tipo: c.tipo,
        descricao: c.descricao.trim(),
        valor: centavos / 100,
        data: c.data,
        categoriaId: Number(c.categoriaId),
        fonteDestinoId: Number(c.fonteDestinoId),
        parcelas,
    };
}

module.exports = { idValido, validarLancamento };
