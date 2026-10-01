// ============================================================
// views/clientes.js — Tela de Clientes unificada
// ============================================================

import { state, ui } from '../state.js';
import {
  fmtBRL, fmtPct, escapeHtml, badgeSuspeito, copiarTexto, isoDate, diffDias,
  fmtDataBR, normalizarNomeCliente
} from '../utils.js';
import {
  clientesNoEscopo, calcRFMScores, calcABCClientes,
  rfmLabel, parseEscopo
} from '../calc.js';
import { imprimirHTML } from './painel.js';

const GAP_REATIVADO = 90;
const EM_RISCO_ATE = 180;

// ============================================================
// ÍNDICE DE IMPORTAÇÕES
// ============================================================

let _indiceImportacoes = null;
let _indiceTimestamp = 0;

function getIndiceImportacoes() {
  const agora = Date.now();
  if (_indiceImportacoes && (agora - _indiceTimestamp) < 500) {
    return _indiceImportacoes;
  }
  const idx = {};
  (state.clientesImportacoes || []).forEach(r => {
    const k = r.filialId + '|' + r.clienteNorm;
    if (!idx[k]) idx[k] = [];
    idx[k].push(r);
  });
  Object.keys(idx).forEach(k => {
    idx[k].sort((a, b) => (a.periodoIni || '').localeCompare(b.periodoIni || ''));
  });
  _indiceImportacoes = idx;
  _indiceTimestamp = agora;
  return idx;
}

// ============================================================
// PERÍODO
// ============================================================

function calcularPeriodo() {
  const preset = ui.filtroClientePeriodo || 'tudo';
  if (preset === 'tudo') return null;

  const hj = new Date();
  let inicio, fim;

  if (preset === 'personalizado') {
    if (!ui.filtroClienteDataIni || !ui.filtroClienteDataFim) return null;
    return { ini: ui.filtroClienteDataIni, fim: ui.filtroClienteDataFim, nome: 'Personalizado' };
  }

  if (preset === 'mes_atual') {
    inicio = new Date(hj.getFullYear(), hj.getMonth(), 1);
    fim = new Date(hj.getFullYear(), hj.getMonth() + 1, 0);
  } else if (preset === 'mes_passado') {
    inicio = new Date(hj.getFullYear(), hj.getMonth() - 1, 1);
    fim = new Date(hj.getFullYear(), hj.getMonth(), 0);
  } else if (preset === 'trimestre_atual') {
    const t = Math.floor(hj.getMonth() / 3);
    inicio = new Date(hj.getFullYear(), t * 3, 1);
    fim = new Date(hj.getFullYear(), t * 3 + 3, 0);
  } else if (preset === 'trimestre_passado') {
    let t = Math.floor(hj.getMonth() / 3) - 1;
    let ano = hj.getFullYear();
    if (t < 0) { t = 3; ano--; }
    inicio = new Date(ano, t * 3, 1);
    fim = new Date(ano, t * 3 + 3, 0);
  } else if (preset === 'semestre_atual') {
    const s = hj.getMonth() < 6 ? 0 : 1;
    inicio = new Date(hj.getFullYear(), s * 6, 1);
    fim = new Date(hj.getFullYear(), s * 6 + 6, 0);
  } else if (preset === 'semestre_passado') {
    let s = hj.getMonth() < 6 ? 1 : 0;
    let ano = hj.getFullYear();
    if (hj.getMonth() < 6) ano--;
    inicio = new Date(ano, s * 6, 1);
    fim = new Date(ano, s * 6 + 6, 0);
  } else if (preset === 'ano_atual') {
    inicio = new Date(hj.getFullYear(), 0, 1);
    fim = new Date(hj.getFullYear(), 11, 31);
  } else if (preset === 'ano_passado') {
    inicio = new Date(hj.getFullYear() - 1, 0, 1);
    fim = new Date(hj.getFullYear() - 1, 11, 31);
  } else {
    return null;
  }

  const nomeSel = document.getElementById('filtro-cliente-periodo');
  let nome = 'Período';
  if (nomeSel) {
    nome = nomeSel.options[nomeSel.selectedIndex].text.replace('📅 ', '');
  }

  return { ini: isoDate(inicio), fim: isoDate(fim), nome };
}

// ============================================================
// VALOR NO PERÍODO
// ============================================================

