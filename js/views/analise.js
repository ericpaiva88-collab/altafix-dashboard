// ============================================================
// views/analise.js — Comparativo, Cidades e Fabricantes
// ============================================================

import { state, ui } from '../state.js';
import { fmtBRL, fmtNum, fmtPct, escapeHtml, normalizarNomeCliente } from '../utils.js';
import { comparativoNoEscopo, filialNoEscopo } from '../calc.js';

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

// ============================================================
// COMPARATIVO YOY
// ============================================================

let chartYoyInstance = null;

export function renderComparativo() {
  const kpiEl = document.getElementById('comparativo-kpis');
  const tbody = document.getElementById('tbody-comparativo');
  const tfoot = document.getElementById('tfoot-comparativo');
  const selVend = document.getElementById('comp-filtro-vendedor');
  if (!tbody) return;

  // Popula Vendedores no Select
  if (selVend && selVend.options.length <= 1) {
    let opts = '<option value="">Todos os vendedores</option>';
    state.vendedores.filter(v => v.ativo && v.papel === 'vendedor').forEach(v => {
      opts += `<option value="${escapeHtml(v.nome.toUpperCase())}">${escapeHtml(v.nome)}</option>`;
    });
    selVend.innerHTML = opts;
    selVend.value = ui.filtroCompVendedor || '';
  }

  let comp = comparativoNoEscopo(ui.escopoAtual);
  if (!comp || comp.length === 0) {
    kpiEl.innerHTML = '';
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">Sem dados comparativos.</td></tr>';
    if(tfoot) tfoot.innerHTML = '';
    return;
  }

  comp.sort((a, b) => MESES.indexOf(a.mes) - MESES.indexOf(b.mes));

  const vendFiltro = (selVend?.value || '').toUpperCase();

  // Filtra os dados do vendedor se houver seleção
  const dadosMapeados = comp.map(m => {
    let f25 = m.fat2025 || 0;
    let f26 = m.fat2026 || 0;
    
    if (vendFiltro && m.vendedores) {
      const vd = m.vendedores[vendFiltro];
      f25 = vd ? (vd.fat2025 || 0) : 0;
      f26 = vd ? (vd.fat2026 || 0) : 0;
    }
    return { mes: m.mes, f25, f26 };
  });

  const tot25 = dadosMapeados.reduce((s, m) => s + m.f25, 0);
  const tot26 = dadosMapeados.reduce((s, m) => s + m.f26, 0);
  const crescRS = tot26 - tot25;
  const crescPct = tot25 > 0 ? (crescRS / tot25) * 100 : 0;

  kpiEl.innerHTML = `
    <div class="kpi-card"><div class="kpi-header">FATURAMENTO 2025</div><div class="kpi-value" style="color:var(--af-t2)">${fmtBRL(tot25)}</div></div>
    <div class="kpi-card"><div class="kpi-header">FATURAMENTO 2026</div><div class="kpi-value">${fmtBRL(tot26)}</div></div>
    <div class="kpi-card" style="border-left:3px solid ${crescRS >= 0 ? 'var(--af-verde)' : 'var(--af-vermelho)'};">
      <div class="kpi-header">CRESCIMENTO</div>
      <div class="kpi-value" style="color:${crescRS >= 0 ? 'var(--af-verde)' : 'var(--af-vermelho)'}">${crescPct > 0 ? '+' : ''}${fmtPct(crescPct, 1)}</div>
      <div class="kpi-hint">${fmtBRL(crescRS)} de diferença</div>
    </div>
  `;

  let t25 = 0, t26 = 0;
  tbody.innerHTML = dadosMapeados.map(m => {
    const rs = m.f26 - m.f25;
    const pct = m.f25 > 0 ? (rs / m.f25) * 100 : null;

    t25 += m.f25; t26 += m.f26;

    return `
      <tr>
        <td><strong>${escapeHtml(m.mes)}</strong></td>
        <td class="num" style="color:var(--af-t2)">${fmtBRL(m.f25)}</td>
        <td class="num"><strong>${fmtBRL(m.f26)}</strong></td>
        <td class="num" style="color:${rs >= 0 ? 'var(--af-verde)' : 'var(--af-vermelho)'}">${m.f26 > 0 ? (rs > 0 ? '+' : '') + fmtBRL(rs) : '—'}</td>
        <td class="num" style="color:${rs >= 0 ? 'var(--af-verde)' : 'var(--af-vermelho)'}">${pct != null && m.f26 > 0 ? (pct > 0 ? '+' : '') + fmtPct(pct, 1) : '—'}</td>
      </tr>
    `;
  }).join('');

  if(tfoot) {
    tfoot.innerHTML = `
      <tr style="background:#fafafa; font-weight:700;">
        <td>TOTAL</td>
        <td class="num">${fmtBRL(t25)}</td>
        <td class="num">${fmtBRL(t26)}</td>
        <td class="num" style="color:${t26-t25 >= 0 ? 'var(--af-verde)' : 'var(--af-vermelho)'}">${(t26-t25) > 0 ? '+' : ''}${fmtBRL(t26-t25)}</td>
        <td class="num" style="color:${t26-t25 >= 0 ? 'var(--af-verde)' : 'var(--af-vermelho)'}">${t25 > 0 ? fmtPct(((t26-t25)/t25)*100, 1) : '—'}</td>
      </tr>
    `;
  }

  renderGraficoYoY(dadosMapeados);
}

