const { randomUUID } = require('crypto');
const { pool } = require('../database/connection');
const ErroHttp = require('../utils/erros');
const { emTransacao } = require('../utils/transacao');
const { dividirEmParcelas } = require('../utils/parcelas');
const { dataValida, mesCorrente } = require('../utils/datas');
const { idValido } = require('../utils/validacoes');

const ITENS_POR_PAGINA = 20;

const COLUNAS = `
    l.id, l.tipo, l.descricao, l.valor, l.data,
    l.parcela_atual, l.total_parcelas, l.grupo_parcelamento,
    c.id AS categoria_id, c.nome AS categoria_nome,
    f.id AS fonte_id, f.nome AS fonte_nome
`;

const JOINS = `
    FROM lancamentos l
    JOIN categorias c ON c.id = l.categoria_id
    JOIN fontes_destinos f ON f.id = l.fonte_destino_id
`;

function formatar(l) {
    return {
        id: l.id,
        tipo: l.tipo,
        descricao: l.descricao,
        valor: Number(l.valor),
        data: l.data,
        categoria: { id: l.categoria_id, nome: l.categoria_nome },
        fonteDestino: { id: l.fonte_id, nome: l.fonte_nome },
        parcela: `${l.parcela_atual}/${l.total_parcelas}`,
        grupoParcelamento: l.grupo_parcelamento
    };
}

async function validarVinculos(banco, usuarioId, tipo, categoriaId, fonteDestinoId) {
    // Ordem comum a criação/edição: fonte, categoria, lançamento.
    // Os bloqueios coordenam as mudanças de tipo nos dois cadastros.
    const [fontes] = await banco.query(
        'SELECT id, tipo FROM fontes_destinos WHERE id = ? AND usuario_id = ? FOR UPDATE',
        [fonteDestinoId, usuarioId]
    );
    if (fontes.length === 0) {
        throw new ErroHttp(404, 'Fonte/destino não encontrada.');
    }
    const [categorias] = await banco.query(
        'SELECT id, tipo FROM categorias WHERE id = ? AND usuario_id = ? FOR UPDATE',
        [categoriaId, usuarioId]
    );
    if (categorias.length === 0) {
        throw new ErroHttp(404, 'Categoria não encontrada.');
    }
    if (categorias[0].tipo !== tipo) {
        throw new ErroHttp(400, 'Dados inválidos.', {
            categoriaId: `A categoria informada é de ${categorias[0].tipo}, mas o lançamento é de ${tipo}.`
        });
    }

    return { fonte: fontes[0] };
}

function validarParcelamento(parcelas, tipo, fonte) {
    if (parcelas > 1 && (fonte.tipo !== 'cartao_credito' || tipo !== 'saida')) {
        throw new ErroHttp(400, 'Dados inválidos.', {
            parcelas: 'Só é possível parcelar saídas em cartão de crédito.'
        });
    }
}

class Lancamentos {
    async create(dados, usuarioId) {
        const { tipo, descricao, valor, data, categoriaId, fonteDestinoId, parcelas } = dados;

        return emTransacao(async (banco) => {
            const { fonte } = await validarVinculos(banco, usuarioId, tipo, categoriaId, fonteDestinoId);
            validarParcelamento(parcelas, tipo, fonte);

            const grupo = parcelas > 1 ? randomUUID() : null;
            const linhas = dividirEmParcelas(valor, parcelas).map((valorParcela, i) => [
                usuarioId, tipo, descricao, valorParcela, data,
                categoriaId, fonteDestinoId, i + 1, parcelas, grupo
            ]);

            // INSERT de várias linhas: VALUES ? recebe um array de arrays
            const [resultado] = await banco.query(
                `INSERT INTO lancamentos
                    (usuario_id, tipo, descricao, valor, data, categoria_id,
                     fonte_destino_id, parcela_atual, total_parcelas, grupo_parcelamento)
                 VALUES ?`,
                [linhas]
            );

            return { id: resultado.insertId, parcelas, grupoParcelamento: grupo };
        });
    }

