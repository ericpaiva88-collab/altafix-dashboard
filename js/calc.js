// ============================================================
// calc.js — Todos os cálculos do app
// (feriados, dias úteis, RFM, ABC, projeções, matching)
// ============================================================

import { state } from './state.js';
import { normalizarNomeCliente, diffDias, isoDate } from './utils.js';

// ============================================================
// FERIADOS E DIAS ÚTEIS
// ============================================================

export function ehFeriado(a, m, d) {
  const l = state.config.feriados || [];
  const mm = String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  return l.indexOf(a + '-' + mm) >= 0 || l.indexOf(mm) >= 0;
}

export function ehDiaUtil(a, m, d) {
  const dw = new Date(a, m, d).getDay();
  return dw !== 0 && dw !== 6 && !ehFeriado(a, m, d);
}

export function calcDiasUteisNoMes(a, m) {
  const ultimo = new Date(a, m + 1, 0).getDate();
  let c = 0;
  for (let d = 1; d <= ultimo; d++) {
    if (ehDiaUtil(a, m, d)) c++;
  }
  return c;
}

export function contarFeriadosNoMes(a, m) {
  const ultimo = new Date(a, m + 1, 0).getDate();
  let c = 0;
  for (let d = 1; d <= ultimo; d++) {
    if (ehFeriado(a, m, d)) {
      const dw = new Date(a, m, d).getDay();
      if (dw !== 0 && dw !== 6) c++;
    }
  }
  return c;
}

// ============================================================
// ESCOPO — filtra dados pela filial/grupo ativos
// ============================================================

export function parseEscopo(str) {
  if (!str || str === 'ALL') return { tipo: 'all' };
  const p = str.split(':');
  return { tipo: p[0].toLowerCase(), id: p[1] };
}

export function filialNoEscopo(fid, escopoAtual) {
  if (!fid) return true;
  const e = parseEscopo(escopoAtual);
  if (e.tipo === 'all') return true;
  const f = state.filiais.find(x => x.id === fid);
  if (!f) return false;
  if (e.tipo === 'filial') return f.id === e.id;
  if (e.tipo === 'grupo') return f.grupoId === e.id;
  return true;
}

export function vendedoresNoEscopo(escopoAtual) {
  return state.vendedores.filter(v => filialNoEscopo(v.filialId, escopoAtual));
}

export function lancamentosNoEscopo(escopoAtual) {
  return state.lancamentos.filter(l => filialNoEscopo(l.filialId, escopoAtual));
}

export function clientesNoEscopo(escopoAtual) {
  return state.clientes.filter(c => filialNoEscopo(c.filialId, escopoAtual));
}

export function produtosNoEscopo(escopoAtual) {
  return state.produtos.filter(p => filialNoEscopo(p.filialId, escopoAtual));
}

export function comparativoNoEscopo(escopoAtual) {
  return (state.comparativo || []).filter(c => filialNoEscopo(c.filialId, escopoAtual));
}

export function escopoNome(escopoAtual) {
  const e = parseEscopo(escopoAtual);
  if (e.tipo === 'all') return 'Todas as filiais';
  if (e.tipo === 'filial') {
    const f = state.filiais.find(x => x.id === e.id);
    return f ? f.nome : '—';
  }
  const g = state.grupos.find(x => x.id === e.id);
  return g ? g.nome : '—';
}

export function escopoFilialAtiva(escopoAtual) {
  const e = parseEscopo(escopoAtual);
  return e.tipo === 'filial' ? e.id : null;
}

// ============================================================
// VENDEDOR — match por nome (para importação)
// ============================================================

export function matchVendedor(n, filialId) {
  if (!n) return null;
  const s = normalizarNomeCliente(n);
  if (!s) return null;

  const pool = state.vendedores.filter(v => !filialId || v.filialId === filialId);

  const exact = pool.find(v => normalizarNomeCliente(v.nome) === s);
  if (exact) return exact;

  const sw = pool.filter(v => s.indexOf(normalizarNomeCliente(v.nome)) === 0);
  if (sw.length === 1) return sw[0];

  const sw2 = pool.filter(v => normalizarNomeCliente(v.nome).indexOf(s) === 0);
  if (sw2.length === 1) return sw2[0];

  const cont = pool.filter(v => {
    const nv = normalizarNomeCliente(v.nome);
    return nv.indexOf(s) >= 0 || s.indexOf(nv) >= 0;
  });
  if (cont.length === 1) return cont[0];

  const fn = s.split(/\s+/)[0];
  const bf = pool.filter(v => normalizarNomeCliente(v.nome) === fn);
  if (bf.length === 1) return bf[0];

  return null;
}

