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

### Relatório matinal — o que ele comunica
1. **Situação**: faturado vs meta, falta, gap vs esperado até hoje
2. **Ritmo**: atual (com aviso de amostra pequena se < 5 dias) vs necessário
3. **Projeção**: onde vai fechar se mantiver ritmo
4. **Ticket**: individual com meta, avisa se abaixo
5. **Pedidos**: contagem total
6. **Comparativo**: vs mês anterior no mesmo número de dias
7. **Prioridades**: ações categorizadas por urgência (reativar/sumido/recompra/ritmo)

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