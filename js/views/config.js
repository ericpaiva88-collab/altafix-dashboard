// ============================================================
// views/config.js — Saúde, Importar, Lançar, Vendedores,
//                   Filiais, Geral, Backup
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

// Imports dos outros views (evita import circular colocando no final)
import { renderPainel, renderHistorico, renderAcoesPainel, renderSemana } from './painel.js';
import { renderClientes } from './clientes.js';
import { renderProdutos } from './produtos.js';
import { renderComparativo, renderCidades, renderFabricantes } from './analise.js';

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

// ============================================================
// DROP ZONES
// ============================================================

export function setupDrop(dropId, inputId, handler, aceitaMultiplos) {
  const d = document.getElementById(dropId);
  const i = document.getElementById(inputId);
  if (!d || !i) return;

  d.onclick = () => i.click();
  i.onchange = e => {
    const files = Array.prototype.slice.call(e.target.files || []);
    if (!files.length) return;
    if (aceitaMultiplos) handler(files); else handler(files[0]);
    e.target.value = '';
  };
  d.ondragover = e => { e.preventDefault(); d.classList.add('over'); };
  d.ondragleave = () => d.classList.remove('over');
  d.ondrop = e => {
    e.preventDefault();
    d.classList.remove('over');
    const files = Array.prototype.slice.call(e.dataTransfer.files || [])
      .filter(f => f.name.match(/\.(xlsx|xls)$/i));
    if (!files.length) return;
    if (aceitaMultiplos) handler(files); else handler(files[0]);
  };
}

export function setupImports() {
  setupDrop('drop-erp', 'erp-input',
    entrada => importar324(entrada, ui.escopoAtual), true);
  setupDrop('drop-740', 'input-740',
    entrada => importar740(entrada, ui.escopoAtual), true);
  setupDrop('drop-abc', 'abc-input',
    entrada => importar361(entrada, ui.escopoAtual), true);
  setupDrop('drop-comp', 'comp-input',
    entrada => importarComparativo(entrada, ui.escopoAtual), false);

  const bs = document.getElementById('btn-salvar-bases');
  if (bs) bs.onclick = salvarBases;
}

// ============================================================
// SALVAR BASES
// ============================================================

export async function salvarBases() {
  let ok = false;
  if (basesPreview.clientes || basesPreview.produtos || basesPreview.cidades ||
      basesPreview.comparativo || basesPreview.estoqueABC) ok = true;
  if (basesPreview.lancamentosMulti && basesPreview.lancamentosMulti.length > 0) ok = true;
  if (basesPreview.vendasItens && basesPreview.vendasItens.length > 0) ok = true;

  if (!ok) { toast('Nada para salvar.'); return; }

  const temSupabase = session.sb && session.vendedor;

  if (temSupabase) {
    try {
      await sbSincronizarBasesPendentes();
    } catch (e) {
      if (!confirm('Falha ao sincronizar: ' + e.message + '\n\nSalvar local mesmo assim?')) return;
    }
  }

  aplicarBasesLocais();

  if (temSupabase) {
    toast('⏳ Recarregando...');
    try {
      const dados = await sbCarregarTudo();
      aplicarDadosDoBanco(dados);
      derivarHistorico();
      popularEscopoSelect();
      popularModoVendedor();
      renderTudo();
      toast('✓ Sincronizado');
    } catch (e) {
      toast('❌ Recarregar: ' + e.message);
    }
  } else {
    renderTudo();
    toast('✓ Salvo local');
  }
}

