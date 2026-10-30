// ============================================================
// calc_diagnostico.js — MoM com identificação de transferência
// ============================================================

import { state, ui } from './state.js';
import { normalizarNomeCliente } from './utils.js';
import { calcDiasUteisNoMes, calcDiasUteisDecorridos, calcDiasComLancamento, filialNoEscopo } from './calc.js';

const PISO_RUIDO = 500;

export function listarMesesComDados(vendedorId) {
  const set = new Set();
  (state.clientesImportacoes || []).forEach(ci => {
    if (vendedorId && ci.vendedor !== vendedorId) return;
    if (ci.periodoIni) set.add(ci.periodoIni.slice(0, 7));
  });
  if (set.size === 0) {
    (state.lancamentos || []).forEach(l => {
      if (vendedorId && l.vendedor !== vendedorId) return;
      if (l.data) set.add(l.data.slice(0, 7));
    });
  }
  return Array.from(set).sort().reverse();
}

function rangeDoMes(mesStr, diaMax) {
  const [ano, mes] = mesStr.split('-').map(Number);
  const ultimoDia = new Date(ano, mes, 0).getDate();
  const fim = Math.min(diaMax || ultimoDia, ultimoDia);
  return {
    ini: mesStr + '-01',
    fim: mesStr + '-' + String(fim).padStart(2, '0'),
    dias: fim,
    ultimoDia
  };
}

function agregarPorCliente(vendedorId, mesStr, diaMax) {
  const map = {};
  const range = rangeDoMes(mesStr, diaMax);
  const rangeIni = new Date(range.ini + 'T12:00:00');
  const rangeFim = new Date(range.fim + 'T12:00:00');

  const ci = state.clientesImportacoes || [];
  if (ci.length > 0) {
    ci.forEach(r => {
      if (vendedorId && r.vendedor !== vendedorId) return;
      if (!r.periodoIni) return;

      const pIni = r.periodoIni.slice(0, 10);
      const pFim = (r.periodoFim || r.periodoIni).slice(0, 10);
      const pIniDate = new Date(pIni + 'T12:00:00');
      const pFimDate = new Date(pFim + 'T12:00:00');
      const totalDias = Math.round((pFimDate - pIniDate) / 86400000) + 1;

      const overlapIni = pIniDate > rangeIni ? pIniDate : rangeIni;
      const overlapFim = pFimDate < rangeFim ? pFimDate : rangeFim;
      const overlapDias = Math.max(0, Math.round((overlapFim - overlapIni) / 86400000) + 1);

      if (overlapDias <= 0) return;

      const valorProp = totalDias === 1 ? (r.valor || 0) : (r.valor || 0) * (overlapDias / totalDias);
      const k = r.clienteNorm || '';
      if (!k) return;
      map[k] = (map[k] || 0) + valorProp;
    });

    if (Object.keys(map).length > 0) return { map, fonte: 'clientesImportacoes' };
  }

  (state.vendasItens || []).forEach(vi => {
    if (vendedorId && vi.vendedor !== vendedorId) return;
    if (!vi.periodoIni) return;
    const p = vi.periodoIni.slice(0, 10);
    if (p < range.ini || p > range.fim) return;
    const k = vi.clienteNorm || '';
    if (!k) return;
    map[k] = (map[k] || 0) + (vi.valor || 0);
  });

  return { map, fonte: 'vendasItens' };
}

