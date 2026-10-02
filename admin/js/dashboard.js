// admin/js/dashboard.js
// Dashboard do painel: números gerais, itens editados recentemente
// e próximas publicações agendadas.

import { supabase } from '../../js/supabase.js';
import { escapeHtml, emptyState, errorState } from '../../js/utils.js';
import { initAdminLayout, statusBadge, timeAgo } from './layout.js';

const MAX_ROWS = 1000; // limite de linhas que o Supabase devolve por consulta
const RECENT_SHOWN = 8;
const UPCOMING_SHOWN = 5;

const $ = (id) => document.getElementById(id);
const numberFormat = new Intl.NumberFormat('pt-BR');
const dateTimeFormat = new Intl.DateTimeFormat('pt-BR', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

const profile = await initAdminLayout({ active: 'dashboard' });

$('saudacao').textContent = 'Olá, ' + (profile.name || profile.email) + '. Este é o resumo do site.';

if (new URLSearchParams(window.location.search).get('aviso') === 'restrito') {
  $('aviso').hidden = false;
}

// ---------- Ajudantes ----------
const plural = (n, one, many) => numberFormat.format(n) + ' ' + (n === 1 ? one : many);

// Agendado com a data já vencida é conteúdo que já está no ar: conta como publicado
function effectiveStatus(item, now) {
  const due = item.published_at && new Date(item.published_at).getTime() <= now;
  return item.status === 'scheduled' && due ? 'published' : item.status;
}

function statCard(label, value, detail) {
  return '<div class="stat">' +
    '<p class="stat__label">' + label + '</p>' +
    '<p class="stat__value">' + numberFormat.format(value) + '</p>' +
    '<p class="stat__detail">' + detail + '</p>' +
  '</div>';
}

function itemRow(item, metaText) {
  const isArticle = item.kind === 'article';
  const page = isArticle ? 'artigo-editor.html' : 'review-editor.html';
  return '<li class="item-list__item">' +
    '<div class="item-list__main">' +
      '<a class="item-list__title" href="' + page + '?id=' + encodeURIComponent(item.id) + '">' +
        escapeHtml(item.title) + '</a>' +
      '<span class="item-list__meta">' + (isArticle ? 'Artigo' : 'Review') + ', ' + escapeHtml(metaText) + '</span>' +
    '</div>' +
    statusBadge(item.status) +
  '</li>';
}

// ---------- Estado de carregamento ----------
function showLoading() {
  $('stats').innerHTML =
    '<div class="skeleton" style="height:6.5rem" aria-hidden="true"></div>'.repeat(6);
  const lines = '<div class="skeleton" style="height:2.6rem;margin:1rem 1.5rem" aria-hidden="true"></div>'.repeat(3);
  $('recentes').innerHTML = lines;
  $('agendados').innerHTML = lines;
}

function showError() {
  $('stats').innerHTML = errorState();
  $('recentes').innerHTML = errorState();
  $('agendados').innerHTML = errorState();
}

// ---------- Início ----------
async function init() {
  showLoading();

  // Duas consultas só: os dados de todos os artigos e de todas as reviews (sem o texto)
  const fetchRows = (table) => supabase
    .from(table)
    .select('id, title, status, featured, views, published_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(MAX_ROWS);

  const [posts, reviews] = await Promise.all([fetchRows('posts'), fetchRows('reviews')]);

  if (posts.error || reviews.error) {
    console.error('Erro ao carregar o dashboard:', posts.error || reviews.error);
    showError();
    return;
  }

  const now = Date.now();
  const prepare = (rows, kind) =>
    (rows || []).map((item) => ({ ...item, kind, status: effectiveStatus(item, now) }));

  const articles = prepare(posts.data, 'article');
  const reviewItems = prepare(reviews.data, 'review');

  // ----- Números -----
  const count = (list, test) => list.filter(test).length;
  const sum = (list) => list.reduce((total, item) => total + (item.views || 0), 0);
  const byStatus = (status) => (item) => item.status === status;
  const liveFeatured = (item) => item.status === 'published' && item.featured;

  const countCard = (label, test) => {
    const a = count(articles, test);
    const r = count(reviewItems, test);
    return statCard(label, a + r, plural(a, 'artigo', 'artigos') + ', ' + plural(r, 'review', 'reviews'));
  };

  const viewsArticles = sum(articles);
  const viewsReviews = sum(reviewItems);

  $('stats').innerHTML =
    countCard('Publicados', byStatus('published')) +
    countCard('Agendados', byStatus('scheduled')) +
    countCard('Rascunhos', byStatus('draft')) +
    countCard('Em revisão', byStatus('review')) +
    countCard('Destaques', liveFeatured) +
    statCard('Visualizações', viewsArticles + viewsReviews,
      numberFormat.format(viewsArticles) + ' em artigos, ' + numberFormat.format(viewsReviews) + ' em reviews');

  if (articles.length >= MAX_ROWS || reviewItems.length >= MAX_ROWS) {
    $('aviso-limite').hidden = false;
  }

  // ----- Editados recentemente -----
  const all = articles.concat(reviewItems);
  const recent = [...all]
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
    .slice(0, RECENT_SHOWN);

  $('recentes').innerHTML = recent.length
    ? '<ul class="item-list">' +
        recent.map((item) => itemRow(item, 'editado ' + timeAgo(item.updated_at))).join('') +
      '</ul>'
    : emptyState('Nada por aqui ainda', 'Os itens que você criar ou editar aparecem aqui.');

  // ----- Próximas publicações -----
  const upcoming = all
    .filter((item) => item.status === 'scheduled')
    .sort((a, b) => new Date(a.published_at) - new Date(b.published_at))
    .slice(0, UPCOMING_SHOWN);

  $('agendados').innerHTML = upcoming.length
    ? '<ul class="item-list">' +
        upcoming.map((item) =>
          itemRow(item, 'sai em ' + dateTimeFormat.format(new Date(item.published_at)))).join('') +
      '</ul>'
    : emptyState('Nada agendado', 'Itens agendados aparecem aqui, do mais próximo ao mais distante.');
}

init();