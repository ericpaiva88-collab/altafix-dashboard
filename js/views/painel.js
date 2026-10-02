// ============================================================
// views/painel.js — Tela do Painel (admin + vendedor)
// ============================================================

import { state, ui, session } from '../state.js';
import {
  fmtBRL, fmtNum, fmtPct, parseValorBR, isoDate, fmtDataBR,
  inicioSemana, diffDias, escapeHtml, toast, copiarTexto
} from '../utils.js';
import {
  ehFeriado, ehDiaUtil, calcDiasUteisNoMes, contarFeriadosNoMes,
  mesRefAtual, vendedoresNoEscopo, lancamentosNoEscopo,
  clientesNoEscopo, calcVendedor, calcFilial, calcFilialMesmaAltura,
  comparativoNoEscopo, escopoNome, parseEscopo, rfmLabel,
  calcRFMScores, calcABCClientes
} from '../calc.js';

// ============================================================
// HELPERS DE IMPRESSÃO (usado por outras views também)
// ============================================================

export function imprimirHTML(titulo, subtitulo, corpoHTML) {
  const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' +
    escapeHtml(titulo) + '</title><style>' +
    'body{font-family:system-ui,sans-serif;color:#0f172a;font-size:11px;padding:16px;line-height:1.4}' +
    'h1{font-size:16px;color:#dc2626;margin-bottom:2px}' +
    '.sub{font-size:10px;color:#64748b;margin-bottom:14px;border-bottom:1px solid #e2e8f0;padding-bottom:8px}' +
    'table{width:100%;border-collapse:collapse;font-size:10px;margin-top:10px}' +
    'th{background:#e2e8f0;text-align:left;padding:5px 6px;font-weight:700;border-bottom:1px solid #94a3b8}' +
    'td{padding:4px 6px;border-bottom:1px solid #e2e8f0}' +
    'tr:nth-child(even) td{background:#f8fafc}.num{text-align:right}' +
    '.rodape{margin-top:16px;font-size:9px;color:#94a3b8;text-align:center;border-top:1px solid #e2e8f0;padding-top:6px}' +
    '@media print{body{padding:8px}tr{page-break-inside:avoid}}' +
    '</style></head><body>';

  const sub = escapeHtml(subtitulo) + ' · ' + new Date().toLocaleString('pt-BR') +
    ' · ' + escapeHtml(escopoNome(ui.escopoAtual));

  const blob = new Blob(
    [html + '<h1>Alta Fix — ' + escapeHtml(titulo) + '</h1><div class="sub">' + sub + '</div>' +
      corpoHTML + '<div class="rodape">Gerado pelo Alta Fix</div></body></html>'],
    { type: 'text/html' }
  );

  const url = URL.createObjectURL(blob);
  const w = window.open(url, '_blank');
  if (!w) {
    URL.revokeObjectURL(url);
    toast('⚠ Bloqueador de pop-up ativo.');
    return;
  }
  w.focus();
  setTimeout(() => {
    try { w.print(); } catch (e) {}
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }, 400);
}

export function imprimirRanking() {
  const ref = mesRefAtual(ui.escopoAtual);
  const f = calcFilial(ref.ano, ref.mes, ui.escopoAtual);
  if (f.dados.length === 0) { toast('Nada para imprimir'); return; }

  const ord = f.dados.slice().sort((x, y) => y.faturado - x.faturado);
  let h = '<table><thead><tr>' +
    '<th>Vendedor</th><th class="num">Faturado</th><th class="num">Meta</th>' +
    '<th class="num">% Meta</th><th class="num">Ticket</th><th class="num">Pedidos</th>' +
    '</tr></thead><tbody>';

  ord.forEach(d => {
    h += '<tr><td>' + escapeHtml(d.vendedor.nome) + '</td>' +
      '<td class="num">' + fmtBRL(d.faturado) + '</td>' +
      '<td class="num">' + (d.meta > 0 ? fmtBRL(d.meta) : '—') + '</td>' +
      '<td class="num">' + (d.pctMeta != null ? fmtPct(d.pctMeta, 1) : '—') + '</td>' +
      '<td class="num">' + fmtBRL(d.ticket) + '</td>' +
      '<td class="num">' + d.pedidos + '</td></tr>';
  });
  h += '</tbody></table>';
  imprimirHTML('Ranking de Vendedores', ref.ano + '/' + String(ref.mes + 1).padStart(2, '0'), h);
}

// ============================================================
// AÇÕES DE HOJE
// ============================================================

export function gerarAcoes(a, m) {
  const acoes = [];
  const hj = isoDate(new Date());

  let clientes = clientesNoEscopo(ui.escopoAtual);
  if (ui.modoVendedor) {
    clientes = clientes.filter(c => c.vendedor === ui.modoVendedor);
  }

  clientes.forEach(c => {
    if (!c.ultimaCompra || !c.numCompras || c.numCompras < 2) return;

    const vrm = c.valorMedioMensal || 0;
    if (vrm < 100) return;

    const dias = diffDias(c.ultimaCompra, hj);
    const intervalo = Math.max(7, c.intervaloMedio || 30);
    const fator = dias / intervalo;

    if (fator < 1.5) return;

    const v = state.vendedores.find(x => x.id === c.vendedor);

    // Categoria baseada em quanto passou do ciclo
    let categoria, statusEmoji, statusLabel, peso;

    if (fator >= 6) {
      categoria = 'perdido';
      statusEmoji = '💀';
      statusLabel = 'Provavelmente perdido';
      peso = 'medio';
    } else if (fator >= 4) {
      categoria = 'sumido';
      statusEmoji = '💤';
      statusLabel = 'Sumido';
      peso = 'alto';
    } else if (fator >= 2) {
      categoria = 'reativar';
      statusEmoji = '🚨';
      statusLabel = 'Reativar';
      peso = 'alto';
    } else {
      categoria = 'recompra';
      statusEmoji = '📞';
      statusLabel = 'Recompra esperada';
      peso = 'medio';
    }

    // Ciclo em texto
    let cicloTxt;
    if (intervalo <= 15) cicloTxt = 'semanal';
    else if (intervalo <= 45) cicloTxt = 'mensal';
    else if (intervalo <= 75) cicloTxt = 'bimestral';
    else if (intervalo <= 105) cicloTxt = 'trimestral';
    else if (intervalo <= 200) cicloTxt = 'semestral';
    else cicloTxt = 'anual';

    // Quando fora do ciclo há muito, o cliente "costumava comprar", não "compra"
    const prefixoCiclo = fator >= 3 ? 'costumava ' + cicloTxt : 'ciclo ' + cicloTxt;

    const descricao = dias + 'd sem comprar · ' + prefixoCiclo +
      ' (a cada ' + intervalo + 'd) · ' + fmtBRL(vrm) + '/mês' +
      (v ? ' · resp. ' + v.nome : '');

    // Score: prioriza valor × urgência (com teto)
    const score = vrm * Math.min(fator - 1, 4);

    acoes.push({
      id: 'cli_' + c.id,
      tipo: 'cliente',
      categoria,
      peso,
      statusEmoji,
      statusLabel,
      titulo: c.nome + (c.cidade ? ' (' + c.cidade + ')' : ''),
      descricao,
      valorRisco: vrm,
      score,
      vendedor: v,
      _dias: dias,
      _intervalo: intervalo,
      _fator: fator,
      _ciclo: cicloTxt
    });
  });

  let vends = vendedoresNoEscopo(ui.escopoAtual).filter(v =>
    v.ativo && v.papel !== 'administrativo' && !v.supervisor && v.meta > 0
  );
  if (ui.modoVendedor) vends = vends.filter(v => v.id === ui.modoVendedor);

  vends.forEach(v => {
    const c = calcVendedor(v, a, m);
    if (c.diasTrab <= 3 || c.meta <= 0 || c.faturado >= c.ritmoEsperado) return;
    const gap = c.meta - c.faturado;
    if (gap <= 0) return;

    acoes.push({
      id: 'vend_' + v.id,
      tipo: 'vendedor',
      categoria: 'ritmo',
      peso: 'alto',
      statusEmoji: '👤',
      statusLabel: 'Abaixo do ritmo',
      titulo: v.nome + ' abaixo do ritmo',
      descricao: 'Faturou ' + fmtBRL(c.faturado) + ' de ' +
        fmtBRL(c.ritmoEsperado) + ' esperado · gap ' + fmtBRL(gap),
      valorRisco: gap,
      score: gap,
      vendedor: v
    });
  });

  acoes.sort((x, y) => (y.score || 0) - (x.score || 0));

  const tratadas = state.acoesTratadas || {};
  const limite = Date.now() - (7 * 24 * 60 * 60 * 1000);

  return acoes.filter(ac => {
    const t = tratadas[ac.id];
    if (!t) return true;
    const ts = typeof t === 'number' ? t : (t.ts || 0);
    return ts < limite;
  }).slice(0, 30);
}

