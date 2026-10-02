// js/blocos.js
// Blocos de página usados pela home e pelas páginas de categoria:
// carrossel de destaques, novidades, últimas reviews, "Em Alta" e "Favoritos da Redação".

import { imageUrl } from './supabase.js';
import {
  scoreBadge,
  favoriteSeal,
  coverShape,
  articleUrl,
  reviewUrl,
  escapeHtml,
  emptyState,
  errorState,
} from './utils.js';

// Passa os destaques sozinho a cada X milissegundos. 0 = desligado (recomendado).
const AUTOPLAY_MS = 0;

const ARROW_LEFT =
  '<svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 4l-6 6 6 6"/></svg>';
const ARROW_RIGHT =
  '<svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M8 4l6 6-6 6"/></svg>';

// ---------- Pedaços de HTML ----------
function coverImage(path, eager = false) {
  if (!path) return '';
  return '<img src="' + escapeHtml(imageUrl(path)) + '" alt=""' + (eager ? '' : ' loading="lazy"') + '>';
}

function skeleton(height, width = '100%') {
  return '<div class="skeleton" style="height:' + height + ';width:' + width + '" aria-hidden="true"></div>';
}

// ---------- Estado de carregamento ----------
// Passe só os elementos que a página tem: { hero, news, reviews, trending, favorites }
export function showLoading({ hero, news, reviews, trending, favorites } = {}) {
  if (hero) {
    hero.innerHTML =
      '<div class="hero-slide" aria-hidden="true">' +
        '<div class="hero-slide__media skeleton"></div>' +
        '<div>' + skeleton('3rem', '90%') + '<div style="height:0.75rem"></div>' + skeleton('1.4rem', '70%') + '</div>' +
      '</div>';
  }
  if (news) {
    const card =
      '<div class="mini-card" aria-hidden="true"><div class="mini-card__media skeleton"></div>' + skeleton('1rem', '80%') + '</div>';
    news.innerHTML = card.repeat(6);
  }
  if (reviews) {
    const tile =
      '<div class="home-review" aria-hidden="true"><div class="home-review__media skeleton"></div>' + skeleton('1.2rem', '70%') + '</div>';
    reviews.innerHTML = tile.repeat(6);
  }
  const lines = skeleton('3.5rem') + '<div style="height:0.75rem"></div>';
  if (trending) trending.innerHTML = lines.repeat(4);
  if (favorites) favorites.innerHTML = lines.repeat(2);
}

// ---------- Destaques (carrossel) ----------
function slideHtml(item, index, total) {
  const isReview = item._type === 'review';
  const url = isReview ? reviewUrl(item.slug) : articleUrl(item.slug);

  const byline = item.author && item.author.name
    ? '<p class="hero-slide__byline">por <strong>' + escapeHtml(item.author.name) + '</strong></p>'
    : '';
  const verdict = isReview
    ? '<div class="hero-slide__verdict">' + scoreBadge(item.score) +
      (item.editorial_favorite ? favoriteSeal() : '') + '</div>'
    : '';

  return '<article class="hero-slide" role="group" aria-roledescription="slide" ' +
      'aria-label="Destaque ' + (index + 1) + ' de ' + total + '">' +
    '<a class="hero-slide__media" href="' + escapeHtml(url) + '" tabindex="-1" aria-hidden="true">' +
      coverImage(item.cover_image, index === 0) +
    '</a>' +
    '<div class="hero-slide__text">' +
      '<h2 class="hero-slide__title"><a href="' + escapeHtml(url) + '">' + escapeHtml(item.title) + '</a></h2>' +
      (item.excerpt ? '<p class="hero-slide__excerpt">' + escapeHtml(item.excerpt) + '</p>' : '') +
      byline +
      verdict +
    '</div>' +
  '</article>';
}

function setupSlider(root, total) {
  const track = root.querySelector('.hero-slider__track');
  const dots = Array.from(root.querySelectorAll('.hero-dot'));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let index = 0;
  let lockUntil = 0; // enquanto o carrossel desliza sozinho, ignora o que o scroll informa
  let timer = null;

  function update() {
    dots.forEach((dot, i) => dot.setAttribute('aria-current', String(i === index)));
  }

  function sync() {
    const current = Math.round(track.scrollLeft / track.clientWidth);
    if (current !== index) { index = current; update(); }
  }

  function goTo(next) {
    index = (next + total) % total;
    lockUntil = Date.now() + 700;
    track.scrollTo({ left: track.clientWidth * index, behavior: reduceMotion ? 'auto' : 'smooth' });
    update();
    window.setTimeout(sync, 750);
  }

  // Atualiza a bolinha ativa quando a pessoa desliza com o dedo ou o trackpad
  let ticking = false;
  track.addEventListener('scroll', () => {
    if (ticking || Date.now() < lockUntil) return;
    ticking = true;
    window.requestAnimationFrame(() => { ticking = false; sync(); });
  }, { passive: true });

  root.addEventListener('click', (event) => {
    const dot = event.target.closest('.hero-dot');
    const arrow = event.target.closest('.hero-arrow');
    if (dot) goTo(Number(dot.dataset.index));
    else if (arrow) goTo(index + Number(arrow.dataset.dir));
    else return;
    stopAutoplay();
  });

  track.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight') { event.preventDefault(); goTo(index + 1); stopAutoplay(); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); goTo(index - 1); stopAutoplay(); }
  });

  // Se a janela mudar de tamanho, volta ao mesmo destaque na hora (sem deslizar)
  window.addEventListener('resize', () => {
    track.scrollTo({ left: track.clientWidth * index, behavior: 'instant' });
  });

  // Passar sozinho (desligado por padrão; pausa quando o mouse ou o foco estão no carrossel)
  function startAutoplay() {
    if (AUTOPLAY_MS <= 0 || reduceMotion || total < 2 || timer) return;
    timer = window.setInterval(() => goTo(index + 1), AUTOPLAY_MS);
  }
  function stopAutoplay() {
    if (timer) { window.clearInterval(timer); timer = null; }
  }
  root.addEventListener('pointerenter', stopAutoplay);
  root.addEventListener('focusin', stopAutoplay);
  startAutoplay();

  update();
}

