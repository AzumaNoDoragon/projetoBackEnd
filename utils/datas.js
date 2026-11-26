const ErroHttp = require('./erros');

const pad = (n) => String(n).padStart(2, '0');

function dataValida(texto) {
    if (typeof texto !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
        return false;
    }
    const [ano, mes, dia] = texto.split('-').map(Number);
    const d = new Date(Date.UTC(ano, mes - 1, dia));
    return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

function hojeISO() {
    const h = new Date();
    return `${h.getFullYear()}-${pad(h.getMonth() + 1)}-${pad(h.getDate())}`;
}

function mesCorrente() {
    const h = new Date();
    const ano = h.getFullYear();
    const mes = h.getMonth();
    const ultimo = new Date(ano, mes + 1, 0).getDate();
    return {
        inicio: `${ano}-${pad(mes + 1)}-01`,
        fim: `${ano}-${pad(mes + 1)}-${pad(ultimo)}`,
    };
}

const DIA_MS = 24 * 60 * 60 * 1000;
const paraUTC = (texto) => {
    const [a, m, d] = texto.split('-').map(Number);
    return new Date(Date.UTC(a, m - 1, d));
};
const iso = (d) => d.toISOString().slice(0, 10);

function periodoAnterior(inicio, fim) {
    if (!dataValida(inicio) || !dataValida(fim) || inicio > fim ||
        inicio < '1000-01-01' || fim > '9999-12-31') {
        throw new ErroHttp(400, 'Dados inválidos.', { periodo: 'Informe um período válido entre os anos 1000 e 9999.' });
    }
    const i = paraUTC(inicio);
    const f = paraUTC(fim);
    const fimAnterior = new Date(i.getTime() - DIA_MS);

    let inicioAnterior;
    const ultimoDia = new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth() + 1, 0)).getUTCDate();
    if (i.getUTCDate() === 1 && f.getUTCDate() === ultimoDia) {
        // Meses civis completos: compara a mesma quantidade de meses anteriores.
        const meses = (f.getUTCFullYear() - i.getUTCFullYear()) * 12 + f.getUTCMonth() - i.getUTCMonth() + 1;
        inicioAnterior = new Date(Date.UTC(i.getUTCFullYear(), i.getUTCMonth() - meses, 1));
    } else {
        // Periodos parciais: inclui as duas pontas e conserva a quantidade de dias.
        const dias = Math.round((f - i) / DIA_MS) + 1;
        inicioAnterior = new Date(i.getTime() - dias * DIA_MS);
    }
    if (inicioAnterior.getUTCFullYear() < 1000) {
        throw new ErroHttp(400, 'Dados inválidos.', { inicio: 'O período anterior deve permanecer a partir do ano 1000.' });
    }
    return { inicio: iso(inicioAnterior), fim: iso(fimAnterior) };
}

module.exports = { dataValida, hojeISO, mesCorrente, periodoAnterior };