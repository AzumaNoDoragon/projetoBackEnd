# Fontes e destinos

## 1. Visão geral

A Issue #12 implementa o cadastro, a listagem, a consulta, a atualização e a exclusão de fontes e destinos financeiros do usuário. A Issue #13 implementa o RF8, que agrupa receitas e despesas por fonte ou destino e calcula o saldo de cada conta em um período.

A API usa Node.js, CommonJS e Express. Os routers verificam a identidade, aplicam o contrato HTTP e chamam os models. O model do CRUD valida os dados do cadastro, e o router do RF8 valida o período. Os models executam consultas parametrizadas no MySQL pelo pool compartilhado de `mysql2`. O middleware global formata as respostas de erro. As suítes usam `node:test` e `node:assert/strict`, com `fetch` nativo nos testes HTTP. [README do projeto](../README.md)

## 2. CRUD de fontes e destinos

Os exemplos desta seção usam dados fictícios e representam o uso **após a integração do JWT definitivo**. Substitua `TOKEN_EXEMPLO` pelo token recebido da autenticação real.

| Método e caminho | Resultado de sucesso |
| --- | --- |
| `POST /fontes-destinos` | `201 Created` com o registro criado em `dados`. |
| `GET /fontes-destinos` | `200 OK` com um array em `dados`, ordenado por nome e ID. Sem registros, retorna `{ "dados": [] }`. |
| `GET /fontes-destinos/:id` | `200 OK` com o registro solicitado em `dados`. |
| `PUT /fontes-destinos/:id` | `200 OK` com o registro atualizado em `dados`. |
| `DELETE /fontes-destinos/:id` | `204 No Content` com corpo vazio. |

### Campos e validações

| Campo | Regra |
| --- | --- |
| `nome` | Obrigatório no cadastro. Texto de 1 a 60 caracteres após a remoção dos espaços nas extremidades. |
| `tipo` | Obrigatório no cadastro. Aceita `renda`, `conta` ou `cartao_credito`. |
| `dia_fechamento` | Obrigatório para `cartao_credito`. Número inteiro de 1 a 31. Para `renda` e `conta`, omita ou envie `null`. |
| `dia_vencimento` | Obrigatório para `cartao_credito`. Número inteiro de 1 a 31. Para `renda` e `conta`, omita ou envie `null`. |
| `limite` | Obrigatório para `cartao_credito`. String decimal positiva com até 10 dígitos antes do ponto e até duas casas decimais, limitada a `"9999999999.99"`. Para `renda` e `conta`, omita ou envie `null`. |

O corpo de `POST` ou `PUT` deve ser um objeto JSON com apenas os campos da tabela. `id` e `usuario_id` aparecem na resposta. O banco gera o `id` do registro, e o model recebe `usuario_id` da identidade autenticada. O `:id` da URL deve ser um inteiro positivo até `2147483647`. O retorno de `limite` para cartões é uma string normalizada com duas casas decimais. Para rendas e contas, os três campos de cartão retornam `null`.

- `renda` identifica uma fonte de receita, como salário. `conta` identifica uma conta que pode receber entradas e saídas. `cartao_credito` identifica um cartão com dias de fechamento e vencimento e limite de crédito.
- A unicidade de `nome` é por usuário e vale entre todos os tipos. Dois usuários podem usar o mesmo nome.
- O `PUT` aceita atualização parcial e valida o registro resultante. Para mudar uma renda ou conta para cartão, informe os três campos de cartão. Para mudar um cartão para renda ou conta, envie `dia_fechamento`, `dia_vencimento` e `limite` como `null`.
- A mudança de tipo retorna `409` quando há lançamentos do usuário associados ao registro. O model verifica o vínculo em uma transação com bloqueio `SELECT ... FOR UPDATE`. A chave estrangeira de lançamentos impede a exclusão de registros vinculados, o que também retorna `409`.

### Cadastrar um cartão

```bash
curl -X POST 'http://localhost:3000/fontes-destinos' \
  -H 'Authorization: Bearer TOKEN_EXEMPLO' \
  -H 'Content-Type: application/json' \
  -d '{"nome":"Cartão Viagem","tipo":"cartao_credito","dia_fechamento":5,"dia_vencimento":12,"limite":"1500.5"}'
```

