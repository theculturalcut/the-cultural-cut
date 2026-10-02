// js/home.js
// Página inicial: busca os dados e entrega para os blocos de js/blocos.js.

import { supabase } from './supabase.js';
import { POST_CARD_SELECT, REVIEW_CARD_SELECT, onlyPublic } from './utils.js';
import {
  showLoading,
  renderHero,
  renderNews,
  renderReviews,
  renderTrending,
  renderFavorites,
} from './blocos.js';

const $ = (id) => document.getElementById(id);
const NEWEST = { ascending: false };

// ---------- Consultas ----------
function published(table, select) {
  return onlyPublic(supabase.from(table).select(select));
}

async function run(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

// Destaques: os marcados (até 5, artigos e reviews juntos); se não houver, os mais recentes
function pickHeroItems(featPosts, featReviews, latestPosts, latestReviews) {
  if ([featPosts, featReviews, latestPosts, latestReviews].every((list) => list === null)) return null;

  const tag = (list, type) => (list || []).map((item) => ({ ...item, _type: type }));
  let items = [...tag(featPosts, 'article'), ...tag(featReviews, 'review')];
  if (items.length === 0) {
    items = [...tag(latestPosts, 'article'), ...tag(latestReviews, 'review')];
  }

  items.sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
  return items.slice(0, 5);
}

// ---------- Início ----------
async function init() {
  showLoading({
    hero: $('destaques'),
    news: $('novidades'),
    reviews: $('ultimas-reviews'),
    trending: $('em-alta'),
    favorites: $('favoritos'),
  });

  // As consultas rodam ao mesmo tempo. Se uma falhar, as outras continuam.
  const queries = [
    published('posts', POST_CARD_SELECT).order('published_at', NEWEST).limit(6),
    published('reviews', REVIEW_CARD_SELECT).order('published_at', NEWEST).limit(6),
    published('posts', POST_CARD_SELECT).eq('featured', true).order('published_at', NEWEST).limit(5),
    published('reviews', REVIEW_CARD_SELECT).eq('featured', true).order('published_at', NEWEST).limit(5),
    published('posts', POST_CARD_SELECT).order('views', NEWEST).order('published_at', NEWEST).limit(5),
    published('reviews', REVIEW_CARD_SELECT).eq('editorial_favorite', true).order('published_at', NEWEST).limit(3),
  ];

  const settled = await Promise.allSettled(queries.map(run));
  const [latestPosts, latestReviews, featPosts, featReviews, topPosts, favorites] =
    settled.map((result) => {
      if (result.status === 'fulfilled') return result.value;
      console.error('Erro ao carregar a home:', result.reason);
      return null;
    });

  renderHero($('destaques'), pickHeroItems(featPosts, featReviews, latestPosts, latestReviews));
  renderNews($('novidades'), latestPosts);
  renderReviews($('ultimas-reviews'), latestReviews);
  renderTrending($('em-alta'), topPosts);
  renderFavorites($('favoritos'), favorites);
}

init();