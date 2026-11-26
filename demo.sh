#!/usr/bin/env bash
# Demonstração da API de Controle Financeiro, em etapas curtas (roteiro de 5 minutos).
#
#   ./demo.sh ajuda            mostra o roteiro sugerido
#   ./demo.sh preparar         db:init + db:seed (só em banco vazio)
#   ./demo.sh 1                cadastro e unicidade (409)
#   ./demo.sh 2                login, token e isolamento entre usuários
#   ./demo.sh 3                CRUD + compra parcelada + validação que falha
#   ./demo.sh 4                relatórios (categoria, fonte/destino, faturas)
#   ./demo.sh tudo             etapas 1 a 4
#   ./demo.sh limpar           apaga o que as etapas criaram (itens "DEMO ...")
#
# Opções (antes da etapa):  -r  rápido (sem pausar a cada requisição)
# Variáveis:  BASE_URL (padrão http://localhost:3000)   RAW=1 (mostra o JSON completo)
#             INICIO / FIM (período dos relatórios; padrão 2026-10-01 a 2026-10-31)
# Requisitos: bash (Git Bash no Windows serve), curl e node. A API precisa estar rodando (npm run dev)
# e o banco populado (npm run db:init && npm run db:seed).

BASE="${BASE_URL:-http://localhost:3000}"
SENHA="Senha1234"
HOJE="$(date +%F)"
INICIO="${INICIO:-2026-10-01}"; FIM="${FIM:-2026-10-31}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# IDs do seed (Bruno = usuário 2)
CAT_ENTRADA=10; CAT_ALIMENTACAO=12; CAT_EDUCACAO=17; FONTE_CONTA=6; FONTE_CARTAO=8
RAPIDO=""; TOTAL=0; DIVERGENTES=0

if [ -t 1 ]; then
  B=$'\e[1m'; D=$'\e[2m'; GRN=$'\e[32m'; RED=$'\e[31m'; YEL=$'\e[33m'; CYN=$'\e[36m'; N=$'\e[0m'
else B=""; D=""; GRN=""; RED=""; YEL=""; CYN=""; N=""; fi

# ---------- formatador de JSON (node) ----------
read -r -d '' NODE_FMT <<'JS'
let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
 const f=process.argv[1]||'json'; let j;
 try{j=JSON.parse(s)}catch{console.log(s);return}
 const R=n=>'R$ '+Number(n).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
 const P=n=>n===null||n===undefined?'—':Number(n).toLocaleString('pt-BR',{minimumFractionDigits:2})+'%';
 const out=console.log;
 if(f==='login'){out(JSON.stringify({token:(j.token||'').slice(0,28)+'…',usuario:j.usuario},null,2).replace(/^/gm,'  '));return}
 if(f==='lanc'){
  out(`  resumo: entradas ${R(j.resumo.entradas)} | saídas ${R(j.resumo.saidas)} | saldo ${R(j.resumo.saldo)}   (página ${j.pagina}/${j.totalPaginas})`);
  for(const i of j.itens)out(`  #${i.id}  ${i.data}  ${i.tipo.padEnd(7)} ${String(i.descricao).padEnd(22)} ${R(i.valor).padStart(13)}  parcela ${i.parcela.padEnd(5)} [${i.categoria.nome} / ${i.fonteDestino.nome}]`);
  return}
 if(f==='cats'){for(const c of j)out(`  #${c.id}  ${c.tipo.padEnd(7)} ${c.nome}`);return}
 if(f==='fontes'){for(const x of (j.dados??j))out(`  #${x.id}  ${x.tipo.padEnd(15)} ${x.nome}${x.limite?'  (limite '+R(x.limite)+', fecha dia '+x.dia_fechamento+', vence dia '+x.dia_vencimento+')':''}`);return}
 if(f==='cat'){
  out(`  Período ${j.periodo.inicio} a ${j.periodo.fim}   (comparado com ${j.periodoAnterior.inicio} a ${j.periodoAnterior.fim})`);
  for(const g of ['saidas','entradas']){
   out(`\n  ${g==='saidas'?'SAÍDAS':'ENTRADAS'}  total ${R(j[g].total)}`);
   for(const c of j[g].categorias)out(`    ${c.nome.padEnd(16)} ${R(c.total).padStart(13)}  ${P(c.percentual).padStart(8)}   anterior ${R(c.anterior).padStart(13)}   variação ${P(c.variacao)}`);
  } return}
 if(f==='fd'){
  out(`  Período ${j.periodo.inicio} a ${j.periodo.fim}`);
  out('\n  ENTRADAS por fonte');for(const x of j.entradas)out(`    ${x.nome.padEnd(18)} ${x.tipo.padEnd(15)} ${R(x.total).padStart(13)}`);
  out('\n  SAÍDAS por destino');for(const x of j.saidas)out(`    ${x.nome.padEnd(18)} ${x.tipo.padEnd(15)} ${R(x.total).padStart(13)}`);
  out('\n  SALDO das contas (entradas − saídas)');for(const x of j.contas)out(`    ${x.nome.padEnd(18)} entradas ${R(x.entradas).padStart(12)}  saídas ${R(x.saidas).padStart(12)}  saldo ${R(x.saldo).padStart(13)}`);
  return}
 if(f==='fat'){
  out(`  Referência de hoje: ${j.dataReferencia}`);
  for(const c of j.cartoes){
   out(`\n  ${c.nome}  (fecha dia ${c.diaFechamento}, vence dia ${c.diaVencimento})`);
   out(`  limite ${R(c.limite.total)} | utilizado ${R(c.limite.utilizado)} | disponível ${R(c.limite.disponivel)}`);
   [['ATUAL (aberta)',c.faturaAtual],...c.proximasFaturas.map(x=>['próxima',x])].forEach(([r,x])=>{
    out(`    fatura ${x.referencia} [${r}]  fecha ${x.fechamento}  vence ${x.vencimento}  total ${R(x.total)}`);
    for(const l of x.lancamentos)out(`        ${l.descricao.startsWith('DEMO')?'◀':' '} ${l.descricao.padEnd(30)} ${R(l.valor).padStart(12)}`);
   });
  } return}
 out(JSON.stringify(j,null,2));
});
JS

