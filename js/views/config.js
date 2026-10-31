// ============================================================
// views/config.js — Importação, Metas e Vendedores
// ============================================================

import { state, ui, session, basesPreview, salvar } from '../state.js';
import { toast, escapeHtml, parseValorBR } from '../utils.js';
import { derivarHistorico } from '../calc.js';
import { importar324, importar740, importar361, renderBasesStatus } from '../importer.js';
import { sbSincronizarBasesPendentes, sbCarregarTudo, aplicarDadosDoBanco } from '../supabase.js';

export function setupConfig() {
  setupDrop('drop-erp', 'erp-input', (files) => importar324(files, ui.escopoAtual), true, 'erp-status');
  setupDrop('drop-740', 'input-740', (files) => importar740(files, ui.escopoAtual), true, 'status-740');
  setupDrop('drop-abc', 'abc-input', (files) => importar361(files, ui.escopoAtual), true, 'abc-status-import');

  const btnSalvar = document.getElementById('btn-salvar-bases');
  if (btnSalvar) btnSalvar.onclick = salvarBases;

  const btnAddVend = document.getElementById('btn-add-vend');
  if (btnAddVend) {
    btnAddVend.onclick = () => {
      state.vendedores.push({
        id: 'novo_' + Date.now(), nome: 'NOVO VENDEDOR', email: '',
        meta: 0, metaTicket: 0, ativo: true, papel: 'vendedor',
        filialId: state.filiais[0] ? state.filiais[0].id : null
      });
      renderConfig();
    };
  }

  const btnSincMetas = document.getElementById('btn-sinc-metas');
  if (btnSincMetas) btnSincMetas.onclick = salvarMetasServidor;

  const selMes = document.getElementById('meta-mes-select');
  if (selMes) selMes.onchange = (e) => {
    ui.mesVendedoresSelecionado = e.target.value;
    renderConfig();
  };
}

function setupDrop(dropId, inputId, handler, multiplos, statusId) {
  const d = document.getElementById(dropId);
  const i = document.getElementById(inputId);
  const statusEl = document.getElementById(statusId);
  if (!d || !i) return;

  i.style.display = 'block';
  i.style.position = 'absolute';
  i.style.inset = '0';
  i.style.opacity = '0';
  i.style.cursor = 'pointer';
  i.style.width = '100%';
  i.style.height = '100%';
  i.style.zIndex = '10';
  
  d.style.position = 'relative';
  d.appendChild(i);

  i.onchange = async e => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    
    if (statusEl) {
      statusEl.style.color = 'var(--af-t2)';
      statusEl.textContent = `⏳ Lendo ${files.length} arquivo(s)...`;
    }
    
    try {
      await handler(multiplos ? files : files[0]);
      if (statusEl) {
        statusEl.style.color = 'var(--af-verde)';
        statusEl.textContent = `✓ ${files.length} arquivo(s) processado(s). Clique em "Salvar e Sincronizar".`;
      }
      toast('✓ Arquivo lido! Clique em "Salvar e Sincronizar".', 4000);
      renderBasesStatus();
    } catch (err) {
      if (statusEl) {
        statusEl.style.color = 'var(--af-vermelho)';
        statusEl.textContent = `❌ Erro: ${err.message}`;
      }
      toast('❌ Erro: ' + err.message, 4000);
    }
    e.target.value = '';
  };
  
  d.ondragover = e => { e.preventDefault(); d.classList.add('over'); };
  d.ondragleave = () => d.classList.remove('over');
  d.ondrop = async e => {
    e.preventDefault();
    d.classList.remove('over');
    const files = Array.from(e.dataTransfer.files || []).filter(f => f.name.match(/\.(xlsx|xls)$/i));
    if (files.length === 0) return;

    if (statusEl) {
      statusEl.style.color = 'var(--af-t2)';
      statusEl.textContent = `⏳ Lendo ${files.length} arquivo(s)...`;
    }

    try {
      await handler(multiplos ? files : files[0]);
      if (statusEl) {
        statusEl.style.color = 'var(--af-verde)';
        statusEl.textContent = `✓ ${files.length} arquivo(s) processado(s). Clique em "Salvar e Sincronizar".`;
      }
      toast('✓ Arquivo lido! Clique em "Salvar e Sincronizar".', 4000);
      renderBasesStatus();
    } catch (err) {
      if (statusEl) {
        statusEl.style.color = 'var(--af-vermelho)';
        statusEl.textContent = `❌ Erro: ${err.message}`;
      }
      toast('❌ Erro: ' + err.message, 4000);
    }
  };
}

