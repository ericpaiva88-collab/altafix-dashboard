# Alta Fix — Gestão Comercial

Dashboard comercial da Alta Fix Distribuidora de Peças. Lê planilhas do ERP (324, 740, 361, comparativo), consolida no Supabase, e apresenta painéis de faturamento, clientes, produtos e análises.

---

## Arquitetura

Frontend estático (HTML + CSS + JavaScript modular) hospedado no Cloudflare Pages.
Backend: Supabase (Postgres + Auth + RLS).
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

**Login:** email + senha criados no Supabase Auth (ver seção Vendedores).

---

## Como fazer deploy

1. Fazer as mudanças no VS Code
2. `Ctrl + S` em cada arquivo
3. **Source Control** → mensagem descritiva → **Commit** → **Sync**
4. Cloudflare Pages rebuilda automaticamente em ~30s
5. URL de produção: `https://altafix.pages.dev`

**Credenciais:**
- GitHub: `ericpaiva88-collab/altafix-dashboard`
- Cloudflare Pages: projeto `altafix` conectado ao repo
- Supabase: projeto `Alta Fix` (URL e anon key em `js/supabase.js`)

---

## Modelo de dados (Supabase)

### Tabelas

| Tabela | Descrição |
|---|---|
| `filiais` | Filiais ativas (nome, UF, grupo) |
| `grupos` | Grupos de filiais (para relatórios consolidados) |
| `vendedores` | Cadastro + metas + papel (vendedor/diretor/admin/ex) + `user_id` (auth) |
| `clientes` | Agregado consolidado por cliente (calculado a partir de `clientes_importacoes`) |
| `clientes_importacoes` | Uma linha por cliente × período importado. Fonte de verdade pra "novo"/"reativado" |
| `vendas_itens` | Uma linha por cliente × produto × período × vendedor. Fonte pra "modo vendedor" |
| `produtos` | Cadastro de produtos com curva ABC + estoque |
| `produtos_mes` | Produto × mês (fonte: 361) pra análises temporais |
| `lancamentos` | Vendas diárias por vendedor (fonte: 324) |
| `cidades` | Ranking de cidades (fonte: 740) |
| `comparativo` | YoY 2025 × 2026 |
| `metas` | Meta por vendedor × mês |
| `config` | Configurações gerais (feriados, meta pedidos/dia) |
| `acoes_tratadas` | Marcações de ações resolvidas no painel |

### Chaves compostas importantes

- `clientes_importacoes`: `(filial_id, periodo_ini, periodo_fim, cliente_norm)` — substitui o período ao reimportar
- `vendas_itens`: `(filial_id, periodo_ini, periodo_fim, cliente_norm, produto_codigo, vendedor_id)` — mesmo comportamento
- `produtos_mes`: `(filial_id, mes, codigo)`

### Funções RPC

- `admin_criar_usuario(p_email, p_senha, p_nome, p_papel, p_filial_id)` — cria usuário no Auth + vincula
- `admin_deletar_usuario(p_email)` — apaga do Auth + desvincula

Ambas só funcionam se o chamador for `diretor`.

### RLS

**Todas as tabelas estão com RLS desabilitado** — o controle de acesso é feito pela aplicação (frontend chama endpoints e o app decide o que mostrar). Migração futura: habilitar RLS granular.

---

## Como funcionam as importações

### 324 Detalhado (ERP)
- Uma linha por item de venda
- Detecta o período do cabeçalho do arquivo
- **Importar diariamente** (a partir de set/2026) — cada dia é um período próprio
- Meses anteriores: importar mensal
- Alimenta: `clientes_importacoes`, `vendas_itens`, `lancamentos`, `produtos` (contagem), `clientes` (agregado)

### 740 Cidades
- Ranking de vendas por cidade
- **Importar mensal** (não precisa ser diário)
- Alimenta: `cidades`

### 361 Curva ABC / Fabricantes
- Estoque + curva + fabricante por produto
- **Importar mensal**
- Alimenta: `produtos_mes` e enriquece `produtos`

### Comparativo 2025×2026
- Opcional — só se quiser KPIs do ano passado
- Alimenta: `comparativo`

**Regra de ouro:** nunca reimportar o mesmo período sem necessidade — o app substitui (não soma). Se reimportar, os dados antigos daquele período são apagados e os novos entram.

---

## Design decisions & contexto

### Por que "Faturado" e "% da meta" são os números principais do painel
Diretor e vendedores abrem o painel pra saber "estou bem?" e "quanto falta?". Tudo mais (projeção, ticket, pedidos) é contexto. Por isso ficam no hero, com hierarquia clara.

### Por que Clientes tem filtro de período + KPIs separados
"Valor acumulado" vs "Valor no período" respondem perguntas diferentes. Um é patrimônio histórico, outro é ritmo atual. Antes eram um só e confundia.

### Por que reativados ignoram clientes com 10+ compras ativos
Um cliente com 50 compras que ficou 92 dias parado e voltou **não é reativação** — é cliente normal. Reativado só conta quando o gap é significativo **em relação ao perfil** do cliente.

### Por que `vendas_itens` tem vendedor_id
Sem isso, o "modo vendedor" mostrava valores diferentes do painel. Um cliente vendido pelo Diego em setembro aparecia no Tota (dono histórico). Com `vendedor_id` na venda, cada um leva sua parte.

### Por que "Em risco" (30-180d) e "Perdidos" (180d+) são separados
"Valor em risco" antes somava todos os inativos, inflando o número com clientes irrecuperáveis. Agora só conta 30-180 dias — recuperáveis.

---

## Bugs conhecidos / pendências

### 🟡 Bug de Produtos (não corrigido)
A `descricao` de alguns produtos em `produtos` está desalinhada do `codigo`. Ex: código `10815` está como "PAST. DIANT. ONIX PLUX" no app, mas no Excel é "ALAVANCA DE CAMBIO KITCIA". Provavelmente bug no `processar361` ou no `sbUpsertProdutos`. **Impacto:** produtos mostram nome errado, mas valores batem. **Prioridade:** baixa (o diretor não usa a aba Produtos ainda).

### 🟡 Favicon 404
Falta `favicon.ico`. Inofensivo, só sujeira no console. Fácil de adicionar.

### 🟢 Backups internos do localStorage
Só persistem `config`, `cidades`, `comparativo`. O resto depende do Supabase. Se o Supabase cair, o app mostra vazio. Mitigação: exportar JSON manual está disponível.

---

## Próximos passos planejados

1. **Importar 2025 completo** — melhora a classificação "novo" automaticamente. Sem isso, clientes que já compravam antes de jan/2026 aparecem como "novos em 2026".
2. **Corrigir o bug de Produtos** — investigar `processar361`.
3. **Favicon.ico** — cosmético.
4. **Apagar Worker antigo** (`dashboardaltafix.ericpaiva88.workers.dev`) — versão deprecated no ar.
5. **Domínio próprio** (opcional) — algo como `dashboard.altafix.com.br`, configurável no Cloudflare Pages.
6. **Produto × Vendedor / Produto × Mês** na expansão de produtos.

---

## Como pedir ajuda pra IA em nova conversa

Cola isso no início da conversa nova:

> "Estou continuando um projeto já existente. Colo abaixo o README dele. Depois preciso de ajuda com: [o que você quer]"
>
> [colar este README]

A IA entra no contexto rapidamente.

---

**Última atualização:** 01/10/2026