function renderGraficoYoY(dadosMapeados) {
  const ctx = document.getElementById('chart-yoy');
  if (!ctx || typeof Chart === 'undefined') return;
  if (chartYoyInstance) chartYoyInstance.destroy();

  const labels = dadosMapeados.map(c => c.mes.slice(0, 3));
  const d25 = dadosMapeados.map(c => c.f25);
  const d26 = dadosMapeados.map(c => c.f26);

  chartYoyInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: '2025', data: d25, backgroundColor: '#D4D1CA' },
        { label: '2026', data: d26, backgroundColor: '#0B0B0B' }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' } },
      scales: { y: { beginAtZero: true, ticks: { callback: v => 'R$ ' + (v/1000).toFixed(0) + 'k' } } }
    }
  });
}

// ============================================================
// CIDADES
// ============================================================

let chartEvolucaoInstance = null;

export function renderCidades() {
  const selMes = document.getElementById('cidade-mes-select');
  const kpiEl = document.getElementById('cidades-kpis');
  const tbody = document.getElementById('tbody-cidades');
  const buscaEl = document.getElementById('filtro-cidade-busca');
  const cardTop = document.getElementById('card-top-movers');
  const cardEvo = document.getElementById('card-evolucao');
  if (!tbody) return;

  const hist = state._historico || {};
  const mesesDisp = Object.keys(hist).sort();

  if (mesesDisp.length === 0) {
    kpiEl.innerHTML = '';
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">Nenhuma cidade importada.</td></tr>';
    if(cardTop) cardTop.style.display = 'none';
    if(cardEvo) cardEvo.style.display = 'none';
    return;
  }

  if (selMes) {
    if (!ui.mesCidadesSelecionado || mesesDisp.indexOf(ui.mesCidadesSelecionado) < 0) {
      ui.mesCidadesSelecionado = mesesDisp[mesesDisp.length - 1];
    }
    selMes.innerHTML = mesesDisp.map(m => {
      const p = m.split('-');
      return `<option value="${m}">${MESES[parseInt(p[1]) - 1]}/${p[0]}</option>`;
    }).join('');
    selMes.value = ui.mesCidadesSelecionado;
  }

  const mesRef = ui.mesCidadesSelecionado;
  const idxMes = mesesDisp.indexOf(mesRef);
  const mesAnt = idxMes > 0 ? mesesDisp[idxMes - 1] : null;

  let cidades = state.cidades.filter(c => c.mesKey === mesRef && filialNoEscopo(c.filialId, ui.escopoAtual));
  let cidadesAnt = mesAnt ? state.cidades.filter(c => c.mesKey === mesAnt && filialNoEscopo(c.filialId, ui.escopoAtual)) : [];

  // Calcula Delta vs Mês Anterior
  cidades.forEach(c => {
    const ant = cidadesAnt.find(x => x.nome === c.nome && x.uf === c.uf);
    if (ant && ant.totalValor > 0) {
      c.deltaPct = ((c.totalValor - ant.totalValor) / ant.totalValor) * 100;
      c.deltaRS = c.totalValor - ant.totalValor;
    } else {
      c.deltaPct = null;
      c.deltaRS = null;
    }
  });

  // Top Movers
  const comDelta = cidades.filter(c => c.deltaPct != null);
  if (comDelta.length > 0) {
    if(cardTop) cardTop.style.display = 'block';
    const subiram = comDelta.filter(c => c.deltaPct > 5).sort((a, b) => b.deltaPct - a.deltaPct).slice(0, 3);
    const cairam = comDelta.filter(c => c.deltaPct < -5).sort((a, b) => a.deltaPct - b.deltaPct).slice(0, 3);

    const renderMover = (c) => `
      <div class="ficha-lista-item">
        <div><div class="nome">${escapeHtml(c.nome)}</div><div class="detalhe">${fmtBRL(c.totalValor)}</div></div>
        <div class="valor" style="color:${c.deltaPct >= 0 ? 'var(--af-verde)' : 'var(--af-vermelho)'}">
          ${c.deltaPct >= 0 ? '▲' : '▼'} ${fmtPct(Math.abs(c.deltaPct), 1)}
        </div>
      </div>
    `;

    document.getElementById('top-subiram').innerHTML = subiram.length ? subiram.map(renderMover).join('') : '<div style="color:#888;font-size:12px;">Nenhuma alta expressiva.</div>';
    document.getElementById('top-cairam').innerHTML = cairam.length ? cairam.map(renderMover).join('') : '<div style="color:#888;font-size:12px;">Nenhuma queda expressiva.</div>';
  } else {
    if(cardTop) cardTop.style.display = 'none';
  }

  renderEvolucaoCidades();

  // Filtro de busca
  const busca = (buscaEl?.value || '').toUpperCase();
  if (busca) cidades = cidades.filter(c => c.nome.toUpperCase().includes(busca));

  cidades.sort((a, b) => b.totalValor - a.totalValor);

  const totFat = cidades.reduce((s, c) => s + c.totalValor, 0);
  const totCli = cidades.reduce((s, c) => s + c.numClientes, 0);
  const topCidade = cidades[0] || { nome: '—', totalValor: 0 };

  kpiEl.innerHTML = `
    <div class="kpi-card"><div class="kpi-header">FATURAMENTO NO MÊS</div><div class="kpi-value">${fmtBRL(totFat)}</div></div>
    <div class="kpi-card"><div class="kpi-header">CLIENTES ATENDIDOS</div><div class="kpi-value">${totCli}</div></div>
    <div class="kpi-card"><div class="kpi-header">TOP CIDADE</div><div class="kpi-value">${escapeHtml(topCidade.nome)}</div><div class="kpi-hint">${fmtBRL(topCidade.totalValor)}</div></div>
  `;

  tbody.innerHTML = cidades.map(c => {
    const ticket = c.qtdVendas > 0 ? c.totalValor / c.qtdVendas : 0;
    let deltaHtml = '<span style="color:#888;">—</span>';
    if (c.deltaPct != null) {
      deltaHtml = `<span style="font-weight:600; color:${c.deltaPct >= 0 ? 'var(--af-verde)' : 'var(--af-vermelho)'}">${c.deltaPct >= 0 ? '+' : ''}${fmtPct(c.deltaPct, 1)}</span>`;
    }
    return `
      <tr>
        <td><strong>${escapeHtml(c.nome)}</strong></td>
        <td>${escapeHtml(c.uf || '—')}</td>
        <td class="num"><strong>${fmtBRL(c.totalValor)}</strong></td>
        <td class="num">${deltaHtml}</td>
        <td class="num">${c.numClientes}</td>
        <td class="num" style="color:var(--af-t2)">${fmtBRL(ticket)}</td>
      </tr>
    `;
  }).join('');
}

