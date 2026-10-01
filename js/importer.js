// ============================================================
// importer.js — Leitura das planilhas 324, 740, 361, comparativo
// ============================================================

import { state, basesPreview } from './state.js';
import {
  normalizarNomeCliente, parseValorBR, isoDate, diffDias
} from './utils.js';
import { matchVendedor, mesclarCliente, mesclarProduto, escopoFilialAtiva } from './calc.js';

// ============================================================
// AUXILIARES DE IMPORTAÇÃO
// ============================================================

export function filialParaImport(escopoAtual) {
  const fid = escopoFilialAtiva(escopoAtual);
  if (fid) return fid;

  const ativas = state.filiais.filter(f => f.ativo);
  if (ativas.length === 0) {
    throw new Error('Nenhuma filial ativa.');
  }

  const opcoes = ativas.map((f, i) => (i + 1) + ') ' + f.nome).join('\n');
  const resposta = prompt('Em qual filial?\n\n' + opcoes + '\n\nDigite o número:');
  if (!resposta) return null;

  const idx = parseInt(resposta, 10) - 1;
  if (idx < 0 || idx >= ativas.length) {
    throw new Error('Filial inválida.');
  }
  return ativas[idx].id;
}

// ============================================================
// 324 DETALHADO
// ============================================================

export function importar324(entrada, escopoAtual) {
  const fid = filialParaImport(escopoAtual);
  if (!fid) return;

  const files = Array.isArray(entrada) ? entrada : [entrada];
  if (files.length === 1) importar324Single(files[0], fid);
  else importar324Multi(files, fid);
}

function importar324Single(file, filialId) {
  const st = document.getElementById('erp-status');
  st.textContent = 'Lendo...';
  st.style.color = '#64748b';

  const r = new FileReader();
  r.onload = function (evt) {
    try {
      const wb = XLSX.read(new Uint8Array(evt.target.result), { type: 'array' });
      const result = processar324(wb, filialId);

      if (!result || result.erro || !result.clientes || result.clientes.length === 0) {
        st.style.color = '#dc2626';
        st.textContent = '⚠ ' + (result && result.erro ? result.erro : 'Sem dados');
        return;
      }

      const lancamentos = [];
      const data = result.dataFim || result.dataInicio;

      if (data && result.resumoVendedores) {
        Object.keys(result.resumoVendedores).forEach(vid => {
          const rv = result.resumoVendedores[vid];
          if (!rv.faturado && !rv.pedidos) return;
          lancamentos.push({
            data, vendedor: vid,
            valor: rv.faturado || 0, pedidos: rv.pedidos || 0,
            obs: 'Importado ' + file.name
          });
        });
      }

      const mesKey = data ? data.slice(0, 7) : '';

      basesPreview.clientes = result.clientes;
      basesPreview.produtos = result.produtos;
      basesPreview.lancamentosMulti = lancamentos;
      basesPreview.vendasItens = result.vendasItens || [];
      basesPreview.mesVendasItens = mesKey;
      basesPreview.filialImport = filialId;
      basesPreview.dataInicio = result.dataInicio;
      basesPreview.dataFim = result.dataFim;
      basesPreview.vendedoresNaoIdentificados = result.vendedoresNaoIdentificados || {};

      st.style.color = '#16a34a';
      st.textContent = '✓ ' + result.clientes.length + ' clientes, ' +
        result.produtos.length + ' produtos, ' +
        (result.vendasItens || []).length + ' itens.';

      const naoId = Object.keys(basesPreview.vendedoresNaoIdentificados);
      if (naoId.length > 0) {
        st.innerHTML += '<br>⚠ <span style="color:#dc2626;">Não identificados: ' +
          naoId.join(', ') + '</span>';
      }
      renderBasesStatus();
    } catch (e) {
      st.style.color = '#dc2626';
      st.textContent = 'Erro: ' + e.message;
    }
  };
  r.readAsArrayBuffer(file);
}