Resposta `201 Created`

```json
{
  "dados": {
    "id": 21,
    "usuario_id": 7,
    "nome": "Cartão Viagem",
    "tipo": "cartao_credito",
    "dia_fechamento": 5,
    "dia_vencimento": 12,
    "limite": "1500.50"
  }
}
```

### Listar fontes e destinos

```bash
curl 'http://localhost:3000/fontes-destinos' \
  -H 'Authorization: Bearer TOKEN_EXEMPLO'
```

Resposta `200 OK`

```json
{
  "dados": [
    {
      "id": 21,
      "usuario_id": 7,
      "nome": "Cartão Viagem",
      "tipo": "cartao_credito",
      "dia_fechamento": 5,
      "dia_vencimento": 12,
      "limite": "1500.50"
    },
    {
      "id": 12,
      "usuario_id": 7,
      "nome": "Conta Corrente",
      "tipo": "conta",
      "dia_fechamento": null,
      "dia_vencimento": null,
      "limite": null
    },
    {
      "id": 13,
      "usuario_id": 7,
      "nome": "Reserva",
      "tipo": "conta",
      "dia_fechamento": null,
      "dia_vencimento": null,
      "limite": null
    },
    {
      "id": 18,
      "usuario_id": 7,
      "nome": "Salário",
      "tipo": "renda",
      "dia_fechamento": null,
      "dia_vencimento": null,
      "limite": null
    }
  ]
}
```

### Consultar por ID

```bash
curl 'http://localhost:3000/fontes-destinos/12' \
  -H 'Authorization: Bearer TOKEN_EXEMPLO'
```

Resposta `200 OK`

```json
{
  "dados": {
    "id": 12,
    "usuario_id": 7,
    "nome": "Conta Corrente",
    "tipo": "conta",
    "dia_fechamento": null,
    "dia_vencimento": null,
    "limite": null
  }
}
```

### Atualizar o limite de um cartão

```bash
curl -X PUT 'http://localhost:3000/fontes-destinos/21' \
  -H 'Authorization: Bearer TOKEN_EXEMPLO' \
  -H 'Content-Type: application/json' \
  -d '{"limite":"1800"}'
```

Resposta `200 OK`

```json
{
  "dados": {
    "id": 21,
    "usuario_id": 7,
    "nome": "Cartão Viagem",
    "tipo": "cartao_credito",
    "dia_fechamento": 5,
    "dia_vencimento": 12,
    "limite": "1800.00"
  }
}
```

### Excluir um registro sem lançamentos

Neste exemplo, o ID fictício `22` pertence ao usuário autenticado e identifica um registro sem lançamentos.

```bash
curl -X DELETE 'http://localhost:3000/fontes-destinos/22' \
  -H 'Authorization: Bearer TOKEN_EXEMPLO'
```

A resposta `204 No Content` tem corpo vazio.

### Erros do CRUD

| Código HTTP | Situação |
| --- | --- |
| `400 Bad Request` | Corpo, campos ou ID inválidos. O parser do servidor também retorna `400` para JSON malformado. |
| `401 Unauthorized` | Bloqueio temporário no servidor ou identidade ausente ou inválida no router. |
| `404 Not Found` | ID inexistente ou de outro usuário em uma consulta, atualização ou exclusão. |
| `409 Conflict` | Nome duplicado para o usuário, vínculo que impede a exclusão ou a mudança de tipo, ou referência indisponível no banco. |
| `500 Internal Server Error` | Falha interna, com mensagem genérica para o cliente. |

O router converte os erros de domínio em `ErroHttp`. O middleware global retorna `erro` como texto e inclui `campos` quando a validação fornece detalhes. Um nome duplicado retorna `409 Conflict` com este JSON. [Router do CRUD](../routes/fontesDestinos.js) · [Model do CRUD](../models/FonteDestino.js) · [ErroHttp](../utils/erros.js)

```json
{
  "erro": "Já existe uma fonte ou destino com esse nome para o usuário."
}
```

## 3. Relatório por fontes e destinos (RF8)

