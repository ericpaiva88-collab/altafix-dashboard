// ============================================================
// main.js — Ponto de entrada do app (Otimizado)
// ============================================================

import { renderPainel, renderSemana, gerarRelatorioMatinal } from './views/painel.js';
import { state, ui, session, carregar, salvar } from './state.js';
import { derivarHistorico } from './calc.js';
import { fmtBRL, toast, isoDate, normalizarNomeCliente, copiarTexto } from './utils.js';
import { sbInit, sbLogin, sbLogout, sbSessaoAtual, sbCarregarPerfil, sbCarregarTudo, aplicarDadosDoBanco } from './supabase.js';

import { renderPainel, renderSemana } from './views/painel.js';
import { renderAgenda } from './views/agenda.js'; 
import { renderEquipe } from './views/equipe.js';
import { renderClientes } from './views/clientes.js';
import { renderProdutos } from './views/produtos.js';
import { abrirModalLigacao } from './views/ligacoes.js';
import { setupConfig, renderConfig, renderTudo } from './views/config.js';
import { renderAnalise } from './views/analise.js';

export function parseEscopo(str) {
  if (!str || str === 'ALL') return { tipo: 'all' };
  const p = str.split(':');
  return { tipo: p[0].toLowerCase(), id: p[1] };
}

export function escopoNome(escopoAtual) {
  const e = parseEscopo(escopoAtual);
  if (e.tipo === 'all') return 'Todas as filiais';
  if (e.tipo === 'filial') {
    const f = state.filiais.find(x => x.id === e.id);
    return f ? f.nome : '—';
  }
  const g = state.grupos.find(x => x.id === e.id);
  return g ? g.nome : '—';
}

function popularEscopoSelect() {
  const sel = document.getElementById('escopo-select');
  if (!sel) return;
  let opts = '<option value="ALL">🌐 Todas</option>';
  if (state.grupos && state.grupos.length > 0) {
    opts += '<optgroup label="Grupos">';
    state.grupos.forEach(g => {
      const fs = state.filiais.filter(f => f.grupoId === g.id && f.ativo);
      if (fs.length === 0) return;
      opts += '<option value="GRUPO:' + g.id + '">📁 ' + g.nome + ' (' + fs.length + ')</option>';
    });
    opts += '</optgroup>';
  }
  opts += '<optgroup label="Filiais">';
  if (state.filiais) {
    state.filiais.filter(f => f.ativo).forEach(f => {
      opts += '<option value="FILIAL:' + f.id + '">🏢 ' + f.nome + '</option>';
    });
  }
  opts += '</optgroup>';
  sel.innerHTML = opts;
  sel.value = ui.escopoAtual;
}

function popularModoVendedor() {
  const sel = document.getElementById('modo-vendedor');
  if (!sel) return;
  let opts = '<option value="">👁️ Modo: Filial</option>';
  if (state.vendedores) {
    state.vendedores.filter(v => v.ativo && v.papel === 'vendedor').forEach(v => {
      opts += '<option value="' + v.id + '">👤 ' + v.nome + '</option>';
    });
  }
  sel.innerHTML = opts;
  sel.value = ui.modoVendedor;
}

window._popularEscopoSelect = popularEscopoSelect;
window._popularModoVendedor = popularModoVendedor;
window._abrirModalLigacao = abrirModalLigacao;
window._renderTudo = renderTudo;

function mostrarLogin() {
  const tela = document.getElementById('tela-login');
  if (tela) tela.style.display = 'flex';
  const btn = document.getElementById('btn-login');
  const erroEl = document.getElementById('login-erro');

  async function tentarLogin() {
    const email = document.getElementById('login-email').value.trim();
    const senha = document.getElementById('login-senha').value;
    erroEl.style.display = 'none';
    if (!email || !senha) { erroEl.textContent = 'Preencha email e senha.'; erroEl.style.display = 'block'; return; }
    btn.disabled = true; btn.textContent = 'Entrando...';
    const r = await sbLogin(email, senha);
    if (r.erro) { erroEl.textContent = r.erro; erroEl.style.display = 'block'; btn.disabled = false; btn.textContent = 'Entrar'; return; }
    location.reload();
  }
  btn.onclick = tentarLogin;
  document.getElementById('login-senha').onkeypress = e => { if (e.key === 'Enter') tentarLogin(); };
}