export function gerarAcoesAgrupadas(a, m) {
  const todas = gerarAcoes(a, m);
  const vendedores = todas.filter(ac => ac.tipo === 'vendedor');
  const outras = todas.filter(ac => ac.tipo !== 'vendedor');

  if (vendedores.length > 0) {
    const somaRisco = vendedores.reduce((s, ac) => s + ac.valorRisco, 0);
    outras.unshift({
      id: 'vend_agrupado', tipo: 'vendedor-agrupado', peso: 'alto',
      titulo: vendedores.length + ' vendedor(es) abaixo do ritmo',
      descricao: vendedores.map(ac => ac.titulo.replace(' abaixo do ritmo', '')).join(', '),
      valorRisco: somaRisco,
      vendedoresLista: vendedores
    });
  }

  outras.sort((x, y) => y.valorRisco - x.valorRisco);
  return outras.slice(0, 20);
}

export function marcarAcaoTratada(id) {
  state.acoesTratadas[id] = Date.now();
  renderAcoesPainel();
  renderHistorico();

  if (session.user && session.sb) {
    session.sb.from('acoes_tratadas')
      .upsert({
        user_id: session.user.id,
        acao_id: id,
        filial_id: session.vendedor ? session.vendedor.filial_id : null
      }, { onConflict: 'user_id,acao_id' })
      .then(() => {});
  }
  toast('✓ Marcada como tratada');
}

export function gerarMensagemWhats(v, a, m) {
  const c = calcVendedor(v, a, m);
  const f = Math.max(0, c.meta - c.faturado);
  const pct = c.pctMeta != null ? c.pctMeta.toFixed(0) : '—';

  let msg = 'Bom dia, ' + v.nome + '! Resumo:\n';
  msg += '• Faturado: ' + fmtBRL(c.faturado) + ' (' + pct + '% da meta)\n';
  if (f > 0 && c.diasFaltam > 0) {
    msg += '• Faltam ' + fmtBRL(f) + ' em ' + c.diasFaltam + ' dias (' +
      fmtBRL(c.metaDia) + '/dia)\n';
  }
  msg += '• Ticket: ' + fmtBRL(c.ticket) + ' (meta ' + fmtBRL(c.metaTicket) + ')\n';
  msg += '• Pedidos: ' + c.pedidos + '\n';
  msg += 'Bora pra cima! 💪';
  return msg;
}

export function whatsAcao(idx) {
  const cache = window._acoesCache || [];
  const ac = cache[idx];
  if (!ac) return;

  let msg = '🎯 *' + ac.titulo + '*\n\n' + ac.descricao;
  if (ac.tipo === 'vendedor' && ac.vendedor) {
    const ref = mesRefAtual(ui.escopoAtual);
    msg = gerarMensagemWhats(ac.vendedor, ref.ano, ref.mes);
  } else if (ac.vendedor) {
    msg += '\n\n_Resp.: ' + ac.vendedor.nome + '_';
  }
  copiarTexto(msg);
}

export function renderAcoesPainel() {
  const ref = mesRefAtual(ui.escopoAtual);
  const acoes = gerarAcoesAgrupadas(ref.ano, ref.mes);
  const el = document.getElementById('acoes-container');
  const sub = document.getElementById('acoes-sub');
  if (!el) return;

  const totalRisco = acoes.reduce((s, ac) => s + (ac.valorRisco || 0), 0);
  if (sub) sub.textContent = acoes.length + ' · ' + fmtBRL(totalRisco) + ' em jogo';

  if (acoes.length === 0) {
    el.innerHTML = '<div class="acao-linha vazio">✓ Nada urgente. Bom trabalho.</div>';
    window._acoesCache = [];
    return;
  }

  let h = '';
  acoes.forEach((ac, i) => {
    let icone = '👤';
    if (ac.tipo === 'cliente') icone = '📞';
    else if (ac.tipo === 'vendedor' || ac.tipo === 'vendedor-agrupado') icone = '🎯';

    if (ac.tipo === 'vendedor-agrupado') {
      h += '<div class="acao-grupo-header" data-grupo-id="' + escapeHtml(ac.id) + '">' +
        '<span class="chev">▶</span><span class="ic">' + icone + '</span>' +
        '<div class="txt"><div class="ttl">' + ac.vendedoresLista.length +
        ' vendedor(es) abaixo do ritmo</div>' +
        '<div class="dsc">' +
        escapeHtml(ac.vendedoresLista.map(v => v.titulo.replace(' abaixo do ritmo', '')).join(', ')) +
        '</div></div>' +
        '<span class="val">' + fmtBRL(ac.valorRisco) + '</span>' +
        '<div class="btns"><button class="btn btn-sm btn-primary" data-whats-grupo="' + i + '">📱</button></div>' +
        '</div>';
      h += '<div class="acao-grupo-detalhe" data-grupo-detalhe="' + escapeHtml(ac.id) + '">';
      ac.vendedoresLista.forEach(v => {
        h += '<div class="vend"><strong>' + escapeHtml(v.titulo) + '</strong>' +
          '<div class="d">' + escapeHtml(v.descricao) + '</div></div>';
      });
      h += '</div>';
    } else {
      const podeWhats = !!ac.vendedor;
      h += '<div class="acao-linha ' + ac.peso + '">' +
        '<span class="ic">' + icone + '</span>' +
        '<div class="txt"><div class="ttl">' + escapeHtml(ac.titulo) + '</div>' +
        '<div class="dsc">' + escapeHtml(ac.descricao) + '</div></div>' +
        '<span class="val">' + fmtBRL(ac.valorRisco) + '</span>' +
        '<div class="btns">' +
        (podeWhats ? '<button class="btn btn-sm btn-primary" data-acao-whats="' + i + '">📱</button>' : '') +
        '<button class="btn btn-sm" data-acao-tratar="' + escapeHtml(ac.id) + '">✓</button>' +
        '</div></div>';
    }
  });

  el.innerHTML = h;
  window._acoesCache = acoes;

  el.querySelectorAll('[data-acao-whats]').forEach(b => {
    b.onclick = () => whatsAcao(parseInt(b.dataset.acaoWhats, 10));
  });
  el.querySelectorAll('[data-acao-tratar]').forEach(b => {
    b.onclick = () => marcarAcaoTratada(b.dataset.acaoTratar);
  });
  el.querySelectorAll('[data-whats-grupo]').forEach(b => {
    b.onclick = e => {
      e.stopPropagation();
      const idx = parseInt(b.dataset.whatsGrupo, 10);
      const ac = window._acoesCache[idx];
      if (!ac || !ac.vendedoresLista) return;
      let msg = '🎯 *Time abaixo do ritmo (' + ac.vendedoresLista.length + ')*\n\n';
      ac.vendedoresLista.forEach(v => {
        msg += '• ' + v.titulo + '\n  ' + v.descricao + '\n\n';
      });
      copiarTexto(msg);
    };
  });
  el.querySelectorAll('.acao-grupo-header').forEach(hdr => {
    hdr.onclick = () => {
      const id = hdr.dataset.grupoId;
      hdr.classList.toggle('expandido');
      const det = el.querySelector('[data-grupo-detalhe="' + id + '"]');
      if (det) det.classList.toggle('expandido');
    };
  });
}

// ============================================================
// HISTÓRICO DE AÇÕES TRATADAS
// ============================================================

export function renderHistorico() {
  const el = document.getElementById('historico-container');
  const cnt = document.getElementById('historico-count');
  if (!el) return;

  const tratadas = state.acoesTratadas || {};
  const ids = Object.keys(tratadas);

  if (ids.length === 0) {
    el.innerHTML = '<div class="empty"><p>Nenhuma ação tratada.</p></div>';
    if (cnt) cnt.textContent = '';
    return;
  }

  const arr = ids.map(id => {
    const t = tratadas[id];
    const ts = typeof t === 'number' ? t : (t.ts || 0);
    const p = id.split('_');
    return {
      id, ts,
      tipo: p[0] === 'cli' ? 'cliente' : p[0] === 'vend' ? 'vendedor' : 'outro'
    };
  }).sort((a, b) => b.ts - a.ts);

  if (cnt) cnt.textContent = arr.length + ' registro(s)';

  let h = '<table class="tabela"><thead><tr><th>Quando</th><th>Tipo</th><th></th></tr></thead><tbody>';
  arr.forEach(item => {
    h += '<tr><td>' + new Date(item.ts).toLocaleString('pt-BR') + '</td>' +
      '<td><span class="badge badge-rfm">' + item.tipo + '</span></td>' +
      '<td><button class="btn btn-sm" data-reabrir="' + escapeHtml(item.id) + '">↻</button></td></tr>';
  });
  h += '</tbody></table>';
  el.innerHTML = h;

  el.querySelectorAll('[data-reabrir]').forEach(b => {
    b.onclick = () => {
      delete state.acoesTratadas[b.dataset.reabrir];
      renderHistorico();
      renderAcoesPainel();
      toast('✓ Reaberta');
    };
  });
}

// ============================================================
// GRÁFICOS
// ============================================================

export function destruirGraficos() {
  Object.keys(ui.charts).forEach(k => {
    if (ui.charts[k]) {
      try { ui.charts[k].destroy(); } catch (e) {}
      ui.charts[k] = null;
    }
  });
  ui.charts = {};
}

