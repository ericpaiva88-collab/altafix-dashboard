// ============================================================
// supabase.js — Comunicação com o backend Supabase
// ============================================================

import { state, session, basesPreview } from './state.js';
import { normalizarNomeCliente, diffDias, isoDate } from './utils.js';

const SUPABASE_URL = 'https://yrrazohgaopcudgmvxkv.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_3CiOUhLIPV9Ze3gCHfvzOg_4AMGiZeb';

// ============================================================
// INICIALIZAÇÃO E AUTH
// ============================================================

export function sbInit() {
  if (typeof supabase === 'undefined') return false;
  session.sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return true;
}

export async function sbLogin(email, senha) {
  if (!session.sb) return { erro: 'Supabase nao inicializado' };
  const r = await session.sb.auth.signInWithPassword({ email, password: senha });
  if (r.error) return { erro: r.error.message };
  await sbCarregarPerfil();
  return { ok: true };
}

export async function sbLogout() {
  if (!session.sb) return;
  await session.sb.auth.signOut();
  session.user = null;
  session.vendedor = null;
  session.pronto = false;
}

export async function sbCarregarPerfil() {
  const r = await session.sb.auth.getUser();
  if (r.error || !r.data.user) {
    session.user = null;
    session.vendedor = null;
    return false;
  }
  session.user = { id: r.data.user.id, email: r.data.user.email };

  const v = await session.sb.from('vendedores').select('*').eq('user_id', session.user.id).maybeSingle();
  if (v.data) {
    session.vendedor = v.data;
    session.pronto = true;
    return true;
  }

  if (session.user.email) {
    const v2 = await session.sb.from('vendedores').select('*').eq('email', session.user.email).maybeSingle();
    if (v2.data) {
      session.vendedor = v2.data;
      await session.sb.from('vendedores').update({ user_id: session.user.id }).eq('id', session.vendedor.id);
      session.pronto = true;
      return true;
    }
  }

  session.vendedor = null;
  session.pronto = false;
  return false;
}

export async function sbSessaoAtual() {
  if (!session.sb) return null;
  const r = await session.sb.auth.getSession();
  return r.data.session;
}

// ============================================================
// PAGINAÇÃO
// ============================================================

export async function sbFetchAll(table, opts) {
  opts = opts || {};
  const pageSize = 1000;
  let all = [];
  let from = 0;

  while (true) {
    let q = session.sb
      .from(table)
      .select(opts.select || '*')
      .range(from, from + pageSize - 1);

    if (opts.order) q = q.order(opts.order.column, opts.order.options || {});
    if (opts.eq) Object.keys(opts.eq).forEach(k => { q = q.eq(k, opts.eq[k]); });

    const r = await q;
    if (r.error) throw new Error(table + ': ' + r.error.message);
    if (!r.data || r.data.length === 0) break;

    all = all.concat(r.data);
    if (r.data.length < pageSize) break;
    from += pageSize;
  }

  return { data: all, error: null };
}

// ============================================================
// CARREGAR TUDO
// ============================================================

export async function sbCarregarTudo() {
  const out = {
    filiais: [], grupos: [], vendedores: [], clientes: [], produtos: [],
    lancamentos: [], comparativo: [], cidades: [], metas: [],
    produtosMes: [], vendasItens: [], ligacoes: [], ligacoesVendas: [],
    acoesTratadas: {}, config: {}
  };

  const q = await Promise.all([
    sbFetchAll('filiais', { order: { column: 'nome' } }),
    sbFetchAll('grupos', { order: { column: 'nome' } }),
    sbFetchAll('vendedores', { order: { column: 'nome' } }),
    sbFetchAll('clientes'),
    sbFetchAll('produtos'),
    sbFetchAll('lancamentos', { order: { column: 'data', options: { ascending: false } } }),
    sbFetchAll('comparativo'),
    sbFetchAll('cidades'),
    sbFetchAll('acoes_tratadas'),
    sbFetchAll('config'),
    sbFetchAll('metas'),
    sbFetchAll('produtos_mes'),
    sbFetchAll('vendas_itens'),
    sbFetchAll('ligacoes'),
    sbFetchAll('ligacoes_vendas'),
    sbFetchAll('clientes_importacoes')
  ]);

  if (q[0].data) out.filiais = q[0].data;
  if (q[1].data) out.grupos = q[1].data;
  if (q[2].data) out.vendedores = q[2].data;
  if (q[3].data) out.clientes = q[3].data;
  if (q[4].data) out.produtos = q[4].data;
  if (q[5].data) out.lancamentos = q[5].data;
  if (q[6].data) out.comparativo = q[6].data;
  if (q[7].data) out.cidades = q[7].data;
  if (q[8].data) q[8].data.forEach(a => { out.acoesTratadas[a.acao_id] = new Date(a.tratado_em).getTime(); });
  if (q[9].data) q[9].data.forEach(c => { out.config[c.chave] = c.valor; });
  if (q[10].data) out.metas = q[10].data;
  if (q[11].data) out.produtosMes = q[11].data;
  if (q[12].data) out.vendasItens = q[12].data;
  if (q[13].data) out.ligacoes = q[13].data;
  if (q[14].data) out.ligacoesVendas = q[14].data;
  if (q[15].data) out.clientesImportacoes = q[15].data;

  return out;
}

