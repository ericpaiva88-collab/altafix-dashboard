// ============================================================
// views/agenda.js — Fila de Trabalho Operacional
// ============================================================

import { state, ui } from '../state.js';
import { fmtBRL, escapeHtml, isoDate, diffDias, normalizarNomeCliente } from '../utils.js';
import { filialNoEscopo, parseEscopo } from '../calc.js';

export function renderAgenda() {
  const tbody = document.getElementById('agenda-tbody');
  const kpisEl = document.getElementById('agenda-kpis');
  const countEl = document.getElementById('agenda-count');
  if (!tbody) return;

  const hj = isoDate(new Date());
  const fila = [];
  const vistos = {}; // Evita duplicar o mesmo cliente

  // 1. Retornos de ligações (Agendados)
  let ligs = (state.ligacoes || []).filter(l => filialNoEscopo(l.filialId, ui.escopoAtual));
  if (ui.modoVendedor) ligs = ligs.filter(l => l.vendedor === ui.modoVendedor);

  const ativas = ligs.filter(l => {
    if (!l.proximo) return false;
    if (l.status === 'venda' || l.status === 'sem_interesse') return false;
    // Retornos atrasados (últimos 30 dias) ou para hoje/semana
    return l.proximo <= hj; 
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
      tipo: atrasado ? 'danger' : 'warn',
      tipoLabel: atrasado ? 'Retorno Atrasado' : 'Retorno Hoje',
      cliente: l.empresa,
      contexto: atrasado 
        ? `Agendado para ${l.proximo.split('-').reverse().join('/')} (${diffDias(l.proximo, hj)}d atrás)`
        : 'Agendado para hoje',
      vendedor: v ? v.nome : '—',
      valor: cli ? (cli.valorMedioMensal || 0) : (l.valor || 0),
      vendedorId: l.vendedor,
      clienteObj: cli,
      ligacaoId: l.id,
      prioridade: atrasado ? 1 : 2
    });
  });

  // 2. Clientes em risco / Recompra
  let clientes = state.clientes.filter(c => filialNoEscopo(c.filialId, ui.escopoAtual));
  if (ui.modoVendedor) clientes = clientes.filter(c => c.vendedor === ui.modoVendedor);

  clientes.forEach(c => {
    if (!c.ultimaCompra || !c.numCompras || c.numCompras < 2) return;
    if (c.valorMedioMensal < 100) return; // Ignora clientes de baixo valor

    const dias = diffDias(c.ultimaCompra, hj);
    if (dias < 30) return; // Só entra na agenda se passou de 30 dias

    const chave = normalizarNomeCliente(c.nome);
    if (vistos[chave]) return;
    vistos[chave] = true;

    const intervalo = Math.max(7, c.intervaloMedio || 30);
    const fator = dias / intervalo;
    const v = state.vendedores.find(x => x.id === c.vendedor);

    let tipo = 'neutral';
    let label = 'Recompra';

    if (dias >= 180) { tipo = 'danger'; label = 'Recuperação Lenta'; }
    else if (fator >= 4) { tipo = 'danger'; label = 'Sumido'; }
    else if (fator >= 2) { tipo = 'danger'; label = 'Reativar'; }
    else if (fator >= 1) { tipo = 'warn'; label = 'Recompra Esperada'; }

    fila.push({
      id: 'cli_' + c.id,
      tipo: tipo,
      tipoLabel: label,
      cliente: c.nome,
      contexto: `${dias} dias sem comprar · Ciclo a cada ${intervalo}d`,
      vendedor: v ? v.nome : '—',
      valor: c.valorMedioMensal || 0,
      vendedorId: c.vendedor,
      clienteObj: c,
      prioridade: 3
    });
  });

  // Ordena: Prioridade (1, 2, 3), depois por Valor (maior primeiro)
  fila.sort((a, b) => {
    if (a.prioridade !== b.prioridade) return a.prioridade - b.prioridade;
    return b.valor - a.valor;
  });

  // Atualiza Contadores/KPIs
  const nAtrasados = fila.filter(f => f.tipoLabel === 'Retorno Atrasado').length;
  const nHoje = fila.filter(f => f.tipoLabel === 'Retorno Hoje').length;
  const nRecompra = fila.filter(f => f.tipoLabel === 'Recompra Esperada').length;
  const nReativar = fila.filter(f => f.tipoLabel === 'Reativar' || f.tipoLabel === 'Sumido').length;

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

  if (countEl) countEl.textContent = fila.length + ' itens';

  if (fila.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:32px; color:#888;">🎉 Nenhuma tarefa pendente. Bom trabalho!</td></tr>';
    return;
  }

  // Renderiza a Tabela
  tbody.innerHTML = fila.map(f => {
    let badgeClass = 'neutral';
    if (f.tipo === 'danger') badgeClass = 'danger';
    if (f.tipo === 'warn') badgeClass = 'warn';

    return `
      <tr>
        <td><span class="badge ${badgeClass}">${f.tipoLabel}</span></td>
        <td><strong>${escapeHtml(f.cliente)}</strong></td>
        <td style="color:var(--af-t2); font-size:12px;">${escapeHtml(f.contexto)}</td>
        <td>${escapeHtml(f.vendedor)}</td>
        <td class="num">${fmtBRL(f.valor)}</td>
        <td style="text-align:center;">
          <button class="btn btn-sm btn-primary" data-agenda-ligar="${f.id}" style="border-radius:99px; padding:4px 12px;">
            📞 Ligar
          </button>
        </td>
      </tr>
    `;
  }).join('');

  // Adiciona evento de clique para abrir o modal
  tbody.querySelectorAll('[data-agenda-ligar]').forEach(btn => {
    btn.onclick = () => {
      const itemId = btn.dataset.agendaLigar;
      const item = fila.find(x => x.id === itemId);
      if (!item || !window._abrirModalLigacao) return;

      if (item.ligacaoId) {
        // Se já é uma ligação existente, só abre
        window._abrirModalLigacao(item.ligacaoId);
      } else if (item.clienteObj) {
        // Se é uma ação do sistema, pré-preenche o modal
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