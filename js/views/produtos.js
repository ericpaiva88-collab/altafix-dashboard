// ============================================================
// views/produtos.js — Tela de Produtos (Curva ABC)
// ============================================================

import { state, ui } from '../state.js';
import {
  fmtBRL, fmtNum, fmtPct, escapeHtml, ehProdutoValido,
  deltaCellHTML, copiarTexto, normalizarNomeCliente
} from '../utils.js';
import { produtosNoEscopo } from '../calc.js';
import { imprimirHTML } from './painel.js';

// ============================================================
// CIDADES DE UM PRODUTO (clique na linha)
// ============================================================

function cidadesDoProduto(codigo, filialId) {
  const mapa = {};

  state.vendasItens.forEach(vi => {
    if (vi.produtoCodigo !== codigo) return;
    if (filialId && vi.filialId !== filialId) return;

    const cli = state.clientes.find(c =>
      normalizarNomeCliente(c.nome) === vi.clienteNorm && c.filialId === vi.filialId
    );
    const cidade = (cli && cli.cidade) || '—';

    if (!mapa[cidade]) {
      mapa[cidade] = { cidade, valor: 0, qtd: 0, numClientes: 0, clientes: {} };
    }
    mapa[cidade].valor += vi.valor;
    mapa[cidade].qtd += vi.qtd;
    mapa[cidade].clientes[vi.clienteNorm] = true;
  });

  const arr = Object.keys(mapa).map(k => {
    const x = mapa[k];
    x.numClientes = Object.keys(x.clientes).length;
    delete x.clientes;
    return x;
  });

  arr.sort((a, b) => b.valor - a.valor);
  return arr;
}

// ============================================================
// Δ% vs snapshot anterior
// ============================================================

function getDeltaProduto(codigo, valorAtual) {
  if (!state._produtosSnap || !state._produtosSnap.ts) return null;

  const ant = state._produtosSnap.produtos.find(p => p.codigo === codigo);
  if (!ant || !ant.valorVendido) return null;

  return { deltaPct: ((valorAtual - ant.valorVendido) / ant.valorVendido) * 100 };
}

// ============================================================
// RENDER PRINCIPAL
// ============================================================

