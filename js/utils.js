// ============================================================
// utils.js — Funções auxiliares (sem dependência de estado)
// ============================================================

export function toast(m, ms) {
  const e = document.getElementById('toast');
  if (!e) return;
  e.textContent = m;
  e.classList.add('show');
  clearTimeout(e._t);
  e._t = setTimeout(() => e.classList.remove('show'), ms || 2500);
}

export function fmtBRL(v) {
  if (v == null || isNaN(v)) return '—';
  return 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtNum(v, d) {
  if (v == null || isNaN(v)) return '—';
  const x = d == null ? 0 : d;
  return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: x, maximumFractionDigits: x });
}

export function fmtPct(v, d) {
  if (v == null || isNaN(v)) return '—';
  const x = d == null ? 1 : d;
  return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: x, maximumFractionDigits: x }) + '%';
}

export function parseValorBR(s) {
  if (s == null) return NaN;
  if (typeof s === 'number') return s;
  let str = String(s).replace(/[R$\s%]/g, '').trim();
  if (!str) return NaN;
  if (str.indexOf(',') >= 0) str = str.replace(/\./g, '').replace(',', '.');
  return parseFloat(str);
}

export function isoDate(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

export function fmtDataBR(iso) {
  if (!iso) return '—';
  const p = iso.split('-');
  return p[2] + '/' + p[1] + '/' + p[0];
}

export function inicioSemana(d) {
  const dt = new Date(d);
  const dw = dt.getDay();
  const diff = dw === 0 ? -6 : 1 - dw;
  dt.setDate(dt.getDate() + diff);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

export function diffDias(a, b) {
  if (!a || !b) return 0;
  return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
}

export function tsCurto(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function normalizarNomeCliente(n) {
  return String(n || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[.,;:\-()\/\\'`"]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

export function ehProdutoValido(p) {
  return p && p.descricao && p.descricao.trim() !== '' && p.descricao.trim() !== '—' && p.descricao.trim() !== '-';
}

export function deltaCellHTML(pct) {
  if (pct == null) return '<span class="delta-neu">—</span>';
  const cls = pct >= 2 ? 'delta-pos' : pct <= -2 ? 'delta-neg' : 'delta-neu';
  const arrow = pct >= 2 ? '▲' : pct <= -2 ? '▼' : '▬';
  return '<span class="' + cls + '">' + arrow + ' ' + fmtPct(pct, 1) + '</span>';
}

export function badgeSuspeito(tooltip) {
  if (!tooltip) return '';
  return '<span class="badge-suspeito" title="' + escapeHtml(tooltip) + '">⚠</span>';
}

export function copiarTexto(t) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(t).then(() => toast('✓ Copiado!')).catch(() => fallbackCopy(t));
  } else {
    fallbackCopy(t);
  }
}

function fallbackCopy(t) {
  const ta = document.createElement('textarea');
  ta.value = t;
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
    toast('✓ Copiado!');
  } catch (e) {}
  document.body.removeChild(ta);
}