`GET /relatorios/fontes-destinos` exige os parâmetros de query `inicio` e `fim`. Cada parâmetro deve aparecer uma vez e conter uma data real no formato `AAAA-MM-DD`, de `1000-01-01` a `9999-12-31`. O período inclui as duas datas e aceita `inicio` igual a `fim`. Datas inexistentes, parâmetros repetidos, arrays, valores ausentes ou ordem invertida retornam `400 Bad Request` com `campos.periodo`. A validação ocorre antes de chamar o model.

Este exemplo autenticado aplica-se **após a integração do JWT definitivo**.

```bash
curl 'http://localhost:3000/relatorios/fontes-destinos?inicio=2026-11-01&fim=2026-11-30' \
  -H 'Authorization: Bearer TOKEN_EXEMPLO'
```

Resposta `200 OK` com dados fictícios

```json
{
  "periodo": {
    "inicio": "2026-11-01",
    "fim": "2026-11-30"
  },
  "entradas": [
    { "id": 12, "nome": "Conta Corrente", "tipo": "conta", "total": 120.3 },
    { "id": 18, "nome": "Salário", "tipo": "renda", "total": 2500 }
  ],
  "saidas": [
    { "id": 21, "nome": "Cartão Viagem", "tipo": "cartao_credito", "total": 80.5 },
    { "id": 12, "nome": "Conta Corrente", "tipo": "conta", "total": 140.1 }
  ],
  "contas": [
    { "id": 12, "nome": "Conta Corrente", "entradas": 120.3, "saidas": 140.1, "saldo": -19.8 },
    { "id": 13, "nome": "Reserva", "entradas": 0, "saidas": 0, "saldo": 0 }
  ]
}
```

- `entradas` soma os lançamentos de entrada por fonte e `saidas` soma os lançamentos de saída por destino. Cada lista inclui apenas registros com movimentação naquela direção. Uma conta também pode receber entradas.
- `contas` inclui cada registro do tipo `conta`. O `saldo` é a movimentação líquida no período, calculada como `entradas − saidas`. O saldo bancário acumulado pode incluir um saldo inicial e movimentações de outros períodos.
- Uma conta sem movimentação aparece em `contas` com entradas, saídas e saldo iguais a zero. O limite do cartão é um dado cadastral e fica fora dos totais e saldos do RF8.
- Cada parcela conta uma vez pelo valor e pela data registrados na própria linha de lançamento. O cálculo considera somente as parcelas do período e é independente da previsão de faturas.
- A consulta usa `LEFT JOIN` com os filtros de usuário e data na associação aos lançamentos, preserva as contas sem movimento e agrupa por fonte ou destino. Cada lista segue a ordem por nome e ID. Movimentações vinculadas a partir de outro usuário ficam fora da soma.

As três listas são arrays e podem vir vazias com `200 OK`. Um usuário sem fontes ou destinos recebe arrays vazios em `entradas`, `saidas` e `contas`. O RF8 devolve `401` enquanto estiver bloqueado no servidor ou quando a identidade estiver ausente ou for inválida. Erros inesperados retornam `500` com mensagem genérica. [Router de relatórios](../routes/relatorios.js) · [Model de relatórios](../models/Relatorio.js) · [Validação de datas](../utils/datas.js)

## 4. Autenticação e segurança

O CRUD e o RF8 obtêm o usuário exclusivamente de `req.auth.id`. Os routers aceitam um inteiro positivo dentro do intervalo de `INT` do MySQL ou sua representação textual em dígitos. Campos enviados pelo cliente ficam fora da escolha da identidade. No CRUD, incluir `usuario_id` no corpo também constitui erro de validação.

Os models vinculam os valores das consultas com parâmetros `?`. O CRUD filtra as leituras, atualizações e exclusões pelo `usuario_id` e grava o proprietário com o ID autenticado. Um ID de outro usuário recebe o mesmo `404` de um ID inexistente. O RF8 restringe tanto as fontes e destinos quanto os lançamentos à identidade informada, inclusive quando um lançamento referencia uma fonte de outro usuário. [Model do CRUD](../models/FonteDestino.js) · [Model de relatórios](../models/Relatorio.js)

O `authMock` em uso na montagem geral de `/relatorios` atribui `req.auth.id = 2` a toda requisição que recebe e dispensa a validação de token. A equipe ainda precisa integrar o JWT definitivo para liberar os endpoints desta documentação. O servidor contém dois bloqueios temporários. [Middleware temporário](../middleware/authMock.js) · [Montagem do servidor](../server.js)