// ============================================================
// APLICAR DADOS DO BANCO NO STATE
// ============================================================

export function aplicarDadosDoBanco(d) {
  state.filiais = (d.filiais || []).map(f => ({
    id: f.id, nome: f.nome, uf: f.uf, grupoId: f.grupo_id, ativo: f.ativo
  }));

  state.grupos = (d.grupos || []).map(g => ({ id: g.id, nome: g.nome }));

  state.vendedores = (d.vendedores || []).map(v => ({
    id: v.id, user_id: v.user_id, nome: v.nome, email: v.email,
    meta: Number(v.meta), metaTicket: Number(v.meta_ticket),
    ativo: v.ativo, papel: v.papel,
    supervisor: v.papel === 'diretor', filialId: v.filial_id
  }));

  state.clientes = (d.clientes || []).map(c => ({
    id: c.id, filialId: c.filial_id, vendedor: c.vendedor_id,
    nome: c.nome, codigo: c.codigo, cidade: c.cidade, uf: c.uf,
    valorTotal: Number(c.valor_total), numCompras: c.num_compras,
    ultimaCompra: c.ultima_compra, primeiraCompra: c.primeira_compra,
    intervaloMedio: c.intervalo_medio, valorMedioMensal: Number(c.valor_medio_mensal),
    _datas: []
  }));

  state.produtos = (d.produtos || []).map(p => ({
    id: p.id, filialId: p.filial_id, codigo: p.codigo,
    descricao: p.descricao, fabricante: p.fabricante,
    curva: p.curva, curvaOficial: p.curva,
    qtdVendida: Number(p.qtd_vendida), valorVendido: Number(p.valor_vendido),
    estoqueAtual: p.estoque_atual, estoqueMinimo: p.estoque_minimo
  }));

  state.lancamentos = (d.lancamentos || []).map(l => ({
    id: l.id, filialId: l.filial_id, vendedor: l.vendedor_id,
    data: l.data, valor: Number(l.valor), pedidos: l.pedidos,
    desconto: Number(l.desconto), obs: l.obs
  }));

  state.comparativo = (d.comparativo || []).map(m => ({
    id: m.id, filialId: m.filial_id, mes: m.mes,
    fat2025: Number(m.fat2025), ped2025: m.ped2025,
    fat2026: Number(m.fat2026), ped2026: m.ped2026,
    vendedores: m.vendedores || {}
  }));

  state.cidades = (d.cidades || []).map(c => ({
    id: c.id, filialId: c.filial_id, nome: c.nome, uf: c.uf,
    totalValor: Number(c.total_valor), qtdVendas: c.qtd_vendas,
    numClientes: c.num_clientes, clientes: c.clientes || [],
    ticketMedio: c.qtd_vendas > 0 ? Number(c.total_valor) / c.qtd_vendas : 0,
    mesKey: c.mes || ''
  }));

  state.metas = (d.metas || []).map(m => ({
    id: m.id, vendedorId: m.vendedor_id, mes: m.mes,
    metaFaturamento: Number(m.meta_faturamento),
    metaTicket: Number(m.meta_ticket)
  }));

  state.produtosMes = (d.produtosMes || []).map(p => ({
    filialId: p.filial_id, mes: p.mes, codigo: p.codigo,
    descricao: p.descricao, fabricante: p.fabricante || '',
    curva: p.curva || '',
    qtd: Number(p.qtd) || 0, valor: Number(p.valor) || 0
  }));

  state.vendasItens = (d.vendasItens || []).map(v => ({
  filialId: v.filial_id,
  periodoIni: v.periodo_ini, periodoFim: v.periodo_fim,
  clienteNorm: v.cliente_norm,
  produtoCodigo: v.produto_codigo, produtoDescricao: v.produto_descricao,
  vendedor: v.vendedor_id,
  valor: Number(v.valor) || 0, qtd: Number(v.qtd) || 0
}));

  state.ligacoes = (d.ligacoes || []).map(l => ({
    id: l.id,
    filialId: l.filial_id,
    vendedor: l.vendedor_id,
    data: l.data,
    codigo: l.codigo,
    empresa: l.empresa,
    clienteNorm: l.cliente_norm,
    contato: l.contato,
    telefone: l.telefone,
    cidade: l.cidade,
    estado: l.estado,
    status: l.status,
    valor: Number(l.valor) || 0,
    proximo: l.proximo,
    obs: l.obs
  }));

  state.ligacoesVendas = (d.ligacoesVendas || []).map(lv => ({
    id: lv.id,
    ligacaoId: lv.ligacao_id,
    clienteNorm: lv.cliente_norm,
    filialId: lv.filial_id,
    vendedor: lv.vendedor_id,
    dataLigacao: lv.data_ligacao,
    dataVenda: lv.data_venda,
    valorVenda: Number(lv.valor_venda) || 0,
    diasEntre: lv.dias_entre
  }));

  state.clientesImportacoes = (d.clientesImportacoes || []).map(r => ({
    filialId: r.filial_id,
    periodoIni: r.periodo_ini, periodoFim: r.periodo_fim,
    clienteNorm: r.cliente_norm,
    nome: r.nome, codigo: r.codigo, cidade: r.cidade, uf: r.uf,
    vendedor: r.vendedor_id,
    valor: Number(r.valor) || 0,
    numCompras: r.num_compras || 0,
    ultimaCompra: r.ultima_compra
  }));

  state.acoesTratadas = d.acoesTratadas || {};

  if (d.config && d.config.geral) {
    state.config = Object.assign(state.config, d.config.geral);
  }
}

