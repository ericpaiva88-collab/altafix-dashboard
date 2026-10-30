// ============================================================
// views/clientes.js — CRM Visual (Variação MoM + Ordenação)
// ============================================================

import { state, ui } from '../state.js';
import { fmtBRL, escapeHtml, diffDias, normalizarNomeCliente, abrirWhatsApp, isoDate, toast } from '../utils.js';
import { clientesNoEscopo } from '../calc.js';

let filtroAtivo = 'todos';
let sortCol = 'variacao'; // Coluna padrão inicial
let sortDir = 'asc';      // 'asc' (menor para maior) ou 'desc' (maior para menor)

export function renderClientes() {
  const kpisEl = document.getElementById('clientes-kpis');
  const tbody = document.getElementById('tbody-clientes');
  const countEl = document.getElementById('clientes-count');
  if (!tbody) return;

  // Popula o select de vendedor
  const selVend = document.getElementById('filtro-cliente-vend');
  if (selVend && selVend.options.length <= 1) {
    let opts = '<option value="">Todos vendedores</option>';
    state.vendedores.filter(v => v.ativo && v.papel === 'vendedor').forEach(v => {
      opts += `<option value="${v.id}">${escapeHtml(v.nome)}</option>`;
    });
    selVend.innerHTML = opts;
  }

  // Configura os botões de filtro (Chips)
  document.querySelectorAll('[data-filtro]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filtro === filtroAtivo);
    btn.onclick = () => {
      filtroAtivo = btn.dataset.filtro;
      document.querySelectorAll('[data-filtro]').forEach(b => b.classList.toggle('active', b === btn));
      renderClientes();
    };
  });

  // Configura os cliques no cabeçalho da tabela (Ordenação)
  document.querySelectorAll('th[data-sort]').forEach(th => {
    th.onclick = () => {
      const col = th.dataset.sort;
      if (sortCol === col) {
        sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        sortCol = col;
        // Padrão: textos ordenam A-Z, números ordenam do maior pro menor
        sortDir = ['nome', 'vendedor'].includes(col) ? 'asc' : 'desc'; 
      }
      renderClientes();
    };
  });

  const fBusca = (document.getElementById('filtro-cliente-busca')?.value || '').toUpperCase();
  const fVend = selVend?.value || ui.modoVendedor || '';
  const hj = isoDate(new Date());

  // Pega os dados do Mês Atual e Mês Anterior para cruzar
  const mesAtual = hj.slice(0, 7);
  const dAnt = new Date(); dAnt.setMonth(dAnt.getMonth() - 1);
  const mesAnt = dAnt.getFullYear() + '-' + String(dAnt.getMonth() + 1).padStart(2, '0');

  const mapaAtual = {};
  const mapaAnt = {};

  (state.clientesImportacoes || []).forEach(ci => {
    if (!ci.periodoIni) return;
    const mes = ci.periodoIni.slice(0, 7);
    const norm = ci.clienteNorm;
    
    if (mes === mesAtual) mapaAtual[norm] = (mapaAtual[norm] || 0) + (ci.valor || 0);
    if (mes === mesAnt) mapaAnt[norm] = (mapaAnt[norm] || 0) + (ci.valor || 0);
  });

  // Base de clientes
  let clientes = clientesNoEscopo(ui.escopoAtual);
  
  // Enriquecer clientes com dados de variação e nome do vendedor
  const clientesComVar = clientes.map(c => {
    const norm = normalizarNomeCliente(c.nome);
    const vAt = mapaAtual[norm] || 0;
    const vAnt = mapaAnt[norm] || 0;
    const delta = vAt - vAnt;
    
    const diasSemComprar = c.ultimaCompra ? diffDias(c.ultimaCompra, hj) : 9999;
    const vendedorObj = state.vendedores.find(x => x.id === c.vendedor);
    const nomeVendedor = vendedorObj ? vendedorObj.nome : '—';

    // Define o status MoM
    let statusMom = 'neutro';
    if (vAt > 0 && vAnt === 0) statusMom = 'novo';
    else if (vAt === 0 && vAnt > 0) statusMom = 'perdido';
    else if (delta > 0) statusMom = 'crescimento';
    else if (delta < 0) statusMom = 'queda';

    return { ...c, vAt, vAnt, delta, diasSemComprar, statusMom, nomeVendedor };
  });

  // --- KPIs ---
  const ativos = clientesComVar.filter(c => c.diasSemComprar < 30);
  const emQueda = clientesComVar.filter(c => c.statusMom === 'queda' || c.statusMom === 'perdido');
  const emRisco = clientesComVar.filter(c => c.diasSemComprar >= 30 && c.diasSemComprar < 180);
  
  const valorQueda = emQueda.reduce((s, c) => s + Math.abs(c.delta), 0);
  const valorRisco = emRisco.reduce((s, c) => s + (c.valorMedioMensal || 0), 0);

  kpisEl.innerHTML = `
    <div class="kpi-card">
      <div class="kpi-header">CARTEIRA</div>
      <div class="kpi-value">${clientesComVar.length}</div>
      <div class="kpi-hint">${ativos.length} ativos este mês</div>
    </div>
    <div class="kpi-card" style="border-left:3px solid var(--af-vermelho);">
      <div class="kpi-header">EM QUEDA NO MÊS</div>
      <div class="kpi-value" style="color:var(--af-vermelho)">${emQueda.length}</div>
      <div class="kpi-hint">${fmtBRL(valorQueda)} perdidos/ reduzidos</div>
    </div>
    <div class="kpi-card" style="border-left:3px solid var(--af-amarelo);">
      <div class="kpi-header">EM RISCO (30-180D)</div>
      <div class="kpi-value" style="color:var(--af-amarelo)">${emRisco.length}</div>
      <div class="kpi-hint">${fmtBRL(valorRisco)}/mês em jogo</div>
    </div>
  `;

  // --- FILTROS ---
  const filtrados = clientesComVar.filter(c => {
    if (fVend && c.vendedor !== fVend) return false;
    if (fBusca) {
      const alvo = (c.nome + ' ' + (c.cidade || '')).toUpperCase();
      if (!alvo.includes(fBusca)) return false;
    }

    // Aplica o chip selecionado
    if (filtroAtivo === 'queda') return c.statusMom === 'queda' || c.statusMom === 'perdido';
    if (filtroAtivo === 'crescimento') return c.statusMom === 'crescimento' || c.statusMom === 'novo';
    if (filtroAtivo === 'risco') return c.diasSemComprar >= 30 && c.diasSemComprar < 180;

    return true; // 'todos'
  });

  // --- ORDENAÇÃO ---
  filtrados.sort((a, b) => {
    let valA = a[sortCol];
    let valB = b[sortCol];

    // Tratamento para colunas que não existem diretamente no objeto
    if (sortCol === 'vendedor') { valA = a.nomeVendedor; valB = b.nomeVendedor; }
    if (sortCol === 'faturamento') { valA = a.vAt; valB = b.vAt; }
    if (sortCol === 'variacao') { valA = a.delta; valB = b.delta; }

    // Fallback para valores nulos
    if (valA == null) valA = '';
    if (valB == null) valB = '';

    // Comparação de Strings vs Números
    if (typeof valA === 'string' && typeof valB === 'string') {
      return sortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
    } else {
      return sortDir === 'asc' ? valA - valB : valB - valA;
    }
  });

  // Atualiza os ícones visuais de ordenação no topo da tabela
  document.querySelectorAll('.sort-icon').forEach(el => el.textContent = '');
  const iconEl = document.getElementById('icon-' + sortCol);
  if (iconEl) iconEl.textContent = sortDir === 'asc' ? ' ▲' : ' ▼';

  if (countEl) countEl.textContent = filtrados.length + ' clientes';

  if (filtrados.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:32px; color:#888;">Nenhum cliente encontrado com esses filtros.</td></tr>';
    return;
  }

  // --- RENDERIZA TABELA ---
  tbody.innerHTML = filtrados.slice(0, 200).map(c => {
    const v = state.vendedores.find(x => x.id === c.vendedor);
    
    // Coluna de Faturamento
    const fatTxt = c.vAt > 0 ? `<strong>${fmtBRL(c.vAt)}</strong>` : `<span style="color:#888;">R$ 0,00</span>`;

    // Coluna de Variação
    let varBadge = '<span class="badge neutral">—</span>';
    if (c.statusMom === 'novo') varBadge = '<span class="badge" style="background:#E0E7FF; color:#3730A3;">✨ NOVO</span>';
    else if (c.statusMom === 'perdido') varBadge = `<span style="color:var(--af-vermelho); font-weight:600; font-size:12px;">▼ Saiu (-${fmtBRL(c.vAnt)})</span>`;
    else if (c.statusMom === 'crescimento') varBadge = `<span style="color:var(--af-verde); font-weight:600; font-size:12px;">▲ +${fmtBRL(c.delta)}</span>`;
    else if (c.statusMom === 'queda') varBadge = `<span style="color:var(--af-vermelho); font-weight:600; font-size:12px;">▼ -${fmtBRL(Math.abs(c.delta))}</span>`;

    // Coluna de Ação (WhatsApp)
    let tel = obterTelefoneCliente(c.nome);
    let btnAcao = '';
    if (tel) {
      const nomeVendedor = v ? v.nome : '';
      btnAcao = `<button class="btn btn-sm" style="background:#25D366;color:#fff;border-color:#25D366;" onclick="event.stopPropagation(); window._abrirWhatsApp('${tel}', '${escapeHtml(c.nome)}', '${escapeHtml(nomeVendedor)}')">💬 Zap</button>`;
    } else {
      btnAcao = `<button class="btn btn-sm" style="background:#e2e8f0; color:#94a3b8; border-color:#cbd5e1;" onclick="event.stopPropagation(); toast('⚠ Cliente sem telefone.')">💬 Zap</button>`;
    }

    const ultimaTxt = c.ultimaCompra ? c.ultimaCompra.split('-').reverse().join('/') : '—';
    const diasTxt = c.diasSemComprar < 9999 ? `(${c.diasSemComprar}d)` : '';

    // Corrigindo o "_" fantasma
    const cidadeTxt = c.cidade && c.cidade !== '_' ? `<br><span style="font-size:11px; color:#888;">${escapeHtml(c.cidade)}</span>` : '';

    return `
      <tr>
        <td><strong>${escapeHtml(c.nome)}</strong>${cidadeTxt}</td>
        <td>${v ? escapeHtml(v.nome) : '—'}</td>
        <td style="color:var(--af-t2); font-size:12px;">${ultimaTxt} <span style="color:var(--af-t3);">${diasTxt}</span></td>
        <td class="num">${fatTxt}</td>
        <td class="num">${varBadge}</td>
        <td style="text-align:center;">${btnAcao}</td>
      </tr>
    `;
  }).join('');
}

// Helpers locais
function obterTelefoneCliente(nomeCliente) {
  const norm = normalizarNomeCliente(nomeCliente);
  const ligs = state.ligacoes.filter(l => normalizarNomeCliente(l.empresa) === norm && l.telefone);
  if (ligs.length > 0) {
    ligs.sort((a, b) => (b.data || '').localeCompare(a.data || ''));
    return ligs[0].telefone;
  }
  return null;
}