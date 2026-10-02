// admin/js/reviews.js
// Lista de reviews do painel: admin/reviews.html

import { initAdminList } from './lista.js';

initAdminList({
  table: 'reviews',
  active: 'reviews',
  select:
    'id, title, slug, status, featured, editorial_favorite, score, views, published_at, updated_at, ' +
    'category:categories(name), author:profiles(name)',
  columns: ['title', 'category', 'score', 'author', 'status', 'published', 'views', 'actions'],
  editorPage: 'review-editor.html',
  publicUrl: (slug) => '../review.html?slug=' + encodeURIComponent(slug),
  texts: {
    singular: 'review',
    plural: 'reviews',
    emptyTitle: 'Nenhuma review ainda',
    emptyText: 'As reviews que você criar aparecem aqui.',
    createLabel: 'Criar a primeira review',
    deleteDone: 'Review excluída.',
  },
});