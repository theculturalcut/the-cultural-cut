// admin/js/artigo-editor.js
// Editor de artigo: artigo-editor.html (novo) ou artigo-editor.html?id=... (editar).
// Dados do artigo, texto em Markdown, imagens (capa e dentro do texto),
// tags, status e agendamento, e SEO.

import { supabase, imageUrl } from '../../js/supabase.js';
import { escapeHtml, slugify, getParam, emptyState, errorState } from '../../js/utils.js';
import { renderMarkdown } from '../../js/conteudo.js';
import { initAdminLayout } from './layout.js';
import { uploadImage, isSupportedImage } from './imagens.js';

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MAX_TAGS = 10;
const IMAGE_FOLDER = 'articles';
const COVER_HINT =
  'JPG, PNG, WebP ou GIF. Você também pode arrastar a imagem para cá. Ela é reduzida automaticamente.';

const STATUS_HINTS = {
  draft: 'Rascunho: só a redação vê.',
  review: 'Em revisão: aguardando alguém da redação revisar. Não aparece no site.',
  scheduled: 'Agendado: aparece no site sozinho, na data e hora escolhidas.',
  published: 'Publicado: já está visível no site.',
  archived: 'Arquivado: sai do site, mas continua guardado aqui.',
};

// Se você está logado, o painel libera o conteúdo; esta tela só funciona para admin e editor
const profile = await initAdminLayout({ active: 'artigos' });

const $ = (id) => document.getElementById(id);
const els = {
  form: $('editor-form'),
  title: $('titulo'),
  slug: $('slug'),
  slugHint: $('slug-dica'),
  excerpt: $('resumo'),
  content: $('texto'),
  category: $('categoria'),
  author: $('autor'),
  status: $('status'),
  statusHint: $('status-dica'),
  scheduleField: $('campo-agendamento'),
  scheduled: $('agendamento'),
  featured: $('destaque'),
  cover: $('capa'),
  coverPreview: $('capa-previa'),
  coverError: $('capa-erro'),
  coverZone: $('capa-zona'),
  coverFile: $('capa-arquivo'),
  coverPick: $('capa-escolher'),
  coverRemove: $('capa-remover'),
  coverStatus: $('capa-status'),
  seoTitle: $('seo-titulo'),
  seoDescription: $('seo-descricao'),
  save: $('salvar'),
  saveState: $('estado-salvo'),
  errors: $('editor-erros'),
  notice: $('editor-aviso'),
  viewLink: $('ver-no-site'),
  pageTitle: $('titulo-pagina'),
  toolbar: $('md-barra'),
  textStatus: $('texto-status'),
  imageFile: $('imagem-arquivo'),
  imageDialog: $('dialogo-imagem'),
  imagePreview: $('imagem-previa'),
  imageAlt: $('imagem-alt'),
  imageCaption: $('imagem-legenda'),
  writeTab: $('aba-escrever'),
  previewTab: $('aba-previa'),
  writePane: $('painel-escrever'),
  previewPane: $('painel-previa'),
  previewBody: $('previa-conteudo'),
  tagsList: $('tags-lista'),
  tagsInput: $('tags-entrada'),
  tagsHint: $('tags-dica'),
  tagsDatalist: $('tags-sugestoes'),
};

const postId = getParam('id');
let current = { id: null, slug: '', status: 'draft', published_at: null };
let slugTouched = false;
let dirty = false;
let saving = false;

let tags = [];                    // tags escolhidas: { id (ou null se for nova), name, slug }
let knownTags = [];               // tags que já existem no site
let originalTagIds = new Set();   // tags que já estavam ligadas ao artigo ao abrir

// ---------- Ajudantes ----------
// "2026-10-10T17:30:00Z" → "2026-10-10T14:30" (hora local, para o campo de data e hora)
function toLocalInput(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) +
    'T' + pad(date.getHours()) + ':' + pad(date.getMinutes());
}

// Agendado com a data já vencida é conteúdo que já está no ar: vale como publicado
function effectiveStatus(item) {
  const due = item.published_at && new Date(item.published_at).getTime() <= Date.now();
  return item.status === 'scheduled' && due ? 'published' : item.status;
}