function aplicarBasesLocais() {
  const fId = basesPreview.filialImport;

  if (basesPreview.clientes) {
    const mapaClientes = {};
    state.clientes.forEach(c => {
      if (c.filialId === fId) mapaClientes[normalizarNomeCliente(c.nome)] = c;
    });
    basesPreview.clientes.forEach(novo => {
      const k = normalizarNomeCliente(novo.nome);
      const ant = mapaClientes[k];
      if (ant) mesclarCliente(ant, novo);
      else state.clientes.push(novo);
    });
  }

  if (basesPreview.produtos) {
    const mesAtualP = basesPreview.dataFim ? basesPreview.dataFim.slice(0, 7) : '';
    if (!state._produtosHistorico) state._produtosHistorico = {};
    if (!state._produtosHistorico[fId]) state._produtosHistorico[fId] = {};

    const mesesOrdP = Object.keys(state._produtosHistorico[fId]).sort();
    const mesAnteriorP = mesesOrdP.length > 0 ? mesesOrdP[mesesOrdP.length - 1] : null;

    if (mesAnteriorP && mesAnteriorP !== mesAtualP) {
      state._produtosSnap = {
        ts: Date.now(),
        mesRef: mesAnteriorP,
        produtos: Object.keys(state._produtosHistorico[fId][mesAnteriorP]).map(cod => ({
          codigo: cod,
          valorVendido: state._produtosHistorico[fId][mesAnteriorP][cod]
        }))
      };
    }

    if (mesAtualP) {
      state._produtosHistorico[fId][mesAtualP] = {};
      basesPreview.produtos.forEach(p => {
        state._produtosHistorico[fId][mesAtualP][p.codigo] = p.valorVendido;
      });
    }

    const mapaProdutos = {};
    state.produtos.forEach(p => { if (p.filialId === fId) mapaProdutos[p.codigo] = p; });
    basesPreview.produtos.forEach(novo => {
      const ant = mapaProdutos[novo.codigo];
      if (ant) mesclarProduto(ant, novo);
      else state.produtos.push(novo);
    });
  }

  if (basesPreview.cidades) {
    const meses = basesPreview._mesesImport && basesPreview._mesesImport.length > 0
      ? basesPreview._mesesImport : null;

    if (meses) {
      meses.forEach(m => {
        const cidsTagged = m.cidades.map(c => Object.assign({}, c, { mesKey: m.mes }));
        state.cidades = state.cidades.filter(c =>
          !(c.filialId === fId && (c.mesKey || '') === m.mes)
        ).concat(cidsTagged);
      });
    } else {
      const mesKeyCid = basesPreview.periodoInicio
        ? basesPreview.periodoInicio.slice(0, 7) : '';
      const cidadesTagged = basesPreview.cidades.map(c =>
        Object.assign({}, c, { mesKey: mesKeyCid })
      );
      state.cidades = state.cidades.filter(c =>
        !(c.filialId === fId && (c.mesKey || '') === mesKeyCid)
      ).concat(cidadesTagged);
    }
    derivarHistorico();
  }

  if (basesPreview.comparativo) {
    basesPreview.comparativo.forEach(novo => {
      const idx = state.comparativo.findIndex(c =>
        c.filialId === novo.filialId && c.mes.toLowerCase() === novo.mes.toLowerCase()
      );
      if (idx >= 0) state.comparativo[idx] = novo;
      else state.comparativo.push(novo);
    });
  }

  const multi = basesPreview.lancamentosMulti || [];
  if (multi.length > 0) {
    const chavesNovas = {};
    multi.forEach(l => {
      const v = state.vendedores.find(x => x.id === l.vendedor);
      const fKey = v ? v.filialId : fId;
      chavesNovas[fKey + '|' + l.vendedor + '|' + l.data] = true;
    });
    state.lancamentos = state.lancamentos.filter(l =>
      !chavesNovas[l.filialId + '|' + l.vendedor + '|' + l.data]
    );
    multi.forEach(l => {
      const v = state.vendedores.find(x => x.id === l.vendedor);
      const fKey = v ? v.filialId : fId;
      state.lancamentos.push({
        id: 'auto_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        data: l.data, vendedor: l.vendedor,
        valor: l.valor, pedidos: l.pedidos, desconto: 0,
        obs: l.obs, filialId: fKey
      });
    });
  }

 if (basesPreview.vendasItens && basesPreview.vendasItens.length > 0) {
   const mapaVI = {};
state.vendasItens.forEach(v => {
  mapaVI[v.filialId + '|' + v.mes + '|' + v.clienteNorm + '|' + v.produtoCodigo] = v;
});

basesPreview.vendasItens.forEach(v => {
  const mes = v.mes || '';
  if (!mes) return;
  const k = fId + '|' + mes + '|' + v.clienteNorm + '|' + v.produtoCodigo;
  if (mapaVI[k]) {
    mapaVI[k].valor += v.valor;
    mapaVI[k].qtd += v.qtd;
  } else {
    mapaVI[k] = {
      filialId: fId, mes,
      clienteNorm: v.clienteNorm, produtoCodigo: v.produtoCodigo,
      produtoDescricao: v.produtoDescricao,
      valor: v.valor, qtd: v.qtd
    };
  }
});
state.vendasItens = Object.values(mapaVI);
  }

  if (basesPreview.estoqueABC) {
    const mesesABC = basesPreview._mesesABC && basesPreview._mesesABC.length > 0
      ? basesPreview._mesesABC
      : [{
          mes: basesPreview.abcPeriodoInicio ? basesPreview.abcPeriodoInicio.slice(0, 7) : '',
          itens: basesPreview.estoqueABC
        }];

    mesesABC.forEach(ma => {
      if (!ma.mes) return;
      state.produtosMes = state.produtosMes.filter(p =>
        !(p.filialId === fId && p.mes === ma.mes)
      );
      ma.itens.forEach(p => {
        state.produtosMes.push({
          filialId: fId, mes: ma.mes, codigo: p.codigo,
          descricao: p.descricao, fabricante: p.fabricante || '',
          curva: p.curvaOficial || '',
          qtd: p.qtd || 0, valor: p.valor || 0
        });
      });
    });
  }

  Object.keys(basesPreview).forEach(k => { basesPreview[k] = null; });
  basesPreview.vendedoresNaoIdentificados = {};

  renderBasesStatus();
  salvar();
}

// ============================================================
// LANÇAR DIA
// ============================================================

export function renderLancar() {
  const di = document.getElementById('lanc-data');
  if (!di) return;
  if (!di.value) di.value = isoDate(new Date());

  const tbody = document.getElementById('grade-tbody');
  if (!tbody) return;

  let ativos = state.vendedores.filter(v =>
    filialNoEscopo(v.filialId, ui.escopoAtual) &&
    v.ativo && v.papel !== 'administrativo'
  );
  if (ui.modoVendedor) ativos = ativos.filter(v => v.id === ui.modoVendedor);

  const da = di.value || isoDate(new Date());
  const dr = new Date(da + 'T12:00:00');

  let av = '';
  if (dr.getDay() === 0) av = '⚠ Dom.';
  else if (dr.getDay() === 6) av = 'ℹ️ Sáb.';

  tbody.innerHTML = ativos.map(v => {
    const lancs = state.lancamentos.filter(l => l.vendedor === v.id && l.data === da);
    let vt = 0, pt = 0, dp = 0, vp = 0;
    lancs.forEach(l => {
      vt += (l.valor || 0); pt += (l.pedidos || 0);
      dp += (l.valor || 0) * (l.desconto || 0);
      vp += (l.valor || 0);
    });
    const dm = vp > 0 ? dp / vp : 0;

    return '<tr><td><strong>' + escapeHtml(v.nome) + '</strong>' +
      (av ? ' <span style="font-size:11px;color:#ca8a04;">' + av + '</span>' : '') + '</td>' +
      '<td class="num"><input type="text" inputmode="decimal" data-vend="' + v.id +
      '" data-campo="valor" value="' + (vt > 0 ? vt.toFixed(2).replace('.', ',') : '') +
      '" placeholder="0,00" style="text-align:right;"></td>' +
      '<td class="num"><input type="number" inputmode="numeric" data-vend="' + v.id +
      '" data-campo="pedidos" value="' + (pt > 0 ? pt : '') +
      '" placeholder="0" style="text-align:right;"></td>' +
      '<td class="num"><input type="text" inputmode="decimal" data-vend="' + v.id +
      '" data-campo="desconto" value="' + (dm > 0 ? dm.toFixed(2).replace('.', ',') : '') +
      '" placeholder="0,00" style="text-align:right;"></td></tr>';
  }).join('');

  tbody.querySelectorAll('input').forEach(inp => {
    inp.oninput = atualizarTotalPreviewDaGrade;
  });
  atualizarTotalPreviewDaGrade();
}