# ---------- utilidades ----------
pretty() { node -e "$NODE_FMT" json <<<"$BODY"; }
mostrar() {
  if [ -z "$BODY" ]; then echo "  ${D}(sem corpo)${N}"; return; fi
  if [ -n "$RAW" ] || [ -z "$1" ]; then pretty | sed 's/^/  /'; else node -e "$NODE_FMT" "$1" <<<"$BODY"; fi
}
jget() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);const v=eval(process.argv[1]);console.log(v===undefined||v===null?"":v)}catch(e){}})' "$1" <<<"$BODY"; }
nome_status() { case "$1" in 200) echo OK;; 201) echo Created;; 204) echo "No Content";; 400) echo "Bad Request";; 401) echo Unauthorized;; 404) echo "Not Found";; 409) echo Conflict;; 500) echo "Internal Server Error";; *) echo "";; esac; }
pausar() { [ -n "$RAPIDO" ] && return; read -r -p "  ${YEL}[Enter para executar]${N} " _ </dev/tty 2>/dev/null || true; }
titulo() { echo; echo "${B}${CYN}══════ $1 ══════${N}"; }

# chamada silenciosa: define CODE e BODY
chamar() { # METODO CAMINHO [CORPO] [TOKEN]
  local args=(-s -X "$1" -w $'\n%{http_code}')
  [ -n "$4" ] && args+=(-H "Authorization: Bearer $4")
  [ -n "$3" ] && args+=(-H "Content-Type: application/json" -d "$3")
  local resp; resp="$(curl "${args[@]}" "$BASE$2")"
  CODE="${resp##*$'\n'}"; BODY="${resp%$'\n'*}"
  [ "$CODE" = "$resp" ] && BODY=""
}
login_silencioso() { chamar POST /auth/login "{\"email\":\"$1\",\"senha\":\"$SENHA\"}"; jget "j.token"; }

# chamada de demonstração: mostra o curl, espera Enter, executa e confere o status esperado
req() { # "título" ESPERADO METODO CAMINHO [CORPO] [TOKEN] [FORMATO]
  local tit="$1" esp="$2" metodo="$3" caminho="$4" corpo="${5:-}" token="${6:-}" fmt="${7:-}"
  echo; echo "${B}▶ $tit${N}"
  local cmd="curl -X $metodo $BASE$caminho"
  [ -n "$token" ] && cmd+=" -H \"Authorization: Bearer \$TOKEN\""
  [ -n "$corpo" ] && cmd+=" -H \"Content-Type: application/json\" -d '$corpo'"
  echo "  ${D}\$ $cmd${N}"
  pausar
  chamar "$metodo" "$caminho" "$corpo" "$token"
  TOTAL=$((TOTAL+1))
  if [ "$CODE" = "000" ]; then echo "  ${RED}Sem resposta da API em $BASE. Rode npm run dev em outro terminal.${N}"; exit 1; fi
  if [ "$CODE" = "$esp" ]; then echo "  ${GRN}← $CODE $(nome_status "$CODE")  ✔${N}"
  else DIVERGENTES=$((DIVERGENTES+1)); echo "  ${RED}← $CODE $(nome_status "$CODE")  ✘ (esperado $esp)${N}"; fi
  mostrar "$fmt"
}

