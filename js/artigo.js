// js/artigo.js
// Página de um artigo: artigo.html?slug=nome-do-artigo

import { supabase, imageUrl } from './supabase.js';
import {
  POST_CARD_SELECT,
  onlyPublic,
  articleCard,
  authorUrl,
  categoryUrl,
  formatDate,
  escapeHtml,
  getParam,
  emptyState,
  errorState,
} from './utils.js';
import { renderMarkdown, readingTime, setPageMeta, countView } from './conteudo.js';

const root = document.getElementById('artigo');
const FULL_SELECT =
  '*, category:categories(name, slug), author:profiles(name, slug, avatar_url), ' +
  'post_tags(tag:tags(name, slug))';

// ---------- Estados ----------
function showLoading() {
  root.innerHTML =
    '<div class="container container--narrow article-header" aria-hidden="true">' +
      '<div class="skeleton" style="height:0.9rem;width:20%"></div>' +
      '<div class="skeleton" style="height:3rem;width:90%;margin-top:1rem"></div>' +
      '<div class="skeleton" style="height:3rem;width:60%;margin-top:0.5rem"></div>' +
    '</div>';
}

function showNotFound() {
  root.setAttribute('aria-busy', 'false');
  root.innerHTML =
    '<div class="container container--narrow section">' +
      emptyState('Artigo não encontrado',
        'O endereço pode estar errado ou o artigo ainda não foi publicado.') +
      '<p class="empty-state"><a class="btn btn--ghost" href="artigos.html">Ver todos os artigos</a></p>' +
    '</div>';
  setPageMeta({ title: 'Artigo não encontrado' });
}

function showError() {
  root.setAttribute('aria-busy', 'false');
  root.innerHTML = '<div class="container container--narrow section">' + errorState() + '</div>';
}

// ---------- Montar o artigo ----------
function render(post) {
  const category = post.category;
  const author = post.author;
  const tags = (post.post_tags || []).map((row) => row.tag).filter(Boolean);

  const categoryLink = category
    ? '<a class="article-header__category" href="' + escapeHtml(categoryUrl(category.slug)) + '">' +
      escapeHtml(category.name) + '</a>'
    : '';

  const excerpt = post.excerpt
    ? '<p class="article-excerpt">' + escapeHtml(post.excerpt) + '</p>'
    : '';

  const avatar = author && author.avatar_url
    ? '<img class="byline__avatar" src="' + escapeHtml(imageUrl(author.avatar_url)) + '" alt="">'
    : '';
  const authorName = author
    ? '<a class="byline__name" href="' + escapeHtml(authorUrl(author.slug)) + '">' +
      escapeHtml(author.name) + '</a>'
    : '';
  const dateText = [formatDate(post.published_at), readingTime(post.content)]
    .filter(Boolean).join(', ');

  const cover = post.cover_image
    ? '<figure class="container article-cover"><img src="' +
      escapeHtml(imageUrl(post.cover_image)) + '" alt=""></figure>'
    : '';

  const tagList = tags.length
    ? '<div class="tags" aria-label="Tags">' +
      tags.map((tag) => '<span class="tag">' + escapeHtml(tag.name) + '</span>').join('') +
      '</div>'
    : '';

  root.setAttribute('aria-busy', 'false');
  root.innerHTML =
    '<header class="container container--narrow article-header">' +
      categoryLink +
      '<h1 class="article-title">' + escapeHtml(post.title) + '</h1>' +
      excerpt +
      '<div class="byline">' + avatar +
        '<div class="byline__text">' + authorName +
          '<time class="byline__date" datetime="' + escapeHtml(post.published_at || '') + '">' +
            escapeHtml(dateText) + '</time>' +
        '</div>' +
      '</div>' +
    '</header>' +
    cover +
    '<div class="container container--narrow">' +
      '<div class="prose">' + renderMarkdown(post.content) + '</div>' +
      tagList +
    '</div>';

  setPageMeta({
    title: post.seo_title || post.title,
    description: post.seo_description || post.excerpt,
    image: post.cover_image,
    type: 'article',
  });
}

// ---------- "Leia também" ----------
async function loadRelated(post) {
  const box = document.getElementById('relacionados');
  const list = document.getElementById('lista-relacionados');
  if (!box || !list) return;

  try {
    let items = [];

    if (post.category_id) {
      const { data } = await onlyPublic(supabase.from('posts').select(POST_CARD_SELECT))
        .eq('category_id', post.category_id)
        .neq('id', post.id)
        .order('published_at', { ascending: false })
        .limit(3);
      items = data || [];
    }

    // Se a categoria tem poucos artigos, completa com os mais recentes
    if (items.length < 3) {
      const { data } = await onlyPublic(supabase.from('posts').select(POST_CARD_SELECT))
        .neq('id', post.id)
        .order('published_at', { ascending: false })
        .limit(6);
      const already = new Set(items.map((item) => item.id));
      (data || []).forEach((item) => {
        if (items.length < 3 && !already.has(item.id)) items.push(item);
      });
    }

    if (items.length === 0) return;
    list.innerHTML = items.map((item) => articleCard(item)).join('');
    box.hidden = false;
  } catch (error) {
    console.error('Erro ao carregar artigos relacionados:', error);
  }
}

// ---------- Início ----------
async function init() {
  const slug = getParam('slug');
  if (!slug) { showNotFound(); return; }

  showLoading();

  const { data: post, error } = await onlyPublic(supabase.from('posts').select(FULL_SELECT))
    .eq('slug', slug)
    .maybeSingle();

  if (error) {
    console.error('Erro ao carregar o artigo:', error);
    showError();
    return;
  }
  if (!post) { showNotFound(); return; }

  render(post);
  countView('posts', slug);
  loadRelated(post);
}

init();