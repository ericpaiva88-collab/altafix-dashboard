// ============================================================
// views/analise.js — Comparativo YoY, Cidades, Fabricantes
// ============================================================

import { state, ui } from '../state.js';
import {
  fmtBRL, fmtNum, fmtPct, escapeHtml, deltaCellHTML,
  copiarTexto, isoDate, normalizarNomeCliente
} from '../utils.js';
import {
  comparativoNoEscopo, filialNoEscopo, escopoNome
} from '../calc.js';
import { imprimirHTML } from './painel.js';

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const ORDEM_MESES = MESES.slice();

// ============================================================
// COMPARATIVO YoY
// ============================================================

export function renderComparativo() {
  const k = document.getElementById('comparativo-kpis');
  const tb = document.getElementById('tbody-comparativo');
  const tf = document.getElementById('tfoot-comparativo');
  const tv = document.getElementById('tbody-comparativo-vend');
  const selVend = document.getElementById('comp-filtro-vendedor');
  const infoFiltro = document.getElementById('comp-filtro-info');

  let comp = comparativoNoEscopo(ui.escopoAtual);
  comp = comp.slice().sort((a, b) =>
    ORDEM_MESES.indexOf(a.mes) - ORDEM_MESES.indexOf(b.mes)
  );

  if (!comp || comp.length === 0) {
    k.innerHTML = '';
    tb.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:30px;color:#64748b;">' +
      'Sem dados. Importe o 740.</td></tr>';
    tf.innerHTML = '';
    tv.innerHTML = '';
    const t1 = document.getElementById('thead-comp-vend');
    const t2 = document.getElementById('tbody-comp-vend-mes');
    if (t1) t1.innerHTML = '';
    if (t2) t2.innerHTML = '';
    if (selVend) selVend.innerHTML = '<option value="">📊 Todos</option>';
    if (infoFiltro) infoFiltro.textContent = '';
    return;
  }

  // Popula select de vendedores
  const todosNomesVend = {};
  comp.forEach(m => {
    if (m.vendedores) Object.keys(m.vendedores).forEach(n => { todosNomesVend[n] = true; });
  });
  const nomesVendArr = Object.keys(todosNomesVend).sort();

  if (selVend && selVend.options.length - 1 !== nomesVendArr.length) {
    selVend.innerHTML = '<option value="">📊 Todos</option>' +
      nomesVendArr.map(n => '<option value="' + escapeHtml(n) + '">' + escapeHtml(n) + '</option>').join('');
  }
  if (selVend) selVend.value = ui.filtroCompVendedor;

  // Helpers
  function acharVendedorNoMes(m, nome) {
    if (!m.vendedores || !nome) return null;
    const alvo = normalizarNomeCliente(nome);
    let achado = null;
    Object.keys(m.vendedores).forEach(k => {
      if (normalizarNomeCliente(k) === alvo) achado = m.vendedores[k];
    });
    return achado;
  }

  function dadosMes(m) {
    if (!ui.filtroCompVendedor) {
      return {
        fat2025: m.fat2025 || 0, fat2026: m.fat2026 || 0,
        ped2025: m.ped2025 || 0, ped2026: m.ped2026 || 0,
        achou: true
      };
    }
    const achado = acharVendedorNoMes(m, ui.filtroCompVendedor);
    if (!achado) return { fat2025: 0, fat2026: 0, ped2025: 0, ped2026: 0, achou: false };
    return {
      fat2025: achado.fat2025 || 0, fat2026: achado.fat2026 || 0,
      ped2025: null, ped2026: null, achou: true
    };
  }

  // Se filtro não encontrou nada
  if (ui.filtroCompVendedor) {
    const achouAlgumMes = comp.some(m => dadosMes(m).achou);
    if (!achouAlgumMes) {
      k.innerHTML = '<div class="aviso" style="grid-column:1/-1;font-size:13px;">' +
        '⚠ <strong>' + escapeHtml(ui.filtroCompVendedor) + '</strong> não existe.<br>' +
        '<span style="color:#64748b;">Disponíveis: ' +
        nomesVendArr.map(n => '<code>' + escapeHtml(n) + '</code>').join(', ') +
        '</span></div>';
      tb.innerHTML = '';
      tf.innerHTML = '';
      tv.innerHTML = '';
      const t1 = document.getElementById('thead-comp-vend');
      const t2 = document.getElementById('tbody-comp-vend-mes');
      if (t1) t1.innerHTML = '';
      if (t2) t2.innerHTML = '';
      if (infoFiltro) infoFiltro.textContent = 'vendedor não encontrado';
      renderChartYoY();
      return;
    }
  }

  // KPIs (só meses com 2026)
  const mesesComparaveis = comp.filter(m => dadosMes(m).fat2026 > 0);
  const tot25 = mesesComparaveis.reduce((s, m) => s + dadosMes(m).fat2025, 0);
  const tot26 = mesesComparaveis.reduce((s, m) => s + dadosMes(m).fat2026, 0);
  const crescRS = tot26 - tot25;
  const cresc = tot25 > 0 ? (crescRS / tot25) * 100 : 0;
  const nomes = mesesComparaveis.map(m => m.mes.slice(0, 3)).join('/');

  k.innerHTML =
    '<div class="kpi"><div class="label">2025 (' + nomes + ')</div>' +
    '<div class="value">' + fmtBRL(tot25) + '</div></div>' +
    '<div class="kpi"><div class="label">2026</div>' +
    '<div class="value">' + fmtBRL(tot26) + '</div></div>' +
    '<div class="kpi ' + (cresc >= 0 ? 'positivo' : 'negativo') + '">' +
    '<div class="label">Crescimento</div>' +
    '<div class="value">' + fmtPct(cresc, 1) + '</div>' +
    '<div class="hint">' + fmtBRL(crescRS) + '</div></div>';

  if (infoFiltro) {
    infoFiltro.textContent = ui.filtroCompVendedor
      ? 'Analisando: ' + ui.filtroCompVendedor
      : mesesComparaveis.length + ' meses';
  }

  // Tabela principal
  let t25 = 0, t26 = 0, tp25 = 0, tp26 = 0;

  tb.innerHTML = comp.map(m => {
    const d = dadosMes(m);
    const f25 = d.fat2025, f26 = d.fat2026;
    const rs = f26 - f25;
    const pc = f25 > 0 ? ((f26 - f25) / f25) * 100 : null;

    t25 += f25; t26 += f26;
    tp25 += (d.ped2025 || 0);
    tp26 += (d.ped2026 || 0);

    const cls = f26 > 0 && rs >= 0 ? 'positivo' : (f26 > 0 && rs < 0 ? 'negativo' : '');
    let mostrarPc = pc;
    if (f26 === 0 && f25 > 0) mostrarPc = null;

    return '<tr class="' + cls + '">' +
      '<td>' + escapeHtml(m.mes) + '</td>' +
      '<td class="num">' + fmtBRL(f25) + '</td>' +
      '<td class="num">' + (d.ped2025 != null ? fmtNum(d.ped2025, 0) : '—') + '</td>' +
      '<td class="num">' + (f26 > 0 ? fmtBRL(f26) : '—') + '</td>' +
      '<td class="num">' + (d.ped2026 != null && d.ped2026 > 0 ? fmtNum(d.ped2026, 0) : '—') + '</td>' +
      '<td class="num">' + (f26 > 0 ? fmtBRL(rs) : '—') + '</td>' +
      '<td class="num">' + (mostrarPc != null ? fmtPct(mostrarPc, 1) : '—') + '</td></tr>';
  }).join('');

  tf.innerHTML = '<tr style="background:#f1f5f9;font-weight:700;">' +
    '<td>TOTAL</td>' +
    '<td class="num">' + fmtBRL(t25) + '</td>' +
    '<td class="num">' + (ui.filtroCompVendedor ? '—' : fmtNum(tp25, 0)) + '</td>' +
    '<td class="num">' + fmtBRL(t26) + '</td>' +
    '<td class="num">' + (ui.filtroCompVendedor ? '—' : fmtNum(tp26, 0)) + '</td>' +
    '<td class="num">' + fmtBRL(t26 - t25) + '</td>' +
    '<td class="num">' + (t25 > 0 ? fmtPct(((t26 - t25) / t25) * 100, 1) : '—') + '</td></tr>';

  // Tabela por vendedor (grid)
  const nomesMeses = comp.map(m => m.mes);

  document.getElementById('thead-comp-vend').innerHTML =
    '<th>Vendedor</th>' +
    nomesMeses.map(n => '<th class="num">' + escapeHtml(n.slice(0, 3)) + '</th>').join('') +
    '<th class="num">Total</th>';

  document.getElementById('tbody-comp-vend-mes').innerHTML = nomesVendArr.map(nome => {
    let cells = '';
    let tF25 = 0, tF26 = 0;

    comp.forEach(m => {
      const vv = (m.vendedores && m.vendedores[nome]) || {};
      const f25 = vv.fat2025 || 0, f26 = vv.fat2026 || 0;
      if (f26 > 0) { tF25 += f25; tF26 += f26; }
      const pc = f25 > 0 ? ((f26 - f25) / f25) * 100 : null;

      if (f26 === 0) {
        cells += '<td class="num" style="color:#94a3b8;">—</td>';
      } else if (pc == null) {
        cells += '<td class="num" style="color:#16a34a;">novo</td>';
      } else {
        const txt = pc > 999 ? '>999%' : fmtPct(pc, 0);
        cells += '<td class="num" style="color:' + (pc >= 0 ? '#16a34a' : '#dc2626') + ';">' +
          txt + '</td>';
      }
    });

    const pTot = tF25 > 0 ? ((tF26 - tF25) / tF25) * 100 : null;
    const clsTot = pTot == null ? '' : (pTot >= 0 ? 'positivo' : 'negativo');
    let totCell;
    if (pTot == null) totCell = (tF26 > 0 ? 'novo' : '—');
    else if (pTot > 999) totCell = '>999%';
    else totCell = fmtPct(pTot, 0);

    const isSel = (ui.filtroCompVendedor &&
      normalizarNomeCliente(ui.filtroCompVendedor) === normalizarNomeCliente(nome));
    const rowStyle = isSel
      ? 'style="background:#fef3c7 !important;cursor:pointer;"'
      : 'style="cursor:pointer;"';

    return '<tr class="' + clsTot + '" ' + rowStyle +
      ' data-vend-click="' + escapeHtml(nome) + '">' +
      '<td><strong>' + escapeHtml(nome) + '</strong></td>' +
      cells +
      '<td class="num"><strong>' + totCell + '</strong></td></tr>';
  }).join('');

  document.querySelectorAll('#tbody-comp-vend-mes tr[data-vend-click]').forEach(tr => {
    tr.onclick = () => {
      const nome = tr.dataset.vendClick;
      ui.filtroCompVendedor = (ui.filtroCompVendedor === nome) ? '' : nome;
      renderComparativo();
    };
  });

  // Acumulado por vendedor
  const porVend = {};
  mesesComparaveis.forEach(m => {
    if (!m.vendedores) return;
    Object.keys(m.vendedores).forEach(n => {
      if (!porVend[n]) porVend[n] = { fat2025: 0, fat2026: 0 };
      porVend[n].fat2025 += (m.vendedores[n].fat2025 || 0);
      porVend[n].fat2026 += (m.vendedores[n].fat2026 || 0);
    });
  });

  const arr = Object.keys(porVend).map(n => {
    const v = porVend[n];
    const rs = v.fat2026 - v.fat2025;
    return {
      nome: n, f25: v.fat2025, f26: v.fat2026, rs,
      pc: v.fat2025 > 0 ? ((rs / v.fat2025) * 100) : 9999
    };
  }).sort((a, b) => b.f26 - a.f26);

  tv.innerHTML = arr.map(x => {
    const cls = x.rs >= 0 ? 'positivo' : 'negativo';
    const pcTxt = x.f25 > 0
      ? (x.pc > 999 ? '>999%' : fmtPct(x.pc, 1))
      : (x.f26 > 0 ? 'novo' : '—');

    return '<tr class="' + cls + '">' +
      '<td>' + escapeHtml(x.nome) + '</td>' +
      '<td class="num">' + fmtBRL(x.f25) + '</td>' +
      '<td class="num">' + fmtBRL(x.f26) + '</td>' +
      '<td class="num">' + fmtBRL(x.rs) + '</td>' +
      '<td class="num">' + pcTxt + '</td></tr>';
  }).join('');

  renderChartYoY();
}

