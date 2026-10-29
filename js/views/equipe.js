// ============================================================
// views/equipe.js — Cards e Ficha do Vendedor (Histórico)
// ============================================================

import { state, ui } from '../state.js';
import { fmtBRL, escapeHtml, diffDias, isoDate } from '../utils.js';
import { calcVendedor, mesRefAtual, filialNoEscopo, comparativoNoEscopo } from '../calc.js';

let chartFichaInstance = null;

export function renderEquipe() {
  const container = document.getElementById('equipe-cards-container');
  if (!container) return;

  const ref = mesRefAtual(ui.escopoAtual);
  const a = ref.ano, m = ref.mes;
  const prefix = a + '-' + String(m + 1).padStart(2, '0');
  const hj = isoDate(new Date());

  let vendedores = state.vendedores.filter(v => v.ativo && v.papel === 'vendedor' && filialNoEscopo(v.filialId, ui.escopoAtual));
  if (ui.modoVendedor) vendedores = vendedores.filter(v => v.id === ui.modoVendedor);

  if (vendedores.length === 0) {
    container.innerHTML = '<div style="padding:24px; color:#888;">Nenhum vendedor ativo.</div>';
    return;
  }

  const dadosVendedores = vendedores.map(v => {
    const calc = calcVendedor(v, a, m);
    const clientes = state.clientes.filter(c => c.vendedor === v.id);
    const ativos = clientes.filter(c => c.ultimaCompra && diffDias(c.ultimaCompra, hj) < 30).length;
    const emRisco = clientes.filter(c => {
      if (!c.ultimaCompra) return false;
      const d = diffDias(c.ultimaCompra, hj);
      return d >= 30 && d <= 180;
    }).length;
    const ligacoes = (state.ligacoes || []).filter(l => l.vendedor === v.id && l.data && l.data.startsWith(prefix)).length;
    return { v, calc, carteiraTotal: clientes.length, ativos, emRisco, ligacoes };
  });

  dadosVendedores.sort((x, y) => (x.calc.pctMeta || 0) - (y.calc.pctMeta || 0));

  container.innerHTML = dadosVendedores.map(d => {
    const pct = d.calc.pctMeta || 0;
    const isAbaixo = d.calc.faturado < d.calc.ritmoEsperado;
    let statusBadge = '<span class="badge ok">No ritmo</span>';
    if (pct === 0) statusBadge = '<span class="badge neutral">Sem dados</span>';
    else if (isAbaixo) statusBadge = '<span class="badge danger">Abaixo</span>';
    const barraCls = isAbaixo ? 'vermelho' : 'verde';
    const iniciais = d.v.nome.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();

    return `
      <div class="card-vendedor" onclick="window._abrirFichaVendedor('${d.v.id}')" style="cursor:pointer; transition: transform 0.1s;" onmouseover="this.style.transform='scale(1.01)'" onmouseout="this.style.transform='scale(1)'">
        <div class="cv-header">
          <div style="display:flex; align-items:center;"><div class="cv-avatar">${iniciais}</div><div class="cv-nome">${escapeHtml(d.v.nome)}</div></div>
          ${statusBadge}
        </div>
        <div class="cv-fat">${fmtBRL(d.calc.faturado)}</div>
        <div class="cv-meta-txt">${pct.toFixed(0)}% de ${fmtBRL(d.calc.meta)}</div>
        <div class="tabela-barra-bg" style="height:6px; margin-bottom: 24px;">
          <div class="tabela-barra-fill ${barraCls}" style="width: ${Math.min(100, pct)}%"></div>
        </div>
        <div class="cv-stats">
          <div><div class="cv-stat-l">CARTEIRA</div><div class="cv-stat-v">${d.carteiraTotal}</div></div>
          <div><div class="cv-stat-l">ATIVOS</div><div class="cv-stat-v">${d.ativos}</div></div>
          <div><div class="cv-stat-l">EM RISCO</div><div class="cv-stat-v" style="${d.emRisco > 0 ? 'color:var(--af-vermelho)' : ''}">${d.emRisco}</div></div>
          <div><div class="cv-stat-l">LIGAÇÕES</div><div class="cv-stat-v">${d.ligacoes}</div></div>
        </div>
      </div>
    `;
  }).join('');
}

