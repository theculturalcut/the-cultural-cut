// js/autor.js
// Página pública de um autor: autor.html?slug=nome-do-autor

import { supabase, imageUrl } from './supabase.js';
import {
  POST_CARD_SELECT,
  REVIEW_CARD_SELECT,
  onlyPublic,
  articleCard,
  reviewCard,
  escapeHtml,
  getParam,
  emptyState,
  errorState,
} from './utils.js';

const PAGE_SIZE = 12;

const $ = (id) => document.getElementById(id);
const main = $('conteudo');
const header = $('autor-cabecalho');

// ---------- Estados ----------
function showNotFound() {
  document.title = 'Autor não encontrado | The Cultural Cut';
  main.innerHTML =
    '<div class="container section">' +
      emptyState('Autor não encontrado', 'O endereço pode estar errado ou este perfil não existe.') +
      '<p class="empty-state"><a class="btn btn--ghost" href="index.html">Voltar para a home</a></p>' +
    '</div>';
}

function showError() {
  main.innerHTML = '<div class="container section">' + errorState() + '</div>';
}

// ---------- Perfil ----------
function renderHeader(profile) {
  const name = profile.name || profile.username || 'Autor';
  const avatar = profile.avatar_url
    ? '<img class="author-hero__avatar" src="' + escapeHtml(imageUrl(profile.avatar_url)) + '" alt="">'
    : '<span class="author-hero__avatar author-hero__avatar--placeholder" aria-hidden="true">' +
      escapeHtml(name.trim().charAt(0).toUpperCase()) + '</span>';

  header.setAttribute('aria-busy', 'false');
  header.innerHTML =
    avatar +
    '<div>' +
      '<h1 class="author-hero__name">' + escapeHtml(name) + '</h1>' +
      (profile.bio ? '<p class="author-hero__bio">' + escapeHtml(profile.bio) + '</p>' : '') +
      '<p class="author-hero__stats" id="autor-stats"></p>' +
    '</div>';

  // Título da aba e descrição da página
  document.title = name + ' | The Cultural Cut';
  const description = profile.bio
    ? profile.bio.slice(0, 160)
    : 'Artigos e reviews de ' + name + ' no The Cultural Cut.';
  const meta = document.querySelector('meta[name="description"]');
  if (meta) meta.setAttribute('content', description);
}

// "8 artigos e 6 reviews"
function renderStats(articleCount, reviewCount) {
  const parts = [];
  if (articleCount) parts.push(articleCount + (articleCount === 1 ? ' artigo' : ' artigos'));
  if (reviewCount) parts.push(reviewCount + (reviewCount === 1 ? ' review' : ' reviews'));
  $('autor-stats').textContent = parts.join(' e ');
}

// ---------- Lista de conteúdo do autor (artigos ou reviews) ----------
// Mostra os primeiros itens e um botão "Mostrar mais" para carregar os próximos.
function createFeed({ table, select, build, sectionId, listId, buttonId, authorId }) {
  const section = $(sectionId);
  const list = $(listId);
  const button = $(buttonId);
  let loaded = 0;
  let total = 0;
  let busy = false;

  function fetchPage(from) {
    return onlyPublic(supabase.from(table).select(select, { count: 'exact' }))
      .eq('author_id', authorId)
      .order('published_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
  }

  async function loadMore() {
    if (busy) return;
    busy = true;
    button.disabled = true;

    const { data, error, count } = await fetchPage(loaded);

    busy = false;
    button.disabled = false;

    if (error) {
      console.error('Erro ao carregar mais itens:', error);
      button.textContent = 'Não foi possível carregar. Tentar de novo';
      return;
    }

    const items = data || [];
    list.insertAdjacentHTML('beforeend', items.map((item) => build(item)).join(''));
    loaded += items.length;
    total = count ?? total;
    button.textContent = button.dataset.label;
    button.hidden = items.length === 0 || loaded >= total;
  }

  // Devolve o total de itens (0 se não houver, null se der erro)
  async function start() {
    const { data, error, count } = await fetchPage(0);

    if (error) {
      console.error('Erro ao carregar o conteúdo do autor:', error);
      section.hidden = false;
      list.className = '';
      list.innerHTML = errorState();
      return null;
    }

    const items = data || [];
    total = count ?? items.length;
    if (items.length === 0) return 0; // sem conteúdo: a seção continua escondida

    section.hidden = false;
    list.innerHTML = items.map((item) => build(item)).join('');
    loaded = items.length;

    button.dataset.label = button.textContent;
    button.hidden = loaded >= total;
    button.addEventListener('click', loadMore);

    return total;
  }

  return { start };
}

// ---------- Início ----------
async function init() {
  const slug = getParam('slug');
  if (!slug) { showNotFound(); return; }

  header.innerHTML =
    '<div class="author-hero__avatar skeleton" aria-hidden="true"></div>' +
    '<div aria-hidden="true">' +
      '<div class="skeleton" style="height:3rem;width:16rem;max-width:100%"></div>' +
      '<div class="skeleton" style="height:1.2rem;width:22rem;max-width:100%;margin-top:1rem"></div>' +
    '</div>';

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, name, username, slug, avatar_url, bio')
    .eq('slug', slug)
    .maybeSingle();

  if (error) {
    console.error('Erro ao carregar o autor:', error);
    showError();
    return;
  }
  if (!profile) { showNotFound(); return; }

  renderHeader(profile);

  const articles = createFeed({
    table: 'posts',
    select: POST_CARD_SELECT,
    build: articleCard,
    sectionId: 'secao-artigos',
    listId: 'lista-artigos',
    buttonId: 'mais-artigos',
    authorId: profile.id,
  });

  const reviews = createFeed({
    table: 'reviews',
    select: REVIEW_CARD_SELECT,
    build: reviewCard,
    sectionId: 'secao-reviews',
    listId: 'lista-reviews',
    buttonId: 'mais-reviews',
    authorId: profile.id,
  });

  const [articleCount, reviewCount] = await Promise.all([articles.start(), reviews.start()]);

  renderStats(articleCount, reviewCount);

  if (articleCount === 0 && reviewCount === 0) {
    $('autor-vazio').innerHTML = emptyState(
      'Nenhum conteúdo publicado ainda',
      'Os artigos e as reviews deste autor aparecem aqui assim que forem publicados.'
    );
  }
}

init();