export function renderProdutos() {
  const k = document.getElementById('produtos-kpis');
  const tb = document.getElementById('tbody-produtos');
  const ac_el = document.getElementById('abc-count');
  const ai_el = document.getElementById('abc-info');

  const produtosBase = produtosNoEscopo(ui.escopoAtual);

  if (produtosBase.length === 0) {
    k.innerHTML = '';
    tb.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:30px;color:#64748b;">' +
      'Importe 324 e 361.</td></tr>';
    if (ac_el) ac_el.textContent = '';
    if (ai_el) ai_el.textContent = '';
    return;
  }

  // Filtra válidos e ordena por valor
  const validos = produtosBase.filter(ehProdutoValido);
  const sorted = validos.slice().sort((a, b) => (b.valorVendido || 0) - (a.valorVendido || 0));
  const total = sorted.reduce((s, p) => s + (p.valorVendido || 0), 0);

  // Curva ABC + pct + delta
  let ac = 0;
  sorted.forEach(p => {
    if (!p.curvaOficial) {
      ac += (p.valorVendido || 0);
      const pa = total > 0 ? (ac / total) * 100 : 0;
      p.curva = pa <= 80 ? 'A' : (pa <= 95 ? 'B' : 'C');
    } else {
      p.curva = p.curvaOficial;
    }
    p.pctIndividual = total > 0 ? ((p.valorVendido / total) * 100) : 0;
    const d = getDeltaProduto(p.codigo, p.valorVendido || 0);
    p.deltaPct = d ? d.deltaPct : null;
  });

  // KPIs
  const cA = sorted.filter(p => p.curva === 'A');
  const cB = sorted.filter(p => p.curva === 'B');
  const cC = sorted.filter(p => p.curva === 'C');

  k.innerHTML =
    '<div class="kpi positivo"><div class="label">Curva A</div>' +
    '<div class="value">' + cA.length + '</div>' +
    '<div class="hint">' + fmtBRL(cA.reduce((s, p) => s + p.valorVendido, 0)) + '</div></div>' +
    '<div class="kpi"><div class="label">Curva B</div>' +
    '<div class="value">' + cB.length + '</div></div>' +
    '<div class="kpi"><div class="label">Curva C</div>' +
    '<div class="value">' + cC.length + '</div></div>';

  // Popula select de fabricantes
  popularSelectFabricantes(sorted);

  // Aplica filtros
  const lista = sorted.filter(p => {
    if (ui.filtroCurva !== 'TODAS' && p.curva !== ui.filtroCurva) return false;
    if (ui.filtroFabricante && p.fabricante !== ui.filtroFabricante) return false;
    if (ui.filtroTextoProd) {
      const t = ui.filtroTextoProd.toUpperCase();
      if (p.descricao.toUpperCase().indexOf(t) < 0 && (p.codigo || '').indexOf(t) < 0) return false;
    }
    if (ui.filtroDeltaProduto === 'up' && !(p.deltaPct != null && p.deltaPct > 0)) return false;
    if (ui.filtroDeltaProduto === 'down' && !(p.deltaPct != null && p.deltaPct < 0)) return false;
    if (ui.filtroDeltaProduto === 'strong_down' && !(p.deltaPct != null && p.deltaPct <= -20)) return false;
    if (ui.filtroDeltaProduto === 'new' && p.deltaPct != null) return false;
    return true;
  });

  // Ordena conforme sortProduto
  lista.sort((a, b) => {
    const c = ui.sortProduto.campo;
    const dir = ui.sortProduto.direcao === 'asc' ? 1 : -1;
    let va = a[c], vb = b[c];

    if (c === 'descricao' || c === 'codigo' || c === 'fabricante' || c === 'curva') {
      va = String(va || '').toUpperCase();
      vb = String(vb || '').toUpperCase();
      return (va < vb ? -1 : va > vb ? 1 : 0) * dir;
    }
    va = (va == null || isNaN(va)) ? -Infinity : Number(va);
    vb = (vb == null || isNaN(vb)) ? -Infinity : Number(vb);
    return (va - vb) * dir;
  });

  window._produtosFiltrados = lista;

  if (ac_el) ac_el.textContent = lista.length + ' de ' + sorted.length;
  if (ai_el) ai_el.textContent = 'Mostrando ' + lista.length + ' · clique na linha pra ver cidades';

  // Tabela
  renderTabela(lista);
}

// ============================================================
// SELECT DE FABRICANTES
// ============================================================

function popularSelectFabricantes(sorted) {
  const selFab = document.getElementById('filtro-fabricante');
  if (!selFab) return;

  const fabricantes = {};
  sorted.forEach(p => { if (p.fabricante) fabricantes[p.fabricante] = true; });
  const fArr = Object.keys(fabricantes).sort();

  if (selFab.options.length - 1 !== fArr.length) {
    selFab.innerHTML = '<option value="">Todos fabricantes</option>' +
      fArr.map(f => '<option value="' + escapeHtml(f) + '">' + escapeHtml(f) + '</option>').join('');
    selFab.value = ui.filtroFabricante;
  }
}

// ============================================================
// TABELA
// ============================================================

