// ============================================================
// views/analise.js — Análise com Inteligência (Line Chart + Leitura)
// ============================================================

import { state, ui } from '../state.js';
import { fmtBRL, fmtNum, fmtPct, escapeHtml } from '../utils.js';
import { comparativoNoEscopo } from '../calc.js';

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

let chartYoyInstance = null;

export function renderAnalise() {
  const kpiEl = document.getElementById('analise-kpis');
  const tbody = document.getElementById('tbody-ranking-leitura');
  const selVend = document.getElementById('analise-filtro-vendedor');
  const selPeriodo = document.getElementById('analise-periodo');
  if (!tbody) return;

  if (selVend && selVend.options.length <= 1) {
    let opts = '<option value="">Todo o time</option>';
    state.vendedores.filter(v => v.ativo && v.papel === 'vendedor').forEach(v => {
      opts += `<option value="${escapeHtml(v.nome.toUpperCase())}">${escapeHtml(v.nome)}</option>`;
    });
    selVend.innerHTML = opts;
  }

  const compOriginal = comparativoNoEscopo(ui.escopoAtual);
  if (!compOriginal || compOriginal.length === 0) {
    kpiEl.innerHTML = '';
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">Sem dados comparativos.</td></tr>';
    return;
  }

  const periodo = selPeriodo?.value || 'ytd';
  const mesAtual = new Date().getMonth(); 
  const limiteMes = periodo === 'ytd' ? mesAtual : 11;

  let comp = compOriginal.slice().sort((a, b) => MESES.indexOf(a.mes) - MESES.indexOf(b.mes));
  comp = comp.slice(0, limiteMes + 1);

  const vendFiltro = (selVend?.value || '').toUpperCase();

  let t25 = 0, t26 = 0, p25 = 0, p26 = 0;
  
  comp.forEach(m => {
    let f25 = m.fat2025 || 0;
    let f26 = m.fat2026 || 0;
    let pd25 = m.ped2025 || 0;
    let pd26 = m.ped2026 || 0;

    if (vendFiltro && m.vendedores) {
      const v = m.vendedores[vendFiltro];
      f25 = v ? (v.fat2025 || 0) : 0;
      f26 = v ? (v.fat2026 || 0) : 0;
      pd25 = v ? (v.ped2025 || 0) : 0;
      pd26 = v ? (v.ped2026 || 0) : 0;
    }
    t25 += f25; t26 += f26; p25 += pd25; p26 += pd26;
  });

  const crescRS = t26 - t25;
  const crescPct = t25 > 0 ? (crescRS / t25) * 100 : 0;
  const tk25 = p25 > 0 ? t25 / p25 : 0;
  const tk26 = p26 > 0 ? t26 / p26 : 0;
  const tkPct = tk25 > 0 ? ((tk26 - tk25) / tk25) * 100 : 0;

  kpiEl.innerHTML = `
    <div class="kpi-card">
      <div class="kpi-header">FATURAMENTO (${periodo === 'ytd' ? 'YTD' : 'ANO'})</div>
      <div class="kpi-value">${fmtBRL(t26)}</div>
      <div class="kpi-hint">2025: ${fmtBRL(t25)} <span class="badge ${crescRS >= 0 ? 'ok' : 'danger'}" style="margin-left:8px;">${crescPct > 0 ? '▲' : '▼'} ${fmtPct(Math.abs(crescPct), 1)}</span></div>
    </div>
    <div class="kpi-card">
      <div class="kpi-header">PEDIDOS</div>
      <div class="kpi-value">${fmtNum(p26, 0)}</div>
      <div class="kpi-hint">2025: ${fmtNum(p25, 0)}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-header">TICKET MÉDIO</div>
      <div class="kpi-value">${fmtBRL(tk26)}</div>
      <div class="kpi-hint">2025: ${fmtBRL(tk25)} <span class="badge ${tkPct >= 0 ? 'ok' : 'danger'}" style="margin-left:8px;">${tkPct > 0 ? '▲' : '▼'} ${fmtPct(Math.abs(tkPct), 1)}</span></div>
    </div>
  `;

  renderGraficoLinha(comp, vendFiltro);
  renderRankingComLeitura(comp, limiteMes);
}

