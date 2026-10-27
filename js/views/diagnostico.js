// js/views/diagnostico.js
import { state, ui } from '../state.js';
import { fmtBRL } from '../utils.js';
import { calcularDiagnostico } from '../calc_diagnostico.js';

let chartWaterfallInstance = null;

export function renderDiagnostico() {
  const selMes = document.getElementById('diag-mes');
  const selVendedor = document.getElementById('diag-vendedor');
  
  if (!selMes || !selVendedor) return;

  // Popula Vendedores se estiver vazio
  if (selVendedor.options.length <= 1) {
    const vendedores = state.vendedores.filter(v => v.ativo && v.papel !== 'admin' && v.papel !== 'ex');
    vendedores.forEach(v => {
      selVendedor.innerHTML += `<option value="${v.id}">${v.nome}</option>`;
    });
  }

  const mesRef = selMes.value;
  const vendId = selVendedor.value;

  const conteudo = document.getElementById('diag-conteudo');

  if (!mesRef || !vendId) {
    conteudo.style.display = 'none';
    return;
  }

  conteudo.style.display = 'block';

  const dados = calcularDiagnostico(vendId, mesRef);
  if (!dados) return;

  // 1. Renderiza Health Score
  const hsEl = document.getElementById('diag-health-score');
  const hsWrap = document.getElementById('diag-health-circle');
  hsEl.textContent = dados.healthScore;
  
  // Define a cor baseada na nota
  const scoreColor = dados.healthScore > 70 ? '#16a34a' : dados.healthScore > 40 ? '#f59e0b' : '#dc2626';
  hsWrap.style.background = `conic-gradient(${scoreColor} ${dados.healthScore}%, #e2e8f0 0)`;
  
  const desc = document.getElementById('diag-health-desc');
  desc.textContent = dados.healthScore > 70 
    ? 'Alta performance e retenção de clientes.' 
    : dados.healthScore > 40
      ? 'Atenção aos indicadores de conversão.'
      : 'Risco crítico. Necessita intervenção imediata.';

  // 2. Renderiza Forecast
  document.getElementById('diag-forecast-valor').textContent = fmtBRL(dados.forecast);
  document.getElementById('diag-forecast-meta').textContent = 'Meta: ' + fmtBRL(dados.meta);
  
  const badge = document.getElementById('diag-forecast-badge');
  const pctMeta = dados.meta > 0 ? (dados.forecast / dados.meta) * 100 : 0;
  
  badge.textContent = Math.round(pctMeta) + '% da meta';
  badge.style.background = pctMeta >= 100 ? '#dcfce7' : pctMeta >= 80 ? '#fef3c7' : '#fee2e2';
  badge.style.color = pctMeta >= 100 ? '#166534' : pctMeta >= 80 ? '#92400e' : '#991b1b';

  // 3. Renderiza Alertas do Gestor
  const alertBox = document.getElementById('diag-alertas');
  alertBox.innerHTML = dados.alertas.map(a => {
    const bg = a.tipo === 'danger' ? '#fee2e2' : a.tipo === 'warning' ? '#fef3c7' : '#dcfce7';
    const color = a.tipo === 'danger' ? '#991b1b' : a.tipo === 'warning' ? '#92400e' : '#166534';
    const icon = a.tipo === 'danger' ? '🚨' : a.tipo === 'warning' ? '🟡' : '🟢';
    return `<div style="background:${bg}; color:${color}; padding:10px; border-radius:6px; font-size:12px; font-weight:600; display:flex; gap:8px; align-items:flex-start;">
      <span style="font-size:16px; line-height:1;">${icon}</span> 
      <span style="line-height:1.4;">${a.msg}</span>
    </div>`;
  }).join('');

  // 4. Renderiza Tabela de Prioridades
  const tbody = document.getElementById('tbody-diag-prioridades');
  if (dados.prioridades.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#16a34a; padding: 20px; font-weight:600;">🎉 Carteira 100% ativa. Bom trabalho!</td></tr>';
  } else {
    tbody.innerHTML = dados.prioridades.map(c => `
      <tr>
        <td data-label="Cliente"><strong>${c.nome}</strong></td>
        <td class="num" data-label="Vale/mês">${fmtBRL(c.valorMedioMensal)}</td>
        <td class="num" data-label="Dias" style="color:${c.diasSemComprar > 90 ? '#dc2626' : '#f59e0b'}; font-weight:bold;">${c.diasSemComprar}d</td>
        <td data-label="Status"><span class="badge badge-risco">EM RISCO</span></td>
        <td data-label="Ação"><span style="font-size:12px; color:#475569;">${c.acao}</span></td>
      </tr>
    `).join('');
  }

  // 5. Renderiza Gráfico Waterfall
  renderWaterfall(dados);
}