    async read(filtro, usuarioId) {
        const erros = {};

        const pagina = filtro.pagina === undefined ? 1 : Number(filtro.pagina);
        if (!Number.isInteger(pagina) || pagina < 1) {
            erros.pagina = 'Página inválida.';
        }

        if (filtro.tipo !== undefined && !['entrada', 'saida'].includes(filtro.tipo)) {
            erros.tipo = 'O tipo deve ser "entrada" ou "saida".';
        }

        for (const campo of ['categoriaId', 'fonteDestinoId']) {
            if (filtro[campo] !== undefined && !idValido(filtro[campo])) {
                erros[campo] = 'ID inválido.';
            }
        }

        const padrao = mesCorrente();
        const inicio = filtro.inicio === undefined ? padrao.inicio : filtro.inicio;
        const fim = filtro.fim === undefined ? padrao.fim : filtro.fim;
        if (!dataValida(inicio) || !dataValida(fim) || inicio > fim) {
            erros.periodo = 'Informe inicio e fim válidos (AAAA-MM-DD), com inicio <= fim.';
        }

        if (Object.keys(erros).length > 0) {
            throw new ErroHttp(400, 'Dados inválidos.', erros);
        }

        let where = 'l.usuario_id = ? AND l.data BETWEEN ? AND ?';
        const params = [usuarioId, inicio, fim];

        if (filtro.tipo !== undefined) {
            where += ' AND l.tipo = ?';
            params.push(filtro.tipo);
        }
        if (filtro.categoriaId !== undefined) {
            where += ' AND l.categoria_id = ?';
            params.push(Number(filtro.categoriaId));
        }
        if (filtro.fonteDestinoId !== undefined) {
            where += ' AND l.fonte_destino_id = ?';
            params.push(Number(filtro.fonteDestinoId));
        }

        const [linhas] = await pool.query(
            `SELECT ${COLUNAS} ${JOINS}
             WHERE ${where}
             ORDER BY l.data DESC, l.id DESC
             LIMIT ? OFFSET ?`,
            [...params, ITENS_POR_PAGINA, (pagina - 1) * ITENS_POR_PAGINA]
        );

        const [resumo] = await pool.query(
            `SELECT COUNT(*) AS total,
                    COALESCE(SUM(CASE WHEN l.tipo = 'entrada' THEN l.valor END), 0) AS entradas,
                    COALESCE(SUM(CASE WHEN l.tipo = 'saida' THEN l.valor END), 0) AS saidas
             FROM lancamentos l
             WHERE ${where}`,
            params
        );

        const entradas = Number(resumo[0].entradas);
        const saidas = Number(resumo[0].saidas);

        return {
            periodo: { inicio, fim },
            resumo: {
                entradas,
                saidas,
                saldo: Math.round((entradas - saidas) * 100) / 100
            },
            pagina,
            totalPaginas: Math.ceil(Number(resumo[0].total) / ITENS_POR_PAGINA),
            itens: linhas.map(formatar)
        };
    }

    async findById(id, usuarioId) {
        const [linhas] = await pool.query(
            `SELECT ${COLUNAS} ${JOINS} WHERE l.id = ? AND l.usuario_id = ?`,
            [id, usuarioId]
        );
        return linhas.length === 0 ? null : formatar(linhas[0]);
    }

    async update(id, usuarioId, dados) {
        return emTransacao(async (banco) => {
            const { tipo, descricao, valor, data, categoriaId, fonteDestinoId } = dados;
            // Primeiro preserva o 404 de registros alheios/inexistentes.
            const [encontrados] = await banco.query(
                'SELECT id FROM lancamentos WHERE id = ? AND usuario_id = ?', [id, usuarioId]
            );
            if (!encontrados.length) throw new ErroHttp(404, 'Lançamento não encontrado.');
            const { fonte } = await validarVinculos(banco, usuarioId, tipo, categoriaId, fonteDestinoId);
            const [persistidos] = await banco.query(
                'SELECT total_parcelas FROM lancamentos WHERE id = ? AND usuario_id = ? FOR UPDATE',
                [id, usuarioId]
            );
            if (!persistidos.length) throw new ErroHttp(404, 'Lançamento não encontrado.');
            validarParcelamento(persistidos[0].total_parcelas, tipo, fonte);
            await banco.query(
                `UPDATE lancamentos
                 SET tipo = ?, descricao = ?, valor = ?, data = ?, categoria_id = ?, fonte_destino_id = ?
                 WHERE id = ? AND usuario_id = ?`,
                [tipo, descricao, valor, data, categoriaId, fonteDestinoId, id, usuarioId]
            );
            const [linhas] = await banco.query(
                `SELECT ${COLUNAS} ${JOINS} WHERE l.id = ? AND l.usuario_id = ?`, [id, usuarioId]
            );
            return formatar(linhas[0]);
        });
    }

    async delete(id, usuarioId, todasParcelas) {
        const lancamento = await this.findById(id, usuarioId);
        if (!lancamento) {
            throw new ErroHttp(404, 'Lançamento não encontrado.');
        }

        let resultado;
        if (todasParcelas && lancamento.grupoParcelamento) {
            [resultado] = await pool.query(
                'DELETE FROM lancamentos WHERE grupo_parcelamento = ? AND usuario_id = ?',
                [lancamento.grupoParcelamento, usuarioId]
            );
        } else {
            [resultado] = await pool.query(
                'DELETE FROM lancamentos WHERE id = ? AND usuario_id = ?',
                [id, usuarioId]
            );
        }

        return resultado.affectedRows;
    }
}

module.exports = new Lancamentos();