| Montagem em `server.js` | Comportamento atual |
| --- | --- |
| `/fontes-destinos` | O bloqueio retorna `401` antes de executar o router da Issue #12. |
| `/relatorios/fontes-destinos` | A montagem específica retorna `401` antes da montagem geral de `/relatorios` e, portanto, antes do `authMock`. O bloqueio cobre as variantes aceitas pelo Express com maiúsculas, barra final e `HEAD`. |

### Integração futura do JWT

1. Use o middleware JWT da equipe na montagem de `/fontes-destinos` no lugar do bloqueio atual. O middleware deve validar a assinatura e a expiração do token e preencher `req.auth.id` com a identidade verificada antes de chamar o router.
2. Substitua o `authMock` pelo middleware JWT real na montagem geral de `/relatorios`. Remova o bloqueio específico de `/relatorios/fontes-destinos` somente depois que essa montagem estiver protegida.

## 5. Testes automatizados

| Suíte | Cobertura | Aprovados |
| --- | --- | ---: |
| [`testes/fontesDestinos.integracao.test.js`](../testes/fontesDestinos.integracao.test.js) | CRUD real no MySQL, incluindo validações, isolamento, duplicidade e vínculos. | 9 |
| [`testes/fontesDestinos.rotas.test.js`](../testes/fontesDestinos.rotas.test.js) | Contrato HTTP do CRUD e bloqueio dos cinco endpoints na montagem do servidor. | 19 |
| [`testes/relatorioFontesDestinos.integracao.test.js`](../testes/relatorioFontesDestinos.integracao.test.js) | RF8 real no MySQL, incluindo agregação, datas de fronteira, vínculos cruzados, valores monetários, parcelas e preservação dos registros. | 20 |
| [`testes/relatorioFontesDestinos.rotas.test.js`](../testes/relatorioFontesDestinos.rotas.test.js) | Identidade, validação do período, formato do JSON, erros HTTP, bloqueio do RF8 e funcionamento da montagem de faturas. | 26 |
| **Total nas execuções individuais** | **Nenhuma falha registrada** | **74** |

As contagens registram as execuções individuais já realizadas. Nas suítes de integração, o total do `node:test` inclui o teste pai que prepara e encerra os subtestes.

As suítes de integração usam os models e o pool reais, com uma conexão auxiliar para preparar e limpar os dados. Conferem `DB_NAME` e executam `SELECT DATABASE()` no pool e na conexão auxiliar antes de inserir. Criam registros exclusivos de cada execução e limpam apenas os registros inseridos, na ordem lançamentos, fontes e destinos, categorias e usuários. O pool e a conexão auxiliar são encerrados ao final.

As suítes HTTP fazem requisições reais em uma aplicação Express de teste em `127.0.0.1` com porta dinâmica. Exercitam os routers e o middleware de erros com models e identidade simulados. Para verificar a montagem em `server.js`, elas substituem as dependências e interceptam `listen`. Esses testes dispensam MySQL, credenciais e a inicialização do servidor principal.

### Preparação segura de `financas_teste`

O banco isolado deve estar preparado com as tabelas `usuarios`, `categorias`, `fontes_destinos` e `lancamentos`, incluindo as restrições e chaves estrangeiras do schema.

`CREATE TABLE IF NOT EXISTS` cria apenas tabelas ausentes. As tabelas existentes mantêm a estrutura atual, mesmo quando faltam colunas, restrições ou índices. Confira se a estrutura de `financas_teste` corresponde ao schema antes de executar as suítes.

