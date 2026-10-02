// js/utils.js
// Funções compartilhadas pelo site público e pelo painel admin:
// datas, notas, slugs, cards, paginação e mensagens de estado.

import { imageUrl } from './supabase.js';

// ---------- Campos que as listagens pedem ao Supabase ----------
// Use nas consultas para o card receber exatamente os dados de que precisa.
// category e author vêm das tabelas ligadas (categories e profiles).
export const POST_CARD_SELECT =
  'id, title, slug, excerpt, cover_image, published_at, views, featured, ' +
  'category:categories(name, slug), author:profiles(name, slug)';

export const REVIEW_CARD_SELECT =
  'id, title, slug, excerpt, cover_image, published_at, views, featured, ' +
  'score, editorial_favorite, ' +
  'category:categories(name, slug), author:profiles(name, slug)';

// ---------- Filtro de conteúdo público ----------
// IMPORTANTE: se você estiver logado como admin/editor, o banco libera
// rascunhos para você. Este filtro garante que o site público nunca os mostre.
export function onlyPublic(query) {
  return query
    .in('status', ['published', 'scheduled'])
    .not('published_at', 'is', null)
    .lte('published_at', new Date().toISOString());
}

// ---------- Texto seguro ----------
// Use sempre que colocar texto vindo do banco dentro de innerHTML.
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---------- Datas ----------
const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

// "2026-10-01T12:00:00Z" → "1 de outubro de 2026"
export function formatDate(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : dateFormatter.format(date);
}

// ---------- Slug ----------
// "Crítica: Duna — Parte 2!" → "critica-duna-parte-2"
// O resultado sempre respeita a regra do banco: letras minúsculas,
// números e hífens (sem hífen no começo, no fim ou duplicado).
export function slugify(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ---------- Nota e cor ----------
// Abaixo de 4 vermelho, de 4 até menos de 7 amarelo, 7 ou mais verde.
// (Funciona igual para notas inteiras e com decimal, como 6.5.)
export function scoreClass(score) {
  if (score === null || score === undefined || score === '') return '';
  const n = Number(score);
  if (!Number.isFinite(n)) return '';
  if (n < 4) return 'score--low';
  if (n < 7) return 'score--mid';
  return 'score--high';
}

// Texto da nota, sempre com uma casa decimal: 8 → "8.0", 7.5 → "7.5".
// Para usar vírgula (8,0), troque por: Number(score).toFixed(1).replace('.', ',')
export function formatScore(score) {
  const n = Number(score);
  return Number.isFinite(n) ? n.toFixed(1) : '';
}

// Círculo colorido com a nota. { large: true } para a página da review.
export function scoreBadge(score, { large = false } = {}) {
  if (score === null || score === undefined || score === '') return '';
  const text = formatScore(score);
  if (!text) return '';
  const cls = ['score', scoreClass(score), large ? 'score--lg' : ''].filter(Boolean).join(' ');
  const max = large ? '<span class="score__max">/10</span>' : '';
  return '<span class="' + cls + '" aria-label="Nota ' + escapeHtml(text) + ' de 10">' +
    escapeHtml(text) + max + '</span>';
}

export function favoriteSeal() {
  return '<span class="seal">Favorito da Redação</span>';
}

// ---------- Formato da capa das reviews ----------
// Álbuns (categoria Música) têm capa quadrada, 1:1. Filmes, séries e o resto, pôster 2:3.
// Para tratar outra categoria como quadrada, acrescente o endereço dela na lista.
export const SQUARE_COVER_CATEGORIES = ['musica'];

export function coverShape(category) {
  const slug = category && category.slug;
  return SQUARE_COVER_CATEGORIES.includes(slug) ? 'square' : 'poster';
}

// ---------- Endereços das páginas ----------
export const articleUrl = (slug) => 'artigo.html?slug=' + encodeURIComponent(slug);
export const reviewUrl = (slug) => 'review.html?slug=' + encodeURIComponent(slug);
export const authorUrl = (slug) => 'autor.html?slug=' + encodeURIComponent(slug);
// As páginas de categoria têm o mesmo nome do slug (musica.html, cinema.html...)
export const categoryUrl = (slug) => encodeURIComponent(slug) + '.html';

// ---------- Cards ----------
// variant: '' (padrão), 'large' (destaque grande) ou 'horizontal' (lista lateral)
function cardHtml({ href, title, excerpt, cover, category, author, date, extraClass, mediaExtras }) {
  const img = cover
    ? '<img src="' + escapeHtml(imageUrl(cover)) + '" alt="" loading="lazy">'
    : '';
  const meta = [author, date]
    .filter(Boolean)
    .map((item) => '<span>' + escapeHtml(item) + '</span>')
    .join('');

  return (
    '<a class="' + extraClass + '" href="' + escapeHtml(href) + '">' +
      '<div class="card__media">' + img + mediaExtras + '</div>' +
      '<div class="card__body">' +
        (category ? '<span class="card__category">' + escapeHtml(category) + '</span>' : '') +
        '<h3 class="card__title">' + escapeHtml(title) + '</h3>' +
        (excerpt ? '<p class="card__excerpt">' + escapeHtml(excerpt) + '</p>' : '') +
        (meta ? '<div class="card__meta">' + meta + '</div>' : '') +
      '</div>' +
    '</a>'
  );
}

export function articleCard(post, variant = '') {
  return cardHtml({
    href: articleUrl(post.slug),
    title: post.title,
    excerpt: post.excerpt,
    cover: post.cover_image,
    category: post.category?.name,
    author: post.author?.name,
    date: formatDate(post.published_at),
    extraClass: 'card' + (variant ? ' card--' + variant : ''),
    mediaExtras: '',
  });
}

export function reviewCard(review, variant = '') {
  const extras =
    scoreBadge(review.score) + (review.editorial_favorite ? favoriteSeal() : '');
  return cardHtml({
    href: reviewUrl(review.slug),
    title: review.title,
    excerpt: review.excerpt,
    cover: review.cover_image,
    category: review.category?.name,
    author: review.author?.name,
    date: formatDate(review.published_at),
    extraClass: 'card card--review card--' + coverShape(review.category) + (variant ? ' card--' + variant : ''),
    mediaExtras: extras,
  });
}

// ---------- Estados: carregando, vazio, erro ----------
export function skeletonCards(count = 6, variant = '') {
  const mediaClass = variant === 'review' ? 'card card--review' : 'card';
  const item =
    '<div class="' + mediaClass + '" aria-hidden="true">' +
      '<div class="card__media skeleton"></div>' +
      '<div class="skeleton" style="height:0.8rem;width:30%"></div>' +
      '<div class="skeleton" style="height:1.4rem;width:85%"></div>' +
      '<div class="skeleton" style="height:0.9rem;width:60%"></div>' +
    '</div>';
  return item.repeat(count);
}

export function emptyState(title, text = '') {
  return '<div class="empty-state">' +
    '<p class="empty-state__title">' + escapeHtml(title) + '</p>' +
    (text ? '<p>' + escapeHtml(text) + '</p>' : '') +
    '</div>';
}

export function errorState(text = 'Não foi possível carregar o conteúdo. Tente novamente em instantes.') {
  return '<div class="message message--error" role="alert">' + escapeHtml(text) + '</div>';
}

// ---------- Parâmetros da URL ----------
// getParam('slug') → lê ?slug=... da página atual
export function getParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

// setUrlParams({ page: 2, categoria: null }) → atualiza a URL sem recarregar.
// Valores vazios ou null removem o parâmetro.
export function setUrlParams(params) {
  const url = new URL(window.location.href);
  Object.entries(params).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') {
      url.searchParams.delete(key);
    } else {
      url.searchParams.set(key, value);
    }
  });
  window.history.replaceState({}, '', url);
}