const dateTimeFormat = new Intl.DateTimeFormat('pt-BR', {
  day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

function showNotice(text) {
  els.errors.hidden = true;
  els.notice.textContent = text;
  els.notice.hidden = false;
}

function showFailure(text) {
  els.notice.hidden = true;
  els.errors.textContent = text;
  els.errors.hidden = false;
}

function setDirty(value) {
  dirty = value;
  els.saveState.textContent = value ? 'Alterações não salvas' : (current.id ? 'Tudo salvo' : '');
}

function saveLabel(status) {
  const live = current.id && current.status === 'published';
  switch (status) {
    case 'published': return live ? 'Salvar alterações' : 'Publicar';
    case 'scheduled': return 'Agendar';
    case 'review': return 'Enviar para revisão';
    case 'archived': return 'Arquivar';
    default: return 'Salvar rascunho';
  }
}

function updateStatusUi() {
  const status = els.status.value;
  els.scheduleField.hidden = status !== 'scheduled';
  els.statusHint.textContent = STATUS_HINTS[status] || '';
  els.save.textContent = saveLabel(status);
}

function updateHeader() {
  els.pageTitle.textContent = current.id ? 'Editar artigo' : 'Novo artigo';
  document.title = (current.id ? 'Editar artigo' : 'Novo artigo') + ' | Painel | The Cultural Cut';

  const live = current.id && current.status === 'published' && current.slug;
  els.viewLink.hidden = !live;
  if (live) els.viewLink.href = '../artigo.html?slug=' + encodeURIComponent(current.slug);
}

// Pega a primeira imagem de uma lista de arquivos (arrastar, colar ou escolher)
function firstImage(fileList) {
  return Array.from(fileList || []).find(isSupportedImage) || null;
}

// Mostra um contorno tracejado enquanto um arquivo é arrastado por cima
function bindDropVisual(element) {
  ['dragenter', 'dragover'].forEach((name) =>
    element.addEventListener(name, () => element.classList.add('is-dragover')));
  ['dragleave', 'drop'].forEach((name) =>
    element.addEventListener(name, () => element.classList.remove('is-dragover')));
}

// ---------- Contadores de caracteres ----------
function bindCounter(input, counterId) {
  const counter = $(counterId);
  const update = () => { counter.textContent = String(input.value.length); };
  input.addEventListener('input', update);
  update();
}

// ---------- Capa ----------
function setCoverStatus(text, isError = false) {
  els.coverStatus.textContent = text;
  els.coverStatus.classList.toggle('is-error', isError);
}

function updateCoverPreview() {
  const value = els.cover.value.trim();
  els.coverError.hidden = true;
  els.coverRemove.hidden = !value;
  if (!value) {
    els.coverPreview.hidden = true;
    els.coverPreview.removeAttribute('src');
    return;
  }
  els.coverPreview.src = imageUrl(value);
}
els.coverPreview.addEventListener('load', () => {
  els.coverPreview.hidden = false;
  els.coverError.hidden = true;
});
els.coverPreview.addEventListener('error', () => {
  els.coverPreview.hidden = true;
  els.coverError.hidden = false;
});

async function uploadCover(file) {
  els.coverPick.disabled = true;
  setCoverStatus('Enviando imagem...');
  try {
    const { path } = await uploadImage(file, { folder: IMAGE_FOLDER });
    els.cover.value = path;
    updateCoverPreview();
    setDirty(true);
    setCoverStatus('Imagem enviada. Salve o artigo para aplicar a capa.');
  } catch (error) {
    setCoverStatus(error.message, true);
  } finally {
    els.coverPick.disabled = false;
  }
}

els.coverPick.addEventListener('click', () => els.coverFile.click());
els.coverFile.addEventListener('change', () => {
  const file = els.coverFile.files && els.coverFile.files[0];
  els.coverFile.value = '';
  if (file) uploadCover(file);
});
els.coverRemove.addEventListener('click', () => {
  els.cover.value = '';
  updateCoverPreview();
  setCoverStatus(COVER_HINT);
  setDirty(true);
});

bindDropVisual(els.coverZone);
els.coverZone.addEventListener('dragover', (event) => {
  if (event.dataTransfer && event.dataTransfer.types.includes('Files')) event.preventDefault();
});
els.coverZone.addEventListener('drop', (event) => {
  const files = event.dataTransfer && event.dataTransfer.files;
  if (!files || files.length === 0) return;
  event.preventDefault();
  const file = firstImage(files);
  if (!file) { setCoverStatus('Só é possível enviar imagens JPG, PNG, WebP ou GIF.', true); return; }
  uploadCover(file);
});

// ---------- Texto em Markdown: barra de formatação ----------
let savedPosition = null; // onde o cursor estava quando a pessoa pediu para inserir algo

function rememberPosition() {
  savedPosition = { start: els.content.selectionStart, end: els.content.selectionEnd };
}

function setTextStatus(text, isError = false) {
  els.textStatus.textContent = text;
  els.textStatus.classList.toggle('is-error', isError);
}

function surround(before, after, placeholder) {
  const area = els.content;
  const start = area.selectionStart;
  const end = area.selectionEnd;
  const selected = area.value.slice(start, end) || placeholder;
  area.setRangeText(before + selected + after, start, end, 'end');
  area.selectionStart = start + before.length;
  area.selectionEnd = start + before.length + selected.length;
  area.focus();
  setDirty(true);
}

// Coloca um prefixo no começo de cada linha selecionada (ex.: "## ", "> ", "- ")
function prefixLines(prefix) {
  const area = els.content;
  const text = area.value;
  const lineStart = text.lastIndexOf('\n', area.selectionStart - 1) + 1;
  const endIndex = text.indexOf('\n', area.selectionEnd);
  const lineEnd = endIndex === -1 ? text.length : endIndex;
  const block = text.slice(lineStart, lineEnd) || 'texto';
  const replaced = block.split('\n').map((line) => prefix + line).join('\n');
  area.setRangeText(replaced, lineStart, lineEnd, 'select');
  area.focus();
  setDirty(true);
}

// Insere um bloco (imagem, tabela) em um parágrafo próprio, no ponto salvo do cursor
function insertBlock(markdown) {
  const area = els.content;
  const start = savedPosition ? savedPosition.start : area.selectionStart;
  const end = savedPosition ? savedPosition.end : area.selectionEnd;
  const before = area.value.slice(0, start);
  const after = area.value.slice(end);

  const lead = !before || before.endsWith('\n\n') ? '' : (before.endsWith('\n') ? '\n' : '\n\n');
  const trail = !after ? '\n' : (after.startsWith('\n\n') ? '' : (after.startsWith('\n') ? '\n' : '\n\n'));

  area.value = before + lead + markdown + trail + after;
  const caret = (before + lead + markdown).length;
  area.focus();
  area.setSelectionRange(caret, caret);
  savedPosition = null;
  setDirty(true);
}

els.toolbar.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-md]');
  if (!button) return;

  switch (button.dataset.md) {
    case 'bold': surround('**', '**', 'negrito'); break;
    case 'italic': surround('*', '*', 'itálico'); break;
    case 'h2': prefixLines('## '); break;
    case 'h3': prefixLines('### '); break;
    case 'quote': prefixLines('> '); break;
    case 'list': prefixLines('- '); break;
    case 'link': {
      const url = window.prompt('Endereço do link (por exemplo, https://exemplo.com):');
      if (url && url.trim()) surround('[', '](' + url.trim() + ')', 'texto do link');
      break;
    }
    case 'table':
      rememberPosition();
      insertBlock('| Coluna 1 | Coluna 2 |\n| --- | --- |\n| Texto | Texto |');
      break;
    case 'image':
      rememberPosition();
      els.imageFile.click();
      break;
    default: break;
  }
});

