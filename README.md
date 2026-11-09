# API de Controle Financeiro

API REST para gerenciamento de finanças pessoais, desenvolvida como projeto avaliativo da disciplina **Programação Web Back-end**.

Aqui está o [link](https://costasilvati.github.io/IntroNodeJS/projeto-api-financas.html) da página de instruções feita pela professora.

O sistema permite cadastrar usuários, gerenciar categorias, fontes e destinos financeiros, registrar movimentações e gerar relatórios financeiros.

## Tecnologias

- Node.js
- Express
- MySQL
- mysql2
- JWT (jsonwebtoken e express-jwt)
- bcrypt
- dotenv
- nodemon

## Organização do projeto

```text
api-financas/
├── database/
│   ├── connection.js
│   ├── schema.sql
│   └── seed.sql
├── Docs/
│   ├── api_authentication_flow
│   ├── Sequencia_Cadastro_Auth
│   └── Sequencia_Rotas_Protegidas
├── middleware/
│   └── auth.js
├── models/
│   ├── Usuario.js
│   ├── Categoria.js
│   ├── FonteDestino.js
│   ├── Lancamento.js
│   └── Relatorio.js
├── routes/
│   ├── auth.js
│   ├── categorias.js
│   ├── fontesDestinos.js
│   ├── lancamentos.js
│   └── relatorios.js
├── utils/
│   ├── cpf.js
│   ├── parcelas.js
│   └── faturas.js
├── testes/
│   └── requisicoes.md
├── .env.example
├── .gitignore
├── package.json
├── README.md
└── server.js
```

## Divisão de responsabilidades

O desenvolvimento será realizado por três integrantes, utilizando divisão por domínio. Cada integrante será responsável pelo desenvolvimento completo de suas funcionalidades, incluindo banco de dados, models, consultas SQL, rotas e validações.

## Diagramas do Projeto

Esta seção apresenta os diagramas utilizados para documentar a estrutura do banco de dados e o fluxo de funcionamento da API.

<details><summary><b>Clique aqui para expandir a seção</b></summary>

### Diagrama Entidade-Relacionamento (DER)

Representa as entidades do sistema, seus atributos, chaves primárias, chaves estrangeiras e relacionamentos entre as tabelas.

<details><summary><b>Clique aqui para expandir a imagem</b></summary>

![DER_API_Financas.svg](./Docs/DER_API_Financas.svg)

</details>

### Diagramas de Sequência

#### Cadastro e Autenticação

Representa o fluxo de cadastro de usuários, incluindo validações, criptografia de senha e criação dos registros iniciais, além do processo de autenticação e geração do token JWT.

<details><summary><b>Clique aqui para expandir a imagem</b></summary>

![Sequencia_Cadastro_Auth.svg](./Docs/Sequencia_Cadastro_Auth.svg)

</details>

#### Rotas Protegidas

Representa o fluxo de acesso às rotas protegidas da API, desde o envio do token JWT até a validação da autenticação, identificação do usuário e execução das operações nos modelos e no banco de dados.

<details><summary><b>Clique aqui para expandir a imagem</b></summary>

![Sequencia_Rotas_Protegidas.svg](./Docs/Sequencia_Rotas_Protegidas.svg)

</details>

</details>

### - [Thiago Dutra da Silva](https://github.com/SimonR556) — Usuários, autenticação e categorias

- Cadastro e autenticação de usuários.
- Hash de senhas com bcrypt.
- Geração e validação de JWT.
- Middleware de autenticação.
- CRUD de categorias.
- Relatório por categoria.
- Validação de CPF.

### - [João Levi Cabral Piotto](https://github.com/joaolevicabralpiotto) — Fontes e destinos

- Modelagem e gerenciamento de fontes e destinos.
- CRUD de fontes e destinos.
- Validações de contas, rendas e cartões de crédito.
- Relatório por fonte/destino.

### - [Gabriel Santos Afini da Silva](https://github.com/AzumaNoDoragon) — Lançamentos e faturas

- Modelagem e gerenciamento de lançamentos.
- CRUD de lançamentos.
- Filtros e paginação.
- Resumo financeiro.
- Compras parceladas.
- Previsão de faturas de cartão de crédito.

### Responsabilidades compartilhadas

- Estrutura inicial e configuração do projeto.
- Integração dos módulos.
- Consolidação do banco de dados.
- Dados para demonstração (`seed.sql`).
- Testes de integração.
- Documentação e apresentação.

## Instalação e execução

### 1. Clonar o repositório

```bash
git clone [URL_DO_REPOSITORIO](https://github.com/AzumaNoDoragon/projetoBackEnd)
cd projetoBackEnd
```

### 2. Instalar dependências

```bash
npm install
```

### 3. Configurar variáveis de ambiente

Copie `.env.example` para `.env` e configure as credenciais do MySQL e a chave secreta JWT.

### 4. Criar o banco de dados

Execute o comando:

```text
npm run db:init
```
Este comando cria as tabelas, caso elas não existam

### 5. Iniciar a aplicação

Desenvolvimento:

```bash
npm run dev
```

Execução normal:

```bash
npm start
```

## Organização do desenvolvimento

As atividades serão acompanhadas por meio do GitHub Issues e GitHub Projects.

- Cada funcionalidade terá uma Issue específica.
- As Issues serão atribuídas aos respectivos integrantes.
- Commits devem ser incrementais e descrever as alterações realizadas.
- As alterações serão integradas por Pull Requests.
- Funcionalidades concluídas deverão ser testadas antes de serem consideradas finalizadas.

## Regras de desenvolvimento

- Utilizar CommonJS (`require` e `module.exports`).
- Utilizar `express.Router()` para separar as rotas.
- Manter as consultas SQL exclusivamente em `models/`.
- Utilizar consultas parametrizadas no MySQL.
- Proteger as rotas privadas com JWT.
- Utilizar `req.auth.id` para identificar o usuário autenticado.
- Garantir que cada usuário tenha acesso somente aos próprios dados.
- Não versionar o arquivo `.env`.

## Padrão de Commits

Para manter o histórico do projeto organizado e facilitar a identificação das alterações realizadas por cada integrante, será utilizado um padrão de mensagens baseado no **Conventional Commits**.

As mensagens devem ser objetivas, descrever a alteração realizada e, sempre que possível, referenciar a Issue correspondente no GitHub.

### 1. Tipos de commit

| Tipo | Descrição | Quando utilizar |
|---|---|---|
| `Feat` | Nova funcionalidade. | Implementação de uma rota, endpoint, autenticação ou funcionalidade da API. |
| `Fix` | Correção de erros ou comportamentos inesperados. | Correção de validações, consultas SQL, cálculos ou regras de negócio. |
| `Docs` | Alterações na documentação. | Atualização do README, comentários explicativos ou documentação de endpoints. |
| `Chore` | Tarefas de manutenção e configuração. | Configuração do ambiente, dependências, scripts, `.gitignore` ou organização de diretórios. |
| `Refact` | Reestruturação do código sem alterar seu comportamento. | Melhorias na organização de funções, classes, modelos ou rotas. |
| `Test` | Criação ou alteração de testes. | Testes de endpoints, validações, autenticação e regras de negócio. |
| `Style` | Alterações de formatação sem modificar a lógica. | Ajustes de indentação, espaçamento e padronização visual do código. |

### 2. Formato da mensagem

Utilize o seguinte formato:

```text
Tipo: descrição breve da alteração (#ID)
```

Exemplos:

```text
Feat: implementa cadastro de lançamentos (#3)
Fix: corrige validação do valor das parcelas (#4)
Docs: documenta os endpoints de autenticação (#8)
Chore: configura conexão com o banco de dados (#6)
Refact: centraliza validações de categorias (#9)
Test: adiciona testes para criação de lançamentos (#3)
```

**Orientações:**
- Utilize um dos tipos definidos na tabela.
- Escreva a descrição em português, de forma breve e objetiva.
- Prefira verbos no presente, como `implementa`, `corrige`, `adiciona` e `configura`.
- Referencie a Issue relacionada utilizando `(#ID)`.
- Evite mensagens genéricas como `alterações`, `atualizações`, `ajustes` ou `commit inicial`.

### 3. Como associar um commit a uma Issue

Para relacionar um commit a uma Issue sem fechá-la automaticamente, basta incluir sua referência na mensagem:

```text
Feat: implementa CRUD de lançamentos (#3)
```

Dessa forma, o commit fica associado à Issue, permitindo acompanhar o desenvolvimento sem encerrá-la.

### 4. Como fechar uma Issue automaticamente

Quando todas as tarefas e critérios de aceitação de uma Issue estiverem concluídos, utilize uma das palavras-chave reconhecidas pelo GitHub:

- `Closes #ID`
- `Fixes #ID`
- `Resolves #ID`

Exemplo:

```text
Feat: implementa CRUD completo de lançamentos (Closes #3)
```

Ao enviar esse commit para a branch padrão do repositório (por exemplo, `main`), o GitHub fechará automaticamente a Issue referenciada.

**Atenção:** a palavra-chave de fechamento deve ser utilizada somente quando a Issue estiver realmente concluída. Se ainda houver tarefas pendentes, utilize apenas `(#ID)` e não esqueça de marcar o checklista das issues.

### 5. Exemplos de utilização

| Situação | Mensagem |
|---|---|
| Início de uma funcionalidade | `Feat: inicia implementação de lançamentos (#3)` |
| Correção durante o desenvolvimento | `Fix: corrige cálculo do valor das parcelas (#4)` |
| Atualização da documentação | `Docs: atualiza instruções de instalação (#6)` |
| Conclusão de uma Issue | `Feat: finaliza CRUD de categorias (Closes #9)` |

**Regra geral:** cada commit deve representar uma alteração lógica e coerente. Não é necessário esperar a conclusão de uma Issue para realizar commits; o importante é manter o histórico atualizado e utilizar a referência adequada para acompanhar o progresso.

## Escopo do projeto

O projeto deverá atender aos requisitos funcionais RF1 a RF9 do enunciado, incluindo autenticação, gerenciamento de dados financeiros, parcelamentos e relatórios.

O desafio de saúde financeira poderá ser desenvolvido como funcionalidade adicional.

## Disciplina

Programação Web Back End — Projeto 2
API de Controle Financeiro