1. Em uma instância destinada a testes, providencie o banco `financas_teste` se ele ainda não existir. Se for necessário criá-lo, use uma instrução que indique explicitamente `financas_teste`, como `CREATE DATABASE IF NOT EXISTS financas_teste`.
2. Faça uma cópia temporária de `database/schema.sql` fora dos arquivos do projeto. Remova da **cópia** as instruções iniciais `CREATE DATABASE IF NOT EXISTS financas` e `USE financas`. Mantenha os comandos `CREATE TABLE` e as restrições na ordem original. Confira que a cópia contém apenas as definições das tabelas, sem comandos de criação ou seleção de banco e sem referências qualificadas a `financas`.
3. Abra uma conexão MySQL selecionando explicitamente `financas_teste` e use uma conta com acesso restrito a esse banco. Confirme que `SELECT DATABASE()` retorna `financas_teste` e só então aplique, nessa mesma sessão, as definições de tabela da cópia revisada.
4. Para as suítes de integração, configure `DB_HOST`, `DB_PORT`, `DB_USER` e `DB_PASSWORD` para a instância de testes. A conta das suítes precisa de permissões de `SELECT`, `INSERT`, `UPDATE` e `DELETE` em `financas_teste`. Os comandos de execução fixam `DB_NAME=financas_teste` e desativam a sobrescrita das variáveis pelo `dotenv`.

Para preparar o banco isolado, deixe `npm run db:init` e `npm run db:seed` fora do procedimento. O primeiro executa o schema original, que cria e seleciona explicitamente `financas`. O segundo carrega dados de demonstração com IDs fixos e remove registros por esses IDs antes de inserir. As suítes preparam seus próprios dados. [Schema](../database/schema.sql) · [Inicialização](../database/init.js) · [Seed](../database/seed.js) · [Conexão](../database/connection.js)

### Comandos de execução

Execute cada suíte separadamente a partir da raiz do projeto, em um shell compatível com a sintaxe de variáveis abaixo.

```bash
DOTENV_OVERRIDE=false DB_NAME=financas_teste node --test testes/fontesDestinos.integracao.test.js
node --test testes/fontesDestinos.rotas.test.js
DOTENV_OVERRIDE=false DB_NAME=financas_teste node --test testes/relatorioFontesDestinos.integracao.test.js
node --test testes/relatorioFontesDestinos.rotas.test.js
```

## 6. Arquivos e responsabilidades

| Arquivo | Responsabilidade |
| --- | --- |
| [`models/FonteDestino.js`](../models/FonteDestino.js) | Issue #12. Valida, persiste e consulta fontes e destinos do usuário e traduz conflitos do banco. |
| [`routes/fontesDestinos.js`](../routes/fontesDestinos.js) | Issue #12. Identifica o usuário em `req.auth.id` e implementa o contrato HTTP do CRUD. |
| [`models/Relatorio.js`](../models/Relatorio.js) | Issue #13. O método `fontesDestinos` agrega o RF8. O método `faturas` atende ao relatório de faturas existente. |
| [`routes/relatorios.js`](../routes/relatorios.js) | Issue #13. A rota `/fontes-destinos` valida o período e chama o model. O mesmo router contém `/faturas`. |
| [`server.js`](../server.js) | Monta o CRUD e os relatórios, aplica os bloqueios temporários e formata as respostas de erro. |
| [`testes/fontesDestinos.integracao.test.js`](../testes/fontesDestinos.integracao.test.js) e [`testes/fontesDestinos.rotas.test.js`](../testes/fontesDestinos.rotas.test.js) | Verificam o model e o contrato HTTP da Issue #12. |
| [`testes/relatorioFontesDestinos.integracao.test.js`](../testes/relatorioFontesDestinos.integracao.test.js) e [`testes/relatorioFontesDestinos.rotas.test.js`](../testes/relatorioFontesDestinos.rotas.test.js) | Verificam a agregação real e o contrato HTTP do RF8 da Issue #13. |

## 7. Limitações e pendências

- Integrar o JWT definitivo antes de liberar o CRUD e o RF8 no servidor principal.
- Exercitar o fluxo de ponta a ponta com autenticação real, servidor e banco na mesma execução. As suítes atuais cobrem o MySQL e o contrato HTTP em execuções separadas.
- Os cálculos do RF8 usam valores `DECIMAL` no MySQL. Totais muito grandes podem perder precisão nos centavos ao serem convertidos para `Number` para compor o JSON. O `limite` do CRUD permanece como string decimal.
- Após a integração do JWT, revisar e executar novamente os testes de montagem que hoje esperam `401` incondicional. Verificar que tokens ausentes, inválidos ou expirados recebem `401`, que tokens válidos liberam o acesso e que o isolamento entre usuários permanece.