function valorNoPeriodo(cliente, periodo) {
  if (!periodo) return { valor: cliente.valorTotal || 0, compras: cliente.numCompras || 0 };
  const idx = getIndiceImportacoes();
  const k = cliente.filialId + '|' + normalizarNomeCliente(cliente.nome);
  const rows = idx[k] || [];

  let valor = 0, compras = 0;
  rows.forEach(r => {
    if (r.periodoIni >= periodo.ini && r.periodoIni <= periodo.fim) {
      valor += Number(r.valor) || 0;
      compras += Number(r.numCompras) || 0;
    }
  });
  return { valor, compras };
}

function comprouNoPeriodo(cliente, periodo) {
  if (!periodo) return true;
  const r = valorNoPeriodo(cliente, periodo);
  return r.compras > 0 || r.valor > 0;
}

// ============================================================
// CLASSIFICAÇÃO: novo / reativado
// ============================================================

function classificar(cliente, periodo) {
  if (!periodo) return null;

  const idx = getIndiceImportacoes();
  const k = cliente.filialId + '|' + normalizarNomeCliente(cliente.nome);
  const rows = idx[k];
  if (!rows || rows.length === 0) return null;

  const primeira = rows[0].periodoIni;

  if (primeira >= periodo.ini && primeira <= periodo.fim) {
    return {
      tipo: 'novo',
      quando: primeira,
      detalhe: 'Primeira compra em ' + fmtDataBR(primeira)
    };
  }

  if (rows.length < 2) return null;

  const ultimaRow = rows[rows.length - 1];
  const penultimaRow = rows[rows.length - 2];
  const voltaEm = ultimaRow.periodoIni;

  if (voltaEm < periodo.ini || voltaEm > periodo.fim) return null;

  const gap = diffDias(
    penultimaRow.ultimaCompra || penultimaRow.periodoIni,
    ultimaRow.periodoIni
  );

  if (gap >= GAP_REATIVADO) {
    const totalCompras = cliente.numCompras || 0;
    const ativoAgora = totalCompras >= 10 && (cliente.diasSemComprar || 999) <= 15;
    if (ativoAgora) return null;

    return {
      tipo: 'reativado',
      quando: voltaEm,
      detalhe: 'Voltou em ' + fmtDataBR(voltaEm) + ' após ' + gap + 'd parado'
    };
  }

  return null;
}

// ============================================================
// RENDER PRINCIPAL
// ============================================================

export function renderClientes() {
  const k = document.getElementById('clientes-kpis');
  const te = document.getElementById('tbody-clientes');
  const ce = document.getElementById('clientes-count');
  const suspeitoEl = document.getElementById('clientes-suspeito');

  let clientesBase = clientesNoEscopo(ui.escopoAtual);
  if (ui.modoVendedor) {
    clientesBase = clientesBase.filter(c => c.vendedor === ui.modoVendedor);
  }

  if (clientesBase.length === 0) {
    k.innerHTML = '';
    te.innerHTML = '<tr><td colspan="11" style="text-align:center;padding:30px;color:#64748b;">' +
      'Nenhum cliente. Importe o 324.</td></tr>';
    ce.textContent = '';
    if (suspeitoEl) suspeitoEl.innerHTML = '';
    renderChips([]);
    renderResumoNovosReativados([], {}, null, null);
    return;
  }

  const clsBase = clientesBase.slice();
  calcRFMScores(clsBase);
  calcABCClientes(clsBase);

  const st = ui.filtroClienteStatus;
  const periodo = calcularPeriodo();
  const usaPeriodoNovos = (st === 'novos' || st === 'reativados');

  const classificados = {};
  if (usaPeriodoNovos && periodo) {
    clsBase.forEach(c => {
      const res = classificar(c, periodo);
      if (res) classificados[c.id] = res;
    });
  }

  popularSelectVendedor(clsBase);
  popularSelectCidade(clsBase);

  const filtrados = clsBase.filter(c => {
    if (ui.filtroClienteVend && c.vendedor !== ui.filtroClienteVend) return false;
    if (ui.filtroClienteCidade && c.cidade !== ui.filtroClienteCidade) return false;
    if (ui.filtroClienteBusca) {
      const t = ui.filtroClienteBusca.toUpperCase();
      if (String(c.nome).toUpperCase().indexOf(t) < 0) return false;
    }

    if (periodo && !usaPeriodoNovos) {
      if (!comprouNoPeriodo(c, periodo)) return false;
    }

    if (st === 'ativos' && c.diasSemComprar >= 30) return false;
    if (st === 'inativos' && c.diasSemComprar < 30) return false;
    if (st === 'criticos' && c.diasSemComprar < 90) return false;
    if (st === 'sem-vendedor' && c.vendedor) return false;
    if (st === 'novos' && (!classificados[c.id] || classificados[c.id].tipo !== 'novo')) return false;
    if (st === 'reativados' && (!classificados[c.id] || classificados[c.id].tipo !== 'reativado')) return false;

    if (ui.filtroClienteRFM && c.rfm_segmento !== ui.filtroClienteRFM) return false;
    if (ui.filtroClienteABC && c.abcCliente !== ui.filtroClienteABC) return false;

    return true;
  });

  renderKPIs(filtrados, clsBase, periodo);
  renderChips(clsBase);

  ce.textContent = filtrados.length + ' clientes';
  const semVend = filtrados.filter(c => !c.vendedor).length;
  if (suspeitoEl) {
    if (semVend > 0) {
      suspeitoEl.innerHTML = badgeSuspeito(semVend + ' cliente(s) sem vendedor vinculado.');
    } else {
      suspeitoEl.innerHTML = '';
    }
  }

  renderTabela(filtrados, classificados, usaPeriodoNovos, periodo);
  renderResumoNovosReativados(filtrados, classificados, periodo, usaPeriodoNovos);
  window._clientesFiltrados = filtrados;
}

