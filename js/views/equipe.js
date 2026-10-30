// ============================================================
// views/equipe.js — Cards e Ficha do Vendedor (1:1)
// ============================================================

import { state, ui } from '../state.js';
import { fmtBRL, escapeHtml, diffDias, isoDate, toast, abrirWhatsApp, normalizarNomeCliente } from '../utils.js';
import { calcVendedor, mesRefAtual, filialNoEscopo, comparativoNoEscopo } from '../calc.js';
import { calcularDiagnosticoMoM } from '../calc_diagnostico.js';

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
  const mesRefStr = hj.slice(0, 7); // Mês atual (YYYY-MM)
  const diag = calcularDiagnosticoMoM(v.id, mesRefStr);

  let htmlDiag = '<div style="color:#888; padding:20px;">Sem dados para este mês.</div>';
  let htmlAcoes = '';
  let htmlAlertas = '';
  
  if (diag && !diag.semBase) {
    const sumCairam = diag.cairam.reduce((s, c) => s + c.delta, 0);
    const sumCresceram = diag.cresceram.reduce((s, c) => s + c.delta, 0);
    
    // 1. Alertas (Dependência, etc)
    if (diag.alertas && diag.alertas.length > 0) {
      htmlAlertas = diag.alertas.filter(a => a.tipo !== 'success').map(a => {
        const bg = a.tipo === 'danger' ? '#FEE2E2' : '#FEF3C7';
        const cor = a.tipo === 'danger' ? '#991b1b' : '#92400e';
        return `<div style="background:${bg}; color:${cor}; padding:10px; border-radius:6px; font-size:11px; font-weight:600; margin-bottom:8px; display:flex; gap:6px;">
          <span>${a.tipo === 'danger' ? '🚨' : '⚠️'}</span> <span>${a.msg}</span>
        </div>`;
      }).join('');
    }

    // 2. Resumo MoM (Barras horizontais em mini-cards)
    htmlDiag = `
      <div style="display:flex; gap:12px; align-items:center; margin-bottom:16px;">
        <span class="badge ${diag.variacaoPct >= 0 ? 'ok' : 'danger'}" style="font-size:12px; padding:6px 10px;">
          ${diag.variacaoPct > 0 ? '▲' : '▼'} ${Math.abs(diag.variacaoPct).toFixed(1)}% vs Mês Anterior
        </span>
        <span style="font-size:12px; color:var(--af-t2);">Realizado: <strong>${fmtBRL(diag.totalAt)}</strong></span>
      </div>
      <div style="display:flex; flex-direction:column; gap:8px;">
        <div style="display:flex; justify-content:space-between; background:#FEE2E2; padding:8px 12px; border-radius:4px; border-left:3px solid #dc2626;">
          <span style="font-size:12px; color:#991b1b; font-weight:600;">Perdidos</span>
          <strong style="color:#991b1b;">${fmtBRL(diag.impPerdidos)}</strong>
        </div>
        <div style="display:flex; justify-content:space-between; background:#FEE2E2; padding:8px 12px; border-radius:4px; border-left:3px solid #ef4444;">
          <span style="font-size:12px; color:#991b1b; font-weight:600;">Queda</span>
          <strong style="color:#991b1b;">${fmtBRL(sumCairam)}</strong>
        </div>
        <div style="display:flex; justify-content:space-between; background:#DCFCE7; padding:8px 12px; border-radius:4px; border-left:3px solid #16a34a;">
          <span style="font-size:12px; color:#166534; font-weight:600;">Novos</span>
          <strong style="color:#166534;">${fmtBRL(diag.impNovos)}</strong>
        </div>
        <div style="display:flex; justify-content:space-between; background:#DCFCE7; padding:8px 12px; border-radius:4px; border-left:3px solid #22c55e;">
          <span style="font-size:12px; color:#166534; font-weight:600;">Aumento</span>
          <strong style="color:#166534;">${fmtBRL(sumCresceram)}</strong>
        </div>
      </div>
    `;

    // 3. Ações (Top 5 Quedas)
    const topQuedas = [...diag.perdidos, ...diag.cairam]
      .filter(c => c.nome !== 'Outros / Sem Cadastro')
      .sort((a,b) => a.delta - b.delta)
      .slice(0, 5);

    htmlAcoes = topQuedas.length === 0 
      ? '<div style="padding:16px; text-align:center; color:#888; font-size:12px;">Nenhuma queda crítica.</div>' 
      : topQuedas.map(c => {
          const tel = obterTelefoneCliente(c.nome);
          const btnZap = tel ? `<button class="btn btn-sm" style="background:#25D366;color:#fff;border-color:#25D366;padding:4px 8px;font-size:10px;" onclick="window._abrirWhatsApp('${tel}', '${escapeHtml(c.nome)}', '${escapeHtml(v.nome)}')">Zap</button>` : '';
          return `
          <div class="ficha-lista-item" style="padding: 10px 12px;">
            <div style="overflow:hidden;">
              <div class="nome" style="font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(c.nome)}</div>
              <div class="detalhe">${c.valorAtual === 0 ? 'Saiu' : 'Caiu'} (${fmtBRL(c.valorAnterior)} → ${fmtBRL(c.valorAtual)})</div>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
              <div class="valor" style="color:var(--af-vermelho); font-size:12px;">${fmtBRL(c.delta)}</div>
              ${btnZap}
            </div>
          </div>
        `}).join('');
  }

  const notaSalva = localStorage.getItem('nota_1a1_' + v.id) || '';

  let html = `
    <div class="ficha-header" style="padding: 16px 24px;">
      <div>
        <h2 style="font-size:20px;">${escapeHtml(v.nome)}</h2>
        <p style="font-size:12px;">Ficha de desempenho · Reunião 1:1</p>
      </div>
      <button class="btn btn-sm" onclick="document.getElementById('ficha-vendedor-modal').classList.remove('show')">Fechar</button>
    </div>

    <div class="ficha-body" style="padding: 20px 24px; display: flex; flex-direction: column; gap: 20px; height: calc(100% - 70px);">
      
      <!-- Linha de Alertas -->
      ${htmlAlertas ? `<div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">${htmlAlertas}</div>` : ''}

      <!-- Grid de 3 Colunas -->
      <div style="display: grid; grid-template-columns: 1fr 1.2fr 1fr; gap: 24px; flex: 1; min-height: 0;">
        
        <!-- Coluna 1: Diagnóstico -->
        <div style="display:flex; flex-direction:column;">
          <div style="font-size:13px; font-weight:700; color:var(--af-t1); margin-bottom:12px;">📊 Resumo do Mês</div>
          <div style="background:#F8FAFC; border:1px solid #E2E8F0; border-radius:8px; padding:16px; flex:1;">
            ${htmlDiag}
          </div>
        </div>

        <!-- Coluna 2: Ação (Top Quedas) -->
        <div style="display:flex; flex-direction:column; min-height: 0;">
          <div style="font-size:13px; font-weight:700; color:var(--af-vermelho); margin-bottom:12px;">🚨 Prioridade de Ligação</div>
          <div class="ficha-lista" style="flex:1; overflow-y:auto;">
            ${htmlAcoes}
          </div>
        </div>

        <!-- Coluna 3: Diário de Bordo -->
        <div style="display:flex; flex-direction:column;">
          <div style="font-size:13px; font-weight:700; color:var(--af-t1); margin-bottom:12px;">📝 Diário de Bordo 1:1</div>
          <textarea id="ficha-notas-1a1" style="flex:1; width:100%; padding:12px; border:1px solid var(--af-borda-forte); border-radius:6px; font-family:inherit; font-size:13px; resize:none;" placeholder="O que foi conversado? Quais os compromissos acordados?">${escapeHtml(notaSalva)}</textarea>
          <button class="btn btn-primary" style="margin-top:12px; width:100%;" onclick="window._salvarNota1a1('${v.id}')">Salvar Anotações</button>
        </div>

      </div>
    </div>
  `;

  let modal = document.getElementById('ficha-vendedor-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'ficha-vendedor-modal';
    modal.className = 'modal modal-ficha';
    modal.innerHTML = '<div class="modal-content" style="max-width:1200px; height:85vh; display:flex; flex-direction:column; overflow:hidden;"></div>'; // Fixa altura e esconde scroll externo
    document.body.appendChild(modal);
  }
  modal.querySelector('.modal-content').innerHTML = html;
  modal.classList.add('show');
  modal.onclick = e => { if (e.target.id === 'ficha-vendedor-modal') modal.classList.remove('show'); };

  window._salvarNota1a1 = (vId) => {
    const txt = document.getElementById('ficha-notas-1a1').value;
    localStorage.setItem('nota_1a1_' + vId, txt);
    toast('✓ Anotações salvas!');
  };
};

function obterTelefoneCliente(nomeCliente) {
  const norm = normalizarNomeCliente(nomeCliente);
  const ligs = state.ligacoes.filter(l => normalizarNomeCliente(l.empresa) === norm && l.telefone);
  if (ligs.length > 0) {
    ligs.sort((a, b) => (b.data || '').localeCompare(a.data || ''));
    return ligs[0].telefone;
  }
  return null;
}