// admin/js/lista.js
// Motor das listas do admin (artigos e reviews): filtro por status e categoria,
// busca pelo título, paginação e exclusão (só para administradores).
// Cada página (artigos.js, reviews.js) só diz o que listar.

import { supabase } from '../../js/supabase.js';
import { isAdmin } from '../../js/auth.js';
import {
  escapeHtml,
  scoreBadge,
  emptyState,
  errorState,
  renderPagination,
  getParam,
  setUrlParams,
  debounce,
} from '../../js/utils.js';
import { initAdminLayout, statusBadge } from './layout.js';

const PAGE_SIZE = 20;

const STATUS_FILTERS = [
  { value: '', label: 'Todos' },
  { value: 'published', label: 'Publicados' },
  { value: 'scheduled', label: 'Agendados' },
  { value: 'draft', label: 'Rascunhos' },
  { value: 'review', label: 'Em revisão' },
  { value: 'archived', label: 'Arquivados' },
];

const numberFormat = new Intl.NumberFormat('pt-BR');
const dateTimeFormat = new Intl.DateTimeFormat('pt-BR', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

// ---------- Ajudantes ----------
// Remove caracteres que atrapalhariam a busca
function cleanTerm(text) {
  return String(text ?? '').replace(/[,()*%\\"]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
}

// Agendado com a data já vencida é conteúdo que já está no ar: conta como publicado
function effectiveStatus(item, now) {
  const due = item.published_at && new Date(item.published_at).getTime() <= now;
  return item.status === 'scheduled' && due ? 'published' : item.status;
}

// Aplica o filtro de status (levando em conta o agendamento vencido)
function applyStatusFilter(query, status) {
  const nowIso = new Date().toISOString().split('.')[0] + 'Z';
  switch (status) {
    case 'published':
      return query.or('status.eq.published,and(status.eq.scheduled,published_at.lte.' + nowIso + ')');
    case 'scheduled':
      return query.eq('status', 'scheduled').gt('published_at', nowIso);
    case 'draft':
    case 'review':
    case 'archived':
      return query.eq('status', status);
    default:
      return query;
  }
}

// ---------- Colunas da tabela ----------
const HEADERS = {
  title: 'Título',
  category: 'Categoria',
  author: 'Autor',
  score: 'Nota',
  status: 'Status',
  published: 'Publicação',
  views: 'Views',
  actions: '<span class="visually-hidden">Ações</span>',
};

function cell(key, item, ctx) {
  const id = encodeURIComponent(item.id);
  const title = escapeHtml(item.title);

  switch (key) {
    case 'title': {
      const flags = [];
      if (item.featured) flags.push('<span class="flag">Destaque</span>');
      if (item.editorial_favorite) flags.push('<span class="flag">Favorito da Redação</span>');
      return '<td class="cell-title">' +
        '<a class="cell-title__link" href="' + ctx.config.editorPage + '?id=' + id + '">' + title + '</a>' +
        '<div class="cell-title__meta"><span>/' + escapeHtml(item.slug) + '</span>' + flags.join('') + '</div>' +
      '</td>';
    }
    case 'category':
      return '<td class="cell-muted">' + escapeHtml(item.category ? item.category.name : '—') + '</td>';
    case 'author':
      return '<td class="cell-muted">' + escapeHtml(item.author ? item.author.name : '—') + '</td>';
    case 'score':
      return '<td>' + (scoreBadge(item.score) || '<span class="cell-muted">—</span>') + '</td>';
    case 'status':
      return '<td>' + statusBadge(item.status) + '</td>';
    case 'published': {
      const show = item.published_at && (item.status === 'published' || item.status === 'scheduled');
      return '<td class="cell-muted">' + (show ? dateTimeFormat.format(new Date(item.published_at)) : '—') + '</td>';
    }
    case 'views':
      return '<td class="cell-muted num">' +
        (item.status === 'published' ? numberFormat.format(item.views || 0) : '—') + '</td>';
    case 'actions': {
      const edit = '<a class="btn btn--ghost btn--sm" href="' + ctx.config.editorPage + '?id=' + id + '" ' +
        'aria-label="Editar ' + title + '">Editar</a>';
      const view = item.status === 'published'
        ? '<a class="btn btn--ghost btn--sm" href="' + escapeHtml(ctx.config.publicUrl(item.slug)) + '" ' +
          'target="_blank" rel="noopener" aria-label="Ver no site: ' + title + '">Ver</a>'
        : '';
      const remove = ctx.canDelete
        ? '<button type="button" class="btn btn--danger btn--sm" data-delete="' + escapeHtml(item.id) + '" ' +
          'aria-label="Excluir ' + title + '">Excluir</button>'
        : '';
      return '<td><div class="cell-actions">' + edit + view + remove + '</div></td>';
    }
    default:
      return '<td></td>';
  }
}

// ---------- Início ----------
export async function initAdminList(config) {
  // Se não estiver logado ou não tiver permissão, a página já é redirecionada aqui
  const profile = await initAdminLayout({ active: config.active });
  const ctx = { config, canDelete: isAdmin(profile) };

  const $ = (id) => document.getElementById(id);
  const els = {
    status: $('filtro-status'),
    category: $('filtro-categoria'),
    search: $('busca'),
    summary: $('resultado'),
    notice: $('aviso-lista'),
    table: $('tabela'),
    pagination: $('paginacao'),
    dialog: $('dialogo-excluir'),
    dialogText: $('dialogo-texto'),
  };

  let categories = [];
  let requestId = 0;
  let shownItems = [];
  let pendingDelete = null;

  // O estado vem da URL, então links e o botão "voltar" funcionam
  const statusParam = getParam('status') || '';
  const state = {
    page: Math.max(1, parseInt(getParam('page'), 10) || 1),
    status: STATUS_FILTERS.some((f) => f.value === statusParam) ? statusParam : '',
    category: getParam('categoria') || '',
    q: (getParam('q') || '').trim(),
  };

  // ---------- Avisos ----------
  function notice(text, type) {
    if (!text) { els.notice.hidden = true; return; }
    els.notice.className = 'message' + (type ? ' message--' + type : '');
    els.notice.textContent = text;
    els.notice.hidden = false;
  }

  // ---------- Controles ----------
  function renderStatusChips() {
    els.status.innerHTML = STATUS_FILTERS.map((filter) => {
      const active = filter.value === state.status;
      return '<button type="button" class="chip' + (active ? ' is-active' : '') + '" ' +
        'data-status="' + filter.value + '" aria-pressed="' + active + '">' + filter.label + '</button>';
    }).join('');
  }

  function renderCategorySelect() {
    els.category.innerHTML =
      '<option value="">Todas as categorias</option>' +
      categories.map((c) =>
        '<option value="' + escapeHtml(c.slug) + '">' + escapeHtml(c.name) + '</option>').join('');
    els.category.value = state.category;
  }

  function syncControls() {
    renderStatusChips();
    els.category.value = state.category;
    els.search.value = state.q;
  }

  function syncUrl() {
    setUrlParams({
      page: state.page > 1 ? state.page : null,
      status: state.status || null,
      categoria: state.category || null,
      q: state.q || null,
    });
  }

  function apply() {
    syncUrl();
    syncControls();
    load();
  }

  // ---------- Carregar a lista ----------
  async function load(isRetry = false) {
    const current = ++requestId;
    els.table.innerHTML = '<div class="skeleton" style="height:3.2rem;margin-bottom:0.5rem" aria-hidden="true"></div>'.repeat(6);
    els.summary.textContent = '';
    els.pagination.innerHTML = '';

    let query = supabase.from(config.table).select(config.select, { count: 'exact' });
    query = applyStatusFilter(query, state.status);

    const category = categories.find((c) => c.slug === state.category);
    if (category) query = query.eq('category_id', category.id);

    const term = cleanTerm(state.q);
    if (term) query = query.ilike('title', '%' + term + '%');

    const from = (state.page - 1) * PAGE_SIZE;
    query = query.order('updated_at', { ascending: false }).range(from, from + PAGE_SIZE - 1);

    const { data, error, count } = await query;
    if (current !== requestId) return; // chegou uma resposta mais nova, ignora esta

    if (error) {
      // Página além do fim (ex.: ?page=99): volta para a primeira
      if (error.code === 'PGRST103' && state.page > 1 && !isRetry) {
        state.page = 1;
        syncUrl();
        return load(true);
      }
      console.error('Erro ao carregar a lista:', error);
      els.table.innerHTML = errorState();
      return;
    }

    const now = Date.now();
    shownItems = (data || []).map((item) => ({ ...item, status: effectiveStatus(item, now) }));

    if (shownItems.length === 0) {
      const filtered = Boolean(state.status || state.category || state.q);
      els.table.innerHTML = filtered
        ? emptyState('Nada encontrado', 'Tente outros termos ou remova os filtros.')
        : emptyState(config.texts.emptyTitle, config.texts.emptyText) +
          '<p class="empty-state"><a class="btn" href="' + config.editorPage + '">' + config.texts.createLabel + '</a></p>';
      return;
    }

    const head = config.columns.map((key) => '<th scope="col">' + HEADERS[key] + '</th>').join('');
    const rows = shownItems.map((item) =>
      '<tr>' + config.columns.map((key) => cell(key, item, ctx)).join('') + '</tr>').join('');

    els.table.innerHTML =
      '<div class="table-wrap"><table class="table">' +
        '<thead><tr>' + head + '</tr></thead><tbody>' + rows + '</tbody>' +
      '</table></div>';

    const total = count ?? shownItems.length;
    els.summary.textContent = numberFormat.format(total) + ' ' + (total === 1 ? config.texts.singular : config.texts.plural);

    renderPagination(els.pagination, state.page, Math.ceil(total / PAGE_SIZE), (page) => {
      state.page = page;
      apply();
      els.summary.scrollIntoView({ block: 'start' });
    });
  }

  // ---------- Exclusão ----------
  async function deleteItem(item) {
    notice('Excluindo...', '');

    // .select() devolve as linhas apagadas: lista vazia significa que o banco bloqueou
    const { data, error } = await supabase.from(config.table).delete().eq('id', item.id).select('id');

    if (error) {
      console.error('Erro ao excluir:', error);
      notice('Não foi possível excluir. Tente novamente.', 'error');
      return;
    }
    if (!data || data.length === 0) {
      notice('Não foi possível excluir. Só administradores podem excluir conteúdo.', 'error');
      return;
    }

    notice(config.texts.deleteDone, 'success');
    if (shownItems.length === 1 && state.page > 1) state.page -= 1;
    apply();
  }

  els.table.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-delete]');
    if (!button) return;
    const item = shownItems.find((i) => i.id === button.dataset.delete);
    if (!item) return;

    pendingDelete = item;
    els.dialogText.textContent =
      '“' + item.title + '” será excluído de forma permanente. Essa ação não pode ser desfeita.';
    els.dialog.returnValue = '';
    els.dialog.showModal();
  });

  els.dialog.addEventListener('close', () => {
    const item = pendingDelete;
    pendingDelete = null;
    if (item && els.dialog.returnValue === 'confirm') deleteItem(item);
  });

  // ---------- Filtros ----------
  els.status.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-status]');
    if (!button) return;
    state.status = button.dataset.status;
    state.page = 1;
    apply();
  });

  els.category.addEventListener('change', () => {
    state.category = els.category.value;
    state.page = 1;
    apply();
  });

  els.search.addEventListener('input', debounce(() => {
    const value = els.search.value.trim();
    if (value === state.q) return;
    state.q = value;
    state.page = 1;
    syncUrl();
    load();
  }));

  // ---------- Início ----------
  const { data } = await supabase.from('categories').select('id, name, slug').order('name');
  categories = data || [];
  if (state.category && !categories.some((c) => c.slug === state.category)) state.category = '';
  renderCategorySelect();
  syncControls();
  load();
}