// ============================================================
// UPSERTS
// ============================================================

export function construirMapaVendedores() {
  const mapa = {};
  state.vendedores.forEach(v => {
    if (v.id) {
      mapa[v.id] = v.id;
      mapa[normalizarNomeCliente(v.nome)] = v.id;
    }
  });
  return mapa;
}

// ------------------------------------------------------------
// CLIENTES — por período de importação
// ------------------------------------------------------------

export async function sbUpsertClientes(lista, filialId, vendedoresMap) {
  if (!lista || lista.length === 0) return 0;

  const porPeriodo = {};
  lista.forEach(c => {
    const pIni = c.periodoIni || '';
    const pFim = c.periodoFim || pIni;
    if (!pIni) return;
    const k = pIni + '|' + pFim;
    if (!porPeriodo[k]) porPeriodo[k] = { pIni, pFim, clientes: [] };
    porPeriodo[k].clientes.push(c);
  });

  const periodos = Object.keys(porPeriodo);
  for (let pIdx = 0; pIdx < periodos.length; pIdx++) {
    const p = porPeriodo[periodos[pIdx]];
    const clientesDoPeriodo = p.clientes;

    const dedup = {};
    clientesDoPeriodo.forEach(c => {
      const k = normalizarNomeCliente(c.nome);
      if (!dedup[k]) {
        dedup[k] = Object.assign({}, c);
      } else {
        dedup[k].valorTotal = (dedup[k].valorTotal || 0) + (c.valorTotal || 0);
        dedup[k].numCompras = (dedup[k].numCompras || 0) + (c.numCompras || 0);
        if (c.ultimaCompra && (!dedup[k].ultimaCompra || c.ultimaCompra > dedup[k].ultimaCompra)) {
          dedup[k].ultimaCompra = c.ultimaCompra;
        }
        if (c.primeiraCompra && (!dedup[k].primeiraCompra || c.primeiraCompra < dedup[k].primeiraCompra)) {
          dedup[k].primeiraCompra = c.primeiraCompra;
        }
      }
    });

    const payload = Object.values(dedup).map(c => ({
      filial_id: filialId,
      periodo_ini: p.pIni,
      periodo_fim: p.pFim,
      cliente_norm: normalizarNomeCliente(c.nome),
      nome: c.nome,
      codigo: c.codigo || null,
      cidade: c.cidade || null,
      uf: c.uf || null,
      vendedor_id: c.vendedor && vendedoresMap[c.vendedor] ? vendedoresMap[c.vendedor] : null,
      valor: c.valorTotal || 0,
      num_compras: c.numCompras || 0,
      ultima_compra: c.ultimaCompra || null,
      primeira_compra_no_mes: c.primeiraCompra || null
    }));

    const del = await session.sb.from('clientes_importacoes')
      .delete()
      .eq('filial_id', filialId)
      .eq('periodo_ini', p.pIni)
      .eq('periodo_fim', p.pFim);
    if (del.error) throw new Error('clientes_importacoes delete: ' + del.error.message);

    for (let i = 0; i < payload.length; i += 500) {
      const chunk = payload.slice(i, i + 500);
      const r = await session.sb.from('clientes_importacoes').insert(chunk);
      if (r.error) throw new Error('clientes_importacoes insert: ' + r.error.message);
    }
  }

  // Rebuild clientes agregado
  const todas = await sbFetchAll('clientes_importacoes', { eq: { filial_id: filialId } });

  const agregado = {};
  (todas.data || []).forEach(row => {
    const k = row.cliente_norm;
    if (!agregado[k]) {
      agregado[k] = {
        filial_id: filialId,
        vendedor_id: row.vendedor_id,
        nome: row.nome,
        codigo: row.codigo,
        cidade: row.cidade,
        uf: row.uf,
        valor_total: 0,
        num_compras: 0,
        ultima_compra: null,
        primeira_compra: null,
        _datas: [],
        _periodos: []
      };
    }
    const a = agregado[k];
    a.valor_total += Number(row.valor) || 0;
    a.num_compras += Number(row.num_compras) || 0;

    if (row.periodo_ini) {
      if (!a.primeira_compra || row.periodo_ini < a.primeira_compra) {
        a.primeira_compra = row.periodo_ini;
      }
    }
    if (row.ultima_compra) {
      if (!a.ultima_compra || row.ultima_compra > a.ultima_compra) {
        a.ultima_compra = row.ultima_compra;
      }
      if (a._datas.indexOf(row.ultima_compra) < 0) a._datas.push(row.ultima_compra);
    }
    if (row.vendedor_id && !a.vendedor_id) a.vendedor_id = row.vendedor_id;
    if (row.cidade && !a.cidade) { a.cidade = row.cidade; a.uf = row.uf; }

    a._periodos.push({
      periodoIni: row.periodo_ini,
      valor: Number(row.valor) || 0
    });
  });

  const payloadFinal = Object.values(agregado).map(a => {
    a._datas.sort();
    let intervaloMedio = 30;
    if (a._datas.length > 1) {
      const span = diffDias(a._datas[0], a._datas[a._datas.length - 1]);
      intervaloMedio = Math.max(1, Math.round(span / (a._datas.length - 1)));
    }

    // Valor médio mensal: últimos 90 dias de atividade
    let valorMedioMensal = 0;
    if (a._periodos.length > 0 && a.ultima_compra) {
      a._periodos.sort((p1, p2) => (p1.periodoIni || '').localeCompare(p2.periodoIni || ''));

      const ultima = new Date(a.ultima_compra + 'T12:00:00');
      const corte = new Date(ultima);
      corte.setDate(corte.getDate() - 90);
      const corteIso = corte.getFullYear() + '-' +
        String(corte.getMonth() + 1).padStart(2, '0') + '-' +
        String(corte.getDate()).padStart(2, '0');

      const recentes = a._periodos.filter(p =>
        p.periodoIni >= corteIso && p.periodoIni <= a.ultima_compra
      );

      if (recentes.length > 0) {
        const somaRecente = recentes.reduce((s, p) => s + p.valor, 0);
        valorMedioMensal = somaRecente / 3;
      } else {
        const span = diffDias(a.primeira_compra, a.ultima_compra);
        const meses = Math.max(1, Math.round(span / 30) + 1);
        valorMedioMensal = a.valor_total / meses;
      }
    }

    return {
      filial_id: a.filial_id,
      vendedor_id: a.vendedor_id,
      nome: a.nome,
      codigo: a.codigo,
      cidade: a.cidade,
      uf: a.uf,
      valor_total: a.valor_total,
      num_compras: a.num_compras,
      ultima_compra: a.ultima_compra,
      primeira_compra: a.primeira_compra,
      intervalo_medio: intervaloMedio,
      valor_medio_mensal: valorMedioMensal
    };
  });

  const delCli = await session.sb.from('clientes').delete().eq('filial_id', filialId);
  if (delCli.error) throw new Error('clientes delete: ' + delCli.error.message);

  let total = 0;
  for (let i = 0; i < payloadFinal.length; i += 500) {
    const chunk = payloadFinal.slice(i, i + 500);
    const r = await session.sb.from('clientes').insert(chunk);
    if (r.error) throw new Error('clientes insert: ' + r.error.message);
    total += chunk.length;
  }

  return total;
}

