// ============================================================
// views/agenda.js — Fila de Trabalho (Com Modo Foco)
// ============================================================

import { state, ui } from '../state.js';
import { fmtBRL, escapeHtml, isoDate, diffDias, normalizarNomeCliente } from '../utils.js';
import { filialNoEscopo } from '../calc.js';

// Variáveis de controle do Modo Foco
let focoFila = [];
let focoIndex = 0;
let modoFoco = false;

export function renderAgenda() {
  const btnLista = document.getElementById('btn-agenda-lista');
  const btnFoco = document.getElementById('btn-agenda-foco');
  const containerLista = document.getElementById('agenda-modo-lista');
  const containerFoco = document.getElementById('agenda-modo-foco');

  if (!containerLista || !containerFoco) return;

  // Popula o select de vendedor local (se vazio)
  const selVend = document.getElementById('agenda-filtro-vendedor');
  if (selVend && selVend.options.length <= 1) {
    let opts = '<option value="">Todos vendedores</option>';
    state.vendedores.filter(v => v.ativo && v.papel === 'vendedor').forEach(v => {
      opts += `<option value="${v.id}">${escapeHtml(v.nome)}</option>`;
    });
    selVend.innerHTML = opts;
  }

  // FIX: Sempre gera a fila do zero quando renderAgenda é chamada
  const fBusca = (document.getElementById('agenda-busca')?.value || '').toUpperCase();
  const fTipo = document.getElementById('agenda-filtro-tipo')?.value || 'todos';
  // Se o modo vendedor global estiver ativo, ele sobrepõe o local
  const fVend = ui.modoVendedor || selVend?.value || '';

  focoFila = gerarFila(fBusca, fTipo, fVend);
  focoIndex = 0;

  btnLista.onclick = () => {
    modoFoco = false;
    btnLista.classList.add('active');
    btnFoco.classList.remove('active');
    containerLista.style.display = 'block';
    containerFoco.style.display = 'none';
    renderModoListaView();
  };

  btnFoco.onclick = () => {
    modoFoco = true;
    btnFoco.classList.add('active');
    btnLista.classList.remove('active');
    containerLista.style.display = 'none';
    containerFoco.style.display = 'block';
    renderModoFocoView();
  };

  if (modoFoco) {
    btnFoco.classList.add('active');
    btnLista.classList.remove('active');
    containerLista.style.display = 'none';
    containerFoco.style.display = 'block';
    renderModoFocoView();
  } else {
    btnLista.classList.add('active');
    btnFoco.classList.remove('active');
    containerLista.style.display = 'block';
    containerFoco.style.display = 'none';
    renderModoListaView();
  }
}

function renderModoListaView() {
  const tbody = document.getElementById('agenda-tbody');
  const kpisEl = document.getElementById('agenda-kpis');
  const countEl = document.getElementById('agenda-count');
  if (!tbody) return;

  const nAtrasados = focoFila.filter(f => f.tipo === 'atrasados').length;
  const nHoje = focoFila.filter(f => f.tipo === 'hoje').length;
  const nRecompra = focoFila.filter(f => f.tipo === 'recompra').length;
  const nReativar = focoFila.filter(f => f.tipo === 'reativar' || f.tipo === 'sumido' || f.tipo === 'lento').length;

  kpisEl.innerHTML = `
    <div class="kpi-card" style="border-left:3px solid var(--af-vermelho);"><div class="kpi-header">RETORNO ATRASADO</div><div class="kpi-value vermelho">${nAtrasados}</div></div>
    <div class="kpi-card" style="border-left:3px solid var(--af-amarelo);"><div class="kpi-header">RETORNO HOJE</div><div class="kpi-value">${nHoje}</div></div>
    <div class="kpi-card" style="border-left:3px solid var(--af-verde);"><div class="kpi-header">HORA DA RECOMPRA</div><div class="kpi-value verde">${nRecompra}</div></div>
    <div class="kpi-card" style="border-left:3px solid #888;"><div class="kpi-header">REATIVAR / SUMIDOS</div><div class="kpi-value">${nReativar}</div></div>
  `;

  if (countEl) countEl.textContent = focoFila.length + ' itens';

  if (focoFila.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:32px; color:#888;">Nenhuma tarefa encontrada.</td></tr>';
    return;
  }

  tbody.innerHTML = focoFila.map(f => `
      <tr>
        <td><span class="badge ${f.tipoBadge}">${f.tipoLabel}</span></td>
        <td><strong>${escapeHtml(f.cliente)}</strong></td>
        <td style="color:var(--af-t2); font-size:12px;">${escapeHtml(f.contexto)}</td>
        <td>${escapeHtml(f.vendedor)}</td>
        <td class="num">${fmtBRL(f.valor)}</td>
        <td style="text-align:center;"><button class="btn-ligar" data-agenda-ligar="${f.id}">Ligar</button></td>
      </tr>
  `).join('');

  tbody.querySelectorAll('[data-agenda-ligar]').forEach(btn => {
    btn.onclick = () => {
      const itemId = btn.dataset.agendaLigar;
      const item = focoFila.find(x => x.id === itemId);
      if (!item || !window._abrirModalLigacao) return;
      if (item.ligacaoId) window._abrirModalLigacao(item.ligacaoId);
      else if (item.clienteObj) {
        window._abrirModalLigacao(null, {
          empresa: item.clienteObj.nome, codigo: item.clienteObj.codigo || '',
          cidade: item.clienteObj.cidade || '', estado: item.clienteObj.uf || 'PA',
          vendedor: item.clienteObj.vendedor || ui.modoVendedor || ''
        });
      }
    };
  });
}