// ---------- Imagens dentro do texto ----------
let pendingImageUrl = '';

const cleanText = (text) => String(text || '').replace(/[\[\]"\r\n]/g, ' ').replace(/\s+/g, ' ').trim();

// ![descrição](endereço "legenda")
function imageMarkdown(url, alt, caption) {
  const description = cleanText(alt);
  const legend = cleanText(caption);
  return '![' + description + '](' + url + (legend ? ' "' + legend + '"' : '') + ')';
}

async function startInlineUpload(file) {
  setTextStatus('Enviando imagem...');
  try {
    const { url } = await uploadImage(file, { folder: IMAGE_FOLDER });
    setTextStatus('');
    pendingImageUrl = url;
    els.imagePreview.src = url;
    els.imageAlt.value = '';
    els.imageCaption.value = '';
    els.imageDialog.returnValue = '';
    els.imageDialog.showModal();
    els.imageAlt.focus();
  } catch (error) {
    setTextStatus(error.message, true);
  }
}

els.imageFile.addEventListener('change', () => {
  const file = els.imageFile.files && els.imageFile.files[0];
  els.imageFile.value = '';
  if (file) startInlineUpload(file);
});

els.imageDialog.addEventListener('close', () => {
  const url = pendingImageUrl;
  pendingImageUrl = '';
  if (url && els.imageDialog.returnValue === 'confirm') {
    insertBlock(imageMarkdown(url, els.imageAlt.value, els.imageCaption.value));
  } else {
    savedPosition = null;
  }
});

// Colar uma imagem (Ctrl+V) dentro do texto
els.content.addEventListener('paste', (event) => {
  const file = firstImage(event.clipboardData && event.clipboardData.files);
  if (!file) return; // texto comum: comportamento normal
  event.preventDefault();
  rememberPosition();
  startInlineUpload(file);
});

// Arrastar uma imagem para dentro do texto
bindDropVisual(els.content);
els.content.addEventListener('dragover', (event) => {
  if (event.dataTransfer && event.dataTransfer.types.includes('Files')) event.preventDefault();
});
els.content.addEventListener('drop', (event) => {
  const files = event.dataTransfer && event.dataTransfer.files;
  if (!files || files.length === 0) return; // texto arrastado: comportamento normal
  event.preventDefault();
  const file = firstImage(files);
  if (!file) { setTextStatus('Só é possível enviar imagens JPG, PNG, WebP ou GIF.', true); return; }
  rememberPosition();
  startInlineUpload(file);
});

// ---------- Escrever / Pré-visualizar ----------
function showPreview(on) {
  els.writePane.hidden = on;
  els.previewPane.hidden = !on;
  els.writeTab.setAttribute('aria-pressed', String(!on));
  els.previewTab.setAttribute('aria-pressed', String(on));
  if (on) {
    els.previewBody.innerHTML = renderMarkdown(els.content.value) ||
      '<p class="text-muted">Nada para mostrar ainda. Escreva alguma coisa na aba "Escrever".</p>';
  }
}
els.writeTab.addEventListener('click', () => showPreview(false));
els.previewTab.addEventListener('click', () => showPreview(true));

// ---------- Tags ----------
function normalizeTagName(raw) {
  return String(raw || '').replace(/[,;]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
}

function renderTags() {
  els.tagsList.innerHTML = tags.map((tag) =>
    '<li class="tag-chip' + (tag.id ? '' : ' tag-chip--new') + '">' +
      '<span>' + escapeHtml(tag.name) + '</span>' +
      '<button type="button" data-remove-tag="' + escapeHtml(tag.slug) + '" ' +
        'aria-label="Remover a tag ' + escapeHtml(tag.name) + '">×</button>' +
    '</li>').join('');

  const hasNew = tags.some((tag) => !tag.id);
  els.tagsHint.textContent =
    'Aperte Enter ou vírgula para adicionar (até ' + MAX_TAGS + ').' +
    (hasNew ? ' Tags com contorno tracejado ainda não existem e serão criadas ao salvar.' : '');
}

function addTag(raw) {
  const name = normalizeTagName(raw);
  const slug = slugify(name);
  if (!name || !slug) return false;
  if (tags.some((tag) => tag.slug === slug)) return true; // já está na lista

  if (tags.length >= MAX_TAGS) {
    els.tagsHint.textContent = 'O limite é de ' + MAX_TAGS + ' tags por artigo.';
    return false;
  }

  const known = knownTags.find((tag) => tag.slug === slug);
  tags.push(known
    ? { id: known.id, name: known.name, slug: known.slug }
    : { id: null, name, slug });
  renderTags();
  setDirty(true);
  return true;
}

// O que foi digitado e ainda não virou tag entra junto ao salvar
function commitPendingTag() {
  if (els.tagsInput.value.trim() && addTag(els.tagsInput.value)) els.tagsInput.value = '';
}

els.tagsInput.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ',') return;
  event.preventDefault();
  if (addTag(els.tagsInput.value)) els.tagsInput.value = '';
});