// ---------- Paginação ----------
// Mostra: Anterior, 1 … 4 5 6 … 20, Próxima
function pageWindow(page, total) {
  const wanted = new Set([1, total, page - 1, page, page + 1]);
  const numbers = [...wanted].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const items = [];
  let previous = 0;
  numbers.forEach((n) => {
    if (n - previous > 1) items.push('gap');
    items.push(n);
    previous = n;
  });
  return items;
}

// container: o <nav class="pagination"> da página.
// onChange(novaPagina) é chamado quando a pessoa clica em um botão.
export function renderPagination(container, page, totalPages, onChange) {
  container.innerHTML = '';
  container.onclick = null;
  if (totalPages <= 1) return;

  const buttons = pageWindow(page, totalPages).map((item) => {
    if (item === 'gap') {
      return '<span class="page-btn" aria-hidden="true" style="border-color:transparent">…</span>';
    }
    const active = item === page;
    return '<button type="button" class="page-btn' + (active ? ' is-active' : '') + '" ' +
      'data-page="' + item + '"' + (active ? ' aria-current="page"' : '') + '>' + item + '</button>';
  });

  container.innerHTML =
    '<button type="button" class="page-btn" data-page="' + (page - 1) + '"' +
      (page <= 1 ? ' disabled' : '') + '>Anterior</button>' +
    buttons.join('') +
    '<button type="button" class="page-btn" data-page="' + (page + 1) + '"' +
      (page >= totalPages ? ' disabled' : '') + '>Próxima</button>';

  container.onclick = (event) => {
    const button = event.target.closest('button[data-page]');
    if (!button || button.disabled) return;
    onChange(Number(button.dataset.page));
  };
}

// ---------- Debounce ----------
// Espera a pessoa parar de digitar antes de buscar (evita uma consulta por letra).
export function debounce(fn, wait = 350) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}