// ------------------------------------------------------------
// PRODUTOS
// ------------------------------------------------------------

export async function sbUpsertProdutos(lista, filialId) {
  if (!lista || lista.length === 0) return 0;

  const dedup = {};
  lista.forEach(p => {
    if (!p.codigo) return;
    const k = String(p.codigo).trim();
    if (!dedup[k]) {
      dedup[k] = {
        codigo: k, descricao: p.descricao,
        fabricante: p.fabricante || null,
        curva: p.curva || p.curvaOficial || null,
        qtdVendida: p.qtdVendida || 0, valorVendido: p.valorVendido || 0,
        estoqueAtual: p.estoqueAtual, estoqueMinimo: p.estoqueMinimo
      };
    } else {
      dedup[k].qtdVendida += (p.qtdVendida || 0);
      dedup[k].valorVendido += (p.valorVendido || 0);
      if (!dedup[k].fabricante && p.fabricante) dedup[k].fabricante = p.fabricante;
      if (!dedup[k].curva && (p.curva || p.curvaOficial)) dedup[k].curva = p.curva || p.curvaOficial;
    }
  });

  // Busca descrição/fabricante/curva de produtos_mes COM PAGINAÇÃO
  // A descrição do 361 (cadastro) tem prioridade sobre a do 324 (pedido do vendedor)
  const pm = await sbFetchAll('produtos_mes', {
    select: 'codigo, descricao, fabricante, curva',
    eq: { filial_id: filialId },
    order: { column: 'mes', options: { ascending: false } }
  });
  const mapaPM = {};
  (pm.data || []).forEach(p => {
    if (!mapaPM[p.codigo]) mapaPM[p.codigo] = { descricao: null, fabricante: null, curva: null };
    if (p.descricao && !mapaPM[p.codigo].descricao) mapaPM[p.codigo].descricao = p.descricao;
    if (p.fabricante && !mapaPM[p.codigo].fabricante) mapaPM[p.codigo].fabricante = p.fabricante;
    if (p.curva && !mapaPM[p.codigo].curva) mapaPM[p.codigo].curva = p.curva;
  });

  const existentes = await session.sb.from('produtos')
    .select('codigo, curva, estoque_atual, estoque_minimo, fabricante')
    .eq('filial_id', filialId);
  if (existentes.error) throw new Error('produtos select: ' + existentes.error.message);

  const mapaAnt = {};
  (existentes.data || []).forEach(p => { mapaAnt[p.codigo] = p; });

  const payload = Object.keys(dedup).map(k => {
    const p = dedup[k];
    const ant = mapaAnt[k];
    const pmInfo = mapaPM[k] || {};

    return {
      filial_id: filialId, codigo: p.codigo,
      descricao: pmInfo.descricao || p.descricao,   // 361 preferencial, 324 fallback
      fabricante: pmInfo.fabricante || (ant && ant.fabricante) || p.fabricante || null,
      curva: pmInfo.curva || (ant && ant.curva) || p.curva || null,
      qtd_vendida: p.qtdVendida || 0,
      valor_vendido: p.valorVendido || 0,
      estoque_atual: (ant && ant.estoque_atual != null) ? ant.estoque_atual : (p.estoqueAtual != null ? p.estoqueAtual : null),
      estoque_minimo: (ant && ant.estoque_minimo != null) ? ant.estoque_minimo : (p.estoqueMinimo != null ? p.estoqueMinimo : null)
    };
  });

  const del = await session.sb.from('produtos').delete().eq('filial_id', filialId);
  if (del.error) throw new Error('produtos delete: ' + del.error.message);

  let total = 0;
  for (let i = 0; i < payload.length; i += 500) {
    const chunk = payload.slice(i, i + 500);
    const r = await session.sb.from('produtos').insert(chunk);
    if (r.error) throw new Error('produtos insert: ' + r.error.message);
    total += chunk.length;
  }
  return total;
}