function importar324Multi(files, filialId) {
  const st = document.getElementById('erp-status');
  st.style.color = '#64748b';
  st.textContent = 'Lendo ' + files.length + ' arquivo(s)...';

  const promessas = files.map(f => new Promise(resolve => {
    const r = new FileReader();
    r.onload = function (evt) {
      try {
        const wb = XLSX.read(new Uint8Array(evt.target.result), { type: 'array' });
        const result = processar324(wb, filialId);
        if (result && !result.erro) result._arquivo = f.name;
        resolve(result || { erro: 'vazio', _arquivo: f.name });
      } catch (e) {
        resolve({ erro: e.message, _arquivo: f.name });
      }
    };
    r.readAsArrayBuffer(f);
  }));

  Promise.all(promessas).then(resultados => {
    const validos = resultados.filter(x => !x.erro && x.clientes && x.clientes.length > 0);
    if (!validos.length) {
      st.style.color = '#dc2626';
      st.textContent = '⚠ Nenhum arquivo válido.';
      return;
    }

    const cliMap = {};
validos.forEach(res => {
  const pIni = res.dataInicio || res.dataFim || '';
  const pFim = res.dataFim || res.dataInicio || '';
  (res.clientes || []).forEach(c => {
    const k = normalizarNomeCliente(c.nome) + '|' + pIni + '|' + pFim;
    if (!cliMap[k]) cliMap[k] = Object.assign({}, c, { periodoIni: pIni, periodoFim: pFim });
    else cliMap[k] = mesclarCliente(cliMap[k], c);
  });
});
const clientes = Object.values(cliMap);

    const prodMap = {};
    validos.forEach(res => {
      (res.produtos || []).forEach(p => {
        if (!prodMap[p.codigo]) prodMap[p.codigo] = Object.assign({}, p);
        else prodMap[p.codigo] = mesclarProduto(prodMap[p.codigo], p);
      });
    });
    const produtos = Object.values(prodMap);

    const lancamentos = [];
    const naoId = {};
    let allVendasItens = [];
    let primeiroMes = '';

    validos.forEach(res => {
      if (res.resumoVendedores) {
        const data = res.dataFim || res.dataInicio;
        if (!data) return;
        if (!primeiroMes) primeiroMes = data.slice(0, 7);
        Object.keys(res.resumoVendedores).forEach(vid => {
          const rv = res.resumoVendedores[vid];
          if (!rv.faturado && !rv.pedidos) return;
          lancamentos.push({
            data, vendedor: vid,
            valor: rv.faturado || 0, pedidos: rv.pedidos || 0,
            obs: 'Importado ' + res._arquivo
          });
        });
      }
      if (res.vendasItens) allVendasItens = allVendasItens.concat(res.vendasItens);
      if (res.vendedoresNaoIdentificados) Object.assign(naoId, res.vendedoresNaoIdentificados);
    });

    basesPreview.clientes = clientes;
    basesPreview.produtos = produtos;
    basesPreview.lancamentosMulti = lancamentos;
    basesPreview.vendasItens = allVendasItens;
    basesPreview.mesVendasItens = primeiroMes;
    basesPreview.filialImport = filialId;
    basesPreview.vendedoresNaoIdentificados = naoId;

    st.style.color = '#16a34a';
    st.textContent = '✓ ' + validos.length + ' arquivos · ' +
      clientes.length + ' clientes · ' +
      produtos.length + ' produtos · ' +
      allVendasItens.length + ' itens';
    renderBasesStatus();
  });
}