els.tagsList.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-remove-tag]');
  if (!button) return;
  tags = tags.filter((tag) => tag.slug !== button.dataset.removeTag);
  renderTags();
  setDirty(true);
});

// Cria as tags novas e ajusta as ligações do artigo com as tags
async function syncTags(id) {
  // 1) cria as tags que ainda não existem (se já existirem, não faz nada)
  const fresh = tags.filter((tag) => !tag.id);
  if (fresh.length > 0) {
    const { error } = await supabase.from('tags')
      .upsert(fresh.map((tag) => ({ name: tag.name, slug: tag.slug })), { onConflict: 'slug', ignoreDuplicates: true });
    if (error) throw error;
  }

  // 2) descobre o id de cada tag escolhida
  const idBySlug = new Map();
  if (tags.length > 0) {
    const { data, error } = await supabase.from('tags').select('id, name, slug').in('slug', tags.map((tag) => tag.slug));
    if (error) throw error;
    data.forEach((tag) => idBySlug.set(tag.slug, tag));
  }
  const wantedIds = new Set(tags.map((tag) => (idBySlug.get(tag.slug) || {}).id).filter(Boolean));

  // 3) desliga as tags que foram removidas
  const removed = [...originalTagIds].filter((tagId) => !wantedIds.has(tagId));
  if (removed.length > 0) {
    const { error } = await supabase.from('post_tags').delete().eq('post_id', id).in('tag_id', removed);
    if (error) throw error;
  }

  // 4) liga as tags novas
  const added = [...wantedIds].filter((tagId) => !originalTagIds.has(tagId));
  if (added.length > 0) {
    const { error } = await supabase.from('post_tags')
      .upsert(added.map((tagId) => ({ post_id: id, tag_id: tagId })), { onConflict: 'post_id,tag_id', ignoreDuplicates: true });
    if (error) throw error;
  }

  // 5) atualiza o que a tela sabe
  originalTagIds = wantedIds;
  tags = tags.map((tag) => {
    const saved = idBySlug.get(tag.slug);
    return saved ? { id: saved.id, name: saved.name, slug: saved.slug } : tag;
  });
  tags.forEach((tag) => {
    if (tag.id && !knownTags.some((known) => known.slug === tag.slug)) knownTags.push(tag);
  });
  els.tagsDatalist.innerHTML = knownTags.map((tag) => '<option value="' + escapeHtml(tag.name) + '">').join('');
  renderTags();
}

