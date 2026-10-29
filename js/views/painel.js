// ============================================================
// views/painel.js — Cockpit Comercial
// ============================================================

import { state, ui } from '../state.js';
import { fmtBRL, fmtPct, escapeHtml, isoDate, inicioSemana, normalizarNomeCliente, diffDias } from '../utils.js';
import {
  mesRefAtual, calcFilial, calcVendedor, calcDiasUteisNoMes, calcDiasUteisDecorridos, escopoNome, filialNoEscopo, vendedoresNoEscopo, getMetaVendedor
} from '../calc.js';

export function renderPainel() {
  const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const selMes = document.getElementById('painel-mes-select');

  if (selMes) {
    let mesesComDados = new Set();
    state.lancamentos.forEach(l => { if (l.data) mesesComDados.add(l.data.slice(0, 7)); });
    const listaMeses = Array.from(mesesComDados).sort().reverse();

    if (!ui.mesPainelSelecionado) {
      ui.mesPainelSelecionado = listaMeses.length > 0 ? listaMeses[0] : (new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0'));
    }

    selMes.innerHTML = listaMeses.map(m => {
      const p = m.split('-');
      return `<option value="${m}">${meses[parseInt(p[1]) - 1].slice(0, 3)}/${p[0]}</option>`;
    }).join('');
    selMes.value = ui.mesPainelSelecionado;
  }

  const ref = mesRefAtual(ui.escopoAtual);
  const a = ref.ano, m = ref.mes;

  const isModoVendedor = !!ui.modoVendedor;
  let vendedorFoco = null;
  let f = null;

  if (isModoVendedor) vendedorFoco = state.vendedores.find(v => v.id === ui.modoVendedor);

  if (vendedorFoco) f = calcVendedor(vendedorFoco, a, m);
  else f = calcFilial(a, m, ui.escopoAtual);

  const faturado = isModoVendedor ? f.faturado : f.faturadoTotal;
  const meta = isModoVendedor ? f.meta : f.metaTotal;
  const falta = isModoVendedor ? Math.max(0, meta - faturado) : f.falta;
  const projecao = f.projecao;
  const porDia = isModoVendedor ? f.metaDia : f.porDia;
  const pctMeta = meta > 0 ? (faturado / meta) * 100 : 0;
  const diasFaltam = f.diasFaltam;
  let status = f.status;

  const numPct = document.getElementById('painel-pct');
  if (numPct) numPct.innerHTML = fmtBRL(faturado);

  const stEl = document.getElementById('painel-status');
  if (stEl) {
    stEl.innerHTML = (status === 'ACIMA' || status === 'SUPERVISOR')
      ? '<span class="badge ok">No Ritmo</span>' 
      : '<span class="badge danger">Abaixo</span>';
  }
  
  const barra = document.getElementById('painel-barra').firstElementChild;
  if (barra) {
    barra.style.width = Math.min(100, pctMeta) + '%';
    barra.className = pctMeta >= 100 ? 'ok' : (pctMeta >= 80 ? '' : 'danger');
  }

  const infoEl = document.getElementById('painel-dias-info');
  if (infoEl) infoEl.innerHTML = `Meta: <strong>${fmtBRL(meta)}</strong> · Faltam ${diasFaltam} dias úteis`;

  const faltaEl = document.getElementById('painel-falta');
  if (faltaEl) faltaEl.innerHTML = fmtBRL(falta);
  
  const faltaHint = document.getElementById('painel-falta-hint');
  if (faltaHint) faltaHint.innerHTML = falta > 0 ? `Faltam ${fmtPct(100 - pctMeta, 1)} para a meta` : 'Meta atingida! 🎉';

  const projEl = document.getElementById('painel-projecao');
  if (projEl) projEl.innerHTML = fmtBRL(projecao);
  
  const projHint = document.getElementById('painel-projecao-hint');
  if (projHint) {
    projHint.innerHTML = projecao >= meta
      ? '<span style="color:var(--af-verde)">Projeção acima da meta</span>'
      : '<span style="color:var(--af-vermelho)">Projeção abaixo da meta</span>';
  }

  const diaEl = document.getElementById('painel-precisadia');
  if (diaEl) diaEl.innerHTML = fmtBRL(porDia);
  
  renderGraficoAcumulado(a, m, meta, isModoVendedor ? vendedorFoco.id : null);
  
  const cardEquipe = document.getElementById('painel-equipe-container')?.closest('.card-painel');
  if (cardEquipe) {
    if (isModoVendedor) cardEquipe.style.display = 'none';
    else {
      cardEquipe.style.display = 'block';
      renderTabelaEquipe(a, m, f);
    }
  }

  renderSemana();
  renderAtencaoAgora(a, m, vendedorFoco);
}

let chartMetaInstance = null;

function renderGraficoAcumulado(a, m, meta, vendedorId) {
  const ctx = document.getElementById('chart-meta-cockpit');
  if (!ctx || typeof Chart === 'undefined') return;
  if (chartMetaInstance) chartMetaInstance.destroy();

  const diasNoMes = new Date(a, m + 1, 0).getDate();
  const labels = [], dataRealizado = [], dataMetaIdeal = [];
  let acumulado = 0, metaAcumulada = 0;
  
  const du = calcDiasUteisNoMes(a, m);
  const metaDiaria = meta / Math.max(1, du);
  
  const hoje = new Date();
  const diaCorte = (hoje.getFullYear() === a && hoje.getMonth() === m) ? hoje.getDate() : diasNoMes;

  for (let d = 1; d <= diasNoMes; d++) {
    labels.push(d);
    if (new Date(a, m, d).getDay() % 6 !== 0) metaAcumulada += metaDiaria;
    dataMetaIdeal.push(metaAcumulada);

    if (d <= diaCorte) {
      const iso = a + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      state.lancamentos.forEach(l => {
        if (l.data === iso && filialNoEscopo(l.filialId, ui.escopoAtual)) {
          if (!vendedorId || l.vendedor === vendedorId) acumulado += (l.valor || 0);
        }
      });
      dataRealizado.push(acumulado);
    } else {
      dataRealizado.push(null);
    }
  }

  const linhaHojePlugin = {
    id: 'linhaHoje',
    afterDraw(chart) {
      if (diaCorte >= diasNoMes) return;
      const { ctx, chartArea: { top, bottom }, scales: { x } } = chart;
      const xPos = x.getPixelForValue(diaCorte - 1);
      ctx.save(); ctx.beginPath(); ctx.moveTo(xPos, top); ctx.lineTo(xPos, bottom);
      ctx.lineWidth = 1; ctx.strokeStyle = '#888'; ctx.setLineDash([4, 4]); ctx.stroke(); ctx.restore();
    }
  };

  chartMetaInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Realizado', data: dataRealizado, borderColor: '#0B0B0B', backgroundColor: 'rgba(11,11,11,0.05)', borderWidth: 2, pointRadius: 0, fill: true, tension: 0.1 },
        { label: 'Meta Ideal', data: dataMetaIdeal, borderColor: '#D60000', borderDash: [5, 5], borderWidth: 1.5, pointRadius: 0, fill: false, tension: 0 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => c.dataset.label + ': ' + fmtBRL(c.parsed.y) } } },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#888', font: { size: 10 } } },
        y: { beginAtZero: true, grid: { color: '#f0f0f0' }, ticks: { color: '#888', font: { size: 10 }, callback: v => 'R$ ' + (v/1000).toFixed(0) + 'k' } }
      }
    },
    plugins: [linhaHojePlugin]
  });
}

