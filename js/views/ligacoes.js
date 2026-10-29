// ============================================================
// views/ligacoes.js — Histórico e Cadastro de Ligações
// ============================================================

import { state, ui } from '../state.js';
import { fmtBRL, escapeHtml, isoDate, fmtDataBR, normalizarNomeCliente, toast } from '../utils.js';
import { filialNoEscopo } from '../calc.js';
import { sbCarregarTudo, aplicarDadosDoBanco } from '../supabase.js';

const STATUS = {
  prospeccao:     { label: 'Prospecção',       emoji: '🔵', cor: 'var(--af-t2)' },
  retornar:       { label: 'Retornar',         emoji: '🟡', cor: 'var(--af-amarelo)' },
  aguardando:     { label: 'Aguardando',       emoji: '🔴', cor: 'var(--af-vermelho)' },
  venda:          { label: 'Venda',            emoji: '🟢', cor: 'var(--af-verde)' },
  sem_interesse:  { label: 'Sem interesse',    emoji: '⚫', cor: 'var(--af-t3)' }
};

export function renderLigacoes() {
  const kpiEl = document.getElementById('ligacoes-kpis');
  const tbody = document.getElementById('tbody-ligacoes');
  const countEl = document.getElementById('ligacoes-count');
  if (!tbody) return;

  const selVend = document.getElementById('filtro-lig-vendedor');
  if (selVend && selVend.options.length <= 1) {
    let opts = '<option value="">Todos vendedores</option>';
    state.vendedores.filter(v => v.ativo && v.papel === 'vendedor').forEach(v => {
      opts += `<option value="${v.id}">${escapeHtml(v.nome)}</option>`;
    });
    selVend.innerHTML = opts;
  }

  const fBusca = (document.getElementById('filtro-lig-busca')?.value || '').toUpperCase();
  const fVend = selVend?.value || ui.modoVendedor || '';
  const fStatus = document.getElementById('filtro-lig-status')?.value || '';

  let ligacoes = (state.ligacoes || []).filter(l => filialNoEscopo(l.filialId, ui.escopoAtual));

  const filtradas = ligacoes.filter(l => {
    if (fVend && l.vendedor !== fVend) return false;
    if (fStatus && l.status !== fStatus) return false;
    if (fBusca && !l.empresa.toUpperCase().includes(fBusca)) return false;
    return true;
  });

  filtradas.sort((a, b) => (b.data || '').localeCompare(a.data || ''));

  const totalLig = filtradas.length;
  const vendas = filtradas.filter(l => l.status === 'venda');
  const valorGerado = vendas.reduce((s, l) => s + (l.valor || 0), 0);
  const taxaConversao = totalLig > 0 ? (vendas.length / totalLig) * 100 : 0;

  kpiEl.innerHTML = `
    <div class="kpi-card">
      <div class="kpi-header">LIGAÇÕES REALIZADAS</div>
      <div class="kpi-value">${totalLig}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-header">CONVERSÃO EM VENDA</div>
      <div class="kpi-value" style="color:var(--af-verde)">${taxaConversao.toFixed(1)}%</div>
      <div class="kpi-hint">${vendas.length} vendas fechadas</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-header">VALOR GERADO</div>
      <div class="kpi-value">${fmtBRL(valorGerado)}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-header">RETORNOS PENDENTES</div>
      <div class="kpi-value" style="color:var(--af-amarelo)">${filtradas.filter(l => l.proximo && l.status !== 'venda' && l.status !== 'sem_interesse').length}</div>
    </div>
  `;

  if (countEl) countEl.textContent = filtradas.length + ' ligações';

  if (filtradas.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:32px; color:#888;">Nenhuma ligação encontrada.</td></tr>';
    return;
  }

  tbody.innerHTML = filtradas.slice(0, 500).map(l => {
    const v = state.vendedores.find(x => x.id === l.vendedor);
    const st = STATUS[l.status] || STATUS.prospeccao;
    const proxTxt = l.proximo ? fmtDataBR(l.proximo) : '—';

    return `
      <tr>
        <td data-label="Data">${fmtDataBR(l.data)}</td>
        <td data-label="Vendedor"><strong>${escapeHtml(v ? v.nome : '—')}</strong></td>
        <td data-label="Empresa">${escapeHtml(l.empresa)}</td>
        <td data-label="Status">
          <span class="badge" style="background:${st.cor}15; color:${st.cor}; border:1px solid ${st.cor}30;">
            ${st.emoji} ${st.label}
          </span>
        </td>
        <td class="num" data-label="Valor">${l.valor > 0 ? fmtBRL(l.valor) : '—'}</td>
        <td class="num" data-label="Próximo">${proxTxt}</td>
        <td data-label="Observações" style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; color: var(--af-t3);" title="${escapeHtml(l.obs || '')}">
          ${escapeHtml(l.obs || '—')}
        </td>
      </tr>
    `;
  }).join('');
}

