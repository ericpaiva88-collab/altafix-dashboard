// ============================================================
// views/clientes.js — Clientes + Novos & Reativados
// ============================================================

import { state, ui } from '../state.js';
import {
  fmtBRL, escapeHtml, badgeSuspeito, copiarTexto, isoDate, diffDias,
  fmtDataBR
} from '../utils.js';
import {
  clientesNoEscopo, calcRFMScores, calcABCClientes,
  rfmLabel, parseEscopo
} from '../calc.js';
import { imprimirHTML } from './painel.js';

// ============================================================
// RENDER PRINCIPAL
// ============================================================

export function renderClientes() {
  const k = document.getElementById('clientes-kpis');
  const seg = document.getElementById('segmento-kpis');
  const te = document.getElementById('tbody-clientes');
  const ce = document.getElementById('clientes-count');
  const suspeitoEl = document.getElementById('clientes-suspeito');

  let clientesBase = clientesNoEscopo(ui.escopoAtual);
  if (ui.modoVendedor) {
    clientesBase = clientesBase.filter(c => c.vendedor === ui.modoVendedor);
  }

  if (clientesBase.length === 0) {
    k.innerHTML = '';
    seg.innerHTML = '';
    te.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:30px;color:#64748b;">' +
      'Nenhum cliente. Importe o 324.</td></tr>';
    ce.textContent = '';
    if (suspeitoEl) suspeitoEl.innerHTML = '';
    renderClientesNovosReativados();
    return;
  }

  const clsBase = clientesBase.slice();
  calcRFMScores(clsBase);
  calcABCClientes(clsBase);

  popularSelectVendedor(clsBase);
  popularSelectCidade(clsBase);

  const filtrados = clsBase.filter(c => {
    if (ui.filtroClienteVend && c.vendedor !== ui.filtroClienteVend) return false;
    if (ui.filtroClienteCidade && c.cidade !== ui.filtroClienteCidade) return false;
    if (ui.filtroClienteBusca) {
      const t = ui.filtroClienteBusca.toUpperCase();
      if (String(c.nome).toUpperCase().indexOf(t) < 0) return false;
    }
    if (ui.filtroClienteStatus === 'inativos' && c.diasSemComprar < 30) return false;
    if (ui.filtroClienteStatus === 'criticos' && c.diasSemComprar < 90) return false;
    if (ui.filtroClienteStatus === 'sem-vendedor' && c.vendedor) return false;
    if (ui.filtroClienteRFM && c.rfm_segmento !== ui.filtroClienteRFM) return false;
    if (ui.filtroClienteABC && c.abcCliente !== ui.filtroClienteABC) return false;
    return true;
  });

  renderKPIs(filtrados, clsBase);
  renderSegmentos(clsBase);

  ce.textContent = filtrados.length + ' clientes';
  const semVend = filtrados.filter(c => !c.vendedor).length;
  if (suspeitoEl) {
    if (semVend > 0) {
      suspeitoEl.innerHTML = badgeSuspeito(semVend + ' cliente(s) sem vendedor vinculado.');
    } else {
      suspeitoEl.innerHTML = '';
    }
  }

  renderTabela(filtrados);
  window._clientesFiltrados = filtrados;

  renderClientesNovosReativados();
}

// ============================================================
// SELECTS DINÂMICOS
// ============================================================

function popularSelectVendedor(clientes) {
  const selV = document.getElementById('filtro-cliente-vend');
  if (!selV) return;
  if (selV.options.length > 1) return;

  const vistos = {};
  clientes.forEach(c => { if (c.vendedor) vistos[c.vendedor] = true; });

  let opts = '<option value="">Todos vendedores</option>';
  Object.keys(vistos).forEach(id => {
    const v = state.vendedores.find(x => x.id === id);
    if (v) opts += '<option value="' + escapeHtml(id) + '">' + escapeHtml(v.nome) + '</option>';
  });
  selV.innerHTML = opts;
}