function renderEvolucaoCidades() {
  const ctx = document.getElementById('chart-evolucao');
  const cardEvo = document.getElementById('card-evolucao');
  const selCid = document.getElementById('cidade-filtro-evolucao');
  if (!ctx || !cardEvo) return;

  const hist = state._historico || {};
  const meses = Object.keys(hist).sort();
  if (meses.length < 2) { cardEvo.style.display = 'none'; return; }

  cardEvo.style.display = 'block';

  // Mapeia todas as cidades e suas evoluções
  const cidadesVal = {};
  meses.forEach(m => {
    (hist[m].cidades || []).forEach(c => {
      const k = c.nome + '|' + (c.uf || '');
      if (!cidadesVal[k]) cidadesVal[k] = { nome: c.nome, uf: c.uf, total: 0, valores: {} };
      cidadesVal[k].total += c.totalValor || 0;
      cidadesVal[k].valores[m] = c.totalValor;
    });
  });

  // Popula select se estiver vazio
  if (selCid && selCid.options.length <= 1) {
    const todas = Object.values(cidadesVal).sort((a, b) => b.total - a.total);
    selCid.innerHTML = '<option value="">Todas (top 5 no gráfico)</option>' +
      todas.slice(0, 20).map(c => `<option value="${c.nome}|${c.uf}">${c.nome}/${c.uf}</option>`).join('');
  }

  const filtroCid = selCid ? selCid.value : '';
  let selected = [];

  if (filtroCid) {
    selected = [cidadesVal[filtroCid]].filter(Boolean);
  } else {
    selected = Object.values(cidadesVal).sort((a, b) => b.total - a.total).slice(0, 5);
  }

  const labels = meses.map(m => MESES[parseInt(m.split('-')[1]) - 1].slice(0, 3));
  const cores = ['#0B0B0B', '#D60000', '#16A34A', '#CA8A04', '#0ea5e9'];

  if (chartEvolucaoInstance) chartEvolucaoInstance.destroy();

  chartEvolucaoInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: selected.map((c, i) => ({
        label: c.nome + (c.uf ? '/' + c.uf : ''),
        data: meses.map(m => c.valores[m] || 0),
        borderColor: cores[i % cores.length],
        backgroundColor: cores[i % cores.length] + '20',
        tension: 0.3, pointRadius: 3, fill: false
      }))
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' } },
      scales: { y: { beginAtZero: true, ticks: { callback: v => 'R$ ' + (v/1000).toFixed(0) + 'k' } } }
    }
  });
}

