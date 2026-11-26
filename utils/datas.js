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
    const i = paraUTC(inicio);
    const f = paraUTC(fim);
    const fimAnterior = new Date(i.getTime() - DIA_MS);

    const dias = Math.round((f - i) / DIA_MS) + 1;
    return { inicio: iso(new Date(i.getTime() - dias * DIA_MS)), fim: iso(fimAnterior) };
}

module.exports = { dataValida, hojeISO, mesCorrente, periodoAnterior };