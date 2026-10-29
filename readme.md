# Alta Fix — Copiloto Comercial

O Alta Fix deixou de ser um dashboard genérico e se tornou um **Copiloto de Gestão Comercial** para distribuidoras B2B. O sistema foi desenhado para responder a três perguntas fundamentais em menos de 5 segundos: **Como estamos? Onde está o problema? O que fazer agora?**

---

## 🏗️ Arquitetura e Tecnologias

- **Frontend:** HTML5, CSS3 (Design System próprio), JavaScript (ES Modules - Vanilla JS).
- **Backend/Auth:** Supabase (PostgreSQL + Auth).
- **Gráficos:** Chart.js.
- **Importação de Dados:** SheetJS (XLSX).
- **Hospedagem:** Cloudflare Pages (Deploy automático via GitHub).
- **Performance:** Carregamento em duas etapas (*Lazy Loading*). O app carrega primeiro as tabelas vitais (clientes, lançamentos) e depois baixa o histórico pesado em background.

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
    ├── calc.js              # Regras de negócio otimizadas (RFM, metas, projeções, YoY)
    ├── supabase.js          # Comunicação com o banco e Auth (com modo Lite e Full)
    ├── importer.js          # Parsing das planilhas (324, 740, 361)
    └── views/
        ├── painel.js        # Cockpit (KPIs, Gráfico Meta, Ritmo Semanal, Relatório Matinal)
        ├── agenda.js        # Fila inteligente de ligações (Modo Lista e Modo Foco)
        ├── equipe.js        # Cards de vendedores e modal Ficha 1:1 (com Diário de Bordo)
        ├── clientes.js      # Carteira de clientes e risco de churn
        ├── produtos.js      # Curva ABC e análise de estoque
        ├── ligacoes.js      # Auditoria de ligações e conversão
        ├── analise.js       # Sazonalidade (YoY), Leitura de Gestão e Top Movers
        └── config.js        # Importações, metas e vendedores
        🖥️ Principais Telas (Features)
1. Cockpit (Painel Inicial)
A central de comando do diretor.

KPIs Vitais: Faturado, Falta, Projeção e Precisa/Dia.

Acumulado vs Meta: Gráfico de linha mostrando a velocidade de venda vs a linha ideal.

Atenção Agora: Lista de top 5 problemas (vendedores abaixo do ritmo, clientes inativos de alto valor) com botões de ação rápida.

Ritmo Semanal: Tabela navegável dia a dia (Seg a Sáb) comparando o realizado com a meta semanal.

Relatório Matinal: Botão que gera um texto formatado pronto para copiar e colar no WhatsApp do time.

2. Operação / Agenda
Onde o vendedor trabalha.

Modo Lista: Visão geral de todas as tarefas com filtros (Atrasados, Sumidos, Recompra).

Modo Foco: Tela limpa que entrega um cliente por vez para o vendedor (Nome, Motivo, Valor, Botão de Ligar). Ao finalizar, avança automaticamente para o próximo.

3. Equipe (Ficha 1:1)
Foco no desenvolvimento humano e feedback.

Cards: Visão rápida de carteira, ativos, em risco e ligações.

Ficha do Vendedor: Gráfico histórico (2025 vs 2026), lista de clientes em risco e um Diário de Bordo (1:1) para o gestor salvar as anotações da reunião.

4. Ligações
Tela de auditoria e produtividade do time de televendas.

KPIs de Conversão, Valor Gerado e Retornos Pendentes.

Tabela com histórico completo, filtros por vendedor/status e observações.

5. Clientes
Focado no "Vale/Mês" (valor médio dos últimos 90 dias de atividade).

KPIs de Carteira, Em Risco e Perdidos.

Filtros por status (Ativos, Críticos, Sem Vendedor).

6. Produtos
Baseado no relatório 361 (Curva ABC).

Destaque visual em vermelho para produtos cujo estoque atual está abaixo do mínimo.

7. Análise & Performance
Sazonalidade (YoY): Gráfico de linha comparando 2025 e 2026. O sistema puxa 2025 da tabela de comparativo e 2026 dos lancamentos reais.

Leitura de Gestão: A tabela de ranking interpreta os números (ex: "Crescendo levemente", "Abaixo de 2025 — precisa de apoio").

8. Configurações
Importação via Drag & Drop das planilhas (324, 740, 361) com feedback visual.

Edição de Metas por mês e vendedor.

🧠 Regras de Negócio (O "Cérebro" do App)
Vale/Mês: Faturamento dos últimos 90 dias antes da última compra, dividido por 3.

Atenção Agora: Calcula o "Gap" (Onde o vendedor deveria estar hoje vs onde ele está). Se estiver abaixo, ele sobe para a lista de alertas.

Modo Vendedor: O seletor no topo filtra todas as abas (Cockpit, Agenda, Clientes) para mostrar exclusivamente os dados do vendedor selecionado. A meta semanal também se ajusta.

Filtro de Segurança: Administrativos, Diretores e Ex-vendedores são omitidos dos rankings e seletores de ligação.

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
Integração via API (ERP): Hoje a entrada depende de importação manual. O próximo passo é integrar com o ERP (Maxdata).

Backup e Exportação: Os botões de Excel e Backup em JSON ainda precisam ser conectados à nova interface.

Integração WhatsApp: O botão de ligar ainda não abre o WhatsApp Web com mensagem pré-formatada.

Última atualização: 29/10/2026
Status: Operacional — Foco em Gestão Comercial, Produtividade e Recuperação de Receita.