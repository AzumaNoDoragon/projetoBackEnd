const express = require('express');
const routes = express.Router();

const Lancamentos = require('../models/Lancamentos');
const autenticacao = require('../middleware/authMock');

routes.get('/', autenticacao, (req, res) => {
    Lancamentos.read(req.query, req.auth.id, (erro, resultados) => {
        if (erro) {
            return res.status(500).json({ erro: erro.message })
        }
        return res.status(200).json(resultados)
    })
})

routes.get('/:id', autenticacao, (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({
            erro: 'ID inválido'
        });
    }
    Lancamentos.findById(id, req.auth.id, (erro, resultado) => {
        if (erro) {
            return res.status(500).json({ erro: erro.message })
        }
        if (resultado.length === 0) {
            return res.status(404).json({
                erro: 'Lançamento não encontrado'
            })
        }
        return res.status(200).json(resultado[0])
    })
})

routes.post('/', autenticacao, (req, res) => {
    const {
        tipo,
        descricao,
        valor,
        data,
        categoria_id,
        fonte_destino_id,
        parcelas = 1
    } = req.body;

    if (
        !tipo ||
        !descricao ||
        valor === undefined ||
        !data ||
        !categoria_id ||
        !fonte_destino_id
    ) {
        return res.status(400).json({
            erro: 'Todos os campos obrigatórios devem ser preenchidos'
        });
    }

    if (!['entrada', 'saida'].includes(tipo)) {
        return res.status(400).json({
            erro: 'Tipo deve ser entrada ou saida'
        });
    }

    if (typeof descricao !== 'string' || descricao.trim() === '') {
        return res.status(400).json({
            erro: 'Descrição inválida'
        });
    }

    if (
        !Number.isFinite(Number(valor)) ||
        Number(valor) <= 0
    ) {
        return res.status(400).json({
            erro: 'O valor deve ser um número maior que zero'
        });
    }

    const dataValida = /^\d{4}-\d{2}-\d{2}$/.test(data) &&
        !Number.isNaN(Date.parse(data)) &&
        new Date(data + 'T00:00:00.000Z').toISOString().slice(0, 10) === data;

    if (!dataValida) {
        return res.status(400).json({
            erro: 'Data inválida. Utilize o formato AAAA-MM-DD'
        });
    }

    if (
        !Number.isInteger(Number(parcelas)) ||
        Number(parcelas) < 1 ||
        Number(parcelas) > 48
    ) {
        return res.status(400).json({
            erro: 'A quantidade de parcelas deve estar entre 1 e 48'
        });
    }

    const dados = {
        tipo,
        descricao: descricao.trim(),
        valor: Number(valor),
        data,
        categoria_id,
        fonte_destino_id
    };

    if (
        !Number.isInteger(Number(categoria_id)) ||
        Number(categoria_id) <= 0 ||
        !Number.isInteger(Number(fonte_destino_id)) ||
        Number(fonte_destino_id) <= 0
    ) {
        return res.status(400).json({
            erro: 'Categoria ou fonte/destino inválido'
        });
    }

    Lancamentos.create(dados, req.auth.id, (erro, resultado) => {
        if (erro) {
            return res.status(500).json({
                erro: erro.message
            });
        }

        return res.status(201).json({
            mensagem: 'Lançamento criado com sucesso',
            id: resultado.insertId
        });
    });
});

routes.put('/:id', autenticacao, (req, res) => {
    const id = Number(req.params.id);
    const dados = req.body;

    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({
            erro: 'ID inválido'
        });
    }

    const camposObrigatorios = [
        'tipo',
        'descricao',
        'valor',
        'data',
        'categoria_id',
        'fonte_destino_id'
    ];

    for (const campo of camposObrigatorios) {
        if (
            dados[campo] === undefined ||
            dados[campo] === null ||
            dados[campo] === ''
        ) {
            return res.status(400).json({
                erro: `O campo ${campo} é obrigatório`
            });
        }
    }

    if (!['entrada', 'saida'].includes(dados.tipo)) {
        return res.status(400).json({
            erro: 'Tipo deve ser entrada ou saida'
        });
    }

    if (typeof dados.descricao !== 'string' || !dados.descricao.trim()) {
        return res.status(400).json({
            erro: 'Descrição inválida'
        });
    }

    const valor = Number(dados.valor);

    if (!Number.isFinite(valor) || valor <= 0) {
        return res.status(400).json({
            erro: 'Valor deve ser um número maior que zero'
        });
    }

    const dataValida = /^\d{4}-\d{2}-\d{2}$/.test(dados.data);
    const dataConvertida = new Date(`${dados.data}T00:00:00Z`);

    if (
        !dataValida ||
        Number.isNaN(dataConvertida.getTime()) ||
        dataConvertida.toISOString().slice(0, 10) !== dados.data
    ) {
        return res.status(400).json({
            erro: 'Data inválida. Utilize o formato AAAA-MM-DD'
        });
    }

    if (
        !Number.isInteger(Number(dados.categoria_id)) ||
        Number(dados.categoria_id) <= 0 ||
        !Number.isInteger(Number(dados.fonte_destino_id)) ||
        Number(dados.fonte_destino_id) <= 0
    ) {
        return res.status(400).json({
            erro: 'Categoria ou fonte/destino inválido'
        });
    }

    Lancamentos.findById(id, req.auth.id, (erro, resultado) => {
        if (erro) {
            return res.status(500).json({
                erro: erro.message
            });
        }

        if (resultado.length === 0) {
            return res.status(404).json({
                erro: 'Lançamento não encontrado'
            });
        }

        Lancamentos.update(
            id,
            req.auth.id,
            {
                ...dados,
                descricao: dados.descricao.trim(),
                valor,
                categoria_id: Number(dados.categoria_id),
                fonte_destino_id: Number(dados.fonte_destino_id)
            },
            (erro, resultado) => {
                if (erro) {
                    return res.status(erro.statusCode || 500).json({
                        erro: erro.message
                    });
                }

                return res.status(200).json({
                    mensagem: 'Lançamento atualizado com sucesso'
                });
            }
        );
    });
});

routes.delete('/:id', autenticacao, (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({
            erro: 'ID inválido'
        });
    }

    const todasParcelas = req.query.todasParcelas === 'true';

    Lancamentos.delete(
        id,
        req.auth.id,
        todasParcelas,
        (erro, resultados) => {
            if (erro) {
                return res.status(500).json({
                    erro: erro.message
                });
            }

            if (resultados === null || resultados.affectedRows === 0) {
                return res.status(404).json({
                    erro: 'Lançamento não encontrado'
                });
            }

            return res.status(200).json({
                mensagem: todasParcelas
                    ? 'Lançamentos excluídos com sucesso'
                    : 'Lançamento excluído com sucesso',
                excluidos: resultados.affectedRows
            });
        }
    );
});

module.exports = routes;