// ============================================================
// GRÁFICO YoY
// ============================================================

export function renderChartYoY() {
  const ctx = document.getElementById('chart-yoy');
  if (!ctx || typeof Chart === 'undefined') return;

  if (ui.charts.yoy) { try { ui.charts.yoy.destroy(); } catch (e) {} }

  let comp = comparativoNoEscopo(ui.escopoAtual);
  if (!comp || comp.length === 0) return;

  comp = comp.slice().sort((a, b) =>
    ORDEM_MESES.indexOf(a.mes) - ORDEM_MESES.indexOf(b.mes)
  );

  const labels = comp.map(x => x.mes.slice(0, 3));
  const d25 = [], d26 = [];
  const alvoNorm = ui.filtroCompVendedor ? normalizarNomeCliente(ui.filtroCompVendedor) : null;

  comp.forEach(x => {
    let vend = null;
    if (alvoNorm && x.vendedores) {
      Object.keys(x.vendedores).forEach(k => {
        if (normalizarNomeCliente(k) === alvoNorm) vend = x.vendedores[k];
      });
    }
    d25.push(vend ? (vend.fat2025 || 0) : (alvoNorm ? 0 : (x.fat2025 || 0)));
    d26.push(vend ? (vend.fat2026 || 0) : (alvoNorm ? 0 : (x.fat2026 || 0)));
  });

  ui.charts.yoy = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: '2025', data: d25, backgroundColor: '#94a3b8' },
        { label: '2026', data: d26, backgroundColor: '#dc2626' }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' } },
      scales: { y: { beginAtZero: true, ticks: { callback: v => 'R$ ' + (v / 1000).toFixed(0) + 'k' } } }
    }
  });
}

