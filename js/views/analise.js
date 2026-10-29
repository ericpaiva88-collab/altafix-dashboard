// ============================================================
// views/analise.js — Análise com Inteligência (Line Chart + Leitura)
// ============================================================

import { state, ui } from '../state.js';
import { fmtBRL, fmtNum, fmtPct, escapeHtml, isoDate } from '../utils.js';
import { comparativoNoEscopo, filialNoEscopo } from '../calc.js';

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
  const periodo = selPeriodo?.value || 'ytd';
  const mesAtual = new Date().getMonth(); 
  const limiteMes = periodo === 'ytd' ? mesAtual : 11;
  const vendFiltro = (selVend?.value || '').toUpperCase();
  const anoAtual = new Date().getFullYear();

  // Mapeia os dados mês a mês
  const dadosPorMes = MESES.map((nomeMes, idx) => {
    let f25 = 0, f26 = 0, p25 = 0, p26 = 0;
    
    // 1. Tenta pegar 2025 e pedidos do comparativo
    const mComp = compOriginal.find(c => c.mes.toLowerCase().startsWith(nomeMes.slice(0,3).toLowerCase()));
    if (mComp) {
      if (!vendFiltro) {
        f25 = mComp.fat2025 || 0;
        p25 = mComp.ped2025 || 0;
      } else if (mComp.vendedores && mComp.vendedores[vendFiltro]) {
        f25 = mComp.vendedores[vendFiltro].fat2025 || 0;
      }
    }

    // 2. Puxa 2026 dos LANÇAMENTOS reais (corrige o bug de outubro zerado)
    const prefixo26 = anoAtual + '-' + String(idx + 1).padStart(2, '0');
    state.lancamentos.forEach(l => {
      if (l.data.indexOf(prefixo26) === 0 && filialNoEscopo(l.filialId, ui.escopoAtual)) {
        if (!vendFiltro || l.vendedor === state.vendedores.find(v => v.nome.toUpperCase() === vendFiltro)?.id) {
          f26 += (l.valor || 0);
          p26 += (l.pedidos || 0);
        }
      }
    });

    return { mes: nomeMes, f25, f26, p25, p26 };
  }).slice(0, limiteMes + 1);

  const t25 = dadosPorMes.reduce((s, m) => s + m.f25, 0);
  const t26 = dadosPorMes.reduce((s, m) => s + m.f26, 0);
  const ped25 = dadosPorMes.reduce((s, m) => s + m.p25, 0);
  const ped26 = dadosPorMes.reduce((s, m) => s + m.p26, 0);

  const crescRS = t26 - t25;
  const crescPct = t25 > 0 ? (crescRS / t25) * 100 : 0;
  const tk25 = ped25 > 0 ? t25 / ped25 : 0;
  const tk26 = ped26 > 0 ? t26 / ped26 : 0;
  const tkPct = tk25 > 0 ? ((tk26 - tk25) / tk25) * 100 : 0;

  kpiEl.innerHTML = `
    <div class="kpi-card">
      <div class="kpi-header">FATURAMENTO (${periodo === 'ytd' ? 'YTD' : 'ANO'})</div>
      <div class="kpi-value">${fmtBRL(t26)}</div>
      <div class="kpi-hint">2025: ${fmtBRL(t25)} <span class="badge ${crescRS >= 0 ? 'ok' : 'danger'}" style="margin-left:8px;">${crescPct > 0 ? '▲' : '▼'} ${fmtPct(Math.abs(crescPct), 1)}</span></div>
    </div>
    <div class="kpi-card">
      <div class="kpi-header">PEDIDOS</div>
      <div class="kpi-value">${fmtNum(ped26, 0)}</div>
      <div class="kpi-hint">2025: ${fmtNum(ped25, 0)}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-header">TICKET MÉDIO</div>
      <div class="kpi-value">${fmtBRL(tk26)}</div>
      <div class="kpi-hint">2025: ${fmtBRL(tk25)} <span class="badge ${tkPct >= 0 ? 'ok' : 'danger'}" style="margin-left:8px;">${tkPct > 0 ? '▲' : '▼'} ${fmtPct(Math.abs(tkPct), 1)}</span></div>
    </div>
  `;

  renderGraficoLinha(dadosPorMes);
  renderRankingComLeitura(dadosPorMes);
}