window._abrirFichaVendedor = function(vendedorId) {
  const v = state.vendedores.find(x => x.id === vendedorId);
  if (!v) return;

  const comp = comparativoNoEscopo(ui.escopoAtual);
  let hist25 = [], hist26 = [];
  const labels = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  
  let tot25 = 0, tot26 = 0, ped25 = 0, ped26 = 0;

  labels.forEach(mes => {
    const mComp = comp.find(c => c.mes.toLowerCase().startsWith(mes.toLowerCase()));
    let f25 = 0, f26 = 0, p25 = 0, p26 = 0;
    if (mComp && mComp.vendedores) {
      const vd = mComp.vendedores[v.nome.toUpperCase()];
      if (vd) {
        f25 = vd.fat2025 || 0; f26 = vd.fat2026 || 0;
        p25 = vd.ped2025 || 0; p26 = vd.ped2026 || 0;
      }
    }
    hist25.push(f25); hist26.push(f26);
    tot25 += f25; tot26 += f26; ped25 += p25; ped26 += p26;
  });

  const crescPct = tot25 > 0 ? ((tot26 - tot25) / tot25) * 100 : null;

  let html = `
    <div class="ficha-header">
      <div>
        <h2>${escapeHtml(v.nome)}</h2>
        <p>Ficha de desempenho · Visão Histórica</p>
      </div>
      <button class="btn" onclick="document.getElementById('ficha-vendedor-modal').classList.remove('show')">Fechar</button>
    </div>
    <div class="ficha-body" style="grid-template-columns: 1fr;">
      
      <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:16px; margin-bottom:24px;">
        <div class="ficha-kpi-box">
          <div class="lbl">FATURAMENTO 2026</div>
          <div class="val">${fmtBRL(tot26)}</div>
          <div class="detalhe" style="font-size:11px; color:var(--af-verde); font-weight:600;">
            ${crescPct != null ? (crescPct > 0 ? '▲ +' : '▼ ') + crescPct.toFixed(1) + '%' : 'Sem base 2025'}
          </div>
        </div>
        <div class="ficha-kpi-box">
          <div class="lbl">FATURAMENTO 2025</div>
          <div class="val" style="color:var(--af-t3)">${fmtBRL(tot25)}</div>
        </div>
        <div class="ficha-kpi-box">
          <div class="lbl">PEDIDOS (A→B)</div>
          <div class="val">${ped25} → ${ped26}</div>
        </div>
        <div class="ficha-kpi-box">
          <div class="lbl">TICKET MÉDIO 2026</div>
          <div class="val">${fmtBRL(ped26 > 0 ? tot26/ped26 : 0)}</div>
        </div>
      </div>

      <div style="height:260px; margin-bottom:24px;">
        <canvas id="chart-ficha-evolucao"></canvas>
      </div>

      <div style="background:#FAFAFA; padding:16px; border-radius:8px; border-left:3px solid var(--af-preto); font-size:13px; color:var(--af-t2);">
        <strong>Resumo para Feedback:</strong> No período comparado, <strong>${v.nome}</strong> 
        ${crescPct > 0 ? 'cresceu' : (crescPct < 0 ? 'caiu' : 'manteve')} 
        ${crescPct != null ? Math.abs(crescPct).toFixed(1) + '%' : ''} em relação a 2025 
        (${fmtBRL(tot25)} → ${fmtBRL(tot26)}).
      </div>

    </div>
  `;

  let modal = document.getElementById('ficha-vendedor-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'ficha-vendedor-modal';
    modal.className = 'modal modal-ficha';
    modal.innerHTML = '<div class="modal-content" style="max-width:800px;"></div>';
    document.body.appendChild(modal);
  }
  modal.querySelector('.modal-content').innerHTML = html;
  modal.classList.add('show');
  modal.onclick = e => { if (e.target.id === 'ficha-vendedor-modal') modal.classList.remove('show'); };

  setTimeout(() => {
    const ctx = document.getElementById('chart-ficha-evolucao');
    if (!ctx) return;
    if (chartFichaInstance) chartFichaInstance.destroy();
    
    chartFichaInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: '2025', data: hist25, borderColor: '#D4D1CA', tension: 0.3 },
          { label: '2026', data: hist26, borderColor: '#0B0B0B', borderWidth: 2, tension: 0.3 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } },
        scales: { y: { beginAtZero: true, ticks: { callback: v => 'R$ ' + (v/1000).toFixed(0) + 'k' } } }
      }
    });
  }, 100);
};