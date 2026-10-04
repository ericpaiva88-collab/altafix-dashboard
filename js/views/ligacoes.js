// ============================================================
// views/ligacoes.js — Tela de Ligações (TeleVendas migrado)
// ============================================================

import { state, ui, session } from '../state.js';
import {
  fmtBRL, escapeHtml, isoDate, diffDias, fmtDataBR, toast
} from '../utils.js';
import { filialNoEscopo, parseEscopo } from '../calc.js';
import { sbCarregarTudo, aplicarDadosDoBanco } from '../supabase.js';

const STATUS = {
  prospeccao:     { label: 'Prospecção',       emoji: '🔵', cor: '#3b82f6' },
  retornar:       { label: 'Retornar',         emoji: '🟡', cor: '#f59e0b' },
  aguardando:     { label: 'Aguardando',       emoji: '🔴', cor: '#dc2626' },
  venda:          { label: 'Venda',            emoji: '🟢', cor: '#16a34a' },
  sem_interesse:  { label: 'Sem interesse',    emoji: '⚫', cor: '#64748b' }
};

// ============================================================
// HELPERS
// ============================================================

function ligacoesNoEscopo() {
  return (state.ligacoes || []).filter(l => filialNoEscopo(l.filialId, ui.escopoAtual));
}

function vendasAtribuidasMap() {
  const mapa = {};
  (state.ligacoesVendas || []).forEach(lv => {
    mapa[lv.ligacaoId] = lv;
  });
  return mapa;
}

function calcularPeriodo() {
  const preset = document.getElementById('filtro-lig-periodo')?.value || 'mes_atual';
  if (preset === 'tudo') return null;
  const hj = new Date();
  let ini, fim;

  if (preset === 'mes_atual') {
    ini = new Date(hj.getFullYear(), hj.getMonth(), 1);
    fim = new Date(hj.getFullYear(), hj.getMonth() + 1, 0);
  } else if (preset === 'mes_passado') {
    ini = new Date(hj.getFullYear(), hj.getMonth() - 1, 1);
    fim = new Date(hj.getFullYear(), hj.getMonth(), 0);
  } else if (preset === '30d') {
    ini = new Date(hj); ini.setDate(ini.getDate() - 30);
    fim = hj;
  } else if (preset === '90d') {
    ini = new Date(hj); ini.setDate(ini.getDate() - 90);
    fim = hj;
  } else return null;

  return { ini: isoDate(ini), fim: isoDate(fim) };
}

function ehAtiva(l) {
  return l.status !== 'venda' && l.status !== 'sem_interesse';
}

function aplicarUrgencia(l, urgencia, hj) {
  if (!urgencia) return true;
  if (!l.proximo) return false;
  if (!ehAtiva(l)) return false;

  // Atrasado só considera o que venceu nos últimos 30 dias.
  // Mais velho que isso = fora do radar (cemitério).
  if (urgencia === 'atrasados') {
    if (l.status === 'prospeccao') return false;
    const limite = new Date(); limite.setDate(limite.getDate() - 30);
    return l.proximo < hj && l.proximo >= isoDate(limite);
  }
  if (urgencia === 'hoje') {
    return l.proximo === hj;
  }
  if (urgencia === 'semana') {
    const limite = new Date(); limite.setDate(limite.getDate() + 7);
    return l.proximo >= hj && l.proximo <= isoDate(limite);
  }
  return true;
}

// ============================================================
// RENDER PRINCIPAL
// ============================================================

