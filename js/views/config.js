// ============================================================
// views/config.js — Importação, Metas e Vendedores
// ============================================================

import { state, ui, session, basesPreview, salvar } from '../state.js';
import { toast, escapeHtml, parseValorBR } from '../utils.js';
import { derivarHistorico } from '../calc.js';
import { importar324, importar740, importar361, importarCadastroClientes, renderBasesStatus } from '../importer.js';
import { sbSincronizarBasesPendentes, sbCarregarTudo, aplicarDadosDoBanco, sbTransferirCarteira } from '../supabase.js';

export function setupConfig() {
  setupDrop('drop-cadastro', 'cadastro-input', (files) => importarCadastroClientes(files, ui.escopoAtual), true, 'erp-status');
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

  const btnTransferir = document.getElementById('btn-transferir-carteira');
  if (btnTransferir) {
    btnTransferir.onclick = async () => {
      // MUDANÇA AQUI: Agora pega todos os vendedores, não só os ativos
      const todos = state.vendedores.filter(v => v.papel === 'vendedor' || v.papel === 'diretor');
      if (todos.length < 2) { toast('Precisa de pelo menos 2 vendedores cadastrados.'); return; }

      // MUDANÇA AQUI: Adiciona um aviso visual "(Inativo)" para quem não está ativo
      const lista = todos.map((v, i) => {
        const status = v.ativo ? '' : ' (INATIVO)';
        return (i + 1) + ' - ' + v.nome + status;
      }).join('\n');
      
      const origemStr = prompt('QUEM VAI PASSAR A CARTEIRA?\n\n' + lista + '\n\nDigite o número do vendedor de ORIGEM:');
      if (!origemStr) return;
      const origem = todos[parseInt(origemStr, 10) - 1];
      if (!origem) { toast('Origem inválida.'); return; }

      const destinoStr = prompt('PARA QUEM VAI A CARTEIRA?\n\n' + lista + '\n\nDigite o número do vendedor de DESTINO:');
      if (!destinoStr) return;
      const destino = todos[parseInt(destinoStr, 10) - 1];
      if (!destino || destino.id === origem.id) { toast('Destino inválido ou igual à origem.'); return; }

      if (!confirm(`Confirmar transferência?\n\nTodos os clientes de ${origem.nome} passarão para ${destino.nome}.`)) return;

      try {
        btnTransferir.disabled = true;
        btnTransferir.textContent = 'Transferindo...';
        
        const filialId = state.filiais[0] ? state.filiais[0].id : null;
        await sbTransferirCarteira(origem.id, destino.id, filialId);
        
        toast(`✓ Carteira de ${origem.nome} transferida para ${destino.nome}!`);
        
        const dados = await sbCarregarTudo();
        aplicarDadosDoBanco(dados);
        
        if (window._renderTudo) window._renderTudo();
        renderConfig();
        
      } catch (e) {
        toast('❌ ' + e.message, 4000);
      } finally {
        btnTransferir.disabled = false;
        btnTransferir.textContent = '🔄 Transferir Carteira';
      }
    };
  }
  
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
    const isSelf = session.vendedor && session.vendedor.id === v.id; 

    return `
      <tr data-id="${v.id}">
        <td><input type="text" data-field="nome" value="${escapeHtml(v.nome)}"></td>
        <td><input type="email" data-field="email" value="${escapeHtml(v.email || '')}" placeholder="email@..."></td>
        <td><select data-field="filialId">${filialOpts}</select></td>
        <td class="num"><input type="text" data-field="meta" value="${metaVal}" style="text-align:right;"></td>
        <td class="num"><input type="text" data-field="metaTicket" value="${metaTkt}" style="text-align:right;"></td>
        <td style="text-align:center;">
          ${isDiretor || isSelf ? '<span class="badge neutral" style="background:#E0E7FF;color:#3730A3;">DIRETOR</span>' : `<input type="checkbox" data-field="adm" ${isAdm ? 'checked' : ''}>`}
        </td>
        <td style="text-align:center;"><input type="checkbox" data-field="ativo" ${v.ativo ? 'checked' : ''}></td>
        <td style="text-align:center;">
          <button class="btn btn-sm" data-remover="${v.id}" style="color:var(--af-vermelho);">✕</button>
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('[data-remover]').forEach(b => {
    b.onclick = () => {
      const vId = b.dataset.remover;
      if (confirm('Remover vendedor?')) {
        const idx = state.vendedores.findIndex(x => x.id === vId);
        if (idx >= 0) {
          state.vendedores.splice(idx, 1);
          renderTabelaMetas();
        }
      }
    };
  });
}

export async function salvarBases() {
  const temPendencia = basesPreview.clientes || basesPreview.produtos || basesPreview.vendasItens || basesPreview.lancamentosMulti || basesPreview.cidades || basesPreview.cadastroClientes;
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
    const vId = tr.dataset.id;
    const orig = state.vendedores.find(x => x.id === vId);
    if (!orig) return;

    const nome = tr.querySelector('[data-field="nome"]').value.trim();
    const email = tr.querySelector('[data-field="email"]').value.trim();
    const filialId = tr.querySelector('[data-field="filialId"]').value;
    
    // Tratamento para não salvar "NaN" caso o campo esteja vazio
    const metaInput = tr.querySelector('[data-field="meta"]').value;
    const metaVal = metaInput ? (parseValorBR(metaInput) || 0) : 0;
    
    const metaTktInput = tr.querySelector('[data-field="metaTicket"]').value;
    const metaTkt = metaTktInput ? (parseValorBR(metaTktInput) || 0) : 0;
    
    let papel = 'vendedor';
    const isSelf = session.vendedor && session.vendedor.id === orig.id;
    
    if (orig.papel === 'diretor' || isSelf) {
      papel = 'diretor'; 
    } else {
      const isAdm = tr.querySelector('[data-field="adm"]')?.checked || false;
      papel = isAdm ? 'administrativo' : 'vendedor';
    }

    const ativo = tr.querySelector('[data-field="ativo"]').checked;

    vendedoresAtualizados.push({
      id: orig.id, nome, email: email || null, filial_id: filialId, papel, ativo
    });

    // Só envia para a tabela de metas se tiver valor (evita apagar metas existentes com 0)
    if (metaVal > 0 || metaTkt > 0) {
      metasDoMes.push({
        vendedor_id: orig.id, mes: mesRef,
        meta_faturamento: metaVal, meta_ticket: metaTkt
      });
    }
  });

  try {
    // 1. Atualiza Vendedores (ignorando erros individuais para não travar a meta)
    for (const v of vendedoresAtualizados) {
      const r = await session.sb.from('vendedores').update({
        nome: v.nome, email: v.email, filial_id: v.filial_id, papel: v.papel, ativo: v.ativo
      }).eq('id', v.id);
      if (r.error) console.warn('Erro ao atualizar vendedor:', r.error);
    }

    // 2. Atualiza Metas no Banco
    if (metasDoMes.length > 0) {
      // Usa upsert (insere ou atualiza se já existir)
      const r = await session.sb.from('metas').upsert(metasDoMes, { 
        onConflict: 'vendedor_id, mes' 
      });
      
      if (r.error) {
        throw new Error('Erro no banco de metas: ' + r.error.message);
      }
    }

    toast('✓ Metas e vendedores salvos no servidor!');
    
    // 3. Recarrega os dados para atualizar a tela
    const dados = await sbCarregarTudo();
    aplicarDadosDoBanco(dados);
    renderConfig();

    if (window._renderTudo) window._renderTudo();

  } catch (e) {
    toast('❌ ' + e.message, 5000);
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