function renderTabela(lista) {
  const tb = document.getElementById('tbody-produtos');

  if (lista.length === 0) {
    tb.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:20px;color:#64748b;">' +
      'Nenhum produto.</td></tr>';
    return;
  }

  let html = '';

  lista.slice(0, 300).forEach(p => {
    const cls = p.curva === 'A' ? 'curva-A' : p.curva === 'B' ? 'curva-B' : 'curva-C';
    const expandido = ui.produtosExpandidos[p.codigo] === true;

    html += '<tr class="expansivel ' + cls + '" data-prod="' + escapeHtml(p.codigo) + '">' +
      '<td><span class="badge badge-' + p.curva + '">' + p.curva + '</span></td>' +
      '<td>' + escapeHtml(p.codigo || '—') + '</td>' +
      '<td>' + escapeHtml(p.descricao) + (expandido ? ' ▼' : ' ▶') + '</td>' +
      '<td>' + escapeHtml(p.fabricante || '—') + '</td>' +
      '<td class="num">' + fmtNum(p.qtdVendida, 0) + '</td>' +
      '<td class="num">' + fmtBRL(p.valorVendido) + '</td>' +
      '<td class="num">' + deltaCellHTML(p.deltaPct) + '</td>' +
      '<td class="num">' + fmtPct(p.pctIndividual, 2) + '</td>' +
      '<td class="num"><span style="color:#1e40af;font-weight:600;">ver</span></td></tr>';

    if (expandido) {
      const cidsProd = cidadesDoProduto(p.codigo, null);

      html += '<tr><td colspan="9" class="detalhe-produto">';

      if (cidsProd.length === 0) {
        html += '<div style="font-size:12px;color:#64748b;">' +
          'Sem dados de venda por cidade. Importe o 324 com o detalhamento atualizado.</div>';
      } else {
        const totalProd = cidsProd.reduce((s, x) => s + x.valor, 0);
        html += '<table style="width:100%;font-size:12px;"><thead><tr>' +
          '<th>Cidade</th><th class="num">Valor</th><th class="num">% do produto</th>' +
          '<th class="num">Qtd</th><th class="num">Clientes</th></tr></thead><tbody>';

        cidsProd.slice(0, 20).forEach(cid => {
          const pct = totalProd > 0 ? (cid.valor / totalProd) * 100 : 0;
          html += '<tr><td><strong>' + escapeHtml(cid.cidade) + '</strong></td>' +
            '<td class="num">' + fmtBRL(cid.valor) + '</td>' +
            '<td class="num">' + fmtPct(pct, 1) + '</td>' +
            '<td class="num">' + fmtNum(cid.qtd, 0) + '</td>' +
            '<td class="num">' + cid.numClientes + '</td></tr>';
        });
        html += '</tbody></table>';
      }

      html += '</td></tr>';
    }
  });

  tb.innerHTML = html;

  tb.querySelectorAll('tr.expansivel').forEach(tr => {
    tr.onclick = () => {
      const cod = tr.dataset.prod;
      ui.produtosExpandidos[cod] = !ui.produtosExpandidos[cod];
      renderProdutos();
    };
  });
}

// ============================================================
// LIMPAR SNAPSHOT
// ============================================================

export function limparSnapshot() {
  if (!confirm('Limpar snapshot de comparação de produtos?')) return;
  state._produtosSnap = null;
  state._produtosHistorico = {};
  renderProdutos();
  copiarTexto('Snapshot removido');
}

// ============================================================
// IMPRESSÃO
// ============================================================

export function imprimirProdutos() {
  const lista = window._produtosFiltrados || [];
  if (lista.length === 0) { copiarTexto('Nada para imprimir'); return; }

  let h = '<table><thead><tr>' +
    '<th>Curva</th><th>Código</th><th>Descrição</th><th>Fabricante</th>' +
    '<th class="num">Qtd</th><th class="num">Valor</th></tr></thead><tbody>';

  lista.slice(0, 1000).forEach(p => {
    h += '<tr><td>' + p.curva + '</td>' +
      '<td>' + escapeHtml(p.codigo || '—') + '</td>' +
      '<td>' + escapeHtml(p.descricao) + '</td>' +
      '<td>' + escapeHtml(p.fabricante || '—') + '</td>' +
      '<td class="num">' + fmtNum(p.qtdVendida, 0) + '</td>' +
      '<td class="num">' + fmtBRL(p.valorVendido) + '</td></tr>';
  });
  h += '</tbody></table>';

  imprimirHTML('Curva ABC', lista.length + ' produtos', h);
}