function popularSelectCidade(clientes) {
  const selC = document.getElementById('filtro-cliente-cidade');
  if (!selC) return;
  if (selC.options.length > 1) return;

  const cids = {};
  clientes.forEach(c => { if (c.cidade) cids[c.cidade] = true; });

  let optsC = '<option value="">Todas cidades</option>';
  Object.keys(cids).sort().forEach(cid => {
    optsC += '<option value="' + escapeHtml(cid) + '">' + escapeHtml(cid) + '</option>';
  });
  selC.innerHTML = optsC;
}

// ============================================================
// KPIs
// ============================================================

function renderKPIs(filtrados, clsBase) {
  const k = document.getElementById('clientes-kpis');

  const inat = filtrados.filter(c => c.diasSemComprar >= 30);
  const tr = inat.reduce((s, c) => s + (c.valorMedioMensal || 0), 0);
  const fatFiltro = filtrados.reduce((s, c) => s + (c.valorTotal || 0), 0);

  k.innerHTML =
    '<div class="kpi"><div class="label">Clientes</div>' +
    '<div class="value">' + filtrados.length + '</div>' +
    '<div class="hint">de ' + clsBase.length + '</div></div>' +
    '<div class="kpi"><div class="label">Valor total</div>' +
    '<div class="value">' + fmtBRL(fatFiltro) + '</div></div>' +
    '<div class="kpi ' + (inat.length > 0 ? 'negativo' : 'positivo') + '">' +
    '<div class="label">Inativos</div>' +
    '<div class="value">' + inat.length + '</div></div>' +
    '<div class="kpi negativo"><div class="label">Valor em risco</div>' +
    '<div class="value">' + fmtBRL(tr) + '</div></div>';
}

// ============================================================
// SEGMENTOS
// ============================================================

function renderSegmentos(clsBase) {
  const seg = document.getElementById('segmento-kpis');

  const segCount = { campeao: 0, leal: 0, promissor: 0, risco: 0, hibernando: 0 };
  const segValor = { campeao: 0, leal: 0, promissor: 0, risco: 0, hibernando: 0 };

  clsBase.forEach(c => {
    segCount[c.rfm_segmento] = (segCount[c.rfm_segmento] || 0) + 1;
    segValor[c.rfm_segmento] = (segValor[c.rfm_segmento] || 0) + (c.valorTotal || 0);
  });

  const segmentos = [
    { key: 'campeao', label: '🏆 Campeões', cor: '#16a34a' },
    { key: 'leal', label: '💙 Leais', cor: '#0ea5e9' },
    { key: 'promissor', label: '🌱 Promissores', cor: '#ca8a04' },
    { key: 'risco', label: '🚨 Em risco', cor: '#dc2626' },
    { key: 'hibernando', label: '💤 Hibernando', cor: '#64748b' }
  ];

  seg.innerHTML = segmentos.map(s => {
    const sel = (ui.filtroClienteRFM === s.key) ? 'outline:2px solid ' + s.cor + ';' : '';
    return '<div class="kpi" data-segmento="' + s.key + '" ' +
      'style="border-left:4px solid ' + s.cor + ';cursor:pointer;' + sel + '">' +
      '<div class="label">' + s.label + '</div>' +
      '<div class="value">' + (segCount[s.key] || 0) + '</div>' +
      '<div class="hint">' + fmtBRL(segValor[s.key] || 0) + '</div></div>';
  }).join('');

  seg.querySelectorAll('[data-segmento]').forEach(el => {
    el.onclick = () => {
      const kk = el.dataset.segmento;
      ui.filtroClienteRFM = (ui.filtroClienteRFM === kk) ? '' : kk;
      const selF = document.getElementById('filtro-cliente-rfm');
      if (selF) selF.value = ui.filtroClienteRFM;
      renderClientes();
    };
  });
}

// ============================================================
// TABELA PRINCIPAL
// ============================================================