// ============================================================
// HELPERS DE SELECT
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

function renderKPIs(filtrados, clsBase, periodo) {
  const k = document.getElementById('clientes-kpis');

  const emRisco = filtrados.filter(c =>
    c.diasSemComprar >= 30 && c.diasSemComprar < EM_RISCO_ATE
  );
  const perdidos = filtrados.filter(c => c.diasSemComprar >= EM_RISCO_ATE);

  const valorEmRisco = emRisco.reduce((s, c) => s + (c.valorMedioMensal || 0), 0);
  const valorAcum = filtrados.reduce((s, c) => s + (c.valorTotal || 0), 0);

  let valorPeriodo = 0;
  if (periodo) {
    filtrados.forEach(c => {
      const vp = valorNoPeriodo(c, periodo);
      valorPeriodo += vp.valor;
    });
  } else {
    valorPeriodo = valorAcum;
  }

  const labelPeriodo = periodo ? ('em ' + periodo.nome.toLowerCase()) : 'acumulado total';

  k.innerHTML =
    '<div class="kpi"><div class="label">Clientes</div>' +
    '<div class="value">' + filtrados.length + '</div>' +
    '<div class="hint">de ' + clsBase.length + '</div></div>' +
    '<div class="kpi"><div class="label">Valor acumulado</div>' +
    '<div class="value">' + fmtBRL(valorAcum) + '</div></div>' +
    '<div class="kpi"><div class="label">Valor no período</div>' +
    '<div class="value">' + fmtBRL(valorPeriodo) + '</div>' +
    '<div class="hint">' + labelPeriodo + '</div></div>' +
    '<div class="kpi" style="border-left:4px solid #f59e0b;">' +
    '<div class="label">Em risco (30-180d)</div>' +
    '<div class="value">' + emRisco.length + '</div>' +
    '<div class="hint">' + fmtBRL(valorEmRisco) + '/mês</div></div>' +
    '<div class="kpi" style="border-left:4px solid #64748b;">' +
    '<div class="label">Perdidos (180d+)</div>' +
    '<div class="value">' + perdidos.length + '</div></div>' +
    '<div class="kpi negativo"><div class="label">Valor em risco real</div>' +
    '<div class="value">' + fmtBRL(valorEmRisco) + '</div>' +
    '<div class="hint">só os recuperáveis</div></div>';
}

// ============================================================
// CHIPS DE SEGMENTO
// ============================================================

