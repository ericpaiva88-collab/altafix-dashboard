// ============================================================
// views/produtos.js — Visão de Produtos (Cockpit)
// ============================================================

import { state, ui } from '../state.js';
import { fmtBRL, fmtNum, escapeHtml, ehProdutoValido } from '../utils.js';
import { produtosNoEscopo } from '../calc.js';

export function renderProdutos() {
  const kpisEl = document.getElementById('produtos-kpis');
  const tbody = document.getElementById('tbody-produtos');
  const countEl = document.getElementById('produtos-count');
  if (!tbody) return;

  // Base de produtos
  let produtos = produtosNoEscopo(ui.escopoAtual).filter(ehProdutoValido);

  // Popula o select de fabricantes (só se estiver vazio)
  const selFab = document.getElementById('filtro-produto-fabricante');
  if (selFab && selFab.options.length <= 1) {
    const fabricantes = new Set();
    produtos.forEach(p => { if (p.fabricante) fabricantes.add(p.fabricante); });
    
    let opts = '<option value="">Todos fabricantes</option>';
    Array.from(fabricantes).sort().forEach(f => {
      opts += `<option value="${escapeHtml(f)}">${escapeHtml(f)}</option>`;
    });
    selFab.innerHTML = opts;
  }

  // Pega os valores dos filtros
  const fBusca = (document.getElementById('filtro-produto-busca')?.value || '').toUpperCase();
  const fCurva = document.getElementById('filtro-produto-curva')?.value || 'TODAS';
  const fFab = selFab?.value || '';

  // --- KPIs ---
  const cA = produtos.filter(p => (p.curva || p.curvaOficial) === 'A');
  const cB = produtos.filter(p => (p.curva || p.curvaOficial) === 'B');
  const cC = produtos.filter(p => (p.curva || p.curvaOficial) === 'C');
  
  const faturamentoTotal = produtos.reduce((s, p) => s + (p.valorVendido || 0), 0);
  
  // Verifica produtos abaixo do estoque mínimo
  const abaixoMinimo = produtos.filter(p => 
    p.estoqueAtual != null && p.estoqueMinimo != null && p.estoqueAtual <= p.estoqueMinimo
  ).length;

  kpisEl.innerHTML = `
    <div class="kpi-card">
      <div class="kpi-header">TOTAL DE PRODUTOS</div>
      <div class="kpi-value">${produtos.length}</div>
      <div class="kpi-hint">${cA.length} na Curva A</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-header">FATURAMENTO</div>
      <div class="kpi-value">${fmtBRL(faturamentoTotal)}</div>
      <div class="kpi-hint">Acumulado no período</div>
    </div>
    <div class="kpi-card" style="border-left:3px solid var(--af-verde);">
      <div class="kpi-header">CURVA A</div>
      <div class="kpi-value" style="color:var(--af-verde)">${cA.length}</div>
      <div class="kpi-hint">Produtos de alto giro</div>
    </div>
    <div class="kpi-card" style="border-left:3px solid var(--af-vermelho);">
      <div class="kpi-header">ABAIXO DO MÍNIMO</div>
      <div class="kpi-value" style="color:var(--af-vermelho)">${abaixoMinimo}</div>
      <div class="kpi-hint">Precisam de reposição</div>
    </div>
  `;

  // --- FILTROS DA TABELA ---
  const filtrados = produtos.filter(p => {
    const curva = p.curva || p.curvaOficial || 'C';
    
    if (fCurva !== 'TODAS' && curva !== fCurva) return false;
    if (fFab && p.fabricante !== fFab) return false;
    if (fBusca) {
      const alvo = (p.codigo + ' ' + p.descricao).toUpperCase();
      if (!alvo.includes(fBusca)) return false;
    }
    return true;
  });

  // Ordena pelo maior faturamento
  filtrados.sort((a, b) => (b.valorVendido || 0) - (a.valorVendido || 0));

  if (countEl) countEl.textContent = filtrados.length + ' itens';

  if (filtrados.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:32px; color:#888;">Nenhum produto encontrado com esses filtros.</td></tr>';
    return;
  }

  // --- RENDERIZA TABELA ---
  tbody.innerHTML = filtrados.slice(0, 500).map(p => {
    const curva = p.curva || p.curvaOficial || 'C';
    let curvaBadge = '<span class="badge neutral">C</span>';
    if (curva === 'A') curvaBadge = '<span class="badge ok">A</span>';
    else if (curva === 'B') curvaBadge = '<span class="badge warn">B</span>';

    const estoque = p.estoqueAtual != null ? fmtNum(p.estoqueAtual, 0) : '—';
    const minimo = p.estoqueMinimo != null ? fmtNum(p.estoqueMinimo, 0) : '—';
    
    // Alerta de estoque vermelho
    const estoqueStyle = (p.estoqueAtual != null && p.estoqueMinimo != null && p.estoqueAtual <= p.estoqueMinimo)
      ? 'color: var(--af-vermelho); font-weight: 700;'
      : '';

    return `
      <tr>
        <td>${curvaBadge}</td>
        <td style="color:var(--af-t2);">${escapeHtml(p.codigo || '—')}</td>
        <td><strong>${escapeHtml(p.descricao)}</strong></td>
        <td style="font-size:12px; color:var(--af-t2);">${escapeHtml(p.fabricante || '—')}</td>
        <td class="num">${fmtNum(p.qtdVendida, 0)}</td>
        <td class="num"><strong>${fmtBRL(p.valorVendido)}</strong></td>
        <td class="num" style="${estoqueStyle}">${estoque}</td>
        <td class="num" style="color:var(--af-t3);">${minimo}</td>
      </tr>
    `;
  }).join('');
}