export function renderGraficos(a, m, f) {
  destruirGraficos();
  if (typeof Chart === 'undefined') return;

  const lancs = lancamentosNoEscopo(ui.escopoAtual);

  // Gráfico 1: faturamento diário últimos 30 dias
  const ctx1 = document.getElementById('chart-diario');
  if (ctx1) {
    const labels = [];
    const valores = [];
    const hoje = new Date();

    for (let i = 29; i >= 0; i--) {
      const d = new Date(hoje);
      d.setDate(d.getDate() - i);
      const iso = isoDate(d);
      labels.push(d.getDate() + '/' + String(d.getMonth() + 1).padStart(2, '0'));

      let total = 0;
      lancs.forEach(l => { if (l.data === iso) total += (l.valor || 0); });
      valores.push(total);
    }

    ui.charts.diario = new Chart(ctx1, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Faturado', data: valores,
          borderColor: '#dc2626', backgroundColor: 'rgba(220,38,38,.08)',
          fill: true, tension: .25, pointRadius: 2
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { callback: v => 'R$ ' + (v / 1000).toFixed(0) + 'k' } } }
      }
    });
  }

  // Gráfico 2: acumulado vs meta
  const ctx2 = document.getElementById('chart-meta');
  if (ctx2) {
    const dias = new Date(a, m + 1, 0).getDate();
    const labels = [];
    const ac = [];
    const metaAc = [];

    let acum = 0;
    const metaPorDia = f.metaTotal / Math.max(1, f.diasUteisTotal);
    let mAc = 0;

    for (let dd = 1; dd <= dias; dd++) {
      const iso = a + '-' + String(m + 1).padStart(2, '0') + '-' + String(dd).padStart(2, '0');
      let diaTotal = 0;
      lancs.forEach(l => { if (l.data === iso) diaTotal += (l.valor || 0); });
      acum += diaTotal;
      if (ehDiaUtil(a, m, dd)) mAc += metaPorDia;
      labels.push(dd);
      ac.push(acum);
      metaAc.push(mAc);
    }

    ui.charts.meta = new Chart(ctx2, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Realizado', data: ac, borderColor: '#dc2626', backgroundColor: 'rgba(220,38,38,.08)', fill: true, tension: .2, pointRadius: 0 },
          { label: 'Meta', data: metaAc, borderColor: '#0f172a', borderDash: [6, 4], fill: false, tension: 0, pointRadius: 0 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } },
        scales: { y: { beginAtZero: true, ticks: { callback: v => 'R$ ' + (v / 1000).toFixed(0) + 'k' } } }
      }
    });
  }
}

// ============================================================
// SIMULADOR (admin)
// ============================================================

export function renderSimulador() {
  const el = document.getElementById('simulador-container');
  const res = document.getElementById('simulador-resultado');
  if (!el) return;

  const ref = mesRefAtual(ui.escopoAtual);
  const a = ref.ano, m = ref.mes;

  let ativos = vendedoresNoEscopo(ui.escopoAtual).filter(v =>
    v.ativo && !v.supervisor && v.papel !== 'administrativo'
  );
  if (ui.modoVendedor) ativos = ativos.filter(v => v.id === ui.modoVendedor);

  if (ativos.length === 0) {
    el.innerHTML = '<div class="empty"><p>Sem vendedores.</p></div>';
    res.innerHTML = '';
    return;
  }

  let h = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;">';

  ativos.forEach(v => {
    const c = calcVendedor(v, a, m);
    const pct = ui.simuladorCenario[v.id] || 0;
    const pctMeta = c.pctMeta != null ? c.pctMeta : 0;
    const cor = pctMeta >= 100 ? '#16a34a' : pctMeta >= 80 ? '#ca8a04' : '#dc2626';

    h += '<div style="border:1px solid #e2e8f0;border-radius:6px;padding:10px;">' +
      '<div style="display:flex;justify-content:space-between;margin-bottom:6px;">' +
      '<strong style="font-size:13px;">' + escapeHtml(v.nome) + '</strong>' +
      '<span style="font-size:12px;color:' + cor + ';">' + fmtPct(pctMeta, 0) + '</span></div>' +
      '<div style="font-size:11px;color:#64748b;margin-bottom:6px;">' +
      fmtBRL(c.faturado) + ' · meta ' + fmtBRL(c.meta) + '</div>' +
      '<div style="display:flex;align-items:center;gap:8px;">' +
      '<input type="range" min="-30" max="50" step="5" value="' + pct +
      '" data-sim-vend="' + escapeHtml(v.id) + '" style="flex:1;">' +
      '<span style="font-size:13px;font-weight:600;width:52px;text-align:right;" id="sim-pct-' +
      escapeHtml(v.id) + '">' + (pct >= 0 ? '+' : '') + pct + '%</span></div></div>';
  });
  h += '</div>';
  el.innerHTML = h;

  el.querySelectorAll('[data-sim-vend]').forEach(inp => {
    inp.oninput = () => {
      const vid = inp.dataset.simVend;
      const val = parseInt(inp.value, 10) || 0;
      ui.simuladorCenario[vid] = val;
      const sp = document.getElementById('sim-pct-' + vid);
      if (sp) sp.textContent = (val >= 0 ? '+' : '') + val + '%';
      atualizarResultadoSimulador();
    };
  });

  atualizarResultadoSimulador();
}

export function atualizarResultadoSimulador() {
  const res = document.getElementById('simulador-resultado');
  if (!res) return;

  const ref = mesRefAtual(ui.escopoAtual);
  const a = ref.ano, m = ref.mes;

  let ativos = vendedoresNoEscopo(ui.escopoAtual).filter(v =>
    v.ativo && !v.supervisor && v.papel !== 'administrativo'
  );
  if (ui.modoVendedor) ativos = ativos.filter(v => v.id === ui.modoVendedor);

  const duS = calcDiasUteisNoMes(a, m);
  const dtFilialS = (function () {
    const prefix = a + '-' + String(m + 1).padStart(2, '0');
    const dias = {};
    lancamentosNoEscopo(ui.escopoAtual).forEach(l => {
      if (l.data.indexOf(prefix) !== 0) return;
      dias[l.data] = true;
    });
    let count = 0;
    Object.keys(dias).forEach(iso => {
      const d = new Date(iso + 'T12:00:00');
      if (ehDiaUtil(d.getFullYear(), d.getMonth(), d.getDate())) count++;
    });
    return count;
  })();
  const dfFilialS = Math.max(0, duS - dtFilialS);

  let projO = 0, projS = 0, metaT = 0, fatAtual = 0;

  ativos.forEach(v => {
    const c = calcVendedor(v, a, m);
    const pct = ui.simuladorCenario[v.id] || 0;
    const ritmo = dtFilialS > 0 ? c.faturado / dtFilialS : 0;
    const proj = c.faturado + ritmo * dfFilialS;
    projO += proj;
    projS += proj * (1 + pct / 100);
    metaT += c.meta;
    fatAtual += c.faturado;
  });

  const projPainel = dtFilialS > 0 ? (fatAtual / dtFilialS) * duS : 0;
  const delta = projS - projO;
  const pA = metaT > 0 ? (projO / metaT) * 100 : 0;
  const pD = metaT > 0 ? (projS / metaT) * 100 : 0;
  const bateA = projO >= metaT;
  const bateD = projS >= metaT;
  const nenhumAjuste = Math.abs(delta) < 0.01;

  let aviso = '';
  if (nenhumAjuste) {
    aviso = '<div style="font-size:12px;color:#64748b;margin-bottom:10px;">' +
      'ℹ️ Arraste os sliders pra ver o impacto dos ajustes. ' +
      'Os valores acima mostram só a <strong>projeção</strong> ' +
      '(faturado + ritmo × dias restantes).</div>';
  }

  res.innerHTML =
    '<div style="font-size:12px;color:#64748b;margin-bottom:10px;">' +
    'Faturado acumulado: <strong>' + fmtBRL(fatAtual) + '</strong> · ' +
    'Meta total: <strong>' + fmtBRL(metaT) + '</strong> · ' +
    'Projeção Painel: <strong>' + fmtBRL(projPainel) + '</strong>' +
    '</div>' + aviso +
    '<div class="kpi-grid" style="margin-bottom:8px;">' +
    '<div class="kpi"><div class="label">Projeção sem ajuste</div>' +
    '<div class="value">' + fmtBRL(projO) + '</div>' +
    '<div class="hint">ritmo atual · ' + fmtPct(pA, 1) + ' ' + (bateA ? '✅' : '❌') + '</div></div>' +
    '<div class="kpi ' + (bateD ? 'positivo' : 'negativo') + '">' +
    '<div class="label">Projeção com ajuste</div>' +
    '<div class="value">' + fmtBRL(projS) + '</div>' +
    '<div class="hint">' + fmtPct(pD, 1) + ' ' + (bateD ? '✅' : '❌') + '</div></div>' +
    '<div class="kpi ' + (delta >= 0 ? 'positivo' : 'negativo') + '">' +
    '<div class="label">Ganho do ajuste</div>' +
    '<div class="value">' + fmtBRL(delta) + '</div></div>' +
    '</div>';
}

export function resetarSimulador() {
  ui.simuladorCenario = {};
  renderSimulador();
  toast('Cenário resetado');
}