function renderTabela(filtrados) {
  const te = document.getElementById('tbody-clientes');
  const mostraFilial = parseEscopo(ui.escopoAtual).tipo !== 'filial';

  const st = filtrados.slice().sort((a, b) => (b.valorTotal || 0) - (a.valorTotal || 0));

  if (st.length === 0) {
    te.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:20px;color:#64748b;">' +
      'Nenhum cliente.</td></tr>';
    return;
  }

  te.innerHTML = st.slice(0, 500).map(c => {
    const v = state.vendedores.find(x => x.id === c.vendedor);
    const fi = state.filiais.find(x => x.id === c.filialId);

    let bd = '';
    if (c.diasSemComprar >= 90) {
      bd = '<span class="badge badge-risco">CRÍTICO</span>';
    } else if (c.diasSemComprar >= 60) {
      bd = '<span class="badge" style="background:#f59e0b;color:#fff;">ATENÇÃO</span>';
    } else if (c.diasSemComprar >= 30) {
      bd = '<span class="badge" style="background:#fbbf24;color:#78350f;">OBSERVAR</span>';
    } else {
      bd = '<span class="badge badge-ok">ATIVO</span>';
    }

    let vendTxt = v ? escapeHtml(v.nome) : '<span style="color:#dc2626;">⚠ sem vendedor</span>';
    if (mostraFilial && fi) {
      vendTxt += ' <span class="badge badge-filial" style="font-size:10px;">' +
        escapeHtml(fi.nome) + '</span>';
    }

    const clsSuspeito = !c.vendedor ? 'suspeito' : '';
    const ticket = c.valorTotal / Math.max(1, c.numCompras);

    return '<tr class="' + clsSuspeito + '">' +
      '<td>' + escapeHtml(c.nome) + '</td>' +
      '<td>' + escapeHtml(c.cidade || '—') + '</td>' +
      '<td>' + vendTxt + '</td>' +
      '<td><span class="badge badge-rfm ' + c.rfm_segmento + '">' +
        rfmLabel(c.rfm_segmento) + '</span></td>' +
      '<td><span class="badge badge-' + c.abcCliente + '">' + c.abcCliente + '</span></td>' +
      '<td class="num">' + fmtBRL(c.valorTotal) + '</td>' +
      '<td class="num">' + c.numCompras + '</td>' +
      '<td class="num">' + fmtBRL(ticket) + '</td>' +
      '<td class="num">' + (c.diasSemComprar < 9999 ? c.diasSemComprar + 'd' : '—') + '</td>' +
      '<td>' + bd + '</td></tr>';
  }).join('');
}

// ============================================================
// NOVOS & REATIVADOS
// ============================================================

/**
 * Classifica um cliente com base no histórico de importações.
 * Retorna 'novo', 'reativado' ou null.
 */
function classificarCliente(clienteNorm, filialId, hj, diasJanela) {
  const rows = (state.clientesImportacoes || []).filter(r =>
    r.clienteNorm === clienteNorm && r.filialId === filialId
  );
  if (rows.length === 0) return null;

  // Ordena por periodoIni
  rows.sort((a, b) => (a.periodoIni || '').localeCompare(b.periodoIni || ''));

  const primeiraCompra = rows[0].periodoIni;
  const ultimaCompra = rows[rows.length - 1].ultimaCompra || rows[rows.length - 1].periodoIni;

  // Novo: primeira compra dentro da janela
  const diasDesdePrimeira = diffDias(primeiraCompra, hj);
  if (diasDesdePrimeira <= diasJanela) return 'novo';

  // Reativado: última compra dentro da janela, com gap >= 90 dias antes
  const diasDesdeUltima = diffDias(ultimaCompra, hj);
  if (diasDesdeUltima > diasJanela) return null;

  for (let i = rows.length - 1; i > 0; i--) {
    const atual = rows[i];
    const anterior = rows[i - 1];
    const gap = diffDias(anterior.ultimaCompra, atual.periodoIni);
    if (gap >= 90) return 'reativado';
  }

  return null;
}