export function processar324(wb, filialId) {
  let sn = wb.SheetNames[0];
  for (let i = 0; i < wb.SheetNames.length; i++) {
    const s = wb.SheetNames[i];
    if (s.toLowerCase().indexOf('324') >= 0 || s.toLowerCase().indexOf('comiss') >= 0) {
      sn = s;
      break;
    }
  }

  const ws = wb.Sheets[sn];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

  const clientes = {};
  const produtos = {};
  const resumoVendedores = {};
  const vendedoresNaoIdentificados = {};
  const vendasItensMap = {};

  let vend = null;
  let totalLinhas = 0;
  let dataInicio = null;
  let dataFim = null;

  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const r = rows[i];
    if (!r) continue;
    const m = r.join(' ').match(/Per[íi]odo:\s*(\d{2})\/(\d{2})\/(\d{4})\s*a\s*(\d{2})\/(\d{2})\/(\d{4})/);
    if (m) {
      dataInicio = m[3] + '-' + m[2] + '-' + m[1];
      dataFim = m[6] + '-' + m[5] + '-' + m[4];
      break;
    }
  }

  const dRef = dataFim || dataInicio || isoDate(new Date());
  const periodoIni = dataInicio || dRef;
  const periodoFim = dataFim || dRef;

  let eh324 = false;
  for (let i = 0; i < Math.min(rows.length, 60); i++) {
    const r = rows[i];
    if (!r) continue;
    const primeira = String(r[0] || '').toUpperCase().trim();
    if (primeira.indexOf('VENDEDOR') === 0 || primeira.indexOf('VENDE ') === 0) {
      eh324 = true;
      break;
    }
  }
  if (!eh324) return { erro: 'Formato desconhecido.', clientes: [], produtos: [] };

  const COL_CLIENTE = 0, COL_VENDA = 2, COL_PRODUTO = 3, COL_DESCRICAO = 4;
  const COL_QTDE = 8, COL_TOTAL_CDESC = 13;

  // CORREÇÃO BUG 7: estes mapas são locais desta execução (não acumulam entre imports)
  const comprasDatasPorCliente = {};
  const vendasPorCliente = {};

  let nomeVendOriginal = '';

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;

    const pri = String(r[0] || '').toUpperCase().trim();

    if (pri.indexOf('VENDEDOR') === 0 || pri.indexOf('VENDE ') === 0) {
      let nomeVend = '';
      for (let j = 1; j < r.length; j++) {
        if (r[j] == null) continue;
        const s2 = String(r[j]).trim();
        if (!s2 || /^\d+$/.test(s2)) continue;
        nomeVend = s2;
        break;
      }

      const mVen = nomeVend.match(/^([^(]+?)\s*\(/);
      const nomeLimpo = mVen ? mVen[1].trim() : nomeVend.trim();
      nomeVendOriginal = nomeLimpo;

      vend = matchVendedor(nomeLimpo, filialId);

      if (!vend && nomeLimpo) {
        if (!vendedoresNaoIdentificados[nomeLimpo]) {
          vendedoresNaoIdentificados[nomeLimpo] = { faturado: 0, pedidos: 0 };
        }
      }
      continue;
    }

    if (pri.indexOf('TOTAL') === 0) continue;

    if (pri.indexOf('ALTA FIX') >= 0 || pri.indexOf('CNPJ') >= 0 ||
        pri.indexOf('QUADRA') >= 0 || pri.indexOf('MARABÁ') >= 0 ||
        pri.indexOf('MAXDATA') >= 0 || pri.indexOf('EMISSÃO') >= 0 ||
        pri.indexOf('FILTROS') >= 0 || pri.indexOf('PERÍODO') >= 0) continue;

    const nc = r[COL_CLIENTE];
    const cod = r[COL_PRODUTO];
    const desc = r[COL_DESCRICAO];
    const qt = parseValorBR(r[COL_QTDE]);
    const tcd = parseValorBR(r[COL_TOTAL_CDESC]);

    if (nc == null || cod == null || desc == null) continue;
    if (isNaN(tcd)) continue;

    const descStr = String(desc || '').trim();
    if (!descStr || descStr === '—' || descStr === '-') continue;

    const ncStr = String(nc).trim();
    const cs = String(cod).trim();
    if (!ncStr || ncStr.length < 3) continue;

    const cliId = 'cli_' + ncStr.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40);

    if (!clientes[ncStr]) {
  clientes[ncStr] = {
    id: cliId, nome: ncStr, codigo: cs,
    vendedor: vend ? vend.id : null,
    filialId: filialId,
    periodoIni, periodoFim,
    valorTotal: 0, numCompras: 0,
    ultimaCompra: null, primeiraCompra: null,
    linhas: 0, _datas: []
  };
      vendasPorCliente[cliId] = {};
      comprasDatasPorCliente[cliId] = {};
    }

    const cl = clientes[ncStr];
    if (!cl.codigo && cs) cl.codigo = cs;
    cl.valorTotal += tcd;
    cl.linhas += 1;

    if (!cl.ultimaCompra || dRef > cl.ultimaCompra) cl.ultimaCompra = dRef;
    if (!cl.primeiraCompra || dRef < cl.primeiraCompra) cl.primeiraCompra = dRef;

    const numVendaLinha = r[COL_VENDA];
    if (numVendaLinha != null) vendasPorCliente[cliId][String(numVendaLinha)] = true;
    comprasDatasPorCliente[cliId][dRef] = true;

    if (!produtos[cs]) {
      produtos[cs] = {
        id: 'prod_' + cs, codigo: cs, descricao: descStr,
        fabricante: '', qtdVendida: 0, valorVendido: 0,
        estoqueAtual: null, estoqueMinimo: null,
        filialId: filialId
      };
    }

    produtos[cs].qtdVendida += (isNaN(qt) ? 0 : qt);
    produtos[cs].valorVendido += tcd;
    totalLinhas++;

    if (vend) {
      if (!resumoVendedores[vend.id]) {
        resumoVendedores[vend.id] = { faturado: 0, pedidosSet: {} };
      }
      resumoVendedores[vend.id].faturado += tcd;
      if (numVendaLinha != null) {
        resumoVendedores[vend.id].pedidosSet[String(numVendaLinha)] = true;
      }
    } else if (nomeVendOriginal) {
      vendedoresNaoIdentificados[nomeVendOriginal].faturado += tcd;
      if (numVendaLinha != null) {
        if (!vendedoresNaoIdentificados[nomeVendOriginal]._ped) {
          vendedoresNaoIdentificados[nomeVendOriginal]._ped = {};
        }
        vendedoresNaoIdentificados[nomeVendOriginal]._ped[String(numVendaLinha)] = true;
      }
    }

    // VendasItens: par cliente × produto
    const cliNorm = normalizarNomeCliente(ncStr);
const vendId = vend ? vend.id : null;
const keyVI = periodoIni + '|' + periodoFim + '|' + cliNorm + '|' + cs + '|' + (vendId || 'x');
if (!vendasItensMap[keyVI]) {
  vendasItensMap[keyVI] = {
    periodoIni, periodoFim,
    clienteNorm: cliNorm, produtoCodigo: cs,
    vendedor: vendId,
    produtoDescricao: descStr, valor: 0, qtd: 0
  };
}
    vendasItensMap[keyVI].valor += tcd;
    vendasItensMap[keyVI].qtd += (isNaN(qt) ? 0 : qt);
  }

  if (totalLinhas === 0) return { erro: 'Nenhum item processado.', clientes: [], produtos: [] };

  Object.keys(vendedoresNaoIdentificados).forEach(k => {
    const v = vendedoresNaoIdentificados[k];
    v.pedidos = v._ped ? Object.keys(v._ped).length : 0;
    delete v._ped;
  });

  Object.keys(clientes).forEach(nomeCli => {
    const c = clientes[nomeCli];
    const setV = vendasPorCliente[c.id] || {};
    c.numCompras = Object.keys(setV).length || c.linhas || 1;
    delete c.linhas;

    c._datas = [dRef];
    const datasU = Object.keys(comprasDatasPorCliente[c.id] || {}).sort();
    if (datasU.length > 1) {
      const span = diffDias(datasU[0], datasU[datasU.length - 1]);
      c.intervaloMedio = Math.max(7, Math.round(span / (datasU.length - 1)));
    } else {
      c.intervaloMedio = 30;
    }

    const mH = c.primeiraCompra && c.ultimaCompra
      ? Math.max(1, Math.round(diffDias(c.primeiraCompra, c.ultimaCompra) / 30) + 1)
      : 1;
    c.valorMedioMensal = c.valorTotal / mH;
  });

  const resumoFinal = {};
  Object.keys(resumoVendedores).forEach(id => {
    resumoFinal[id] = {
      faturado: resumoVendedores[id].faturado,
      pedidos: Object.keys(resumoVendedores[id].pedidosSet).length || 0
    };
  });

  return {
    clientes: Object.values(clientes),
    produtos: Object.values(produtos),
    vendasItens: Object.values(vendasItensMap),
    totalLinhas, resumoVendedores: resumoFinal,
    dataInicio, dataFim, vendedoresNaoIdentificados
  };
}

