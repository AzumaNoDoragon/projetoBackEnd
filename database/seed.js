const conectar = require('./connection');

const sql = `
    INSERT IGNORE INTO financas.usuarios (id)
    VALUES (1), (2);

    INSERT IGNORE INTO financas.categorias (id)
    VALUES (1), (2);

    INSERT IGNORE INTO financas.fontes_destinos (id)
    VALUES (1), (2);

    INSERT IGNORE INTO financas.lancamentos (
        id,
        usuario_id,
        tipo,
        descricao,
        valor,
        data,
        categoria_id,
        fonte_destino_id,
        parcela_atual,
        total_parcelas,
        grupo_parcelamento
    ) VALUES
    (1, 1, 'entrada', 'Salário mensal', 3500.00, '2026-11-05', 1, 1, 1, 1, NULL),
    (2, 1, 'saida', 'Supermercado', 450.75, '2026-11-06', 1, 1, 1, 1, NULL),
    (3, 1, 'saida', 'Conta de energia', 180.50, '2026-11-08', 1, 1, 1, 1, NULL),
    (4, 1, 'saida', 'Notebook', 2400.00, '2026-11-10', 2, 1, 1, 12, '550e8400-e29b-41d4-a716-446655440000'),
    (5, 1, 'entrada', 'Freelance', 800.00, '2026-11-12', 2, 1, 1, 1, NULL);
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
            console.log("Valores inseridos com sucesso!");
        }
        connection.end();
    })
})