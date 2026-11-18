const conectar = require('../database/connection')

const categoriasPadrao = [
    ['salário', 'entrada'],
    ['outras entradas', 'entrada'],
    ['alimentação', 'saida'],
    ['moradia', 'saida'],
    ['mobilidade', 'saida'],
    ['lazer', 'saida'],
    ['saúde', 'saida'],
    ['educação', 'saida'],
    ['outras saidas', 'saida']
]

class Usuario{

    async inserir (db, {nome, email, cpf, senhaHash}) {
        const sql = `INSERT INTO usuarios (nome, email, cpf, senha_hash)
        VALUES (?, ?, ?, ?)`

        const [resultado] = await db.execute(sql, [nome, email, cpf, senhaHash])
        return resultado.insertId
    }

    async cadastrar(dados){
        const conexao = await new Promise((resolve, reject) => {
            conectar((erro, conecction) => {
                if(erro) return reject(erro)
                    resolve(conecction)
            })
        })
        const bd = conexao.promise()
        try{
            await bd.beginTransaction()
            const UsuarioId = await this.inserir(bd, dados)

            const sqlCategoria = `INSERT INTO categorias (usuario_id, nome, tipo)
            Values (?, ?, ?)`

            for (const [nome, tipo] of categoriasPadrao){
                await bd.execute(sqlCategoria, [UsuarioId, nome, tipo])
            }

            const sqlConta = `INSERT INTO fontes_destinos (usuario_id, nome, tipo)
            Values (?, ?, ?)`

            await bd.execute(sqlConta, [
                UsuarioId,
                'conta corrente',
                'conta'
            ])
            await bd.commit()
            return UsuarioId


        }catch(error){
            await bd.rollback()
            throw error
        }finally{
            await bd.end()
        }
    }

}

module.exports = new Usuario()