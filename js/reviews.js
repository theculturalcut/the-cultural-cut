// js/reviews.js
// Página de listagem de reviews: reviews.html

import { initListing } from './listagem.js';
import { REVIEW_CARD_SELECT, reviewCard } from './utils.js';

initListing({
  table: 'reviews',
  select: REVIEW_CARD_SELECT,
  card: reviewCard,
  singular: 'review',
  plural: 'reviews',
  emptyTitle: 'Nenhuma review publicada ainda',
  emptyText: 'As reviews aparecem aqui assim que forem publicadas.',
  skeletonVariant: 'review',
});