# ---------- etapas ----------
etapa_cadastro() {
  titulo "ETAPA 1 — Cadastro e unicidade (garantida pelo banco)"
  local ts; ts="$(date +%s)"
  local cpf; cpf="$(node -e '
   const dv=a=>{let s=0;for(let i=0;i<a.length;i++)s+=a[i]*(a.length+1-i);const r=(s*10)%11;return r===10?0:r};
   let c;do{const d=Array.from({length:9},()=>Math.floor(Math.random()*10));d.push(dv(d));d.push(dv(d));c=d.join("")}while(/^(\d)\1{10}$/.test(c));console.log(c)')"
  local cpf_fmt="${cpf:0:3}.${cpf:3:3}.${cpf:6:3}-${cpf:9:2}"
  local email="demo.$ts@email.com"
  req "Cadastro de usuário novo (senha vira hash bcrypt; nunca aparece na resposta)" 201 POST /auth/cadastro \
      "{\"nome\":\"Maria Demo\",\"email\":\"$email\",\"cpf\":\"$cpf\",\"senha\":\"$SENHA\"}"
  req "MESMO e-mail com letras MAIÚSCULAS (CPF diferente) → conflito no e-mail" 409 POST /auth/cadastro \
      "{\"nome\":\"Outra\",\"email\":\"$(printf '%s' "$email" | tr 'a-z' 'A-Z')\",\"cpf\":\"52998224725\",\"senha\":\"$SENHA\"}"
  req "MESMO CPF com pontuação (e-mail diferente) → conflito no CPF" 409 POST /auth/cadastro \
      "{\"nome\":\"Outra\",\"email\":\"outra.$ts@email.com\",\"cpf\":\"$cpf_fmt\",\"senha\":\"$SENHA\"}"
  req "CPF com dígito verificador errado → validação no servidor" 400 POST /auth/cadastro \
      "{\"nome\":\"Outra\",\"email\":\"cpf.$ts@email.com\",\"cpf\":\"529.982.247-24\",\"senha\":\"$SENHA\"}"
  chamar POST /auth/login "{\"email\":\"$email\",\"senha\":\"$SENHA\"}"; local t; t="$(jget j.token)"
  req "O cadastro (em transação) criou as categorias padrão do usuário novo" 200 GET /categorias "" "$t" cats
}

etapa_login() {
  titulo "ETAPA 2 — Login, proteção por token e isolamento entre usuários"
  req "Login do Bruno → JWT com expiração de 1h" 200 POST /auth/login \
      "{\"email\":\"bruno@email.com\",\"senha\":\"$SENHA\"}" "" login
  local tb ta; tb="$(login_silencioso bruno@email.com)"; ta="$(login_silencioso ana@email.com)"
  req "Rota protegida SEM token → 401 em JSON" 401 GET /lancamentos
  req "Rota protegida com token ADULTERADO → 401" 401 GET /lancamentos "" "${tb}x"
  req "GET /auth/me → dados do dono do token (sem senha_hash)" 200 GET /auth/me "" "$tb"
  chamar GET "/lancamentos?inicio=2026-09-01&fim=2026-11-30" "" "$ta"
  local id_ana; id_ana="$(jget 'j.itens[0].id')"
  echo; echo "${B}Lançamento nº $id_ana pertence à ANA. O Bruno tenta acessá-lo:${N}"
  req "Bruno LÊ o lançamento da Ana → 404 (para ele, não existe)" 404 GET "/lancamentos/$id_ana" "" "$tb"
  req "Bruno ALTERA o lançamento da Ana → 404" 404 PUT "/lancamentos/$id_ana" \
      "{\"tipo\":\"saida\",\"descricao\":\"invasão\",\"valor\":1,\"data\":\"$HOJE\",\"categoriaId\":$CAT_ALIMENTACAO,\"fonteDestinoId\":$FONTE_CONTA}" "$tb"
  req "Bruno EXCLUI o lançamento da Ana → 404" 404 DELETE "/lancamentos/$id_ana" "" "$tb"
}

