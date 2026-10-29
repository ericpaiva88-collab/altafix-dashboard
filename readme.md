# Alta Fix — Copiloto Comercial

O Alta Fix deixou de ser um dashboard genérico e se tornou um **Copiloto de Gestão Comercial** para distribuidoras B2B. O sistema foi desenhado para responder a três perguntas fundamentais em menos de 5 segundos: **Como estamos? Onde está o problema? O que fazer agora?**

---

## 🏗️ Arquitetura e Tecnologias

- **Frontend:** HTML5, CSS3 (Design System próprio), JavaScript (ES Modules - Vanilla JS).
- **Backend/Auth:** Supabase (PostgreSQL + Auth).
- **Gráficos:** Chart.js.
- **Importação de Dados:** SheetJS (XLSX).
- **Hospedagem:** Cloudflare Pages (Deploy automático via GitHub).
- **Sem build step:** Arquivos servidos diretamente (zero configuração de Webpack/Vite).

---

## 📁 Estrutura de Pastas

```text
├── index.html               # Estrutura principal (Sidebar + Views)
├── css/
│   └── style.css            # Design System, tokens, layout e tabelas
└── js/
    ├── main.js              # Bootstrap, autenticação, navegação e listeners
    ├── state.js             # Estado global (state, ui, session) e localStorage
    ├── utils.js             # Helpers (formatadores, datas, normalização)
    ├── calc.js              # Regras de negócio (RFM, metas, projeções, YoY)
    ├── supabase.js          # Comunicação com o banco de dados e Auth
    ├── importer.js          # Parsing das planilhas (324, 740, 361)
    └── views/
        ├── painel.js        # Cockpit (KPIs, Gráfico Meta, Ritmo Semanal, Ações)
        ├── agenda.js        # Fila inteligente de ligações e reativação
        ├── equipe.js        # Cards de vendedores e modal Ficha 1:1
        ├── clientes.js      # Carteira de clientes e risco de churn
        ├── produtos.js      # Curva ABC e análise de estoque
        ├── analise.js       # Sazonalidade (YoY) e leitura de crescimento
        ├── config.js        # Importações, metas e vendedores
        └── ligacoes.js      # Modal de registro de ligações
        🖥️ Principais Telas (Features)
1. Cockpit (Painel Inicial)
A central de comando do diretor.

KPIs Vitais: Faturado, Falta, Projeção e Precisa/Dia (quanto o time precisa vender por dia útil para bater a meta).

Acumulado vs Meta: Gráfico de linha comparando o realizado com a linha tracejada da meta ideal diária.

Atenção Agora: Lista os top 5 problemas mais urgentes (vendedores abaixo do ritmo e clientes valiosos inativos).

Ritmo Semanal: Tabela navegável que mostra o faturamento dia a dia (Seg a Sáb) da semana selecionada, comparando com a meta semanal.

Tabela Equipe: Visão de todos os vendedores com barras de progresso indicando se estão "No Ritmo" ou "Abaixo".

2. Operação / Agenda
Onde o vendedor trabalha.

Fila inteligente que cruza dados de ligacoes (retornos agendados) com a inteligência de clientes (recompra e reativação).

Filtros por urgência (Atrasados, Hoje), por status (Sumidos, Recompra) e por vendedor.

Botão "Ligar" que já abre o modal de registro com os dados do cliente pré-preenchidos.

3. Equipe (Ficha 1:1)
Foco no desenvolvimento humano e feedback.

Cards: Visão rápida da carteira, clientes ativos, clientes em risco e ligações no mês.

Ficha do Vendedor (Modal): Gráfico histórico de 6 ou 12 meses (comparando com o ano anterior), lista dos Top 5 clientes ativos e os Top 5 clientes em risco para ação imediata.

4. Clientes
Focado no "Vale/Mês" (valor médio dos últimos 90 dias de atividade).

KPIs de Carteira, Em Risco e Perdidos.

Filtros por status (Ativos, Críticos, Sem Vendedor).

5. Produtos
Baseado no relatório 361 (Curva ABC).

Destaque visual em vermelho para produtos cujo estoque atual está abaixo do mínimo.

6. Análise & Performance
Sazonalidade (YoY): Gráfico de linha comparando 2025 e 2026 (mês a mês). O sistema puxa 2025 da tabela de comparativo e 2026 dos lancamentos reais (evitando dados defasados).

Leitura de Gestão: A tabela de ranking não só mostra o número, mas interpreta (ex: "Crescendo levemente", "Abaixo de 2025 — precisa de apoio").

7. Configurações
Importação via Drag & Drop das planilhas (324, 740, 361).

Edição de Metas por mês e vendedor (sincronizado diretamente com o Supabase).

🧠 Regras de Negócio (O "Cérebro" do App)
Vale/Mês: Para evitar distorções de clientes que gastaram muito no passado e sumiram, o "Vale/mês" não é a média histórica. É o faturamento dos últimos 90 dias antes da última compra dividido por 3.

Atenção Agora (Ações): Calcula o "Gap" (Onde o vendedor deveria estar hoje vs onde ele está). Se a projeção indicar que o vendedor não baterá a meta, ele sobe para o topo da lista de alertas.

Modo Vendedor: O seletor no topo filtra todas as abas (Cockpit, Agenda, Clientes) para mostrar exclusivamente os dados do vendedor selecionado.

Filtro de Segurança: Administrativos, Diretores e Ex-vendedores são omitidos automaticamente dos rankings de vendas e seletores de ligação, para não distorcer os dados.

🚀 Como rodar localmente
Abra a pasta do projeto no VS Code.

Instale a extensão Live Server.

Clique com o botão direito no index.html e escolha "Open with Live Server".

O app abrirá em http://127.0.0.1:5500.

Faça login com as credenciais cadastradas no Supabase Auth.

(Dica: Sempre use Ctrl + F5 ao alterar arquivos JS para evitar conflitos de cache no navegador).

☁️ Deploy (Cloudflare Pages)
Faça o commit das alterações no Git (git add ., git commit -m "...", git push origin main).

A Cloudflare Pages detectará o push e iniciará o build.

Certifique-se de que o Build output directory está configurado para /.

Aguarde o status verde (Success) e recarregue o app em produção.

🗄️ Modelo de Dados (Supabase)
Tabela	Origem / Função
vendedores	Cadastro, metas e credenciais de acesso.
clientes	Agregado por cliente (valor total, compras, última compra).
lancamentos	Vendas diárias por vendedor. Usado para o gráfico diário e metas.
cidades	Dados do 740 (Ranking de cidades e clientes).
comparativo	Dados do ano anterior (2025) para o gráfico YoY.
produtos	Dados do 361 (Curva ABC, fabricante e estoque).
ligacoes	Registro de contatos feitos e próximos retornos.
metas	Metas mensais por vendedor (garante o histórico mês a mês).
⚠️ Limitações Conhecidas / Próximos Passos
Integração via API (ERP): Hoje a entrada de dados depende de importação manual de planilhas. O próximo grande salto é integrar direto com o banco do ERP (Maxdata) para ler as vendas em tempo real.

Diário de Bordo 1:1: Falta adicionar um campo de texto no modal do vendedor para o diretor salvar as anotações da reunião de feedback.

Integração WhatsApp: O botão de ligar/contato ainda não abre o WhatsApp Web com mensagem pré-formatada.

Cache de Importação: O sistema não substitui dados passados automaticamente em todos os cenários; sempre que reimportar um período, valide no Cockpit se os valores refletiram.

Última atualização: 29/10/2026
Status: Operacional — Foco em Gestão Comercial e Recuperação de Receita.