// ============================================================
// MÊS DE REFERÊNCIA
// ============================================================

export function mesRefAtual(escopoAtual) {
  const h = new Date();
  return { ano: h.getFullYear(), mes: h.getMonth() };
}

// ============================================================
// METAS POR VENDEDOR/MÊS
// ============================================================

export function getMetaVendedor(v, a, m) {
  const mesKey = a + '-' + String(m + 1).padStart(2, '0');

  const exata = state.metas.find(x => x.vendedorId === v.id && x.mes === mesKey);
  if (exata) return { meta: exata.metaFaturamento, metaTicket: exata.metaTicket };

  const anteriores = state.metas
    .filter(x => x.vendedorId === v.id && x.mes < mesKey)
    .sort((a, b) => b.mes.localeCompare(a.mes));

  if (anteriores.length > 0) {
    return { meta: anteriores[0].metaFaturamento, metaTicket: anteriores[0].metaTicket };
  }

  return { meta: v.meta || 0, metaTicket: v.metaTicket || 0 };
}

// ============================================================
// CÁLCULOS DE VENDAS
// ============================================================

export function calcDiasComLancamento(a, m, vendedorId, escopoAtual) {
  const prefix = a + '-' + String(m + 1).padStart(2, '0');
  const dias = {};

  lancamentosNoEscopo(escopoAtual).forEach(l => {
    if (l.data.indexOf(prefix) !== 0) return;
    if (vendedorId && l.vendedor !== vendedorId) return;
    dias[l.data] = true;
  });

  let count = 0;
  Object.keys(dias).forEach(iso => {
    const d = new Date(iso + 'T12:00:00');
    if (ehDiaUtil(d.getFullYear(), d.getMonth(), d.getDate())) count++;
  });
  return count;
}

export function calcVendedor(v, a, m) {
  const prefix = a + '-' + String(m + 1).padStart(2, '0');
  const lancs = state.lancamentos.filter(l => l.data.indexOf(prefix) === 0 && l.vendedor === v.id);

  let fat = 0, ped = 0, dp = 0, vb = 0;
  lancs.forEach(l => {
    fat += (l.valor || 0);
    ped += (l.pedidos || 0);
    vb += (l.valor || 0);
    dp += (l.valor || 0) * (l.desconto || 0);
  });

  const dm = vb > 0 ? dp / vb : 0;
  const metaObj = getMetaVendedor(v, a, m);
  const meta = metaObj.meta;
  const mt = metaObj.metaTicket;
  const tk = ped > 0 ? fat / ped : 0;
  const pm = meta > 0 ? (fat / meta) * 100 : null;

  const du = calcDiasUteisNoMes(a, m);
  const dt = calcDiasComLancamento(a, m, v.id, null);
  const df = Math.max(0, du - dt);

  const re = meta > 0 ? meta * (dt / du) : 0;
  const md = (df > 0 && meta > 0) ? (meta - fat) / df : 0;
  const pr = dt > 0 ? (fat / dt) * du : 0;
  const st = v.supervisor
    ? 'SUPERVISOR'
    : (meta > 0 ? (fat >= re ? 'ACIMA' : 'ABAIXO') : '—');

  return {
    vendedor: v, faturado: fat, pedidos: ped, ticket: tk,
    meta, metaTicket: mt, pctMeta: pm,
    descontoMedio: dm, diasTrab: dt, diasFaltam: df, diasUteisTotal: du,
    ritmoEsperado: re, metaDia: md, projecao: pr, status: st
  };
}

export function calcFilialMesmaAltura(a, m, escopoAtual) {
  const hoje = new Date();
  const diaCorte = (hoje.getFullYear() === a && hoje.getMonth() === m) ? hoje.getDate() : 31;
  const mesAnt = new Date(a, m - 1, 1);
  const prefix = mesAnt.getFullYear() + '-' + String(mesAnt.getMonth() + 1).padStart(2, '0');

  let fat = 0, ped = 0;
  lancamentosNoEscopo(escopoAtual).forEach(l => {
    if (l.data.indexOf(prefix) !== 0) return;
    if (parseInt(l.data.slice(8, 10), 10) > diaCorte) return;
    fat += (l.valor || 0);
    ped += (l.pedidos || 0);
  });
  return { faturadoTotal: fat, pedidosTotal: ped };
}

