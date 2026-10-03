// ============================================================
// state.js — Estado global + persistência em localStorage
// ============================================================

import { isoDate } from './utils.js';

export const STORAGE_KEY = 'altafix_v20';
export const BACKUP_KEY = 'altafix_backups';
export const MAX_BACKUPS = 3;

export const MESES = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'
];

export const FERIADOS_DEFAULT = [
  '01-01','04-21','05-01','09-07','10-12','11-02','11-15','11-20','12-25','08-15','04-05'
];

export const CONFIG_DEFAULT = {
  metaPedidosDia: 370,
  tetoDesconto: 10,
  feriados: FERIADOS_DEFAULT.slice()
};

// ---------- Dados de negócio ----------
export const state = {
  filiais: [],
  grupos: [],
  vendedores: [],
  config: {},
  lancamentos: [],
  clientes: [],
  produtos: [],
  comparativo: [],
  cidades: [],
  metas: [],
  produtosMes: [],
  clientesImportacoes: [],
  vendasItens: [],
  ligacoes: [],
  ligacoesVendas: [],
  acoesTratadas: {},
  _historico: {},
  _produtosSnap: null,
  _produtosHistorico: {},
  saude: null
};

// ---------- Estado de UI (transitório, não persiste) ----------
export const ui = {
  semanaRef: new Date(),
  diaSemanaMobile: 1,
  escopoAtual: 'ALL',
  modoVendedor: '',
  filtroCurva: 'TODAS',
  filtroTextoProd: '',
  filtroFabricante: '',
  filtroDeltaProduto: '',
  sortProduto: { campo: 'valorVendido', direcao: 'desc' },
  sortCidade: { campo: 'totalValor', direcao: 'desc' },
  cidadesExpandidas: {},
  produtosExpandidos: {},
  mesCidadesSelecionado: '',
  mesPainelSelecionado: '',
  mesVendedoresSelecionado: '',
  filtroClienteBusca: '',
  filtroClienteVend: '',
  filtroClienteCidade: '',
  filtroClienteStatus: 'ativos',
  filtroClienteRFM: '',
  filtroClientePeriodo: 'tudo',
  filtroClienteDataIni: '',
  filtroClienteDataFim: '',
  filtroClienteABC: '',
  filtroCidadeBusca: '',
  filtroCidadeVend: '',
  filtroCompVendedor: '',
  filtroLigUrgencia: '',
  simuladorCenario: {},
  charts: {}
};

// ---------- Sessão Supabase ----------
export const session = {
  sb: null,
  user: null,
  vendedor: null,
  pronto: false
};

// ---------- Preview de importação (transitório) ----------
export const basesPreview = {
  clientes: null,
  produtos: null,
  comparativo: null,
  cidades: null,
  estoqueABC: null,
  abcPeriodoInicio: null,
  abcPeriodoFim: null,
  vendasItens: null,
  mesVendasItens: null,
  lancamentosMulti: null,
  dataInicio: null,
  dataFim: null,
  periodoTexto: null,
  periodoInicio: null,
  periodoFim: null,
  filialImport: null,
  vendedoresNaoIdentificados: {},
  _mesesImport: null,
  _mesesABC: null
};

// ============================================================
// localStorage — cache de leitura/escrita
// ============================================================

export function carregar() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      state.config = JSON.parse(JSON.stringify(CONFIG_DEFAULT));
      return;
    }
    const p = JSON.parse(raw);
    state.config = Object.assign({}, CONFIG_DEFAULT, p.config || {});
    if (!state.config.feriados) state.config.feriados = FERIADOS_DEFAULT.slice();
    if (p.cidades) state.cidades = p.cidades;
    if (p.comparativo) state.comparativo = p.comparativo;
  } catch (e) {
    state.config = JSON.parse(JSON.stringify(CONFIG_DEFAULT));
  }
}

export function salvar() {
  try {
    const payload = {
      config: state.config,
      cidades: state.cidades,
      comparativo: state.comparativo
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    backupRotativo();
  } catch (e) {
    if (e.name === 'QuotaExceededError' || e.code === 22) {
      localStorage.removeItem(BACKUP_KEY);
    }
  }
}

function backupRotativo() {
  try {
    let bks = JSON.parse(localStorage.getItem(BACKUP_KEY) || '[]');
    const agora = Date.now();
    if (bks.length > 0 && (agora - bks[0].ts) < 4 * 60 * 60 * 1000) return;
    const snap = {
      ts: agora,
      data: new Date(agora).toLocaleString('pt-BR'),
      cidades: state.cidades.length,
      state: JSON.stringify({
        config: state.config,
        cidades: state.cidades,
        comparativo: state.comparativo
      })
    };
    bks.unshift(snap);
    if (bks.length > MAX_BACKUPS) bks = bks.slice(0, MAX_BACKUPS);
    localStorage.setItem(BACKUP_KEY, JSON.stringify(bks));
  } catch (e) {
    if (e.name === 'QuotaExceededError' || e.code === 22) {
      localStorage.removeItem(BACKUP_KEY);
    }
  }
}