// ------------------------------------------------------------
// LANÇAMENTOS
// ------------------------------------------------------------

export async function sbUpsertLancamentos(lista, filialId, vendedoresMap) {
  if (!lista || lista.length === 0) return 0;

  const datas = [];
  lista.forEach(l => { if (datas.indexOf(l.data) < 0) datas.push(l.data); });

  const ex = await session.sb.from('lancamentos')
    .select('id, vendedor_id, data')
    .eq('filial_id', filialId)
    .in('data', datas);

  const mapa = {};
  (ex.data || []).forEach(l => { mapa[l.vendedor_id + '|' + l.data] = l.id; });

  const paraUpsert = [];
  lista.forEach(l => {
    const vid = vendedoresMap[l.vendedor] || l.vendedor;
    if (!vid) return;
    const payload = {
      filial_id: filialId, vendedor_id: vid, data: l.data,
      valor: l.valor || 0, pedidos: l.pedidos || 0,
      desconto: l.desconto || 0, obs: l.obs || null
    };
    const chave = vid + '|' + l.data;
    if (mapa[chave]) payload.id = mapa[chave];
    paraUpsert.push(payload);
  });

  let total = 0;
  for (let i = 0; i < paraUpsert.length; i += 500) {
    const chunk = paraUpsert.slice(i, i + 500);
    const r = await session.sb.from('lancamentos').upsert(chunk, { onConflict: 'id' });
    if (r.error) throw new Error('lancamentos: ' + r.error.message);
    total += chunk.length;
  }
  return total;
}