function atualizarTotalPreviewDaGrade() {
  const ins = document.querySelectorAll('#grade-tbody input');
  let t = 0, p = 0;
  ins.forEach(i => {
    if (i.dataset.campo === 'valor') {
      const v = parseValorBR(i.value);
      if (!isNaN(v)) t += v;
    } else if (i.dataset.campo === 'pedidos') {
      const x = parseInt(i.value, 10);
      if (!isNaN(x)) p += x;
    }
  });
  const el = document.getElementById('total-preview');
  if (el) el.innerHTML = 'Total: <strong>' + fmtBRL(t) + '</strong> · ' + p + ' pedidos';
}

export function setupLancar() {
  const di = document.getElementById('lanc-data');
  if (di) di.onchange = renderLancar;

  const bSalvar = document.getElementById('btn-salvar-dia');
  if (bSalvar) bSalvar.onclick = salvarDia;

  const bLimpar = document.getElementById('btn-limpar');
  if (bLimpar) bLimpar.onclick = () => {
    document.querySelectorAll('#grade-tbody input').forEach(i => { i.value = ''; });
    atualizarTotalPreviewDaGrade();
  };
}

async function salvarDia() {
  const data = document.getElementById('lanc-data').value || isoDate(new Date());
  const ins = document.querySelectorAll('#grade-tbody input');
  const pv = {};

  ins.forEach(i => {
    const vid = i.dataset.vend, c = i.dataset.campo;
    if (!pv[vid]) pv[vid] = { vendedor: vid, valor: 0, pedidos: 0, desconto: 0 };

    if (c === 'valor') {
      const v = parseValorBR(i.value);
      if (!isNaN(v)) pv[vid].valor = v;
    } else if (c === 'pedidos') {
      const p = parseInt(i.value, 10);
      if (!isNaN(p)) pv[vid].pedidos = p;
    } else if (c === 'desconto') {
      const d = parseValorBR(i.value);
      if (!isNaN(d)) pv[vid].desconto = d;
    }
  });

  const novos = Object.values(pv).filter(x => x.valor > 0 || x.pedidos > 0);
  if (novos.length === 0) { toast('Nada para salvar.'); return; }

  const ex = state.lancamentos.filter(l => l.data === data);
  if (ex.length > 0 && !confirm('Já existem ' + ex.length + '. Substituir?')) return;

  const filiaisAlvo = {};
  novos.forEach(p => {
    const v = state.vendedores.find(x => x.id === p.vendedor);
    if (v) filiaisAlvo[v.filialId] = true;
  });

  state.lancamentos = state.lancamentos.filter(l =>
    !(l.data === data && filiaisAlvo[l.filialId])
  );

  novos.forEach(p => {
    const v = state.vendedores.find(x => x.id === p.vendedor);
    state.lancamentos.push({
      id: 'lanc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      data, vendedor: p.vendedor,
      valor: p.valor || 0, pedidos: p.pedidos || 0,
      desconto: p.desconto || 0, obs: '',
      filialId: v ? v.filialId : null
    });
  });

  salvar();
  renderTudo();
  toast('✓ Dia salvo (' + novos.length + ')');
}

// ============================================================
// VENDEDORES E METAS
// ============================================================

