const conectar = require('./connection');

const sql = `
    CREATE DATABASE IF NOT EXISTS financas;

    USE financas;

    CREATE TABLE IF NOT EXISTS usuarios (
        id INT AUTO_INCREMENT PRIMARY KEY
    );

    CREATE TABLE IF NOT EXISTS categorias (
        id INT AUTO_INCREMENT PRIMARY KEY
    );

    CREATE TABLE IF NOT EXISTS fontes_destinos (
        id INT AUTO_INCREMENT PRIMARY KEY
    );

    CREATE TABLE IF NOT EXISTS lancamentos(
        id INT AUTO_INCREMENT PRIMARY KEY,
        usuario_id INT NOT NULL,
        tipo ENUM('entrada', 'saida') NOT NULL,
        descricao VARCHAR(120) NOT NULL,
        valor DECIMAL(12,2) NOT NULL,
        data DATE NOT NULL,
        categoria_id INT NOT NULL,
        fonte_destino_id INT NOT NULL,
        parcela_atual TINYINT DEFAULT 1,
        total_parcelas TINYINT DEFAULT 1,
        grupo_parcelamento CHAR(36) NULL,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,

        CONSTRAINT chk_lancamento_valor CHECK (valor > 0),

        CONSTRAINT chk_total_parcelas CHECK (total_parcelas BETWEEN 1 AND 48),

        CONSTRAINT chk_parcela_atual CHECK (parcela_atual BETWEEN 1 AND total_parcelas),

        INDEX idx_lancamento_usuario_data (usuario_id, data),

        FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
        FOREIGN KEY (categoria_id) REFERENCES categorias(id),
        FOREIGN KEY (fonte_destino_id) REFERENCES fontes_destinos(id)
    );
`

conectar((erro, connection) => {
    if (erro) {
        console.error('Não foi possível inicializar o banco.');
        return;
    }

    connection.query(sql, (erro) => {
        if (erro) {
            console.error("Erro ao inicializar: ", erro);
        } else {
            console.log("Banco criado com sucesso!");
        }
        connection.end();
    })
}, undefined)