export function renderLigacoes() {
  const kpisEl = document.getElementById('ligacoes-kpis');
  const tbody = document.getElementById('tbody-ligacoes');
  const countEl = document.getElementById('ligacoes-count');
  if (!kpisEl || !tbody) return;

  const base = ligacoesNoEscopo();
  const mapaVendas = vendasAtribuidasMap();
  const hj = isoDate(new Date());
  const urgencia = ui.filtroLigUrgencia || '';

  popularSelectVendedor(base);

  const periodo = calcularPeriodo();
  const busca = (document.getElementById('filtro-lig-busca')?.value || '').toUpperCase();
  const filtroVend = document.getElementById('filtro-lig-vend')?.value || '';
  const filtroStatus = document.getElementById('filtro-lig-status')?.value || '';
  const filtroConv = document.getElementById('filtro-lig-conversao')?.value || '';

  // Primeiro passa pelo período (base para KPIs)
  const noPeriodo = base.filter(l => {
    if (periodo && (!l.data || l.data < periodo.ini || l.data > periodo.fim)) return false;
    return true;
  });

  // Filtros de lista
  const filtradas = noPeriodo.filter(l => {
    if (!aplicarUrgencia(l, urgencia, hj)) return false;
    if (filtroVend && l.vendedor !== filtroVend) return false;
    if (filtroStatus && l.status !== filtroStatus) return false;

    const temVenda = !!mapaVendas[l.id];
    if (filtroConv === 'sim' && !temVenda) return false;
    if (filtroConv === 'nao' && temVenda) return false;

    if (busca) {
      const alvo = [l.empresa, l.cidade, l.codigo, l.obs, l.contato]
        .filter(Boolean).join(' ').toUpperCase();
      if (alvo.indexOf(busca) < 0) return false;
    }
    return true;
  });

  // KPIs do período (não filtrados por urgência/status/conversão)
  const totalLig = noPeriodo.length;
  const ligComVenda = noPeriodo.filter(l => mapaVendas[l.id]);
  const valorAtribuido = ligComVenda.reduce((s, l) => s + (mapaVendas[l.id].valorVenda || 0), 0);
  const taxaConversao = totalLig > 0 ? (ligComVenda.length / totalLig) * 100 : 0;
  const valorMedioVenda = ligComVenda.length > 0 ? valorAtribuido / ligComVenda.length : 0;

  const diasMedio = ligComVenda.length > 0
    ? ligComVenda.reduce((s, l) => s + (mapaVendas[l.id].diasEntre || 0), 0) / ligComVenda.length
    : 0;

  kpisEl.innerHTML =
    '<div class="kpi"><div class="label">Ligações</div>' +
    '<div class="value">' + totalLig + '</div>' +
    '<div class="hint">' + (periodo ? 'no período' : 'no total') + '</div></div>' +
    '<div class="kpi positivo"><div class="label">Vendas atribuídas</div>' +
    '<div class="value">' + ligComVenda.length + '</div>' +
    '<div class="hint">via ligação (30d)</div></div>' +
    '<div class="kpi positivo"><div class="label">Valor atribuído</div>' +
    '<div class="value">' + fmtBRL(valorAtribuido) + '</div>' +
    '<div class="hint">ticket médio ' + fmtBRL(valorMedioVenda) + '</div></div>' +
    '<div class="kpi ' + (taxaConversao >= 20 ? 'positivo' : taxaConversao >= 10 ? '' : 'negativo') + '">' +
    '<div class="label">Conversão</div>' +
    '<div class="value">' + taxaConversao.toFixed(1) + '%</div>' +
    '<div class="hint">ligações que viraram venda</div></div>' +
    '<div class="kpi"><div class="label">Tempo médio</div>' +
    '<div class="value">' + diasMedio.toFixed(1) + 'd</div>' +
    '<div class="hint">entre ligação e venda</div></div>';

  // Distribuição por status
  renderDistribuicaoStatus(noPeriodo);

  // Atalhos de urgência
  renderUrgencia(base, hj, mapaVendas);

  countEl.textContent = filtradas.length + ' ligações';

  // Tabela
  if (filtradas.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:30px;color:#64748b;">' +
      'Nenhuma ligação no filtro atual.</td></tr>';
    return;
  }

  const ordenadas = filtradas.slice().sort((a, b) => (b.data || '').localeCompare(a.data || ''));

  tbody.innerHTML = ordenadas.slice(0, 500).map(l => {
    const v = state.vendedores.find(x => x.id === l.vendedor);
    const st = STATUS[l.status] || STATUS.prospeccao;
    const lv = mapaVendas[l.id];

    const convHTML = lv
      ? '<span class="badge badge-ok" title="Venda em ' + fmtDataBR(lv.dataVenda) +
        ' (' + lv.diasEntre + ' dias após)">✓ ' + fmtBRL(lv.valorVenda) + '</span>'
      : '<span style="color:#94a3b8;">—</span>';

    const proxVencido = l.proximo && l.proximo < hj && ehAtiva(l);
    const proxHoje = l.proximo === hj && ehAtiva(l);
    const proxHTML = l.proximo
      ? (proxVencido
          ? '<span style="color:#dc2626;font-weight:700;">' + fmtDataBR(l.proximo) + '</span>'
          : proxHoje
            ? '<span style="color:#f59e0b;font-weight:700;">' + fmtDataBR(l.proximo) + '</span>'
            : fmtDataBR(l.proximo))
      : '—';

    return '<tr>' +
      '<td>' + fmtDataBR(l.data) + '</td>' +
      '<td>' + (v ? escapeHtml(v.nome) : '—') + '</td>' +
      '<td><strong>' + escapeHtml(l.empresa || '—') + '</strong>' +
      (l.codigo ? ' <span style="font-size:10px;color:#94a3b8;">' + escapeHtml(l.codigo) + '</span>' : '') +
      '</td>' +
      '<td>' + escapeHtml(l.cidade || '—') + (l.estado ? '/' + escapeHtml(l.estado) : '') + '</td>' +
      '<td><span class="badge" style="background:' + st.cor + ';color:#fff;">' +
        st.emoji + ' ' + st.label + '</span></td>' +
      '<td class="num">' + (l.valor > 0 ? fmtBRL(l.valor) : '—') + '</td>' +
      '<td>' + convHTML + '</td>' +
      '<td style="font-size:11px;">' + proxHTML + '</td>' +
      '<td><button class="btn btn-sm" data-editar-lig="' + escapeHtml(l.id) + '">✏️</button></td>' +
      '</tr>';
  }).join('');

  tbody.querySelectorAll('[data-editar-lig]').forEach(b => {
    b.onclick = () => abrirModalLigacao(b.dataset.editarLig);
  });
}