// ============================================================
// 740 CIDADES
// ============================================================

export function importar740(entrada, escopoAtual) {
  const fid = filialParaImport(escopoAtual);
  if (!fid) return;

  const files = Array.isArray(entrada) ? entrada : [entrada];
  if (files.length === 1) importar740Single(files[0], fid);
  else importar740Multi(files, fid);
}

function importar740Single(file, filialId) {
  const st = document.getElementById('status-740');
  st.style.color = '#64748b';
  st.textContent = 'Lendo ' + file.name + '...';

  const r = new FileReader();
  r.onload = function (evt) {
    try {
      const wb = XLSX.read(new Uint8Array(evt.target.result), { type: 'array' });
      const result = processar740(wb, filialId);
      if (!result) {
        st.style.color = '#dc2626';
        st.textContent = '⚠ Formato não reconhecido.';
        return;
      }

      basesPreview.cidades = result.cidades;
      basesPreview.periodoTexto = result.periodo;
      basesPreview.periodoInicio = result.periodoInicio;
      basesPreview.periodoFim = result.periodoFim;
      basesPreview.filialImport = filialId;

      st.style.color = '#16a34a';
      st.textContent = '✓ ' + result.cidades.length + ' cidades, ' +
        result.totalClientes + ' clientes.';
      if (result.periodoInicio) {
        st.textContent += ' Período: ' +
          result.periodoInicio.split('-').reverse().join('/') + ' a ' +
          result.periodoFim.split('-').reverse().join('/');
      }
      if (result.vendedoresNaoEncontrados > 0) {
        st.innerHTML += '<br>⚠ ' + result.vendedoresNaoEncontrados +
          ' linha(s) com vendedor não identificado.';
      }
      renderBasesStatus();
    } catch (e) {
      st.style.color = '#dc2626';
      st.textContent = 'Erro: ' + e.message;
    }
  };
  r.readAsArrayBuffer(file);
}

function importar740Multi(files, filialId) {
  const st = document.getElementById('status-740');
  st.style.color = '#64748b';
  st.textContent = '📖 Lendo ' + files.length + ' arquivo(s)...';

  const promessas = files.map(f => new Promise(resolve => {
    const r = new FileReader();
    r.onload = function (evt) {
      try {
        const wb = XLSX.read(new Uint8Array(evt.target.result), { type: 'array' });
        const result = processar740(wb, filialId);
        if (result) result._arquivo = f.name;
        resolve(result || { erro: 'vazio', _arquivo: f.name });
      } catch (e) {
        resolve({ erro: e.message, _arquivo: f.name });
      }
    };
    r.readAsArrayBuffer(f);
  }));

  Promise.all(promessas).then(resultados => {
    const validos = resultados.filter(x => !x.erro && x.cidades && x.cidades.length > 0);
    if (!validos.length) {
      st.style.color = '#dc2626';
      st.textContent = '⚠ Nenhum arquivo válido.';
      return;
    }

    validos.sort((a, b) => (a.periodoInicio || '').localeCompare(b.periodoInicio || ''));

    st.style.color = '#16a34a';
    st.textContent = '✓ ' + validos.length + ' meses lidos. Vão ser salvos em ordem.';

    let todasCidades = [];
    let primeiroIni = null;
    let ultimoFim = null;

    validos.forEach(res => {
      todasCidades = todasCidades.concat(res.cidades.map(c =>
        Object.assign({}, c, { mesKey: res.periodoInicio ? res.periodoInicio.slice(0, 7) : '' })
      ));
      if (!primeiroIni) primeiroIni = res.periodoInicio;
      ultimoFim = res.periodoFim;
    });

    basesPreview.cidades = todasCidades;
    basesPreview.periodoInicio = primeiroIni;
    basesPreview.periodoFim = ultimoFim;
    basesPreview.filialImport = filialId;
    basesPreview._mesesImport = validos.map(r => ({
      mes: r.periodoInicio ? r.periodoInicio.slice(0, 7) : '',
      cidades: r.cidades,
      periodoInicio: r.periodoInicio,
      periodoFim: r.periodoFim
    }));
    renderBasesStatus();
  });
}

