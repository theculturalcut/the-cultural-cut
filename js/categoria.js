// js/categoria.js
// Páginas de categoria: musica.html, cinema.html, series.html e variedades.html.
// Todas usam este mesmo arquivo. A categoria vem do atributo data-categoria do <main>.

import { supabase } from './supabase.js';
import { POST_CARD_SELECT, REVIEW_CARD_SELECT, onlyPublic, emptyState } from './utils.js';
import {
  showLoading,
  renderNews,
  renderReviews,
  renderTrending,
  renderFavorites,
} from './blocos.js';

const NEWS_SHOWN = 6;
const REVIEWS_SHOWN = 6;

// false = a barra lateral (Em Alta e Favoritos) mostra só a categoria da página.
// true  = mostra o mesmo da home, com todas as categorias.
const SIDEBAR_FROM_ALL_CATEGORIES = false;

const $ = (id) => document.getElementById(id);
const main = $('conteudo');
const NEWEST = { ascending: false };

// ---------- Qual categoria esta página mostra ----------
function getSlug() {
  if (main && main.dataset.categoria) return main.dataset.categoria;
  const file = window.location.pathname.split('/').pop() || '';
  return file.replace('.html', '');
}

function published(table, select, options) {
  return onlyPublic(supabase.from(table).select(select, options));
}

// Erro numa consulta vira null, e o bloco mostra a mensagem de erro
function listOrNull(result) {
  if (result.error) {
    console.error('Erro ao carregar a categoria:', result.error);
    return null;
  }
  return result.data || [];
}

// ---------- Início ----------
async function init() {
  const slug = getSlug();
  const encoded = encodeURIComponent(slug);

  $('link-artigos').href = 'artigos.html?categoria=' + encoded;
  $('link-reviews').href = 'reviews.html?categoria=' + encoded;

  showLoading({
    news: $('novidades'),
    reviews: $('ultimas-reviews'),
    trending: $('em-alta'),
    favorites: $('favoritos'),
  });

  // 1) Busca a categoria
  const { data: category, error } = await supabase
    .from('categories')
    .select('id, name, slug, description')
    .eq('slug', slug)
    .maybeSingle();

  if (error) {
    console.error('Erro ao carregar a categoria:', error);
    renderNews($('novidades'), null);
    renderReviews($('ultimas-reviews'), null);
    renderTrending($('em-alta'), null);
    renderFavorites($('favoritos'), null);
    return;
  }

  if (!category) {
    main.innerHTML =
      '<div class="container section">' +
        emptyState('Categoria não encontrada', 'Esta categoria ainda não existe no site.') +
        '<p class="empty-state"><a class="btn btn--ghost" href="index.html">Voltar para a home</a></p>' +
      '</div>';
    return;
  }

  // 2) Título e descrição vêm do banco (o texto do HTML serve de reserva)
  $('categoria-titulo').textContent = category.name;
  document.title = category.name + ' | The Cultural Cut';
  if (category.description) {
    $('categoria-descricao').textContent = category.description;
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute('content', category.description);
  }

  // 3) Busca tudo ao mesmo tempo
  const inCategory = (query) => query.eq('category_id', category.id);
  const forSidebar = (query) => (SIDEBAR_FROM_ALL_CATEGORIES ? query : inCategory(query));

  const [posts, reviews, trending, favorites] = await Promise.all([
    inCategory(published('posts', POST_CARD_SELECT, { count: 'exact' }))
      .order('published_at', NEWEST).limit(NEWS_SHOWN),
    inCategory(published('reviews', REVIEW_CARD_SELECT, { count: 'exact' }))
      .order('published_at', NEWEST).limit(REVIEWS_SHOWN),
    forSidebar(published('posts', POST_CARD_SELECT))
      .order('views', NEWEST).order('published_at', NEWEST).limit(5),
    forSidebar(published('reviews', REVIEW_CARD_SELECT))
      .eq('editorial_favorite', true).order('published_at', NEWEST).limit(3),
  ]);

  renderNews($('novidades'), listOrNull(posts));
  renderReviews($('ultimas-reviews'), listOrNull(reviews));
  renderTrending($('em-alta'), listOrNull(trending));
  renderFavorites($('favoritos'), listOrNull(favorites));

  // "Ver Mais" só aparece se existem mais itens do que os mostrados
  if (!posts.error && (posts.count ?? 0) > NEWS_SHOWN) $('mais-artigos').hidden = false;
  if (!reviews.error && (reviews.count ?? 0) > REVIEWS_SHOWN) $('mais-reviews').hidden = false;
}

init();