// O parâmetro onSave é novo: é uma função que roda após salvar com sucesso
export function abrirModalLigacao(ligacaoId, prefill, onSave) {
  const existente = ligacaoId ? state.ligacoes.find(l => l.id === ligacaoId) : null;
  prefill = prefill || {};

  let html = '<div style="margin:0;">';
  html += '<h2 style="margin-bottom:20px; font-size:18px;">' + (existente ? '✏️ Editar ligação' : '📞 Nova ligação') + '</h2>';

  html += '<div class="modal-form-grid">';

  html += '<div class="modal-input-group"><label>Vendedor</label><select id="ml-vend">';
  state.vendedores.filter(v => v.ativo && v.papel === 'vendedor').forEach(v => {
    const sel = (existente && existente.vendedor === v.id) || (prefill.vendedor && prefill.vendedor === v.id) || (!existente && !prefill.vendedor && ui.modoVendedor === v.id);
    html += '<option value="' + escapeHtml(v.id) + '"' + (sel ? ' selected' : '') + '>' + escapeHtml(v.nome) + '</option>';
  });
  html += '</select></div>';

  const dataDefault = existente ? existente.data : isoDate(new Date());
  html += '<div class="modal-input-group"><label>Data</label><input type="date" id="ml-data" value="' + dataDefault + '"></div>';

  const codigoVal = existente ? (existente.codigo || '') : (prefill.codigo || '');
  const empresaVal = existente ? (existente.empresa || '') : (prefill.empresa || '');
  html += '<div class="modal-input-group"><label>Código</label><input type="text" id="ml-codigo" value="' + escapeHtml(codigoVal) + '"></div>';
  html += '<div class="modal-input-group"><label>Empresa *</label><input type="text" id="ml-empresa" value="' + escapeHtml(empresaVal) + '"></div>';

  const contatoVal = existente ? (existente.contato || '') : (prefill.contato || '');
  const telefoneVal = existente ? (existente.telefone || '') : (prefill.telefone || '');
  html += '<div class="modal-input-group"><label>Contato</label><input type="text" id="ml-contato" value="' + escapeHtml(contatoVal) + '"></div>';
  html += '<div class="modal-input-group"><label>Telefone</label><input type="tel" id="ml-telefone" value="' + escapeHtml(telefoneVal) + '"></div>';

  const cidadeVal = existente ? (existente.cidade || '') : (prefill.cidade || '');
  const estadoVal = existente ? (existente.estado || 'PA') : (prefill.estado || 'PA');
  html += '<div class="modal-input-group"><label>Cidade</label><input type="text" id="ml-cidade" value="' + escapeHtml(cidadeVal) + '"></div>';
  html += '<div class="modal-input-group"><label>UF</label><input type="text" id="ml-estado" maxlength="2" value="' + escapeHtml(estadoVal) + '"></div>';

  html += '<div class="modal-input-group"><label>Status</label><select id="ml-status">';
  Object.keys(STATUS).forEach(k => {
    html += '<option value="' + k + '"' + (existente && existente.status === k ? ' selected' : '') + '>' + STATUS[k].emoji + ' ' + STATUS[k].label + '</option>';
  });
  html += '</select></div>';

  html += '<div class="modal-input-group"><label>Valor (R$)</label><input type="text" inputmode="decimal" id="ml-valor" value="' + (existente && existente.valor > 0 ? existente.valor : '') + '"></div>';

  html += '<div class="modal-input-group full-width"><label>Próximo contato</label><input type="date" id="ml-proximo" value="' + (existente && existente.proximo ? existente.proximo : '') + '"></div>';
  
  html += '<div class="modal-input-group full-width"><label>Observações</label>' +
    '<textarea id="ml-obs" style="min-height:80px; resize:vertical;">' + (existente ? escapeHtml(existente.obs || '') : '') + '</textarea></div>';

  html += '</div>';

  html += '<div style="display:flex;justify-content:flex-end;gap:12px;margin-top:24px; border-top:1px solid #eee; padding-top:20px;">';
  html += '<button class="btn" id="ml-cancelar">Cancelar</button>';
  html += '<button class="btn btn-primary" id="ml-salvar">✓ ' + (existente ? 'Atualizar' : 'Salvar') + '</button>';
  html += '</div>';

  html += '</div>';

  let modal = document.getElementById('lig-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'lig-modal';
    modal.className = 'modal';
    modal.innerHTML = '<div class="modal-content" style="max-width:600px; padding:32px;"></div>';
    document.body.appendChild(modal);
  }
  modal.querySelector('.modal-content').innerHTML = html;
  modal.classList.add('show');
  modal._acaoId = prefill.acaoId || null;
  modal._onSave = onSave;

  modal.onclick = e => { if (e.target.id === 'lig-modal') modal.classList.remove('show'); };
  document.getElementById('ml-cancelar').onclick = () => modal.classList.remove('show');
  document.getElementById('ml-salvar').onclick = () => salvarLigacao(existente);
  setTimeout(() => document.getElementById('ml-empresa')?.focus(), 100);
}

