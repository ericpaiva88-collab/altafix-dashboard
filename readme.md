# Alta Fix — Copiloto Comercial

O Alta Fix deixou de ser um dashboard genérico e se tornou um **Copiloto de Gestão Comercial** para distribuidoras B2B. O sistema foi desenhado para responder a três perguntas fundamentais em menos de 5 segundos: **Como estamos? Onde está o problema? O que fazer agora?**

Esta versão foi totalmente redesenhada para ser **"Reunião Ready"**. Gráficos complexos (como Waterfall) foram substituídos por resumos de impacto executivos, e as telas agora entregam o diagnóstico e a ação no mesmo clique.

---

## 🏗️ Arquitetura e Tecnologias

- **Frontend:** HTML5, CSS3 (Design System próprio com variáveis), JavaScript (ES Modules - Vanilla JS).
- **Backend/Auth:** Supabase (PostgreSQL + Auth).
- **Gráficos:** Chart.js (Linha para YoY e Barras Horizontais para Diagnóstico MoM).
- **Importação de Dados:** SheetJS (XLSX) com leitura assíncrona (Promises) para evitar falhas de processamento.
- **Integração de Comunicação:** WhatsApp API (via `wa.me` com geração inteligente de texto B2B).
- **Hospedagem:** Cloudflare Pages (Deploy automático via GitHub).
- **Performance:** Carregamento em duas etapas (*Lazy Loading*). O app carrega primeiro as tabelas vitais (clientes, lançamentos) e depois baixa o histórico pesado em background.

---

## 📁 Estrutura de Pastas

