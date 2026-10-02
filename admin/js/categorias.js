// admin/js/categorias.js
// Categorias do site (só para administradores): criar, editar e excluir.

import { supabase } from '../../js/supabase.js';
import { escapeHtml, slugify, emptyState, errorState } from '../../js/utils.js';
import { initAdminLayout } from './layout.js';

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const numberFormat = new Intl.NumberFormat('pt-BR');

// Quem não é administrador volta para o dashboard
await initAdminLayout({ active: 'categorias', adminOnly: true });

const $ = (id) => document.getElementById(id);
const els = {
  table: $('tabela'),
  notice: $('aviso-lista'),
  newButton: $('nova-categoria'),
  dialog: $('dialogo-categoria'),
  dialogTitle: $('dialogo-categoria-titulo'),
  form: $('form-categoria'),
  formError: $('cat-erro'),
  name: $('cat-nome'),
  slug: $('cat-slug'),
  slugHint: $('cat-slug-dica'),
  description: $('cat-descricao'),
  saveButton: $('cat-salvar'),
  cancelButton: $('cat-cancelar'),
  deleteDialog: $('dialogo-excluir'),
  deleteText: $('dialogo-texto'),
};

let categories = [];
let counts = new Map();   // id da categoria → { articles, reviews }
let countsKnown = true;
let editing = null;       // categoria em edição (null = criando uma nova)
let slugTouched = false;
let pendingDelete = null;

// ---------- Avisos ----------
function notice(text, type) {
  if (!text) { els.notice.hidden = true; return; }
  els.notice.className = 'message' + (type ? ' message--' + type : '');
  els.notice.textContent = text;
  els.notice.hidden = false;
}

function formError(text, field) {
  els.formError.textContent = text;
  els.formError.hidden = false;
  if (field) field.focus();
}

// ---------- Carregar e mostrar ----------
function tally(result, key) {
  if (result.error) { countsKnown = false; return; }
  (result.data || []).forEach((row) => {
    if (!row.category_id) return;
    const entry = counts.get(row.category_id) || { articles: 0, reviews: 0 };
    entry[key] += 1;
    counts.set(row.category_id, entry);
  });
}

function render() {
  if (categories.length === 0) {
    els.table.innerHTML = emptyState('Nenhuma categoria ainda', 'Crie a primeira categoria para organizar o site.');
    return;
  }

  const rows = categories.map((category) => {
    const entry = counts.get(category.id) || { articles: 0, reviews: 0 };
    const articles = countsKnown ? numberFormat.format(entry.articles) : '—';
    const reviews = countsKnown ? numberFormat.format(entry.reviews) : '—';
    const name = escapeHtml(category.name);

    return '<tr>' +
      '<td class="cell-title">' +
        '<span class="cell-title__link">' + name + '</span>' +
        '<div class="cell-title__meta"><span>/' + escapeHtml(category.slug) + '</span></div>' +
      '</td>' +
      '<td class="cell-description">' + (category.description ? escapeHtml(category.description) : '—') + '</td>' +
      '<td class="cell-muted num">' + articles + '</td>' +
      '<td class="cell-muted num">' + reviews + '</td>' +
      '<td><div class="cell-actions">' +
        '<button type="button" class="btn btn--ghost btn--sm" data-edit="' + escapeHtml(category.id) + '" aria-label="Editar ' + name + '">Editar</button>' +
        '<a class="btn btn--ghost btn--sm" href="../' + encodeURIComponent(category.slug) + '.html" target="_blank" rel="noopener" aria-label="Ver a página de ' + name + '">Ver página</a>' +
        '<button type="button" class="btn btn--danger btn--sm" data-delete="' + escapeHtml(category.id) + '" aria-label="Excluir ' + name + '">Excluir</button>' +
      '</div></td>' +
    '</tr>';
  }).join('');

  els.table.innerHTML =
    '<div class="table-wrap"><table class="table">' +
      '<thead><tr>' +
        '<th scope="col">Categoria</th>' +
        '<th scope="col">Descrição</th>' +
        '<th scope="col">Artigos</th>' +
        '<th scope="col">Reviews</th>' +
        '<th scope="col"><span class="visually-hidden">Ações</span></th>' +
      '</tr></thead><tbody>' + rows + '</tbody>' +
    '</table></div>';
}

async function load() {
  els.table.innerHTML =
    '<div class="skeleton" style="height:3.2rem;margin-bottom:0.5rem" aria-hidden="true"></div>'.repeat(4);

  const [cats, posts, reviews] = await Promise.all([
    supabase.from('categories').select('id, name, slug, description').order('name'),
    supabase.from('posts').select('category_id').limit(1000),
    supabase.from('reviews').select('category_id').limit(1000),
  ]);

  if (cats.error) {
    console.error('Erro ao carregar as categorias:', cats.error);
    els.table.innerHTML = errorState();
    return;
  }

  categories = cats.data || [];
  counts = new Map();
  countsKnown = true;
  tally(posts, 'articles');
  tally(reviews, 'reviews');
  render();
}