// ============================================================
// FABRICANTES
// ============================================================

export function renderFabricantes() {
  const selMes = document.getElementById('fab-mes-select');
  const kpiEl = document.getElementById('fab-kpis');
  const tbody = document.getElementById('tbody-fabricantes');
  const buscaEl = document.getElementById('fab-busca');
  if (!tbody) return;

  const base = state.produtosMes.filter(p => filialNoEscopo(p.filialId, ui.escopoAtual));
  
  if (base.length === 0) {
    kpiEl.innerHTML = '';
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">Nenhum dado.</td></tr>';
    return;
  }

  const mesesDisp = [...new Set(base.map(p => p.mes))].sort();

  if (selMes) {
    if (!selMes.value || mesesDisp.indexOf(selMes.value) < 0) selMes.value = mesesDisp[mesesDisp.length - 1];
    if (selMes.options.length === 0) {
      selMes.innerHTML = mesesDisp.map(m => {
        const p = m.split('-');
        return `<option value="${m}">${MESES[parseInt(p[1]) - 1]}/${p[0]}</option>`;
      }).join('');
      selMes.value = mesesDisp[mesesDisp.length - 1];
    }
  }

  const mesRef = selMes?.value || mesesDisp[mesesDisp.length - 1];
  const idxMes = mesesDisp.indexOf(mesRef);
  const mesAnt = idxMes > 0 ? mesesDisp[idxMes - 1] : null;

  // Agrupa dados do mês atual e anterior
  const agrupar = (mes) => {
    const mapa = {};
    base.filter(p => p.mes === mes).forEach(p => {
      const fab = p.fabricante || '(Sem Fabricante)';
      if (!mapa[fab]) mapa[fab] = { nome: fab, valor: 0, prods: new Set() };
      mapa[fab].valor += p.valor;
      mapa[fab].prods.add(p.codigo);
    });
    return mapa;
  };

  const dadosAtual = agrupar(mesRef);
  const dadosAnt = mesAnt ? agrupar(mesAnt) : {};

  let fabricantes = Object.keys(dadosAtual).map(k => {
    const atual = dadosAtual[k];
    const ant = dadosAnt[k];
    const delta = ant && ant.valor > 0 ? ((atual.valor - ant.valor) / ant.valor) * 100 : null;
    return { nome: k, valor: atual.valor, numProds: atual.prods.size, delta };
  });

  const busca = (buscaEl?.value || '').toUpperCase();
  if (busca) fabricantes = fabricantes.filter(f => f.nome.toUpperCase().includes(busca));

  fabricantes.sort((a, b) => b.valor - a.valor);

  const totFat = fabricantes.reduce((s, f) => s + f.valor, 0);
  const topFab = fabricantes[0] || { nome: '—', valor: 0 };

  kpiEl.innerHTML = `
    <div class="kpi-card"><div class="kpi-header">FATURAMENTO TOTAL</div><div class="kpi-value">${fmtBRL(totFat)}</div></div>
    <div class="kpi-card"><div class="kpi-header">TOP FABRICANTE</div><div class="kpi-value">${escapeHtml(topFab.nome)}</div><div class="kpi-hint">${fmtBRL(topFab.valor)}</div></div>
    <div class="kpi-card"><div class="kpi-header">TOTAL DE FABRICANTES</div><div class="kpi-value">${fabricantes.length}</div></div>
  `;

  tbody.innerHTML = fabricantes.map(f => {
    const pct = totFat > 0 ? (f.valor / totFat) * 100 : 0;
    let deltaHtml = '<span style="color:#888;">—</span>';
    if (f.delta != null) {
      deltaHtml = `<span style="font-weight:600; color:${f.delta >= 0 ? 'var(--af-verde)' : 'var(--af-vermelho)'}">${f.delta >= 0 ? '+' : ''}${fmtPct(f.delta, 1)}</span>`;
    }
    return `
      <tr>
        <td><strong>${escapeHtml(f.nome)}</strong></td>
        <td class="num"><strong>${fmtBRL(f.valor)}</strong></td>
        <td class="num">${deltaHtml}</td>
        <td class="num">${f.numProds}</td>
        <td class="num" style="color:var(--af-t2)">${fmtPct(pct, 1)}</td>
      </tr>
    `;
  }).join('');
}