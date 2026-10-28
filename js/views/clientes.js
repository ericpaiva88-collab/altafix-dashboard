// ============================================================
// views/clientes.js — Visão de Clientes (Cockpit v3)
// ============================================================

import { state, ui } from '../state.js';
import { fmtBRL, escapeHtml, diffDias } from '../utils.js';
import { clientesNoEscopo, calcRFMScores, calcABCClientes } from '../calc.js';

export function renderClientes() {
  const kpisEl = document.getElementById('clientes-kpis');
  const tbody = document.getElementById('tbody-clientes');
  const countEl = document.getElementById('clientes-count');
  if (!tbody) return;

  // Popula o select de vendedor (só se estiver vazio)
  const selVend = document.getElementById('filtro-cliente-vend');
  if (selVend && selVend.options.length <= 1) {
    let opts = '<option value="">Todos vendedores</option>';
    state.vendedores.filter(v => v.ativo && v.papel === 'vendedor').forEach(v => {
      opts += `<option value="${v.id}">${escapeHtml(v.nome)}</option>`;
    });
    selVend.innerHTML = opts;
  }

  // Pega os valores dos filtros
  const fBusca = (document.getElementById('filtro-cliente-busca')?.value || '').toUpperCase();
  const fVend = selVend?.value || ui.modoVendedor || '';
  const fStatus = document.getElementById('filtro-cliente-status')?.value || 'todos';

  // Base de clientes
  let clientes = clientesNoEscopo(ui.escopoAtual);
  
  // Calcula RFM e ABC sobre todos
  calcRFMScores(clientes);
  calcABCClientes(clientes);

  // --- KPIs ---
  const ativos = clientes.filter(c => (c.diasSemComprar || 9999) < 30);
  const emRisco = clientes.filter(c => (c.diasSemComprar || 9999) >= 30 && (c.diasSemComprar || 9999) < 180);
  const perdidos = clientes.filter(c => (c.diasSemComprar || 9999) >= 180);
  
  const valorCarteiraAtiva = ativos.reduce((s, c) => s + (c.valorMedioMensal || 0), 0);
  const valorEmRisco = emRisco.reduce((s, c) => s + (c.valorMedioMensal || 0), 0);

  kpisEl.innerHTML = `
    <div class="kpi-card">
      <div class="kpi-header">CARTEIRA</div>
      <div class="kpi-value">${clientes.length}</div>
      <div class="kpi-hint">${ativos.length} ativos (30d)</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-header">VALOR/MÊS DOS ATIVOS</div>
      <div class="kpi-value">${fmtBRL(valorCarteiraAtiva)}</div>
      <div class="kpi-hint">Soma dos clientes ativos</div>
    </div>
    <div class="kpi-card" style="border-left:3px solid var(--af-amarelo);">
      <div class="kpi-header">EM RISCO (30-180D)</div>
      <div class="kpi-value" style="color:var(--af-amarelo)">${emRisco.length}</div>
      <div class="kpi-hint">${fmtBRL(valorEmRisco)}/mês em jogo</div>
    </div>
    <div class="kpi-card" style="border-left:3px solid #888;">
      <div class="kpi-header">PERDIDOS (180D+)</div>
      <div class="kpi-value">${perdidos.length}</div>
      <div class="kpi-hint">Fora do radar de recompra</div>
    </div>
  `;

  // --- FILTROS DA TABELA ---
  const filtrados = clientes.filter(c => {
    if (fVend && c.vendedor !== fVend) return false;
    if (fBusca) {
      const alvo = (c.nome + ' ' + (c.cidade || '')).toUpperCase();
      if (!alvo.includes(fBusca)) return false;
    }
    if (fStatus === 'ativos' && (c.diasSemComprar || 9999) >= 30) return false;
    if (fStatus === 'inativos' && (c.diasSemComprar || 9999) < 30) return false;
    if (fStatus === 'criticos' && (c.diasSemComprar || 9999) < 90) return false;
    if (fStatus === 'sem-vendedor' && c.vendedor) return false;
    return true;
  });

  // Ordena pelo maior valor mensal
  filtrados.sort((a, b) => (b.valorMedioMensal || 0) - (a.valorMedioMensal || 0));

  if (countEl) countEl.textContent = filtrados.length + ' clientes';

  if (filtrados.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:32px; color:#888;">Nenhum cliente encontrado com esses filtros.</td></tr>';
    return;
  }

  // --- RENDERIZA TABELA ---
  tbody.innerHTML = filtrados.slice(0, 500).map(c => {
    const v = state.vendedores.find(x => x.id === c.vendedor);
    
    let situacaoBadge = '<span class="badge ok">Ativo</span>';
    if (c.diasSemComprar >= 180) situacaoBadge = '<span class="badge neutral">Perdido</span>';
    else if (c.diasSemComprar >= 90) situacaoBadge = '<span class="badge danger">Crítico</span>';
    else if (c.diasSemComprar >= 30) situacaoBadge = '<span class="badge warn">Inativo</span>';

    const ultimaTxt = c.ultimaCompra ? c.ultimaCompra.split('-').reverse().join('/') : '—';
    const diasTxt = c.diasSemComprar < 9999 ? `(${c.diasSemComprar}d)` : '';
    const cicloTxt = c.intervaloMedio ? `${c.intervaloMedio}d` : '—';

    return `
      <tr>
        <td><strong>${escapeHtml(c.nome)}</strong></td>
        <td>${escapeHtml(c.cidade || '—')}</td>
        <td>${v ? escapeHtml(v.nome) : '<span style="color:var(--af-vermelho);">Sem vendedor</span>'}</td>
        <td>${situacaoBadge}</td>
        <td class="num" style="color:var(--af-t2); font-size:12px;">${ultimaTxt} <span style="color:var(--af-t3);">${diasTxt}</span></td>
        <td class="num" style="color:var(--af-t2); font-size:12px;">${cicloTxt}</td>
        <td class="num"><strong>${fmtBRL(c.valorMedioMensal || 0)}</strong></td>
      </tr>
    `;
  }).join('');
}