export function calcFilial(a, m, escopoAtual) {
  const prefix = a + '-' + String(m + 1).padStart(2, '0');

  const at = vendedoresNoEscopo(escopoAtual).filter(v => {
    if (v.papel === 'administrativo') return false;
    if (v.papel === 'diretor') {
      return state.lancamentos.some(l => l.vendedor === v.id && l.data.indexOf(prefix) === 0);
    }
    if (v.ativo) return true;
    return state.lancamentos.some(l => l.vendedor === v.id && l.data.indexOf(prefix) === 0);
  });

  const atAdmin = vendedoresNoEscopo(escopoAtual).filter(v => v.ativo && v.papel === 'administrativo');

  const dados = at.map(v => calcVendedor(v, a, m));
  const dadosAdmin = atAdmin.map(v => calcVendedor(v, a, m));

  const mt = at
    .filter(v => !v.supervisor && v.meta > 0)
    .reduce((s, v) => s + (getMetaVendedor(v, a, m).meta || 0), 0);

  const ft = dados.reduce((s, d) => s + d.faturado, 0);
  const ftComMeta = dados
    .filter(d => !d.vendedor.supervisor && d.meta > 0)
    .reduce((s, d) => s + d.faturado, 0);
  const pt = dados.reduce((s, d) => s + d.pedidos, 0);

  const fatAdmin = dadosAdmin.reduce((s, d) => s + d.faturado, 0);
  const pedAdmin = dadosAdmin.reduce((s, d) => s + d.pedidos, 0);

  const tk = pt > 0 ? ft / pt : 0;
  const pm = mt > 0 ? (ftComMeta / mt) * 100 : 0;

  const du = calcDiasUteisNoMes(a, m);
  const dt = calcDiasComLancamento(a, m, null, escopoAtual);
  const df = Math.max(0, du - dt);

  const re = mt > 0 ? mt * (dt / du) : 0;
  const pr = dt > 0 ? (ft / dt) * du : 0;

  const fl = Math.max(0, mt - ftComMeta);
  const pd = df > 0 ? fl / df : 0;

  return {
    dados, dadosAdmin,
    faturadoAdmin: fatAdmin, pedidosAdmin: pedAdmin,
    metaTotal: mt, faturadoTotal: ft, faturadoComMeta: ftComMeta,
    pedidosTotal: pt, ticketMedio: tk, pctMeta: pm,
    diasTrab: dt, diasFaltam: df, diasUteisTotal: du,
    ritmoEsperado: re, projecao: pr, falta: fl, porDia: pd,
    status: ft >= re ? 'ACIMA' : 'ABAIXO'
  };
}

// ============================================================
// RFM — pontuação de clientes
// ============================================================

export function calcRFMScores(clientes) {
  if (!clientes || clientes.length === 0) return;

  const hj = isoDate(new Date());
  const valores = clientes.map(c => c.valorTotal || 0).sort((a, b) => a - b);
  const mediana = valores[Math.floor(valores.length / 2)] || 0;
  const p80 = valores[Math.floor(valores.length * 0.8)] || mediana * 2;
  const p95 = valores[Math.floor(valores.length * 0.95)] || p80 * 2;

  clientes.forEach(c => {
    const dias = c.ultimaCompra ? diffDias(c.ultimaCompra, hj) : 9999;
    const freq = c.numCompras || 0;
    const valor = c.valorTotal || 0;

    let sr;
    if (dias <= 15) sr = 5;
    else if (dias <= 30) sr = 4;
    else if (dias <= 60) sr = 3;
    else if (dias <= 120) sr = 2;
    else sr = 1;

    let sf;
    if (freq >= 10) sf = 5;
    else if (freq >= 5) sf = 4;
    else if (freq >= 3) sf = 3;
    else if (freq >= 2) sf = 2;
    else sf = 1;

    let sm;
    if (valor >= p95) sm = 5;
    else if (valor >= p80) sm = 4;
    else if (valor >= mediana) sm = 3;
    else if (valor >= mediana * 0.4) sm = 2;
    else sm = 1;

    c.rfm_r = sr; c.rfm_f = sf; c.rfm_m = sm;
    c.rfm_score = sr + sf + sm;
    c.diasSemComprar = dias;

    let seg;
    if (sr >= 4 && sf >= 4 && sm >= 4) seg = 'campeao';
    else if (sr >= 3 && sf >= 3) seg = 'leal';
    else if (sr <= 2 && sf >= 3 && sm >= 3) seg = 'risco';
    else if (sr <= 2 && sf <= 2) seg = 'hibernando';
    else if (sr >= 4 && sf <= 2 && sm >= 3) seg = 'promissor';
    else seg = 'leal';

    c.rfm_segmento = seg;
  });
}

