// ============================================================
// views/config.js — Importação, Metas, Lançamentos, Filiais e Geral
// ============================================================

import { state, ui, session, basesPreview, salvar } from '../state.js';
import { derivarHistorico } from '../calc.js';
import {
  fmtBRL, fmtNum, fmtPct, parseValorBR, isoDate, escapeHtml,
  toast, copiarTexto, normalizarNomeCliente
} from '../utils.js';
import {
  filialNoEscopo, matchVendedor, mesclarCliente, mesclarProduto,
  escopoFilialAtiva, calcVendedor
} from '../calc.js';
import {
  importar324, importar740, importar361, importarComparativo,
  renderBasesStatus
} from '../importer.js';
import {
  construirMapaVendedores, sbSincronizarBasesPendentes, sbCarregarTudo,
  aplicarDadosDoBanco
} from '../supabase.js';

import { renderPainel, renderHistorico, renderAcoesPainel, renderSemana } from './painel.js';
import { renderClientes } from './clientes.js';
import { renderProdutos } from './produtos.js';
import { renderComparativo, renderCidades, renderFabricantes } from './analise.js';

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

// ============================================================
// NOVA CONFIGURAÇÃO DE IMPORTAR E METAS (Cockpit)
// ============================================================

export function setupConfig() {
  // 1. Configurar Dropzones
  setupDrop('drop-erp', 'erp-input', (files) => importar324(files, ui.escopoAtual), true);
  setupDrop('drop-740', 'input-740', (files) => importar740(files, ui.escopoAtual), true);
  setupDrop('drop-abc', 'abc-input', (files) => importar361(files, ui.escopoAtual), true);

  // 2. Botão Salvar Bases
  const btnSalvar = document.getElementById('btn-salvar-bases');
  if (btnSalvar) btnSalvar.onclick = salvarBases;

  // 3. Eventos da Tabela de Metas
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

function setupDrop(dropId, inputId, handler, multiplos) {
  const d = document.getElementById(dropId);
  const i = document.getElementById(inputId);
  if (!d || !i) return;

  d.onclick = () => i.click();
  i.onchange = e => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) handler(multiplos ? files : files[0]);
    e.target.value = '';
  };
  d.ondragover = e => { e.preventDefault(); d.classList.add('over'); };
  d.ondragleave = () => d.classList.remove('over');
  d.ondrop = e => {
    e.preventDefault();
    d.classList.remove('over');
    const files = Array.from(e.dataTransfer.files || []).filter(f => f.name.match(/\.(xlsx|xls)$/i));
    if (files.length > 0) handler(multiplos ? files : files[0]);
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

  // Preenche o select de meses (últimos 12 meses)
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

    return `
      <tr data-idx="${i}">
        <td><input type="text" data-field="nome" value="${escapeHtml(v.nome)}"></td>
        <td><input type="email" data-field="email" value="${escapeHtml(v.email || '')}" placeholder="email@..."></td>
        <td><select data-field="filialId">${filialOpts}</select></td>
        <td class="num"><input type="text" data-field="meta" value="${metaVal}" style="text-align:right;"></td>
        <td class="num"><input type="text" data-field="metaTicket" value="${metaTkt}" style="text-align:right;"></td>
        <td style="text-align:center;"><input type="checkbox" data-field="adm" ${isAdm ? 'checked' : ''}></td>
        <td style="text-align:center;"><input type="checkbox" data-field="ativo" ${v.ativo ? 'checked' : ''}></td>
        <td style="text-align:center;">
          <button class="btn btn-sm" data-remover="${i}" style="color:var(--af-vermelho);">✕</button>
        </td>
      </tr>
    `;
  }).join('');

  // Evento de remover
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
  const temPendencia = basesPreview.clientes || basesPreview.produtos || basesPreview.vendasItens || basesPreview.lancamentosMulti;
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
    
    toast('✓ Bases sincronizadas com sucesso!');
    renderConfig();
    
    if (window._popularEscopoSelect) window._popularEscopoSelect();
    
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

  // Lê a tabela e monta os objetos
  rows.forEach(tr => {
    const idx = parseInt(tr.dataset.idx, 10);
    const orig = state.vendedores[idx];
    if (!orig) return;

    const nome = tr.querySelector('[data-field="nome"]').value.trim();
    const email = tr.querySelector('[data-field="email"]').value.trim();
    const filialId = tr.querySelector('[data-field="filialId"]').value;
    const metaVal = parseValorBR(tr.querySelector('[data-field="meta"]').value) || 0;
    const metaTkt = parseValorBR(tr.querySelector('[data-field="metaTicket"]').value) || 0;
    const isAdm = tr.querySelector('[data-field="adm"]').checked;
    const ativo = tr.querySelector('[data-field="ativo"]').checked;

    const papel = isAdm ? 'administrativo' : 'vendedor';

    if (orig.id && !orig.id.startsWith('novo_')) {
      vendedoresAtualizados.push({
        id: orig.id, nome, email: email || null, filial_id: filialId, papel, ativo
      });
    }

    if (papel === 'vendedor' && (metaVal > 0 || metaTkt > 0) && orig.id && !orig.id.startsWith('novo_')) {
      metasDoMes.push({
        vendedor_id: orig.id,
        mes: mesRef,
        meta_faturamento: metaVal,
        meta_ticket: metaTkt
      });
    }
  });

  try {
    // 1. Atualiza os vendedores existentes
    for (const v of vendedoresAtualizados) {
      await session.sb.from('vendedores').update({
        nome: v.nome, email: v.email, filial_id: v.filial_id, papel: v.papel, ativo: v.ativo
      }).eq('id', v.id);
    }

    // 2. Substitui as metas do mês
    await session.sb.from('metas').delete().eq('mes', mesRef);
    if (metasDoMes.length > 0) {
      await session.sb.from('metas').insert(metasDoMes);
    }

    toast('✓ Metas e vendedores salvos no servidor!');
    
    // Recarrega os dados
    const dados = await sbCarregarTudo();
    aplicarDadosDoBanco(dados);
    renderConfig();

  } catch (e) {
    toast('❌ ' + e.message);
    console.error(e);
  } finally {
    if(btn) { btn.disabled = false; btn.textContent = '☁️ Salvar no Servidor'; }
  }
}

// ============================================================
// FUNÇÕES LEGADAS (Mantidas para não quebrar o resto do app)
// ============================================================

export function setupImports() { setupConfig(); }
export function setupLancar() {}
export function setupMetas() {}
export function setupFiliais() {}
export function setupGeral() {}

export function renderTudo() {
  try { renderPainel(); } catch (e) { console.error('renderPainel', e); }
  try { renderClientes(); } catch (e) { console.error('renderClientes', e); }
  try { renderProdutos(); } catch (e) { console.error('renderProdutos', e); }
  try { renderConfig(); } catch (e) { console.error('renderConfig', e); }
}