export function renderMetas() {
  const tb = document.getElementById('tbody-metas');
  if (!tb) return;

  const selMes = document.getElementById('meta-mes-select');
  if (selMes) {
    const hoje = new Date();
    const meses = [];
    for (let i = -12; i <= 3; i++) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1);
      meses.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
    }
    state.metas.forEach(mm => { if (meses.indexOf(mm.mes) < 0) meses.push(mm.mes); });
    meses.sort();

    if (!ui.mesVendedoresSelecionado) {
      ui.mesVendedoresSelecionado = hoje.getFullYear() + '-' +
        String(hoje.getMonth() + 1).padStart(2, '0');
    }
    if (selMes.options.length !== meses.length) {
      selMes.innerHTML = meses.map(m => {
        const p = m.split('-');
        return '<option value="' + m + '">' +
          MESES[parseInt(p[1], 10) - 1] + '/' + p[0] + '</option>';
      }).join('');
    }
    selMes.value = ui.mesVendedoresSelecionado;
  }

  const mesSel = ui.mesVendedoresSelecionado;

  tb.innerHTML = state.vendedores.map((v, i) => {
    const filialOpts = state.filiais.map(fi =>
      '<option value="' + escapeHtml(fi.id) + '" ' +
      (fi.id === v.filialId ? 'selected' : '') + '>' +
      escapeHtml(fi.nome) + '</option>'
    ).join('');

    const botaoAcesso = v.user_id
      ? '<span class="badge badge-ok" style="font-size:11px;">✓ ativo</span>'
      : '<button class="btn btn-sm btn-primary" data-criar-acesso="' + i + '">🔑</button>';

    const ehDiretor = v.papel === 'diretor';
    const ehAdmin = v.papel === 'administrativo';
    const ehEx = v.papel === 'ex-vendedor';

    let corFundo = '';
    if (ehDiretor) corFundo = 'background:#f8fafc;';
    else if (ehAdmin) corFundo = 'background:#f8fafc;color:#64748b;';
    else if (ehEx) corFundo = 'background:#f1f5f9;color:#94a3b8;';

    const metaDoMes = state.metas.find(x => x.vendedorId === v.id && x.mes === mesSel);
    let metaValor, metaTicketValor, hintMeta = '';

    if (metaDoMes) {
      metaValor = metaDoMes.metaFaturamento;
      metaTicketValor = metaDoMes.metaTicket;
    } else {
      const herdada = getMetaHerdada(v, mesSel);
      metaValor = herdada.meta;
      metaTicketValor = herdada.metaTicket;
      if (metaValor > 0) {
        hintMeta = ' <span style="font-size:10px;color:#94a3b8;">(herdado)</span>';
      }
    }

    return '<tr data-idx="' + i + '" style="' + corFundo + '">' +
      '<td><input type="text" value="' + escapeHtml(v.nome) +
      '" data-field="nome" style="text-align:left;width:140px;"></td>' +
      '<td><input type="email" value="' + escapeHtml(v.email || '') +
      '" data-field="email" placeholder="email@..." style="text-align:left;width:160px;' +
      (ehDiretor ? 'background:#f1f5f9;' : '') + '" ' + (ehDiretor ? 'readonly' : '') + '></td>' +
      '<td><select data-field="filialId" style="padding:6px;font-size:12px;">' +
      filialOpts + '</select></td>' +
      '<td class="num"><input type="text" value="' + metaValor +
      '" data-field="meta" style="width:90px;' + (ehDiretor ? 'background:#f1f5f9;' : '') +
      '" ' + (ehDiretor ? 'readonly' : '') + '>' + hintMeta + '</td>' +
      '<td class="num"><input type="text" value="' + metaTicketValor +
      '" data-field="metaTicket" style="width:75px;' + (ehDiretor ? 'background:#f1f5f9;' : '') +
      '" ' + (ehDiretor ? 'readonly' : '') + '></td>' +
      '<td style="text-align:center;"><input type="checkbox" ' + (ehAdmin ? 'checked' : '') +
      ' data-field="adm" ' + (ehDiretor ? 'disabled' : '') + '></td>' +
      '<td style="text-align:center;"><input type="checkbox" ' + (ehEx ? 'checked' : '') +
      ' data-field="ex" ' + (ehDiretor ? 'disabled' : '') + '></td>' +
      '<td style="text-align:center;"><input type="checkbox" ' + (v.ativo ? 'checked' : '') +
      ' data-field="ativo"></td>' +
      '<td>' + botaoAcesso + '</td>' +
      '<td>' + (ehDiretor
        ? '<span style="font-size:11px;color:#64748b;">diretor</span>'
        : '<button class="btn btn-sm" data-remover-vend="' + i +
          '" style="color:#dc2626;">✕</button>') + '</td></tr>';
  }).join('');

  tb.querySelectorAll('[data-field="adm"]').forEach(cb => {
    cb.onchange = () => {
      const tr = cb.closest('tr');
      const ex = tr.querySelector('[data-field="ex"]');
      if (cb.checked && ex) ex.checked = false;
    };
  });
  tb.querySelectorAll('[data-field="ex"]').forEach(cb => {
    cb.onchange = () => {
      const tr = cb.closest('tr');
      const adm = tr.querySelector('[data-field="adm"]');
      if (cb.checked && adm) adm.checked = false;
    };
  });
  tb.querySelectorAll('[data-remover-vend]').forEach(b => {
    b.onclick = () => {
      const i = parseInt(b.dataset.removerVend, 10);
      if (!confirm('Remover?')) return;
      state.vendedores.splice(i, 1);
      salvar();
      renderTudo();
    };
  });
  tb.querySelectorAll('[data-criar-acesso]').forEach(b => {
    b.onclick = () => criarAcesso(parseInt(b.dataset.criarAcesso, 10));
  });

  const cp = document.getElementById('cfg-pedidos');
  if (cp) cp.value = state.config.metaPedidosDia;
  const ct = document.getElementById('cfg-teto');
  if (ct) ct.value = state.config.tetoDesconto;
  const cf = document.getElementById('cfg-feriados');
  if (cf) cf.value = (state.config.feriados || []).join(', ');
}

function getMetaHerdada(v, mesSel) {
  const exata = state.metas.find(x => x.vendedorId === v.id && x.mes === mesSel);
  if (exata) return { meta: exata.metaFaturamento, metaTicket: exata.metaTicket };

  const anteriores = state.metas
    .filter(x => x.vendedorId === v.id && x.mes < mesSel)
    .sort((a, b) => b.mes.localeCompare(a.mes));

  if (anteriores.length > 0) {
    return { meta: anteriores[0].metaFaturamento, metaTicket: anteriores[0].metaTicket };
  }
  return { meta: v.meta || 0, metaTicket: v.metaTicket || 0 };
}

export async function criarAcesso(idx) {
  const v = state.vendedores[idx];
  if (!v) return;
  if (v.user_id) { if (!confirm(v.nome + ' já tem login ativo.')) return; return; }

  const emailEl = document.querySelector('#tbody-metas tr[data-idx="' + idx + '"] [data-field="email"]');
  let email = (emailEl && emailEl.value || '').trim();
  if (!email) {
    email = prompt('Email para login de ' + v.nome + ':');
    if (!email) return;
  }
  if (!email || email.indexOf('@') < 0) { toast('Email inválido'); return; }

  const senha = prompt('Senha provisória (mín. 6 caracteres):', 'AltaFix2026');
  if (!senha || senha.length < 6) { toast('Senha muito curta'); return; }

  toast('⏳ Criando usuário...');
  try {
    const r = await session.sb.rpc('admin_criar_usuario', {
      p_email: email, p_senha: senha,
      p_nome: v.nome, p_papel: 'vendedor', p_filial_id: v.filialId
    });
    if (r.error) { toast('❌ ' + r.error.message); return; }

    if (r.data && r.data.erro) {
      if (confirm('⚠️ ' + r.data.erro + '\n\nApagar e recriar agora?')) {
        const del = await session.sb.rpc('admin_deletar_usuario', { p_email: email });
        if (del.error || (del.data && del.data.ok === false)) {
          toast('❌ ' + ((del.error && del.error.message) || (del.data && del.data.msg)));
          return;
        }
        const r2 = await session.sb.rpc('admin_criar_usuario', {
          p_email: email, p_senha: senha,
          p_nome: v.nome, p_papel: 'vendedor', p_filial_id: v.filialId
        });
        if (r2.error || (r2.data && r2.data.erro)) {
          toast('❌ ' + ((r2.error && r2.error.message) || (r2.data && r2.data.erro)));
          return;
        }
        toast('✓ Acesso recriado! Email: ' + email + ' · Senha: ' + senha);
      } else return;
    } else {
      toast('✓ Acesso criado! Email: ' + email + ' · Senha: ' + senha);
    }

    const dados = await sbCarregarTudo();
    aplicarDadosDoBanco(dados);
    renderMetas();
  } catch (e) {
    toast('❌ ' + e.message);
  }
}

