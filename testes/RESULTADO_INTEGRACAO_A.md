# Testes do integrante A

Execucao: 2026-11-26T11:52:26.221Z

Banco temporario exclusivo; servidor iniciado em porta livre; banco removido ao finalizar.

| Caso | Resultado |
| --- | --- |
| Cadastro normaliza dados, aplica bcrypt e cria os registros padrao | PASSOU |
| Cadastro rejeita campos invalidos e CPF com digito incorreto | PASSOU |
| E-mail e CPF duplicados retornam 409 indicando o campo | PASSOU |
| Login valida credenciais, emite JWT com expiracao e permite consultar /me | PASSOU |
| Rotas protegidas rejeitam token ausente, adulterado e expirado | PASSOU |
| Categorias permitem CRUD, filtro e repeticao do nome em tipos diferentes | PASSOU |
| Categorias rejeitam IDs e dados invalidos e isolam edicao/exclusao | PASSOU |
| Lancamentos usam usuario do token e validam propriedade e tipo dos vinculos | PASSOU |
| Categoria com lancamento vinculado nao pode ser excluida | PASSOU |
| Relatorio agrega categorias, ordena totais, calcula percentuais e variacoes | PASSOU |
| Relatorio rejeita datas ausentes, impossiveis e periodo invertido | PASSOU |
| Listagem, atualizacao e exclusao de lancamentos usam o model atualizado | PASSOU |
| Relatorio de faturas continua acessivel apos integrar categorias | PASSOU |
| Cadastro faz rollback real quando uma insercao de categoria falha | PASSOU |
| JSON invalido recebe 400 e rota inexistente recebe 404 | PASSOU |

Limites: nao valida o CRUD de fontes/destinos, seu relatorio ou todos os calculos de faturas. Estes pertencem aos outros integrantes.