// ---------- Criar e editar ----------
function openCreate() {
  editing = null;
  slugTouched = false;
  els.dialogTitle.textContent = 'Nova categoria';
  els.name.value = '';
  els.slug.value = '';
  els.slug.readOnly = false;
  els.description.value = '';
  els.slugHint.textContent =
    'Só letras minúsculas sem acento, números e hífens. Vira o nome da página (por exemplo, games.html).';
  els.formError.hidden = true;
  els.dialog.showModal();
  els.name.focus();
}

function openEdit(category) {
  editing = category;
  els.dialogTitle.textContent = 'Editar categoria';
  els.name.value = category.name;
  els.slug.value = category.slug;
  els.slug.readOnly = true;
  els.description.value = category.description || '';
  els.slugHint.textContent =
    'O endereço não muda depois de criado, porque é o nome da página (' + category.slug + '.html).';
  els.formError.hidden = true;
  els.dialog.showModal();
  els.name.focus();
}

els.name.addEventListener('input', () => {
  if (!editing && !slugTouched) els.slug.value = slugify(els.name.value);
});
els.slug.addEventListener('input', () => { slugTouched = true; });
els.slug.addEventListener('blur', () => { if (!els.slug.readOnly) els.slug.value = slugify(els.slug.value); });

els.newButton.addEventListener('click', openCreate);
els.cancelButton.addEventListener('click', () => els.dialog.close());

els.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  els.formError.hidden = true;

  const name = els.name.value.trim();
  const slug = els.slug.value.trim();
  const description = els.description.value.trim();

  if (!name) { formError('Informe o nome da categoria.', els.name); return; }
  if (!editing) {
    if (!slug) { formError('Informe o endereço (slug) da categoria.', els.slug); return; }
    if (!SLUG_RE.test(slug)) {
      formError('O endereço deve ter só letras minúsculas sem acento, números e hífens.', els.slug);
      return;
    }
  }

  els.saveButton.disabled = true;

  const result = editing
    ? await supabase.from('categories')
        .update({ name, description: description || null })
        .eq('id', editing.id)
        .select('id')
    : await supabase.from('categories')
        .insert({ name, slug, description: description || null })
        .select('id');

  els.saveButton.disabled = false;

  if (result.error) {
    console.error('Erro ao salvar a categoria:', result.error);
    formError(
      result.error.code === '23505'
        ? 'Já existe uma categoria com este endereço. Escolha outro.'
        : 'Não foi possível salvar. Confira a conexão e tente novamente.',
      result.error.code === '23505' ? els.slug : null
    );
    return;
  }
  if (!result.data || result.data.length === 0) {
    formError('Não foi possível salvar. Só administradores podem alterar categorias.', null);
    return;
  }

  const wasNew = !editing;
  els.dialog.close();
  notice(wasNew
    ? 'Categoria criada. Lembre-se de criar a página dela (veja as instruções abaixo).'
    : 'Categoria atualizada.', 'success');
  load();
});

// ---------- Excluir ----------
function deleteMessage(category) {
  const entry = counts.get(category.id) || { articles: 0, reviews: 0 };
  const usage = countsKnown
    ? entry.articles + ' artigo(s) e ' + entry.reviews + ' review(s) que usam essa categoria ficarão sem categoria. '
    : 'Os artigos e as reviews que usam essa categoria ficarão sem categoria. ';
  return '“' + category.name + '” será excluída. ' + usage +
    'A página ' + category.slug + '.html do site deixará de funcionar. Essa ação não pode ser desfeita.';
}

async function deleteCategory(category) {
  notice('Excluindo...', '');

  // .select() devolve as linhas apagadas: lista vazia significa que o banco bloqueou
  const { data, error } = await supabase.from('categories').delete().eq('id', category.id).select('id');

  if (error) {
    console.error('Erro ao excluir a categoria:', error);
    notice('Não foi possível excluir. Tente novamente.', 'error');
    return;
  }
  if (!data || data.length === 0) {
    notice('Não foi possível excluir. Só administradores podem excluir categorias.', 'error');
    return;
  }

  notice('Categoria excluída.', 'success');
  load();
}

els.table.addEventListener('click', (event) => {
  const editButton = event.target.closest('button[data-edit]');
  if (editButton) {
    const category = categories.find((c) => c.id === editButton.dataset.edit);
    if (category) openEdit(category);
    return;
  }

  const deleteButton = event.target.closest('button[data-delete]');
  if (deleteButton) {
    const category = categories.find((c) => c.id === deleteButton.dataset.delete);
    if (!category) return;
    pendingDelete = category;
    els.deleteText.textContent = deleteMessage(category);
    els.deleteDialog.returnValue = '';
    els.deleteDialog.showModal();
  }
});

els.deleteDialog.addEventListener('close', () => {
  const category = pendingDelete;
  pendingDelete = null;
  if (category && els.deleteDialog.returnValue === 'confirm') deleteCategory(category);
});

load();