export function salvarMetas() {
  const rows = document.querySelectorAll('#tbody-metas tr');
  const mesSel = ui.mesVendedoresSelecionado;
  const novasMetas = state.metas.filter(x => x.mes !== mesSel);
  const hoje = new Date();
  const hojeKey = hoje.getFullYear() + '-' + String(hoje.getMonth() + 1).padStart(2, '0');

  rows.forEach(tr => {
    const nome = tr.querySelector('[data-field="nome"]').value.trim();
    if (!nome) return;

    const email = (tr.querySelector('[data-field="email"]').value || '').trim();
    const metaVal = parseValorBR(tr.querySelector('[data-field="meta"]').value) || 0;
    const mtVal = parseValorBR(tr.querySelector('[data-field="metaTicket"]').value) || 0;
    const at = tr.querySelector('[data-field="ativo"]').checked;

    const admCb = tr.querySelector('[data-field="adm"]');
    const exCb = tr.querySelector('[data-field="ex"]');
    const ehAdm = admCb && admCb.checked && !admCb.disabled;
    const ehEx = exCb && exCb.checked && !exCb.disabled;

    const fId = tr.querySelector('[data-field="filialId"]').value;
    const idx = parseInt(tr.dataset.idx, 10);
    const orig = state.vendedores[idx] || {};

    let papel = 'vendedor';
    if (orig.papel === 'diretor') papel = 'diretor';
    else if (ehAdm) papel = 'administrativo';
    else if (ehEx) papel = 'ex-vendedor';

    orig.nome = nome;
    orig.email = email || null;
    orig.ativo = at;
    orig.papel = papel;
    orig.supervisor = (papel === 'diretor');
    orig.filialId = fId;

    if (papel !== 'diretor' && (metaVal > 0 || mtVal > 0)) {
      novasMetas.push({
        id: 'm_' + (orig.id || 'x') + '_' + mesSel,
        vendedorId: orig.id, mes: mesSel,
        metaFaturamento: metaVal, metaTicket: mtVal
      });
    }
    if (papel !== 'diretor' && mesSel >= hojeKey) {
      orig.meta = metaVal;
      orig.metaTicket = mtVal;
    }
  });

  state.metas = novasMetas;
  salvar();
  renderTudo();
  popularEscopoSelect();
  popularModoVendedor();
  toast('✓ Metas de ' + mesSel + ' salvas localmente.');
}

export async function salvarMetasServidor() {
  if (!session.vendedor || session.vendedor.papel !== 'diretor') {
    toast('Só diretor pode salvar no servidor');
    return;
  }
  const rows = document.querySelectorAll('#tbody-metas tr');
  const mesSel = ui.mesVendedoresSelecionado;
  const metasDoMes = [];
  const vendedoresAtualizados = [];
  const hoje = new Date();
  const hojeKey = hoje.getFullYear() + '-' + String(hoje.getMonth() + 1).padStart(2, '0');

  rows.forEach(tr => {
    const nome = tr.querySelector('[data-field="nome"]').value.trim();
    if (!nome) return;

    const email = (tr.querySelector('[data-field="email"]').value || '').trim();
    const metaVal = parseValorBR(tr.querySelector('[data-field="meta"]').value) || 0;
    const mtVal = parseValorBR(tr.querySelector('[data-field="metaTicket"]').value) || 0;
    const at = tr.querySelector('[data-field="ativo"]').checked;

    const admCb = tr.querySelector('[data-field="adm"]');
    const exCb = tr.querySelector('[data-field="ex"]');
    const ehAdm = admCb && admCb.checked && !admCb.disabled;
    const ehEx = exCb && exCb.checked && !exCb.disabled;

    const fId = tr.querySelector('[data-field="filialId"]').value;
    const idx = parseInt(tr.dataset.idx, 10);
    const orig = state.vendedores[idx] || {};

    let papel = 'vendedor';
    if (orig.papel === 'diretor') papel = 'diretor';
    else if (ehAdm) papel = 'administrativo';
    else if (ehEx) papel = 'ex-vendedor';

    const payloadVend = {
      nome, email: email || null,
      ativo: at !== false, papel, filial_id: fId
    };
    if (papel !== 'diretor' && mesSel >= hojeKey) {
      payloadVend.meta = metaVal;
      payloadVend.meta_ticket = mtVal;
    }

    vendedoresAtualizados.push({ id: orig.id, nome, payload: payloadVend });

    if (papel !== 'diretor' && (metaVal > 0 || mtVal > 0)) {
      metasDoMes.push({
        vendedor_id: orig.id, mes: mesSel,
        meta_faturamento: metaVal, meta_ticket: mtVal
      });
    }
  });

  if (!confirm('Enviar ' + metasDoMes.length + ' metas de ' + mesSel + ' e ' +
    vendedoresAtualizados.length + ' vendedores?')) return;

  toast('⏳ Sincronizando...');

  try {
    const existentes = await session.sb.from('vendedores').select('*');
    if (existentes.error) { toast('❌ ' + existentes.error.message); return; }

    const mapa = {};
    (existentes.data || []).forEach(v => {
      mapa[normalizarNomeCliente(v.nome)] = v.id;
    });

    const erros = [];

    for (let i = 0; i < vendedoresAtualizados.length; i++) {
      const va = vendedoresAtualizados[i];
      const key = normalizarNomeCliente(va.nome);
      if (mapa[key]) {
        const r = await session.sb.from('vendedores').update(va.payload).eq('id', mapa[key]);
        if (r.error) erros.push(va.nome + ': ' + r.error.message);
      }
    }

    await session.sb.from('metas').delete().eq('mes', mesSel);

    const metasPayload = metasDoMes.filter(m => m.vendedor_id);
    if (metasPayload.length > 0) {
      const rm = await session.sb.from('metas').insert(metasPayload);
      if (rm.error) erros.push('metas: ' + rm.error.message);
    }

    if (erros.length > 0) {
      alert('Erros:\n\n' + erros.slice(0, 10).join('\n'));
      toast('⚠ ' + erros.length + ' erro(s)');
    } else {
      toast('✓ Metas de ' + mesSel + ' salvas (' + metasPayload.length + ')');
    }

    const dados = await sbCarregarTudo();
    if (dados.vendedores) {
      aplicarDadosDoBanco(dados);
      renderTudo();
      popularEscopoSelect();
      popularModoVendedor();
    }
  } catch (e) {
    toast('❌ ' + e.message);
    console.error(e);
  }
}