export function copiarCenario() {
  const ref = mesRefAtual(ui.escopoAtual);
  const a = ref.ano, m = ref.mes;

  let ativos = vendedoresNoEscopo(ui.escopoAtual).filter(v =>
    v.ativo && !v.supervisor && v.papel !== 'administrativo'
  );
  if (ui.modoVendedor) ativos = ativos.filter(v => v.id === ui.modoVendedor);

  const linhas = ['🎯 *Simulação — ' + ref.ano + '/' + String(ref.mes + 1).padStart(2, '0') + '*', ''];

  ativos.forEach(v => {
    const pct = ui.simuladorCenario[v.id] || 0;
    if (pct === 0) return;
    const c = calcVendedor(v, a, m);
    const ritmo = c.diasTrab > 0 ? c.faturado / c.diasTrab : 0;
    linhas.push('• ' + v.nome + ' ' + (pct >= 0 ? '+' : '') + pct + '% → ' +
      fmtBRL((c.faturado + ritmo * c.diasFaltam) * (1 + pct / 100)));
  });

  if (linhas.length <= 2) { toast('Nenhum ajuste.'); return; }
  copiarTexto(linhas.join('\n'));
}

// ============================================================
// SEMANA CORRENTE
// ============================================================

export function renderSemana() {
  const ini = inicioSemana(ui.semanaRef);
  const fim = new Date(ini);
  fim.setDate(fim.getDate() + 5);

  const el = document.getElementById('sem-titulo');
  if (!el) return;

  el.textContent = String(ini.getDate()).padStart(2, '0') + '/' +
    String(ini.getMonth() + 1).padStart(2, '0') + ' a ' +
    String(fim.getDate()).padStart(2, '0') + '/' +
    String(fim.getMonth() + 1).padStart(2, '0');

  const ds = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];

  let ativos = vendedoresNoEscopo(ui.escopoAtual).filter(v =>
    v.ativo && v.papel !== 'administrativo'
  );
  if (ui.modoVendedor) ativos = ativos.filter(v => v.id === ui.modoVendedor);

  const dados = ativos.map(v => {
    const pd = {};
    for (let i = 0; i < 6; i++) {
      const d = new Date(ini);
      d.setDate(d.getDate() + i);
      const iso = isoDate(d);
      const lancs = state.lancamentos.filter(l => l.vendedor === v.id && l.data === iso);
      let val = 0, ped = 0;
      lancs.forEach(l => { val += (l.valor || 0); ped += (l.pedidos || 0); });
      pd[i] = { valor: val, pedidos: ped };
    }
    let t = 0;
    for (let j = 0; j < 6; j++) t += pd[j].valor;
    return { v, porDia: pd, total: t };
  });

  const td = [0, 0, 0, 0, 0, 0];
  dados.forEach(d => { for (let i = 0; i < 6; i++) td[i] += d.porDia[i].valor; });
  const tg = td.reduce((a, b) => a + b, 0);

  const totalPedidos = dados.reduce((s, d) => {
    let x = 0;
    for (let i = 0; i < 6; i++) x += d.porDia[i].pedidos;
    return s + x;
  }, 0);
  const totalVend = dados.reduce((s, d) => s + d.total, 0);
  const ticketSem = totalPedidos > 0 ? totalVend / totalPedidos : 0;

  const duMes = calcDiasUteisNoMes(ini.getFullYear(), ini.getMonth());
  const metaSem = vendedoresNoEscopo(ui.escopoAtual)
    .filter(v => v.ativo && !v.supervisor && v.papel !== 'administrativo' && v.meta > 0)
    .reduce((s, v) => s + v.meta, 0) * (5 / Math.max(1, duMes));
  const pct = metaSem > 0 ? (totalVend / metaSem) * 100 : 0;

  const kpisEl = document.getElementById('semana-kpis');
  if (kpisEl) {
    kpisEl.innerHTML =
      '<div class="kpi"><div class="label">Faturado semana</div>' +
      '<div class="value">' + fmtBRL(totalVend) + '</div>' +
      '<div class="hint">' + totalPedidos + ' pedidos</div></div>' +
      '<div class="kpi"><div class="label">Ticket</div>' +
      '<div class="value">' + fmtBRL(ticketSem) + '</div></div>' +
      '<div class="kpi ' + (pct >= 100 ? 'positivo' : (pct >= 80 ? '' : 'negativo')) + '">' +
      '<div class="label">% meta semanal</div>' +
      '<div class="value">' + fmtPct(pct, 1) + '</div></div>';
  }

  let h = '<tr><th>Vend.</th>';
  for (let i = 0; i < 6; i++) h += '<th class="num">' + ds[i] + '</th>';
  h += '<th class="num">Total</th></tr>';

  let b = '';
  dados.forEach(row => {
    b += '<tr><td><strong>' + escapeHtml(row.v.nome) + '</strong></td>';
    for (let i = 0; i < 6; i++) {
      const dd = row.porDia[i];
      b += '<td class="num">' + (dd.valor > 0 ? fmtBRL(dd.valor) : '—') + '</td>';
    }
    b += '<td class="num"><strong>' + fmtBRL(row.total) + '</strong></td></tr>';
  });
  b += '<tr style="background:#0f172a;color:#fff;font-weight:700;"><td>TOTAL</td>';
  for (let j = 0; j < 6; j++) {
    b += '<td class="num">' + (td[j] > 0 ? fmtBRL(td[j]) : '—') + '</td>';
  }
  b += '<td class="num">' + fmtBRL(tg) + '</td></tr>';

  const semDesktop = document.getElementById('sem-desktop');
  if (semDesktop) {
    semDesktop.innerHTML = '<div style="overflow-x:auto;"><table class="tabela"><thead>' +
      h + '</thead><tbody>' + b + '</tbody></table></div>';
  }

  const tabs = document.getElementById('sem-tabs');
  if (tabs) {
    tabs.querySelectorAll('button').forEach(btn => {
      if (parseInt(btn.dataset.dia, 10) === ui.diaSemanaMobile) btn.classList.add('active');
      else btn.classList.remove('active');
    });
  }

  const idx = ui.diaSemanaMobile - 1;
  const dd2 = new Date(ini);
  dd2.setDate(dd2.getDate() + idx);

  let hh = '<div style="margin-bottom:8px;font-weight:600;">' + ds[idx] + ' — ' +
    String(dd2.getDate()).padStart(2, '0') + '/' +
    String(dd2.getMonth() + 1).padStart(2, '0') + '</div>';
  let tdM = 0;
  dados.forEach(row => {
    const x = row.porDia[idx];
    tdM += x.valor;
    hh += '<div class="lanc-item"><div><strong>' + escapeHtml(row.v.nome) +
      ' — ' + (x.valor > 0 ? fmtBRL(x.valor) : '—') + '</strong></div></div>';
  });
  hh += '<div style="margin-top:10px;padding:10px;background:#0f172a;color:#fff;border-radius:6px;font-weight:700;">' +
    'TOTAL: ' + fmtBRL(tdM) + '</div>';

  const semMobile = document.getElementById('sem-mobile');
  if (semMobile) semMobile.innerHTML = hh;
}

// ============================================================
// MINIMIZÁVEIS
// ============================================================

