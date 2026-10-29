# Alta Fix — Copiloto Comercial

O Alta Fix deixou de ser um dashboard genérico e se tornou um **Copiloto de Gestão Comercial** para distribuidoras B2B. O sistema foi desenhado para responder a três perguntas fundamentais em menos de 5 segundos: **Como estamos? Onde está o problema? O que fazer agora?**

---

## 🏗️ Arquitetura e Tecnologias

- **Frontend:** HTML5, CSS3 (Design System próprio com variáveis), JavaScript (ES Modules - Vanilla JS).
- **Backend/Auth:** Supabase (PostgreSQL + Auth).
- **Gráficos:** Chart.js.
- **Importação de Dados:** SheetJS (XLSX) com leitura assíncrona (Promises) para evitar falhas de processamento.
- **Integração de Comunicação:** WhatsApp API (via `wa.me` com geração inteligente de texto B2B).
- **Hospedagem:** Cloudflare Pages (Deploy automático via GitHub).
- **Performance:** Carregamento em duas etapas (*Lazy Loading*). O app carrega primeiro as tabelas vitais (clientes, lançamentos) e depois baixa o histórico pesado em background. Sincronização em cascata após importação (não exige F5).

---

## 📁 Estrutura de Pastas

```text
├── index.html               # Estrutura principal (Sidebar + Views)
├── css/
│   └── style.css            # Design System, tokens, layout e responsividade mobile
└── js/
    ├── main.js              # Bootstrap, autenticação, navegação e listeners
    ├── state.js             # Estado global (state, ui, session) e localStorage
    ├── utils.js             # Helpers (formatadores, WhatsApp inteligente, etc)
    ├── calc.js              # Regras de negócio otimizadas (RFM, metas, projeções)
    ├── supabase.js          # Comunicação com o banco (modo Lite e Full)
    ├── importer.js          # Parsing assíncrono das planilhas (324, 740, 361)
    └── views/
        ├── painel.js        # Cockpit (KPIs, Gráfico Meta, Ritmo Semanal, Relatório Matinal)
        ├── agenda.js        # Fila inteligente (Modo Lista e Modo Foco)
        ├── equipe.js        # Cards de vendedores e modal Ficha 1:1 (com Diário de Bordo)
        ├── clientes.js      # Carteira de clientes e risco de churn
        ├── produtos.js      # Curva ABC e análise de estoque
        ├── ligacoes.js      # Auditoria de ligações e conversão
        ├── analise.js       # Sazonalidade (YoY) e Leitura de Gestão
        └── config.js        # Importações, metas e vendedores
        🖥️ Principais Telas (Features)
1. Cockpit (Painel Inicial)
A central de comando do diretor.

KPIs Vitais: Faturado, Falta, Projeção e Precisa/Dia.

Acumulado vs Meta: Gráfico de linha mostrando a velocidade de venda vs a linha ideal.

Atenção Agora: Lista de top 5 problemas (vendedores abaixo do ritmo, clientes inativos de alto valor) com botões de ação rápida (Ver Ficha, Ligar, WhatsApp).

Ritmo Semanal: Tabela navegável dia a dia (Seg a Sáb) comparando o realizado com a meta semanal. No celular, exibe um card com os dados do dia selecionado.

Relatório Matinal: Botão que gera um texto formatado pronto para copiar e colar no WhatsApp do time.

2. Operação / Agenda
Onde o vendedor trabalha.

Modo Lista: Visão geral de todas as tarefas com filtros (Atrasados, Sumidos, Recompra). Exibe botões de "Ligar" e "WhatsApp" (verde se tiver telefone, cinza se não).

Modo Foco: Tela limpa que entrega um cliente por vez. Após salvar a ligação, o sistema avança automaticamente para o próximo da fila, maximizando a produtividade.

3. Equipe (Ficha 1:1)
Foco no desenvolvimento humano e feedback.

Cards: Visão rápida de carteira, ativos, em risco e ligações.

Ficha do Vendedor: Gráfico histórico (2025 vs 2026), lista de clientes em risco (com botão de WhatsApp) e um Diário de Bordo (1:1) para o gestor salvar as anotações da reunião.

4. Ligações
Tela de auditoria e produtividade do time de televendas.

KPIs de Conversão, Valor Gerado e Retornos Pendentes.

Tabela com histórico completo, filtros por vendedor/status e observações.

5. Clientes
Focado no "Vale/Mês" (valor médio dos últimos 90 dias de atividade).

KPIs de Carteira, Em Risco e Perdidos.

6. Produtos
Baseado no relatório 361 (Curva ABC).

Destaque visual em vermelho para produtos cujo estoque atual está abaixo do mínimo.

7. Análise & Performance
Sazonalidade (YoY): Gráfico de linha comparando 2025 e 2026.

Leitura de Gestão: A tabela de ranking interpreta os números (ex: "Crescendo levemente", "Abaixo de 2025 — precisa de apoio").

8. Configurações
Importação via Drag & Drop das planilhas (324, 740, 361) com feedback visual e leitura assíncrona.

Edição de Metas por mês e vendedor.

🤖 Integração Inteligente com WhatsApp
O botão de WhatsApp (💬) não apenas abre o aplicativo, ele gera uma mensagem personalizada para o contexto B2B:

Limpeza do Nome: O sistema ignora sufixos como "LTDA", "ME", "COMÉRCIO" e extrai o nome fantasia da empresa (ex: "AUTO PECAS ORIZONA LTDA - ME" vira "Auto Pecas Orizona").

Personalização do Vendedor: O vendedor responsável se apresenta na mensagem (ex: "Aqui é o Diego, da Alta Fix Distribuidora...").

Contexto: A mensagem lembra o cliente do último pedido e oferece novidades.

🧠 Regras de Negócio (O "Cérebro" do App)
Vale/Mês: Faturamento dos últimos 90 dias antes da última compra, dividido por 3.

Cálculo de Recompra (Mediana): O ciclo de compra do cliente é calculado usando a mediana das diferenças entre as compras recentes. Isso evita que clientes diários (que compram todo dia) sejam marcados como "Sumidos" por causa de um feriado ou final de semana.

Modo Vendedor: O seletor no topo filtra todas as abas (Cockpit, Agenda, Clientes) para mostrar exclusivamente os dados do vendedor selecionado.

Filtro de Segurança: Administrativos, Diretores e Ex-vendedores são omitidos dos rankings e seletores de ligação.

📱 Responsividade Mobile
A interface foi desenhada como Mobile-First.

O menu lateral vira um botão hambúrguer.

As tabelas de dados complexos se transformam em Cards no celular.

O Ritmo Semanal foca em um dia por vez no mobile (através dos botões da semana).

Números grandes (KPI) usam clamp() para não quebrarem em telas menores.

🚀 Como rodar localmente
Abra a pasta do projeto no VS Code.

Instale a extensão Live Server.

Clique com o botão direito no index.html e escolha "Open with Live Server".

O app abrirá em http://127.0.0.1:5500.

Faça login com as credenciais cadastradas no Supabase Auth.

(Dica: Sempre use Ctrl + F5 ao alterar arquivos JS/CSS para evitar conflitos de cache no navegador).

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
ligacoes	Registro de contatos feitos, telefones e próximos retornos.
metas	Metas mensais por vendedor.
⚠️ Limitações Conhecidas / Próximos Passos
Integração via API (ERP): Hoje a entrada depende de importação manual. O próximo passo é integrar com o ERP (Maxdata) para leitura em tempo real.

Envio Automático de WhatsApp: A integração atual abre o WhatsApp Web/App com a mensagem pronta. Para envio 100% automatizado, seria necessário contratar uma API oficial (ex: Twilio, Z-API, Meta Business API).

Backup na Nuvem: O botão de backup gera um JSON local. O ideal seria salvar esse snapshot automaticamente no Supabase.

Última atualização: 29/10/2026
Status: Operacional — Foco em Gestão Comercial, Produtividade e Integração B2B.