// ---------- Formulário: ler e preencher ----------
function readForm() {
  return {
    title: els.title.value.trim(),
    slug: els.slug.value.trim(),
    excerpt: els.excerpt.value.trim(),
    content: els.content.value,
    category: els.category.value,
    author: els.author.value,
    status: els.status.value,
    scheduledAt: els.scheduled.value,
    featured: els.featured.checked,
    cover: els.cover.value.trim(),
    seoTitle: els.seoTitle.value.trim(),
    seoDescription: els.seoDescription.value.trim(),
  };
}

function fillForm(post) {
  els.title.value = post.title || '';
  els.slug.value = post.slug || '';
  els.excerpt.value = post.excerpt || '';
  els.content.value = post.content || '';
  els.category.value = post.category_id || '';
  els.author.value = post.author_id || profile.id;
  els.status.value = effectiveStatus(post);
  els.scheduled.value = effectiveStatus(post) === 'scheduled' ? toLocalInput(post.published_at) : '';
  els.featured.checked = Boolean(post.featured);
  els.cover.value = post.cover_image || '';
  els.seoTitle.value = post.seo_title || '';
  els.seoDescription.value = post.seo_description || '';
}

// ---------- Validação ----------
function validate(data) {
  const errors = [];

  if (!data.title) errors.push({ field: 'titulo', message: 'Informe o título.' });

  if (!data.slug) {
    errors.push({ field: 'slug', message: 'Informe o endereço (slug) do artigo.' });
  } else if (!SLUG_RE.test(data.slug)) {
    errors.push({ field: 'slug', message: 'O endereço deve ter só letras minúsculas sem acento, números e hífens.' });
  }

  const goesLive = data.status === 'published' || data.status === 'scheduled';
  if (goesLive) {
    if (!data.category) errors.push({ field: 'categoria', message: 'Escolha uma categoria para publicar ou agendar.' });
    if (!data.content.trim()) errors.push({ field: 'texto', message: 'Escreva o texto do artigo antes de publicar ou agendar.' });
  }

  if (data.status === 'scheduled') {
    if (!data.scheduledAt) {
      errors.push({ field: 'agendamento', message: 'Escolha a data e a hora da publicação.' });
    } else if (new Date(data.scheduledAt).getTime() <= Date.now()) {
      errors.push({ field: 'agendamento', message: 'A data de agendamento precisa estar no futuro.' });
    }
  }

  return errors;
}

