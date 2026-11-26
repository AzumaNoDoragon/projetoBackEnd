# Testes de integração — integrante A

Escopo: cadastro, autenticação, categorias, relatório por categoria e integração com lançamentos e relatório de faturas.

## Executar

Na raiz do projeto, com as dependências instaladas e o MySQL iniciado:

```powershell
node testes/integracao-a.cjs
```

O script usa as credenciais do `.env`. O usuário do MySQL precisa poder criar e remover bancos. A execução usa um banco novo com nome `teste_financas_a_<timestamp>_<aleatório>` e inicia uma instância da API em uma porta livre. Não é necessário encerrar a API em execução na porta 3000.

As tabelas são criadas a partir de `database/schema.sql`, ignorando apenas os comandos que selecionam/criam o banco original. Todas as requisições de escrita ocorrem no banco temporário. O banco é removido no `finally`, inclusive se uma asserção falhar. Se o processo for encerrado à força, o `finally` pode não executar; o nome do banco temporário permite identificá-lo.

O resultado fica em `testes/RESULTADO_INTEGRACAO_A.md`. O processo termina com código diferente de zero quando há falha. O executor conta 16 testes: um teste principal e 15 cenários internos.

## Cobertura

| Cenário | Verificação |
| --- | --- |
| Cadastro | Nome/e-mail/CPF normalizados, bcrypt, nove categorias e uma conta padrão |
| Validações | Campos inválidos, senha fraca e CPF com dígito incorreto |
| Duplicidade | E-mail e CPF retornam 409 com identificação do campo |
| Login e perfil | Login, JWT com expiração, senha errada, usuário ausente e `/auth/me` |
| Proteção | Token ausente, inválido e expirado retornam 401 |
| Categorias | CRUD, filtro, duplicidade por tipo, nome igual em tipos diferentes e atualização sem mudar valores |
| Isolamento de categorias | Listagem privada; alteração/exclusão de categoria alheia retornam 404; corpo não escolhe o dono |
| Vínculos dos lançamentos | Categoria/fonte de outro usuário retornam 404 e categoria de tipo diferente retorna 400 |
| Categoria vinculada | Exclusão bloqueada com 409 |
| Relatório por categoria | SUM, totais, ordem, percentuais, variação, período anterior, categorias antigas e relatório vazio |
| Datas do relatório | Datas impossíveis, período invertido, parâmetros repetidos e dia bissexto |
| Integração dos lançamentos | Criação, listagem com resumo, atualização, exclusão e isolamento de detalhes/alteração/exclusão |
| Integração de faturas | Rota preservada, resposta sem cartões e validação do parâmetro meses |
| Transação | Falha na segunda inserção de categoria provoca rollback real e devolução da conexão ao pool |
| Respostas gerais | JSON inválido retorna 400; rota inexistente retorna 404 |

O teste de rollback substitui temporariamente o método de uma conexão do pool para provocar uma falha conhecida. As inserções e o rollback usam o MySQL real. A substituição ocorre somente no processo dos testes.

## Situação após a execução validada

Os 15 cenários passaram contra a versão `3d5f7b5` do projeto. Esta evidência cobre os fluxos acima; não certifica todos os requisitos das partes dos outros integrantes.

Pendências observadas para o grupo, fora da implementação do integrante A:

- O projeto inspecionado ainda não contém `routes/fontesDestinos.js` nem registra `/fontes-destinos` no servidor.
- O relatório `/relatorios/fontes-destinos` ainda não está implementado no router atual.
- `database/schema.sql` e o inicializador ainda usam o banco fixo `financas`, enquanto a aplicação seleciona o banco de `DB_NAME`. O grupo precisa alinhar a instalação para que as tabelas sejam criadas no banco configurado. O teste temporário não altera o inicializador.
- `testes/requisicoes.md` ainda menciona `authMock` e descreve exclusão de lançamento como 204; a implementação atual usa autenticação real e retorna 200 com a quantidade excluída. Essa documentação compartilhada precisa refletir a decisão final do grupo.
- Os cálculos completos de faturas, o seed para demonstração e o CRUD/relatório de fontes e destinos precisam da validação dos responsáveis.

## Referências

- Enunciado: https://costasilvati.github.io/IntroNodeJS/projeto-api-financas.html
- Executor de testes do Node.js: https://nodejs.org/api/test.html

Este roteiro e o script foram preparados com apoio de IA generativa (ChatGPT/Codex). Os integrantes devem compreender os cenários e saber explicar a implementação.
