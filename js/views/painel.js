// ============================================================
// views/painel.js — Cockpit Comercial
// ============================================================

import { state, ui, session } from '../state.js';
import {
  fmtBRL, fmtNum, fmtPct, isoDate, escapeHtml, toast, normalizarNomeCliente, diffDias
} from '../utils.js';
import {
  mesRefAtual, calcFilial, calcVendedor, getMetaVendedor, calcDiasUteisNoMes, calcDiasUteisDecorridos, escopoNome, parseEscopo, filialNoEscopo, vendedoresNoEscopo
} from '../calc.js';

// ============================================================
// RENDER PRINCIPAL (COCKPIT)
// ============================================================

export function renderPainel() {
  const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const selMes = document.getElementById('painel-mes-select');

  // Auto-selecionar o último mês com dados
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

  const f = calcFilial(a, m, ui.escopoAtual);

  // Preenche KPIs do Topo
  const pctMeta = f.pctMeta || 0;
  
  document.getElementById('painel-pct').innerHTML = fmtBRL(f.faturadoTotal);
  document.getElementById('painel-status').innerHTML = f.status === 'ACIMA' 
    ? '<span class="badge ok">No Ritmo</span>' 
    : '<span class="badge danger">Abaixo</span>';
  
  const barra = document.getElementById('painel-barra').firstElementChild;
  barra.style.width = Math.min(100, pctMeta) + '%';
  barra.className = pctMeta >= 100 ? 'ok' : (pctMeta >= 80 ? '' : 'danger');

  document.getElementById('painel-dias-info').innerHTML = 
    `Meta: <strong>${fmtBRL(f.metaTotal)}</strong> · Faltam ${f.diasFaltam} dias úteis`;

  document.getElementById('painel-falta').innerHTML = fmtBRL(f.falta);
  document.getElementById('painel-falta-hint').innerHTML = f.falta > 0 
    ? `Faltam ${fmtPct(100 - pctMeta, 1)} para a meta`
    : 'Meta atingida! 🎉';

  document.getElementById('painel-projecao').innerHTML = fmtBRL(f.projecao);
  document.getElementById('painel-projecao-hint').innerHTML = f.projecao >= f.metaTotal
    ? '<span style="color:var(--af-verde)">Projeção acima da meta</span>'
    : '<span style="color:var(--af-vermelho)">Projeção abaixo da meta</span>';

  document.getElementById('painel-precisadia').innerHTML = fmtBRL(f.porDia);
  
  renderGraficoAcumulado(a, m, f);
  renderTabelaEquipe(a, m, f);
  renderAtencaoAgora(a, m);
}

// ============================================================
// GRÁFICO ACUMULADO VS META
// ============================================================

let chartMetaInstance = null;

function renderGraficoAcumulado(a, m, f) {
  const ctx = document.getElementById('chart-meta-cockpit');
  if (!ctx || typeof Chart === 'undefined') return;

  if (chartMetaInstance) chartMetaInstance.destroy();

  const diasNoMes = new Date(a, m + 1, 0).getDate();
  const labels = [];
  const dataRealizado = [];
  const dataMetaIdeal = [];

  let acumulado = 0;
  let metaAcumulada = 0;
  const metaDiaria = f.metaTotal / Math.max(1, f.diasUteisTotal);
  const hoje = new Date();
  const diaCorte = (hoje.getFullYear() === a && hoje.getMonth() === m) ? hoje.getDate() : diasNoMes;

  for (let d = 1; d <= diasNoMes; d++) {
    labels.push(d);
    const isDiaUtil = new Date(a, m, d).getDay() % 6 !== 0;

    if (isDiaUtil) metaAcumulada += metaDiaria;
    dataMetaIdeal.push(metaAcumulada);

    if (d <= diaCorte) {
      const iso = a + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      state.lancamentos.forEach(l => {
        if (l.data === iso && filialNoEscopo(l.filialId, ui.escopoAtual)) {
          acumulado += (l.valor || 0);
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
      
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(xPos, top);
      ctx.lineTo(xPos, bottom);
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#888';
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.restore();
    }
  };

  chartMetaInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Realizado',
          data: dataRealizado,
          borderColor: '#0B0B0B',
          backgroundColor: 'rgba(11,11,11,0.05)',
          borderWidth: 2,
          pointRadius: 0,
          fill: true,
          tension: 0.1
        },
        {
          label: 'Meta Ideal',
          data: dataMetaIdeal,
          borderColor: '#D60000',
          borderDash: [5, 5],
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false,
          tension: 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: c => c.dataset.label + ': ' + fmtBRL(c.parsed.y)
          }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#888', font: { size: 10 } } },
        y: { 
          beginAtZero: true, 
          grid: { color: '#f0f0f0' },
          ticks: { color: '#888', font: { size: 10 }, callback: v => 'R$ ' + (v/1000).toFixed(0) + 'k' } 
        }
      }
    },
    plugins: [linhaHojePlugin]
  });
}