export function setupMetas() {
  const bSalvar = document.getElementById('btn-salvar-metas');
  if (bSalvar) bSalvar.onclick = salvarMetas;

  const bSinc = document.getElementById('btn-sinc-metas');
  if (bSinc) bSinc.onclick = salvarMetasServidor;

  const bAdd = document.getElementById('btn-add-vend');
  if (bAdd) bAdd.onclick = () => {
    state.vendedores.push({
      id: 'novo_' + Date.now(), nome: 'NOVO', email: '',
      meta: 0, metaTicket: 0, ativo: true,
      filialId: state.filiais[0] && state.filiais[0].id,
      papel: 'vendedor'
    });
    salvar();
    renderMetas();
  };

  const selMes = document.getElementById('meta-mes-select');
  if (selMes) selMes.onchange = e => {
    ui.mesVendedoresSelecionado = e.target.value;
    renderMetas();
  };
}

// ============================================================
// FILIAIS E GRUPOS
// ============================================================

export function renderFiliais() {
  const tb = document.getElementById('tbody-filiais');
  if (!tb) return;

  tb.innerHTML = state.filiais.map((f, i) => {
    const grupoOpts = '<option value="">— sem grupo —</option>' +
      state.grupos.map(g =>
        '<option value="' + escapeHtml(g.id) + '" ' +
        (g.id === f.grupoId ? 'selected' : '') + '>' +
        escapeHtml(g.nome) + '</option>'
      ).join('');

    return '<tr data-idx="' + i + '">' +
      '<td><input type="text" value="' + escapeHtml(f.nome) +
      '" data-field="nome" style="text-align:left;"></td>' +
      '<td><input type="text" value="' + escapeHtml(f.uf || '') +
      '" data-field="uf" style="width:60px;text-align:center;"></td>' +
      '<td><select data-field="grupoId" style="padding:6px;">' + grupoOpts + '</select></td>' +
      '<td><input type="checkbox" ' + (f.ativo ? 'checked' : '') + ' data-field="ativo"></td>' +
      '<td><button class="btn btn-sm" data-remover-filial="' + i +
      '" style="color:#dc2626;">✕</button></td></tr>';
  }).join('');

  tb.querySelectorAll('[data-remover-filial]').forEach(b => {
    b.onclick = () => {
      const i = parseInt(b.dataset.removerFilial, 10);
      if (!confirm('Remover?')) return;
      state.filiais.splice(i, 1);
      salvar();
      renderFiliais();
      popularEscopoSelect();
    };
  });

  const tbg = document.getElementById('tbody-grupos');
  if (!tbg) return;

  tbg.innerHTML = state.grupos.map((g, i) => {
    const fs = state.filiais.filter(f => f.grupoId === g.id);
    return '<tr data-idx="' + i + '">' +
      '<td><input type="text" value="' + escapeHtml(g.nome) +
      '" data-field="nomeGrupo" style="text-align:left;"></td>' +
      '<td style="font-size:12px;color:#64748b;">' +
      (fs.length > 0 ? fs.map(f => escapeHtml(f.nome)).join(', ') : '— vazio —') + '</td>' +
      '<td><button class="btn btn-sm" data-remover-grupo="' + i +
      '" style="color:#dc2626;">✕</button></td></tr>';
  }).join('');

  tbg.querySelectorAll('[data-remover-grupo]').forEach(b => {
    b.onclick = () => {
      const i = parseInt(b.dataset.removerGrupo, 10);
      if (!confirm('Remover?')) return;
      state.grupos.splice(i, 1);
      salvar();
      renderFiliais();
      popularEscopoSelect();
    };
  });
}

export async function salvarFiliais() {
  const rowsF = document.querySelectorAll('#tbody-filiais tr');
  const novas = [];

  rowsF.forEach(tr => {
    const nome = tr.querySelector('[data-field="nome"]').value.trim();
    if (!nome) return;
    const uf = tr.querySelector('[data-field="uf"]').value.trim().toUpperCase();
    const gid = tr.querySelector('[data-field="grupoId"]').value;
    const at = tr.querySelector('[data-field="ativo"]').checked;
    const idx = parseInt(tr.dataset.idx, 10);
    const orig = state.filiais[idx] || {};

    novas.push({
      id: orig.id || ('f' + Date.now() + Math.random().toString(36).slice(2, 5)),
      nome, uf, grupoId: gid || null, ativo: at
    });
  });
  state.filiais = novas;

  const rowsG = document.querySelectorAll('#tbody-grupos tr');
  const novosG = [];
  rowsG.forEach(tr => {
    const nome = tr.querySelector('[data-field="nomeGrupo"]').value.trim();
    if (!nome) return;
    const idx = parseInt(tr.dataset.idx, 10);
    const orig = state.grupos[idx] || {};
    novosG.push({
      id: orig.id || ('g' + Date.now() + Math.random().toString(36).slice(2, 5)),
      nome
    });
  });
  state.grupos = novosG;

  salvar();
  renderTudo();
  popularEscopoSelect();

  if (session.sb && session.vendedor && session.vendedor.papel === 'diretor') {
    try {
      const gAtual = await session.sb.from('grupos').select('*');
      const mapaG2 = {};
      (gAtual.data || []).forEach(g => { mapaG2[normalizarNomeCliente(g.nome)] = g.id; });

      for (let i = 0; i < state.grupos.length; i++) {
        const g = state.grupos[i];
        if (!mapaG2[normalizarNomeCliente(g.nome)]) {
          const r = await session.sb.from('grupos').insert({ nome: g.nome });
          if (!r.error && r.data[0]) mapaG2[normalizarNomeCliente(g.nome)] = r.data[0].id;
        }
      }

      const filEx = await session.sb.from('filiais').select('*');
      const mapaF = {};
      (filEx.data || []).forEach(f => { mapaF[normalizarNomeCliente(f.nome)] = f.id; });

      for (let j = 0; j < state.filiais.length; j++) {
        const f = state.filiais[j];
        const gObj = f.grupoId ? state.grupos.find(x => x.id === f.grupoId) : null;
        const payload = {
          nome: f.nome, uf: f.uf || null,
          ativo: f.ativo !== false,
          grupo_id: gObj ? mapaG2[normalizarNomeCliente(gObj.nome)] : null
        };
        const key = normalizarNomeCliente(f.nome);
        if (mapaF[key]) {
          await session.sb.from('filiais').update(payload).eq('id', mapaF[key]);
        } else {
          await session.sb.from('filiais').insert(payload);
        }
      }

      toast('✓ Filiais e grupos sincronizados');
      const dados = await sbCarregarTudo();
      aplicarDadosDoBanco(dados);
      renderTudo();
      popularEscopoSelect();
    } catch (e) {
      toast('✓ Salvo local (erro no servidor: ' + e.message + ')');
    }
  } else {
    toast('✓ Salvo localmente');
  }
}