function renderChips(clsBase) {
  const container = document.getElementById('chips-segmento');
  if (!container) return;

  const counts = { campeao: 0, leal: 0, promissor: 0, risco: 0, hibernando: 0 };
  const total = clsBase.length;
  clsBase.forEach(c => { counts[c.rfm_segmento] = (counts[c.rfm_segmento] || 0) + 1; });

  const segmentos = [
    { key: 'campeao',    emoji: '🏆', label: 'Campeões',    cor: '#16a34a' },
    { key: 'leal',       emoji: '💙', label: 'Leais',       cor: '#0ea5e9' },
    { key: 'promissor',  emoji: '🌱', label: 'Promissores', cor: '#ca8a04' },
    { key: 'risco',      emoji: '🚨', label: 'Em risco',    cor: '#dc2626' },
    { key: 'hibernando', emoji: '💤', label: 'Hibernando',  cor: '#64748b' }
  ];

  let h = '<span style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;' +
    'letter-spacing:.5px;margin-right:4px;">Segmento:</span>';

  const ativoTodos = !ui.filtroClienteRFM;
  h += '<button class="chip-seg' + (ativoTodos ? ' active' : '') +
    '" data-segmento="">Todos (' + total + ')</button>';

  segmentos.forEach(s => {
    const sel = ui.filtroClienteRFM === s.key;
    h += '<button class="chip-seg' + (sel ? ' active' : '') +
      '" data-segmento="' + s.key + '"' +
      (sel ? ' style="background:' + s.cor + ';border-color:' + s.cor + ';color:#fff;"' : '') +
      '>' + s.emoji + ' ' + s.label + ' (' + (counts[s.key] || 0) + ')</button>';
  });

  container.innerHTML = h;

  container.querySelectorAll('.chip-seg').forEach(b => {
    b.onclick = () => {
      ui.filtroClienteRFM = b.dataset.segmento || '';
      renderClientes();
    };
  });
}

// ============================================================
// TABELA
// ============================================================

