# Requisições de teste (curl, formato do Prompt de Comando do Windows)

Enquanto o login não estiver integrado, o `authMock` fixa o usuário (`req.auth.id = 2`, Bruno).
Depois da integração, troque `SEU_TOKEN_AQUI` pelo token do `POST /auth/login`.
Seed: `ana@email.com` (id 1) e `bruno@email.com` (id 2), senha `Senha1234`.

## Lançamentos

```bash
# Listar (mês corrente, padrão)
curl "http://localhost:3000/lancamentos" -H "Authorization: Bearer SEU_TOKEN_AQUI"

# Listar com filtros, paginação e resumo
curl "http://localhost:3000/lancamentos?inicio=2026-11-01&fim=2026-11-30&tipo=saida&categoriaId=15&fonteDestinoId=8&pagina=1" -H "Authorization: Bearer SEU_TOKEN_AQUI"

# Detalhar
curl "http://localhost:3000/lancamentos/1" -H "Authorization: Bearer SEU_TOKEN_AQUI"

# Criar lançamento simples (categoria 12 = Alimentação do Bruno, fonte 6 = Conta corrente)
curl -X POST "http://localhost:3000/lancamentos" -H "Content-Type: application/json" -H "Authorization: Bearer SEU_TOKEN_AQUI" -d "{\"tipo\":\"saida\",\"descricao\":\"Padaria\",\"valor\":45.90,\"data\":\"2026-11-20\",\"categoriaId\":12,\"fonteDestinoId\":6}"

# Criar compra parcelada no cartão (fonte 8 = Cartão Nubank do Bruno): R$ 100,00 em 3x -> 33,34 + 33,33 + 33,33
curl -X POST "http://localhost:3000/lancamentos" -H "Content-Type: application/json" -H "Authorization: Bearer SEU_TOKEN_AQUI" -d "{\"tipo\":\"saida\",\"descricao\":\"Fone de ouvido\",\"valor\":100,\"data\":\"2026-11-20\",\"categoriaId\":18,\"fonteDestinoId\":8,\"parcelas\":3}"

# Validação que falha (saída com categoria de entrada: 10 = Salário) -> 400
curl -X POST "http://localhost:3000/lancamentos" -H "Content-Type: application/json" -H "Authorization: Bearer SEU_TOKEN_AQUI" -d "{\"tipo\":\"saida\",\"descricao\":\"Teste\",\"valor\":10,\"data\":\"2026-11-20\",\"categoriaId\":10,\"fonteDestinoId\":6}"

# Categoria/fonte de outro usuário (categoria 3 é da Ana) -> 404
curl -X POST "http://localhost:3000/lancamentos" -H "Content-Type: application/json" -H "Authorization: Bearer SEU_TOKEN_AQUI" -d "{\"tipo\":\"saida\",\"descricao\":\"Teste\",\"valor\":10,\"data\":\"2026-11-20\",\"categoriaId\":3,\"fonteDestinoId\":6}"

# Atualizar
curl -X PUT "http://localhost:3000/lancamentos/1" -H "Content-Type: application/json" -H "Authorization: Bearer SEU_TOKEN_AQUI" -d "{\"tipo\":\"saida\",\"descricao\":\"Compra atualizada\",\"valor\":180.00,\"data\":\"2026-11-16\",\"categoriaId\":12,\"fonteDestinoId\":6}"

# Excluir uma parcela / todas as parcelas da compra (204 sem corpo)
curl -X DELETE "http://localhost:3000/lancamentos/1" -H "Authorization: Bearer SEU_TOKEN_AQUI"
curl -X DELETE "http://localhost:3000/lancamentos/1?todasParcelas=true" -H "Authorization: Bearer SEU_TOKEN_AQUI"

# Lançamento de outro usuário (ex.: 1 é da Ana quando logado como Bruno) -> 404 em GET, PUT e DELETE
```

## Relatórios

```bash
# RF7 — Por categoria (saídas com %, entradas e comparação com o período anterior)
curl "http://localhost:3000/relatorios/categorias?inicio=2026-10-01&fim=2026-10-31" -H "Authorization: Bearer SEU_TOKEN_AQUI"

# RF7 — período inválido (inicio > fim, ou sem inicio/fim) -> 400
curl "http://localhost:3000/relatorios/categorias?inicio=2026-10-31&fim=2026-10-01" -H "Authorization: Bearer SEU_TOKEN_AQUI"

# RF8 — Por fonte/destino (entradas por fonte, saídas por destino, saldo das contas)
curl "http://localhost:3000/relatorios/fontes-destinos?inicio=2026-11-01&fim=2026-11-30" -H "Authorization: Bearer SEU_TOKEN_AQUI"

# RF9 — Previsão de faturas (fatura atual + próximas 3, padrão)
curl "http://localhost:3000/relatorios/faturas" -H "Authorization: Bearer SEU_TOKEN_AQUI"

# Próximas 6 faturas
curl "http://localhost:3000/relatorios/faturas?meses=6" -H "Authorization: Bearer SEU_TOKEN_AQUI"

# meses inválido -> 400
curl "http://localhost:3000/relatorios/faturas?meses=13" -H "Authorization: Bearer SEU_TOKEN_AQUI"
```

## Sem token (após integrar o middleware real) -> 401

```bash
curl "http://localhost:3000/lancamentos"
```