```text
├── index.html               # Estrutura principal (Sidebar + Views)
├── css/
│   └── style.css            # Design System, tokens, layout e responsividade
└── js/
    ├── main.js              # Bootstrap, autenticação, navegação e listeners
    ├── state.js             # Estado global (state, ui, session) e localStorage
    ├── utils.js             # Helpers (formatadores, WhatsApp inteligente, etc)
    ├── calc.js              # Regras de negócio otimizadas (RFM, metas, projeções)
    ├── calc_diagnostico.js  # Cálculo do MoM (Diagnóstico de Perdas, Transferências e Novos)
    ├── supabase.js          # Comunicação com o banco (modo Lite e Full)
    ├── importer.js          # Parsing assíncrono das planilhas (324, 740, 361)
    └── views/
        ├── painel.js        # Cockpit (KPIs, Gráfico Meta, Ritmo Semanal, Relatório)
        ├── agenda.js        # Fila inteligente (Modo Lista e Modo Foco)
        ├── equipe.js        # Cards de vendedores e Modal Ficha 1:1 (Zero Scroll)
        ├── clientes.js      # CRM Visual (Variação MoM, Ordenação e Ações Rápidas)
        ├── produtos.js      # Curva ABC e análise de estoque
        ├── ligacoes.js      # Auditoria de ligações e conversão
        ├── analise.js       # Sazonalidade (YoY) e Diagnóstico de Queda (MoM)
        └── config.js        # Importações, metas e vendedores
        🖥️ Principais Telas (Features)
1. Cockpit (Painel Inicial)
A central de comando do diretor.

KPIs Vitais: Faturado, Falta, Projeção e Precisa/Dia.

Acumulado vs Meta: Gráfico de linha mostrando a velocidade de venda vs a linha ideal.

Atenção Agora: Lista de top 5 problemas com botões de ação rápida (Ver Ficha, WhatsApp, Ligar).

Relatório Matinal: Botão que gera um texto formatado pronto para o WhatsApp do time.

2. Análise & Performance (Macro)
Dividida em duas subtabs:

📈 Ano contra Ano (YoY): Visão histórica comparando 2025 com 2026 mês a mês, com ranking e leitura de desempenho do time.

🔍 Por que caiu? (MoM): Diagnóstico focado em reuniões.

KPIs comparativos (Mês Fechado vs Projeção vs Variação Realizada).

Resumo de Impacto: Substituiu o gráfico de cascata. Mostra em cards lado a lado o que puxou o faturamento para baixo (Perdidos/Queda) e o que segurou (Novos/Aumento).

Drill-down: Ao clicar em um card (ex: "14 Clientes Perdidos"), um modal abre instantaneamente mostrando quem são os clientes e o valor de cada um.

3. Equipe (Ficha 1:1)
Foco no desenvolvimento humano e feedback ágil.

Cards: Visão rápida de carteira, ativos, em risco e ligações.

Ficha do Vendedor (Zero Scroll): Layout em 3 colunas desenhado para caber na tela da TV/Notebook sem rolar.

Esquerda: Resumo do Mês (Barras de impacto).

Meio: Prioridade de Ligação (Top 5 clientes em queda, com botão de WhatsApp).

Direita: Diário de Bordo (salva as anotações da reunião no navegador).

4. Clientes (CRM Visual)
Deixou de ser um diretório e se tornou a tela tática de ação.

Variação MoM: Mostra claramente quem aumentou (▲) ou diminuiu (▼) o faturamento em relação ao mês anterior.

Filtros Rápidos (Chips): Botões para ver "Em Queda (Mês)", "Em Crescimento", "Em Risco (Inativos)" com um clique.

Ordenação Clicável: Clique no cabeçalho da tabela para ordenar por Nome, Vendedor, Última Compra, Faturamento ou Variação.

Ação Direta: Botão de WhatsApp em cada linha.

5. Agenda e Ligações
Agenda: Fila de trabalho (Modo Lista e Modo Foco) baseada no ciclo de recompra (mediana) e retornos agendados.

Ligações: Auditoria de conversão e histórico de contato com os clientes.

🤖 Integração Inteligente com WhatsApp
O botão de WhatsApp (💬) gera uma mensagem personalizada B2B:

Limpa sufixos (LTDA, ME, EIRELI) e extrai o nome fantasia.

Personaliza a apresentação com o nome do vendedor responsável.

Lembra o cliente do último pedido e oferece novidades.

🧠 Regras de Negócio (O "Cérebro" do App)
Transferência de Carteira (Vendedor vs Vendedor): Se um cliente comprou no mês anterior com o Vendedor A, mas neste mês comprou com o Vendedor B, o sistema classifica como "Transferido" no diagnóstico do Vendedor A (evitando falsos "Churns").

Cálculo MoM Truncado: A comparação de meses (ex: Setembro vs Outubro) trunca os dias de forma justa (compara dia 01 ao 30 em ambos) para não distorcer a análise quando o mês atual ainda está em andamento.

Vale/Mês: Faturamento dos últimos 90 dias antes da última compra, dividido por 3.

Cálculo de Recompra (Mediana): O ciclo de compra é calculado usando a mediana das diferenças entre as compras recentes, evitando que clientes com compras diárias sejam marcados como "sumidos" por causa de um feriado.

📱 Responsividade Mobile
O menu lateral vira um botão hambúrguer.

As tabelas de dados complexos se transformam em Cards no celular (com data-label).

O Ritmo Semanal foca em um dia por vez no mobile.

🚀 Como rodar localmente
Abra a pasta do projeto no VS Code.

Instale a extensão Live Server.

Clique com o botão direito no index.html e escolha "Open with Live Server".

O app abrirá em http://127.0.0.1:5500.

Faça login com as credenciais cadastradas no Supabase Auth.
(Dica: Sempre use Ctrl + F5 ao alterar arquivos JS/CSS para evitar conflitos de cache).

⚠️ Limitações Conhecidas / Próximos Passos
Integração via API (ERP): Hoje a entrada depende de importação manual (324, 740, 361). O próximo passo é integrar com o ERP (Maxdata) para leitura em tempo real.

Envio Automático de WhatsApp: A integração atual abre o WhatsApp Web com a mensagem pronta. Para envio 100% automatizado, seria necessária uma API oficial (Twilio, Z-API, etc).

Sincronização do Diário de Bordo 1:1: Atualmente as anotações da ficha do vendedor ficam no localStorage do navegador. O ideal é salvar no Supabase (tabela notas_1a1) para sincronizar entre dispositivos.

Última atualização: 30/10/2026
Status: Operacional — Reunião Ready, Diagnóstico MoM e CRM de Variação.