function renderGraficoLinha(comp, vendFiltro) {
  const ctx = document.getElementById('chart-yoy-line');
  if (!ctx || typeof Chart === 'undefined') return;
  if (chartYoyInstance) chartYoyInstance.destroy();

  const labels = comp.map(c => c.mes.slice(0, 3));
  const d25 = comp.map(c => {
    if (!vendFiltro) return c.fat2025 || 0;
    const v = c.vendedores?.[vendFiltro];
    return v ? (v.fat2025 || 0) : 0;
  });
  const d26 = comp.map(c => {
    if (!vendFiltro) return c.fat2026 || 0;
    const v = c.vendedores?.[vendFiltro];
    return v ? (v.fat2026 || 0) : 0;
  });

  chartYoyInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: '2025', data: d25, borderColor: '#D4D1CA', backgroundColor: '#D4D1CA', borderWidth: 2, pointRadius: 4, tension: 0.3 },
        { label: '2026', data: d26, borderColor: '#0B0B0B', backgroundColor: '#0B0B0B', borderWidth: 3, pointRadius: 4, tension: 0.3 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: c => c.dataset.label + ': ' + fmtBRL(c.parsed.y) } } },
      scales: {
        y: { beginAtZero: true, grid: { color: '#f0f0f0' }, ticks: { callback: v => 'R$ ' + (v/1000).toFixed(0) + 'k' } },
        x: { grid: { display: false } }
      }
    }
  });
}

function renderRankingComLeitura(comp, limiteMes) {
  const tbody = document.getElementById('tbody-ranking-leitura');
  
  const vendedoresMap = {};
  state.vendedores.filter(v => v.ativo && v.papel === 'vendedor').forEach(v => {
    vendedoresMap[v.nome.toUpperCase()] = { nome: v.nome, f25: 0, f26: 0, p25: 0, p26: 0 };
  });

  comp.forEach(m => {
    if (!m.vendedores) return;
    Object.keys(m.vendedores).forEach(nomeUpper => {
      const vd = m.vendedores[nomeUpper];
      if (vendedoresMap[nomeUpper]) {
        vendedoresMap[nomeUpper].f25 += (vd.fat2025 || 0);
        vendedoresMap[nomeUpper].f26 += (vd.fat2026 || 0);
        vendedoresMap[nomeUpper].p25 += (vd.ped2025 || 0);
        vendedoresMap[nomeUpper].p26 += (vd.ped2026 || 0);
      }
    });
  });

  let lista = Object.values(vendedoresMap).filter(v => v.f26 > 0 || v.f25 > 0);
  lista.sort((a, b) => b.f26 - a.f26);

  tbody.innerHTML = lista.map((v, i) => {
    const crescRS = v.f26 - v.f25;
    const crescPct = v.f25 > 0 ? (crescRS / v.f25) * 100 : null;
    
    let variacaoHtml = '<span class="badge neutral">—</span>';
    let leituraHtml = '<span style="color:#888;">Sem dados</span>';

    if (v.f25 === 0 && v.f26 > 0) {
      variacaoHtml = '<span class="badge" style="background:#E0E7FF; color:#3730A3;">NOVO</span>';
      leituraHtml = 'Sem histórico de 2025 para comparar.';
    } else if (crescPct != null) {
      const isPos = crescPct >= 0;
      variacaoHtml = `<span style="font-weight:600; color:${isPos ? 'var(--af-verde)' : 'var(--af-vermelho)'}">${isPos ? '▲' : '▼'} ${fmtPct(Math.abs(crescPct), 1)}</span>`;
      
      if (crescPct > 15) leituraHtml = 'Crescimento forte em relação a 2025.';
      else if (crescPct > 0) leituraHtml = 'Crescendo levemente.';
      else if (crescPct > -10) leituraHtml = 'Queda leve — monitorar.';
      else leituraHtml = 'Abaixo de 2025 — pode precisar de apoio.';
    }

    return `
      <tr>
        <td><strong>${i+1}º ${escapeHtml(v.nome)}</strong></td>
        <td class="num" style="color:var(--af-t2)">${fmtBRL(v.f25)}</td>
        <td class="num"><strong>${fmtBRL(v.f26)}</strong></td>
        <td class="num">${variacaoHtml}</td>
        <td class="num" style="color:var(--af-t2)">${v.p25} → ${v.p26}</td>
        <td style="font-size:12px; color:var(--af-t2);">${leituraHtml}</td>
      </tr>
    `;
  }).join('');
}