function showErrors(errors) {
  els.form.querySelectorAll('[aria-invalid]').forEach((field) => field.removeAttribute('aria-invalid'));

  if (errors.length === 0) {
    els.errors.hidden = true;
    return;
  }

  els.notice.hidden = true;
  els.errors.innerHTML =
    '<strong>Corrija antes de salvar:</strong><ul>' +
    errors.map((e) => '<li><a href="#' + e.field + '">' + escapeHtml(e.message) + '</a></li>').join('') +
    '</ul>';
  els.errors.hidden = false;

  errors.forEach((e) => {
    const field = $(e.field);
    if (field) field.setAttribute('aria-invalid', 'true');
  });

  if (errors.some((e) => e.field === 'texto')) showPreview(false);
  const first = $(errors[0].field);
  if (first) first.focus();
}

// ---------- Salvar ----------
function buildPayload(data) {
  const now = new Date();
  let publishedAt = current.published_at || null;

  if (data.status === 'scheduled') {
    publishedAt = new Date(data.scheduledAt).toISOString();
  } else if (data.status === 'published') {
    // Mantém a data original se já foi publicado; senão, publica agora
    const keep = current.published_at && new Date(current.published_at) <= now;
    publishedAt = keep ? current.published_at : now.toISOString();
  }

  return {
    title: data.title,
    slug: data.slug,
    excerpt: data.excerpt || null,
    content: data.content,
    cover_image: data.cover || null,
    author_id: data.author || null,
    category_id: data.category || null,
    status: data.status,
    featured: data.featured,
    published_at: publishedAt,
    seo_title: data.seoTitle || null,
    seo_description: data.seoDescription || null,
  };
}

function successMessage(saved, wasLive) {
  switch (saved.status) {
    case 'published': return wasLive ? 'Alterações salvas.' : 'Artigo publicado.';
    case 'scheduled': return 'Artigo agendado para ' + dateTimeFormat.format(new Date(saved.published_at)) + '.';
    case 'review': return 'Artigo enviado para revisão.';
    case 'archived': return 'Artigo arquivado.';
    default: return 'Rascunho salvo.';
  }
}

async function save() {
  if (saving) return;

  commitPendingTag();

  const data = readForm();
  const errors = validate(data);
  showErrors(errors);
  if (errors.length > 0) return;

  const payload = buildPayload(data);
  const wasLive = Boolean(current.id) && current.status === 'published';

  saving = true;
  els.save.disabled = true;
  els.save.textContent = 'Salvando...';

  const columns = 'id, slug, status, published_at';
  const { data: saved, error } = current.id
    ? await supabase.from('posts').update(payload).eq('id', current.id).select(columns).maybeSingle()
    : await supabase.from('posts').insert(payload).select(columns).single();

  if (error || !saved) {
    saving = false;
    els.save.disabled = false;
    updateStatusUi();

    if (error && error.code === '23505') {
      showErrors([{ field: 'slug', message: 'Já existe um artigo com este endereço. Escolha outro.' }]);
    } else if (error) {
      console.error('Erro ao salvar o artigo:', error);
      showFailure('Não foi possível salvar. Confira a conexão e tente novamente.');
    } else {
      showFailure('Não foi possível salvar. Você pode não ter permissão para editar este artigo.');
    }
    return;
  }

  // O artigo foi salvo. Agora as tags.
  let tagsFailed = false;
  try {
    await syncTags(saved.id);
  } catch (tagError) {
    console.error('Erro ao salvar as tags:', tagError);
    tagsFailed = true;
  }

  saving = false;
  els.save.disabled = false;

  const wasNew = !current.id;
  current = { id: saved.id, slug: saved.slug, status: effectiveStatus(saved), published_at: saved.published_at };
  els.status.value = current.status;

  if (wasNew) window.history.replaceState(null, '', 'artigo-editor.html?id=' + encodeURIComponent(saved.id));

  updateHeader();
  updateStatusUi();
  window.scrollTo({ top: 0 });

  if (tagsFailed) {
    setDirty(true);
    showFailure('O artigo foi salvo, mas não foi possível salvar as tags. Clique em salvar de novo.');
    return;
  }

  setDirty(false);
  showNotice(successMessage(saved, wasLive));
}