// items: lista de destaques (cada um com _type 'article' ou 'review'), null se deu erro
export function renderHero(el, items) {
  if (items === null) { el.innerHTML = errorState(); return; }
  if (items.length === 0) {
    el.innerHTML = emptyState('Nenhum conteúdo publicado ainda',
      'Os destaques aparecem aqui assim que o primeiro artigo ou review for publicado.');
    return;
  }

  const total = items.length;
  const dots = items.map((item, i) =>
    '<button type="button" class="hero-dot" data-index="' + i + '" ' +
    'aria-label="Ir para o destaque ' + (i + 1) + '" aria-current="' + (i === 0) + '"></button>').join('');

  el.innerHTML =
    '<h2 class="visually-hidden">Destaques</h2>' +
    '<div class="hero-slider__track" tabindex="0" role="group" ' +
      'aria-label="Destaques. Deslize ou use as setas do teclado para ver os outros.">' +
      items.map((item, i) => slideHtml(item, i, total)).join('') +
    '</div>' +
    (total > 1
      ? '<div class="hero-slider__controls">' +
          '<button type="button" class="hero-arrow" data-dir="-1" aria-label="Destaque anterior">' + ARROW_LEFT + '</button>' +
          '<div class="hero-slider__dots">' + dots + '</div>' +
          '<button type="button" class="hero-arrow" data-dir="1" aria-label="Próximo destaque">' + ARROW_RIGHT + '</button>' +
        '</div>'
      : '');

  if (total > 1) setupSlider(el, total);
}

// ---------- Novidades ----------
function miniCard(post) {
  return '<a class="mini-card" href="' + escapeHtml(articleUrl(post.slug)) + '">' +
    '<div class="mini-card__media">' + coverImage(post.cover_image) + '</div>' +
    '<h3 class="mini-card__title">' + escapeHtml(post.title) + '</h3>' +
  '</a>';
}

export function renderNews(el, list) {
  if (list === null) { el.className = ''; el.innerHTML = errorState(); return; }
  if (list.length === 0) {
    el.className = '';
    el.innerHTML = emptyState('Nenhum artigo publicado ainda', 'Os artigos mais recentes aparecem aqui.');
    return;
  }
  el.innerHTML = list.map(miniCard).join('');
}

// ---------- Últimas reviews ----------
function reviewTile(review) {
  const shape = coverShape(review.category);
  return '<a class="home-review home-review--' + shape + '" href="' + escapeHtml(reviewUrl(review.slug)) + '">' +
    '<div class="home-review__media">' +
      coverImage(review.cover_image) +
      scoreBadge(review.score) +
    '</div>' +
    '<h3 class="home-review__title">' + escapeHtml(review.title) + '</h3>' +
  '</a>';
}

export function renderReviews(el, list) {
  if (list === null) { el.className = ''; el.innerHTML = errorState(); return; }
  if (list.length === 0) {
    el.className = '';
    el.innerHTML = emptyState('Nenhuma review publicada ainda', 'As reviews mais recentes aparecem aqui.');
    return;
  }
  el.innerHTML = list.map(reviewTile).join('');
}

// ---------- Barra lateral: Em Alta (mais acessados) ----------
export function renderTrending(el, list) {
  if (list === null) { el.innerHTML = errorState(); return; }
  if (list.length === 0) {
    el.innerHTML = emptyState('Nada em alta ainda', 'Os artigos mais acessados aparecem aqui.');
    return;
  }
  el.innerHTML = '<ol class="side-list">' + list.map((post) => {
    const category = post.category && post.category.name ? '<span>' + escapeHtml(post.category.name) + '</span>' : '';
    const author = post.author && post.author.name ? '<span>' + escapeHtml(post.author.name) + '</span>' : '';
    return '<li class="side-item">' +
      '<a class="side-item__title" href="' + escapeHtml(articleUrl(post.slug)) + '">' + escapeHtml(post.title) + '</a>' +
      '<div class="side-item__meta">' + category + author + '</div>' +
    '</li>';
  }).join('') + '</ol>';
}

// ---------- Barra lateral: Favoritos da Redação ----------
export function renderFavorites(el, list) {
  if (list === null) { el.innerHTML = errorState(); return; }
  if (list.length === 0) {
    el.innerHTML = emptyState('Nenhum favorito ainda', 'As reviews marcadas como Favorito da Redação aparecem aqui.');
    return;
  }
  el.innerHTML = '<ul class="side-list">' + list.map((review) => {
    const shape = coverShape(review.category);
    return '<li>' +
      '<a class="fav-item fav-item--' + shape + '" href="' + escapeHtml(reviewUrl(review.slug)) + '">' +
        '<div class="fav-item__media">' + coverImage(review.cover_image) + '</div>' +
        '<div class="fav-item__text">' +
          '<h3 class="fav-item__title">' + escapeHtml(review.title) + '</h3>' +
          scoreBadge(review.score) +
        '</div>' +
      '</a>' +
    '</li>';
  }).join('') + '</ul>';
}