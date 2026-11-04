# Alta Fix — Copiloto Comercial B2B

O Alta Fix é uma plataforma de gestão comercial desenhada sob medida para distribuidoras. O sistema foi construído para responder a três perguntas em segundos: **Como estamos? Onde está o problema? O que fazer agora?**

Esta versão abandona métricas acadêmicas e foca na **ação prática**. Através de diagnósticos inteligentes de perda e ganho de carteira (MoM), integração direta com WhatsApp e reuniões 1:1 com zero scroll, o gestor consegue cobrar resultados com precisão cirúrgica.

## 🏗️ Arquitetura e Tecnologias

- **Frontend:** HTML5, CSS3 (Design System próprio), JavaScript (Vanilla ES6 Modules).
- **Backend/Auth:** Supabase (PostgreSQL + Auth + RLS).
- **Gráficos:** Chart.js.
- **Importação:** SheetJS (XLSX) com leitura assíncrona.
- **Integração:** WhatsApp API (via `wa.me`).
- **Performance:** Lazy Loading (carrega o essencial e depois o histórico pesado).

## 📁 Estrutura de Pastas

```text
├── index.html               # Estrutura principal (Views)
├── css/
│   └── style.css            # Design System e responsividade
└── js/
    ├── main.js              # Bootstrap, Auth e Navegação
    ├── state.js             # Estado global
    ├── utils.js             # Helpers (formatadores, WhatsApp, etc)
    ├── calc.js              # Regras de negócio base (metas, projeções, RFM)
    ├── calc_diagnostico.js  # Motor do MoM (Diagnóstico, Transferências)
    ├── supabase.js          # Comunicação com o banco
    ├── importer.js          # Parsing das planilhas
    └── views/
        ├── painel.js        # Cockpit (Macro)
        ├── agenda.js        # Fila de trabalho operacional (Retornos)
        ├── equipe.js        # Ficha 1:1 do vendedor (Micro)
        ├── clientes.js      # CRM tático (Variação MoM, ordenação)
        ├── analise.js       # Diagnóstico da Empresa (YoY e MoM com Drill-down)
        └── config.js        # Importação e Metas
        🖥️ Principais Funcionalidades
1. Cockpit (Macro)
KPIs de ritmo (Faturado, Falta, Projeção, Precisa/Dia).

Radar de "Atenção Agora" com os vendedores e clientes críticos.

Relatório Matinal gerado em texto para o WhatsApp.

Mês atual sempre selecionado por padrão, mesmo zerado.

2. Análise (Diagnóstico de Variação)
YoY: Comparação histórica.

MoM (Mês vs Mês): KPIs de comparação justa (truncando dias).

Resumo de Impacto: Substituiu o gráfico de cascata por cards intuitivos (O que puxou para baixo vs O que segurou).

Drill-down: Clique em "Clientes Perdidos" e veja a lista em um modal.

Detecção de Migração: Identifica se o cliente sumiu ou se foi passado para outro vendedor.

3. Equipe (Ficha 1:1)
Layout de 3 colunas (Zero scroll) para reuniões frente a frente.

Diagnóstico MoM individual.

Prioridades de ligação com botão de WhatsApp.

Diário de Bordo sincronizado na nuvem (Salvo na tabela notas_1a1).

Botão "Gerar Resumo" para enviar o combinado da reunião no WhatsApp.

4. CRM de Clientes e Agenda
Clientes: Filtros rápidos por variação de mês (Em Queda, Em Crescimento), ordenação clicável e ação direta.

Agenda: Fila de trabalho baseada na última ligação do cliente (elimina retornos fantasmas). Modo Foco para produtividade.

Registro de Ligações: Formulário limpo para novos registros, preservando o histórico antigo intacto.

🧠 Regras de Negócio Principais
Truncagem Justa: Se o mês atual está em andamento (ex: dia 15), o MoM compara do dia 01 ao 15 em ambos os meses. Se o mês fechou, compara os meses inteiros.

Transferência de Carteira: Se o cliente comprou no mês passado com o Vendedor A, mas neste mês com o B, o diagnóstico do A aponta "Migrou p/ Vendedor B" em vez de "Churn".

Ciclo de Recompra: Usa a mediana de dias entre as compras do cliente para prever o próximo contato.

🚀 Como rodar e fazer Deploy
Local: VS Code + Live Server (http://127.0.0.1:5500).

Deploy: Push para o GitHub (Cloudflare Pages atualiza automaticamente).

🗺️ Próximos Passos (Roadmap de Evolução)
O sistema está robusto para o gestor. Para escalar, sugerimos três frentes:

Modo Vendedor (Mobile-First): O vendedor logado vê apenas o "Meu Dia" (sua meta, seus clientes na agenda). Isso faz o vendedor querer usar o sistema na rua.

Cobrança de Ações (Follow-up): Transformar as anotações do Diário de Bordo em tarefas com data de vencimento. O sistema avisa o gestor se o vendedor não executou o que foi combinado na reunião.

Integração via API (Fim do Excel): Conectar o sistema ao ERP (Maxdata) via API para que os dados de vendas e clientes caiam em tempo real, eliminando a importação manual diária do 324.