# Alta Fix — Gestão Comercial

Dashboard comercial da Alta Fix Distribuidora de Peças. Lê planilhas do ERP (324, 740, 361, comparativo), consolida no Supabase, e apresenta painéis de faturamento, clientes, produtos e análises.

---

## Arquitetura

Frontend estático (HTML + CSS + JavaScript modular) hospedado no Cloudflare Pages.
Backend: Supabase (Postgres + Auth).
Sem build step — arquivos servidos diretamente.

### Estrutura de pastas
├── index.html # Estrutura única (todas as abas)
├── css/
│ └── style.css # Todo o CSS
└── js/
├── main.js # Bootstrap, tabs, listeners, auth
├── state.js # Estado global (state + ui + session)
├── utils.js # Helpers (fmtBRL, datas, normalização)
├── calc.js # Cálculos (RFM, ABC, projeções, metas)
├── supabase.js # Comunicação com o backend
├── importer.js # Parsing de planilhas (324, 740, 361)
└── views/
├── painel.js # Tela Painel (admin + vendedor)
├── clientes.js # Tela Clientes
├── produtos.js # Tela Produtos
├── analise.js # Comparativo YoY, Cidades, Fabricantes
└── config.js # Config, Importar, Vendedores, etc.

---

## Como rodar local

1. Abrir VS Code na pasta do projeto
2. Instalar extensão **Live Server** (Ritwick Dey)
3. Clicar com botão direito no `index.html` → **Open with Live Server**
4. Acessa `http://127.0.0.1:5500/index.html`

**Login:** email + senha cadastrados no Supabase Auth.

---

## Como fazer deploy

1. Fazer as mudanças no VS Code
2. `Ctrl + S` em cada arquivo
3. **Source Control** → mensagem descritiva → **Commit** → **Sync**
4. Cloudflare Pages rebuilda automaticamente em ~30s
5. URL de produção: `https://altafix.pages.dev`

**Credenciais:**
- GitHub: `ericpaiva88-collab/altafix-dashboard`
- Cloudflare Pages: projeto `altafix`
- Supabase: URL e anon key em `js/supabase.js`

---

## Modelo de dados (Supabase)

### Tabelas

| Tabela | Descrição |
|---|---|
| `filiais` | Filiais ativas (nome, UF, grupo) |
| `grupos` | Grupos de filiais |
| `vendedores` | Cadastro + metas + papel (vendedor/diretor/admin/ex) + `user_id` (auth) |
| `clientes` | Agregado por cliente (calculado a partir de `clientes_importacoes`) |
| `clientes_importacoes` | Uma linha por cliente × período. Fonte pra "novo"/"reativado" |
| `vendas_itens` | Uma linha por cliente × produto × período × **vendedor**. Fonte pro "modo vendedor" |
| `produtos` | Cadastro com curva ABC + estoque |
| `produtos_mes` | Produto × mês (fonte: 361) |
| `lancamentos` | Vendas diárias por vendedor (fonte: 324) |
| `cidades` | Ranking de cidades + lista de clientes por cidade (fonte: 740) |
| `comparativo` | YoY 2025 × 2026 |
| `metas` | Meta por vendedor × mês |
| `config` | Configurações gerais |
| `acoes_tratadas` | Marcações de ações resolvidas no painel |

### Chaves compostas importantes

- `clientes_importacoes`: `(filial_id, periodo_ini, periodo_fim, cliente_norm)` — reimportar o mesmo período substitui
- `vendas_itens`: `(filial_id, periodo_ini, periodo_fim, cliente_norm, produto_codigo, vendedor_id)`
- `produtos_mes`: `(filial_id, mes, codigo)`

### Funções RPC

- `admin_criar_usuario(p_email, p_senha, p_nome, p_papel, p_filial_id)` — cria no Auth + vincula ao vendedor
- `admin_deletar_usuario(p_email)` — apaga do Auth + desvincula

Ambas só funcionam se o chamador for `diretor`. Precisam do `pgcrypto` habilitado.

### RLS

**Todas as tabelas com RLS desabilitado.** Controle de acesso feito pela aplicação. Migração futura: RLS granular.

---

## Como funcionam as importações

### 324 Detalhado (ERP)
- Uma linha por item de venda
- Detecta o período do cabeçalho do arquivo
- **Importar diariamente a partir de set/2026** — cada dia é um período próprio
- Meses anteriores: importar mensal
- Alimenta: `clientes_importacoes`, `vendas_itens`, `lancamentos`, `produtos`, `clientes` (agregado)

### 740 Cidades
- Ranking de vendas por cidade
- **Importar mensal**
- **Importante:** é a fonte do campo "Cidade" dos clientes — o 324 não traz isso
- Alimenta: `cidades`

### 361 Curva ABC / Fabricantes
- Estoque + curva + fabricante
- **Importar mensal**
- Alimenta: `produtos_mes` e enriquece `produtos`

### Comparativo 2025×2026
- Opcional — só KPIs do ano passado
- Alimenta: `comparativo`

