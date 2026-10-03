// ============================================================
// views/ligacoes.js — Tela de Ligações (TeleVendas migrado)
// ============================================================

import { state, ui, session } from '../state.js';
import { fmtBRL, escapeHtml, isoDate, diffDias, fmtDataBR, toast, copiarTexto } from '../utils.js';
import { filialNoEscopo, parseEscopo, escopoNome } from '../calc.js';
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
  const preset = document.getElementById('filtro-lig-periodo')?.value || 'tudo';
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

  popularSelectVendedor(base);

  const periodo = calcularPeriodo();
  const busca = (document.getElementById('filtro-lig-busca')?.value || '').toUpperCase();
  const filtroVend = document.getElementById('filtro-lig-vend')?.value || '';
  const filtroStatus = document.getElementById('filtro-lig-status')?.value || '';
  const filtroConv = document.getElementById('filtro-lig-conversao')?.value || '';

  const filtradas = base.filter(l => {
    if (periodo) {
      if (!l.data || l.data < periodo.ini || l.data > periodo.fim) return false;
    }
    if (filtroVend && l.vendedor !== filtroVend) return false;
    if (filtroStatus && l.status !== filtroStatus) return false;

    const temVenda = !!mapaVendas[l.id];
    if (filtroConv === 'sim' && !temVenda) return false;
    if (filtroConv === 'nao' && temVenda) return false;

    if (busca) {
      const alvo = [l.empresa, l.cidade, l.codigo, l.obs, l.contato].filter(Boolean).join(' ').toUpperCase();
      if (alvo.indexOf(busca) < 0) return false;
    }
    return true;
  });

  // KPIs
  const totalLig = filtradas.length;
  const ligComVenda = filtradas.filter(l => mapaVendas[l.id]);
  const valorAtribuido = ligComVenda.reduce((s, l) => s + (mapaVendas[l.id].valorVenda || 0), 0);
  const taxaConversao = totalLig > 0 ? (ligComVenda.length / totalLig) * 100 : 0;
  const valorMedioVenda = ligComVenda.length > 0 ? valorAtribuido / ligComVenda.length : 0;

  kpisEl.innerHTML =
    '<div class="kpi"><div class="label">Ligações</div>' +
    '<div class="value">' + totalLig + '</div>' +
    '<div class="hint">de ' + base.length + ' no total</div></div>' +
    '<div class="kpi positivo"><div class="label">Vendas atribuídas</div>' +
    '<div class="value">' + ligComVenda.length + '</div>' +
    '<div class="hint">via ligação (30d)</div></div>' +
    '<div class="kpi positivo"><div class="label">Valor atribuído</div>' +
    '<div class="value">' + fmtBRL(valorAtribuido) + '</div>' +
    '<div class="hint">ticket médio ' + fmtBRL(valorMedioVenda) + '</div></div>' +
    '<div class="kpi ' + (taxaConversao >= 20 ? 'positivo' : 'negativo') + '">' +
    '<div class="label">Conversão</div>' +
    '<div class="value">' + taxaConversao.toFixed(1) + '%</div>' +
    '<div class="hint">ligações que viraram venda</div></div>';

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
      '<td style="font-size:11px;">' + (l.proximo ? fmtDataBR(l.proximo) : '—') + '</td>' +
      '<td><button class="btn btn-sm" data-editar-lig="' + escapeHtml(l.id) + '">✏️</button></td>' +
      '</tr>';
  }).join('');

  tbody.querySelectorAll('[data-editar-lig]').forEach(b => {
    b.onclick = () => abrirModalLigacao(b.dataset.editarLig);
  });
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

export function abrirModalLigacao(ligacaoId) {
  const existente = ligacaoId ? state.ligacoes.find(l => l.id === ligacaoId) : null;

  let html = '<div class="card" style="margin:0;border:none;">';
  html += '<h2>' + (existente ? '✏️ Editar ligação' : '📞 Nova ligação') + '</h2>';

  html += '<div class="form-row">';
  html += '<div><label>Vendedor</label><select id="ml-vend">';
  state.vendedores.filter(v => v.ativo && v.papel !== 'administrativo' && v.papel !== 'diretor')
    .forEach(v => {
      html += '<option value="' + escapeHtml(v.id) + '"' +
        (existente && existente.vendedor === v.id ? ' selected' : '') +
        (ui.modoVendedor === v.id ? ' selected' : '') + '>' + escapeHtml(v.nome) + '</option>';
    });
  html += '</select></div>';

  html += '<div><label>Data</label><input type="date" id="ml-data" value="' +
    (existente ? existente.data : isoDate(new Date())) + '"></div>';
  html += '</div>';

  html += '<div class="form-row">';
  html += '<div><label>Código</label><input type="text" id="ml-codigo" value="' +
    (existente ? escapeHtml(existente.codigo || '') : '') + '"></div>';
  html += '<div><label>Empresa *</label><input type="text" id="ml-empresa" value="' +
    (existente ? escapeHtml(existente.empresa || '') : '') + '"></div>';
  html += '</div>';

  html += '<div class="form-row">';
  html += '<div><label>Contato</label><input type="text" id="ml-contato" value="' +
    (existente ? escapeHtml(existente.contato || '') : '') + '"></div>';
  html += '<div><label>Telefone</label><input type="tel" id="ml-telefone" value="' +
    (existente ? escapeHtml(existente.telefone || '') : '') + '"></div>';
  html += '</div>';

  html += '<div class="form-row">';
  html += '<div><label>Cidade</label><input type="text" id="ml-cidade" value="' +
    (existente ? escapeHtml(existente.cidade || '') : '') + '"></div>';
  html += '<div><label>UF</label><input type="text" id="ml-estado" maxlength="2" value="' +
    (existente ? escapeHtml(existente.estado || '') : 'PA') + '"></div>';
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

  // Reaproveita o modal de help mas cria um próprio
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

  modal.onclick = e => {
    if (e.target.id === 'lig-modal') modal.classList.remove('show');
  };

  document.getElementById('ml-cancelar').onclick = () => modal.classList.remove('show');
  document.getElementById('ml-salvar').onclick = () => salvarLigacao(existente);
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

    document.getElementById('lig-modal').classList.remove('show');
    toast('✓ Ligação ' + (existente ? 'atualizada' : 'registrada') + '!', 2500);

    const dados = await sbCarregarTudo();
    aplicarDadosDoBanco(dados);
    renderLigacoes();
  } catch (e) {
    btn.disabled = false;
    btn.textContent = '✓ Salvar';
    toast('❌ ' + e.message, 3500);
  }
}