// ------------------------------------------------------------
// CIDADES (mensal)
// ------------------------------------------------------------

export async function sbUpsertCidades(lista, filialId, mesKey) {
  if (!lista || lista.length === 0) return 0;
  const listaMes = lista.filter(c => (c.mesKey || mesKey) === mesKey);
  if (listaMes.length === 0) return 0;

  await session.sb.from('cidades').delete().eq('filial_id', filialId).eq('mes', mesKey);

  const payload = listaMes.map(c => ({
    filial_id: filialId, nome: c.nome, uf: c.uf || null,
    total_valor: c.totalValor || 0, qtd_vendas: c.qtdVendas || 0,
    num_clientes: c.numClientes || 0, clientes: c.clientes || [],
    mes: mesKey
  }));

  let total = 0;
  for (let i = 0; i < payload.length; i += 500) {
    const chunk = payload.slice(i, i + 500);
    const r = await session.sb.from('cidades').insert(chunk);
    if (r.error) throw new Error('cidades: ' + r.error.message);
    total += chunk.length;
  }
  return total;
}

// ------------------------------------------------------------
// COMPARATIVO
// ------------------------------------------------------------

export async function sbUpsertComparativo(lista, filialId) {
  if (!lista || lista.length === 0) return 0;
  const meses = lista.map(m => m.mes);

  await session.sb.from('comparativo').delete().eq('filial_id', filialId).in('mes', meses);

  const payload = lista.map(m => ({
    filial_id: filialId, mes: m.mes,
    fat2025: m.fat2025 || 0, ped2025: m.ped2025 || 0,
    fat2026: m.fat2026 || 0, ped2026: m.ped2026 || 0,
    vendedores: m.vendedores || {}
  }));

  const r = await session.sb.from('comparativo').insert(payload);
  if (r.error) throw new Error('comparativo: ' + r.error.message);
  return payload.length;
}