async function salvarLigacao(existente) {
  const empresa = document.getElementById('ml-empresa').value.trim();
  if (!empresa) { toast('Empresa obrigatória.', 2500); return; }

  const vendedor = document.getElementById('ml-vend').value;
  const data = document.getElementById('ml-data').value;
  if (!data) { toast('Data obrigatória.', 2500); return; }

  const filialId = session.vendedor ? session.vendedor.filial_id : (state.filiais[0] ? state.filiais[0].id : null);
  if (!filialId) { toast('Sem filial definida.', 2500); return; }

  const valorTxt = document.getElementById('ml-valor').value || '0';
  const valor = parseFloat(String(valorTxt).replace(/\./g, '').replace(',', '.')) || 0;

  const payload = {
    filial_id: filialId,
    vendedor_id: vendedor,
    data: data,
    codigo: document.getElementById('ml-codigo').value.trim() || null,
    empresa: empresa,
    cliente_norm: normalizarNomeCliente(empresa),
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
    const callback = modal ? modal._onSave : null;
    modal.classList.remove('show');

    toast('✓ Ligação ' + (existente ? 'atualizada' : 'registrada') + '!', 2500);

    if (acaoId && window._marcarAcaoTratada) {
      window._marcarAcaoTratada(acaoId);
    }

    const dados = await sbCarregarTudo(true);
    aplicarDadosDoBanco(dados);
    
    renderLigacoes();
    if (window._renderPainel) window._renderPainel();

    // Executa o callback se existir (usado pelo Modo Foco)
    if (typeof callback === 'function') {
      callback();
    }

  } catch (e) {
    btn.disabled = false;
    btn.textContent = '✓ Salvar';
    toast('❌ ' + e.message, 3500);
  }
}