function renderWaterfall(dados) {
  const ctx = document.getElementById('chart-waterfall');
  if (!ctx) return;

  if (chartWaterfallInstance) chartWaterfallInstance.destroy();

  const w = dados.waterfall;
  const fatAnterior = dados.aggPassado.fat;
  
  let acumulado = fatAnterior;
  const labels = ['Mês Anterior', 'Novos/Reativados', 'Perdidos', 'Var. Ticket', 'Mês Atual'];
  
  // Cálculo da cascata [base, topo]
  const data = [
    [0, fatAnterior],
    [acumulado, acumulado + w.impactoNovos],
    [acumulado + w.impactoNovos, acumulado + w.impactoNovos + w.impactoPerdidos],
    [acumulado + w.impactoNovos + w.impactoPerdidos, acumulado + w.impactoNovos + w.impactoPerdidos + w.impactoRecorrentes],
    [0, dados.aggAtual.fat]
  ];

  // Cores: Base/Azul Escuro, Positivo/Verde, Negativo/Vermelho, Final/Azul Escuro
  const bgColors = [
    '#94a3b8', 
    '#16a34a', 
    '#dc2626', 
    w.impactoRecorrentes > 0 ? '#16a34a' : '#dc2626', 
    '#0f172a'
  ];

  // Plugin customizado para desenhar as linhas pontilhadas entre as barras
  const waterfallLines = {
    id: 'waterfallLines',
    afterDatasetsDraw(chart) {
      const { ctx, scales: { y } } = chart;
      const meta = chart.getDatasetMeta(0);
      ctx.save();
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]); // Linha pontilhada

      for (let i = 0; i < meta.data.length - 1; i++) {
        const bar1 = meta.data[i];
        const bar2 = meta.data[i + 1];
        if (!bar1 || !bar2) continue;

        // O ponto de conexão é o topo/base da barra atual (que é o início da próxima)
        const rawDataNext = chart.data.datasets[0].data[i + 1];
        const connectValue = rawDataNext[0];
        const yPos = y.getPixelForValue(connectValue);

        ctx.beginPath();
        ctx.moveTo(bar1.x + bar1.width / 2, yPos);
        ctx.lineTo(bar2.x - bar2.width / 2, yPos);
        ctx.stroke();
      }
      ctx.restore();
    }
  };

  chartWaterfallInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: bgColors,
        borderWidth: 0,
        borderRadius: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 20 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(context) {
              const v = context.raw;
              const diff = v[1] - v[0];
              if (context.dataIndex === 0 || context.dataIndex === 4) return 'Total: ' + fmtBRL(v[1]);
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
          display: true, // Eixo Y visível
          beginAtZero: true,
          ticks: {
            color: '#64748b',
            font: { size: 10 },
            callback: function(value) {
              if (value === 0) return '0';
              return 'R$ ' + (value / 1000).toFixed(0) + 'k'; // Formata pra "R$ 50k"
            }
          },
          grid: {
            color: '#f1f5f9',
            drawBorder: false
          }
        }
      }
    },
    plugins: [waterfallLines] // Ativando o plugin das linhas
  });
}