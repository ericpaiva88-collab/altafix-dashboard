# Alta Fix — Copiloto Comercial B2B

O Alta Fix é uma plataforma de gestão comercial desenhada sob medida para distribuidoras. O sistema foi construído para responder a três perguntas em segundos: **Como estamos? Onde está o problema? O que fazer agora?**

Esta versão abandona métricas acadêmicas e foca na **ação prática**. Através de diagnósticos inteligentes de perda e ganho de carteira, inteligência geográfica, relatórios executivos em PDF e reuniões 1:1 com zero scroll, o gestor consegue cobrar resultados com precisão cirúrgica.

## 🏗️ Arquitetura e Tecnologias

- **Frontend:** HTML5, CSS3 (Design System próprio), JavaScript (Vanilla ES6 Modules).
- **Backend/Auth:** Supabase (PostgreSQL + Auth + RLS).
- **Gráficos:** Chart.js.
- **Importação:** SheetJS (XLSX) com leitura assíncrona e cruzamento inteligente de dados.
- **Integração:** WhatsApp API (via `wa.me`) e geração de relatórios para impressão/PDF.

## 📁 Estrutura de Pastas

```text
├── index.html               # Estrutura principal (Views)
├── css/
│   └── style.css            # Design System e responsividade
└── js/
    ├── main.js              # Bootstrap, Auth e Navegação
    ├── state.js             # Estado global
    ├── utils.js             # Helpers (formatadores, WhatsApp, etc)
    ├── calc.js              # Regras de negócio (metas, projeções, dias úteis)
    ├── calc_diagnostico.js  # Motor do MoM (Diagnóstico, Cidades, Transferências)
    ├── supabase.js          # Comunicação e sincronização inteligente com o banco
    ├── importer.js          # Parsing das planilhas e tratamento de colunas
    └── views/
        ├── painel.js        # Cockpit (Macro) e Relatório Matinal
        ├── agenda.js        # Fila de trabalho operacional (Retornos, Imprimir Lista)
        ├── equipe.js        # Ficha 1:1 do vendedor (Zero Scroll, Diário na Nuvem)
        ├── clientes.js      # CRM tático (Busca Universal, Ordenação, Variação)
        ├── analise.js       # Diagnóstico (YoY, MoM, Drill-down, Relatório PDF)
        └── config.js        # Importação, Metas e Transferência de Carteira
        🖥️ Principais Funcionalidades
1. Cockpit (Macro)
KPIs de ritmo (Faturado, Falta, Projeção, Precisa/Dia) calculados com base nos dias úteis reais do calendário.

Radar de "Atenção Agora" com os vendedores e clientes críticos.

Relatório Matinal gerado em texto para o WhatsApp.

Mês atual sempre selecionado por padrão.

2. Análise & Performance (Diagnóstico)
YoY: Comparação histórica.

MoM (Mês vs Mês): KPIs de comparação justa (truncando dias para não distorcer a análise).

Inteligência Geográfica: Filtro por cidade, permitindo ver a performance isolada de cada região.

Resumo de Impacto: Cards intuitivos (O que puxou para baixo vs O que segurou).

Drill-down: Clique em "Clientes Perdidos" ou "Cidades em Queda" e veja a lista detalhada em um modal.

Relatório Executivo (PDF): Gera uma página formatada com os principais pontos do mês, pronta para imprimir ou salvar em PDF.

3. Equipe (Ficha 1:1)
Layout de 3 colunas (Zero scroll) para reuniões frente a frente.

Diagnóstico MoM individual e alertas de dependência.

Prioridades de ligação com botão de WhatsApp.

Diário de Bordo sincronizado na nuvem (Salvo na tabela notas_1a1).

Botão "Gerar Resumo" para enviar o combinado da reunião no WhatsApp.

4. CRM de Clientes e Agenda
Clientes: Busca universal (Nome, Código, CNPJ ou Cidade, ignorando acentos), filtros por variação de mês e ordenação clicável.

Agenda: Fila de trabalho baseada na última ligação do cliente (elimina retornos fantasmas). Modo Foco para produtividade.

Impressão: Geração de lista impressa filtrada (ex: Recompra Esperada) para os vendedores levarem para a rua.

5. Configurações e Importação
Leitura inteligente de planilhas (identifica colunas pelo nome, não pela posição).

Blindagem de Dados: O importador do 324 não apaga mais os dados de CNPJ, Telefone e Cidade que vieram do Cadastro de Clientes.

Transferência de Carteira: Botão que move todos os clientes e agendamentos de um vendedor (ex: desligado) para outro (ex: novo responsável) de forma instantânea.

🧠 Regras de Negócio Principais
Projeção Justa: A projeção de fechamento usa a fórmula (Realizado / Dias Úteis Decorridos) * Dias Úteis Totais. Ela não penaliza quem vende em mais dias e não "premia" quem concentra as vendas.

Truncagem Justa (MoM): Se o mês atual está em andamento, a análise compara do dia 01 até hoje em ambos os meses.

Migração de Clientes: Se o cliente comprou com o Vendedor A no mês passado, mas neste mês com o B, o sistema aponta "Migrou p/ Vendedor B" em vez de "Churn".

Ciclo de Recompra: Usa a mediana de dias entre as compras do cliente para prever o próximo contato na Agenda.

Última atualização: 11/11/2026
Status: Operacional — Inteligência Geográfica, Data Integrity e Reunião Ready.