export function renderSemana() {
  const ini = inicioSemana(ui.semanaRef);
  const fim = new Date(ini);
  fim.setDate(fim.getDate() + 5);

  const el = document.getElementById('sem-titulo');
  if (!el) return;

  el.textContent = String(ini.getDate()).padStart(2, '0') + '/' +
    String(ini.getMonth() + 1).padStart(2, '0') + ' a ' +
    String(fim.getDate()).padStart(2, '0') + '/' +
    String(fim.getMonth() + 1).padStart(2, '0');

  const ds = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];

  let ativos = vendedoresNoEscopo(ui.escopoAtual).filter(v => v.ativo && v.papel !== 'administrativo');
  if (ui.modoVendedor) ativos = ativos.filter(v => v.id === ui.modoVendedor);

  const dados = ativos.map(v => {
    const pd = {};
    for (let i = 0; i < 6; i++) {
      const d = new Date(ini);
      d.setDate(d.getDate() + i);
      const iso = isoDate(d);
      const lancs = state.lancamentos.filter(l => l.vendedor === v.id && l.data === iso);
      let val = 0;
      lancs.forEach(l => { val += (l.valor || 0); });
      pd[i] = val;
    }
    let t = 0;
    for (let j = 0; j < 6; j++) t += pd[j];
    return { v, porDia: pd, total: t };
  });

  const td = [0, 0, 0, 0, 0, 0];
  dados.forEach(d => { for (let i = 0; i < 6; i++) td[i] += d.porDia[i]; });
  const tg = td.reduce((a, b) => a + b, 0);

  const duMes = calcDiasUteisNoMes(ini.getFullYear(), ini.getMonth());
  const metaSem = vendedoresNoEscopo(ui.escopoAtual)
    .filter(v => v.ativo && !v.supervisor && v.papel !== 'administrativo')
    .reduce((s, v) => s + (getMetaVendedor(v, ini.getFullYear(), ini.getMonth()).meta || 0), 0) * (5 / Math.max(1, duMes));
  
  const pct = metaSem > 0 ? (tg / metaSem) * 100 : 0;

  const fatEl = document.getElementById('semana-fat');
  if (fatEl) fatEl.innerHTML = fmtBRL(tg);
  const metaLabel = document.getElementById('semana-meta-label');
  if (metaLabel) metaLabel.innerHTML = `Meta: ${fmtBRL(metaSem)}`;
  const pctEl = document.getElementById('semana-pct');
  if (pctEl) pctEl.innerHTML = `${pct.toFixed(0)}% da meta semanal`;
  
  const barra = document.getElementById('semana-barra');
  if (barra) {
    barra.style.width = Math.min(100, pct) + '%';
    barra.className = 'tabela-barra-fill ' + (pct >= 100 ? 'verde' : (pct >= 80 ? '' : 'vermelho'));
  }

  let h = '<tr><th>Vendedor</th>';
  for (let i = 0; i < 6; i++) h += '<th class="num">' + ds[i] + '</th>';
  h += '<th class="num">Total</th></tr>';

  let b = '';
  dados.forEach(row => {
    b += '<tr><td><strong>' + escapeHtml(row.v.nome) + '</strong></td>';
    for (let i = 0; i < 6; i++) {
      b += '<td class="num">' + (row.porDia[i] > 0 ? fmtBRL(row.porDia[i]) : '—') + '</td>';
    }
    b += '<td class="num"><strong>' + fmtBRL(row.total) + '</strong></td></tr>';
  });
  b += '<tr style="background:#0B0B0B;color:#fff;font-weight:700;"><td>TOTAL</td>';
  for (let j = 0; j < 6; j++) {
    b += '<td class="num">' + (td[j] > 0 ? fmtBRL(td[j]) : '—') + '</td>';
  }
  b += '<td class="num">' + fmtBRL(tg) + '</td></tr>';

  const semDesktop = document.getElementById('sem-desktop');
  if (semDesktop) semDesktop.innerHTML = '<div style="overflow-x:auto;"><table class="tabela-cockpit">' + h + b + '</table></div>';

  const tabs = document.getElementById('sem-tabs');
  if (tabs) {
    tabs.querySelectorAll('button').forEach(btn => {
      if (parseInt(btn.dataset.dia, 10) === ui.diaSemanaMobile) btn.classList.add('active');
      else btn.classList.remove('active');
    });
  }

  const idx = ui.diaSemanaMobile - 1;
  const dd2 = new Date(ini);
  dd2.setDate(dd2.getDate() + idx);

  let hh = '<div style="margin-bottom:8px;font-weight:600;">' + ds[idx] + ' — ' + String(dd2.getDate()).padStart(2, '0') + '/' + String(dd2.getMonth() + 1).padStart(2, '0') + '</div>';
  dados.forEach(row => {
    const x = row.porDia[idx];
    hh += '<div class="ficha-lista-item"><div class="nome">' + escapeHtml(row.v.nome) + '</div><div class="valor">' + (x > 0 ? fmtBRL(x) : '—') + '</div></div>';
  });
  
  const semMobile = document.getElementById('sem-mobile');
  if (semMobile) semMobile.innerHTML = hh;
}

