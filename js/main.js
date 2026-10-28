// ============================================================
// main.js — Ponto de entrada do app (Cockpit v3)
// ============================================================

import { state, ui, session, carregar, salvar } from './state.js';
import { derivarHistorico } from './calc.js';
import { fmtBRL, toast, isoDate, normalizarNomeCliente, copiarTexto } from './utils.js';
import {
  sbInit, sbLogin, sbLogout, sbSessaoAtual, sbCarregarPerfil,
  sbCarregarTudo, aplicarDadosDoBanco
} from './supabase.js';

import { renderPainel, renderFilaHoje, renderEquipe } from './views/painel.js';
import { renderAgenda } from './views/agenda.js'; 
import { renderClientes, copiarInativos, copiarSegmento, imprimirClientes } from './views/clientes.js';
import { renderProdutos, imprimirProdutos } from './views/produtos.js';
import { renderLigacoes, abrirModalLigacao } from './views/ligacoes.js';

// Helpers
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

// ============================================================
// POPULAR SELECTS DO TOPO
// ============================================================

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
    state.vendedores
      .filter(v => v.ativo && v.papel === 'vendedor')
      .forEach(v => {
        opts += '<option value="' + v.id + '">👤 ' + v.nome + '</option>';
      });
  }

  sel.innerHTML = opts;
  sel.value = ui.modoVendedor;
}

window._popularEscopoSelect = popularEscopoSelect;
window._popularModoVendedor = popularModoVendedor;
window._abrirModalLigacao = abrirModalLigacao;

// ============================================================
// LOGIN E UI DO USUÁRIO
// ============================================================