**Regra de ouro:** nunca reimportar o mesmo período sem necessidade — o app substitui (não soma).

---

## Design decisions & contexto

### Por que Painel tem o Faturado em destaque
Diretor e vendedores abrem o painel pra saber "estou bem?" e "quanto falta?". O `% da meta` fica ao lado do faturado como badge colorido. Meta, Falta, Pedidos e Projeção aparecem abaixo como contexto.

### Por que Painel tem seletor de mês
Quando vira o mês, o diretor precisa ver o mês novo **imediatamente** (metas zeradas, ritmo a bater), não o fechamento do anterior. O seletor começa no mês atual, mas permite voltar a qualquer mês com dados.

### Clientes — o que é "Vale/mês"
Não é a média de todo o histórico (isso inflava clientes que já foram grandes). É o **valor médio dos últimos 90 dias de atividade** do cliente:

- Pega os 90 dias antes da última compra dele
- Soma tudo que ele gastou nessa janela
- Divide por 3 (meses)

Exemplo: cliente que comprou R$ 30k em jan, R$ 30k em fev, R$ 30k em mar, e parou desde então. Hoje (10 meses depois) mostra Vale/mês R$ 30k — não R$ 3k/mês (média diluída) nem R$ 300k (histórico).

Para clientes com menos de 90 dias de histórico, o cálculo cai no antigo (total / meses desde a primeira compra).

Isso é recalculado **a cada importação de 324**. Se quiser forçar um recálculo sem reimportar, rode o SQL de recálculo (ver seção Bugs/Notas).

### Aba Ligações — o que faz
Tela dedicada a acompanhar a operação de televendas. Migrada do TeleVendas original (Google Sheets).

**O que mostra:**
- **5 KPIs** do período filtrado: total de ligações, vendas atribuídas, valor atribuído, taxa de conversão e tempo médio entre ligação e venda
- **Distribuição por status** — quantas em cada estado (prospecção / retornar / aguardando / venda / sem interesse)
- **Fila de trabalho** (atalhos no topo):
  - 🔴 **Atrasados** — próximos contatos que já venceram (últimos 90 dias)
  - 🟡 **Hoje** — agendados para hoje
  - 🟢 **Semana** — próximos 7 dias
- **Tabela** com filtros de busca, vendedor, status, conversão e período

**Default:** abre em "Este mês" com filtro de urgência vazio (mostra tudo do mês).

### Como funciona o cruzamento automático ligação → venda
A coluna "Conversão" de cada ligação não depende do vendedor preencher. Roda automaticamente:

1. Toda vez que um **324 é importado**, o app grava os clientes em `clientes_importacoes`
2. Um trigger do Postgres roda a função `recalcular_ligacoes_vendas()`
3. A função procura **a ligação mais recente do mesmo cliente**, feita **até 30 dias antes** da compra
4. Se encontra, cria um registro em `ligacoes_vendas` pareando os dois

**Regra de atribuição:** última ligação antes da compra, janela de 30 dias. Não importa o status que o vendedor marcou — se o cliente comprou, a ligação gerou a venda.

**Limitação conhecida:** importações diárias (set/2026 pra frente) têm data exata da venda. Importações mensais (mar/2026 a ago/2026) caem no dia 1 do mês, então ligações feitas no meio do mês podem não ser atribuídas. Reimportar os 324 diários antigos recalcula tudo automaticamente.

### Tabelas novas
- `ligacoes` — cada registro de ligação feita (empresa, contato, status, valor, próximo contato, obs)
- `ligacoes_vendas` — pareamento entre ligação e venda, preenchido automaticamente
- `migracao_colab_map` — tabela temporária de mapeamento entre IDs do TeleVendas e vendedores do Alta Fix (só usada durante a migração)

### Migração do TeleVendas
- 2001 ligações migradas do Google Sheets em 03/10/2026
- Diego, Kalifer e Joyce nunca usaram o TeleVendas (0 registros)
- André Luis teve ~120 registros, redirecionados para Romulo (não está mais ativo)
- Script de migração: export CSV → staging table → transform → insert final


### Clientes — colunas e ordenação
A tabela mostra **Vale/mês** (valor médio mensal do cliente) e ordena por ela, não pelo acumulado histórico. Motivo: cliente que gastou R$ 1M em 2022 mas sumiu desde então não vale mais R$ 1M — vale zero. Ordenar pelo valor mensal coloca no topo quem está ativo e vale mais **agora**.

Coluna **Última** mostra data + dias atrás (`30/09 (3d)`) — mais direto que só "Xd atrás".

Filtro default é **"Ativos (30d)"** — abre mostrando quem importa hoje, não o cemitério.

### Clientes — 4 KPIs (não 6)
- Clientes (com contagem de ativos no hint)
- Faturado no período (respeita o filtro de período)
- Em risco (30-180d) com valor ajustado
- Perdidos (180d+)