export function renderClientesNovosReativados() {
  const kEl = document.getElementById('novos-kpis');
  const tb = document.getElementById('tbody-novos');
  const selPeriodo = document.getElementById('novos-periodo');
  const selVendedor = document.getElementById('novos-vendedor');
  const selTipo = document.getElementById('novos-tipo');
  const countEl = document.getElementById('novos-count');

  if (!tb) return;

  let base = clientesNoEscopo(ui.escopoAtual);
  if (ui.modoVendedor) base = base.filter(c => c.vendedor === ui.modoVendedor);

  const periodo = selPeriodo ? (parseInt(selPeriodo.value, 10) || 30) : 30;
  const filtroVend = selVendedor ? selVendedor.value : '';
  const filtroTipo = selTipo ? selTipo.value : '';
  const hj = isoDate(new Date());

  // Popular selects
  if (selVendedor && selVendedor.options.length <= 1) {
    const vistos = {};
    base.forEach(c => { if (c.vendedor) vistos[c.vendedor] = true; });
    let opts = '<option value="">Todos vendedores</option>';
    Object.keys(vistos).forEach(id => {
      const v = state.vendedores.find(x => x.id === id);
      if (v) opts += '<option value="' + escapeHtml(id) + '">' + escapeHtml(v.nome) + '</option>';
    });
    selVendedor.innerHTML = opts;
  }

  // Classifica cada cliente
  const classificados = base.map(c => {
    const tipo = classificarCliente(
      c.nome.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[.,;:\-()\/\\'`"]/g, '').replace(/\s+/g, ' ').trim(),
      c.filialId, hj, periodo
    );
    return tipo ? { ...c, _tipo: tipo } : null;
  }).filter(Boolean);

  // Aplica filtros
  const filtrados = classificados.filter(c => {
    if (filtroVend && c.vendedor !== filtroVend) return false;
    if (filtroTipo && c._tipo !== filtroTipo) return false;
    return true;
  }).sort((a, b) => {
    // Reativados primeiro, depois novos, e dentro de cada grupo mais recente primeiro
    if (a._tipo !== b._tipo) return a._tipo === 'reativado' ? -1 : 1;
    return (b.primeiraCompra || '').localeCompare(a.primeiraCompra || '');
  });

  // KPIs
  const novosCount = filtrados.filter(c => c._tipo === 'novo').length;
  const reatCount = filtrados.filter(c => c._tipo === 'reativado').length;
  const totalValor = filtrados.reduce((s, c) => s + (c.valorTotal || 0), 0);
  const totalCompras = filtrados.reduce((s, c) => s + (c.numCompras || 0), 0);
  const ticketMedio = totalCompras > 0 ? totalValor / totalCompras : 0;

  if (kEl) {
    kEl.innerHTML =
      '<div class="kpi positivo"><div class="label">🆕 Novos</div>' +
      '<div class="value">' + novosCount + '</div>' +
      '<div class="hint">primeira compra em ' + periodo + 'd</div></div>' +
      '<div class="kpi" style="border-left:4px solid #0ea5e9;">' +
      '<div class="label">♻️ Reativados</div>' +
      '<div class="value">' + reatCount + '</div>' +
      '<div class="hint">90+ dias sem comprar</div></div>' +
      '<div class="kpi"><div class="label">Valor total</div>' +
      '<div class="value">' + fmtBRL(totalValor) + '</div></div>' +
      '<div class="kpi"><div class="label">Ticket médio</div>' +
      '<div class="value">' + fmtBRL(ticketMedio) + '</div></div>';
  }

  if (countEl) countEl.textContent = filtrados.length + ' cliente(s)';

  if (filtrados.length === 0) {
    tb.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:#64748b;">' +
      'Nenhum cliente novo ou reativado nos últimos ' + periodo + ' dias.</td></tr>';
    return;
  }

  tb.innerHTML = filtrados.slice(0, 300).map(c => {
    const v = state.vendedores.find(x => x.id === c.vendedor);
    const ehNovo = c._tipo === 'novo';
    const badge = ehNovo
      ? '<span class="badge" style="background:#16a34a;color:#fff;">🆕 Novo</span>'
      : '<span class="badge" style="background:#0ea5e9;color:#fff;">♻️ Reativado</span>';

    return '<tr>' +
      '<td>' + escapeHtml(c.nome) + '</td>' +
      '<td>' + escapeHtml(c.cidade || '—') + '</td>' +
      '<td>' + (v ? escapeHtml(v.nome) : '<span style="color:#dc2626;">⚠ sem</span>') + '</td>' +
      '<td>' + badge + '</td>' +
      '<td>' + fmtDataBR(c.primeiraCompra) + '</td>' +
      '<td class="num">' + fmtBRL(c.valorTotal) + '</td>' +
      '<td class="num">' + (c.numCompras || 0) + '</td></tr>';
  }).join('');
}

export function setupClientesNovos() {
  const selPeriodo = document.getElementById('novos-periodo');
  if (selPeriodo) selPeriodo.onchange = renderClientesNovosReativados;

  const selVendedor = document.getElementById('novos-vendedor');
  if (selVendedor) selVendedor.onchange = renderClientesNovosReativados;

  const selTipo = document.getElementById('novos-tipo');
  if (selTipo) selTipo.onchange = renderClientesNovosReativados;
}

// ============================================================
// COPIAR
// ============================================================

export function copiarInativos() {
  const x = (window._clientesFiltrados || []).filter(c => c.diasSemComprar >= 30);
  if (x.length === 0) { copiarTexto('Nenhum inativo.'); return; }

  x.sort((a, b) => (b.valorMedioMensal || 0) - (a.valorMedioMensal || 0));

  let m = '🎯 Reativar:\n\n';
  x.slice(0, 15).forEach((c, i) => {
    const v = state.vendedores.find(y => y.id === c.vendedor);
    m += (i + 1) + ') ' + c.nome + (c.cidade ? ' (' + c.cidade + ')' : '') +
      ' — ' + (v ? v.nome : '—') + '\n   ' + c.diasSemComprar + ' dias\n\n';
  });
  copiarTexto(m);
}

export function copiarSegmento() {
  const x = window._clientesFiltrados || [];
  if (x.length === 0) { copiarTexto('Nenhum cliente.'); return; }

  x.sort((a, b) => (b.valorTotal || 0) - (a.valorTotal || 0));

  let m = '🎯 Clientes:\n\n';
  x.slice(0, 20).forEach((c, i) => {
    m += (i + 1) + ') ' + c.nome + (c.cidade ? ' (' + c.cidade + ')' : '') +
      ' — ' + fmtBRL(c.valorTotal) + '\n';
  });
  copiarTexto(m);
}

// ============================================================
// IMPRESSÃO
// ============================================================

export function imprimirClientes() {
  const lista = window._clientesFiltrados || [];
  if (lista.length === 0) { copiarTexto('Nada para imprimir'); return; }

  let h = '<table><thead><tr>' +
    '<th>Cliente</th><th>Cidade</th><th>Vendedor</th><th>Segmento</th>' +
    '<th>ABC</th><th class="num">Valor</th><th class="num">Compras</th>' +
    '<th class="num">Dias</th></tr></thead><tbody>';

  lista.slice(0, 1000).forEach(c => {
    const v = state.vendedores.find(x => x.id === c.vendedor);
    h += '<tr><td>' + escapeHtml(c.nome) + '</td>' +
      '<td>' + escapeHtml(c.cidade || '—') + '</td>' +
      '<td>' + escapeHtml(v ? v.nome : '—') + '</td>' +
      '<td>' + rfmLabel(c.rfm_segmento) + '</td>' +
      '<td>' + c.abcCliente + '</td>' +
      '<td class="num">' + fmtBRL(c.valorTotal) + '</td>' +
      '<td class="num">' + c.numCompras + '</td>' +
      '<td class="num">' + (c.diasSemComprar < 9999 ? c.diasSemComprar + 'd' : '—') + '</td></tr>';
  });
  h += '</tbody></table>';

  imprimirHTML('Lista de Clientes', lista.length + ' clientes', h);
}