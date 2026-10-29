// ============================================================
// calc.js — Todos os cálculos do app (Otimizado)
// ============================================================

import { state, ui } from './state.js';
import { normalizarNomeCliente, diffDias, isoDate } from './utils.js';

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

export function calcDiasUteisDecorridos(a, m) {
  const hj = new Date();
  const inicioMes = new Date(a, m, 1);
  if (hj < inicioMes) return 0;
  if (hj.getFullYear() > a || (hj.getFullYear() === a && hj.getMonth() > m)) {
    return calcDiasUteisNoMes(a, m);
  }
  let count = 0;
  for (let d = 1; d <= hj.getDate(); d++) {
    if (ehDiaUtil(a, m, d)) count++;
  }
  return count;
}

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
  if (parseEscopo(escopoAtual).tipo === 'all') return state.lancamentos;
  return state.lancamentos.filter(l => filialNoEscopo(l.filialId, escopoAtual));
}

export function clientesNoEscopo(escopoAtual) {
  if (parseEscopo(escopoAtual).tipo === 'all') return state.clientes;
  return state.clientes.filter(c => filialNoEscopo(c.filialId, escopoAtual));
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

export function matchVendedor(n, filialId) {
  if (!n) return null;
  const s = normalizarNomeCliente(n);
  if (!s) return null;
  const pool = state.vendedores.filter(v => !filialId || v.filialId === filialId);
  const exact = pool.find(v => normalizarNomeCliente(v.nome) === s);
  if (exact) return exact;
  const sw = pool.filter(v => s.indexOf(normalizarNomeCliente(v.nome)) === 0);
  if (sw.length === 1) return sw[0];
  return null;
}

export function mesRefAtual(escopoAtual) {
  if (ui.mesPainelSelecionado) {
    const p = ui.mesPainelSelecionado.split('-');
    return { ano: parseInt(p[0], 10), mes: parseInt(p[1], 10) - 1 };
  }
  const h = new Date();
  return { ano: h.getFullYear(), mes: h.getMonth() };
}

export function getMetaVendedor(v, a, m) {
  const mesKey = a + '-' + String(m + 1).padStart(2, '0');
  const exata = state.metas.find(x => x.vendedorId === v.id && x.mes === mesKey);
  if (exata) return { meta: exata.metaFaturamento, metaTicket: exata.metaTicket };
  const anteriores = state.metas.filter(x => x.vendedorId === v.id && x.mes < mesKey).sort((a, b) => b.mes.localeCompare(a.mes));
  if (anteriores.length > 0) return { meta: anteriores[0].metaFaturamento, metaTicket: anteriores[0].metaTicket };
  return { meta: v.meta || 0, metaTicket: v.metaTicket || 0 };
}

// OTIMIZAÇÃO: Recebe um array pré-filtrado para não varrer a lista inteira toda vez
export function calcDiasComLancamento(a, m, vendedorId, lancsBase) {
  const prefix = a + '-' + String(m + 1).padStart(2, '0');
  const dias = {};

  for (let i = 0; i < lancsBase.length; i++) {
    const l = lancsBase[i];
    if (l.data.indexOf(prefix) !== 0) continue;
    if (vendedorId && l.vendedor !== vendedorId) continue;
    dias[l.data] = true;
  }

  let count = 0;
  Object.keys(dias).forEach(iso => {
    const d = new Date(iso + 'T12:00:00');
    if (ehDiaUtil(d.getFullYear(), d.getMonth(), d.getDate())) count++;
  });
  return count;
}

export function calcVendedor(v, a, m, lancsBase) {
  const prefix = a + '-' + String(m + 1).padStart(2, '0');
  const base = lancsBase || state.lancamentos;
  
  let fat = 0, ped = 0, dp = 0, vb = 0;
  for (let i = 0; i < base.length; i++) {
    const l = base[i];
    if (l.data.indexOf(prefix) === 0 && l.vendedor === v.id) {
      fat += (l.valor || 0); ped += (l.pedidos || 0);
      vb += (l.valor || 0); dp += (l.valor || 0) * (l.desconto || 0);
    }
  }

  const dm = vb > 0 ? dp / vb : 0;
  const metaObj = getMetaVendedor(v, a, m);
  const meta = metaObj.meta;
  const mt = metaObj.metaTicket;
  const tk = ped > 0 ? fat / ped : 0;
  const pm = meta > 0 ? (fat / meta) * 100 : null;

  const du = calcDiasUteisNoMes(a, m);
  const dt = calcDiasComLancamento(a, m, v.id, base);
  const diasDecorridos = calcDiasUteisDecorridos(a, m);
  const df = Math.max(0, du - diasDecorridos);

  const re = meta > 0 ? meta * (diasDecorridos / du) : 0;
  const md = (df > 0 && meta > 0) ? (meta - fat) / df : 0;
  const pr = dt > 0 ? (fat / dt) * du : 0;
  const st = v.supervisor ? 'SUPERVISOR' : (meta > 0 ? (fat >= re ? 'ACIMA' : 'ABAIXO') : '—');

  return { vendedor: v, faturado: fat, pedidos: ped, ticket: tk, meta, metaTicket: mt, pctMeta: pm, descontoMedio: dm, diasTrab: dt, diasFaltam: df, diasUteisTotal: du, ritmoEsperado: re, metaDia: md, projecao: pr, status: st };
}

export function calcFilial(a, m, escopoAtual) {
  const prefix = a + '-' + String(m + 1).padStart(2, '0');
  
  // OTIMIZAÇÃO: Filtra os lançamentos UMA VEZ e passa para os vendedores
  const lancsFiltrados = lancamentosNoEscopo(escopoAtual);

  const at = vendedoresNoEscopo(escopoAtual).filter(v => {
    if (v.papel === 'administrativo') return false;
    if (v.papel === 'diretor') {
      return lancsFiltrados.some(l => l.vendedor === v.id && l.data.indexOf(prefix) === 0);
    }
    if (v.ativo) return true;
    return lancsFiltrados.some(l => l.vendedor === v.id && l.data.indexOf(prefix) === 0);
  });

  const atAdmin = vendedoresNoEscopo(escopoAtual).filter(v => v.ativo && v.papel === 'administrativo');

  const dados = at.map(v => calcVendedor(v, a, m, lancsFiltrados));
  const dadosAdmin = atAdmin.map(v => calcVendedor(v, a, m, lancsFiltrados));

  const mt = at
    .filter(v => !v.supervisor && getMetaVendedor(v, a, m).meta > 0)
    .reduce((s, v) => s + (getMetaVendedor(v, a, m).meta || 0), 0);

  const ft = dados.reduce((s, d) => s + d.faturado, 0);
  const ftComMeta = dados.filter(d => !d.vendedor.supervisor && d.meta > 0).reduce((s, d) => s + d.faturado, 0);
  const pt = dados.reduce((s, d) => s + d.pedidos, 0);
  const tk = pt > 0 ? ft / pt : 0;
  const pm = mt > 0 ? (ftComMeta / mt) * 100 : 0;

  const du = calcDiasUteisNoMes(a, m);
  const dt = calcDiasComLancamento(a, m, null, lancsFiltrados);
  const diasDecorridos = calcDiasUteisDecorridos(a, m);
  const df = Math.max(0, du - diasDecorridos);

  const re = mt > 0 ? mt * (diasDecorridos / du) : 0;
  const pr = dt > 0 ? (ft / dt) * du : 0;

  const fl = Math.max(0, mt - ftComMeta);
  const pd = df > 0 ? fl / df : 0;

  return {
    dados, dadosAdmin,
    metaTotal: mt, faturadoTotal: ft, faturadoComMeta: ftComMeta,
    pedidosTotal: pt, ticketMedio: tk, pctMeta: pm,
    diasTrab: dt, diasFaltam: df, diasUteisTotal: du,
    ritmoEsperado: re, projecao: pr, falta: fl, porDia: pd,
    status: ftComMeta >= re ? 'ACIMA' : 'ABAIXO'
  };
}

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
    let sr = dias <= 15 ? 5 : dias <= 30 ? 4 : dias <= 60 ? 3 : dias <= 120 ? 2 : 1;
    let sf = freq >= 10 ? 5 : freq >= 5 ? 4 : freq >= 3 ? 3 : freq >= 2 ? 2 : 1;
    let sm = valor >= p95 ? 5 : valor >= p80 ? 4 : valor >= mediana ? 3 : valor >= mediana * 0.4 ? 2 : 1;
    c.rfm_r = sr; c.rfm_f = sf; c.rfm_m = sm;
    c.rfm_score = sr + sf + sm;
    c.diasSemComprar = dias;
    let seg = 'leal';
    if (sr >= 4 && sf >= 4 && sm >= 4) seg = 'campeao';
    else if (sr <= 2 && sf >= 3 && sm >= 3) seg = 'risco';
    else if (sr <= 2 && sf <= 2) seg = 'hibernando';
    else if (sr >= 4 && sf <= 2 && sm >= 3) seg = 'promissor';
    c.rfm_segmento = seg;
  });
}

export function calcABCClientes(clientes) {
  if (!clientes || clientes.length === 0) return;
  const sorted = clientes.slice().sort((a, b) => (b.valorTotal || 0) - (a.valorTotal || 0));
  const total = sorted.reduce((s, c) => s + (c.valorTotal || 0), 0);
  if (total <= 0) { clientes.forEach(c => { c.abcCliente = 'C'; }); return; }
  let ac = 0;
  sorted.forEach(c => {
    ac += (c.valorTotal || 0);
    const pct = (ac / total) * 100;
    c.abcCliente = pct <= 80 ? 'A' : (pct <= 95 ? 'B' : 'C');
  });
}

export function derivarHistorico() {
  const hist = {};
  (state.cidades || []).forEach(c => {
    if (!c.mesKey) return;
    if (!hist[c.mesKey]) hist[c.mesKey] = { mes: c.mesKey, cidades: [] };
    hist[c.mesKey].cidades.push({ nome: c.nome, uf: c.uf, totalValor: c.totalValor, numClientes: c.numClientes, qtdVendas: c.qtdVendas });
  });
  state._historico = hist;
}