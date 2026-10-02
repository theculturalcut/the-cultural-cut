// js/artigos.js
// Página de listagem de artigos: artigos.html

import { initListing } from './listagem.js';
import { POST_CARD_SELECT, articleCard } from './utils.js';

initListing({
  table: 'posts',
  select: POST_CARD_SELECT,
  card: articleCard,
  singular: 'artigo',
  plural: 'artigos',
  emptyTitle: 'Nenhum artigo publicado ainda',
  emptyText: 'Os artigos aparecem aqui assim que forem publicados.',
});