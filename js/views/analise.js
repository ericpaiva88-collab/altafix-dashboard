// ============================================================
// views/analise.js — Análise com subtabs YoY + MoM
// ============================================================

import { state, ui } from '../state.js';
import { fmtBRL, fmtNum, fmtPct, escapeHtml } from '../utils.js';
import { comparativoNoEscopo, filialNoEscopo } from '../calc.js';
import { calcularDiagnosticoMoM, listarMesesComDados } from '../calc_diagnostico.js';

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
               'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

let chartYoyInstance = null;
let chartWaterfallInstance = null;
let subtabAtiva = 'yoy';

export function renderAnalise() {
  setupSubtabs();
  if (subtabAtiva === 'yoy') renderAnaliseYoY();
  else renderAnaliseMoM();
}

function setupSubtabs() {
  const tabs = document.querySelectorAll('#analise-subtabs button');
  const elYoy = document.getElementById('analise-painel-yoy');
  const elMom = document.getElementById('analise-painel-mom');
  if (!tabs.length || !elYoy || !elMom) return;

  tabs.forEach(b => {
    b.classList.toggle('active', b.dataset.subtab === subtabAtiva);
    b.onclick = () => {
      subtabAtiva = b.dataset.subtab;
      tabs.forEach(x => x.classList.toggle('active', x === b));
      elYoy.style.display = subtabAtiva === 'yoy' ? 'block' : 'none';
      elMom.style.display = subtabAtiva === 'mom' ? 'block' : 'none';
      if (subtabAtiva === 'yoy') renderAnaliseYoY();
      else renderAnaliseMoM();
    };
  });

  elYoy.style.display = subtabAtiva === 'yoy' ? 'block' : 'none';
  elMom.style.display = subtabAtiva === 'mom' ? 'block' : 'none';
}