etapa_crud() {
  titulo "ETAPA 3 — CRUD, compra parcelada e validação que falha"
  local tb; tb="$(login_silencioso bruno@email.com)"
  echo; echo "${B}Categorias${N}"
  req "Listar categorias de saída" 200 GET "/categorias?tipo=saida" "" "$tb" cats
  req "Criar categoria" 201 POST /categorias '{"nome":"DEMO Pets","tipo":"saida"}' "$tb"
  local id_cat; id_cat="$(jget j.id)"
  req "Atualizar categoria" 200 PUT "/categorias/$id_cat" '{"nome":"DEMO Pets e veterinário","tipo":"saida"}' "$tb"
  req "Excluir categoria COM lançamentos (Alimentação) → 409 explicativo" 409 DELETE "/categorias/$CAT_ALIMENTACAO" "" "$tb"
  req "Excluir categoria sem uso" 204 DELETE "/categorias/$id_cat" "" "$tb"

  echo; echo "${B}Fontes e destinos${N}"
  req "Cartão de crédito sem dias de fechamento/vencimento → 400" 400 POST /fontes-destinos '{"nome":"DEMO Cartão","tipo":"cartao_credito"}' "$tb"
  req "Criar cartão completo" 201 POST /fontes-destinos \
      '{"nome":"DEMO Cartão","tipo":"cartao_credito","dia_fechamento":15,"dia_vencimento":22,"limite":"3000.00"}' "$tb"
  local id_fonte; id_fonte="$(jget '(j.dados??j).id')"
  req "Listar fontes e destinos" 200 GET /fontes-destinos "" "$tb" fontes
  req "Excluir cartão criado" 204 DELETE "/fontes-destinos/$id_fonte" "" "$tb"

  echo; echo "${B}Lançamentos${N}"
  req "Criar lançamento simples" 201 POST /lancamentos \
      "{\"tipo\":\"saida\",\"descricao\":\"DEMO Almoço\",\"valor\":45.9,\"data\":\"$HOJE\",\"categoriaId\":$CAT_ALIMENTACAO,\"fonteDestinoId\":$FONTE_CONTA}" "$tb"
  local id_l; id_l="$(jget j.id)"
  req "Detalhar o lançamento" 200 GET "/lancamentos/$id_l" "" "$tb"
  req "Atualizar o lançamento" 200 PUT "/lancamentos/$id_l" \
      "{\"tipo\":\"saida\",\"descricao\":\"DEMO Almoço (ajustado)\",\"valor\":52,\"data\":\"$HOJE\",\"categoriaId\":$CAT_ALIMENTACAO,\"fonteDestinoId\":$FONTE_CONTA}" "$tb"
  req "VALIDAÇÃO QUE FALHA: saída usando categoria de entrada (Salário)" 400 POST /lancamentos \
      "{\"tipo\":\"saida\",\"descricao\":\"DEMO inválido\",\"valor\":10,\"data\":\"$HOJE\",\"categoriaId\":$CAT_ENTRADA,\"fonteDestinoId\":$FONTE_CONTA}" "$tb"
  req "COMPRA PARCELADA no cartão: R\$ 1.000,00 em 3x (centavos divididos sem perda)" 201 POST /lancamentos \
      "{\"tipo\":\"saida\",\"descricao\":\"DEMO Notebook\",\"valor\":1000,\"data\":\"$HOJE\",\"categoriaId\":$CAT_EDUCACAO,\"fonteDestinoId\":$FONTE_CARTAO,\"parcelas\":3}" "$tb"
  req "Listar as parcelas geradas (mesmo grupo, 1/3, 2/3 e 3/3)" 200 GET "/lancamentos?inicio=$HOJE&fim=$HOJE&fonteDestinoId=$FONTE_CARTAO" "" "$tb" lanc
  echo; echo "${D}(A compra parcelada fica para a etapa 4 mostrar em qual fatura caiu cada parcela. Use ./demo.sh limpar ao final.)${N}"
}