// ============================================================
// CIDADES
// ============================================================

export function cidadesNoEscopoAnalise() {
  return state.cidades.filter(c => {
    if (!filialNoEscopo(c.filialId, ui.escopoAtual)) return false;
    if (ui.mesCidadesSelecionado && (c.mesKey || '') && c.mesKey !== ui.mesCidadesSelecionado) return false;
    if (!ui.mesCidadesSelecionado && c.mesKey) {
      const chaves = Object.keys(state._historico).sort();
      if (chaves.length > 0 && c.mesKey !== chaves[chaves.length - 1]) return false;
    }
    return true;
  });
}

export function renderCidades() {
  const k = document.getElementById('cidades-kpis');
  const tb = document.getElementById('tbody-cidades');
  const info = document.getElementById('cidades-info');
  const selMes = document.getElementById('cidade-mes-select');

  if (selMes) {
    const mesesDisp = Object.keys(state._historico || {}).sort();
    if (!ui.mesCidadesSelecionado && mesesDisp.length > 0) {
      ui.mesCidadesSelecionado = mesesDisp[mesesDisp.length - 1];
    }
    if (selMes.options.length - 1 !== mesesDisp.length) {
      selMes.innerHTML = '<option value="">— último —</option>' +
        mesesDisp.map(m => {
          const p = m.split('-');
          return '<option value="' + m + '">' +
            MESES[parseInt(p[1], 10) - 1] + '/' + p[0] + '</option>';
        }).join('');
    }
    selMes.value = ui.mesCidadesSelecionado;
  }

  const cidadesBase = cidadesNoEscopoAnalise();

  if (cidadesBase.length === 0) {
    k.innerHTML = '';
    tb.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:30px;color:#64748b;">' +
      'Nenhuma cidade. Importe o 740.</td></tr>';
    info.textContent = '';
    const c1 = document.getElementById('card-top-movers');
    const c2 = document.getElementById('card-evolucao');
    if (c1) c1.style.display = 'none';
    if (c2) c2.style.display = 'none';
    return;
  }

  // Δ% vs mês anterior
  const mesesOrd = Object.keys(state._historico || {}).sort();
  const idxMes = mesesOrd.indexOf(ui.mesCidadesSelecionado);
  const mesAntKey = idxMes > 0 ? mesesOrd[idxMes - 1] : null;
  const histAnt = mesAntKey ? state._historico[mesAntKey] : null;

  cidadesBase.forEach(c => {
    if (!histAnt) { c.deltaPct = null; c.deltaRS = null; return; }
    const ant = (histAnt.cidades || []).find(x =>
      x.nome === c.nome && (x.uf || '') === (c.uf || '')
    );
    if (ant && ant.totalValor) {
      c.deltaPct = ((c.totalValor - ant.totalValor) / ant.totalValor) * 100;
      c.deltaRS = c.totalValor - ant.totalValor;
    } else {
      c.deltaPct = null;
      c.deltaRS = null;
    }
  });

  // Display do período
  const perDisplay = document.getElementById('periodo-display');
  if (perDisplay) {
    if (ui.mesCidadesSelecionado) {
      const p = ui.mesCidadesSelecionado.split('-');
      perDisplay.textContent = MESES[parseInt(p[1], 10) - 1] + '/' + p[0];
    } else {
      perDisplay.textContent = '—';
    }
  }

  // Top movers
  const comDelta = cidadesBase.filter(c => c.deltaPct != null);
  const cardTop = document.getElementById('card-top-movers');

  if (comDelta.length > 0) {
    cardTop.style.display = 'block';
    const subiram = comDelta.slice().sort((a, b) => b.deltaPct - a.deltaPct)
      .slice(0, 5).filter(c => c.deltaPct > 2);
    const cairam = comDelta.slice().sort((a, b) => a.deltaPct - b.deltaPct)
      .slice(0, 5).filter(c => c.deltaPct < -2);

    function renderMover(c) {
      return '<div class="mover-linha"><div class="mover-info">' +
        '<div class="mover-nome">' + escapeHtml(c.nome) + '/' + escapeHtml(c.uf || '') + '</div>' +
        '<div class="mover-det">' + fmtBRL(c.totalValor) + ' · antes ' +
        fmtBRL(c.totalValor - (c.deltaRS || 0)) + '</div></div>' +
        '<div class="mover-pct" style="color:' + (c.deltaPct >= 0 ? '#16a34a' : '#dc2626') + ';">' +
        (c.deltaPct >= 0 ? '▲' : '▼') + ' ' + fmtPct(Math.abs(c.deltaPct), 1) + '</div></div>';
    }

    document.getElementById('top-subiram').innerHTML = subiram.length > 0
      ? subiram.map(renderMover).join('')
      : '<div style="padding:12px 0;color:#64748b;font-size:12px;">Nenhuma cidade subiu mais de 2%</div>';
    document.getElementById('top-cairam').innerHTML = cairam.length > 0
      ? cairam.map(renderMover).join('')
      : '<div style="padding:12px 0;color:#64748b;font-size:12px;">Nenhuma cidade caiu mais de 2%</div>';
  } else {
    cardTop.style.display = 'none';
  }

  renderGraficoEvolucao();

  // Filtros + KPIs
  const totalGeral = cidadesBase.reduce((s, c) => s + c.totalValor, 0);
  popularSelectVendedorCidade(cidadesBase);

  const chkOcultar = document.getElementById('filtro-ocultar-nao-cad');
  const ocultarNaoCad = chkOcultar ? chkOcultar.checked : true;
  const naoCadastrados = { total: 0, clientes: 0 };

  let cidadesFiltradas = cidadesBase.map(c => {
    let cliFilt = (c.clientes || []).slice();
    const vFiltro = ui.modoVendedor || ui.filtroCidadeVend;
    if (vFiltro) cliFilt = cliFilt.filter(cl => cl.vendedor === vFiltro);

    if (ocultarNaoCad) {
      const cliNaoCad = cliFilt.filter(cl => cl.vendedor == null);
      naoCadastrados.total += cliNaoCad.reduce((s, cl) => s + (cl.valor || 0), 0);
      naoCadastrados.clientes += cliNaoCad.length;
      cliFilt = cliFilt.filter(cl => cl.vendedor != null);
    }

    if (cliFilt.length === 0) return null;

    const val = cliFilt.reduce((s, cl) => s + (cl.valor || 0), 0);
    const qtd = cliFilt.reduce((s, cl) => s + (cl.qtdVendas || 0), 0);

    return Object.assign({}, c, {
      clientes: cliFilt, totalValor: val, qtdVendas: qtd,
      numClientes: cliFilt.length,
      ticketMedio: qtd > 0 ? val / qtd : 0
    });
  }).filter(Boolean);

  if (ui.filtroCidadeBusca) {
    const t = ui.filtroCidadeBusca.toUpperCase();
    cidadesFiltradas = cidadesFiltradas.filter(c => c.nome.toUpperCase().indexOf(t) >= 0);
  }

  cidadesFiltradas.forEach(c => {
    c.pctTotal = totalGeral > 0 ? (c.totalValor / totalGeral) * 100 : 0;
  });

  cidadesFiltradas.sort((a, b) => {
    const campo = ui.sortCidade.campo;
    const dir = ui.sortCidade.direcao === 'asc' ? 1 : -1;
    let va = a[campo], vb = b[campo];
    if (campo === 'nome') {
      va = String(va || '').toUpperCase();
      vb = String(vb || '').toUpperCase();
      return (va < vb ? -1 : va > vb ? 1 : 0) * dir;
    }
    va = (va == null || isNaN(va)) ? -Infinity : Number(va);
    vb = (vb == null || isNaN(vb)) ? -Infinity : Number(vb);
    return (va - vb) * dir;
  });

  const top = cidadesFiltradas[0];
  const pctTop = top ? top.pctTotal : 0;
  const fatTotal = cidadesFiltradas.reduce((s, c) => s + c.totalValor, 0);

  k.innerHTML =
    '<div class="kpi"><div class="label">Cidades</div>' +
    '<div class="value">' + cidadesFiltradas.length + '</div></div>' +
    '<div class="kpi"><div class="label">Faturamento</div>' +
    '<div class="value">' + fmtBRL(fatTotal) + '</div></div>' +
    '<div class="kpi ' + (pctTop > 60 ? 'negativo' : '') + '">' +
    '<div class="label">Maior</div>' +
    '<div class="value">' + escapeHtml(top ? top.nome : '—') + '</div>' +
    '<div class="hint">' + fmtPct(pctTop, 1) + '</div></div>';

  info.innerHTML = cidadesFiltradas.length + ' cidades';
  if (ocultarNaoCad && naoCadastrados.clientes > 0) {
    info.innerHTML += ' · <span style="color:#dc2626;font-weight:600;">' +
      naoCadastrados.clientes + ' sem vendedor ocultos</span>';
  }

  renderTabelaCidades(cidadesFiltradas);
}

