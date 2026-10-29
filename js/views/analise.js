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
  if (!tbody) return;

  let comp = comparativoNoEscopo(ui.escopoAtual);
  if (!comp || comp.length === 0) {
    kpiEl.innerHTML = '';
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">Sem dados comparativos. Importe a planilha de comparativo.</td></tr>';
    if(tfoot) tfoot.innerHTML = '';
    return;
  }

  // Ordenar pelos meses
  comp.sort((a, b) => MESES.indexOf(a.mes) - MESES.indexOf(b.mes));

  const tot25 = comp.reduce((s, m) => s + (m.fat2025 || 0), 0);
  const tot26 = comp.reduce((s, m) => s + (m.fat2026 || 0), 0);
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
  tbody.innerHTML = comp.map(m => {
    const f25 = m.fat2025 || 0;
    const f26 = m.fat2026 || 0;
    const rs = f26 - f25;
    const pct = f25 > 0 ? (rs / f25) * 100 : null;

    t25 += f25; t26 += f26;

    return `
      <tr>
        <td><strong>${escapeHtml(m.mes)}</strong></td>
        <td class="num" style="color:var(--af-t2)">${fmtBRL(f25)}</td>
        <td class="num"><strong>${fmtBRL(f26)}</strong></td>
        <td class="num" style="color:${rs >= 0 ? 'var(--af-verde)' : 'var(--af-vermelho)'}">${f26 > 0 ? (rs > 0 ? '+' : '') + fmtBRL(rs) : '—'}</td>
        <td class="num" style="color:${rs >= 0 ? 'var(--af-verde)' : 'var(--af-vermelho)'}">${pct != null && f26 > 0 ? (pct > 0 ? '+' : '') + fmtPct(pct, 1) : '—'}</td>
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

  renderGraficoYoY(comp);
}

function renderGraficoYoY(comp) {
  const ctx = document.getElementById('chart-yoy');
  if (!ctx || typeof Chart === 'undefined') return;
  if (chartYoyInstance) chartYoyInstance.destroy();

  const labels = comp.map(c => c.mes.slice(0, 3));
  const d25 = comp.map(c => c.fat2025 || 0);
  const d26 = comp.map(c => c.fat2026 || 0);

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

export function renderCidades() {
  const selMes = document.getElementById('cidade-mes-select');
  const kpiEl = document.getElementById('cidades-kpis');
  const tbody = document.getElementById('tbody-cidades');
  const buscaEl = document.getElementById('filtro-cidade-busca');
  if (!tbody) return;

  const hist = state._historico || {};
  const mesesDisp = Object.keys(hist).sort();

  if (mesesDisp.length === 0) {
    kpiEl.innerHTML = '';
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">Nenhuma cidade importada.</td></tr>';
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
  let cidades = state.cidades.filter(c => c.mesKey === mesRef && filialNoEscopo(c.filialId, ui.escopoAtual));

  const busca = (buscaEl?.value || '').toUpperCase();
  if (busca) {
    cidades = cidades.filter(c => c.nome.toUpperCase().includes(busca));
  }

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
    const pct = totFat > 0 ? (c.totalValor / totFat) * 100 : 0;
    const ticket = c.qtdVendas > 0 ? c.totalValor / c.qtdVendas : 0;
    return `
      <tr>
        <td><strong>${escapeHtml(c.nome)}</strong></td>
        <td>${escapeHtml(c.uf || '—')}</td>
        <td class="num"><strong>${fmtBRL(c.totalValor)}</strong></td>
        <td class="num">${c.numClientes}</td>
        <td class="num">${c.qtdVendas}</td>
        <td class="num" style="color:var(--af-t2)">${fmtBRL(ticket)}</td>
      </tr>
    `;
  }).join('');
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
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">Nenhum dado de fabricante. Importe o 361.</td></tr>';
    return;
  }

  const mesesDisp = [...new Set(base.map(p => p.mes))].sort();

  if (selMes) {
    if (!selMes.value || mesesDisp.indexOf(selMes.value) < 0) {
      selMes.value = mesesDisp[mesesDisp.length - 1];
    }
    if (selMes.options.length === 0) {
      selMes.innerHTML = mesesDisp.map(m => {
        const p = m.split('-');
        return `<option value="${m}">${MESES[parseInt(p[1]) - 1]}/${p[0]}</option>`;
      }).join('');
      selMes.value = mesesDisp[mesesDisp.length - 1];
    }
  }

  const mesRef = selMes?.value || mesesDisp[mesesDisp.length - 1];

  const mapa = {};
  base.filter(p => p.mes === mesRef).forEach(p => {
    const fab = p.fabricante || '(Sem Fabricante)';
    if (!mapa[fab]) mapa[fab] = { nome: fab, valor: 0, qtd: 0, prods: new Set() };
    mapa[fab].valor += p.valor;
    mapa[fab].qtd += p.qtd;
    mapa[fab].prods.add(p.codigo);
  });

  let fabricantes = Object.values(mapa).map(f => ({
    nome: f.nome, valor: f.valor, qtd: f.qtd, numProds: f.prods.size
  }));

  const busca = (buscaEl?.value || '').toUpperCase();
  if (busca) {
    fabricantes = fabricantes.filter(f => f.nome.toUpperCase().includes(busca));
  }

  fabricantes.sort((a, b) => b.valor - a.valor);

  const totFat = fabricantes.reduce((s, f) => s + f.valor, 0);
  const topFab = fabricantes[0] || { nome: '—', valor: 0 };

  kpiEl.innerHTML = `
    <div class="kpi-card"><div class="kpi-header">FATURAMENTO FABRICANTES</div><div class="kpi-value">${fmtBRL(totFat)}</div></div>
    <div class="kpi-card"><div class="kpi-header">TOP FABRICANTE</div><div class="kpi-value">${escapeHtml(topFab.nome)}</div><div class="kpi-hint">${fmtBRL(topFab.valor)}</div></div>
    <div class="kpi-card"><div class="kpi-header">TOTAL DE FABRICANTES</div><div class="kpi-value">${fabricantes.length}</div></div>
  `;

  tbody.innerHTML = fabricantes.map(f => {
    const pct = totFat > 0 ? (f.valor / totFat) * 100 : 0;
    return `
      <tr>
        <td><strong>${escapeHtml(f.nome)}</strong></td>
        <td class="num"><strong>${fmtBRL(f.valor)}</strong></td>
        <td class="num">${f.numProds}</td>
        <td class="num">${fmtNum(f.qtd, 0)}</td>
        <td class="num" style="color:var(--af-t2)">${fmtPct(pct, 1)}</td>
      </tr>
    `;
  }).join('');
}