// ------------------------------------------------------------
// PRODUTOS_MES (mensal)
// ------------------------------------------------------------

export async function sbUpsertProdutosMes(lista, filialId, mes) {
  if (!lista || lista.length === 0) return 0;

  const mapa = {};
  lista.forEach(p => {
    if (!p.codigo) return;
    if (!mapa[p.codigo]) {
      mapa[p.codigo] = {
        filial_id: filialId, mes, codigo: p.codigo,
        descricao: p.descricao, fabricante: p.fabricante || null,
        curva: p.curvaOficial || null,
        qtd: p.qtd || 0, valor: p.valor || 0
      };
    } else {
      mapa[p.codigo].qtd += (p.qtd || 0);
      mapa[p.codigo].valor += (p.valor || 0);
    }
  });

  const payload = Object.values(mapa);

  const del = await session.sb.from('produtos_mes').delete().eq('filial_id', filialId).eq('mes', mes);
  if (del.error) throw new Error('produtos_mes delete: ' + del.error.message);

  let total = 0;
  for (let i = 0; i < payload.length; i += 500) {
    const chunk = payload.slice(i, i + 500);
    const r = await session.sb.from('produtos_mes').upsert(chunk, { onConflict: 'filial_id,mes,codigo' });
    if (r.error) throw new Error('produtos_mes: ' + r.error.message);
    total += chunk.length;
  }
  return total;
}

// ------------------------------------------------------------
// VENDAS_ITENS — por período de importação
// ------------------------------------------------------------

export async function sbUpsertVendasItens(lista, filialId) {
  if (!lista || lista.length === 0) return 0;

  const porPeriodo = {};
  lista.forEach(v => {
    const pIni = v.periodoIni || '';
    const pFim = v.periodoFim || pIni;
    if (!pIni) return;
    const k = pIni + '|' + pFim;
    if (!porPeriodo[k]) porPeriodo[k] = { pIni, pFim, itens: [] };
    porPeriodo[k].itens.push(v);
  });

  const periodos = Object.keys(porPeriodo);
  let total = 0;

  for (let pIdx = 0; pIdx < periodos.length; pIdx++) {
    const p = porPeriodo[periodos[pIdx]];
    const itensDoPeriodo = p.itens;

    const del = await session.sb.from('vendas_itens')
      .delete()
      .eq('filial_id', filialId)
      .eq('periodo_ini', p.pIni)
      .eq('periodo_fim', p.pFim);
    if (del.error) throw new Error('vendas_itens delete: ' + del.error.message);

    const payload = itensDoPeriodo.map(v => ({
      filial_id: filialId,
      periodo_ini: p.pIni, periodo_fim: p.pFim,
      cliente_norm: v.clienteNorm, produto_codigo: v.produtoCodigo,
      vendedor_id: v.vendedor || null,
      produto_descricao: v.produtoDescricao,
      valor: v.valor || 0, qtd: v.qtd || 0
    }));

    for (let i = 0; i < payload.length; i += 500) {
      const chunk = payload.slice(i, i + 500);
      const r = await session.sb.from('vendas_itens').insert(chunk);
      if (r.error) throw new Error('vendas_itens: ' + r.error.message);
      total += chunk.length;
    }
  }

  return total;
}

// ------------------------------------------------------------
// ESTOQUE / ABC
// ------------------------------------------------------------

export async function sbAplicarEstoqueABC(lista) {
  if (!lista || lista.length === 0) return 0;

  const todos = await session.sb.from('produtos').select('id, codigo');
  if (todos.error) throw new Error('produtos select: ' + todos.error.message);

  const mapa = {};
  (todos.data || []).forEach(p => { mapa[p.codigo] = p.id; });

  const paraAtualizar = [];
  lista.forEach(item => {
    if (!mapa[item.codigo]) return;
    paraAtualizar.push({
      id: mapa[item.codigo],
      codigo: item.codigo,
      fabricante: item.fabricante || null,
      curva: item.curvaOficial || null,
      estoque_atual: item.estoqueAtual != null ? item.estoqueAtual : null,
      estoque_minimo: item.estoqueMinimo != null ? item.estoqueMinimo : null
    });
  });

  let total = 0;
  for (let i = 0; i < paraAtualizar.length; i += 500) {
    const chunk = paraAtualizar.slice(i, i + 500);
    const r = await session.sb.from('produtos').upsert(chunk, { onConflict: 'id' });
    if (r.error) throw new Error('produtos upsert: ' + r.error.message);
    total += chunk.length;
  }
  return total;
}