function popularSelectVendedorCidade(cidades) {
  const selV = document.getElementById('filtro-cidade-vend');
  if (!selV) return;
  if (selV.options.length > 1) return;

  const vistos = {};
  cidades.forEach(c => {
    (c.clientes || []).forEach(cl => { if (cl.vendedor) vistos[cl.vendedor] = true; });
  });

  let opts = '<option value="">Todos vendedores</option>';
  Object.keys(vistos).forEach(id => {
    const v = state.vendedores.find(x => x.id === id);
    if (v) opts += '<option value="' + escapeHtml(id) + '">' + escapeHtml(v.nome) + '</option>';
  });
  selV.innerHTML = opts;
}

function renderTabelaCidades(cidadesFiltradas) {
  const tb = document.getElementById('tbody-cidades');
  const mapaCad = {};
  state.clientes.forEach(gc => { mapaCad[normalizarNomeCliente(gc.nome)] = gc; });

  let html = '';

  cidadesFiltradas.forEach(c => {
    const expandida = ui.cidadesExpandidas[c.id] === true;

    html += '<tr class="cidade-linha ' + (expandida ? 'cidade-expandida' : '') +
      '" data-cidade-id="' + escapeHtml(c.id) + '">' +
      '<td><span class="badge badge-cidade">' + escapeHtml(c.uf || '--') + '</span> ' +
      '<strong>' + escapeHtml(c.nome) + '</strong>' +
      (expandida ? ' ▼' : ' ▶') +
      ' <span style="font-size:11px;color:#64748b;">(' + c.clientes.length + ')</span></td>' +
      '<td>' + escapeHtml(c.uf || '—') + '</td>' +
      '<td class="num">' + fmtBRL(c.totalValor) + '</td>' +
      '<td class="num">' + deltaCellHTML(c.deltaPct) + '</td>' +
      '<td class="num">' + c.numClientes + '</td>' +
      '<td class="num">' + c.qtdVendas + '</td>' +
      '<td class="num">' + fmtBRL(c.ticketMedio) + '</td>' +
      '<td class="num">' + fmtPct(c.pctTotal, 2) + '</td></tr>';

    if (expandida && c.clientes && c.clientes.length > 0) {
      const co = c.clientes.slice().sort((a, b) => (b.valor || 0) - (a.valor || 0));

      html += '<tr class="sub-clientes"><td colspan="8">' +
        '<table><thead><tr><th>Cliente</th><th>Código</th><th>Vendedor</th>' +
        '<th class="num">Valor</th><th class="num">Vendas</th><th class="num">Ticket</th>' +
        '</tr></thead><tbody>';

      co.forEach(cl => {
        const cad = mapaCad[normalizarNomeCliente(cl.nome)];
        const vId = (cad && cad.vendedor) || cl.vendedor;
        const v = state.vendedores.find(x => x.id === vId);
        const vTxt = v
          ? '<strong>' + escapeHtml(v.nome) + '</strong>'
          : '<span style="color:#dc2626;font-weight:600;">⚠ sem vendedor</span>';
        const cod = (cad && cad.codigo) || cl.codigo || '—';
        const tk = (cl.qtdVendas || 0) > 0 ? (cl.valor / cl.qtdVendas) : cl.valor;

        html += '<tr><td>' + escapeHtml(cl.nome) + '</td>' +
          '<td>' + escapeHtml(cod) + '</td>' +
          '<td>' + vTxt + '</td>' +
          '<td class="num">' + fmtBRL(cl.valor || 0) + '</td>' +
          '<td class="num">' + (cl.qtdVendas || 0) + '</td>' +
          '<td class="num">' + fmtBRL(tk) + '</td></tr>';
      });
      html += '</tbody></table></td></tr>';
    }
  });

  tb.innerHTML = html;

  tb.querySelectorAll('tr.cidade-linha').forEach(tr => {
    tr.onclick = () => {
      const id = tr.dataset.cidadeId;
      ui.cidadesExpandidas[id] = !ui.cidadesExpandidas[id];
      renderCidades();
    };
  });
}

