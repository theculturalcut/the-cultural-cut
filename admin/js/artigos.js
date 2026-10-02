// admin/js/artigos.js
// Lista de artigos do painel: admin/artigos.html

import { initAdminList } from './lista.js';

initAdminList({
  table: 'posts',
  active: 'artigos',
  select:
    'id, title, slug, status, featured, views, published_at, updated_at, ' +
    'category:categories(name), author:profiles(name)',
  columns: ['title', 'category', 'author', 'status', 'published', 'views', 'actions'],
  editorPage: 'artigo-editor.html',
  publicUrl: (slug) => '../artigo.html?slug=' + encodeURIComponent(slug),
  texts: {
    singular: 'artigo',
    plural: 'artigos',
    emptyTitle: 'Nenhum artigo ainda',
    emptyText: 'Os artigos que você criar aparecem aqui.',
    createLabel: 'Criar o primeiro artigo',
    deleteDone: 'Artigo excluído.',
  },
});