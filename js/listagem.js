// js/listagem.js
// Motor das páginas de listagem (artigos e reviews): filtros, busca,
// ordenação e paginação. Cada página só diz o que listar.

import { supabase } from './supabase.js';
import {
  onlyPublic,
  emptyState,
  errorState,
  skeletonCards,
  renderPagination,
  getParam,
  setUrlParams,
  debounce,
} from './utils.js';

// Remove caracteres que quebrariam o filtro de busca do Supabase
function cleanTerm(text) {
  return String(text ?? '')
    .replace(/[,()*%\\"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

export function initListing(config) {
  const {
    table,            // 'posts' ou 'reviews'
    select,           // campos pedidos ao banco (POST_CARD_SELECT / REVIEW_CARD_SELECT)
    card,             // função que monta o card de um item
    singular,         // 'artigo'
    plural,           // 'artigos'
    emptyTitle,
    emptyText,
    pageSize = 12,
    skeletonVariant = '',
  } = config;

  const $ = (id) => document.getElementById(id);
  const els = {
    chips: $('chips'),
    search: $('busca'),
    summary: $('resultado'),
    list: $('lista'),
    pagination: $('paginacao'),
    favorites: $('favoritos'), // só existe na página de reviews
    order: $('ordem'),         // só existe na página de reviews
  };
  if (!els.list) return;

  const gridClass = els.list.className;
  let categories = [];
  let requestId = 0;

  // O estado vem da URL, então links e o botão "voltar" funcionam
  const state = {
    page: Math.max(1, parseInt(getParam('page'), 10) || 1),
    category: getParam('categoria') || '',
    q: (getParam('q') || '').trim(),
    favorites: getParam('favoritos') === '1',
    order: getParam('ordem') === 'nota' ? 'nota' : 'recentes',
  };

  // ---------- Mostrar resultados ou mensagens ----------
  function showGrid(html) {
    els.list.className = gridClass;
    els.list.innerHTML = html;
    els.list.setAttribute('aria-busy', 'false');
  }
  function showMessage(html) {
    els.list.className = '';
    els.list.innerHTML = html;
    els.list.setAttribute('aria-busy', 'false');
  }

  function hasFilters() {
    return Boolean(state.category || state.q || state.favorites);
  }

  // ---------- Controles ----------
  function renderChips() {
    if (!els.chips) return;
    const items = [{ slug: '', name: 'Todas' }].concat(categories);
    els.chips.innerHTML = items.map((item) => {
      const active = item.slug === state.category;
      return '<button type="button" class="chip' + (active ? ' is-active' : '') + '" ' +
        'data-slug="' + item.slug.replace(/"/g, '') + '" aria-pressed="' + active + '">' +
        item.name.replace(/</g, '&lt;') + '</button>';
    }).join('');
  }

  function syncControls() {
    renderChips();
    if (els.search) els.search.value = state.q;
    if (els.favorites) {
      els.favorites.classList.toggle('is-active', state.favorites);
      els.favorites.setAttribute('aria-pressed', String(state.favorites));
    }
    if (els.order) els.order.value = state.order;
  }

  function syncUrl() {
    setUrlParams({
      page: state.page > 1 ? state.page : null,
      categoria: state.category || null,
      q: state.q || null,
      favoritos: state.favorites ? '1' : null,
      ordem: state.order === 'nota' ? 'nota' : null,
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
    els.list.className = gridClass;
    els.list.innerHTML = skeletonCards(6, skeletonVariant);
    els.list.setAttribute('aria-busy', 'true');
    els.summary.textContent = '';
    els.pagination.innerHTML = '';

    let query = onlyPublic(supabase.from(table).select(select, { count: 'exact' }));

    const category = categories.find((item) => item.slug === state.category);
    if (category) query = query.eq('category_id', category.id);

    const term = cleanTerm(state.q);
    if (term) {
      query = query.or(
        'title.ilike.*' + term + '*,excerpt.ilike.*' + term + '*,content.ilike.*' + term + '*'
      );
    }

    if (els.favorites && state.favorites) query = query.eq('editorial_favorite', true);
    if (els.order && state.order === 'nota') query = query.order('score', { ascending: false });

    query = query.order('published_at', { ascending: false });

    const from = (state.page - 1) * pageSize;
    query = query.range(from, from + pageSize - 1);

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
      showMessage(errorState());
      return;
    }

    if (!data || data.length === 0) {
      showMessage(hasFilters()
        ? emptyState('Nada encontrado', 'Tente outros termos ou remova os filtros.')
        : emptyState(emptyTitle, emptyText));
      return;
    }

    showGrid(data.map((item) => card(item)).join(''));

    const total = count ?? data.length;
    els.summary.textContent =
      total + ' ' + (total === 1 ? singular : plural) + (state.q ? ' para “' + state.q + '”' : '');

    renderPagination(els.pagination, state.page, Math.ceil(total / pageSize), (page) => {
      state.page = page;
      apply();
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      els.summary.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    });
  }

  // ---------- Eventos ----------
  if (els.chips) {
    els.chips.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-slug]');
      if (!button) return;
      state.category = button.dataset.slug;
      state.page = 1;
      apply();
    });
  }

  if (els.favorites) {
    els.favorites.addEventListener('click', () => {
      state.favorites = !state.favorites;
      state.page = 1;
      apply();
    });
  }

  if (els.order) {
    els.order.addEventListener('change', () => {
      state.order = els.order.value === 'nota' ? 'nota' : 'recentes';
      state.page = 1;
      apply();
    });
  }

  if (els.search) {
    els.search.addEventListener('input', debounce(() => {
      const value = els.search.value.trim();
      if (value === state.q) return;
      state.q = value;
      state.page = 1;
      syncUrl();
      load();
    }));
  }

  // ---------- Início ----------
  (async function start() {
    const { data } = await supabase.from('categories').select('id, name, slug').order('name');
    categories = data || [];
    if (state.category && !categories.some((item) => item.slug === state.category)) {
      state.category = ''; // categoria desconhecida na URL
    }
    syncControls();
    load();
  })();
}