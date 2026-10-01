// ============================================================
// main.js — Ponto de entrada do app
// Inicializa Supabase, liga eventos, coordena views
// ============================================================

import { state, ui, session, carregar, salvar } from './state.js';
import { derivarHistorico } from './calc.js';
import { fmtBRL, toast, isoDate, normalizarNomeCliente, copiarTexto } from './utils.js';
import {
  sbInit, sbLogin, sbLogout, sbSessaoAtual, sbCarregarPerfil,
  sbCarregarTudo, aplicarDadosDoBanco
} from './supabase.js';
import { inicioSemana } from './utils.js';

// Views
import {
  renderPainel, renderHistorico, aplicarMinimizaveis,
  toggleTodosMinimizaveis, imprimirRanking, resetarSimulador,
  copiarCenario, gerarRelatorioMatinal, gerarRelatorioFechamento,
  renderSemana
} from './views/painel.js';

import {
  renderClientes, copiarInativos, copiarSegmento, imprimirClientes,
  setupClientesNovos
} from './views/clientes.js';

import { renderProdutos, imprimirProdutos } from './views/produtos.js';

import {
  renderComparativo, renderCidades, renderFabricantes,
  copiarCidades, imprimirCidades, renderChartYoY, renderGraficoEvolucao
} from './views/analise.js';

import {
  renderTudo, setupImports, setupLancar, setupMetas, setupFiliais,
  setupGeral, renderMetas, salvarBases, exportarJSON, importarJSON,
  renderDiagnostico, reconstruirCruzamentos
} from './views/config.js';

// ============================================================
// HELPERS GLOBAIS
// ============================================================

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
// POPULAR SELECTS DO HEADER
// ============================================================

function popularEscopoSelect() {
  const sel = document.getElementById('escopo-select');
  if (!sel) return;

  let opts = '<option value="ALL">🌐 Todas</option>';

  if (state.grupos.length > 0) {
    opts += '<optgroup label="Grupos">';
    state.grupos.forEach(g => {
      const fs = state.filiais.filter(f => f.grupoId === g.id && f.ativo);
      if (fs.length === 0) return;
      opts += '<option value="GRUPO:' + escapeAttr(g.id) + '">📁 ' +
        escapeAttr(g.nome) + ' (' + fs.length + ')</option>';
    });
    opts += '</optgroup>';
  }

  opts += '<optgroup label="Filiais">';
  state.filiais.filter(f => f.ativo).forEach(f => {
    opts += '<option value="FILIAL:' + escapeAttr(f.id) + '">🏢 ' +
      escapeAttr(f.nome) + '</option>';
  });
  opts += '</optgroup>';

  sel.innerHTML = opts;
  sel.value = ui.escopoAtual;

  const e = parseEscopo(ui.escopoAtual);
  const banner = document.getElementById('escopo-banner');
  if (banner) {
    if (e.tipo === 'all') banner.style.display = 'none';
    else {
      banner.style.display = 'block';
      banner.innerHTML = (e.tipo === 'grupo' ? '📁 ' : '🏢 ') +
        'Visualizando: <strong>' + escapeAttr(escopoNome(ui.escopoAtual)) + '</strong>';
    }
  }

  const bs = document.getElementById('brand-sub');
  if (bs) bs.textContent = 'Gestão Comercial — ' + escopoNome(ui.escopoAtual);

  const av = document.getElementById('import-filial-aviso');
  if (av) {
    if (e.tipo === 'filial') {
      av.className = 'aviso info';
      av.innerHTML = '✓ Importando para: <strong>' +
        escapeAttr(escopoNome(ui.escopoAtual)) + '</strong>';
    } else {
      av.className = 'aviso';
      av.innerHTML = '⚠ Selecione uma Filial no topo antes de importar.';
    }
  }
}

function popularModoVendedor() {
  const sel = document.getElementById('modo-vendedor');
  if (!sel) return;

  let opts = '<option value="">👁️ Modo: Filial</option>';
  state.vendedores
    .filter(v => v.ativo && v.papel !== 'administrativo')
    .forEach(v => {
      const f = state.filiais.find(x => x.id === v.filialId);
      opts += '<option value="' + escapeAttr(v.id) + '">👤 ' +
        escapeAttr(v.nome) + (f ? ' · ' + escapeAttr(f.nome) : '') + '</option>';
    });

  sel.innerHTML = opts;
  sel.value = ui.modoVendedor;

  const banner = document.getElementById('banner-modo-vendedor');
  const v = ui.modoVendedor
    ? state.vendedores.find(x => x.id === ui.modoVendedor)
    : null;

  if (v && banner) {
    document.getElementById('banner-modo-nome').textContent = v.nome;
    banner.style.display = 'block';
  } else if (banner) {
    banner.style.display = 'none';
  }
}