function renderTabela(filtrados, classificados, usaPeriodo, periodo) {
  const te = document.getElementById('tbody-clientes');
  const mostraFilial = parseEscopo(ui.escopoAtual).tipo !== 'filial';

  const st = filtrados.slice().sort((a, b) => (b.valorTotal || 0) - (a.valorTotal || 0));

  if (st.length === 0) {
    te.innerHTML = '<tr><td colspan="11" style="text-align:center;padding:20px;color:#64748b;">' +
      'Nenhum cliente.</td></tr>';
    return;
  }

  te.innerHTML = st.slice(0, 500).map(c => {
    const v = state.vendedores.find(x => x.id === c.vendedor);
    const fi = state.filiais.find(x => x.id === c.filialId);

    let bd = '';
    if (c.diasSemComprar >= 180) {
      bd = '<span class="badge" style="background:#475569;color:#fff;">PERDIDO</span>';
    } else if (c.diasSemComprar >= 90) {
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

    let nomeTxt = escapeHtml(c.nome);
    const info = classificados[c.id];
    if (usaPeriodo && info) {
      if (info.tipo === 'novo') {
        nomeTxt += ' <span class="badge" style="background:#16a34a;color:#fff;font-size:10px;" ' +
          'title="' + escapeHtml(info.detalhe) + '">🆕</span>';
      } else if (info.tipo === 'reativado') {
        nomeTxt += ' <span class="badge" style="background:#0ea5e9;color:#fff;font-size:10px;" ' +
          'title="' + escapeHtml(info.detalhe) + '">♻️</span>';
      }
    }

    const clsSuspeito = !c.vendedor ? 'suspeito' : '';
    const ticket = c.valorTotal / Math.max(1, c.numCompras);

    const vp = valorNoPeriodo(c, periodo);
    const periodoTxt = periodo ? fmtBRL(vp.valor) : '<span style="color:#94a3b8;">—</span>';

    return '<tr class="' + clsSuspeito + '">' +
      '<td>' + nomeTxt + '</td>' +
      '<td>' + escapeHtml(c.cidade || '—') + '</td>' +
      '<td>' + vendTxt + '</td>' +
      '<td><span class="badge badge-rfm ' + c.rfm_segmento + '">' +
        rfmLabel(c.rfm_segmento) + '</span></td>' +
      '<td><span class="badge badge-' + c.abcCliente + '">' + c.abcCliente + '</span></td>' +
      '<td class="num">' + fmtBRL(c.valorTotal) + '</td>' +
      '<td class="num">' + periodoTxt + '</td>' +
      '<td class="num">' + c.numCompras + '</td>' +
      '<td class="num">' + fmtBRL(ticket) + '</td>' +
      '<td class="num">' + (c.diasSemComprar < 9999 ? c.diasSemComprar + 'd' : '—') + '</td>' +
      '<td>' + bd + '</td></tr>';
  }).join('');
}

// ============================================================
// RESUMO NOVOS/REATIVADOS
// ============================================================

function renderResumoNovosReativados(filtrados, classificados, periodo, usaPeriodo) {
  const container = document.getElementById('resumo-novos-reativados');
  if (!container) return;

  const st = ui.filtroClienteStatus;
  if ((st !== 'novos' && st !== 'reativados') || !periodo) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'block';

  const filtro = st === 'novos' ? 'novo' : 'reativado';
  const doTipo = filtrados.filter(c => classificados[c.id] && classificados[c.id].tipo === filtro);

  const totalValor = doTipo.reduce((s, c) => s + (c.valorTotal || 0), 0);
  const totalCompras = doTipo.reduce((s, c) => s + (c.numCompras || 0), 0);
  const ticketMedio = totalCompras > 0 ? totalValor / totalCompras : 0;

  const porVend = {};
  doTipo.forEach(c => {
    const k = c.vendedor || '__sem__';
    if (!porVend[k]) porVend[k] = { qtd: 0, valor: 0, compras: 0 };
    porVend[k].qtd++;
    porVend[k].valor += (c.valorTotal || 0);
    porVend[k].compras += (c.numCompras || 0);
  });

  const arr = Object.keys(porVend).map(k => {
    const v = state.vendedores.find(x => x.id === k);
    return {
      nome: v ? v.nome : (k === '__sem__' ? '⚠ Sem vendedor' : '—'),
      qtd: porVend[k].qtd,
      valor: porVend[k].valor,
      compras: porVend[k].compras,
      ticket: porVend[k].compras > 0 ? porVend[k].valor / porVend[k].compras : 0,
      sem: k === '__sem__'
    };
  }).sort((a, b) => b.valor - a.valor);

  const tipoLabel = st === 'novos' ? 'novos' : 'reativados';
  const tipoEmoji = st === 'novos' ? '🆕' : '♻️';
  const tipoCor = st === 'novos' ? '#16a34a' : '#0ea5e9';

  let h = '<div class="card" style="border-left:4px solid ' + tipoCor + ';">';
  h += '<h2>' + tipoEmoji + ' Resumo de ' + tipoLabel +
    ' <span class="sub">' + escapeHtml(periodo.nome) + ' · ' +
    fmtDataBR(periodo.ini) + ' a ' + fmtDataBR(periodo.fim) + '</span></h2>';

  h += '<div class="kpi-grid" style="margin-bottom:12px;">';
  h += '<div class="kpi"><div class="label">Total de clientes</div>' +
    '<div class="value">' + doTipo.length + '</div></div>';
  h += '<div class="kpi positivo"><div class="label">Faturamento total</div>' +
    '<div class="value">' + fmtBRL(totalValor) + '</div></div>';
  h += '<div class="kpi"><div class="label">Ticket médio</div>' +
    '<div class="value">' + fmtBRL(ticketMedio) + '</div></div>';
  h += '<div class="kpi"><div class="label">Vendedores envolvidos</div>' +
    '<div class="value">' + arr.length + '</div></div>';
  h += '</div>';

  if (arr.length === 0) {
    h += '<div style="text-align:center;padding:24px;color:#64748b;font-size:13px;">' +
      'Nenhum cliente nesse período.</div>';
    h += '</div>';
    container.innerHTML = h;
    return;
  }

  h += '<div style="overflow-x:auto;"><table class="tabela"><thead><tr>';
  h += '<th>Vendedor</th><th class="num">Clientes</th>' +
    '<th class="num">Faturamento</th><th class="num">Compras</th>' +
    '<th class="num">Ticket</th><th class="num">% do total</th>';
  h += '</tr></thead><tbody>';

  arr.forEach(x => {
    const pct = totalValor > 0 ? (x.valor / totalValor) * 100 : 0;
    const cls = x.sem ? 'style="color:#dc2626;"' : '';
    h += '<tr ' + cls + '>';
    h += '<td><strong>' + escapeHtml(x.nome) + '</strong></td>';
    h += '<td class="num">' + x.qtd + '</td>';
    h += '<td class="num">' + fmtBRL(x.valor) + '</td>';
    h += '<td class="num">' + x.compras + '</td>';
    h += '<td class="num">' + fmtBRL(x.ticket) + '</td>';
    h += '<td class="num">' + fmtPct(pct, 1) + '</td>';
    h += '</tr>';
  });

  h += '</tbody></table></div>';
  h += '</div>';

  container.innerHTML = h;
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

export function setupClientesNovos() {}