// ============================================================
// DISTRIBUIÇÃO POR STATUS
// ============================================================

function renderDistribuicaoStatus(noPeriodo) {
  const el = document.getElementById('ligacoes-status-dist');
  if (!el) return;

  const counts = {};
  Object.keys(STATUS).forEach(k => { counts[k] = 0; });
  noPeriodo.forEach(l => { counts[l.status] = (counts[l.status] || 0) + 1; });

  const total = noPeriodo.length || 1;

  el.innerHTML = Object.keys(STATUS).map(k => {
    const st = STATUS[k];
    const n = counts[k] || 0;
    const pct = (n / total * 100).toFixed(0);
    return '<div style="display:flex;align-items:center;gap:6px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:6px 12px;font-size:12px;">' +
      '<span style="font-weight:700;color:' + st.cor + ';">' + st.emoji + ' ' + st.label + '</span>' +
      '<strong style="font-size:14px;">' + n + '</strong>' +
      '<span style="color:#94a3b8;">(' + pct + '%)</span>' +
      '</div>';
  }).join('');
}

// ============================================================
// ATALHOS DE URGÊNCIA
// ============================================================

function renderUrgencia(base, hj, mapaVendas) {
  // Contadores: aplicar período pra não contar coisas antigas
  const periodo = calcularPeriodo();
  const noPeriodo = base.filter(l => {
    if (periodo && (!l.data || l.data < periodo.ini || l.data > periodo.fim)) return false;
    return true;
  });

  const nAtrasados = noPeriodo.filter(l => aplicarUrgencia(l, 'atrasados', hj)).length;
  const nHoje = noPeriodo.filter(l => aplicarUrgencia(l, 'hoje', hj)).length;
  const nSemana = noPeriodo.filter(l => aplicarUrgencia(l, 'semana', hj)).length;

  const nEl = document.getElementById('urg-atrasados-n');
  if (nEl) nEl.textContent = nAtrasados > 0 ? '(' + nAtrasados + ')' : '';
  const hEl = document.getElementById('urg-hoje-n');
  if (hEl) hEl.textContent = nHoje > 0 ? '(' + nHoje + ')' : '';
  const sEl = document.getElementById('urg-semana-n');
  if (sEl) sEl.textContent = nSemana > 0 ? '(' + nSemana + ')' : '';

  // Marcar botão ativo
  const atual = ui.filtroLigUrgencia || '';
  ['', 'atrasados', 'hoje', 'semana'].forEach(u => {
    const btn = document.querySelector('[data-urgencia="' + u + '"]');
    if (btn) btn.classList.toggle('btn-primary', atual === u);
  });

  // Cores nos contadores se > 0
  const bA = document.getElementById('urg-atrasados');
  if (bA) {
    bA.style.borderColor = nAtrasados > 0 ? '#dc2626' : '';
    bA.style.color = nAtrasados > 0 && atual !== 'atrasados' ? '#dc2626' : '';
  }
  const bH = document.getElementById('urg-hoje');
  if (bH) {
    bH.style.borderColor = nHoje > 0 ? '#f59e0b' : '';
    bH.style.color = nHoje > 0 && atual !== 'hoje' ? '#f59e0b' : '';
  }
}