export function renderConfig() {
  renderBasesStatus();
  renderTabelaMetas();
}

function renderTabelaMetas() {
  const tbody = document.getElementById('tbody-metas');
  const selMes = document.getElementById('meta-mes-select');
  if (!tbody || !selMes) return;

  if (selMes.options.length === 0) {
    const hoje = new Date();
    let opts = '';
    for (let i = -3; i <= 6; i++) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1);
      const val = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      const label = d.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
      opts += `<option value="${val}">${label.toUpperCase()}</option>`;
    }
    selMes.innerHTML = opts;
    ui.mesVendedoresSelecionado = ui.mesVendedoresSelecionado || (hoje.getFullYear() + '-' + String(hoje.getMonth() + 1).padStart(2, '0'));
    selMes.value = ui.mesVendedoresSelecionado;
  }

  const mesRef = ui.mesVendedoresSelecionado;

  tbody.innerHTML = state.vendedores.map((v, i) => {
    const filialOpts = state.filiais.map(f => 
      `<option value="${f.id}" ${f.id === v.filialId ? 'selected' : ''}>${f.nome}</option>`
    ).join('');

    const metaDoMes = state.metas.find(m => m.vendedorId === v.id && m.mes === mesRef);
    const metaVal = metaDoMes ? metaDoMes.metaFaturamento : (v.meta || 0);
    const metaTkt = metaDoMes ? metaDoMes.metaTicket : (v.metaTicket || 0);

    const isAdm = v.papel === 'administrativo';
    const isDiretor = v.papel === 'diretor';

    return `
      <tr data-idx="${i}">
        <td><input type="text" data-field="nome" value="${escapeHtml(v.nome)}"></td>
        <td><input type="email" data-field="email" value="${escapeHtml(v.email || '')}" placeholder="email@..."></td>
        <td><select data-field="filialId">${filialOpts}</select></td>
        <td class="num"><input type="text" data-field="meta" value="${metaVal}" style="text-align:right;"></td>
        <td class="num"><input type="text" data-field="metaTicket" value="${metaTkt}" style="text-align:right;"></td>
        <td style="text-align:center;">
          ${isDiretor ? '<span class="badge neutral" style="background:#E0E7FF;color:#3730A3;">DIRETOR</span>' : `<input type="checkbox" data-field="adm" ${isAdm ? 'checked' : ''}>`}
        </td>
        <td style="text-align:center;"><input type="checkbox" data-field="ativo" ${v.ativo ? 'checked' : ''}></td>
        <td style="text-align:center;">
          <button class="btn btn-sm" data-remover="${i}" style="color:var(--af-vermelho);">✕</button>
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('[data-remover]').forEach(b => {
    b.onclick = () => {
      const idx = parseInt(b.dataset.remover, 10);
      if (confirm('Remover vendedor?')) {
        state.vendedores.splice(idx, 1);
        renderTabelaMetas();
      }
    };
  });
}

export async function salvarBases() {
  const temPendencia = basesPreview.clientes || basesPreview.produtos || basesPreview.vendasItens || basesPreview.lancamentosMulti || basesPreview.cidades;
  if (!temPendencia) {
    toast('Nenhuma base nova para salvar.');
    return;
  }

  const btn = document.getElementById('btn-salvar-bases');
  if(btn) { btn.disabled = true; btn.textContent = 'Sincronizando...'; }

  try {
    await sbSincronizarBasesPendentes();
    const dados = await sbCarregarTudo();
    aplicarDadosDoBanco(dados);
    derivarHistorico();
    
    toast('✓ Bases sincronizadas com sucesso!');
    renderConfig();
    
    if (window._popularEscopoSelect) window._popularEscopoSelect();
    
    if (window._renderTudo) {
      window._renderTudo();
    }
    
  } catch (e) {
    toast('❌ Erro: ' + e.message);
    console.error(e);
  } finally {
    if(btn) { btn.disabled = false; btn.textContent = '✓ Salvar e Sincronizar'; }
  }
}

async function salvarMetasServidor() {
  if (!session.vendedor || session.vendedor.papel !== 'diretor') {
    toast('Apenas diretores podem salvar metas no servidor.');
    return;
  }

  const btn = document.getElementById('btn-sinc-metas');
  if(btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }

  const rows = document.querySelectorAll('#tbody-metas tr');
  const mesRef = ui.mesVendedoresSelecionado;
  const metasDoMes = [];
  const vendedoresAtualizados = [];

  rows.forEach(tr => {
    const idx = parseInt(tr.dataset.idx, 10);
    const orig = state.vendedores[idx];
    if (!orig) return;

    const nome = tr.querySelector('[data-field="nome"]').value.trim();
    const email = tr.querySelector('[data-field="email"]').value.trim();
    const filialId = tr.querySelector('[data-field="filialId"]').value;
    const metaVal = parseValorBR(tr.querySelector('[data-field="meta"]').value) || 0;
    const metaTkt = parseValorBR(tr.querySelector('[data-field="metaTicket"]').value) || 0;
    
    // Lógica corrigida para não rebaixar o Diretor
    let papel = 'vendedor';
    if (orig.papel === 'diretor') {
      papel = 'diretor';
    } else {
      const isAdm = tr.querySelector('[data-field="adm"]')?.checked || false;
      papel = isAdm ? 'administrativo' : 'vendedor';
    }

    const ativo = tr.querySelector('[data-field="ativo"]').checked;

    if (orig.id && !orig.id.startsWith('novo_')) {
      vendedoresAtualizados.push({
        id: orig.id, nome, email: email || null, filial_id: filialId, papel, ativo
      });
    }

    if (papel === 'vendedor' && (metaVal > 0 || metaTkt > 0) && orig.id && !orig.id.startsWith('novo_')) {
      metasDoMes.push({
        vendedor_id: orig.id, mes: mesRef,
        meta_faturamento: metaVal, meta_ticket: metaTkt
      });
    }
  });

  try {
    for (const v of vendedoresAtualizados) {
      await session.sb.from('vendedores').update({
        nome: v.nome, email: v.email, filial_id: v.filial_id, papel: v.papel, ativo: v.ativo
      }).eq('id', v.id);
    }

    await session.sb.from('metas').delete().eq('mes', mesRef);
    if (metasDoMes.length > 0) {
      await session.sb.from('metas').insert(metasDoMes);
    }

    toast('✓ Metas e vendedores salvos no servidor!');
    
    const dados = await sbCarregarTudo();
    aplicarDadosDoBanco(dados);
    renderConfig();

    if (window._renderTudo) window._renderTudo();

  } catch (e) {
    toast('❌ ' + e.message);
    console.error(e);
  } finally {
    if(btn) { btn.disabled = false; btn.textContent = '☁️ Salvar no Servidor'; }
  }
}

export function renderTudo() {
  import('./painel.js').then(m => m.renderPainel()).catch(console.error);
  import('./agenda.js').then(m => m.renderAgenda()).catch(console.error);
  import('./clientes.js').then(m => m.renderClientes()).catch(console.error);
  import('./equipe.js').then(m => m.renderEquipe()).catch(console.error);
  import('./produtos.js').then(m => m.renderProdutos()).catch(console.error);
  import('./analise.js').then(m => m.renderAnalise()).catch(console.error);
  renderConfig();
}