// ============================================================
// GRÁFICO EVOLUÇÃO POR CIDADE
// ============================================================

export function renderGraficoEvolucao() {
  const canvas = document.getElementById('chart-evolucao');
  const card = document.getElementById('card-evolucao');
  const sub = document.getElementById('evolucao-sub');
  const selCid = document.getElementById('cidade-filtro-evolucao');

  if (!canvas || !card) return;

  const hist = state._historico || {};
  const meses = Object.keys(hist).sort();
  if (meses.length < 1) { card.style.display = 'none'; return; }

  card.style.display = 'block';

  const cidadesVal = {};
  meses.forEach(m => {
    (hist[m].cidades || []).forEach(c => {
      const k = c.nome + '|' + (c.uf || '');
      if (!cidadesVal[k]) {
        cidadesVal[k] = { nome: c.nome, uf: c.uf, total: 0, valores: {} };
      }
      cidadesVal[k].total += c.totalValor || 0;
      cidadesVal[k].valores[m] = c.totalValor;
    });
  });

  if (selCid && selCid.options.length <= 1) {
    const todas = Object.keys(cidadesVal).map(k => cidadesVal[k])
      .sort((a, b) => b.total - a.total);
    selCid.innerHTML = '<option value="">Todas (top 6 no gráfico)</option>' +
      todas.map(c => '<option value="' + escapeHtml(c.nome + '|' + (c.uf || '')) + '">' +
        escapeHtml(c.nome) + (c.uf ? '/' + c.uf : '') + ' · ' + fmtBRL(c.total) +
        '</option>').join('');
  }

  const filtroCid = selCid ? selCid.value : '';
  let selected;

  if (filtroCid) {
    selected = [cidadesVal[filtroCid]].filter(Boolean);
    if (sub) sub.textContent = (selected[0] ? selected[0].nome + '/' + (selected[0].uf || '') : '') +
      ' · ' + meses.length + ' meses';
  } else {
    selected = Object.keys(cidadesVal).map(k => cidadesVal[k])
      .sort((a, b) => b.total - a.total).slice(0, 6);
    if (sub) sub.textContent = meses.length + ' meses · top 6 cidades';
  }

  const cores = ['#dc2626', '#0f172a', '#16a34a', '#ca8a04', '#0ea5e9', '#7c3aed'];
  const labels = meses.map(m => {
    const p = m.split('-');
    return MESES[parseInt(p[1], 10) - 1].slice(0, 3) + '/' + p[0].slice(2);
  });

  if (typeof Chart === 'undefined') return;

  if (ui.charts.evolucao) { try { ui.charts.evolucao.destroy(); } catch (e) {} }

  ui.charts.evolucao = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: selected.map((c, i) => ({
        label: c.nome + (c.uf ? '/' + c.uf : ''),
        data: meses.map(m => c.valores[m] || 0),
        borderColor: cores[i % cores.length],
        backgroundColor: cores[i % cores.length] + '20',
        tension: 0.25, pointRadius: 3, pointHoverRadius: 6, fill: false
      }))
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, fontSize: 11 } },
        tooltip: { callbacks: { label: c => c.dataset.label + ': ' + fmtBRL(c.parsed.y) } }
      },
      scales: { y: { beginAtZero: true, ticks: { callback: v => 'R$ ' + (v / 1000).toFixed(0) + 'k' } } }
    }
  });
}