function renderTabelaEquipe(a, m, f) {
  const tbody = document.getElementById('painel-equipe-container');
  if (!tbody) return;

  let vendedores = f.dados ? f.dados.filter(d => d.vendedor.papel === 'vendedor') : [];
  vendedores.sort((x, y) => (y.pctMeta || 0) - (x.pctMeta || 0));

  if(vendedores.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px; color:#888;">Nenhum vendedor com dados.</td></tr>';
    return;
  }

  tbody.innerHTML = vendedores.map(d => {
    const v = d.vendedor;
    const pct = d.pctMeta || 0;
    const gap = d.meta > 0 ? d.meta * (calcDiasUteisDecorridos(a, m) / calcDiasUteisNoMes(a, m)) : 0;
    const isAbaixo = d.faturado < gap;

    let statusBadge = '<span class="badge ok">No ritmo</span>';
    if (pct === 0) statusBadge = '<span class="badge neutral">Sem dados</span>';
    else if (isAbaixo) statusBadge = '<span class="badge danger">Abaixo</span>';

    const barraCls = isAbaixo ? 'vermelho' : 'verde';
    const marcadorPct = d.meta > 0 ? Math.min(100, (gap / d.meta) * 100) : 0;

    return `
      <tr>
        <td><strong>${escapeHtml(v.nome)}</strong></td>
        <td class="num">${fmtBRL(d.faturado)}</td>
        <td style="width: 180px;">
          <div class="tabela-barra-wrap">
            <div class="tabela-barra-bg">
              <div class="tabela-barra-fill ${barraCls}" style="width: ${Math.min(100, pct)}%"></div>
              <div class="tabela-barra-marker" style="left: ${marcadorPct}%"></div>
            </div>
            <span style="font-size:11px; font-weight:600; width:35px;">${pct.toFixed(0)}%</span>
          </div>
        </td>
        <td class="num">${fmtBRL(d.projecao)}</td>
        <td class="num ${isAbaixo ? 'vermelho' : ''}">${fmtBRL(d.metaDia)}</td>
        <td class="num">${fmtBRL(d.ticket)}</td>
        <td>${statusBadge}</td>
      </tr>
    `;
  }).join('');
}

