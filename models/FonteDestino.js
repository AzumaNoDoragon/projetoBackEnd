const conectar = require('../database/connection');

const CAMPOS = ['nome', 'tipo', 'dia_fechamento', 'dia_vencimento', 'limite'];
const COLUNAS = 'id, usuario_id, nome, tipo, dia_fechamento, dia_vencimento, limite';
const TIPOS = ['renda', 'conta', 'cartao_credito'];

/** Erro público do domínio; codigo, status e message podem ser usados pelas rotas. */
class ErroFonteDestino extends Error {
    constructor(codigo, mensagem, status) {
        super(mensagem);
        this.name = 'ErroFonteDestino';
        this.codigo = codigo;
        this.status = status;
    }
}

function invalido(mensagem) {
    return new ErroFonteDestino('DADOS_INVALIDOS', mensagem, 400);
}

function validarId(valor, campo) {
    if (!((typeof valor === 'number' && Number.isInteger(valor)) ||
        (typeof valor === 'string' && /^\d+$/.test(valor)))) {
        throw invalido(`${campo} deve ser um inteiro positivo.`);
    }
    const id = Number(valor);
    if (!Number.isSafeInteger(id) || id < 1 || id > 2147483647) {
        throw invalido(`${campo} deve ser um inteiro positivo válido.`);
    }
    return id;
}

function validarCampos(dados) {
    if (!dados || typeof dados !== 'object' || Array.isArray(dados)) {
        throw invalido('Os dados devem ser um objeto.');
    }
    if (Object.keys(dados).some((campo) => !CAMPOS.includes(campo))) {
        throw invalido('Envie somente nome, tipo, dia_fechamento, dia_vencimento e limite.');
    }
}

function validarDia(valor, campo) {
    if (!Number.isInteger(valor) || valor < 1 || valor > 31) {
        throw invalido(`${campo} deve ser um inteiro entre 1 e 31.`);
    }
    return valor;
}

function validarLimite(valor) {
    if (typeof valor !== 'string') {
        throw invalido('O limite deve ser uma string decimal positiva.');
    }
    const texto = valor;
    if (!/^\d{1,10}(\.\d{1,2})?$/.test(texto) || !/[1-9]/.test(texto)) {
        throw invalido('O limite deve ser positivo, até 9999999999.99 e ter no máximo duas casas decimais.');
    }
    const [inteiro, decimal = ''] = texto.split('.');
    // Mantém DECIMAL como texto para não introduzir arredondamento binário.
    return `${inteiro.replace(/^0+(?=\d)/, '')}.${decimal.padEnd(2, '0')}`;
}

/** Valida um registro completo e retorna uma cópia normalizada, sem usuario_id. */
function validarDados(dados) {
    validarCampos(dados);
    if (typeof dados.nome !== 'string' || !dados.nome.trim() ||
        Array.from(dados.nome.trim()).length > 60) {
        throw invalido('O nome é obrigatório e deve ter até 60 caracteres.');
    }
    if (!TIPOS.includes(dados.tipo)) {
        throw invalido('O tipo deve ser renda, conta ou cartao_credito.');
    }

    const resultado = {
        nome: dados.nome.trim(),
        tipo: dados.tipo,
        dia_fechamento: null,
        dia_vencimento: null,
        limite: null
    };

    if (dados.tipo === 'cartao_credito') {
        resultado.dia_fechamento = validarDia(dados.dia_fechamento, 'dia_fechamento');
        resultado.dia_vencimento = validarDia(dados.dia_vencimento, 'dia_vencimento');
        resultado.limite = validarLimite(dados.limite);
    } else if (['dia_fechamento', 'dia_vencimento', 'limite'].some(
        (campo) => dados[campo] !== undefined && dados[campo] !== null
    )) {
        throw invalido('Rendas e contas devem ter os campos de cartão nulos.');
    }

    return resultado;
}

function tratarErro(erro) {
    if (erro instanceof ErroFonteDestino) return erro;
    if (erro.code === 'ER_DUP_ENTRY') {
        return new ErroFonteDestino('NOME_DUPLICADO', 'Já existe uma fonte ou destino com esse nome para o usuário.', 409);
    }
    if (['ER_ROW_IS_REFERENCED', 'ER_ROW_IS_REFERENCED_2'].includes(erro.code)) {
        return new ErroFonteDestino('RECURSO_EM_USO', 'A fonte ou destino possui registros associados e não pode ser excluída.', 409);
    }
    if (['ER_NO_REFERENCED_ROW', 'ER_NO_REFERENCED_ROW_2'].includes(erro.code)) {
        return new ErroFonteDestino('REFERENCIA_INVALIDA', 'O usuário ou registro relacionado não está disponível.', 409);
    }
    return new ErroFonteDestino('ERRO_INTERNO', 'Não foi possível concluir a operação de fontes e destinos.', 500);
}

