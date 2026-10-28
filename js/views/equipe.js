// ============================================================
// views/equipe.js — Cards de Vendedores (Visão Diretor)
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

  // Filtra apenas vendedores reais (tira adm, jucilene, etc.)
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

  // Ordena por quem está mais abaixo da meta (para o diretor dar atenção primeiro)
  const dadosVendedores = vendedores.map(v => {
    const calc = calcVendedor(v, a, m);
    
    // Métricas da Carteira
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

    // Ligações no mês
    const ligacoes = (state.ligacoes || []).filter(l => 
      l.vendedor === v.id && l.data && l.data.startsWith(prefix)
    ).length;

    return { v, calc, carteiraTotal, ativos, emRisco, ligacoes };
  });

  // Ordena do pior % de meta para o melhor (para focar em quem precisa de ajuda)
  dadosVendedores.sort((x, y) => (x.calc.pctMeta || 0) - (y.calc.pctMeta || 0));

  container.innerHTML = dadosVendedores.map(d => {
    const pct = d.calc.pctMeta || 0;
    const isAbaixo = d.calc.faturado < d.calc.ritmoEsperado;
    
    let statusBadge = '<span class="badge ok">No ritmo</span>';
    if (pct === 0) statusBadge = '<span class="badge neutral">Sem dados</span>';
    else if (isAbaixo) statusBadge = '<span class="badge danger">Abaixo</span>';

    const barraCls = isAbaixo ? 'vermelho' : 'verde';
    
    // Iniciais do nome para o Avatar
    const iniciais = d.v.nome.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();

    return `
      <div class="card-vendedor">
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
            <div class="cv-stat-v ${d.emRisco > 0 ? 'vermelho' : ''}" style="${d.emRisco > 0 ? 'color:var(--af-vermelho)' : ''}">${d.emRisco}</div>
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