export function processar740(wb, filialId) {
  let sn = wb.SheetNames[0];
  for (let i = 0; i < wb.SheetNames.length; i++) {
    const s = wb.SheetNames[i];
    if (s.toLowerCase().indexOf('740') >= 0 || s.toLowerCase().indexOf('cidade') >= 0) {
      sn = s;
      break;
    }
  }

  const ws = wb.Sheets[sn];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

  let cidades = [];
  const clientesEncontrados = [];
  let cidadeAtual = null;
  let periodo = '', periodoInicio = '', periodoFim = '';
  let totalClientesGlobal = 0;
  let vendedoresNaoEncontrados = 0;

  function extrairPeriodo(texto) {
    if (!texto) return null;
    const t = String(texto).replace(/\u00A0/g, ' ').replace(/\u200B/g, '').replace(/\s+/g, ' ').trim();
    const patterns = [
      /Per[íi]odo\s*:?\s*(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\s*(?:a|à|até|-|~|aos)\s*(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/i,
      /\bde\s+(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\s*(?:a|à|até|-|~)\s*(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/i,
      /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\s*(?:a|à|até|-|~)\s*(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/
    ];
    for (let i = 0; i < patterns.length; i++) {
      const m = t.match(patterns[i]);
      if (m) {
        const a1 = m[3].length === 2 ? '20' + m[3] : m[3];
        const a2 = m[6].length === 2 ? '20' + m[6] : m[6];
        return {
          ini: a1 + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[1]).padStart(2, '0'),
          fim: a2 + '-' + String(m[5]).padStart(2, '0') + '-' + String(m[4]).padStart(2, '0')
        };
      }
    }
    return null;
  }

  for (let i = 0; i < Math.min(rows.length, 80); i++) {
    const r = rows[i];
    if (!r) continue;
    const linha = r.filter(c => c != null && String(c).trim() !== '').map(String).join(' ');
    const p = extrairPeriodo(linha);
    if (p) {
      periodoInicio = p.ini;
      periodoFim = p.fim;
      const dI = periodoInicio.split('-');
      const dF = periodoFim.split('-');
      periodo = dI[2] + '/' + dI[1] + '/' + dI[0] + ' a ' + dF[2] + '/' + dF[1] + '/' + dF[0];
      break;
    }
  }

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;

    let primeira = '';
    for (let k = 0; k < r.length; k++) {
      if (r[k] != null && String(r[k]).trim() !== '') {
        primeira = String(r[k]).trim();
        break;
      }
    }
    if (!primeira) continue;

    const up = primeira.toUpperCase();
    if (up.indexOf('ALTA FIX') >= 0 || up.indexOf('MAXDATA') >= 0 || up.indexOf('CNPJ') >= 0 ||
        up.indexOf('PERÍODO') >= 0 || up.indexOf('EMISSÃO') >= 0 || up.indexOf('RELATÓRIO') >= 0) continue;

    let achouCidade = -1;
    for (let k = 0; k < r.length; k++) {
      if (r[k] != null && /^\s*Cidade\s*:?\s*/i.test(String(r[k]))) {
        achouCidade = k;
        break;
      }
    }

    if (achouCidade >= 0) {
      if (cidadeAtual) {
        cidades.push(cidadeAtual);
        cidadeAtual = null;
      }

      const cellCid = String(r[achouCidade]);
      const m1 = cellCid.match(/^\s*Cidade\s*:\s*(.+)$/i);
      let nomeCidade = m1 ? m1[1].trim() : '';
      let uf = '';

      for (let k = achouCidade + 1; k < r.length; k++) {
        const cell = r[k] == null ? '' : String(r[k]).trim();
        if (!cell) continue;
        const mUF1 = cell.match(/^UF\s*:\s*([A-Z]{2})/i);
        const mUF3 = cell.match(/^([A-Z]{2})$/);
        if (mUF1) { uf = mUF1[1].toUpperCase(); continue; }
        if (mUF3 && !uf) { uf = mUF3[1].toUpperCase(); continue; }
        if (!nomeCidade && cell.length >= 2) { nomeCidade = cell; continue; }
      }

      if (nomeCidade) {
        cidadeAtual = {
          id: 'cid_' + filialId + '_' + nomeCidade.toUpperCase().replace(/\s+/g, '_') + '_' + uf,
          nome: nomeCidade, uf,
          clientes: [], totalValor: 0, qtdVendas: 0, numClientes: 0, ticketMedio: 0,
          filialId: filialId
        };
      }
      continue;
    }

    if (/^\s*Total\s*$/i.test(primeira) || /^\s*Total\s+/i.test(primeira)) {
      if (cidadeAtual) {
        cidades.push(cidadeAtual);
        cidadeAtual = null;
      }
      continue;
    }

    if (up === 'CÓDIGO' || up === 'CODIGO' || up === 'CLIENTE' || up === 'VENDEDOR') continue;
    if (!cidadeAtual) continue;
    if (!/^\d/.test(primeira)) continue;

    const textos = [], numeros = [];
    for (let k = 1; k < r.length; k++) {
      const cell = r[k];
      if (cell == null) continue;
      const s = String(cell).trim();
      if (!s) continue;
      if (/^-?[\d.,]+$/.test(s) && /\d/.test(s)) numeros.push(s);
      else textos.push(s);
    }

    const nomeCli = textos[0] || '';
    const vendedorRaw = textos[1] || '';
    const qtdVendas = numeros.length > 0 ? (parseValorBR(numeros[0]) || 0) : 0;
    const valor = numeros.length > 1 ? (parseValorBR(numeros[1]) || 0) : 0;

    if (!nomeCli || valor <= 0) continue;

    const mVen = vendedorRaw.match(/^([^(]+?)\s*\(/);
    const nomeVendedor = mVen ? mVen[1].trim() : vendedorRaw.trim();
    const v = matchVendedor(nomeVendedor, filialId);
    if (!v && nomeVendedor) vendedoresNaoEncontrados++;

    cidadeAtual.clientes.push({
      codigo: primeira, nome: nomeCli,
      vendedor: v ? v.id : null,
      vendedorNome: nomeVendedor || null,
      qtdVendas: isNaN(qtdVendas) ? 0 : qtdVendas,
      valor
    });

    cidadeAtual.totalValor += valor;
    cidadeAtual.qtdVendas += (isNaN(qtdVendas) ? 0 : qtdVendas);
    cidadeAtual.numClientes += 1;

    clientesEncontrados.push({
      nome: nomeCli, cidade: cidadeAtual.nome, uf: cidadeAtual.uf, codigo: primeira
    });
    totalClientesGlobal++;
  }

  if (cidadeAtual) cidades.push(cidadeAtual);

  // Consolida cidades duplicadas (mesmo nome + uf)
  const porChave = {};
  cidades.forEach(c => {
    const chave = (c.nome + '|' + c.uf).toUpperCase();
    if (!porChave[chave]) porChave[chave] = c;
    else {
      const dst = porChave[chave];
      dst.totalValor += c.totalValor;
      dst.qtdVendas += c.qtdVendas;
      dst.numClientes += c.numClientes;
      dst.clientes = dst.clientes.concat(c.clientes);
    }
  });
  cidades = Object.values(porChave);

  cidades.forEach(c => {
    c.ticketMedio = c.qtdVendas > 0
      ? c.totalValor / c.qtdVendas
      : (c.numClientes > 0 ? c.totalValor / c.numClientes : 0);
  });

  if (cidades.length === 0) return null;

  return {
    cidades, clientes: clientesEncontrados, periodo,
    periodoInicio, periodoFim, totalClientes: totalClientesGlobal,
    vendedoresNaoEncontrados
  };
}

// ============================================================
// 361 CURVA ABC / FABRICANTES
// CORREÇÃO BUG 3: agora extrai estoqueAtual e estoqueMinimo
// ============================================================

export function importar361(entrada, escopoAtual) {
  const fid = filialParaImport(escopoAtual);
  if (!fid) return;

  const files = Array.isArray(entrada) ? entrada : [entrada];
  if (files.length === 1) importar361Single(files[0], fid);
  else importar361Multi(files, fid);
}

function importar361Single(file, filialId) {
  const st = document.getElementById('abc-status-import');
  st.style.color = '#64748b';
  st.textContent = 'Lendo ' + file.name + '...';

  const r = new FileReader();
  r.onload = function (evt) {
    try {
      const wb = XLSX.read(new Uint8Array(evt.target.result), { type: 'array' });
      const result = processar361(wb);

      if (!result || result.itens.length === 0) {
        st.style.color = '#dc2626';
        st.textContent = '⚠ Nenhum item.';
        return;
      }

      basesPreview.estoqueABC = result.itens;
      basesPreview.abcPeriodoInicio = result.periodoInicio;
      basesPreview.abcPeriodoFim = result.periodoFim;
      basesPreview.filialImport = filialId;

      st.style.color = '#16a34a';
      st.textContent = '✓ ' + result.itens.length + ' itens.';
      if (result.periodoInicio) {
        st.textContent += ' Período: ' +
          result.periodoInicio.split('-').reverse().join('/') + ' a ' +
          result.periodoFim.split('-').reverse().join('/');
      }
      renderBasesStatus();
    } catch (e) {
      st.style.color = '#dc2626';
      st.textContent = 'Erro: ' + e.message;
    }
  };
  r.readAsArrayBuffer(file);
}

function importar361Multi(files, filialId) {
  const st = document.getElementById('abc-status-import');
  st.style.color = '#64748b';
  st.textContent = '📖 Lendo ' + files.length + ' arquivo(s)...';

  const promessas = files.map(f => new Promise(resolve => {
    const r = new FileReader();
    r.onload = function (evt) {
      try {
        const wb = XLSX.read(new Uint8Array(evt.target.result), { type: 'array' });
        const result = processar361(wb);
        if (result) result._arquivo = f.name;
        resolve(result || { erro: 'vazio', _arquivo: f.name });
      } catch (e) {
        resolve({ erro: e.message, _arquivo: f.name });
      }
    };
    r.readAsArrayBuffer(f);
  }));

  Promise.all(promessas).then(resultados => {
    const validos = resultados.filter(x => !x.erro && x.itens && x.itens.length > 0);
    if (!validos.length) {
      st.style.color = '#dc2626';
      st.textContent = '⚠ Nenhum arquivo válido.';
      return;
    }

    validos.sort((a, b) => (a.periodoInicio || '').localeCompare(b.periodoInicio || ''));
    const ultimo = validos[validos.length - 1];

    basesPreview.estoqueABC = ultimo.itens;
    basesPreview.abcPeriodoInicio = ultimo.periodoInicio;
    basesPreview.abcPeriodoFim = ultimo.periodoFim;
    basesPreview.filialImport = filialId;
    basesPreview._mesesABC = validos.map(r => ({
      mes: r.periodoInicio ? r.periodoInicio.slice(0, 7) : '',
      itens: r.itens
    }));

    st.style.color = '#16a34a';
    st.textContent = '✓ ' + validos.length + ' meses lidos · usando ' +
      (ultimo.periodoInicio || '?') + ' como curva atual';
    renderBasesStatus();
  });
}

export function processar361(wb) {
  let sn = wb.SheetNames[0];
  for (let i = 0; i < wb.SheetNames.length; i++) {
    const s = wb.SheetNames[i];
    if (s.toLowerCase().indexOf('361') >= 0 ||
        s.toLowerCase().indexOf('abc') >= 0 ||
        s.toLowerCase().indexOf('curva') >= 0) {
      sn = s;
      break;
    }
  }

  const ws = wb.Sheets[sn];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

  let periodoInicio = '', periodoFim = '';
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const r = rows[i];
    if (!r) continue;
    const linha = r.filter(c => c != null && String(c).trim() !== '').map(String).join(' ');
    const m = linha.match(/Per[íi]odo:?\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*a\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i);
    if (m) {
      periodoInicio = m[3] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[1]).padStart(2, '0');
      periodoFim = m[6] + '-' + String(m[5]).padStart(2, '0') + '-' + String(m[4]).padStart(2, '0');
      break;
    }
  }

  let hi = -1;
  const cm = {};

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const ln = r.map(c => c ? String(c).toUpperCase().trim() : '');

    if (ln.indexOf('CÓDIGO') >= 0 && ln.indexOf('ABC') >= 0) {
      hi = i;
      ln.forEach((c, idx) => {
        if (c === 'CÓDIGO' || c === 'CODIGO') cm.codigo = idx;
        else if (c === 'DESCRIÇÃO' || c === 'DESCRICAO') cm.descricao = idx;
        else if (c === 'FABRICANTE') cm.fabricante = idx;
        else if (c === 'ABC') cm.abc = idx;
        else if (c === 'QTDE') cm.qtde = idx;
        else if (c.indexOf('TOTAL C/DESC') >= 0 || c.indexOf('TOTAL C/ DESC') >= 0) cm.total = idx;
        else if (c.indexOf('EST.MÍN') >= 0 || c.indexOf('EST.MIN') >= 0) cm.estMin = idx;
        else if (c === 'ESTOQUE') cm.estoque = idx;
      });
      break;
    }
  }
  // DEBUG TEMPORÁRIO — remover depois
  console.log('=== DEBUG 361 ===');
  console.log('header detectado na linha:', hi);
  console.log('mapa de colunas:', cm);
  if (hi >= 0) {
    console.log('header cru:', rows[hi]);
    console.log('1ª linha de dados:', rows[hi + 1]);
    console.log('2ª linha de dados:', rows[hi + 2]);
  }

  if (hi < 0) return { itens: [], periodoInicio: '', periodoFim: '' };

  const mapa = {};
  for (let i = hi + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r[cm.codigo]) continue;

    const cs = String(r[cm.codigo]).trim();
    if (!cs || cs.length > 30) continue;

    const desc = String(r[cm.descricao] || '').trim();
    if (!desc || desc === '—') continue;

    const qtd = cm.qtde != null ? (parseValorBR(r[cm.qtde]) || 0) : 0;
    const valor = cm.total != null ? (parseValorBR(r[cm.total]) || 0) : 0;

    // CORREÇÃO BUG 3: estoque agora é extraído
    const estoqueAtual = (cm.estoque != null)
      ? parseValorBR(r[cm.estoque])
      : null;
    const estoqueMinimo = (cm.estMin != null)
      ? parseValorBR(r[cm.estMin])
      : null;

    if (!mapa[cs]) {
      mapa[cs] = {
        codigo: cs,
        descricao: desc,
        fabricante: String(r[cm.fabricante] || '').trim(),
        curvaOficial: String(r[cm.abc] || '').trim().toUpperCase(),
        qtd, valor,
        estoqueAtual: isNaN(estoqueAtual) ? null : estoqueAtual,
        estoqueMinimo: isNaN(estoqueMinimo) ? null : estoqueMinimo
      };
    } else {
      mapa[cs].qtd += qtd;
      mapa[cs].valor += valor;
      if (mapa[cs].estoqueAtual == null && !isNaN(estoqueAtual)) {
        mapa[cs].estoqueAtual = estoqueAtual;
      }
      if (mapa[cs].estoqueMinimo == null && !isNaN(estoqueMinimo)) {
        mapa[cs].estoqueMinimo = estoqueMinimo;
      }
    }
  }

  return { itens: Object.values(mapa), periodoInicio, periodoFim };
}

// ============================================================
// COMPARATIVO 2025×2026
// ============================================================

export function importarComparativo(file, escopoAtual) {
  const fid = filialParaImport(escopoAtual);
  if (!fid) return;

  const st = document.getElementById('comp-status');
  st.style.color = '#64748b';
  st.textContent = 'Lendo...';

  const r = new FileReader();
  r.onload = function (evt) {
    try {
      const wb = XLSX.read(new Uint8Array(evt.target.result), { type: 'array' });
      const sn = wb.SheetNames.find(n => n.toLowerCase().indexOf('compar') >= 0);
      if (!sn) {
        st.style.color = '#dc2626';
        st.textContent = '⚠ Aba Comparativo não encontrada.';
        return;
      }

      const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: null });
      const meses = ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO',
                     'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
      const comp = [];
      let i = 0;

      while (i < rows.length) {
        const r = rows[i];
        if (!r) { i++; continue; }

        const m25 = String(r[0] || '').toUpperCase().trim();
        if (meses.indexOf(m25) >= 0) {
          const mes = m25;
          const tot = rows[i + 1];
          if (!tot) { i++; continue; }

          const f25 = parseValorBR(tot[1]) || 0;
          const p25 = parseValorBR(tot[2]) || 0;
          const f26 = parseValorBR(tot[6]) || 0;
          const p26 = parseValorBR(tot[7]) || 0;

          const vends = {};
          let j = i + 2;
          while (j < rows.length && j < i + 12) {
            const rv = rows[j];
            if (!rv || !rv[0]) { j++; continue; }
            const nome = String(rv[0]).trim().toUpperCase();
            if (meses.indexOf(nome) >= 0 || nome.indexOf('TOTAL') >= 0) break;
            const vf25 = parseValorBR(rv[1]) || 0;
            const vf26 = parseValorBR(rv[6]) || 0;
            if (vf25 > 0 || vf26 > 0) vends[nome] = { fat2025: vf25, fat2026: vf26 };
            j++;
          }

          comp.push({
            mes: mes.charAt(0) + mes.slice(1).toLowerCase(),
            fat2025: f25, ped2025: p25,
            fat2026: f26, ped2026: p26,
            vendedores: vends, filialId: fid
          });
          i = j;
        } else i++;
      }

      if (comp.length === 0) {
        st.style.color = '#dc2626';
        st.textContent = '⚠ Nenhum mês.';
        return;
      }

      basesPreview.comparativo = comp;
      basesPreview.filialImport = fid;

      st.style.color = '#16a34a';
      st.textContent = '✓ ' + comp.length + ' meses.';
      renderBasesStatus();
    } catch (e) {
      st.style.color = '#dc2626';
      st.textContent = 'Erro: ' + e.message;
    }
  };
  r.readAsArrayBuffer(file);
}