export function calcularDiagnosticoMoM(vendedorId, mesRefStr) {
  if (!vendedorId || !mesRefStr) return null;

  const [ano, mes] = mesRefStr.split('-').map(Number);
  const dAnt = new Date(ano, mes - 2, 1);
  const mesAntStr = dAnt.getFullYear() + '-' + String(dAnt.getMonth() + 1).padStart(2, '0');

  const hoje = new Date();
  const ehMesCorrente = hoje.getFullYear() === ano && (hoje.getMonth() + 1) === mes;

  const ultimoDiaAnt = new Date(dAnt.getFullYear(), dAnt.getMonth() + 1, 0).getDate();
  const ultimoDiaAt = new Date(ano, mes, 0).getDate();

  const diaRef = ehMesCorrente ? Math.min(hoje.getDate(), ultimoDiaAnt, ultimoDiaAt) : Math.min(ultimoDiaAnt, ultimoDiaAt);

  const at = agregarPorCliente(vendedorId, mesRefStr, diaRef);
  const ant = agregarPorCliente(vendedorId, mesAntStr, diaRef);

  // NOVO: Mapa global do mês atual (todos os vendedores) para checar transferência
  const globalAt = agregarPorCliente(null, mesRefStr, diaRef).map;

  const mapaAt = at.map;
  const mapaAnt = ant.map;

  // Sincronização com o Cockpit (lancamentos)
  let fatAt = 0, pedidosAt = 0;
  let fatAnt = 0, pedidosAnt = 0;
  const preAt = mesRefStr + '-';
  const preAnt = mesAntStr + '-';
  const limAt = mesRefStr + '-' + String(diaRef).padStart(2, '0');
  const limAnt = mesAntStr + '-' + String(diaRef).padStart(2, '0');

  (state.lancamentos || []).forEach(l => {
    if (l.vendedor !== vendedorId) return;
    if (!filialNoEscopo(l.filialId, ui.escopoAtual)) return;
    
    if (l.data >= preAt + '01' && l.data <= limAt) { fatAt += (l.valor || 0); pedidosAt += (l.pedidos || 0); }
    if (l.data >= preAnt + '01' && l.data <= limAnt) { fatAnt += (l.valor || 0); pedidosAnt += (l.pedidos || 0); }
  });

  let fatAntCompleto = 0;
  (state.lancamentos || []).forEach(l => {
    if (l.vendedor !== vendedorId) return;
    if (!filialNoEscopo(l.filialId, ui.escopoAtual)) return;
    if (l.data >= preAnt + '01' && l.data <= mesAntStr + '-31') fatAntCompleto += (l.valor || 0);
  });

  const somaCliAt = Object.values(mapaAt).reduce((s, v) => s + v, 0);
  const somaCliAnt = Object.values(mapaAnt).reduce((s, v) => s + v, 0);
  const ajusteAt = fatAt - somaCliAt;
  const ajusteAnt = fatAnt - somaCliAnt;

  if (Math.abs(ajusteAt) > 1) mapaAt['__ajuste_erp__'] = ajusteAt;
  if (Math.abs(ajusteAnt) > 1) mapaAnt['__ajuste_erp__'] = ajusteAnt;

  let fatProjetado = fatAt;
  let duTotal = 0, duDec = 0, duFaltam = 0;
  if (ehMesCorrente) {
    duTotal = calcDiasUteisNoMes(ano, mes - 1);
    const dt = calcDiasComLancamento(ano, mes - 1, vendedorId, state.lancamentos);
    duDec = calcDiasUteisDecorridos(ano, mes - 1);
    duFaltam = Math.max(0, duTotal - duDec);
    if (dt > 0) fatProjetado = (fatAt / dt) * duTotal;
  }

  const metaObj = (state.metas || []).find(m => m.vendedorId === vendedorId && m.mes === mesRefStr);
  const meta = metaObj ? (metaObj.metaFaturamento || 0) : 0;
  const pctMeta = meta > 0 ? (fatProjetado / meta) * 100 : 0;

  const nomeDe = (norm) => {
    if (norm === '__ajuste_erp__') return 'Outros / Sem Cadastro';
    const c = (state.clientes || []).find(x => normalizarNomeCliente(x.nome) === norm);
    if (c) return c.nome;
    const ci = (state.clientesImportacoes || []).find(x => x.clienteNorm === norm);
    return ci ? ci.nome : norm;
  };

  const chaves = new Set([...Object.keys(mapaAt), ...Object.keys(mapaAnt)]);
  const perdidos = [], novos = [], cresceram = [], cairam = [];
  let impPerdidos = 0, impNovos = 0, impRec = 0;

  chaves.forEach(k => {
    if (!k) return;
    const vAt = mapaAt[k] || 0;
    const vAnt = mapaAnt[k] || 0;
    const delta = vAt - vAnt;
    if (Math.abs(delta) < PISO_RUIDO && k !== '__ajuste_erp__') return;

    const reg = { nome: nomeDe(k), valorAtual: vAt, valorAnterior: vAnt, delta };

    // Se o cliente não comprou com este vendedor, checa se comprou com outro
    if (vAnt > 0 && vAt === 0) {
      const comprouGlobal = globalAt[k] || 0;
      if (comprouGlobal > 0) {
        // Descobre qual vendedor pegou o cliente
        const ciOutro = (state.clientesImportacoes || []).find(x => x.clienteNorm === k && x.periodoIni.startsWith(mesRefStr) && x.vendedor !== vendedorId);
        if (ciOutro) {
          const vOutro = state.vendedores.find(x => x.id === ciOutro.vendedor);
          reg.nome = `${reg.nome} (Migrou p/ ${vOutro ? vOutro.nome : 'Outro'})`;
        }
      }
      perdidos.push(reg); impPerdidos += delta;
    }
    else if (vAnt === 0 && vAt > 0) { novos.push(reg); impNovos += delta; }
    else if (delta > 0) { cresceram.push(reg); impRec += delta; }
    else { cairam.push(reg); impRec += delta; }
  });

  perdidos.sort((a, b) => a.delta - b.delta);
  novos.sort((a, b) => b.delta - a.delta);
  cresceram.sort((a, b) => b.delta - a.delta);
  cairam.sort((a, b) => a.delta - b.delta);

  const variacaoRS = fatAt - fatAnt;
  const variacaoPct = fatAnt > 0 ? (variacaoRS / fatAnt) * 100 : 0;
  const semBase = fatAnt === 0 && fatAt === 0;

  let leitura = '';
  if (semBase) {
    leitura = 'Sem base comparativa. Importe o mês anterior para ver a decomposição.';
  } else if (fatAnt === 0) {
    leitura = `Sem histórico em ${fmtMes(mesAntStr)}. Realizado em ${fmtMes(mesRefStr)}: ${fmtBRL(fatAt)}.`;
  } else if (variacaoPct > 5) {
    leitura = `Crescimento de ${variacaoPct.toFixed(1)}% (+${fmtBRL(variacaoRS)}) no mesmo período de dias.`;
  } else if (variacaoPct < -5) {
    leitura = `Queda de ${Math.abs(variacaoPct).toFixed(1)}% (${fmtBRL(variacaoRS)}) no mesmo período de dias.`;
    const causas = [];
    const pReal = perdidos.filter(x => x.nome.indexOf('Migrou') === -1)[0];
    if (pReal) causas.push(`perda de ${pReal.nome} (${fmtBRL(pReal.valorAnterior)})`);
    if (pedidosAnt > pedidosAt) causas.push(`${pedidosAnt - pedidosAt} pedido(s) a menos`);
    if (causas.length) leitura += ' Principais causas: ' + causas.join('; ') + '.';
  } else {
    leitura = `Estável (${variacaoPct >= 0 ? '+' : ''}${variacaoPct.toFixed(1)}%) no mesmo período.`;
  }

  const alertas = [];
  const entradas = Object.entries(mapaAt).sort((a, b) => b[1] - a[1]);
  if (entradas[0] && entradas[0][0] !== '__ajuste_erp__' && fatAt > 0 && (entradas[0][1] / fatAt) > 0.30) {
    alertas.push({ tipo: 'warning', msg: `Dependência: ${nomeDe(entradas[0][0])} representa ${((entradas[0][1] / fatAt) * 100).toFixed(0)}% do faturamento.` });
  }
  if (perdidos.length > 0 && Math.abs(impPerdidos) > 1000) {
    alertas.push({ tipo: 'danger', msg: `${perdidos.length} cliente(s) sem compra no período. Perda: ${fmtBRL(Math.abs(impPerdidos))}.`, link: '#mom-perdas' });
  }
  if (meta > 0 && ehMesCorrente) {
    if (pctMeta < 90) alertas.push({ tipo: 'danger', msg: `Risco de não bater meta: projeção em ${pctMeta.toFixed(0)}%.` });
    else if (pctMeta < 100) alertas.push({ tipo: 'warning', msg: `Projeção em ${pctMeta.toFixed(0)}%. Faltam ${fmtBRL(Math.max(0, meta - fatProjetado))}.` });
  }
  if (alertas.length === 0) alertas.push({ tipo: 'success', msg: 'Nenhum gargalo crítico detectado.' });

  return {
    mesRef: mesRefStr, mesAnt: mesAntStr, diaRef, ehMesCorrente, semBase,
    totalAt: fatAt, totalAnt: fatAnt, fatAntCompleto,
    pedidosAt, pedidosAnt, variacaoRS, variacaoPct, fatProjetado,
    duTotal, duDec, duFaltam, meta, pctMeta,
    impPerdidos, impNovos, impRec,
    perdidos, novos, cresceram, cairam,
    leitura, alertas, fonte: at.fonte
  };
}

function fmtBRL(v) {
  if (v == null || isNaN(v)) return 'R$ 0,00';
  return 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtMes(ym) {
  if (!ym) return '';
  const [a, m] = ym.split('-');
  const nomes = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  return nomes[parseInt(m, 10) - 1] + '/' + a;
}