// ============================================================
// FABRICANTES
// ============================================================

export function renderFabricantes() {
  const selMes = document.getElementById('fab-mes-select');
  const selDelta = document.getElementById('fab-filtro-delta');
  const buscaEl = document.getElementById('fab-busca');
  const kEl = document.getElementById('fab-kpis');
  const tb = document.getElementById('tbody-fabricantes');
  const infoEl = document.getElementById('fab-info');
  const perEl = document.getElementById('fab-periodo-display');

  if (!tb) return;

  const base = state.produtosMes.filter(p => filialNoEscopo(p.filialId, ui.escopoAtual));

  if (base.length === 0) {
    kEl.innerHTML = '';
    tb.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:30px;color:#64748b;">' +
      'Importe o 361 para ver análises por fabricante.</td></tr>';
    if (infoEl) infoEl.textContent = '';
    if (perEl) perEl.textContent = '—';
    return;
  }

  const mesesDisp = [];
  base.forEach(p => { if (p.mes && mesesDisp.indexOf(p.mes) < 0) mesesDisp.push(p.mes); });
  mesesDisp.sort();

  if (selMes && selMes.options.length !== mesesDisp.length) {
    selMes.innerHTML = mesesDisp.map(m => {
      const p = m.split('-');
      return '<option value="' + m + '">' + MESES[parseInt(p[1], 10) - 1] + '/' + p[0] + '</option>';
    }).join('');
  }

  const mesAtual = (selMes && selMes.value && mesesDisp.indexOf(selMes.value) >= 0)
    ? selMes.value
    : mesesDisp[mesesDisp.length - 1];

  const idxAtual = mesesDisp.indexOf(mesAtual);
  const mesAnt = idxAtual > 0 ? mesesDisp[idxAtual - 1] : null;

  if (selMes) selMes.value = mesAtual;

  if (perEl) {
    const pp = mesAtual.split('-');
    perEl.textContent = MESES[parseInt(pp[1], 10) - 1] + '/' + pp[0] +
      (mesAnt ? ' (vs ' + MESES[parseInt(mesAnt.split('-')[1], 10) - 1] + ')' : '');
  }

  function agrupar(mes) {
    const mapa = {};
    base.forEach(p => {
      if (p.mes !== mes) return;
      const fab = p.fabricante || '(sem fabricante)';
      if (!mapa[fab]) mapa[fab] = { nome: fab, valor: 0, qtd: 0, produtos: {}, curvaA: 0 };
      mapa[fab].valor += p.valor;
      mapa[fab].qtd += p.qtd;
      mapa[fab].produtos[p.codigo] = true;
      if (p.curva === 'A') mapa[fab].curvaA++;
    });
    Object.keys(mapa).forEach(k => {
      mapa[k].numProdutos = Object.keys(mapa[k].produtos).length;
      mapa[k].ticket = mapa[k].numProdutos > 0 ? mapa[k].valor / mapa[k].numProdutos : 0;
    });
    return mapa;
  }

  const atual = agrupar(mesAtual);
  const anterior = mesAnt ? agrupar(mesAnt) : {};

  const lista = Object.keys(atual).map(k => {
    const a = atual[k];
    const b = anterior[k];
    const delta = b && b.valor > 0 ? ((a.valor - b.valor) / b.valor) * 100 : null;
    return {
      nome: a.nome, valor: a.valor, numProdutos: a.numProdutos,
      curvaA: a.curvaA, ticket: a.ticket, deltaPct: delta
    };
  });

  const totalGeral = lista.reduce((s, x) => s + x.valor, 0);
  lista.forEach(x => { x.pctTotal = totalGeral > 0 ? (x.valor / totalGeral) * 100 : 0; });
  lista.sort((a, b) => b.valor - a.valor);

  const subindo = lista.filter(x => x.deltaPct != null && x.deltaPct > 2).length;
  const caindo = lista.filter(x => x.deltaPct != null && x.deltaPct < -2).length;

  kEl.innerHTML =
    '<div class="kpi"><div class="label">Fabricantes</div>' +
    '<div class="value">' + lista.length + '</div></div>' +
    '<div class="kpi"><div class="label">Faturamento total</div>' +
    '<div class="value">' + fmtBRL(totalGeral) + '</div></div>' +
    '<div class="kpi positivo"><div class="label">Subindo</div>' +
    '<div class="value">' + subindo + '</div><div class="hint">&gt; +2%</div></div>' +
    '<div class="kpi negativo"><div class="label">Caindo</div>' +
    '<div class="value">' + caindo + '</div><div class="hint">&lt; -2%</div></div>';

  const filtroBusca = buscaEl ? buscaEl.value.toUpperCase() : '';
  const filtroDelta = selDelta ? selDelta.value : '';

  const filtrados = lista.filter(x => {
    if (filtroBusca && x.nome.toUpperCase().indexOf(filtroBusca) < 0) return false;
    if (filtroDelta === 'up' && !(x.deltaPct != null && x.deltaPct > 0)) return false;
    if (filtroDelta === 'down' && !(x.deltaPct != null && x.deltaPct < 0)) return false;
    return true;
  });

  if (infoEl) infoEl.textContent = filtrados.length + ' de ' + lista.length;

  tb.innerHTML = filtrados.slice(0, 200).map(x =>
    '<tr><td><strong>' + escapeHtml(x.nome) + '</strong></td>' +
    '<td class="num">' + fmtBRL(x.valor) + '</td>' +
    '<td class="num">' + deltaCellHTML(x.deltaPct) + '</td>' +
    '<td class="num">' + x.numProdutos + '</td>' +
    '<td class="num">' + x.curvaA + '</td>' +
    '<td class="num">' + fmtBRL(x.ticket) + '</td>' +
    '<td class="num">' + fmtPct(x.pctTotal, 2) + '</td></tr>'
  ).join('') || '<tr><td colspan="7" style="text-align:center;padding:20px;color:#64748b;">' +
    'Nenhum fabricante.</td></tr>';
}

