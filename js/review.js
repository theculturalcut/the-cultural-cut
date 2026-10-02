// js/review.js
// Página de uma review: review.html?slug=nome-da-review

import { supabase, imageUrl } from './supabase.js';
import {
  REVIEW_CARD_SELECT,
  onlyPublic,
  reviewCard,
  scoreBadge,
  favoriteSeal,
  authorUrl,
  categoryUrl,
  formatDate,
  escapeHtml,
  getParam,
  emptyState,
  errorState,
} from './utils.js';
import { renderMarkdown, readingTime, setPageMeta, countView } from './conteudo.js';

const root = document.getElementById('review');
const FULL_SELECT =
  '*, category:categories(name, slug), author:profiles(name, slug, avatar_url)';

// ---------- Estados ----------
function showLoading() {
  root.innerHTML =
    '<div class="container review-hero review-hero--no-cover" aria-hidden="true">' +
      '<div>' +
        '<div class="skeleton" style="height:0.9rem;width:20%"></div>' +
        '<div class="skeleton" style="height:3rem;width:70%;margin-top:1rem"></div>' +
      '</div>' +
    '</div>';
}

function showNotFound() {
  root.setAttribute('aria-busy', 'false');
  root.innerHTML =
    '<div class="container container--narrow section">' +
      emptyState('Review não encontrada',
        'O endereço pode estar errado ou a review ainda não foi publicada.') +
      '<p class="empty-state"><a class="btn btn--ghost" href="reviews.html">Ver todas as reviews</a></p>' +
    '</div>';
  setPageMeta({ title: 'Review não encontrada' });
}

function showError() {
  root.setAttribute('aria-busy', 'false');
  root.innerHTML = '<div class="container container--narrow section">' + errorState() + '</div>';
}

// ---------- Montar a review ----------
function render(review) {
  const category = review.category;
  const author = review.author;

  const categoryLink = category
    ? '<a class="article-header__category" href="' + escapeHtml(categoryUrl(category.slug)) + '">' +
      escapeHtml(category.name) + '</a>'
    : '';

  const excerpt = review.excerpt
    ? '<p class="article-excerpt">' + escapeHtml(review.excerpt) + '</p>'
    : '';

  const verdict =
    '<div class="review-verdict">' +
      scoreBadge(review.score, { large: true }) +
      (review.editorial_favorite ? favoriteSeal() : '') +
    '</div>';

  const avatar = author && author.avatar_url
    ? '<img class="byline__avatar" src="' + escapeHtml(imageUrl(author.avatar_url)) + '" alt="">'
    : '';
  const authorName = author
    ? '<a class="byline__name" href="' + escapeHtml(authorUrl(author.slug)) + '">' +
      escapeHtml(author.name) + '</a>'
    : '';
  const dateText = [formatDate(review.published_at), readingTime(review.content)]
    .filter(Boolean).join(', ');

  const cover = review.cover_image
    ? '<div class="review-hero__cover"><img src="' +
      escapeHtml(imageUrl(review.cover_image)) + '" alt=""></div>'
    : '';

  root.setAttribute('aria-busy', 'false');
  root.innerHTML =
    '<header class="container review-hero' + (cover ? '' : ' review-hero--no-cover') + '">' +
      cover +
      '<div class="review-hero__info">' +
        categoryLink +
        '<h1 class="article-title">' + escapeHtml(review.title) + '</h1>' +
        excerpt +
        verdict +
        '<div class="byline">' + avatar +
          '<div class="byline__text">' + authorName +
            '<time class="byline__date" datetime="' + escapeHtml(review.published_at || '') + '">' +
              escapeHtml(dateText) + '</time>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</header>' +
    '<div class="container">' +
      '<div class="prose">' + renderMarkdown(review.content) + '</div>' +
    '</div>';

  setPageMeta({
    title: review.seo_title || review.title,
    description: review.seo_description || review.excerpt,
    image: review.cover_image,
    type: 'article',
  });
}

// ---------- "Mais reviews" ----------
async function loadRelated(review) {
  const box = document.getElementById('relacionados');
  const list = document.getElementById('lista-relacionados');
  if (!box || !list) return;

  try {
    let items = [];

    if (review.category_id) {
      const { data } = await onlyPublic(supabase.from('reviews').select(REVIEW_CARD_SELECT))
        .eq('category_id', review.category_id)
        .neq('id', review.id)
        .order('published_at', { ascending: false })
        .limit(4);
      items = data || [];
    }

    if (items.length < 4) {
      const { data } = await onlyPublic(supabase.from('reviews').select(REVIEW_CARD_SELECT))
        .neq('id', review.id)
        .order('published_at', { ascending: false })
        .limit(8);
      const already = new Set(items.map((item) => item.id));
      (data || []).forEach((item) => {
        if (items.length < 4 && !already.has(item.id)) items.push(item);
      });
    }

    if (items.length === 0) return;
    list.innerHTML = items.map((item) => reviewCard(item)).join('');
    box.hidden = false;
  } catch (error) {
    console.error('Erro ao carregar reviews relacionadas:', error);
  }
}

// ---------- Início ----------
async function init() {
  const slug = getParam('slug');
  if (!slug) { showNotFound(); return; }

  showLoading();

  const { data: review, error } = await onlyPublic(supabase.from('reviews').select(FULL_SELECT))
    .eq('slug', slug)
    .maybeSingle();

  if (error) {
    console.error('Erro ao carregar a review:', error);
    showError();
    return;
  }
  if (!review) { showNotFound(); return; }

  render(review);
  countView('reviews', slug);
  loadRelated(review);
}

init();