export function calcABCClientes(clientes) {
  if (!clientes || clientes.length === 0) return;

  const sorted = clientes.slice().sort((a, b) => (b.valorTotal || 0) - (a.valorTotal || 0));
  const total = sorted.reduce((s, c) => s + (c.valorTotal || 0), 0);

  if (total <= 0) {
    clientes.forEach(c => { c.abcCliente = 'C'; });
    return;
  }

  let ac = 0;
  sorted.forEach(c => {
    ac += (c.valorTotal || 0);
    const pct = (ac / total) * 100;
    c.abcCliente = pct <= 80 ? 'A' : (pct <= 95 ? 'B' : 'C');
  });
}

export function rfmLabel(seg) {
  return {
    campeao: '🏆 Campeão',
    leal: '💙 Leal',
    promissor: '🌱 Promissor',
    risco: '🚨 Em Risco',
    hibernando: '💤 Hibernando'
  }[seg] || seg;
}

// ============================================================
// MERGES — ao reimportar, junta dados antigos + novos
// ============================================================

export function mesclarCliente(ant, novo) {
  ant.valorTotal = (ant.valorTotal || 0) + (novo.valorTotal || 0);
  ant.numCompras = (ant.numCompras || 0) + (novo.numCompras || 0);

  if (!ant._datas) ant._datas = [];
  if (novo._datas && novo._datas.length) {
    novo._datas.forEach(d => {
      if (ant._datas.indexOf(d) < 0) ant._datas.push(d);
    });
  } else if (novo.ultimaCompra && ant._datas.indexOf(novo.ultimaCompra) < 0) {
    ant._datas.push(novo.ultimaCompra);
  }
  ant._datas.sort();

  if (novo.ultimaCompra && (!ant.ultimaCompra || novo.ultimaCompra > ant.ultimaCompra)) {
    ant.ultimaCompra = novo.ultimaCompra;
  }
  if (novo.primeiraCompra && (!ant.primeiraCompra || novo.primeiraCompra < ant.primeiraCompra)) {
    ant.primeiraCompra = novo.primeiraCompra;
  }

  if (ant._datas.length > 1) {
    const spanTotal = diffDias(ant._datas[0], ant._datas[ant._datas.length - 1]);
    ant.intervaloMedio = Math.max(1, Math.round(spanTotal / (ant._datas.length - 1)));
  } else {
    ant.intervaloMedio = 30;
  }

  if (ant.primeiraCompra && ant.ultimaCompra) {
    const diasSpan = diffDias(ant.primeiraCompra, ant.ultimaCompra);
    const meses = Math.max(1, Math.round(diasSpan / 30) + 1);
    ant.valorMedioMensal = ant.valorTotal / meses;
  }

  if (!ant.codigo && novo.codigo) ant.codigo = novo.codigo;
  if (!ant.cidade && novo.cidade) { ant.cidade = novo.cidade; ant.uf = novo.uf; }
  if (!ant.vendedor && novo.vendedor) ant.vendedor = novo.vendedor;

  return ant;
}

export function mesclarProduto(ant, novo) {
  ant.qtdVendida = (ant.qtdVendida || 0) + (novo.qtdVendida || 0);
  ant.valorVendido = (ant.valorVendido || 0) + (novo.valorVendido || 0);

  if (!ant.curvaOficial && novo.curvaOficial) ant.curvaOficial = novo.curvaOficial;
  if (!ant.curva && novo.curva) ant.curva = novo.curva;
  if (ant.estoqueAtual == null && novo.estoqueAtual != null) ant.estoqueAtual = novo.estoqueAtual;
  if (ant.estoqueMinimo == null && novo.estoqueMinimo != null) ant.estoqueMinimo = novo.estoqueMinimo;
  if (!ant.fabricante && novo.fabricante) ant.fabricante = novo.fabricante;
  if (!ant.descricao || ant.descricao.length < novo.descricao.length) ant.descricao = novo.descricao;

  return ant;
}

// ============================================================
// HISTÓRICO — deriva a partir das cidades
// ============================================================

export function derivarHistorico() {
  const hist = {};
  (state.cidades || []).forEach(c => {
    if (!c.mesKey) return;
    if (!hist[c.mesKey]) hist[c.mesKey] = { mes: c.mesKey, cidades: [] };
    hist[c.mesKey].cidades.push({
      nome: c.nome, uf: c.uf, totalValor: c.totalValor,
      numClientes: c.numClientes, qtdVendas: c.qtdVendas
    });
  });
  state._historico = hist;
}