// ============================================================
// COPIAR CIDADES
// ============================================================

export function copiarCidades() {
  const cids = cidadesNoEscopoAnalise();
  if (!cids || cids.length === 0) { copiarTexto('Nenhuma cidade.'); return; }

  const totalGeral = cids.reduce((s, c) => s + c.totalValor, 0);
  const ord = cids.slice().sort((a, b) => b.totalValor - a.totalValor);

  let m = '🗺️ Ranking cidades:\n\n';
  ord.forEach((c, i) => {
    const pct = totalGeral > 0 ? (c.totalValor / totalGeral) * 100 : 0;
    m += (i + 1) + ') ' + c.nome + '/' + c.uf + ' — ' +
      fmtBRL(c.totalValor) + ' (' + fmtPct(pct, 1) + ')\n';
  });
  copiarTexto(m);
}

// ============================================================
// IMPRESSÃO DE CIDADES
// ============================================================

export function imprimirCidades() {
  const cids = cidadesNoEscopoAnalise();
  if (!cids || cids.length === 0) { copiarTexto('Nada para imprimir'); return; }

  const totalGeral = cids.reduce((s, c) => s + c.totalValor, 0);
  const ord = cids.slice().sort((a, b) => b.totalValor - a.totalValor);

  let h = '<table><thead><tr>' +
    '<th>Cidade</th><th>UF</th><th class="num">Valor</th><th class="num">% Total</th>' +
    '<th class="num">Clientes</th><th class="num">Vendas</th><th class="num">Ticket</th>' +
    '</tr></thead><tbody>';

  ord.forEach(c => {
    const pct = totalGeral > 0 ? (c.totalValor / totalGeral) * 100 : 0;
    h += '<tr><td>' + escapeHtml(c.nome) + '</td>' +
      '<td>' + escapeHtml(c.uf || '—') + '</td>' +
      '<td class="num">' + fmtBRL(c.totalValor) + '</td>' +
      '<td class="num">' + fmtPct(pct, 1) + '</td>' +
      '<td class="num">' + c.numClientes + '</td>' +
      '<td class="num">' + c.qtdVendas + '</td>' +
      '<td class="num">' + fmtBRL(c.ticketMedio) + '</td></tr>';
  });
  h += '</tbody></table>';

  imprimirHTML('Ranking de Cidades', ord.length + ' cidades', h);
}