function renderAtencaoAgora(a, m, vendedorFoco) {
  const el = document.getElementById('painel-acoes-container');
  if (!el) return;

  let alertas = [];

  if (vendedorFoco) {
    const d = calcVendedor(vendedorFoco, a, m);
    const gap = d.meta * (calcDiasUteisDecorridos(a, m) / calcDiasUteisNoMes(a, m));
    if (d.faturado < gap && d.faturado > 0) {
      alertas.push({ tipo: 'vendedor', titulo: 'Atenção ao seu ritmo', desc: `${fmtBRL(gap - d.faturado)} atrás do esperado. Precisa de ${fmtBRL(d.metaDia)}/dia.`, peso: 999999 });
    }
    let clientesRisco = state.clientes.filter(c => c.vendedor === vendedorFoco.id && (c.diasSemComprar || 0) > 30 && c.valorMedioMensal > 1000).sort((a, b) => b.valorMedioMensal - a.valorMedioMensal).slice(0, 4);
    clientesRisco.forEach(c => { alertas.push({ tipo: 'cliente', titulo: c.nome, desc: `${c.diasSemComprar} dias sem comprar. Valor: ${fmtBRL(c.valorMedioMensal)}/mês.`, peso: c.valorMedioMensal }); });
  } else {
    const f = calcFilial(a, m, ui.escopoAtual);
    const dadosVendedores = f.dados || [];
    dadosVendedores.filter(d => d.vendedor.papel === 'vendedor').forEach(d => {
      const gap = d.meta * (calcDiasUteisDecorridos(a, m) / calcDiasUteisNoMes(a, m));
      if (d.faturado < gap && d.faturado > 0) {
        alertas.push({ tipo: 'vendedor', titulo: d.vendedor.nome + ' está abaixo do ritmo', desc: `${fmtBRL(gap - d.faturado)} atrás. Precisa de ${fmtBRL(d.metaDia)}/dia.`, peso: gap - d.faturado });
      }
    });
    let clientesRisco = state.clientes.filter(c => filialNoEscopo(c.filialId, ui.escopoAtual) && (c.diasSemComprar || 0) > 30 && c.valorMedioMensal > 5000).sort((a, b) => b.valorMedioMensal - a.valorMedioMensal).slice(0, 2);
    clientesRisco.forEach(c => { alertas.push({ tipo: 'cliente', titulo: c.nome, desc: `${c.diasSemComprar} dias sem comprar. Valor: ${fmtBRL(c.valorMedioMensal)}/mês.`, peso: c.valorMedioMensal * 1.5 }); });
    alertas.sort((x, y) => y.peso - x.peso); alertas = alertas.slice(0, 5);
  }

  if (alertas.length === 0) { el.innerHTML = '<div style="padding:32px; text-align:center; color:#888;">Tudo tranquilo no radar.</div>'; return; }

  el.innerHTML = alertas.map(al => `
    <div class="acao-item">
      <div class="acao-icon" style="background: ${al.tipo === 'vendedor' ? 'var(--af-amarelo)' : 'var(--af-vermelho)'}"></div>
      <div class="acao-content">
        <div class="acao-title">${escapeHtml(al.titulo)}</div>
        <div class="acao-desc">${escapeHtml(al.desc)}</div>
      </div>
    </div>
  `).join('');
}