export function aplicarMinimizaveis() {
  let estado = {};
  try { estado = JSON.parse(localStorage.getItem('altafix_ui') || '{}'); } catch (e) {}

  document.querySelectorAll('.card.minimizavel').forEach(card => {
    const id = card.id;
    if (!id) return;
    const h2 = card.querySelector('h2');
    if (!h2) return;

    if (estado[id] === true) card.classList.add('minimizado');

    h2.addEventListener('click', e => {
      if (e.target.tagName === 'BUTTON' || e.target.tagName === 'A' ||
          e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT') return;

      card.classList.toggle('minimizado');
      estado[id] = card.classList.contains('minimizado');
      try { localStorage.setItem('altafix_ui', JSON.stringify(estado)); } catch (e) {}

      if (!card.classList.contains('minimizado')) {
        setTimeout(() => {
          Object.keys(ui.charts).forEach(k => {
            if (ui.charts[k]) try { ui.charts[k].resize(); } catch (e) {}
          });
        }, 50);
      }
    });
  });
}

export function toggleTodosMinimizaveis(minimizar) {
  let estado = {};
  try { estado = JSON.parse(localStorage.getItem('altafix_ui') || '{}'); } catch (e) {}

  document.querySelectorAll('.card.minimizavel').forEach(card => {
    if (!card.id) return;
    if (minimizar) card.classList.add('minimizado');
    else card.classList.remove('minimizado');
    estado[card.id] = minimizar;
  });
  try { localStorage.setItem('altafix_ui', JSON.stringify(estado)); } catch (e) {}
}

// ============================================================
// RELATÓRIOS WHATSAPP
// ============================================================

export function gerarRelatorioMatinal() {
  const ref = mesRefAtual(ui.escopoAtual);
  const a = ref.ano, m = ref.mes;
  const f = calcFilial(a, m, ui.escopoAtual);
  const compar = calcFilialMesmaAltura(a, m, ui.escopoAtual);
  const MESES_NOME = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
    'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

  const linhas = [];
  linhas.push('☀️ *Alta Fix* — ' + escopoNome(ui.escopoAtual));
  linhas.push('_' + new Date().toLocaleDateString('pt-BR') + ' · ' +
    MESES_NOME[m] + '/' + a + '_');
  linhas.push('');

  linhas.push('📊 *SITUAÇÃO*');
  linhas.push('Faturado: *' + fmtBRL(f.faturadoTotal) + '* · ' +
    fmtPct(f.pctMeta, 1) + ' da meta');
  if (f.falta > 0) {
    linhas.push('Faltam *' + fmtBRL(f.falta) + '* em *' + f.diasFaltam + ' dias*');
  } else {
    linhas.push('🎉 *META BATIDA!*');
  }

  const ritmoAtual = f.diasTrab > 0 ? f.faturadoTotal / f.diasTrab : 0;
  linhas.push('');
  linhas.push('📈 Ritmo atual: ' + fmtBRL(ritmoAtual) + '/dia');
  if (f.falta > 0 && f.diasFaltam > 0) {
    linhas.push('🎯 Ritmo necessário: ' + fmtBRL(f.porDia) + '/dia');
    if (ritmoAtual > 0 && f.porDia > ritmoAtual) {
      const precisa = ((f.porDia / ritmoAtual) - 1) * 100;
      linhas.push('⚠️ Precisa subir *' + fmtPct(precisa, 0) + '* no ritmo');
    }
  }
  if (f.projecao > 0) {
    linhas.push('🔮 Projeção: ' + fmtBRL(f.projecao) +
      (f.projecao >= f.metaTotal ? ' ✅' : ' (abaixo da meta)'));
  }

  if (compar.faturadoTotal > 0 && f.diasTrab > 0) {
    const dv = ((f.faturadoTotal - compar.faturadoTotal) / compar.faturadoTotal) * 100;
    linhas.push('_vs mês anterior: ' + (dv >= 0 ? '📈 +' : '📉 ') +
      fmtPct(Math.abs(dv), 1) + '_');
  }

  const acoes = gerarAcoes(a, m);
  const reativar = acoes.filter(x => x.categoria === 'reativar');
  const sumidos = acoes.filter(x => x.categoria === 'sumido');
  const perdidos = acoes.filter(x => x.categoria === 'perdido');
  const recompra = acoes.filter(x => x.categoria === 'recompra');
  const ritmo = acoes.filter(x => x.categoria === 'ritmo');

  if (acoes.length > 0) {
    linhas.push('');
    linhas.push('🎯 *PRIORIDADES DE HOJE*');

    if (reativar.length > 0) {
      linhas.push('');
      linhas.push('*🚨 Reativar* (' + reativar.length + ')');
      reativar.slice(0, 5).forEach(x => {
        linhas.push('• *' + x.titulo + '*');
        linhas.push('  ' + x.descricao);
      });
    }

    if (sumidos.length > 0) {
      linhas.push('');
      linhas.push('*💤 Sumidos há muito* (' + sumidos.length + ') — vale tentar?');
      sumidos.slice(0, 3).forEach(x => {
        linhas.push('• *' + x.titulo + '*');
        linhas.push('  ' + x.descricao);
      });
    }

    if (recompra.length > 0) {
      linhas.push('');
      linhas.push('*📞 Recompra esperada* (' + recompra.length + ')');
      recompra.slice(0, 5).forEach(x => {
        linhas.push('• *' + x.titulo + '*');
        linhas.push('  ' + x.descricao);
      });
    }

    if (ritmo.length > 0) {
      linhas.push('');
      linhas.push('*👤 Time abaixo do ritmo*');
      ritmo.slice(0, 5).forEach(x => {
        linhas.push('• ' + x.titulo);
        linhas.push('  ' + x.descricao);
      });
    }

    if (perdidos.length > 0) {
      linhas.push('');
      linhas.push('💀 *' + perdidos.length +
        ' cliente(s) provavelmente perdido(s)* (fora do ciclo há muito tempo)');
    }
  }

  linhas.push('');
  linhas.push('_Gerado pelo Alta Fix_');

  return linhas.join('\n');
}

export function gerarRelatorioFechamento() {
  const ref = mesRefAtual(ui.escopoAtual);
  const a = ref.ano, m = ref.mes;
  const f = calcFilial(a, m, ui.escopoAtual);

  const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

  const linhas = [
    '📊 *Alta Fix — Fechamento ' + meses[m] + '/' + a + '*',
    '_' + escopoNome(ui.escopoAtual) + '_',
    ''
  ];
  linhas.push('*RESULTADO*');
  linhas.push('• Faturado: ' + fmtBRL(f.faturadoTotal));
  linhas.push('• Meta: ' + fmtBRL(f.metaTotal) + ' (' + fmtPct(f.pctMeta, 1) + ')');
  linhas.push('• Pedidos: ' + f.pedidosTotal);
  linhas.push('• Ticket: ' + fmtBRL(f.ticketMedio));
  if (f.faturadoAdmin > 0) {
    linhas.push('• Admin (fora da meta): ' + fmtBRL(f.faturadoAdmin));
  }
  linhas.push('');
  linhas.push('*POR VENDEDOR*');

  f.dados
    .filter(d => !d.vendedor.supervisor)
    .sort((x, y) => y.faturado - x.faturado)
    .forEach(d => {
      const e = d.pctMeta == null ? '·' : d.pctMeta >= 100 ? '✅' : d.pctMeta >= 80 ? '⚠️' : '❌';
      linhas.push(e + ' ' + d.vendedor.nome + ' — ' + fmtBRL(d.faturado));
    });

  return linhas.join('\n');
}

// ============================================================
// RENDER PAINEL — VENDEDOR
// ============================================================

export function renderPainelVendedor(v, a, m) {
  const c = calcVendedor(v, a, m);
  const fi = state.filiais.find(x => x.id === v.filialId);

  const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

  document.getElementById('painel-titulo').textContent =
    v.nome + (fi ? ' · ' + fi.nome : '') + ' · ' + meses[m] + '/' + a;

  document.getElementById('painel-dias-info').innerHTML =
    'Dias úteis: <strong>' + c.diasUteisTotal + '</strong> · ' +
    'Com dados: <strong>' + c.diasTrab + '</strong> · ' +
    'Restantes: <strong>' + c.diasFaltam + '</strong>';

  const stEl = document.getElementById('painel-status');
if (c.diasTrab === 0) {
    stEl.innerHTML = '<span class="badge" style="background:#e2e8f0;color:#475569;">— SEM DADOS AINDA</span>';
} else if (c.pctMeta == null) {
    stEl.innerHTML = '';
} else if (c.faturado >= c.ritmoEsperado) {
    stEl.innerHTML = '<span class="badge badge-ok">✓ ACIMA</span>';
} else {
    stEl.innerHTML = '<span class="badge badge-risco">⚠ ABAIXO</span>';
}

  // Número grande: FATURADO (com % da meta inline)
  const pct = c.pctMeta != null ? c.pctMeta : 0;
  const cls = pct >= 100 ? 'ok' : pct >= 80 ? 'alerta' : '';
  const pctEl = document.getElementById('painel-pct');

  const pctInline = c.pctMeta != null
    ? '<span class="pct-inline ' + cls + '">' + fmtPct(c.pctMeta, 1) + ' da meta</span>'
    : '';

  pctEl.innerHTML = fmtBRL(c.faturado) + pctInline;
  pctEl.className = 'numero-grande';

  const barraEl = document.getElementById('painel-barra').firstElementChild;
  barraEl.style.width = Math.min(100, pct) + '%';
  barraEl.className = cls;

  // Resumo
  const falta = Math.max(0, c.meta - c.faturado);
  const resumo = document.getElementById('painel-resumo');
  resumo.innerHTML =
    '<div class="item"><div class="lbl">Meta</div>' +
    '<div class="val">' + fmtBRL(c.meta) + '</div></div>' +
    '<div class="item"><div class="lbl">Falta</div>' +
    '<div class="val" style="color:' + (falta > 0 ? '#dc2626' : '#16a34a') + ';">' +
    fmtBRL(falta) + '</div>' +
    (c.diasFaltam > 0 ? '<div class="hint">' + fmtBRL(c.metaDia) + '/dia em ' +
      c.diasFaltam + 'd</div>' : '') + '</div>' +
    '<div class="item"><div class="lbl">Pedidos</div>' +
    '<div class="val">' + c.pedidos + '</div></div>' +
    '<div class="item"><div class="lbl">Ticket</div>' +
    '<div class="val">' + fmtBRL(c.ticket) + '</div>' +
    '<div class="hint">meta ' + fmtBRL(c.metaTicket) + '</div></div>';

  // Frase
  const fr = document.getElementById('painel-frase');
  fr.style.display = 'block';
  if (c.meta > 0 && c.faturado < c.meta && c.diasFaltam > 0) {
    fr.innerHTML = 'Faltam <strong>' + fmtBRL(c.meta - c.faturado) +
      '</strong> em <strong>' + c.diasFaltam + ' dias</strong>. Exige <strong>' +
      fmtBRL(c.metaDia) + '/dia</strong>.';
  } else if (c.meta > 0 && c.faturado >= c.meta) {
    fr.innerHTML = '🎉 <strong>Meta batida!</strong>';
  } else {
    fr.style.display = 'none';
  }

  // Botões personalizados pro vendedor
  const botoes = document.querySelector('.painel-hero-botoes');
  botoes.innerHTML =
    '<button class="btn btn-primary btn-sm" id="btn-relatorio-matinal">📱 Meu relatório</button>' +
    '<button class="btn btn-sm" id="btn-min-todos">▾ Minimizar tudo</button>' +
    '<button class="btn btn-sm" id="btn-max-todos">▸ Expandir tudo</button>';
  const brm = document.getElementById('btn-relatorio-matinal');
  if (brm) brm.onclick = () => copiarTexto(gerarRelatorioMatinal());
  const bmin = document.getElementById('btn-min-todos');
  if (bmin) bmin.onclick = () => toggleTodosMinimizaveis(true);
  const bmax = document.getElementById('btn-max-todos');
  if (bmax) bmax.onclick = () => toggleTodosMinimizaveis(false);

  // Ações full width — esconde ranking admin
  const cardRank = document.getElementById('card-painel-rank');
  if (cardRank) cardRank.style.display = 'none';
  const duasCol = document.querySelector('.painel-duas-colunas');
  if (duasCol) duasCol.style.gridTemplateColumns = '1fr';

  renderAcoesPainel();
  renderVendedorExtras(v, a, m);

  // Esconde cards admin
  const gc = document.getElementById('card-painel-graficos');
  if (gc) gc.style.display = 'none';
  const sc = document.getElementById('card-painel-semana');
  if (sc) sc.style.display = 'none';
  const sca = document.getElementById('card-painel-simulador');
  if (sca) sca.style.display = 'none';

  renderHistorico();
}

// ============================================================
// EXTRAS DO VENDEDOR (conquistas, evolução, top, em risco, rank)
// ============================================================

export function renderVendedorExtras(v, a, m) {
  const prefix = a + '-' + String(m + 1).padStart(2, '0');
  const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

  // 1) Novidades
  const cardNov = document.getElementById('card-vend-novidade');
  if (cardNov) {
    const clientesNovos = state.clientes.filter(c =>
      c.vendedor === v.id && c.primeiraCompra && c.primeiraCompra.indexOf(prefix) === 0
    );

    const produtosDistintos = {};
    state.vendasItens.forEach(vi => {
      if (vi.mes !== prefix) return;
      if (vi.filialId !== v.filialId) return;
      const cli = state.clientes.find(c =>
        c.nome && c.vendedor === v.id
      );
      if (cli) produtosDistintos[vi.produtoCodigo] = true;
    });
    const numProdutos = Object.keys(produtosDistintos).length;

    if (clientesNovos.length > 0 || numProdutos > 0) {
      cardNov.style.display = 'block';
      const el = document.getElementById('vend-novidade-container');
      const items = [];
      if (clientesNovos.length > 0) {
        items.push('<span style="font-size:15px;">🎉</span> <strong>' +
          clientesNovos.length + '</strong> cliente(s) novo(s) conquistado(s)');
      }
      if (numProdutos > 0) {
        items.push('<span style="font-size:15px;">📦</span> <strong>' +
          numProdutos + '</strong> produto(s) diferente(s) vendido(s)');
      }
      el.innerHTML = '<div class="novidade"><span class="emoji">🏆</span><div>' +
        items.join(' · ') + '</div></div>';
    } else {
      cardNov.style.display = 'none';
    }
  }

  // 2) Evolução do mês
  const cardEvo = document.getElementById('card-vend-evolucao');
  if (cardEvo) {
    cardEvo.style.display = 'block';
    const subEvo = document.getElementById('vend-evolucao-sub');
    const dias = new Date(a, m + 1, 0).getDate();
    const labelsE = [], acE = [], metaE = [];
    let acum = 0, mAc = 0;
    const metaPorDia = v.meta > 0 ? v.meta / Math.max(1, calcDiasUteisNoMes(a, m)) : 0;

    for (let dd = 1; dd <= dias; dd++) {
      const isoS = a + '-' + String(m + 1).padStart(2, '0') + '-' + String(dd).padStart(2, '0');
      let diaTotal = 0;
      state.lancamentos.forEach(l => {
        if (l.vendedor === v.id && l.data === isoS) diaTotal += (l.valor || 0);
      });
      acum += diaTotal;
      if (ehDiaUtil(a, m, dd)) mAc += metaPorDia;
      labelsE.push(dd);
      acE.push(acum);
      metaE.push(mAc);
    }

    if (subEvo) subEvo.textContent = 'acumulado · dia ' + dias + ' de ' + dias;

    if (ui.charts.vendEvo) { try { ui.charts.vendEvo.destroy(); } catch (e) {} }
    if (typeof Chart !== 'undefined') {
      const canvas = document.getElementById('chart-vend-evolucao');
      if (canvas) {
        ui.charts.vendEvo = new Chart(canvas, {
          type: 'line',
          data: {
            labels: labelsE,
            datasets: [
              { label: 'Realizado', data: acE, borderColor: '#dc2626', backgroundColor: 'rgba(220,38,38,.1)', fill: true, tension: .2, pointRadius: 0 },
              { label: 'Meta', data: metaE, borderColor: '#0f172a', borderDash: [6, 4], fill: false, tension: 0, pointRadius: 0 }
            ]
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, fontSize: 11 } } },
            scales: { y: { beginAtZero: true, ticks: { callback: x => 'R$ ' + (x / 1000).toFixed(0) + 'k' } } }
          }
        });
      }
    }
  }

  // 3) Últimos 6 meses
  const cardHist = document.getElementById('card-vend-historico');
  if (cardHist) {
    cardHist.style.display = 'block';
    const labelsH = [], valoresH = [];

    for (let i = 5; i >= 0; i--) {
      const dRef = new Date(a, m - i, 1);
      const p = dRef.getFullYear() + '-' + String(dRef.getMonth() + 1).padStart(2, '0');
      let soma = 0;
      state.lancamentos.forEach(l => {
        if (l.vendedor === v.id && l.data.indexOf(p) === 0) soma += (l.valor || 0);
      });
      labelsH.push(meses[dRef.getMonth()].slice(0, 3) + '/' + String(dRef.getFullYear()).slice(2));
      valoresH.push(soma);
    }

    const media = valoresH.reduce((s, x) => s + x, 0) / valoresH.length;
    const subH = document.getElementById('vend-historico-sub');
    if (subH) subH.textContent = 'média ' + fmtBRL(media) + '/mês';

    if (ui.charts.vendHist) { try { ui.charts.vendHist.destroy(); } catch (e) {} }
    if (typeof Chart !== 'undefined') {
      const canvas = document.getElementById('chart-vend-historico');
      if (canvas) {
        ui.charts.vendHist = new Chart(canvas, {
          type: 'bar',
          data: {
            labels: labelsH,
            datasets: [{
              label: 'Faturamento', data: valoresH,
              backgroundColor: valoresH.map(x => x >= media ? '#16a34a' : '#dc2626'),
              borderRadius: 4
            }]
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => fmtBRL(c.parsed.y) } } },
            scales: { y: { beginAtZero: true, ticks: { callback: x => 'R$ ' + (x / 1000).toFixed(0) + 'k' } } }
          }
        });
      }
    }
  }

  // 4) Top produtos
  const cardTopP = document.getElementById('card-vend-top-produtos');
  if (cardTopP) {
    const produtosVend = {};
    const mapaCliente = {};
    state.clientes.filter(c => c.vendedor === v.id).forEach(c => {
      if (c.nome) mapaCliente[c.nome.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')] = true;
    });

    state.vendasItens.forEach(vi => {
      if (vi.mes !== prefix) return;
      if (vi.filialId !== v.filialId) return;
      const key = vi.clienteNorm.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (!mapaCliente[key]) return;
      if (!produtosVend[vi.produtoCodigo]) {
        produtosVend[vi.produtoCodigo] = { codigo: vi.produtoCodigo, descricao: vi.produtoDescricao, valor: 0, qtd: 0 };
      }
      produtosVend[vi.produtoCodigo].valor += vi.valor;
      produtosVend[vi.produtoCodigo].qtd += vi.qtd;
    });

    const top10 = Object.keys(produtosVend).map(k => produtosVend[k])
      .sort((a, b) => b.valor - a.valor).slice(0, 10);

    if (top10.length > 0) {
      cardTopP.style.display = 'block';
      const subTP = document.getElementById('vend-top-prod-sub');
      if (subTP) subTP.textContent = top10.length + ' produtos';

      let hTP = '<table class="tabela"><thead><tr><th>Produto</th>' +
        '<th class="num">Qtd</th><th class="num">Valor</th></tr></thead><tbody>';
      top10.forEach(p => {
        hTP += '<tr><td><strong>' + escapeHtml((p.descricao || '').substring(0, 45)) +
          '</strong> <span style="font-size:10px;color:#94a3b8;">' + escapeHtml(p.codigo) + '</span></td>' +
          '<td class="num">' + fmtNum(p.qtd, 0) + '</td>' +
          '<td class="num">' + fmtBRL(p.valor) + '</td></tr>';
      });
      hTP += '</tbody></table>';
      document.getElementById('vend-top-prod-container').innerHTML = hTP;
    } else {
      cardTopP.style.display = 'none';
    }
  }

  // 5) Melhores clientes
  const cardCli = document.getElementById('card-vend-clientes');
  if (cardCli) {
    const clientesDoVend = state.clientes.filter(c => c.vendedor === v.id);
    const top5 = clientesDoVend.slice().sort((a, b) => (b.valorTotal || 0) - (a.valorTotal || 0)).slice(0, 5);

    if (top5.length > 0) {
      cardCli.style.display = 'block';
      const subCli = document.getElementById('vend-clientes-sub');
      if (subCli) subCli.textContent = clientesDoVend.length + ' clientes';

      let html = '<table class="tabela"><thead><tr><th>Cliente</th><th>Cidade</th>' +
        '<th class="num">Valor</th><th class="num">Compras</th><th class="num">Última</th>' +
        '</tr></thead><tbody>';
      top5.forEach(c => {
        const ult = c.ultimaCompra ? fmtDataBR(c.ultimaCompra) : '—';
        html += '<tr><td><strong>' + escapeHtml(c.nome) + '</strong></td>' +
          '<td>' + escapeHtml(c.cidade || '—') + '</td>' +
          '<td class="num">' + fmtBRL(c.valorTotal) + '</td>' +
          '<td class="num">' + (c.numCompras || 0) + '</td>' +
          '<td class="num">' + ult + '</td></tr>';
      });
      html += '</tbody></table>';
      document.getElementById('vend-clientes-container').innerHTML = html;
    } else {
      cardCli.style.display = 'none';
    }
  }

  // 6) Clientes em risco
  const cardRisco = document.getElementById('card-vend-em-risco');
  if (cardRisco) {
    const hj = isoDate(new Date());
    const emRisco = state.clientes.filter(c => {
      if (c.vendedor !== v.id) return false;
      if (!c.ultimaCompra) return false;
      const d = diffDias(c.ultimaCompra, hj);
      return d >= 60;
    }).sort((a, b) => (b.valorMedioMensal || 0) - (a.valorMedioMensal || 0)).slice(0, 10);

    if (emRisco.length > 0) {
      cardRisco.style.display = 'block';
      const subR = document.getElementById('vend-em-risco-sub');
      if (subR) subR.textContent = emRisco.length + ' clientes · ordenado por valor';

      let hR = '<table class="tabela"><thead><tr><th>Cliente</th><th>Cidade</th>' +
        '<th class="num">Dias</th><th class="num">Valor/mês</th><th></th></tr></thead><tbody>';
      emRisco.forEach(c => {
        const dias = diffDias(c.ultimaCompra, hj);
        hR += '<tr><td><strong>' + escapeHtml(c.nome) + '</strong></td>' +
          '<td>' + escapeHtml(c.cidade || '—') + '</td>' +
          '<td class="num" style="color:' + (dias >= 90 ? '#dc2626' : '#ca8a04') + ';">' +
          dias + 'd</td>' +
          '<td class="num">' + fmtBRL(c.valorMedioMensal || 0) + '</td>' +
          '<td><button class="btn btn-sm" data-whats-cliente="' + escapeHtml(c.nome) + '">📱</button></td></tr>';
      });
      hR += '</tbody></table>';
      const containerR = document.getElementById('vend-em-risco-container');
      containerR.innerHTML = hR;

      containerR.querySelectorAll('[data-whats-cliente]').forEach(btn => {
        btn.onclick = () => {
          const nome = btn.dataset.whatsCliente;
          copiarTexto('Oi ' + nome.split(' ')[0] +
            '! Vi que faz um tempo que você não compra na Alta Fix. Posso te ajudar com algo?');
        };
      });
    } else {
      cardRisco.style.display = 'none';
    }
  }

  // 7) Ranking pessoal
  const cardRank = document.getElementById('card-vend-rank');
  if (cardRank) {
    const colegas = state.vendedores.filter(x =>
      x.ativo && !x.supervisor && x.papel !== 'administrativo' &&
      x.filialId === v.filialId
    );
    const comFat = colegas.map(x => ({ vendedor: x, calc: calcVendedor(x, a, m) }));
    comFat.sort((p, q) => q.calc.faturado - p.calc.faturado);

    const pos = comFat.findIndex(x => x.vendedor.id === v.id) + 1;
    const total = comFat.length;
    const pctRank = total > 0 ? Math.round((1 - (pos - 1) / total) * 100) : 0;

    const subRank = document.getElementById('vend-rank-sub');
    if (subRank) subRank.textContent = pos + 'º de ' + total + ' · top ' + pctRank + '%';
    cardRank.style.display = 'block';

    let htmlR = '<div style="display:flex;align-items:center;gap:16px;margin-bottom:14px;">';
    htmlR += '<div style="text-align:center;min-width:90px;">' +
      '<div style="font-size:36px;font-weight:700;color:' +
      (pos === 1 ? '#16a34a' : pos <= total / 2 ? '#0f172a' : '#dc2626') + ';">' +
      pos + 'º</div>' +
      '<div style="font-size:11px;color:#64748b;text-transform:uppercase;">de ' +
      total + '</div></div>';
    htmlR += '<div style="flex:1;">' +
      '<div style="font-size:13px;color:#64748b;margin-bottom:6px;">Top ' +
      pctRank + '% da filial</div>';
    htmlR += '<div class="barra" style="height:12px;">' +
      '<div style="width:' + pctRank + '%;background:' +
      (pctRank >= 60 ? '#16a34a' : pctRank >= 30 ? '#ca8a04' : '#dc2626') +
      ';height:100%;"></div></div>';
    htmlR += '</div></div>';

    htmlR += '<table class="tabela"><thead><tr><th>#</th><th>Vendedor</th>' +
      '<th class="num">Faturado</th><th class="num">% Meta</th></tr></thead><tbody>';
    comFat.forEach((x, i) => {
      const sel = x.vendedor.id === v.id ? 'style="background:#fef3c7;font-weight:600;"' : '';
      htmlR += '<tr ' + sel + '><td>' + (i + 1) + 'º</td>' +
        '<td>' + escapeHtml(x.vendedor.nome) +
        (x.vendedor.id === v.id ? ' ⭐' : '') + '</td>' +
        '<td class="num">' + fmtBRL(x.calc.faturado) + '</td>' +
        '<td class="num">' + (x.calc.pctMeta != null ? fmtPct(x.calc.pctMeta, 0) : '—') + '</td></tr>';
    });
    htmlR += '</tbody></table>';
    document.getElementById('vend-rank-container').innerHTML = htmlR;
  }
}

