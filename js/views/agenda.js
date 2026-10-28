// ============================================================
// views/agenda.js — Fila de Trabalho Operacional
// ============================================================

import { state, ui } from '../state.js';
import { fmtBRL, escapeHtml, isoDate, diffDias, normalizarNomeCliente } from '../utils.js';
import { filialNoEscopo } from '../calc.js';

export function renderAgenda() {
  const tbody = document.getElementById('agenda-tbody');
  const kpisEl = document.getElementById('agenda-kpis');
  const countEl = document.getElementById('agenda-count');
  if (!tbody) return;

  // Popula o select de vendedor (só uma vez)
  const selVend = document.getElementById('agenda-filtro-vendedor');
  if (selVend && selVend.options.length <= 1) {
    let opts = '<option value="">Todos vendedores</option>';
    state.vendedores.filter(v => v.ativo && v.papel === 'vendedor').forEach(v => {
      opts += `<option value="${v.id}">${escapeHtml(v.nome)}</option>`;
    });
    selVend.innerHTML = opts;
    

  }

  // Pega os valores dos filtros
  const fBusca = (document.getElementById('agenda-busca')?.value || '').toUpperCase();
  const fTipo = document.getElementById('agenda-filtro-tipo')?.value || 'todos';
  const fVend = selVend?.value || ui.modoVendedor || '';

  const hj = isoDate(new Date());
  let fila = [];
  const vistos = {}; // Evita duplicar o mesmo cliente

  // 1. Retornos de ligações (Agendados)
  let ligs = (state.ligacoes || []).filter(l => filialNoEscopo(l.filialId, ui.escopoAtual));
  
  const ativas = ligs.filter(l => {
    if (!l.proximo) return false;
    if (l.status === 'venda' || l.status === 'sem_interesse') return false;
    return l.proximo <= hj; // Atrasados ou para hoje
  });

  ativas.forEach(l => {
    const chave = normalizarNomeCliente(l.empresa || '');
    if (vistos[chave]) return;
    vistos[chave] = true;

    const v = state.vendedores.find(x => x.id === l.vendedor);
    const atrasado = l.proximo < hj;
    const cli = state.clientes.find(c => normalizarNomeCliente(c.nome) === chave && filialNoEscopo(c.filialId, ui.escopoAtual));
    
    fila.push({
      id: 'lig_' + l.id,
      tipo: atrasado ? 'atrasados' : 'hoje',
      tipoLabel: atrasado ? 'Retorno Atrasado' : 'Retorno Hoje',
      tipoBadge: atrasado ? 'danger' : 'warn',
      cliente: l.empresa,
      contexto: atrasado 
        ? `Agendado para ${l.proximo.split('-').reverse().join('/')} (${diffDias(l.proximo, hj)}d atrás)`
        : 'Agendado para hoje',
      vendedor: v ? v.nome : '—',
      vendedorId: l.vendedor,
      valor: cli ? (cli.valorMedioMensal || 0) : (l.valor || 0),
      clienteObj: cli,
      ligacaoId: l.id,
      prioridade: atrasado ? 1 : 2
    });
  });

  // 2. Clientes em risco / Recompra
  let clientes = state.clientes.filter(c => filialNoEscopo(c.filialId, ui.escopoAtual));

  clientes.forEach(c => {
    if (!c.ultimaCompra || !c.numCompras || c.numCompras < 2) return;
    if (c.valorMedioMensal < 100) return; 

    const dias = diffDias(c.ultimaCompra, hj);
    if (dias < 30) return; 

    const chave = normalizarNomeCliente(c.nome);
    if (vistos[chave]) return;
    vistos[chave] = true;

    const intervalo = Math.max(7, c.intervaloMedio || 30);
    const fator = dias / intervalo;
    const v = state.vendedores.find(x => x.id === c.vendedor);

    let tipo = 'recompra';
    let label = 'Recompra Esperada';
    let badge = 'neutral';

    if (dias >= 180 || fator >= 4 || fator >= 2) { 
      tipo = 'reativar'; 
      label = (dias >= 180 ? 'Recuperação Lenta' : (fator >= 4 ? 'Sumido' : 'Reativar')); 
      badge = 'danger';
    }

    fila.push({
      id: 'cli_' + c.id,
      tipo: tipo,
      tipoLabel: label,
      tipoBadge: badge,
      cliente: c.nome,
      contexto: `${dias} dias sem comprar · Ciclo a cada ${intervalo}d`,
      vendedor: v ? v.nome : '—',
      vendedorId: c.vendedor,
      valor: c.valorMedioMensal || 0,
      clienteObj: c,
      prioridade: tipo === 'reativar' ? 3 : 4
    });
  });

  // ---- APLICA OS FILTROS ----
  const filaFiltrada = fila.filter(f => {
    if (fTipo !== 'todos' && f.tipo !== fTipo) return false;
    if (fVend && f.vendedorId !== fVend) return false;
    if (fBusca && !f.cliente.toUpperCase().includes(fBusca)) return false;
    return true;
  });

  // Ordena: Prioridade (1, 2, 3, 4), depois por Valor
  filaFiltrada.sort((a, b) => {
    if (a.prioridade !== b.prioridade) return a.prioridade - b.prioridade;
    return b.valor - a.valor;
  });

  // KPIs (baseados na fila filtrada)
  const nAtrasados = filaFiltrada.filter(f => f.tipo === 'atrasados').length;
  const nHoje = filaFiltrada.filter(f => f.tipo === 'hoje').length;
  const nRecompra = filaFiltrada.filter(f => f.tipo === 'recompra').length;
  const nReativar = filaFiltrada.filter(f => f.tipo === 'reativar').length;

  kpisEl.innerHTML = `
    <div class="kpi-card" style="border-left:3px solid var(--af-vermelho);">
      <div class="kpi-header">RETORNO ATRASADO</div>
      <div class="kpi-value vermelho">${nAtrasados}</div>
    </div>
    <div class="kpi-card" style="border-left:3px solid var(--af-amarelo);">
      <div class="kpi-header">RETORNO HOJE</div>
      <div class="kpi-value">${nHoje}</div>
    </div>
    <div class="kpi-card" style="border-left:3px solid var(--af-verde);">
      <div class="kpi-header">HORA DA RECOMPRA</div>
      <div class="kpi-value verde">${nRecompra}</div>
    </div>
    <div class="kpi-card" style="border-left:3px solid #888;">
      <div class="kpi-header">REATIVAR</div>
      <div class="kpi-value">${nReativar}</div>
    </div>
  `;

  if (countEl) countEl.textContent = filaFiltrada.length + ' itens';

  if (filaFiltrada.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:32px; color:#888;">Nenhuma tarefa encontrada com esses filtros.</td></tr>';
    return;
  }

  // Renderiza a Tabela
  tbody.innerHTML = filaFiltrada.map(f => {
    return `
      <tr>
        <td><span class="badge ${f.tipoBadge}">${f.tipoLabel}</span></td>
        <td><strong>${escapeHtml(f.cliente)}</strong></td>
        <td style="color:var(--af-t2); font-size:12px;">${escapeHtml(f.contexto)}</td>
        <td>${escapeHtml(f.vendedor)}</td>
        <td class="num">${fmtBRL(f.valor)}</td>
        <td style="text-align:center;">
          <button class="btn-ligar" data-agenda-ligar="${f.id}">Ligar</button>
        </td>
      </tr>
    `;
  }).join('');

  // Evento do botão Ligar
  tbody.querySelectorAll('[data-agenda-ligar]').forEach(btn => {
    btn.onclick = () => {
      const itemId = btn.dataset.agendaLigar;
      const item = fila.find(x => x.id === itemId);
      if (!item || !window._abrirModalLigacao) return;

      if (item.ligacaoId) {
        window._abrirModalLigacao(item.ligacaoId);
      } else if (item.clienteObj) {
        window._abrirModalLigacao(null, {
          empresa: item.clienteObj.nome,
          codigo: item.clienteObj.codigo || '',
          cidade: item.clienteObj.cidade || '',
          estado: item.clienteObj.uf || 'PA',
          vendedor: item.clienteObj.vendedor || ui.modoVendedor || ''
        });
      }
    };
  });
}