// ============================================================
// RENDER DE STATUS DAS BASES PENDENTES
// ============================================================

export function renderBasesStatus() {
  const el = document.getElementById('bases-status');
  if (!el) return;

  const tem = basesPreview.clientes || basesPreview.produtos ||
              basesPreview.comparativo || basesPreview.cidades ||
              basesPreview.estoqueABC ||
              (basesPreview.vendasItens && basesPreview.vendasItens.length > 0);

  if (!tem) {
    el.innerHTML = '<p style="color:#64748b;">Nenhuma pendente.</p>';
    return;
  }

  let h = '';
  if (basesPreview.clientes) h += '<p><strong>' + basesPreview.clientes.length + '</strong> clientes</p>';
  if (basesPreview.produtos) h += '<p><strong>' + basesPreview.produtos.length + '</strong> produtos</p>';
  if (basesPreview.vendasItens && basesPreview.vendasItens.length > 0) {
    h += '<p>🧩 <strong>' + basesPreview.vendasItens.length + '</strong> pares cliente × produto</p>';
  }
  if (basesPreview.lancamentosMulti && basesPreview.lancamentosMulti.length > 0) {
    h += '<p>📅 <strong>' + basesPreview.lancamentosMulti.length + '</strong> lançamentos</p>';
  }
  if (basesPreview.cidades) {
    h += '<p><strong>' + basesPreview.cidades.length + '</strong> cidades' +
      (basesPreview.periodoInicio
        ? ' <span style="color:#64748b;">(' + fmtBR(basesPreview.periodoInicio) +
          ' a ' + fmtBR(basesPreview.periodoFim) + ')</span>'
        : '') + '</p>';
  }
  if (basesPreview.comparativo) {
    h += '<p><strong>' + basesPreview.comparativo.length + '</strong> meses comparativo</p>';
  }
  if (basesPreview.estoqueABC) {
    h += '<p><strong>' + basesPreview.estoqueABC.length + '</strong> itens 361' +
      (basesPreview.abcPeriodoInicio
        ? ' <span style="color:#64748b;">(' + basesPreview.abcPeriodoInicio.slice(0, 7) + ')</span>'
        : '') + '</p>';
  }

  const naoId = basesPreview.vendedoresNaoIdentificados;
  if (naoId && Object.keys(naoId).length > 0) {
    h += '<p style="color:#dc2626;font-weight:600;">⚠ ' +
      Object.keys(naoId).length + ' vendedor(es) não identificado(s): ' +
      Object.keys(naoId).join(', ') + '</p>';
  }

  el.innerHTML = h;
}

function fmtBR(iso) {
  if (!iso) return '—';
  const p = iso.split('-');
  return p[2] + '/' + p[1] + '/' + p[0];
}