const express = require('express')
const { cpfValido } = require('../utils/cpf')
const bcrypt = require('bcrypt')
const Usuario = require('../models/Usuario')

const router = express.Router()

router.post('/cadastro', async (req, res) => {
    const { nome, email, cpf, senha } = req.body ?? {}
    const erros = {}

    if (typeof nome !== 'string' || !nome.trim() || nome.trim().length > 120) {
        erros.nome = 'informe um nome com até 120 caracteres.'
    }

    if (
        typeof email !== 'string' ||
        email.trim().length > 160 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    ) {
        erros.email = 'informe um e-mail válido com até 160 caracteres.'
    }

    if (typeof cpf !== 'string' || !cpfValido(cpf)) {
        erros.cpf = 'CPF inválido.'
    }

    if (
        typeof senha !== 'string' ||
        senha.length < 8 ||
        !/[A-Za-z]/.test(senha) ||
        !/\d/.test(senha)
    ) {
        erros.senha = 'a senha deve ter pelo menos 8 caracteres, com letras e números.'
    }

    if (Object.keys(erros).length > 0) {
        return res.status(400).json({
            erro: 'Dados inválidos.',
            campos: erros
        })
    }

    const senhaHash = await bcrypt.hash(senha, 10)
    const dados = {
        nome: nome.trim(),
        email: email.trim().toLowerCase(),
        cpf: cpf.replace(/\D/g, ''),
        senhaHash
    }

    try {
        const id = await Usuario.cadastrar(dados)

        return res.status(201).json({
            id,
            nome: dados.nome,
            email: dados.email
        })
    } catch (erro) {
        if (erro.code === 'ER_DUP_ENTRY') {
            const campo = erro.sqlMessage?.includes('uq_usuarios_cpf')
                ? 'cpf'
                : 'email'

            return res.status(409).json({
                erro: 'Usuário já cadastrado.',
                campos: {
                    [campo]: `já existe um usuário com este ${campo === 'cpf' ? 'CPF' : 'e-mail'}.`
                }
            })
        }

        throw erro
    }
})

module.exports = router