// ============================================================
// SUBTAB 1 — YoY (Mantido)
// ============================================================
function renderAnaliseYoY() {
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

  const dadosPorMes = MESES.map((nomeMes, idx) => {
    let f25 = 0, f26 = 0, p25 = 0, p26 = 0;

    const mComp = compOriginal.find(c => c.mes.toLowerCase().startsWith(nomeMes.slice(0, 3).toLowerCase()));
    if (mComp) {
      if (!vendFiltro) {
        f25 = mComp.fat2025 || 0; p25 = mComp.ped2025 || 0;
      } else if (mComp.vendedores && mComp.vendedores[vendFiltro]) {
        f25 = mComp.vendedores[vendFiltro].fat2025 || 0;
      }
    }

    const prefixo26 = anoAtual + '-' + String(idx + 1).padStart(2, '0');
    state.lancamentos.forEach(l => {
      if (l.data.indexOf(prefixo26) === 0 && filialNoEscopo(l.filialId, ui.escopoAtual)) {
        if (!vendFiltro || l.vendedor === state.vendedores.find(v => v.nome.toUpperCase() === vendFiltro)?.id) {
          f26 += (l.valor || 0); p26 += (l.pedidos || 0);
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
  if (!tbody) return;

  const vendedoresMap = {};
  state.vendedores.filter(v => v.ativo && v.papel === 'vendedor').forEach(v => {
    vendedoresMap[v.nome.toUpperCase()] = { nome: v.nome, f25: 0, f26: 0, p25: 0, p26: 0 };
  });

  const compOriginal = comparativoNoEscopo(ui.escopoAtual);
  const anoAtual = new Date().getFullYear();
  const limiteMes = dadosPorMes.length;

  compOriginal.forEach(m => {
    const idx = MESES.findIndex(nome => m.mes.toLowerCase().startsWith(nome.slice(0, 3).toLowerCase()));
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

// ============================================================
// SUBTAB 2 — MoM
// ============================================================
function renderAnaliseMoM() {
  const selVend = document.getElementById('mom-vendedor');
  const selMes = document.getElementById('mom-mes');
  if (!selVend || !selMes) return;

  if (selVend.options.length === 0) {
    let opts = '';
    state.vendedores.filter(v => v.ativo && v.papel === 'vendedor').forEach(v => {
      opts += `<option value="${v.id}">${escapeHtml(v.nome)}</option>`;
    });
    selVend.innerHTML = opts;
    selVend.onchange = () => {
      popularMesesMoM(selVend.value);
      renderPainelMoM(selVend.value, selMes.value);
    };
    selMes.onchange = () => renderPainelMoM(selVend.value, selMes.value);
  }

  if (selMes.options.length === 0) popularMesesMoM(selVend.value);
  renderPainelMoM(selVend.value, selMes.value);
}

function popularMesesMoM(vendedorId) {
  const selMes = document.getElementById('mom-mes');
  if (!selMes) return;
  const meses = listarMesesComDados(vendedorId);
  if (meses.length === 0) {
    selMes.innerHTML = '<option value="">Sem dados</option>';
    return;
  }
  selMes.innerHTML = meses.map(m => {
    const [a, mm] = m.split('-');
    return `<option value="${m}">${MESES[parseInt(mm, 10) - 1]} / ${a}</option>`;
  }).join('');

  const hoje = new Date();
  const chaveHoje = hoje.getFullYear() + '-' + String(hoje.getMonth() + 1).padStart(2, '0');
  selMes.value = meses.indexOf(chaveHoje) >= 0 ? chaveHoje : meses[0];
}

function renderPainelMoM(vendedorId, mesRef) {
  const kpiEl = document.getElementById('mom-kpis');
  const leituraEl = document.getElementById('mom-leitura');
  const alertasEl = document.getElementById('mom-alertas');
  const perdasEl = document.getElementById('mom-perdas');
  const novosEl = document.getElementById('mom-novos');
  if (!kpiEl || !leituraEl) return;

  if (chartWaterfallInstance) { chartWaterfallInstance.destroy(); chartWaterfallInstance = null; }

  if (!vendedorId || !mesRef) {
    kpiEl.innerHTML = '<div class="kpi-card" style="grid-column:1/-1; text-align:center; color:#888; padding:24px;">Sem dados para este vendedor.</div>';
    leituraEl.innerHTML = ''; alertasEl.innerHTML = ''; perdasEl.innerHTML = ''; novosEl.innerHTML = '';
    return;
  }

  const d = calcularDiagnosticoMoM(vendedorId, mesRef);
  if (!d) return;

  if (d.semBase) {
    kpiEl.innerHTML = '<div class="kpi-card" style="grid-column:1/-1; text-align:center; padding:32px;">' +
      '<div style="font-size:16px; font-weight:600; margin-bottom:8px;">Sem base comparativa</div>' +
      '<div style="color:#888; font-size:13px;">Não há dados do mês anterior importados. Importe o 324 para ver a decomposição.</div>' +
      '</div>';
    leituraEl.innerHTML = ''; alertasEl.innerHTML = ''; perdasEl.innerHTML = ''; novosEl.innerHTML = '';
    return;
  }

  const varCor = d.variacaoPct >= 0 ? 'var(--af-verde)' : 'var(--af-vermelho)';
  const varSinal = d.variacaoPct >= 0 ? '+' : '';
  const pctTxt = varSinal + d.variacaoPct.toFixed(1) + '%';

  const fatAtualExibir = d.ehMesCorrente ? d.fatProjetado : d.totalAt;
  const cardAtualLabel = d.ehMesCorrente ? 'PROJEÇÃO DE FECHAMENTO' : 'MÊS ATUAL (realizado)';
  const cardAtualHint = d.ehMesCorrente
    ? `Realizado até hoje: ${fmtBRL(d.totalAt)} · ${d.duFaltam} dia(s) útil(eis) restante(s)`
    : `${d.pedidosAt} pedidos no mês`;

  const proxVarProj = (d.ehMesCorrente && d.fatAntCompleto > 0)
    ? ((d.fatProjetado - d.fatAntCompleto) / d.fatAntCompleto) * 100
    : null;

  kpiEl.innerHTML = `
    <div class="kpi-card">
      <div class="kpi-header">MÊS ANTERIOR (fechado)</div>
      <div class="kpi-value">${fmtBRL(d.fatAntCompleto || d.totalAnt)}</div>
      <div class="kpi-hint">${fmtMesCurto(d.mesAnt)} · ${d.pedidosAnt} pedidos</div>
    </div>
    <div class="kpi-card" style="border-left:3px solid ${varCor};">
      <div class="kpi-header">${cardAtualLabel}</div>
      <div class="kpi-value" style="color:${varCor}">${fmtBRL(fatAtualExibir)}</div>
      <div class="kpi-hint">${cardAtualHint}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-header">VARIAÇÃO REALIZADA</div>
      <div class="kpi-value" style="color:${varCor}">${pctTxt}</div>
      <div class="kpi-hint">${d.variacaoRS >= 0 ? '+' : ''}${fmtBRL(d.variacaoRS)} · 01–${String(d.diaRef).padStart(2, '0')} de cada mês${proxVarProj != null ? ' · projeção: ' + (proxVarProj >= 0 ? '+' : '') + proxVarProj.toFixed(1) + '%' : ''}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-header">META ${d.meta > 0 ? `(${d.pctMeta.toFixed(0)}%)` : ''}</div>
      <div class="kpi-value">${d.meta > 0 ? fmtBRL(d.meta) : '—'}</div>
      <div class="kpi-hint">${d.meta > 0
        ? (d.pctMeta >= 100
          ? '<span style="color:var(--af-verde)">Meta atingida 🎉</span>'
          : `Faltam ${fmtBRL(Math.max(0, d.meta - fatAtualExibir))}`)
        : 'Meta não cadastrada'}</div>
    </div>
  `;

  leituraEl.innerHTML = `<p style="font-size:14px; line-height:1.6; color:var(--af-t1); margin-bottom:12px;">${escapeHtml(d.leitura)}</p>`;
  
  alertasEl.innerHTML = d.alertas.map(a => {
    const bg = a.tipo === 'danger' ? '#fee2e2' : a.tipo === 'warning' ? '#fef3c7' : '#dcfce7';
    const cor = a.tipo === 'danger' ? '#991b1b' : a.tipo === 'warning' ? '#92400e' : '#166534';
    const icon = a.tipo === 'danger' ? '🚨' : a.tipo === 'warning' ? '🟡' : '🟢';
    
    // Torna o alerta clicável se tiver link
    const isLink = a.link ? 'cursor:pointer;' : '';
    const clickAction = a.link ? `onclick="document.querySelector('${a.link}').scrollIntoView({behavior: 'smooth'});"` : '';
    const linkIndicator = a.link ? '<span style="text-decoration:underline; font-size:10px; margin-left:8px;">(clique para ver)</span>' : '';

    return `<div style="background:${bg}; color:${cor}; padding:10px 12px; border-radius:6px; font-size:12px; font-weight:600; display:flex; gap:8px; align-items:center; margin-bottom:8px; ${isLink}" ${clickAction}>
      <span style="font-size:14px; line-height:1;">${icon}</span><span>${escapeHtml(a.msg)} ${linkIndicator}</span>
    </div>`;
  }).join('');

  perdasEl.innerHTML = renderListaClientes([...d.perdidos, ...d.cairam], 'Nenhum cliente perdido ou em queda.', 'neg');
  novosEl.innerHTML = renderListaClientes([...d.novos, ...d.cresceram], 'Nenhum cliente novo ou em crescimento.', 'pos');

  renderWaterfallMoM(d);
}

function renderListaClientes(lista, vazio, tipo) {
  if (!lista || lista.length === 0) {
    return `<div style="padding:16px; text-align:center; color:#888; font-size:12px;">${vazio}</div>`;
  }
  
  return `<div class="ficha-lista">${lista.slice(0, 10).map(c => {
    const delta = c.delta;
    const sinal = delta >= 0 ? '+' : '';
    const cor = delta >= 0 ? 'var(--af-verde)' : 'var(--af-vermelho)';
    
    // Lógica clara para a frase de detalhe
    let detalhe = '';
    if (c.nome === 'Outros / Sem Cadastro') {
      detalhe = 'Ajustes de ERP não mapeados a clientes';
    } else if (c.valorAtual === 0) {
      detalhe = `Não comprou em ${c.nome ? 'Out/26' : 'no mês'}. (Era ${fmtBRL(c.valorAnterior)})`;
    } else if (c.valorAnterior === 0) {
      detalhe = `Novo cliente.`;
    } else {
      detalhe = `Caiu de ${fmtBRL(c.valorAnterior)} para ${fmtBRL(c.valorAtual)}`;
    }

    return `<div class="ficha-lista-item">
      <div>
        <div class="nome">${escapeHtml(c.nome)}</div>
        <div class="detalhe">${detalhe}</div>
      </div>
      <div class="valor" style="color:${cor};">${sinal}${fmtBRL(delta)}</div>
    </div>`;
  }).join('')}</div>`;
}

function renderWaterfallMoM(d) {
  const ctx = document.getElementById('chart-waterfall-mom');
  if (!ctx || typeof Chart === 'undefined') return;
  if (chartWaterfallInstance) chartWaterfallInstance.destroy();

  const base = d.totalAnt;
  const ac1 = base + d.impPerdidos;
  const ac2 = ac1 + d.impNovos;
  const ac3 = ac2 + d.impRec;

  const labels = ['Mês Anterior', 'Perdidos', 'Novos', 'Recorrentes', 'Mês Atual'];
  const data = [
    [0, base],
    [Math.min(base, ac1), Math.max(base, ac1)],
    [Math.min(ac1, ac2), Math.max(ac1, ac2)],
    [Math.min(ac2, ac3), Math.max(ac2, ac3)],
    [0, d.totalAt]
  ];

  const cores = [
    '#94a3b8',
    d.impPerdidos < 0 ? '#dc2626' : '#16a34a',
    d.impNovos > 0 ? '#16a34a' : '#dc2626',
    d.impRec >= 0 ? '#16a34a' : '#dc2626',
    '#0f172a'
  ];

  // Plugin corrigido: a linha sempre conecta o final da barra atual ao início da próxima
  const linhasPlugin = {
    id: 'wfLines',
    afterDatasetsDraw(chart) {
      const { ctx, scales: { y } } = chart;
      const meta = chart.getDatasetMeta(0);
      ctx.save();
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      
      for (let i = 0; i < meta.data.length - 1; i++) {
        const bar = meta.data[i];
        const next = meta.data[i + 1];
        if (!bar || !next) continue;
        
        const currData = chart.data.datasets[0].data[i];
        const nextData = chart.data.datasets[0].data[i + 1];
        
        // O valor de conexão é o valor que a barra atual e a próxima compartilham
        let connectVal;
        if (currData[0] === nextData[0] || currData[0] === nextData[1]) {
            connectVal = currData[0];
        } else {
            connectVal = currData[1];
        }
        
        const yPos = y.getPixelForValue(connectVal);
        ctx.beginPath();
        ctx.moveTo(bar.x + bar.width / 2, yPos);
        ctx.lineTo(next.x - next.width / 2, yPos);
        ctx.stroke();
      }
      ctx.restore();
    }
  };

  chartWaterfallInstance = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ data, backgroundColor: cores, borderWidth: 0, borderRadius: 2 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 20 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (c) => {
              const v = c.raw;
              if (c.dataIndex === 0 || c.dataIndex === 4) return 'Total: ' + fmtBRL(v[1]);
              const diff = v[1] - v[0];
              return (diff > 0 ? '+' : '') + fmtBRL(diff);
            }
          }
        }
      },
      scales: {
        x: { 
          stacked: true, 
          grid: { display: false }, 
          ticks: { color: '#64748b', font: { size: 11, weight: '600' } } 
        },
        y: { 
          stacked: true, 
          beginAtZero: true,
          suggestedMax: base * 1.05, // Deixa o topo do gráfico mais justo, sem muito espaço vazio
          grid: { color: '#f0f0f0' }, 
          ticks: { color: '#64748b', callback: v => 'R$ ' + (v / 1000).toFixed(0) + 'k' } 
        }
      }
    },
    plugins: [linhasPlugin]
  });
}

function fmtMesCurto(ym) {
  if (!ym) return '';
  const [a, m] = ym.split('-');
  return MESES[parseInt(m, 10) - 1].slice(0, 3) + '/' + a;
}