// ============================================================
// views/equipe.js — Cards e Ficha do Vendedor (1:1)
// ============================================================

import { state, ui } from '../state.js';
import { fmtBRL, escapeHtml, diffDias, isoDate, toast } from '../utils.js';
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

  const hj = isoDate(new Date());
  const clientesDoVendedor = state.clientes.filter(c => c.vendedor === v.id);

  const topClientes = clientesDoVendedor
    .filter(c => c.ultimaCompra && diffDias(c.ultimaCompra, hj) < 30)
    .sort((a, b) => (b.valorMedioMensal || 0) - (a.valorMedioMensal || 0))
    .slice(0, 5);

  const clientesRisco = clientesDoVendedor
    .filter(c => {
      if (!c.ultimaCompra) return false;
      const d = diffDias(c.ultimaCompra, hj);
      return d >= 30 && d <= 180;
    })
    .sort((a, b) => (b.valorMedioMensal || 0) - (a.valorMedioMensal || 0))
    .slice(0, 5);

  // Recupera as anotações do 1:1 salvas
  const notaSalva = localStorage.getItem('nota_1a1_' + v.id) || '';

  let html = `
    <div class="ficha-header" style="padding-bottom:12px;">
      <div>
        <h2>${escapeHtml(v.nome)}</h2>
        <p>Ficha de desempenho · Análise 1:1</p>
      </div>
      <div style="display:flex; align-items:center; gap:12px;">
        <select id="ficha-filtro-periodo" class="select-clean" style="font-size:12px;">
          <option value="6">Últimos 6 meses</option>
          <option value="12" selected>Últimos 12 meses</option>
        </select>
        <button class="btn btn-sm" onclick="document.getElementById('ficha-vendedor-modal').classList.remove('show')">Fechar</button>
      </div>
    </div>

    <div class="ficha-body" style="padding:24px; display:block;">
      
      <div style="height:240px; margin-bottom:24px;">
        <canvas id="chart-ficha-evolucao"></canvas>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:24px; margin-bottom:24px;">
        
        <div>
          <div style="font-size:13px; font-weight:700; margin-bottom:12px; color:var(--af-verde);">🏆 Melhores Clientes (Ativos)</div>
          <div class="ficha-lista">
            ${topClientes.length === 0 ? '<div style="padding:16px; color:#888; font-size:12px;">Nenhum cliente ativo.</div>' : ''}
            ${topClientes.map(c => `
              <div class="ficha-lista-item">
                <div><div class="nome">${escapeHtml(c.nome)}</div><div class="detalhe">Última: ${c.ultimaCompra.split('-').reverse().join('/')}</div></div>
                <div class="valor">${fmtBRL(c.valorMedioMensal || 0)}</div>
              </div>
            `).join('')}
          </div>
        </div>

        <div>
          <div style="font-size:13px; font-weight:700; margin-bottom:12px; color:var(--af-vermelho);">⚠️ Clientes em Risco</div>
          <div class="ficha-lista">
            ${clientesRisco.length === 0 ? '<div style="padding:16px; color:#888; font-size:12px;">Tudo em ordem.</div>' : ''}
            ${clientesRisco.map(c => {
              const dias = diffDias(c.ultimaCompra, hj);
              return `
              <div class="ficha-lista-item">
                <div><div class="nome">${escapeHtml(c.nome)}</div><div class="detalhe" style="color:var(--af-vermelho);">${dias} dias parado</div></div>
                <div class="valor">${fmtBRL(c.valorMedioMensal || 0)}</div>
              </div>
            `}).join('')}
          </div>
        </div>

      </div>

      <!-- Diário de Bordo 1:1 -->
      <div style="border-top:1px solid #eee; padding-top:24px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <div style="font-size:14px; font-weight:700; color:var(--af-t1);">📝 Diário de Bordo 1:1</div>
          <span class="text-xs text-muted">Visível apenas para o gestor</span>
        </div>
        <textarea id="ficha-notas-1a1" style="width:100%; min-height:100px; padding:12px; border:1px solid var(--af-borda-forte); border-radius:6px; font-family:inherit; font-size:13px; margin-bottom:12px;" placeholder="O que foi conversado? Quais os compromissos acordados?">${escapeHtml(notaSalva)}</textarea>
        <button class="btn btn-primary" onclick="window._salvarNota1a1('${v.id}')">Salvar Anotações</button>
      </div>

    </div>
  `;

  let modal = document.getElementById('ficha-vendedor-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'ficha-vendedor-modal';
    modal.className = 'modal modal-ficha';
    modal.innerHTML = '<div class="modal-content" style="max-width:900px;"></div>';
    document.body.appendChild(modal);
  }
  modal.querySelector('.modal-content').innerHTML = html;
  modal.classList.add('show');
  modal.onclick = e => { if (e.target.id === 'ficha-vendedor-modal') modal.classList.remove('show'); };

  // Função para salvar a nota
  window._salvarNota1a1 = (vId) => {
    const txt = document.getElementById('ficha-notas-1a1').value;
    localStorage.setItem('nota_1a1_' + vId, txt);
    toast('✓ Anotações salvas!');
  };

  const renderGrafico = (mesesQtd) => {
    const ctx = document.getElementById('chart-ficha-evolucao');
    if (!ctx) return;
    if (chartFichaInstance) chartFichaInstance.destroy();

    const comp = comparativoNoEscopo(ui.escopoAtual);
    const labels = [];
    const hist25 = [];
    const hist26 = [];
    const hjMes = new Date().getMonth();
    const anoAtual = new Date().getFullYear();

    for (let i = mesesQtd - 1; i >= 0; i--) {
      const d = new Date(anoAtual, hjMes - i, 1);
      const mIdx = d.getMonth();
      const mAno = d.getFullYear();
      const mNome = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][mIdx];
      labels.push(mNome);

      const mComp = comp.find(c => c.mes.toLowerCase().startsWith(mNome.toLowerCase()));
      let f25 = 0;
      if (mComp && mComp.vendedores && mComp.vendedores[v.nome.toUpperCase()]) {
        f25 = mComp.vendedores[v.nome.toUpperCase()].fat2025 || 0;
      }
      hist25.push(f25);

      let f26 = 0;
      const prefix = mAno + '-' + String(mIdx + 1).padStart(2, '0');
      state.lancamentos.forEach(l => {
        if (l.vendedor === v.id && l.data.indexOf(prefix) === 0) f26 += (l.valor || 0);
      });
      hist26.push(f26);
    }

    chartFichaInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: '2025', data: hist25, borderColor: '#D4D1CA', borderWidth: 2, tension: 0.3 },
          { label: '2026', data: hist26, borderColor: '#0B0B0B', borderWidth: 3, tension: 0.3 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } },
        scales: { y: { beginAtZero: true, ticks: { callback: val => 'R$ ' + (val/1000).toFixed(0) + 'k' } } }
      }
    });
  };

  setTimeout(() => {
    renderGrafico(12);
    document.getElementById('ficha-filtro-periodo').onchange = (e) => renderGrafico(parseInt(e.target.value, 10));
  }, 100);
};