function renderModoFocoView() {
  const elTipo = document.getElementById('foco-tipo');
  const elNome = document.getElementById('foco-nome');
  const elCtx = document.getElementById('foco-contexto');
  const elVal = document.getElementById('foco-valor');
  const elProg = document.getElementById('foco-progresso');
  const btnPular = document.getElementById('btn-foco-pular');
  const btnLigar = document.getElementById('btn-foco-ligar');

  if (!elTipo) return;

  if (focoFila.length === 0) {
    elTipo.innerHTML = '';
    elNome.innerHTML = 'Fila Vazia!';
    elCtx.innerHTML = 'Nenhum cliente para contatar com esses filtros.';
    elVal.innerHTML = 'R$ 0,00';
    elProg.innerHTML = '0 de 0';
    btnPular.style.display = 'none';
    btnLigar.style.display = 'none';
    return;
  }

  if (focoIndex >= focoFila.length) {
    elTipo.innerHTML = '🎉 FIM DA FILA';
    elNome.innerHTML = 'Bom trabalho!';
    elCtx.innerHTML = 'Você concluiu todas as tarefas desta fila.';
    elVal.innerHTML = '—';
    elProg.innerHTML = focoFila.length + ' de ' + focoFila.length;
    btnPular.style.display = 'none';
    btnLigar.style.display = 'none';
    return;
  }

  const item = focoFila[focoIndex];

  elTipo.innerHTML = `<span class="badge ${item.tipoBadge}">${item.tipoLabel}</span>`;
  elNome.innerHTML = escapeHtml(item.cliente);
  elCtx.innerHTML = escapeHtml(item.contexto) + '<br><strong>Resp: ' + escapeHtml(item.vendedor) + '</strong>';
  elVal.innerHTML = fmtBRL(item.valor);
  elProg.innerHTML = (focoIndex + 1) + ' de ' + focoFila.length;

  btnPular.style.display = 'block';
  btnLigar.style.display = 'block';

  btnPular.onclick = () => {
    focoIndex++;
    renderModoFocoView();
  };

  btnLigar.onclick = () => {
    if (!window._abrirModalLigacao) return;
    
    if (item.ligacaoId) {
      window._abrirModalLigacao(item.ligacaoId);
    } else if (item.clienteObj) {
      window._abrirModalLigacao(null, {
        empresa: item.clienteObj.nome, codigo: item.clienteObj.codigo || '',
        cidade: item.clienteObj.cidade || '', estado: item.clienteObj.uf || 'PA',
        vendedor: item.clienteObj.vendedor || ui.modoVendedor || ''
      });
    }
    
    setTimeout(() => {
      focoIndex++;
      renderModoFocoView();
    }, 1000); 
  };
}

function gerarFila(fBusca, fTipo, fVend) {
  const hj = isoDate(new Date());
  let fila = [];
  const vistos = {};

  let ligs = (state.ligacoes || []).filter(l => filialNoEscopo(l.filialId, ui.escopoAtual));
  
  const ativas = ligs.filter(l => {
    if (!l.proximo) return false;
    if (l.status === 'venda' || l.status === 'sem_interesse') return false;
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
      tipo: atrasado ? 'atrasados' : 'hoje',
      tipoLabel: atrasado ? 'Retorno Atrasado' : 'Retorno Hoje',
      tipoBadge: atrasado ? 'danger' : 'warn',
      cliente: l.empresa,
      contexto: atrasado ? `Agendado para ${l.proximo.split('-').reverse().join('/')} (${diffDias(l.proximo, hj)}d atrás)` : 'Agendado para hoje',
      vendedor: v ? v.nome : '—',
      vendedorId: l.vendedor,
      valor: cli ? (cli.valorMedioMensal || 0) : (l.valor || 0),
      clienteObj: cli,
      ligacaoId: l.id,
      prioridade: atrasado ? 1 : 2
    });
  });

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
    let prioridade = 4;

    if (dias >= 180) {
      tipo = 'lento';
      label = 'Recuperação Lenta';
      badge = 'danger';
      prioridade = 5;
    } else if (fator >= 4) {
      tipo = 'sumido';
      label = 'Sumido';
      badge = 'danger';
      prioridade = 3;
    } else if (fator >= 2) {
      tipo = 'reativar';
      label = 'Reativar';
      badge = 'danger';
      prioridade = 3;
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
      prioridade
    });
  });

  const filaFiltrada = fila.filter(f => {
    if (fTipo !== 'todos' && f.tipo !== fTipo) return false;
    if (fVend && f.vendedorId !== fVend) return false;
    if (fBusca && !f.cliente.toUpperCase().includes(fBusca)) return false;
    return true;
  });

  filaFiltrada.sort((a, b) => {
    if (a.prioridade !== b.prioridade) return a.prioridade - b.prioridade;
    return b.valor - a.valor;
  });

  return filaFiltrada;
}