// ============================================================
// views/equipe.js — Cards e Ficha do Vendedor
// ============================================================

import { state, ui } from '../state.js';
import { fmtBRL, escapeHtml, diffDias, normalizarNomeCliente, isoDate } from '../utils.js';
import { calcVendedor, mesRefAtual, filialNoEscopo } from '../calc.js';

export function renderEquipe() {
  const container = document.getElementById('equipe-cards-container');
  if (!container) return;

  const ref = mesRefAtual(ui.escopoAtual);
  const a = ref.ano, m = ref.mes;
  const prefix = a + '-' + String(m + 1).padStart(2, '0');
  const hj = isoDate(new Date());

  let vendedores = state.vendedores.filter(v => 
    v.ativo && v.papel === 'vendedor' && filialNoEscopo(v.filialId, ui.escopoAtual)
  );

  if (ui.modoVendedor) {
    vendedores = vendedores.filter(v => v.id === ui.modoVendedor);
  }

  if (vendedores.length === 0) {
    container.innerHTML = '<div style="padding:24px; color:#888;">Nenhum vendedor ativo nesta filial.</div>';
    return;
  }

  const dadosVendedores = vendedores.map(v => {
    const calc = calcVendedor(v, a, m);
    
    const clientes = state.clientes.filter(c => c.vendedor === v.id);
    const carteiraTotal = clientes.length;
    
    const ativos = clientes.filter(c => {
      if (!c.ultimaCompra) return false;
      return diffDias(c.ultimaCompra, hj) < 30;
    }).length;

    const emRisco = clientes.filter(c => {
      if (!c.ultimaCompra) return false;
      const d = diffDias(c.ultimaCompra, hj);
      return d >= 30 && d <= 180;
    }).length;

    const ligacoes = (state.ligacoes || []).filter(l => 
      l.vendedor === v.id && l.data && l.data.startsWith(prefix)
    ).length;

    return { v, calc, carteiraTotal, ativos, emRisco, ligacoes };
  });

  dadosVendedores.sort((x, y) => (x.calc.pctMeta || 0) - (y.calc.pctMeta || 0));

  container.innerHTML = dadosVendedores.map(d => {
    const pct = d.calc.pctMeta || 0;
    const isAbaixo = d.calc.faturado < d.calc.ritmoEsperado;
    
    let statusBadge = '<span class="badge ok">No ritmo</span>';
    if (pct === 0) statusBadge = '<span class="badge neutral">Sem dados</span>';
    else if (isAbaixo) statusBadge = '<span class="badge danger">Abaixo</span>';

    const barraCls = isAbaixo ? 'vermelho' : 'verde';
    const iniciais = d.v.nome.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();

    return `
      <div class="card-vendedor" onclick="window._abrirFichaVendedor('${d.v.id}')" style="cursor:pointer; transition: transform 0.1s;" onmouseover="this.style.transform='scale(1.01)'" onmouseout="this.style.transform='scale(1)'">
        <div class="cv-header">
          <div style="display:flex; align-items:center;">
            <div class="cv-avatar">${iniciais}</div>
            <div class="cv-nome">${escapeHtml(d.v.nome)}</div>
          </div>
          ${statusBadge}
        </div>

        <div class="cv-fat">${fmtBRL(d.calc.faturado)}</div>
        <div class="cv-meta-txt">${pct.toFixed(0)}% de ${fmtBRL(d.calc.meta)}</div>
        
        <div class="tabela-barra-bg" style="height:6px; margin-bottom: 24px;">
          <div class="tabela-barra-fill ${barraCls}" style="width: ${Math.min(100, pct)}%"></div>
        </div>

        <div class="cv-stats">
          <div>
            <div class="cv-stat-l">CARTEIRA</div>
            <div class="cv-stat-v">${d.carteiraTotal}</div>
          </div>
          <div>
            <div class="cv-stat-l">ATIVOS</div>
            <div class="cv-stat-v">${d.ativos}</div>
          </div>
          <div>
            <div class="cv-stat-l">EM RISCO</div>
            <div class="cv-stat-v" style="${d.emRisco > 0 ? 'color:var(--af-vermelho)' : ''}">${d.emRisco}</div>
          </div>
          <div>
            <div class="cv-stat-l">LIGAÇÕES</div>
            <div class="cv-stat-v">${d.ligacoes}</div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ============================================================
// FICHA DETALHADA DO VENDEDOR (MODAL)
// ============================================================

window._abrirFichaVendedor = function(vendedorId) {
  const v = state.vendedores.find(x => x.id === vendedorId);
  if (!v) return;

  const ref = mesRefAtual(ui.escopoAtual);
  const calc = calcVendedor(v, ref.ano, ref.mes);
  const hj = isoDate(new Date());
  const pct = calc.pctMeta || 0;
  const isAbaixo = calc.faturado < calc.ritmoEsperado;

  // Dados para a ficha
  const clientesDoVendedor = state.clientes.filter(c => c.vendedor === v.id);

  const topClientes = clientesDoVendedor
    .sort((a, b) => (b.valorMedioMensal || 0) - (a.valorMedioMensal || 0))
    .slice(0, 5);

  const clientesRisco = clientesDoVendedor
    .filter(c => {
      if (!c.ultimaCompra) return false;
      const d = diffDias(c.ultimaCompra, hj);
      return d >= 30 && d <= 180;
    })
    .sort((a, b) => (b.valorMedioMensal || 0) - (a.valorMedioMensal || 0))
    .slice(0, 5);

  let html = `
    <div class="ficha-header">
      <div>
        <h2>${escapeHtml(v.nome)}</h2>
        <p>Ficha do vendedor · ${pct.toFixed(0)}% da meta atingida</p>
      </div>
      <button class="btn" onclick="document.getElementById('ficha-vendedor-modal').classList.remove('show')">Fechar</button>
    </div>

    <div class="ficha-body">
      
      <div class="ficha-kpi-row">
        <div class="ficha-kpi-box">
          <div class="lbl">FATURADO NO MÊS</div>
          <div class="val">${fmtBRL(calc.faturado)}</div>
        </div>
        <div class="ficha-kpi-box">
          <div class="lbl">META</div>
          <div class="val" style="color: var(--af-t2)">${fmtBRL(calc.meta)}</div>
        </div>
        <div class="ficha-kpi-box">
          <div class="lbl">PRECISA/DIA</div>
          <div class="val ${isAbaixo ? 'vermelho' : ''}" style="${isAbaixo ? 'color:var(--af-vermelho)' : ''}">${fmtBRL(calc.metaDia)}</div>
        </div>
      </div>

      <!-- Coluna 1: Melhores Clientes -->
      <div>
        <div class="ficha-section-title">
          <span>🏆 Melhores Clientes Ativos</span>
        </div>
        <div class="ficha-lista">
          ${topClientes.length === 0 ? '<div style="padding:16px; color:#888; font-size:13px;">Nenhum cliente ativo.</div>' : ''}
          ${topClientes.map(c => `
            <div class="ficha-lista-item">
              <div>
                <div class="nome">${escapeHtml(c.nome)}</div>
                <div class="detalhe">Última: ${c.ultimaCompra ? c.ultimaCompra.split('-').reverse().join('/') : '—'}</div>
              </div>
              <div class="valor">${fmtBRL(c.valorMedioMensal || 0)}</div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Coluna 2: Clientes em Risco -->
      <div>
        <div class="ficha-section-title">
          <span>⚠️ Clientes para Recuperar</span>
        </div>
        <div class="ficha-lista">
          ${clientesRisco.length === 0 ? '<div style="padding:16px; color:#888; font-size:13px;">Tudo em ordem!</div>' : ''}
          ${clientesRisco.map(c => {
            const dias = diffDias(c.ultimaCompra, hj);
            return `
            <div class="ficha-lista-item">
              <div>
                <div class="nome">${escapeHtml(c.nome)}</div>
                <div class="detalhe" style="color:var(--af-vermelho); font-weight:600;">${dias} dias sem comprar</div>
              </div>
              <div class="valor">${fmtBRL(c.valorMedioMensal || 0)}</div>
            </div>
          `}).join('')}
        </div>
      </div>

    </div>
  `;

  let modal = document.getElementById('ficha-vendedor-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'ficha-vendedor-modal';
    modal.className = 'modal modal-ficha';
    modal.innerHTML = '<div class="modal-content"></div>';
    document.body.appendChild(modal);
  }
  
  modal.querySelector('.modal-content').innerHTML = html;
  modal.classList.add('show');

  // Fechar ao clicar fora
  modal.onclick = e => { 
    if (e.target.id === 'ficha-vendedor-modal') modal.classList.remove('show'); 
  };
};