function mostrarLogin() {
  const tela = document.getElementById('tela-login');
  if (tela) tela.style.display = 'flex';

  const btn = document.getElementById('btn-login');
  const erroEl = document.getElementById('login-erro');

  async function tentarLogin() {
    const email = document.getElementById('login-email').value.trim();
    const senha = document.getElementById('login-senha').value;
    erroEl.style.display = 'none';

    if (!email || !senha) {
      erroEl.textContent = 'Preencha email e senha.';
      erroEl.style.display = 'block';
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Entrando...';

    const r = await sbLogin(email, senha);
    if (r.erro) {
      erroEl.textContent = r.erro;
      erroEl.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Entrar';
      return;
    }
    location.reload();
  }

  btn.onclick = tentarLogin;
  document.getElementById('login-senha').onkeypress = e => {
    if (e.key === 'Enter') tentarLogin();
  };
}

function ajustarUIUsuario() {
  const papel = session.vendedor ? session.vendedor.papel : 'vendedor';

  const nomeEl = document.getElementById('user-nome');
  const papelEl = document.getElementById('user-papel');
  
  if (nomeEl) nomeEl.textContent = session.vendedor ? session.vendedor.nome : '—';
  if (papelEl) papelEl.textContent = papel === 'diretor' ? 'Diretor' : 'Vendedor';

  const btnLogout = document.getElementById('btn-logout');
  if (btnLogout) {
    btnLogout.onclick = async () => {
      if (!confirm('Sair da conta?')) return;
      await sbLogout();
      location.reload();
    };
  }

  if (papel !== 'diretor' && session.vendedor) {
    ui.modoVendedor = session.vendedor.id;
    document.querySelectorAll('.sidebar-nav button').forEach(b => {
      if (['analise', 'config', 'equipe'].includes(b.dataset.tab)) {
        b.style.display = 'none';
      }
    });
    const sm = document.getElementById('modo-vendedor');
    if (sm) sm.style.display = 'none';
    const se = document.getElementById('escopo-select');
    if (se) se.style.display = 'none';
  }
}

// ============================================================
// NAVEGAÇÃO (SIDEBAR)
// ============================================================

function setupTabs() {
  console.log('🟢 setupTabs iniciado');
  const sidebar = document.getElementById('sidebar');
  const mobileBtn = document.getElementById('mobile-menu-btn');

  if (mobileBtn) {
    mobileBtn.onclick = () => {
      sidebar.classList.toggle('open');
    };
  }

  const botoes = document.querySelectorAll('.sidebar-nav button');
  console.log('🔍 Botões da sidebar encontrados:', botoes.length);

  if (botoes.length === 0) {
    console.error('❌ ERRO CRÍTICO: Nenhum botão da sidebar encontrado. Verifique o HTML.');
  }

  botoes.forEach(b => {
    b.onclick = () => {
      console.log('🖱️ Clicou na aba:', b.dataset.tab);
      if (window.innerWidth <= 768 && sidebar) sidebar.classList.remove('open');

      document.querySelectorAll('.sidebar-nav button').forEach(x => x.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(x => x.classList.remove('active'));
      
      b.classList.add('active');
      const t = document.getElementById('tab-' + b.dataset.tab);
      if (t) t.classList.add('active');

      // Renderizações sob demanda
      if (b.dataset.tab === 'agenda') setTimeout(() => { try { renderAgenda(); } catch (e) { console.error('Erro na Agenda:', e); } }, 50); 
      if (b.dataset.tab === 'equipe') setTimeout(() => { try { renderEquipe(); } catch (e) { console.error('Erro na Equipe:', e); } }, 50);
      if (b.dataset.tab === 'clientes') setTimeout(() => { try { renderClientes(); } catch (e) { console.error('Erro nos Clientes:', e); } }, 50);
      if (b.dataset.tab === 'produtos') setTimeout(() => { try { renderProdutos(); } catch (e) { console.error('Erro nos Produtos:', e); } }, 50);
    };
  });
}

// ============================================================
// FILTROS E BOTÕES GERAIS
// ============================================================

function setupFiltros() {
  const fcb = document.getElementById('filtro-cliente-busca');
  if (fcb) fcb.oninput = e => { ui.filtroClienteBusca = e.target.value; renderClientes(); };

  const fcv = document.getElementById('filtro-cliente-vend');
  if (fcv) fcv.onchange = e => { ui.filtroClienteVend = e.target.value; renderClientes(); };
}

function setupBotoes() {
  const helpBtn = document.getElementById('help-btn');
  if (helpBtn) helpBtn.onclick = () => document.getElementById('help-modal').classList.add('show');

  const helpClose = document.getElementById('help-close');
  if (helpClose) helpClose.onclick = () => document.getElementById('help-modal').classList.remove('show');

  const escopo = document.getElementById('escopo-select');
  if (escopo) escopo.onchange = e => {
    ui.escopoAtual = e.target.value;
    renderPainel(); 
  };

  const mv = document.getElementById('modo-vendedor');
  if (mv) mv.onchange = e => {
    ui.modoVendedor = e.target.value;
    renderPainel();
  };

  const painelMesSel = document.getElementById('painel-mes-select');
  if (painelMesSel) painelMesSel.onchange = e => {
    ui.mesPainelSelecionado = e.target.value;
    renderPainel();
  };

  const btnNovaLigAgenda = document.getElementById('btn-nova-ligacao-agenda');
  if (btnNovaLigAgenda) {
    btnNovaLigAgenda.onclick = () => {
      if (window._abrirModalLigacao) window._abrirModalLigacao();
    };
  }
}

// ============================================================
// BOOTSTRAP
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  try {
    console.log('🟢 DOMContentLoaded iniciado');
    carregar();

    if (!sbInit()) {
      document.getElementById('tela-login').style.display = 'flex';
      document.getElementById('login-erro').textContent = 'Falha ao inicializar Supabase.';
      return;
    }

    const sess = await sbSessaoAtual();
    if (!sess) { mostrarLogin(); return; }

    const perfilOk = await sbCarregarPerfil();
    if (!perfilOk) {
      document.getElementById('tela-login').style.display = 'flex';
      document.getElementById('login-erro').textContent = 'Usuário sem vínculo na tabela vendedores.';
      return;
    }

    toast('⏳ Carregando dados...');
    const dados = await sbCarregarTudo().catch(e => {
      console.error(e);
      toast('❌ Erro ao carregar: ' + e.message);
      return { vendedores: [], clientes: [], produtos: [], lancamentos: [], cidades: [], comparativo: [] };
    });

    aplicarDadosDoBanco(dados);
    derivarHistorico();

    ajustarUIUsuario();
    
    console.log('🟢 Populando selects');
    popularEscopoSelect();
    popularModoVendedor();

    console.log('🟢 Configurando abas');
    setupTabs();
    setupFiltros();
    setupBotoes();

    console.log('🟢 Renderizando Painel inicial');
    renderPainel();

    toast('✓ Pronto');
    console.log('🟢 App carregado com sucesso');
  } catch (e) {
    console.error('[Alta Fix] Erro fatal:', e);
    alert('Erro ao carregar a tela: ' + e.message);
  }
});