function ajustarUIUsuario() {
  const papel = session.vendedor ? session.vendedor.papel : 'vendedor';
  const nomeEl = document.getElementById('user-nome');
  const papelEl = document.getElementById('user-papel');
  if (nomeEl) nomeEl.textContent = session.vendedor ? session.vendedor.nome : '—';
  if (papelEl) papelEl.textContent = papel === 'diretor' ? 'Diretor' : 'Vendedor';
  const btnLogout = document.getElementById('btn-logout');
  if (btnLogout) {
    btnLogout.onclick = async () => { if (!confirm('Sair da conta?')) return; await sbLogout(); location.reload(); };
  }
  if (papel !== 'diretor' && session.vendedor) {
    ui.modoVendedor = session.vendedor.id;
    document.querySelectorAll('.sidebar-nav button').forEach(b => {
      if (['analise', 'config', 'equipe'].includes(b.dataset.tab)) b.style.display = 'none';
    });
    const sm = document.getElementById('modo-vendedor'); if (sm) sm.style.display = 'none';
    const se = document.getElementById('escopo-select'); if (se) se.style.display = 'none';
  }
}

function setupTabs() {
  const sidebar = document.getElementById('sidebar');
  const mobileBtn = document.getElementById('mobile-menu-btn');
  if (mobileBtn) mobileBtn.onclick = () => sidebar.classList.toggle('open');
  
  document.querySelectorAll('.sidebar-nav button').forEach(b => {
    b.onclick = () => {
      if (window.innerWidth <= 768 && sidebar) sidebar.classList.remove('open');
      document.querySelectorAll('.sidebar-nav button').forEach(x => x.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      const t = document.getElementById('tab-' + b.dataset.tab);
      if (t) t.classList.add('active');
      
      if (b.dataset.tab === 'agenda') setTimeout(() => { try { renderAgenda(); } catch (e) { console.error(e); } }, 50); 
      if (b.dataset.tab === 'equipe') setTimeout(() => { try { renderEquipe(); } catch (e) { console.error(e); } }, 50);
      if (b.dataset.tab === 'clientes') setTimeout(() => { try { renderClientes(); } catch (e) { console.error(e); } }, 50);
      if (b.dataset.tab === 'produtos') setTimeout(() => { try { renderProdutos(); } catch (e) { console.error(e); } }, 50);
      if (b.dataset.tab === 'config') setTimeout(() => { try { renderConfig(); } catch (e) { console.error(e); } }, 50);
      if (b.dataset.tab === 'analise') setTimeout(() => { try { renderAnalise(); } catch (e) { console.error(e); } }, 50);
    };
  });
}

function setupFiltros() {
  const agendaBusca = document.getElementById('agenda-busca'); if (agendaBusca) agendaBusca.oninput = () => renderAgenda();
  const agendaTipo = document.getElementById('agenda-filtro-tipo'); if (agendaTipo) agendaTipo.onchange = () => renderAgenda();
  const agendaVend = document.getElementById('agenda-filtro-vendedor'); if (agendaVend) agendaVend.onchange = () => renderAgenda();
  
  const cliBusca = document.getElementById('filtro-cliente-busca'); if (cliBusca) cliBusca.oninput = () => renderClientes();
  const cliVend = document.getElementById('filtro-cliente-vend'); if (cliVend) cliVend.onchange = () => renderClientes();
  const cliStatus = document.getElementById('filtro-cliente-status'); if (cliStatus) cliStatus.onchange = () => renderClientes();

  const prodBusca = document.getElementById('filtro-produto-busca'); if (prodBusca) prodBusca.oninput = () => renderProdutos();
  const prodCurva = document.getElementById('filtro-produto-curva'); if (prodCurva) prodCurva.onchange = () => renderProdutos();
  const prodFab = document.getElementById('filtro-produto-fabricante'); if (prodFab) prodFab.onchange = () => renderProdutos();

  const analiseVend = document.getElementById('analise-filtro-vendedor'); if (analiseVend) analiseVend.onchange = () => renderAnalise();
  const analisePeriodo = document.getElementById('analise-periodo'); if (analisePeriodo) analisePeriodo.onchange = () => renderAnalise();
}

function setupBotoes() {
    const btnRelatorio = document.getElementById('btn-relatorio-matinal');
  if (btnRelatorio) btnRelatorio.onclick = () => gerarRelatorioMatinal();
  const helpBtn = document.getElementById('help-btn'); if (helpBtn) helpBtn.onclick = () => document.getElementById('help-modal').classList.add('show');
  const helpClose = document.getElementById('help-close'); if (helpClose) helpClose.onclick = () => document.getElementById('help-modal').classList.remove('show');
  
  const escopo = document.getElementById('escopo-select'); if (escopo) escopo.onchange = e => { ui.escopoAtual = e.target.value; renderPainel(); };
  const mv = document.getElementById('modo-vendedor'); if (mv) mv.onchange = e => { ui.modoVendedor = e.target.value; renderPainel(); };
  const painelMesSel = document.getElementById('painel-mes-select'); if (painelMesSel) painelMesSel.onchange = e => { ui.mesPainelSelecionado = e.target.value; renderPainel(); };
  const btnNovaLigAgenda = document.getElementById('btn-nova-ligacao-agenda'); if (btnNovaLigAgenda) btnNovaLigAgenda.onclick = () => { if (window._abrirModalLigacao) window._abrirModalLigacao(); };

  const sp = document.getElementById('sem-prev');
  if (sp) sp.onclick = () => { ui.semanaRef.setDate(ui.semanaRef.getDate() - 7); renderSemana(); };

  const sn = document.getElementById('sem-next');
  if (sn) sn.onclick = () => { ui.semanaRef.setDate(ui.semanaRef.getDate() + 7); renderSemana(); };

  document.querySelectorAll('#sem-tabs button').forEach(b => {
    b.onclick = () => {
      ui.diaSemanaMobile = parseInt(b.dataset.dia, 10);
      renderSemana();
    };
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    carregar();
    if (!sbInit()) { document.getElementById('tela-login').style.display = 'flex'; document.getElementById('login-erro').textContent = 'Falha ao inicializar Supabase.'; return; }
    const sess = await sbSessaoAtual();
    if (!sess) { mostrarLogin(); return; }
    const perfilOk = await sbCarregarPerfil();
    if (!perfilOk) { document.getElementById('tela-login').style.display = 'flex'; document.getElementById('login-erro').textContent = 'Usuário sem vínculo na tabela vendedores.'; return; }
    
    toast('⏳ Carregando...');
    // OTIMIZAÇÃO: Carrega primeiro as tabelas que o Cockpit precisa
    const dadosBase = await sbCarregarTudo(true).catch(e => { console.error(e); return null; });
    
    if (dadosBase) {
      aplicarDadosDoBanco(dadosBase);
      derivarHistorico();
      ajustarUIUsuario();
      popularEscopoSelect();
      popularModoVendedor();
      setupTabs();
      setupFiltros();
      setupBotoes();
      setupConfig();
      renderPainel();
      toast('✓ Pronto');
    }

    // OTIMIZAÇÃO: Carrega o resto das tabelas pesadas em background (lazy)
    setTimeout(async () => {
      try {
        const dadosCompletos = await sbCarregarTudo(false);
        aplicarDadosDoBanco(dadosCompletos);
        // Não precisamos re-renderizar tudo, apenas avisamos os módulos que dependem dos dados completos
        if (window._renderTudo) window._renderTudo();
      } catch (e) {
        console.error('Erro no carregamento lazy:', e);
      }
    }, 1000);

  } catch (e) {
    console.error('[Alta Fix] Erro fatal:', e);
    alert('Erro ao carregar a tela: ' + e.message);
  }
});