function escapeAttr(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Registra pro config.js usar via window
window._popularEscopoSelect = popularEscopoSelect;
window._popularModoVendedor = popularModoVendedor;

// ============================================================
// CONTROLES DE PERÍODO (Clientes)
// ============================================================

function atualizarControlesPeriodo() {
  const selPer = document.getElementById('filtro-cliente-periodo');
  const dIni = document.getElementById('filtro-cliente-data-ini');
  const dFim = document.getElementById('filtro-cliente-data-fim');

  if (selPer) selPer.style.display = '';

  const ehPersonalizado = ui.filtroClientePeriodo === 'personalizado';
  if (dIni) dIni.style.display = ehPersonalizado ? '' : 'none';
  if (dFim) dFim.style.display = ehPersonalizado ? '' : 'none';

  if (dIni && !dIni.value) dIni.value = ui.filtroClienteDataIni || '';
  if (dFim && !dFim.value) dFim.value = ui.filtroClienteDataFim || '';
}

// ============================================================
// LOGIN
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
  document.getElementById('login-email').focus();
}

function ajustarUIUsuario() {
  const papel = session.vendedor ? session.vendedor.papel : 'vendedor';

  const box = document.getElementById('user-box');
  if (box) box.style.display = 'flex';

  document.getElementById('user-nome').textContent =
    session.vendedor ? session.vendedor.nome : (session.user ? session.user.email : '—');

  document.getElementById('user-papel').textContent =
    papel === 'diretor' ? '(diretor)' :
    papel === 'administrativo' ? '(adm)' : '(vendedor)';

  document.getElementById('btn-logout').onclick = async () => {
    if (!confirm('Sair da conta?')) return;
    await sbLogout();
    location.reload();
  };

  if (papel !== 'diretor') {
    ui.modoVendedor = session.vendedor.id;
    document.querySelectorAll('#main-tabs button').forEach(b => {
      if (b.dataset.tab === 'analise' || b.dataset.tab === 'config') {
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
// EXPORTAR EXCEL
// ============================================================

function exportarExcel() {
  if (typeof XLSX === 'undefined') { toast('SheetJS não carregado'); return; }

  try {
    const wb = XLSX.utils.book_new();

    const resumo = [
      ['Alta Fix — Export'],
      ['Escopo: ' + escopoNome(ui.escopoAtual)],
      [],
      ['Vendedor', 'Filial', 'Meta', 'Meta Ticket']
    ];
    state.vendedores.forEach(v => {
      const fi = state.filiais.find(x => x.id === v.filialId);
      resumo.push([v.nome, fi ? fi.nome : '', v.meta || 0, v.metaTicket || 0]);
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumo), 'Vendedores');

    const clientes = state.clientes.map(c => ({
      Cliente: c.nome, Cidade: c.cidade || '', Valor: c.valorTotal,
      Compras: c.numCompras, Ultima: c.ultimaCompra
    }));
    if (clientes.length > 0) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(clientes), 'Clientes');
    }

    const prods = state.produtos.map(p => ({
      Codigo: p.codigo, Descricao: p.descricao,
      Fabricante: p.fabricante || '', Curva: p.curva || '',
      Qtd: p.qtdVendida, Valor: p.valorVendido
    }));
    if (prods.length > 0) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(prods), 'Produtos');
    }

    XLSX.writeFile(wb, 'altafix-' + isoDate(new Date()) + '.xlsx');
    toast('✓ Excel exportado');
  } catch (e) {
    toast('Erro: ' + e.message);
  }
}

// ============================================================
// COLLAPSE
// ============================================================

function setupCollapse(hdrId, bodyId) {
  const h = document.getElementById(hdrId);
  const b = document.getElementById(bodyId);
  if (!h || !b) return;
  h.onclick = () => {
    b.classList.toggle('collapsed');
    h.classList.toggle('collapsed');
  };
}

// ============================================================
// TABS / SUBTABS
// ============================================================

function setupTabs() {
  document.querySelectorAll('#main-tabs button').forEach(b => {
    b.onclick = () => {
      document.querySelectorAll('#main-tabs button').forEach(x => x.classList.remove('active'));
      document.querySelectorAll('section').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      const t = document.getElementById('tab-' + b.dataset.tab);
      if (t) t.classList.add('active');

      if (b.dataset.tab === 'analise') {
        setTimeout(() => {
          try { renderChartYoY(); } catch (e) {}
          try { renderGraficoEvolucao(); } catch (e) {}
        }, 50);
      }
    };
  });

  document.querySelectorAll('.subtabs').forEach(bar => {
    const parent = bar.dataset.parent;
    bar.querySelectorAll('button').forEach(btn => {
      btn.onclick = () => {
        bar.querySelectorAll('button').forEach(x => x.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('#tab-' + parent + ' .subtab-content').forEach(x => {
          x.classList.remove('active');
        });
        const target = document.getElementById('subtab-' + parent + '-' + btn.dataset.subtab);
        if (target) target.classList.add('active');

        if (btn.dataset.subtab === 'comparativo') setTimeout(() => { try { renderChartYoY(); } catch (e) {} }, 50);
        if (btn.dataset.subtab === 'cidades') setTimeout(() => { try { renderCidades(); } catch (e) {} }, 50);
        if (btn.dataset.subtab === 'fabricantes') setTimeout(() => { try { renderFabricantes(); } catch (e) {} }, 50);
        if (btn.dataset.subtab === 'saude') { try { renderDiagnostico(); } catch (e) {} }
      };
    });
  });
}

// ============================================================
// FILTROS
// ============================================================

function setupFiltros() {
  // Produtos
  document.querySelectorAll('.filtros-bar .chip').forEach(c => {
    c.onclick = () => {
      document.querySelectorAll('.filtros-bar .chip').forEach(x => x.classList.remove('active'));
      c.classList.add('active');
      ui.filtroCurva = c.dataset.curva;
      renderProdutos();
    };
  });
  const fp = document.getElementById('filtro-produto');
  if (fp) fp.oninput = e => { ui.filtroTextoProd = e.target.value; renderProdutos(); };
  const ff = document.getElementById('filtro-fabricante');
  if (ff) ff.onchange = e => { ui.filtroFabricante = e.target.value; renderProdutos(); };
  const fdp = document.getElementById('filtro-delta-produto');
  if (fdp) fdp.onchange = e => { ui.filtroDeltaProduto = e.target.value; renderProdutos(); };

  // Clientes — busca
  const fcb = document.getElementById('filtro-cliente-busca');
  if (fcb) fcb.oninput = e => { ui.filtroClienteBusca = e.target.value; renderClientes(); };

  // Clientes — vendedor
  const fcv = document.getElementById('filtro-cliente-vend');
  if (fcv) fcv.onchange = e => { ui.filtroClienteVend = e.target.value; renderClientes(); };

  // Clientes — cidade
  const fcc = document.getElementById('filtro-cliente-cidade');
  if (fcc) fcc.onchange = e => { ui.filtroClienteCidade = e.target.value; renderClientes(); };

  // Clientes — status
  const fcs = document.getElementById('filtro-cliente-status');
  if (fcs) fcs.onchange = e => {
    ui.filtroClienteStatus = e.target.value;
    atualizarControlesPeriodo();
    renderClientes();
  };

  // Clientes — período
  const fcp = document.getElementById('filtro-cliente-periodo');
  if (fcp) fcp.onchange = e => {
    ui.filtroClientePeriodo = e.target.value;
    atualizarControlesPeriodo();
    renderClientes();
  };

  // Clientes — datas personalizadas
  const fcdIni = document.getElementById('filtro-cliente-data-ini');
  if (fcdIni) fcdIni.onchange = e => {
    ui.filtroClienteDataIni = e.target.value;
    renderClientes();
  };
  const fcdFim = document.getElementById('filtro-cliente-data-fim');
  if (fcdFim) fcdFim.onchange = e => {
    ui.filtroClienteDataFim = e.target.value;
    renderClientes();
  };

  // Clientes — ABC
  const fca = document.getElementById('filtro-cliente-abc');
  if (fca) fca.onchange = e => { ui.filtroClienteABC = e.target.value; renderClientes(); };

  // Cidades
  const fcb2 = document.getElementById('filtro-cidade-busca');
  if (fcb2) fcb2.oninput = e => { ui.filtroCidadeBusca = e.target.value; renderCidades(); };
  const fcv2 = document.getElementById('filtro-cidade-vend');
  if (fcv2) fcv2.onchange = e => { ui.filtroCidadeVend = e.target.value; renderCidades(); };
  const oc = document.getElementById('filtro-ocultar-nao-cad');
  if (oc) oc.onchange = renderCidades;

  // Comparativo
  const cfv = document.getElementById('comp-filtro-vendedor');
  if (cfv) cfv.onchange = e => { ui.filtroCompVendedor = e.target.value; renderComparativo(); };

  // Fabricantes
  const fms = document.getElementById('fab-mes-select');
  if (fms) fms.onchange = renderFabricantes;
  const fbs = document.getElementById('fab-busca');
  if (fbs) fbs.oninput = renderFabricantes;
  const ffd = document.getElementById('fab-filtro-delta');
  if (ffd) ffd.onchange = renderFabricantes;

  // Cidades — mês + evolução
  const smc = document.getElementById('cidade-mes-select');
  if (smc) smc.onchange = e => {
    ui.mesCidadesSelecionado = e.target.value || '';
    if (!ui.mesCidadesSelecionado) {
      const ms = Object.keys(state._historico || {}).sort();
      ui.mesCidadesSelecionado = ms.length ? ms[ms.length - 1] : '';
    }
    renderCidades();
  };
  const sce = document.getElementById('cidade-filtro-evolucao');
  if (sce) sce.onchange = renderGraficoEvolucao;
}

// ============================================================
// BOTÕES DIVERSOS
// ============================================================

function setupBotoes() {
  const helpBtn = document.getElementById('help-btn');
  if (helpBtn) helpBtn.onclick = () => document.getElementById('help-modal').classList.add('show');

  const helpClose = document.getElementById('help-close');
  if (helpClose) helpClose.onclick = () => document.getElementById('help-modal').classList.remove('show');

  const helpModal = document.getElementById('help-modal');
  if (helpModal) helpModal.onclick = e => {
    if (e.target.id === 'help-modal') e.target.classList.remove('show');
  };

  const bMin = document.getElementById('btn-min-todos');
  if (bMin) bMin.onclick = () => toggleTodosMinimizaveis(true);

  const bMax = document.getElementById('btn-max-todos');
  if (bMax) bMax.onclick = () => toggleTodosMinimizaveis(false);

  const bRelMat = document.getElementById('btn-relatorio-matinal');
  if (bRelMat) bRelMat.onclick = () => copiarTexto(gerarRelatorioMatinal());

  const bRelFec = document.getElementById('btn-relatorio-fechamento');
  if (bRelFec) bRelFec.onclick = () => copiarTexto(gerarRelatorioFechamento());

  const bSimReset = document.getElementById('btn-sim-reset');
  if (bSimReset) bSimReset.onclick = resetarSimulador;

  const bSimRel = document.getElementById('btn-sim-relatorio');
  if (bSimRel) bSimRel.onclick = copiarCenario;

  const bImpRank = document.getElementById('btn-imprimir-ranking');
  if (bImpRank) bImpRank.onclick = imprimirRanking;

  const bImpCli = document.getElementById('btn-imprimir-clientes');
  if (bImpCli) bImpCli.onclick = imprimirClientes;

  const bImpProd = document.getElementById('btn-imprimir-produtos');
  if (bImpProd) bImpProd.onclick = imprimirProdutos;

  const bImpCid = document.getElementById('btn-imprimir-cidades');
  if (bImpCid) bImpCid.onclick = imprimirCidades;

  const bCopInat = document.getElementById('btn-copiar-inativos');
  if (bCopInat) bCopInat.onclick = copiarInativos;

  const bCopSeg = document.getElementById('btn-copiar-segmento');
  if (bCopSeg) bCopSeg.onclick = copiarSegmento;

  const bCopCid = document.getElementById('btn-copiar-cidades');
  if (bCopCid) bCopCid.onclick = copiarCidades;

  const bExcel = document.getElementById('btn-export-excel');
  if (bExcel) bExcel.onclick = exportarExcel;

  const bBackup = document.getElementById('btn-backup');
  if (bBackup) bBackup.onclick = exportarJSON;

  // Escopo
  const escopo = document.getElementById('escopo-select');
  if (escopo) escopo.onchange = e => {
    ui.escopoAtual = e.target.value;
    ui.filtroClienteVend = '';
    ui.filtroClienteCidade = '';
    ui.filtroCidadeVend = '';
    ui.filtroCidadeBusca = '';
    ui.filtroCompVendedor = '';

    const sv = document.getElementById('filtro-cliente-vend');
    if (sv) sv.value = '';
    const sc = document.getElementById('filtro-cliente-cidade');
    if (sc) sc.value = '';
    const scv = document.getElementById('filtro-cidade-vend');
    if (scv) scv.value = '';
    const scb = document.getElementById('filtro-cidade-busca');
    if (scb) scb.value = '';
    const scomp = document.getElementById('comp-filtro-vendedor');
    if (scomp) scomp.value = '';

    popularEscopoSelect();
    renderTudo();
  };

  // Modo vendedor
  const mv = document.getElementById('modo-vendedor');
  if (mv) mv.onchange = e => {
    ui.modoVendedor = e.target.value;
    popularModoVendedor();
    renderTudo();
  };

  const bSairModo = document.getElementById('btn-sair-modo');
  if (bSairModo) bSairModo.onclick = () => {
    ui.modoVendedor = '';
    popularModoVendedor();
    renderTudo();
  };

  // Semana
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

// ============================================================
// BOOTSTRAP
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  try {
    // 1. Carrega do localStorage (cache)
    carregar();

    // 2. Inicializa Supabase
    if (!sbInit()) {
      const err = document.getElementById('login-erro');
      if (err) {
        err.textContent = 'Falha ao inicializar Supabase.';
        err.style.display = 'block';
      }
      const tela = document.getElementById('tela-login');
      if (tela) tela.style.display = 'flex';
      return;
    }

    // 3. Verifica sessão
    const sess = await sbSessaoAtual();
    if (!sess) { mostrarLogin(); return; }

    // 4. Carrega perfil
    const perfilOk = await sbCarregarPerfil();
    if (!perfilOk) {
      const tela = document.getElementById('tela-login');
      if (tela) tela.style.display = 'flex';
      const erroEl = document.getElementById('login-erro');
      if (erroEl) {
        erroEl.textContent = 'Usuário existe no auth, mas não está vinculado a um vendedor.';
        erroEl.style.display = 'block';
      }
      return;
    }

    // 5. Carrega tudo do banco
    toast('⏳ Carregando dados...');
    let dados;
    try {
      dados = await sbCarregarTudo();
    } catch (e) {
      toast('❌ Erro ao carregar: ' + e.message);
      console.error(e);
      dados = { vendedores: [], clientes: [], produtos: [], lancamentos: [], cidades: [], comparativo: [] };
    }

    aplicarDadosDoBanco(dados);
    derivarHistorico();

    // 6. UI do usuário
    ajustarUIUsuario();

    // 7. Popula selects
    popularEscopoSelect();
    popularModoVendedor();

    // 8. Registra event listeners
    setupTabs();
    setupFiltros();
    setupBotoes();
    setupImports();
    setupLancar();
    setupMetas();
    setupFiliais();
    setupGeral();
    setupClientesNovos();

    // 9. Collapse dos headers de seção
    setupCollapse('hdr-historico', 'body-historico');
    setupCollapse('hdr-comp-mes', 'body-comp-mes');
    setupCollapse('hdr-comp-vend', 'body-comp-vend');
    setupCollapse('hdr-comp-tot', 'body-comp-tot');
    setupCollapse('hdr-abc', 'body-abc');

    // 10. Minimizáveis
    aplicarMinimizaveis();

    // 11. Controles de período (Clientes)
    atualizarControlesPeriodo();

    // 12. Render inicial
    renderTudo();

    toast('✓ Pronto');
  } catch (e) {
    const el = document.getElementById('erro-banner');
    if (el) {
      el.style.display = 'block';
      el.textContent = 'ERRO: ' + e.message + '\n' + (e.stack || '');
    }
    console.error(e);
  }
});