Removidos: "Valor acumulado" (redundante com "Valor no período" quando filtro é "Todo o período") e "Valor em risco real" (redundante com "Em risco").

### Ações — filtro em 3 faixas
- **0-180d**: ações reais. Ordenadas por valor × proximidade do ciclo.
- **180-365d**: recuperação lenta. Aparecem em bloco separado (relatório) mas **não** no painel admin.
- **365d+**: arquivados. Saem da lista de ações. Só aparecem na consulta de Clientes.

Valor exibido **decai com o tempo**:
- 30-90d: 100% do valor médio
- 90-180d: 60%
- 180-365d: 30%
- 365d+: 0 (arquivado)

Isso evita o absurdo de "R$ 113k/mês em risco" pra cliente de 400 dias. Se ele voltar, será um cliente novo.

### Relatório matinal — o que ele comunica
1. **Situação**: faturado vs meta, falta, gap vs esperado até hoje
2. **Ritmo**: atual (com aviso de amostra pequena se < 5 dias) vs necessário
3. **Projeção**: onde vai fechar se mantiver ritmo
4. **Ticket**: individual com meta, avisa se abaixo
5. **Pedidos**: contagem total
6. **Comparativo**: vs mês anterior no mesmo número de dias
7. **Prioridades**: ações categorizadas por urgência (reativar/sumido/recompra/ritmo)
8. **Recuperação lenta**: bloco separado pra clientes 180-365d (só contagem)
9. **Arquivados**: contagem no rodapé (365d+ sem comprar)

Sem amostra ou com 1 dia trabalhado, o ritmo pode ser volátil — por isso o aviso "amostra: X dia(s)".

### Por que "Em risco" (30-180d) e "Perdidos" (180d+) são separados
"Valor em risco" antes somava todos os inativos, inflando o número com clientes irrecuperáveis. Agora só conta 30-180 dias (recuperáveis). Perdidos (180+) aparecem em KPI separado, sem valor.

### Por que Clientes tem filtro de período + KPIs separados
"Valor acumulado" vs "Valor no período" respondem perguntas diferentes. Um é patrimônio histórico, outro é ritmo atual.

### Por que "reativados" ignora clientes com 10+ compras ativos
Cliente com 50 compras que ficou 92 dias parado e voltou **não é reativação** — é cliente normal. Reativado só conta quando o gap é significativo **em relação ao perfil**.

### Por que `vendas_itens` tem vendedor_id
Sem isso, o "modo vendedor" mostrava valores diferentes do painel. Um cliente vendido pelo Diego em setembro aparecia no Tota (dono histórico). Com `vendedor_id` na venda, cada um leva sua parte — bate com o Painel.

### Por que cidade vem do 740 (não do 324)
O 324 não tem cidade. O 740 tem. O app cruza por `normalizarNomeCliente` para preencher a coluna Cidade dos clientes. Isso é feito **dinamicamente em runtime**, não gravado no banco.

### Por que status do Painel muda quando não tem dados
No dia 1º do mês, com zero faturado, `faturado >= ritmoEsperado` dava verdadeiro (`0 >= 0`) e mostrava "✓ ACIMA". Agora, sem dias trabalhados, mostra "— SEM DADOS AINDA" (neutro).

---

## Bugs conhecidos / pendências

### 🟡 Bug de Produtos (não corrigido)
A `descricao` de alguns produtos em `produtos` está desalinhada do `codigo`. Ex: código `10815` mostra "PAST. DIANT. ONIX PLUX" no app, mas no Excel do 361 é "ALAVANCA DE CAMBIO KITCIA". Provavelmente bug no `processar361` ou `sbUpsertProdutos`. **Impacto:** nomes errados na aba Produtos, mas valores batem. **Prioridade:** baixa (diretor ainda não usa a aba).

### 🟡 Favicon 404
Falta `favicon.ico`. Inofensivo, só sujeira no console.

### 🟢 localStorage como cache
Só persistem `config`, `cidades`, `comparativo`. O resto depende do Supabase.

---

## Próximos passos planejados

1. **Importar 2025 completo** — melhora a classificação "novo". Sem isso, clientes que já compravam antes de jan/2026 aparecem como "novos em 2026".
2. **Corrigir o bug de Produtos** — investigar `processar361`.
3. **Favicon** — cosmético.
4. **Apagar Worker antigo** (`dashboardaltafix.ericpaiva88.workers.dev`) — versão deprecated no ar.
5. **Domínio próprio** (opcional) — algo como `dashboard.altafix.com.br`.
6. **Produto × Vendedor / Produto × Mês** na expansão de produtos.

---

## Como pedir ajuda pra IA em nova conversa

Cola isso no início da conversa nova:

> "Estou continuando um projeto já existente. Colo abaixo o README dele. Depois preciso de ajuda com: [o que você quer]"
>
> [colar este README]

Se pedir código específico, cola só o arquivo relevante (ex: `js/views/clientes.js`).

---

**Última atualização:** 01/10/2026