export function imprimirHTML(titulo, subtitulo, corpoHTML) {
  const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' + escapeHtml(titulo) + '</title><style>body{font-family:system-ui,sans-serif;color:#0f172a;font-size:11px;padding:16px;line-height:1.4}h1{font-size:16px;color:#dc2626;margin-bottom:2px}.sub{font-size:10px;color:#64748b;margin-bottom:14px;border-bottom:1px solid #e2e8f0;padding-bottom:8px}table{width:100%;border-collapse:collapse;font-size:10px;margin-top:10px}th{background:#e2e8f0;text-align:left;padding:5px 6px;font-weight:700;border-bottom:1px solid #94a3b8}td{padding:4px 6px;border-bottom:1px solid #e2e8f0}tr:nth-child(even) td{background:#f8fafc}.num{text-align:right}.rodape{margin-top:16px;font-size:9px;color:#94a3b8;text-align:center;border-top:1px solid #e2e8f0;padding-top:6px}@media print{body{padding:8px}tr{page-break-inside:avoid}}</style></head><body>';
  const sub = escapeHtml(subtitulo) + ' · ' + new Date().toLocaleString('pt-BR') + ' · ' + escapeHtml(escopoNome(ui.escopoAtual));
  const blob = new Blob([html + '<h1>Alta Fix — ' + escapeHtml(titulo) + '</h1><div class="sub">' + sub + '</div>' + corpoHTML + '<div class="rodape">Gerado pelo Alta Fix</div></body></html>'], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, '_blank');
  if (!w) { URL.revokeObjectURL(url); toast('⚠ Bloqueador de pop-up ativo.'); return; }
  w.focus();
  setTimeout(() => { try { w.print(); } catch (e) {} setTimeout(() => URL.revokeObjectURL(url), 30000); }, 400);
}