export function setupFiliais() {
  const bAddF = document.getElementById('btn-add-filial');
  if (bAddF) bAddF.onclick = () => {
    state.filiais.push({
      id: 'f' + Date.now(), nome: 'NOVA FILIAL',
      uf: '', grupoId: null, ativo: true
    });
    salvar();
    renderFiliais();
  };

  const bAddG = document.getElementById('btn-add-grupo');
  if (bAddG) bAddG.onclick = () => {
    state.grupos.push({ id: 'g' + Date.now(), nome: 'NOVO GRUPO' });
    salvar();
    renderFiliais();
  };

  const bSalvar = document.getElementById('btn-salvar-filiais');
  if (bSalvar) bSalvar.onclick = salvarFiliais;
}

// ============================================================
// GERAL / BACKUP
// ============================================================

export function setupGeral() {
  const bSalvar = document.getElementById('btn-salvar-geral');
  if (bSalvar) bSalvar.onclick = salvarGeral;

  const bExp = document.getElementById('btn-export-json');
  if (bExp) bExp.onclick = exportarJSON;

  const bImp = document.getElementById('btn-import-json');
  if (bImp) bImp.onclick = () => document.getElementById('file-json').click();

  const fImp = document.getElementById('file-json');
  if (fImp) fImp.onchange = e => {
    const f = e.target.files[0];
    if (f) importarJSON(f);
    e.target.value = '';
  };

  const bReconstruir = document.getElementById('btn-reconstruir');
  if (bReconstruir) bReconstruir.onclick = reconstruirCruzamentos;

  const bRecarregarDiag = document.getElementById('btn-recarregar-diag');
  if (bRecarregarDiag) bRecarregarDiag.onclick = () => {
    renderDiagnostico();
    toast('Diagnóstico atualizado');
  };
}

export function salvarGeral() {
  state.config.metaPedidosDia = parseInt(document.getElementById('cfg-pedidos').value, 10) || 370;
  state.config.tetoDesconto = parseValorBR(document.getElementById('cfg-teto').value) || 10;

  const lista = (document.getElementById('cfg-feriados').value || '')
    .split(/[\s,;]+/).map(s => s.trim()).filter(Boolean);
  state.config.feriados = lista;

  salvar();

  if (session.sb && session.vendedor && session.vendedor.papel === 'diretor') {
    session.sb.from('config').upsert({ chave: 'geral', valor: state.config }).then(() => {});
  }
  toast('✓ Configurações salvas');
}

export function exportarJSON() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'altafix-backup-' + isoDate(new Date()) + '.json';
  a.click();
  URL.revokeObjectURL(url);
  toast('✓ Backup exportado');
}

export function importarJSON(file) {
  const r = new FileReader();
  r.onload = evt => {
    try {
      const p = JSON.parse(evt.target.result);
      if (!confirm('Substituir todos os dados?')) return;
      Object.assign(state, p);
      derivarHistorico();
      salvar();
      renderTudo();
      popularEscopoSelect();
      popularModoVendedor();
      toast('✓ Restaurado');
    } catch (e) {
      toast('Erro ao importar');
    }
  };
  r.readAsText(file);
}

// ============================================================
// DIAGNÓSTICO
// ============================================================

export function diagnostico() {
  const s = { problemas: [], avisos: [], ok: [] };

  const nomesCad = state.vendedores
    .filter(v => v.ativo && v.papel !== 'diretor' &&
                 v.papel !== 'administrativo' && v.papel !== 'ex-vendedor')
    .map(v => v.nome);
  const nomesCadAll = state.vendedores.map(v => v.nome);

  const nomesComp = {};
  state.comparativo.forEach(m => {
    if (m.vendedores) Object.keys(m.vendedores).forEach(n => { nomesComp[n] = true; });
  });
  const nomesCompArr = Object.keys(nomesComp);

  const semCadastro = nomesCompArr.filter(n =>
    !nomesCadAll.some(c => normalizarNomeCliente(c) === normalizarNomeCliente(n))
  );
  const semComparativo = nomesCad.filter(n =>
    !nomesCompArr.some(c => normalizarNomeCliente(c) === normalizarNomeCliente(n))
  );

  if (semCadastro.length > 0) {
    s.problemas.push({
      titulo: semCadastro.length + ' vendedor(es) no comparativo sem cadastro',
      detalhe: semCadastro.join(', '),
      acao: 'Cadastre com o mesmo nome.'
    });
  }
  if (semComparativo.length > 0) {
    s.avisos.push({
      titulo: semComparativo.length + ' vendedor(es) cadastrado(s) sem dados no comparativo',
      detalhe: semComparativo.join(', '),
      acao: 'Verifique o nome na planilha comparativo.'
    });
  }
  if (semCadastro.length === 0 && semComparativo.length === 0 && nomesCompArr.length > 0) {
    s.ok.push({ titulo: 'Vendedores ↔ Comparativo', detalhe: 'Todos os nomes batem.' });
  }

  const clSemVend = state.clientes.filter(c => !c.vendedor);
  if (clSemVend.length > 0) {
    s.problemas.push({
      titulo: clSemVend.length + ' cliente(s) sem vendedor vinculado',
      detalhe: 'Ex: ' + clSemVend.slice(0, 5).map(c => c.nome).join(', '),
      acao: 'Cadastre o vendedor com o mesmo nome do 324.'
    });
  } else if (state.clientes.length > 0) {
    s.ok.push({ titulo: 'Todos os ' + state.clientes.length + ' clientes têm vendedor', detalhe: '' });
  }

  if (state.produtosMes.length > 0) {
    s.ok.push({ titulo: 'Produtos_mes', detalhe: state.produtosMes.length + ' registros mensais.' });
  }
  if (state.vendasItens.length > 0) {
    s.ok.push({ titulo: 'Vendas_itens', detalhe: state.vendasItens.length + ' pares cliente×produto.' });
  }
  if (state.metas.length > 0) {
    s.ok.push({ titulo: 'Metas por mês', detalhe: state.metas.length + ' registros.' });
  }
  if (state.comparativo.length === 0) {
    s.avisos.push({ titulo: 'Comparativo YoY sem dados', detalhe: '', acao: 'Importe o 740.' });
  }
  if (state.lancamentos.length === 0) {
    s.avisos.push({ titulo: 'Nenhum lançamento importado', detalhe: '', acao: 'Importe o 324.' });
  }

  state.saude = s;
  return s;
}

