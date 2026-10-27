// js/calc_diagnostico.js
import { state } from './state.js';

export function calcularDiagnostico(vendedorId, mesRefStr) {
  // mesRefStr no formato 'YYYY-MM'
  if (!vendedorId || !mesRefStr) return null;

  const [ano, mes] = mesRefStr.split('-').map(Number);
  const mesPassadoDate = new Date(ano, mes - 2, 1);
  const mesPassadoStr = mesPassadoDate.getFullYear() + '-' + String(mesPassadoDate.getMonth() + 1).padStart(2, '0');
  const mesAnoPassadoStr = (ano - 1) + '-' + String(mes).padStart(2, '0');

  // Filtra vendas do vendedor
  const vendasVendedor = (state.vendasItens || []).filter(v => v.vendedor === vendedorId);
  
  const getVendasMes = (mStr) => vendasVendedor.filter(v => v.periodoIni.startsWith(mStr));
  
  const vendasAtual = getVendasMes(mesRefStr);
  const vendasPassado = getVendasMes(mesPassadoStr);
  const vendasAnoPassado = getVendasMes(mesAnoPassadoStr);

  // Agregações (Faturamento, Clientes, Pedidos)
  const calcAgg = (vendas) => {
    let fat = 0;
    const clientes = new Set();
    let pedidos = 0;
    vendas.forEach(v => { fat += v.valor; clientes.add(v.clienteNorm); if(v.valor > 0) pedidos++; });
    return { fat, clientes: clientes.size, pedidos, ticket: pedidos > 0 ? fat/pedidos : 0 };
  };

  const aggAtual = calcAgg(vendasAtual);
  const aggPassado = calcAgg(vendasPassado);
  const aggAnoPassado = calcAgg(vendasAnoPassado);

  // === WATERFALL (Causa Raiz MoM) ===
  const mapAtual = {}, mapPassado = {};
  vendasAtual.forEach(v => { mapAtual[v.clienteNorm] = (mapAtual[v.clienteNorm] || 0) + v.valor; });
  vendasPassado.forEach(v => { mapPassado[v.clienteNorm] = (mapPassado[v.clienteNorm] || 0) + v.valor; });

  let impactoNovos = 0;
  let impactoPerdidos = 0;
  let impactoRecorrentes = 0;

  Object.keys(mapAtual).forEach(c => {
    if (!mapPassado[c]) impactoNovos += mapAtual[c];
    else impactoRecorrentes += (mapAtual[c] - mapPassado[c]);
  });
  Object.keys(mapPassado).forEach(c => {
    if (!mapAtual[c]) impactoPerdidos -= mapPassado[c]; // Negativo
  });

  // === HEALTH SCORE ===
  const metaObj = (state.metas || []).find(m => m.vendedorId === vendedorId && m.mes === mesRefStr);
  const meta = metaObj ? metaObj.metaFaturamento : 0;
  let scoreMeta = meta > 0 ? (aggAtual.fat / meta) * 100 : 50;
  if (scoreMeta > 100) scoreMeta = 100;

  const carteiraVendedor = (state.clientes || []).filter(c => c.vendedor === vendedorId);
  const totalCarteira = carteiraVendedor.length || 1;
  let scoreRetencao = (aggAtual.clientes / totalCarteira) * 100;
  if (scoreRetencao > 100) scoreRetencao = 100;

  const healthScore = Math.round((scoreMeta * 0.5) + (scoreRetencao * 0.5));

  // === FORECAST ===
  const hoje = new Date();
  const diasNoMes = new Date(ano, mes, 0).getDate();
  const isMesAtual = (hoje.getFullYear() === ano && (hoje.getMonth() + 1) === mes);
  const diasPassados = isMesAtual ? hoje.getDate() : diasNoMes;
  
  const ritmoDiario = aggAtual.fat / (diasPassados || 1);
  const forecast = aggAtual.fat + (ritmoDiario * (diasNoMes - diasPassados));

  // === ALERTAS ===
  const alertas = [];
  
  if (meta > 0 && forecast < meta * 0.9) {
    alertas.push({ tipo: 'danger', msg: 'Risco alto de não bater a meta. Projeção indica ' + Math.round((forecast/meta)*100) + '% do alvo.' });
  }
  
  if (impactoPerdidos < -1000) {
    alertas.push({ tipo: 'danger', msg: 'Perda significativa de faturamento (-R$ ' + Math.abs(impactoPerdidos).toFixed(0) + ') por clientes que não compraram este mês.' });
  }

  const topCliente = Object.entries(mapAtual).sort((a,b) => b[1]-a[1])[0];
  if (topCliente && (topCliente[1] / aggAtual.fat) > 0.3) {
    alertas.push({ tipo: 'warning', msg: 'Alto risco de dependência. O cliente ' + topCliente[0] + ' representa mais de 30% do faturamento.' });
  }

  if (aggAtual.clientes > aggPassado.clientes && aggAtual.ticket < aggPassado.ticket) {
    alertas.push({ tipo: 'warning', msg: 'Gargalo de Mix: Vendeu para mais clientes, mas o ticket médio caiu. Foco em upsell.' });
  }

  if (alertas.length === 0) {
    alertas.push({ tipo: 'success', msg: 'Nenhum gargalo crítico detectado. Vendedor mantendo a consistência.' });
  }

  // === PRIORIDADES ===
  const prioridades = carteiraVendedor
    .filter(c => c.diasSemComprar > 30 && c.diasSemComprar < 180)
    .sort((a,b) => b.valorMedioMensal - a.valorMedioMensal)
    .slice(0, 10)
    .map(c => {
      let acao = 'Fazer contato de acompanhamento.';
      if (c.diasSemComprar > 90) acao = 'Ligar urgente com oferta de reativação.';
      else if (c.numCompras > 10) acao = 'Cliente fiel esfriando. Visitar pessoalmente.';
      return { ...c, acao };
    });

  return {
    aggAtual, aggPassado, aggAnoPassado,
    waterfall: { impactoNovos, impactoPerdidos, impactoRecorrentes },
    healthScore, forecast, meta,
    alertas, prioridades
  };
}