// ============================================================
// TABELA EQUIPE
// ============================================================

function renderTabelaEquipe(a, m, f) {
  const tbody = document.getElementById('painel-equipe-container');
  if (!tbody) return;

  let vendedores = f.dados ? f.dados.filter(d => d.vendedor.papel === 'vendedor') : [];
  vendedores.sort((x, y) => (y.pctMeta || 0) - (x.pctMeta || 0));

  if(vendedores.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px; color:#888;">Nenhum vendedor com dados neste mês.</td></tr>';
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

// ============================================================
// ATENÇÃO AGORA
// ============================================================

function renderAtencaoAgora(a, m) {
  const el = document.getElementById('painel-acoes-container');
  if (!el) return;

  let alertas = [];
  const f = calcFilial(a, m, ui.escopoAtual);
  const dadosVendedores = f.dados || [];
  
  dadosVendedores.filter(d => d.vendedor.papel === 'vendedor').forEach(d => {
    const gap = d.meta * (calcDiasUteisDecorridos(a, m) / calcDiasUteisNoMes(a, m));
    if (d.faturado < gap && d.faturado > 0) {
      const falta = gap - d.faturado;
      alertas.push({
        tipo: 'vendedor',
        titulo: d.vendedor.nome + ' está abaixo do ritmo',
        desc: `${fmtBRL(falta)} atrás do esperado. Precisa de ${fmtBRL(d.metaDia)}/dia.`,
        peso: falta
      });
    }
  });

  let clientesRisco = state.clientes
    .filter(c => filialNoEscopo(c.filialId, ui.escopoAtual) && c.diasSemComprar > 30 && c.valorMedioMensal > 5000)
    .sort((a, b) => b.valorMedioMensal - a.valorMedioMensal)
    .slice(0, 2);

  clientesRisco.forEach(c => {
    alertas.push({
      tipo: 'cliente',
      titulo: c.nome,
      desc: `${c.diasSemComprar} dias sem comprar. Valor: ${fmtBRL(c.valorMedioMensal)}/mês.`,
      peso: c.valorMedioMensal * 1.5
    });
  });

  alertas.sort((x, y) => y.peso - x.peso);
  alertas = alertas.slice(0, 5);

  if (alertas.length === 0) {
    el.innerHTML = '<div style="padding:32px; text-align:center; color:#888;">Tudo tranquilo no radar.</div>';
    return;
  }

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

// ============================================================
// FUNÇÕES DE IMPRESSÃO (Restauradas para não quebrar o app)
// ============================================================

export function imprimirHTML(titulo, subtitulo, corpoHTML) {
  const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' +
    escapeHtml(titulo) + '</title><style>' +
    'body{font-family:system-ui,sans-serif;color:#0f172a;font-size:11px;padding:16px;line-height:1.4}' +
    'h1{font-size:16px;color:#dc2626;margin-bottom:2px}' +
    '.sub{font-size:10px;color:#64748b;margin-bottom:14px;border-bottom:1px solid #e2e8f0;padding-bottom:8px}' +
    'table{width:100%;border-collapse:collapse;font-size:10px;margin-top:10px}' +
    'th{background:#e2e8f0;text-align:left;padding:5px 6px;font-weight:700;border-bottom:1px solid #94a3b8}' +
    'td{padding:4px 6px;border-bottom:1px solid #e2e8f0}' +
    'tr:nth-child(even) td{background:#f8fafc}.num{text-align:right}' +
    '.rodape{margin-top:16px;font-size:9px;color:#94a3b8;text-align:center;border-top:1px solid #e2e8f0;padding-top:6px}' +
    '@media print{body{padding:8px}tr{page-break-inside:avoid}}' +
    '</style></head><body>';

  const sub = escapeHtml(subtitulo) + ' · ' + new Date().toLocaleString('pt-BR') +
    ' · ' + escapeHtml(escopoNome(ui.escopoAtual));

  const blob = new Blob(
    [html + '<h1>Alta Fix — ' + escapeHtml(titulo) + '</h1><div class="sub">' + sub + '</div>' +
      corpoHTML + '<div class="rodape">Gerado pelo Alta Fix</div></body></html>'],
    { type: 'text/html' }
  );

  const url = URL.createObjectURL(blob);
  const w = window.open(url, '_blank');
  if (!w) {
    URL.revokeObjectURL(url);
    toast('⚠ Bloqueador de pop-up ativo.');
    return;
  }
  w.focus();
  setTimeout(() => {
    try { w.print(); } catch (e) {}
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }, 400);
}

export function renderFilaHoje() {
  const el = document.getElementById('fila-hoje-container');
  if(el) el.innerHTML = '<p>Em breve: Lista de ligações integrada.</p>';
}

export function renderEquipe() {
  const el = document.getElementById('equipe-cards-container');
  if(el) el.innerHTML = '<p>Em breve: Cards de vendedores.</p>';
}