async function comConexao(operacao) {
    try {
        // O segundo argumento definido faz connection.js selecionar DB_NAME.
        const connection = await new Promise((resolve, reject) => {
            conectar((erro, conexao) => erro ? reject(erro) : resolve(conexao), true);
        });
        const banco = connection.promise();
        try {
            return await operacao(banco);
        } finally {
            try {
                await banco.end();
            } catch {
                // Uma falha de limpeza não altera o resultado nem o erro da operação.
                console.error('Falha ao encerrar a conexão de fontes e destinos.');
                try {
                    connection.destroy();
                } catch {
                    console.error('Não foi possível liberar a conexão de fontes e destinos.');
                }
            }
        }
    } catch (erro) {
        throw tratarErro(erro);
    }
}

function naoEncontrado() {
    return new ErroFonteDestino('NAO_ENCONTRADO', 'Fonte ou destino não encontrado.', 404);
}

/** criar(usuarioId, dados): Promise<registro>; usuarioId vem da autenticação. */
async function criar(usuarioId, dados) {
    const usuario = validarId(usuarioId, 'usuario_id');
    const registro = validarDados(dados);
    return comConexao(async (banco) => {
        const [resultado] = await banco.execute(
            `INSERT INTO fontes_destinos
                (usuario_id, nome, tipo, dia_fechamento, dia_vencimento, limite)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [usuario, ...CAMPOS.map((campo) => registro[campo])]
        );
        return { id: resultado.insertId, usuario_id: usuario, ...registro };
    });
}

/** listar(usuarioId): Promise<registro[]>; retorna apenas registros do usuário. */
async function listar(usuarioId) {
    const usuario = validarId(usuarioId, 'usuario_id');
    return comConexao(async (banco) => {
        const [registros] = await banco.execute(
            `SELECT ${COLUNAS} FROM fontes_destinos WHERE usuario_id = ? ORDER BY nome, id`,
            [usuario]
        );
        return registros;
    });
}

/** buscarPorId(usuarioId, id): Promise<registro|null>; terceiros também retornam null. */
async function buscarPorId(usuarioId, id) {
    const usuario = validarId(usuarioId, 'usuario_id');
    const fonteId = validarId(id, 'id');
    return comConexao(async (banco) => {
        const [registros] = await banco.execute(
            `SELECT ${COLUNAS} FROM fontes_destinos WHERE usuario_id = ? AND id = ?`,
            [usuario, fonteId]
        );
        return registros[0] || null;
    });
}

/**
 * atualizar(usuarioId, id, dados): Promise<registro>; aceita campos parciais.
 * Ao mudar cartão para renda/conta, envie seus três campos exclusivos como null.
 * Mudanças de tipo são rejeitadas se houver lançamentos associados.
 * O bloqueio transacional preserva a validação do estado final em edições concorrentes.
 */
async function atualizar(usuarioId, id, dados) {
    const usuario = validarId(usuarioId, 'usuario_id');
    const fonteId = validarId(id, 'id');
    validarCampos(dados);
    // Copia somente propriedades próprias antes de aguardar a conexão.
    const alteracoes = { ...dados };
    return comConexao(async (banco) => {
        await banco.beginTransaction();
        try {
            const [registros] = await banco.execute(
                `SELECT ${COLUNAS} FROM fontes_destinos WHERE usuario_id = ? AND id = ? FOR UPDATE`,
                [usuario, fonteId]
            );
            if (!registros.length) throw naoEncontrado();

            const atual = Object.fromEntries(CAMPOS.map((campo) => [campo, registros[0][campo]]));
            const registro = validarDados({ ...atual, ...alteracoes });
            if (registro.tipo !== atual.tipo) {
                const [lancamentos] = await banco.execute(
                    `SELECT id FROM lancamentos
                     WHERE usuario_id = ? AND fonte_destino_id = ? LIMIT 1 FOR UPDATE`,
                    [usuario, fonteId]
                );
                if (lancamentos.length) {
                    throw new ErroFonteDestino('TIPO_EM_USO', 'O tipo não pode ser alterado porque há lançamentos associados.', 409);
                }
            }
            await banco.execute(
                `UPDATE fontes_destinos
                 SET nome = ?, tipo = ?, dia_fechamento = ?, dia_vencimento = ?, limite = ?
                 WHERE usuario_id = ? AND id = ?`,
                [...CAMPOS.map((campo) => registro[campo]), usuario, fonteId]
            );
            await banco.commit();
            return { id: fonteId, usuario_id: usuario, ...registro };
        } catch (erro) {
            // Preserva o erro original mesmo se a conexão impedir o rollback.
            try {
                await banco.rollback();
            } catch {
                // comConexao ainda tentará encerrar a conexão.
            }
            throw erro;
        }
    });
}

/**
 * excluir(usuarioId, id): Promise<true>; não exclui lançamentos associados.
 * A FK de lancamentos impede a exclusão de fontes em uso e gera conflito.
 */
async function excluir(usuarioId, id) {
    const usuario = validarId(usuarioId, 'usuario_id');
    const fonteId = validarId(id, 'id');
    return comConexao(async (banco) => {
        const [resultado] = await banco.execute(
            'DELETE FROM fontes_destinos WHERE usuario_id = ? AND id = ?',
            [usuario, fonteId]
        );
        if (!resultado.affectedRows) throw naoEncontrado();
        return true;
    });
}

// Operações assíncronas rejeitam com ErroFonteDestino; validarDados é síncrona.
module.exports = { criar, listar, buscarPorId, atualizar, excluir, validarDados, ErroFonteDestino };