etapa_relatorios() {
  titulo "ETAPA 4 — Relatórios"
  local tb; tb="$(login_silencioso bruno@email.com)"
  req "Por categoria: saídas com %, entradas e comparação com o período anterior" 200 GET "/relatorios/categorias?inicio=$INICIO&fim=$FIM" "" "$tb" cat
  req "Por fonte/destino: entradas por fonte, saídas por destino e saldo das contas" 200 GET "/relatorios/fontes-destinos?inicio=2026-11-01&fim=2026-11-30" "" "$tb" fd
  req "Previsão de faturas: limite, fatura atual e próximas (◀ = parcelas da compra da etapa 3)" 200 GET "/relatorios/faturas?meses=3" "" "$tb" fat
}

limpar() {
  titulo "Limpando os itens DEMO"
  local tb; tb="$(login_silencioso bruno@email.com)"; local n=0 id
  chamar GET "/lancamentos?inicio=$HOJE&fim=$HOJE" "" "$tb"
  for id in $(jget "j.itens.filter(i=>i.descricao.startsWith('DEMO')).map(i=>i.id).join(' ')"); do
    chamar DELETE "/lancamentos/$id?todasParcelas=true" "" "$tb"; [ "$CODE" = 204 ] && n=$((n+1))
  done
  chamar GET /categorias "" "$tb"
  for id in $(jget "j.filter(c=>c.nome.startsWith('DEMO')).map(c=>c.id).join(' ')"); do chamar DELETE "/categorias/$id" "" "$tb"; done
  chamar GET /fontes-destinos "" "$tb"
  for id in $(jget "(j.dados??j).filter(f=>f.nome.startsWith('DEMO')).map(f=>f.id).join(' ')"); do chamar DELETE "/fontes-destinos/$id" "" "$tb"; done
  echo "  ${GRN}Pronto.${N} Lançamentos DEMO removidos (inclui todas as parcelas): $n chamada(s) de exclusão."
}

preparar() {
  titulo "Preparando o banco (db:init + db:seed)"
  cd "$DIR" && npm run db:init && npm run db:seed
  echo; echo "Agora, em OUTRO terminal: npm run dev"
}

ajuda() {
cat <<TXT
${B}Roteiro sugerido para 5 minutos${N}
  0:00  Estrutura de pastas e schema.sql, uma classe de model, um arquivo de rotas e o middleware (mostrar no editor)
  1:00  ./demo.sh 1     cadastro: 201, 409 de e-mail (maiúsculas) e de CPF (com pontuação)
  1:45  ./demo.sh 2     login, 401 sem token, 404 ao acessar lançamento de outro usuário
  2:30  ./demo.sh 3     CRUD, compra parcelada, validação que falha
  3:45  ./demo.sh 4     relatórios, com a compra do passo anterior caindo em cada fatura
  4:45  ./demo.sh limpar

${B}Dicas${N}
  • Sem pausas (ensaio):          ./demo.sh -r tudo
  • JSON completo em vez de resumo: RAW=1 ./demo.sh 4
  • Antes de apresentar:          npm run db:init && npm run db:seed (banco vazio) e npm run dev em outro terminal
  • Usuários do seed:             ana@email.com (id 1) e bruno@email.com (id 2), senha $SENHA
TXT
}

# ---------- principal ----------
while [ "${1:-}" = "-r" ]; do RAPIDO=1; shift; done
ETAPA="${1:-ajuda}"
case "$ETAPA" in ajuda|-h|--help|preparar) ;; *)
  command -v curl >/dev/null || { echo "curl não encontrado."; exit 1; }
  command -v node >/dev/null || { echo "node não encontrado."; exit 1; }
  [ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/")" = "000" ] && { echo "${RED}API fora do ar em $BASE.${N} Rode: npm run dev"; exit 1; } ;;
esac
case "$ETAPA" in
  1|cadastro)   etapa_cadastro ;;
  2|login)      etapa_login ;;
  3|crud)       etapa_crud ;;
  4|relatorios) etapa_relatorios ;;
  tudo)         etapa_cadastro; etapa_login; etapa_crud; etapa_relatorios ;;
  limpar)       limpar ;;
  preparar)     preparar ;;
  ajuda|-h|--help) ajuda ;;
  *) echo "Etapa desconhecida: $ETAPA"; ajuda; exit 1 ;;
esac
[ "$TOTAL" -gt 0 ] && { echo; echo "${B}Resumo:${N} $((TOTAL-DIVERGENTES))/$TOTAL requisições com o status esperado."; [ "$DIVERGENTES" -gt 0 ] && echo "${RED}$DIVERGENTES divergente(s) — veja as linhas ✘ acima.${N}"; }
exit 0