export function renderDiagnostico() {
  const el = document.getElementById('diag-container');
  if (!el) return;

  const s = diagnostico();
  const totalProb = s.problemas.length;
  const totalAv = s.avisos.length;
  const totalOk = s.ok.length;
  const statusGeral = totalProb > 0 ? 'err' : (totalAv > 0 ? 'warn' : 'ok');
  const statusTxt = totalProb > 0 ? 'Ação necessária' : (totalAv > 0 ? 'Atenção' : 'Saudável');
  const statusIcon = totalProb > 0 ? '⚠' : (totalAv > 0 ? '◐' : '✓');

  let h = '<div class="diag-item ' + statusGeral + '" style="font-size:14px;font-weight:700;">' +
    '<span class="icone">' + statusIcon + '</span>' +
    '<div class="texto">' + statusTxt + '</div>' +
    '<div style="font-size:12px;font-weight:600;">' + totalProb + ' problema(s) · ' +
    totalAv + ' aviso(s) · ' + totalOk + ' ok</div></div>';

  if (totalProb === 0 && totalAv === 0) {
    h += '<div class="diag-item ok"><span class="icone">✓</span>' +
      '<div class="texto">Todos os cruzamentos estão corretos.</div></div>';
  }

  s.problemas.forEach(p => {
    h += '<div class="diag-item err"><span class="icone">❌</span><div class="texto">' +
      '<strong>' + escapeHtml(p.titulo) + '</strong>' +
      '<div class="detalhe">' + escapeHtml(p.detalhe) + '</div>' +
      '<div class="detalhe" style="margin-top:4px;"><strong>→ ' +
      escapeHtml(p.acao) + '</strong></div></div></div>';
  });
  s.avisos.forEach(p => {
    h += '<div class="diag-item warn"><span class="icone">⚠</span><div class="texto">' +
      '<strong>' + escapeHtml(p.titulo) + '</strong>' +
      '<div class="detalhe">' + escapeHtml(p.detalhe) + '</div>' +
      '<div class="detalhe" style="margin-top:4px;"><strong>→ ' +
      escapeHtml(p.acao) + '</strong></div></div></div>';
  });
  s.ok.forEach(p => {
    h += '<div class="diag-item ok"><span class="icone">✓</span><div class="texto">' +
      escapeHtml(p.titulo) + (p.detalhe ? '<div class="detalhe">' +
      escapeHtml(p.detalhe) + '</div>' : '') + '</div></div>';
  });

  el.innerHTML = h;
}

export function reconstruirCruzamentos() {
  if (!confirm('Reprocessar cruzamentos?')) return;
  toast('⏳ Reconstruindo...');

  try {
    if (!state.clientes || state.clientes.length === 0) {
      toast('Sem clientes.');
      return;
    }

    const mapaCidade = {};
    (state.cidades || []).forEach(cid => {
      (cid.clientes || []).forEach(cl => {
        const k = normalizarNomeCliente(cl.nome);
        if (!mapaCidade[k]) mapaCidade[k] = { cidade: cid.nome, uf: cid.uf };
      });
    });

    let enriquecidos = 0;
    state.clientes.forEach(c => {
      if (c.cidade) return;
      const enriq = mapaCidade[normalizarNomeCliente(c.nome)];
      if (enriq) { c.cidade = enriq.cidade; c.uf = enriq.uf; enriquecidos++; }
    });

    salvar();
    renderTudo();
    toast('✓ ' + enriquecidos + ' vinculados.');
  } catch (e) {
    toast('❌ ' + e.message);
  }
}

// ============================================================
// RENDER TUDO
// ============================================================

export function renderTudo() {
  try { renderPainel(); } catch (e) { console.error('renderPainel', e); }
  try { renderClientes(); } catch (e) { console.error('renderClientes', e); }
  try { renderProdutos(); } catch (e) { console.error('renderProdutos', e); }
  try { renderComparativo(); } catch (e) { console.error('renderComparativo', e); }
  try { renderCidades(); } catch (e) { console.error('renderCidades', e); }
  try { renderLancar(); } catch (e) { console.error('renderLancar', e); }
  try { renderMetas(); } catch (e) { console.error('renderMetas', e); }
  try { renderFiliais(); } catch (e) { console.error('renderFiliais', e); }
  try { renderFabricantes(); } catch (e) { console.error('renderFabricantes', e); }
  try { renderBasesStatus(); } catch (e) { console.error('renderBasesStatus', e); }
}

// Referência circular: para popularEscopoSelect/popularModoVendedor
// chamadas dentro de salvarBases/salvarMetas etc, o main vai expor via window
function popularEscopoSelect() {
  if (typeof window._popularEscopoSelect === 'function') window._popularEscopoSelect();
}
function popularModoVendedor() {
  if (typeof window._popularModoVendedor === 'function') window._popularModoVendedor();
}