// ---------- Início ----------
async function init() {
  const [categories, authors, tagList] = await Promise.all([
    supabase.from('categories').select('id, name').order('name'),
    supabase.from('profiles').select('id, name, username').order('name'),
    supabase.from('tags').select('id, name, slug').order('name').limit(500),
  ]);

  if (categories.error || authors.error) {
    console.error('Erro ao carregar listas do editor:', categories.error || authors.error);
    els.form.innerHTML = errorState();
    return;
  }

  // As sugestões de tags são um extra: se falharem, o editor continua funcionando
  if (tagList.error) console.error('Erro ao carregar as tags:', tagList.error);
  knownTags = tagList.data || [];
  els.tagsDatalist.innerHTML = knownTags.map((tag) => '<option value="' + escapeHtml(tag.name) + '">').join('');

  els.category.innerHTML =
    '<option value="">Escolha uma categoria</option>' +
    categories.data.map((c) => '<option value="' + escapeHtml(c.id) + '">' + escapeHtml(c.name) + '</option>').join('');

  els.author.innerHTML = authors.data.map((a) =>
    '<option value="' + escapeHtml(a.id) + '">' + escapeHtml(a.name || a.username || 'Sem nome') + '</option>').join('');

  if (postId) {
    const { data: post, error } = await supabase.from('posts').select('*').eq('id', postId).maybeSingle();

    // 22P02 = o "id" da URL não tem o formato certo
    if (error && error.code !== '22P02') {
      console.error('Erro ao carregar o artigo:', error);
      els.form.innerHTML = errorState();
      return;
    }
    if (!post) {
      els.form.innerHTML =
        emptyState('Artigo não encontrado', 'O endereço pode estar errado ou o artigo foi excluído.') +
        '<p class="empty-state"><a class="btn btn--ghost" href="artigos.html">Voltar para a lista</a></p>';
      return;
    }

    current = { id: post.id, slug: post.slug, status: effectiveStatus(post), published_at: post.published_at };
    slugTouched = true; // endereço de artigo existente não muda sozinho
    fillForm(post);

    // Tags já ligadas a este artigo
    const linked = await supabase.from('post_tags').select('tag:tags(id, name, slug)').eq('post_id', post.id);
    if (linked.error) {
      console.error('Erro ao carregar as tags do artigo:', linked.error);
    } else {
      tags = (linked.data || []).map((row) => row.tag).filter(Boolean);
      originalTagIds = new Set(tags.map((tag) => tag.id));
    }
  } else {
    els.author.value = profile.id;
  }

  bindCounter(els.excerpt, 'contador-resumo');
  bindCounter(els.seoTitle, 'contador-seo-titulo');
  bindCounter(els.seoDescription, 'contador-seo-descricao');

  renderTags();
  updateHeader();
  updateStatusUi();
  updateCoverPreview();
  setCoverStatus(COVER_HINT);
  setDirty(false);

  // ----- Eventos -----
  els.title.addEventListener('input', () => {
    if (!slugTouched) els.slug.value = slugify(els.title.value);
  });

  els.slug.addEventListener('input', () => {
    slugTouched = true;
    els.slugHint.textContent = current.id && current.status === 'published'
      ? 'Atenção: mudar o endereço de um artigo publicado quebra os links antigos dele.'
      : '';
  });
  els.slug.addEventListener('blur', () => { els.slug.value = slugify(els.slug.value); });

  $('gerar-slug').addEventListener('click', () => {
    els.slug.value = slugify(els.title.value);
    slugTouched = false;
    setDirty(true);
  });

  els.status.addEventListener('change', updateStatusUi);
  els.cover.addEventListener('change', updateCoverPreview);

  // Qualquer mudança no formulário marca "não salvo" (menos digitar uma tag ou escolher arquivo)
  const markDirty = (event) => {
    if (event.target === els.tagsInput || event.target.type === 'file') return;
    setDirty(true);
  };
  els.form.addEventListener('input', markDirty);
  els.form.addEventListener('change', markDirty);
  els.form.addEventListener('submit', (event) => event.preventDefault());

  els.save.addEventListener('click', save);

  // Ctrl+S (ou Cmd+S) salva
  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      save();
    }
  });

  // Avisa se tentar sair com alterações não salvas
  window.addEventListener('beforeunload', (event) => {
    if (!dirty) return;
    event.preventDefault();
    event.returnValue = '';
  });
}

init();