// ------------------------------------------------------------
// SINCRONIZAR BASES PENDENTES
// ------------------------------------------------------------

export async function sbSincronizarBasesPendentes() {
  const st = document.getElementById('erp-status');
  if (!basesPreview.filialImport) throw new Error('Sem filial definida');

  const filialId = basesPreview.filialImport;
  const vMap = construirMapaVendedores();
  const log = [];
  const status = msg => {
    log.push(msg);
    if (st) st.innerHTML = log.join('<br>');
  };
  const arr = x => Array.isArray(x) ? x : [];

  status('⏳ Sincronizando...');

  if (arr(basesPreview.clientes).length > 0) {
    const n = await sbUpsertClientes(basesPreview.clientes, filialId, vMap);
    status('✓ ' + n + ' clientes');
  }
  if (arr(basesPreview.produtos).length > 0) {
    const n = await sbUpsertProdutos(basesPreview.produtos, filialId);
    status('✓ ' + n + ' produtos');
  }
  if (arr(basesPreview.lancamentosMulti).length > 0) {
    const n = await sbUpsertLancamentos(basesPreview.lancamentosMulti, filialId, vMap);
    status('✓ ' + n + ' lançamentos');
  }
  if (arr(basesPreview.vendasItens).length > 0) {
    const n = await sbUpsertVendasItens(basesPreview.vendasItens, filialId);
    status('✓ ' + n + ' pares cliente×produto');
  }
  if (arr(basesPreview.cidades).length > 0) {
    const mesesImp = arr(basesPreview._mesesImport);
    if (mesesImp.length > 0) {
      for (let i = 0; i < mesesImp.length; i++) {
        const mimp = mesesImp[i];
        if (!mimp || !mimp.mes || arr(mimp.cidades).length === 0) continue;
        const n = await sbUpsertCidades(mimp.cidades, filialId, mimp.mes);
        status('✓ ' + n + ' cidades (' + mimp.mes + ')');
      }
    } else if (basesPreview.periodoInicio) {
      const mesKey = basesPreview.periodoInicio.slice(0, 7);
      const n = await sbUpsertCidades(basesPreview.cidades, filialId, mesKey);
      status('✓ ' + n + ' cidades (' + mesKey + ')');
    }
  }
  if (arr(basesPreview.comparativo).length > 0) {
    const n = await sbUpsertComparativo(basesPreview.comparativo, filialId);
    status('✓ ' + n + ' meses comparativo');
  }
  if (arr(basesPreview.estoqueABC).length > 0) {
    const mesesABC = arr(basesPreview._mesesABC);
    if (mesesABC.length > 0) {
      for (let j = 0; j < mesesABC.length; j++) {
        const ma = mesesABC[j];
        if (!ma || !ma.mes || arr(ma.itens).length === 0) continue;
        const n = await sbUpsertProdutosMes(ma.itens, filialId, ma.mes);
        status('✓ ' + n + ' produtos_mes (' + ma.mes + ')');
      }
    } else if (basesPreview.abcPeriodoInicio) {
      const mesABC = basesPreview.abcPeriodoInicio.slice(0, 7);
      const n = await sbUpsertProdutosMes(basesPreview.estoqueABC, filialId, mesABC);
      status('✓ ' + n + ' produtos_mes (' + mesABC + ')');
    }
    status('⏳ Aplicando curva/estoque em produtos...');
    try {
      const n = await sbAplicarEstoqueABC(basesPreview.estoqueABC);
      status('✓ ' + n + ' itens com curva/estoque');
    } catch (errAplicar) {
      status('⚠ falha ao aplicar curva: ' + errAplicar.message);
    }
  }
  status('✅ Sincronizado!');
}