function renderGraficoLinha(dadosPorMes) {
  const ctx = document.getElementById('chart-yoy-line');
  if (!ctx || typeof Chart === 'undefined') return;
  if (chartYoyInstance) chartYoyInstance.destroy();

  const labels = dadosPorMes.map(c => c.mes.slice(0, 3));
  const d25 = dadosPorMes.map(c => c.f25);
  const d26 = dadosPorMes.map(c => c.f26);

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

function renderRankingComLeitura(dadosPorMes) {
  const tbody = document.getElementById('tbody-ranking-leitura');
  
  const vendedoresMap = {};
  state.vendedores.filter(v => v.ativo && v.papel === 'vendedor').forEach(v => {
    vendedoresMap[v.nome.toUpperCase()] = { nome: v.nome, f25: 0, f26: 0, p25: 0, p26: 0 };
  });

  const compOriginal = comparativoNoEscopo(ui.escopoAtual);
  const anoAtual = new Date().getFullYear();
  const limiteMes = dadosPorMes.length;

  compOriginal.forEach(m => {
    const idx = MESES.findIndex(nome => m.mes.toLowerCase().startsWith(nome.slice(0,3).toLowerCase()));
    if (idx === -1 || idx >= limiteMes) return;
    
    if (m.vendedores) {
      Object.keys(m.vendedores).forEach(nomeUpper => {
        const vd = m.vendedores[nomeUpper];
        if (vendedoresMap[nomeUpper]) {
          vendedoresMap[nomeUpper].f25 += (vd.fat2025 || 0);
          vendedoresMap[nomeUpper].p25 += (vd.ped2025 || 0);
        }
      });
    }
  });

  state.lancamentos.forEach(l => {
    if (l.data.indexOf(anoAtual + '-') !== 0) return;
    if (!filialNoEscopo(l.filialId, ui.escopoAtual)) return;
    const mesIdx = parseInt(l.data.slice(5, 7), 10) - 1;
    if (mesIdx >= limiteMes) return;

    const v = state.vendedores.find(x => x.id === l.vendedor);
    if (v && vendedoresMap[v.nome.toUpperCase()]) {
      vendedoresMap[v.nome.toUpperCase()].f26 += (l.valor || 0);
      vendedoresMap[v.nome.toUpperCase()].p26 += (l.pedidos || 0);
    }
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
      leituraHtml = 'Sem histórico de 2025.';
    } else if (crescPct != null) {
      const isPos = crescPct >= 0;
      variacaoHtml = `<span style="font-weight:600; color:${isPos ? 'var(--af-verde)' : 'var(--af-vermelho)'}">${isPos ? '▲' : '▼'} ${fmtPct(Math.abs(crescPct), 1)}</span>`;
      if (crescPct > 15) leituraHtml = 'Crescimento forte.';
      else if (crescPct > 0) leituraHtml = 'Crescendo levemente.';
      else if (crescPct > -10) leituraHtml = 'Queda leve — monitorar.';
      else leituraHtml = 'Abaixo de 2025 — precisa de apoio.';
    }

    return `
      <tr>
        <td data-label="Vendedor"><strong>${i+1}º ${escapeHtml(v.nome)}</strong></td>
        <td class="num" data-label="2025" style="color:var(--af-t2)">${fmtBRL(v.f25)}</td>
        <td class="num" data-label="2026"><strong>${fmtBRL(v.f26)}</strong></td>
        <td class="num" data-label="Variação">${variacaoHtml}</td>
        <td class="num" data-label="Pedidos" style="color:var(--af-t2)">${v.p25} → ${v.p26}</td>
        <td data-label="Leitura" style="font-size:12px; color:var(--af-t2);">${leituraHtml}</td>
      </tr>
    `;
  }).join('');
}