// ============================================================
// SELECT VENDEDOR
// ============================================================

function popularSelectVendedor(base) {
  const sel = document.getElementById('filtro-lig-vend');
  if (!sel) return;
  if (sel.options.length > 1) return;

  const vistos = {};
  base.forEach(l => { if (l.vendedor) vistos[l.vendedor] = true; });

  let opts = '<option value="">Todos vendedores</option>';
  Object.keys(vistos).forEach(id => {
    const v = state.vendedores.find(x => x.id === id);
    if (v) opts += '<option value="' + escapeHtml(id) + '">' + escapeHtml(v.nome) + '</option>';
  });
  sel.innerHTML = opts;
}

// ============================================================
// MODAL — registrar/editar ligação
// ============================================================

export function abrirModalLigacao(ligacaoId, prefill) {
  const existente = ligacaoId ? state.ligacoes.find(l => l.id === ligacaoId) : null;
  prefill = prefill || {};

  let html = '<div class="card" style="margin:0;border:none;">';
  html += '<h2>' + (existente ? '✏️ Editar ligação' : '📞 Nova ligação') + '</h2>';

  if (prefill.acaoId) {
    html += '<div class="aviso info" style="margin-bottom:12px;font-size:12px;">' +
      '✓ Ao salvar, a ação será marcada como tratada automaticamente.</div>';
  }

  html += '<div class="form-row">';
  html += '<div><label>Vendedor</label><select id="ml-vend">';
  state.vendedores.filter(v => v.ativo && v.papel !== 'administrativo' && v.papel !== 'diretor')
    .forEach(v => {
      const sel = (existente && existente.vendedor === v.id) ||
                  (prefill.vendedor && prefill.vendedor === v.id) ||
                  (!existente && !prefill.vendedor && ui.modoVendedor === v.id);
      html += '<option value="' + escapeHtml(v.id) + '"' + (sel ? ' selected' : '') + '>' +
        escapeHtml(v.nome) + '</option>';
    });
  html += '</select></div>';

  const dataDefault = existente ? existente.data : isoDate(new Date());
  html += '<div><label>Data</label><input type="date" id="ml-data" value="' + dataDefault + '"></div>';
  html += '</div>';

  const codigoVal = existente ? (existente.codigo || '') : (prefill.codigo || '');
  const empresaVal = existente ? (existente.empresa || '') : (prefill.empresa || '');
  html += '<div class="form-row">';
  html += '<div><label>Código</label><input type="text" id="ml-codigo" value="' + escapeHtml(codigoVal) + '"></div>';
  html += '<div><label>Empresa *</label><input type="text" id="ml-empresa" value="' + escapeHtml(empresaVal) + '"></div>';
  html += '</div>';

  const contatoVal = existente ? (existente.contato || '') : (prefill.contato || '');
  const telefoneVal = existente ? (existente.telefone || '') : (prefill.telefone || '');
  html += '<div class="form-row">';
  html += '<div><label>Contato</label><input type="text" id="ml-contato" value="' + escapeHtml(contatoVal) + '"></div>';
  html += '<div><label>Telefone</label><input type="tel" id="ml-telefone" value="' + escapeHtml(telefoneVal) + '"></div>';
  html += '</div>';

  const cidadeVal = existente ? (existente.cidade || '') : (prefill.cidade || '');
  const estadoVal = existente ? (existente.estado || 'PA') : (prefill.estado || 'PA');
  html += '<div class="form-row">';
  html += '<div><label>Cidade</label><input type="text" id="ml-cidade" value="' + escapeHtml(cidadeVal) + '"></div>';
  html += '<div><label>UF</label><input type="text" id="ml-estado" maxlength="2" value="' + escapeHtml(estadoVal) + '"></div>';
  html += '</div>';

  html += '<div class="form-row">';
  html += '<div><label>Status</label><select id="ml-status">';
  Object.keys(STATUS).forEach(k => {
    html += '<option value="' + k + '"' +
      (existente && existente.status === k ? ' selected' : '') + '>' +
      STATUS[k].emoji + ' ' + STATUS[k].label + '</option>';
  });
  html += '</select></div>';
  html += '<div><label>Valor (R$)</label><input type="text" inputmode="decimal" id="ml-valor" value="' +
    (existente && existente.valor > 0 ? existente.valor : '') + '"></div>';
  html += '<div><label>Próximo contato</label><input type="date" id="ml-proximo" value="' +
    (existente && existente.proximo ? existente.proximo : '') + '"></div>';
  html += '</div>';

  html += '<div class="form-row"><div style="grid-column:1/-1;"><label>Observações</label>' +
    '<textarea id="ml-obs" style="width:100%;min-height:80px;padding:8px;border:1px solid #cbd5e1;border-radius:6px;font-family:inherit;font-size:13px;">' +
    (existente ? escapeHtml(existente.obs || '') : '') + '</textarea></div></div>';

  html += '<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;">';
  html += '<button class="btn btn-primary" id="ml-salvar">✓ ' + (existente ? 'Atualizar' : 'Salvar') + '</button>';
  html += '<button class="btn" id="ml-cancelar">Cancelar</button>';
  html += '</div>';

  html += '</div>';

  let modal = document.getElementById('lig-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'lig-modal';
    modal.className = 'modal';
    modal.innerHTML = '<div class="modal-content" style="max-width:600px;"></div>';
    document.body.appendChild(modal);
  }
  modal.querySelector('.modal-content').innerHTML = html;
  modal.classList.add('show');
  modal._acaoId = prefill.acaoId || null;

  modal.onclick = e => { if (e.target.id === 'lig-modal') modal.classList.remove('show'); };
  document.getElementById('ml-cancelar').onclick = () => modal.classList.remove('show');
  document.getElementById('ml-salvar').onclick = () => salvarLigacao(existente);
  setTimeout(() => document.getElementById('ml-obs')?.focus(), 100);
}