// ============================================================
// RENDER PAINEL — ADMIN (função principal)
// ============================================================
function popularSelectMesPainel() {
  const sel = document.getElementById('painel-mes-select');
  if (!sel) return;

  const MESES_NOMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
    'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

  const setMeses = new Set();

  const hj = new Date();
  setMeses.add(hj.getFullYear() + '-' + String(hj.getMonth() + 1).padStart(2, '0'));

  lancamentosNoEscopo(ui.escopoAtual).forEach(l => {
    if (l.data) setMeses.add(l.data.slice(0, 7));
  });

  const lista = Array.from(setMeses).sort().reverse();

  sel.innerHTML = lista.map(m => {
    const p = m.split('-');
    return '<option value="' + m + '">' +
      MESES_NOMES[parseInt(p[1], 10) - 1] + '/' + p[0] + '</option>';
  }).join('');

  if (!ui.mesPainelSelecionado || lista.indexOf(ui.mesPainelSelecionado) < 0) {
    ui.mesPainelSelecionado = lista[0];
  }
  sel.value = ui.mesPainelSelecionado;
}

export function renderPainel() {
  popularSelectMesPainel();
  const ref = mesRefAtual(ui.escopoAtual);
  const a = ref.ano, m = ref.mes;
  const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

  const vModo = ui.modoVendedor
    ? state.vendedores.find(v => v.id === ui.modoVendedor)
    : null;

  if (vModo) {
    renderPainelVendedor(vModo, a, m);
    return;
  }

  // Reset layout admin
  const cardRank = document.getElementById('card-painel-rank');
  if (cardRank) cardRank.style.display = '';
  const duasCol = document.querySelector('.painel-duas-colunas');
  if (duasCol) duasCol.style.gridTemplateColumns = '';
  const gc = document.getElementById('card-painel-graficos');
  if (gc) gc.style.display = '';
  const sc = document.getElementById('card-painel-semana');
  if (sc) sc.style.display = '';
  const sca = document.getElementById('card-painel-simulador');
  if (sca) sca.style.display = '';

  // Restaura botões admin
  const botoes = document.querySelector('.painel-hero-botoes');
  botoes.innerHTML =
    '<button class="btn btn-primary btn-sm" id="btn-relatorio-matinal">📱 Relatório matinal</button>' +
    '<button class="btn btn-sm" id="btn-relatorio-fechamento">📊 Relatório fechamento</button>' +
    '<button class="btn btn-sm" id="btn-min-todos">▾ Minimizar tudo</button>' +
    '<button class="btn btn-sm" id="btn-max-todos">▸ Expandir tudo</button>';
  const brm = document.getElementById('btn-relatorio-matinal');
  if (brm) brm.onclick = () => copiarTexto(gerarRelatorioMatinal());
  const brf = document.getElementById('btn-relatorio-fechamento');
  if (brf) brf.onclick = () => copiarTexto(gerarRelatorioFechamento());
  const bmin = document.getElementById('btn-min-todos');
  if (bmin) bmin.onclick = () => toggleTodosMinimizaveis(true);
  const bmax = document.getElementById('btn-max-todos');
  if (bmax) bmax.onclick = () => toggleTodosMinimizaveis(false);

  const f = calcFilial(a, m, ui.escopoAtual);
  const compar = calcFilialMesmaAltura(a, m, ui.escopoAtual);

  document.getElementById('painel-titulo').textContent =
    'Alta Fix — ' + escopoNome(ui.escopoAtual) + ' · ' + meses[m] + '/' + a;

  const fc = contarFeriadosNoMes(a, m);
  document.getElementById('painel-dias-info').innerHTML =
    'Dias úteis: <strong>' + f.diasUteisTotal + '</strong>' +
    (fc > 0 ? ' · <strong>' + fc + '</strong> feriado(s)' : '') +
    ' · Com dados: <strong>' + f.diasTrab + '</strong>' +
    ' · Restantes: <strong>' + f.diasFaltam + '</strong>';

  const st = document.getElementById('painel-status');

  if (lancamentosNoEscopo(ui.escopoAtual).length === 0) {
    st.innerHTML = '';
    document.getElementById('painel-pct').textContent = '—';
    document.getElementById('painel-pct').className = 'numero-grande';
    document.getElementById('painel-barra').firstElementChild.style.width = '0%';
    document.getElementById('painel-resumo').innerHTML = '';
    document.getElementById('painel-frase').style.display = 'none';
    document.getElementById('acoes-container').innerHTML =
      '<div class="acao-linha vazio">Sem dados. Importe o 324.</div>';
    document.getElementById('rank-container').innerHTML =
      '<div class="empty"><h3>—</h3></div>';
    destruirGraficos();
    renderHistorico();
    return;
  }

  if (f.diasTrab === 0) {
    st.innerHTML = '<span class="badge" style="background:#e2e8f0;color:#475569;">— SEM DADOS AINDA</span>';
} else if (f.status === 'ACIMA') {
    st.innerHTML = '<span class="badge badge-ok">✓ ACIMA DO RITMO</span>';
} else {
    st.innerHTML = '<span class="badge badge-risco">⚠ ABAIXO DO RITMO</span>';
}

  // Hero: FATURADO grande + % da meta inline
  const pct = f.pctMeta || 0;
  const cls = pct >= 100 ? 'ok' : pct >= 80 ? 'alerta' : '';
  const pctEl = document.getElementById('painel-pct');
  pctEl.innerHTML = fmtBRL(f.faturadoTotal) +
    '<span class="pct-inline ' + cls + '">' + fmtPct(f.pctMeta, 1) + ' da meta</span>';
  pctEl.className = 'numero-grande';
  const barraEl = document.getElementById('painel-barra').firstElementChild;
  barraEl.style.width = Math.min(100, pct) + '%';
  barraEl.className = cls;

  // Hero: resumo
  function dH(atual, passado) {
    if (passado <= 0) return '';
    const d = ((atual - passado) / passado) * 100;
    const arrow = d >= 2 ? '▲' : d <= -2 ? '▼' : '▬';
    const cor = d >= 2 ? '#16a34a' : d <= -2 ? '#dc2626' : '#94a3b8';
    return ' <span style="color:' + cor + ';font-size:11px;font-weight:600;">' +
      arrow + ' ' + fmtPct(Math.abs(d), 1) + '</span>';
  }

  let resumoHTML =
    '<div class="item"><div class="lbl">Meta</div>' +
    '<div class="val">' + fmtBRL(f.metaTotal) + '</div></div>' +
    '<div class="item"><div class="lbl">Falta</div>' +
    '<div class="val" style="color:' + (f.falta > 0 ? '#dc2626' : '#16a34a') + ';">' +
    fmtBRL(f.falta) + '</div>' +
    (f.diasFaltam > 0 && f.falta > 0
      ? '<div class="hint">' + fmtBRL(f.porDia) + '/dia em ' + f.diasFaltam + 'd</div>'
      : '') + '</div>' +
    '<div class="item"><div class="lbl">Pedidos</div>' +
    '<div class="val">' + f.pedidosTotal + '</div>' +
    (compar.faturadoTotal > 0
      ? '<div class="hint">' + dH(f.faturadoTotal, compar.faturadoTotal) + ' vs ant.</div>'
      : '') + '</div>' +
    '<div class="item"><div class="lbl">Projeção</div>' +
    '<div class="val" style="color:' + (f.projecao >= f.metaTotal ? '#16a34a' : '#dc2626') + ';">' +
    fmtBRL(f.projecao) + '</div>' +
    '<div class="hint">' + (f.projecao >= f.metaTotal ? '✓ Bater' : 'Abaixo') + '</div></div>';

  if (f.faturadoAdmin > 0) {
    resumoHTML +=
      '<div class="item"><div class="lbl">Admin</div>' +
      '<div class="val" style="color:#64748b;font-size:15px;">' + fmtBRL(f.faturadoAdmin) + '</div>' +
      '<div class="hint">fora da meta</div></div>';
  }

  document.getElementById('painel-resumo').innerHTML = resumoHTML;

  const fr = document.getElementById('painel-frase');
  fr.style.display = 'block';
  if (f.falta > 0 && f.diasFaltam > 0) {
    fr.innerHTML = 'Faltam <strong>' + fmtBRL(f.falta) +
      '</strong> em <strong>' + f.diasFaltam + ' dias</strong>. Exige <strong>' +
      fmtBRL(f.porDia) + '/dia</strong>.';
  } else if (f.falta <= 0) {
    fr.innerHTML = '🎉 <strong>Meta batida!</strong>';
  } else {
    fr.style.display = 'none';
  }

  // Ranking
  const ord = f.dados.slice().sort((x, y) => (y.pctMeta || 0) - (x.pctMeta || 0));
  let rows = '';
  const mostraFilial = parseEscopo(ui.escopoAtual).tipo !== 'filial';

  ord.forEach((d, i) => {
    const v = d.vendedor;
    let cls = '';
    if (d.pctMeta == null) cls = '';
    else if (d.pctMeta >= 100) cls = 'meta-batida';
    else if (d.pctMeta >= 80) cls = 'ritmo-amarelo';
    else cls = 'ritmo-vermelho';

    if (v.papel === 'ex-vendedor' || !v.ativo) cls += ' inativo';

    const fi = state.filiais.find(x => x.id === v.filialId);
    const badgeExtra = (v.papel === 'ex-vendedor' || !v.ativo)
      ? ' <span class="badge badge-ex" style="font-size:10px;">ex</span>'
      : '';

    const visivel = i < 5;
    const escondido = visivel ? '' : ' style="display:none;" data-rank-extra';

    rows += '<tr class="' + cls + '"' + escondido + '>' +
      '<td><strong>' + (i + 1) + 'º</strong> ' + escapeHtml(v.nome) + badgeExtra +
      (mostraFilial && fi ? ' <span class="badge badge-filial" style="font-size:10px;">' +
        escapeHtml(fi.nome) + '</span>' : '') + '</td>' +
      '<td class="num">' + fmtBRL(d.faturado) + '</td>' +
      '<td class="num">' + (d.pctMeta != null ? fmtPct(d.pctMeta, 1) : '—') + '</td>' +
      '<td class="num">' + d.pedidos + '</td></tr>';
  });

  const ordAdmin = (f.dadosAdmin || []).slice().sort((x, y) => y.faturado - x.faturado);
  ordAdmin.forEach(d => {
    if (d.faturado === 0) return;
    const v = d.vendedor;
    rows += '<tr style="background:#f8fafc;color:#64748b;display:none;" data-rank-extra>' +
      '<td>— ' + escapeHtml(v.nome) + ' <span class="badge badge-adm" style="font-size:10px;">adm</span></td>' +
      '<td class="num">' + fmtBRL(d.faturado) + '</td>' +
      '<td class="num">—</td>' +
      '<td class="num">' + d.pedidos + '</td></tr>';
  });

  document.getElementById('rank-container').innerHTML =
    '<table class="tabela"><thead><tr>' +
    '<th>Vendedor</th><th class="num">Faturado</th>' +
    '<th class="num">% Meta</th><th class="num">Ped.</th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table>';

  document.getElementById('rank-sub').textContent =
    f.diasTrab + ' de ' + f.diasUteisTotal + ' dias com dados';

  // Botão ver completo
  const btnVerTodos = document.getElementById('btn-rank-ver-todos');
  const temMais = ord.length + ordAdmin.filter(d => d.faturado > 0).length > 5;
  if (btnVerTodos) {
    btnVerTodos.style.display = temMais ? '' : 'none';
    btnVerTodos.onclick = () => {
      const escondidos = document.querySelectorAll('[data-rank-extra]');
      const mostrando = btnVerTodos.textContent === 'ver menos';
      escondidos.forEach(el => {
        el.style.display = mostrando ? 'none' : '';
      });
      btnVerTodos.textContent = mostrando ? 'ver completo' : 'ver menos';
    };
  }

  // Oculta cards vendedor
  ['card-vend-evolucao', 'card-vend-historico', 'card-vend-clientes',
   'card-vend-em-risco', 'card-vend-top-produtos', 'card-vend-novidade',
   'card-vend-rank'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });

  if (ui.charts.vendEvo) { try { ui.charts.vendEvo.destroy(); ui.charts.vendEvo = null; } catch (e) {} }
  if (ui.charts.vendHist) { try { ui.charts.vendHist.destroy(); ui.charts.vendHist = null; } catch (e) {} }

  const cardSimAdmin = document.getElementById('card-painel-simulador');
  if (cardSimAdmin) cardSimAdmin.style.display = 'block';

  renderSimulador();
  renderAcoesPainel();
  renderGraficos(a, m, f);
  renderHistorico();
  renderSemana();
}