// ============================================================
// SALVAR
// ============================================================

async function salvarLigacao(existente) {
  const empresa = document.getElementById('ml-empresa').value.trim();
  if (!empresa) { toast('Empresa obrigatória.', 2500); return; }

  const vendedor = document.getElementById('ml-vend').value;
  const data = document.getElementById('ml-data').value;
  if (!data) { toast('Data obrigatória.', 2500); return; }

  const filialId = session.vendedor ? session.vendedor.filial_id : null;
  if (!filialId && !ui.escopoAtual.startsWith('FILIAL')) {
    toast('Sem filial definida.', 2500);
    return;
  }
  const fId = filialId || parseEscopo(ui.escopoAtual).id;

  const valorTxt = document.getElementById('ml-valor').value || '0';
  const valor = parseFloat(String(valorTxt).replace(/\./g, '').replace(',', '.')) || 0;

  const payload = {
    filial_id: fId,
    vendedor_id: vendedor,
    data: data,
    codigo: document.getElementById('ml-codigo').value.trim() || null,
    empresa: empresa,
    cliente_norm: empresa.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9 ]/g, '').trim(),
    contato: document.getElementById('ml-contato').value.trim() || null,
    telefone: document.getElementById('ml-telefone').value.trim() || null,
    cidade: document.getElementById('ml-cidade').value.trim() || null,
    estado: (document.getElementById('ml-estado').value || '').trim().toUpperCase() || null,
    status: document.getElementById('ml-status').value,
    valor: valor,
    proximo: document.getElementById('ml-proximo').value || null,
    obs: document.getElementById('ml-obs').value.trim() || null
  };

  const btn = document.getElementById('ml-salvar');
  btn.disabled = true;
  btn.textContent = 'Salvando...';

  try {
    let resultado;
    if (existente) {
      resultado = await session.sb.from('ligacoes').update(payload).eq('id', existente.id);
    } else {
      payload.id = 'lig_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      resultado = await session.sb.from('ligacoes').insert(payload);
    }

    if (resultado.error) throw new Error(resultado.error.message);

    const modal = document.getElementById('lig-modal');
    const acaoId = modal ? modal._acaoId : null;
    modal.classList.remove('show');

    toast('✓ Ligação ' + (existente ? 'atualizada' : 'registrada') + '!', 2500);

    if (acaoId && window._marcarAcaoTratada) {
      window._marcarAcaoTratada(acaoId);
    }

    const dados = await sbCarregarTudo();
    aplicarDadosDoBanco(dados);
    renderLigacoes();
  } catch (e) {
    btn.disabled = false;
    btn.textContent = '✓ Salvar';
    toast('❌ ' + e.message, 3500);
  }
}