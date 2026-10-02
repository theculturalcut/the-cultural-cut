// admin/js/usuarios.js
// Usuários e autores (só para administradores): lista de pessoas com acesso ao painel
// e edição de nome, endereço, bio, foto e papel (administrador ou editor).

import { supabase, imageUrl } from '../../js/supabase.js';
import { escapeHtml, emptyState, errorState } from '../../js/utils.js';
import { initAdminLayout } from './layout.js';
import { createAvatarPicker } from './avatar.js';

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const numberFormat = new Intl.NumberFormat('pt-BR');

// Quem não é administrador volta para o dashboard
const me = await initAdminLayout({ active: 'usuarios', adminOnly: true });

const $ = (id) => document.getElementById(id);
const els = {
  table: $('tabela'),
  notice: $('aviso-lista'),
  dialog: $('dialogo-usuario'),
  dialogTitle: $('dialogo-usuario-titulo'),
  form: $('form-usuario'),
  formError: $('usr-erro'),
  name: $('usr-nome'),
  slug: $('usr-slug'),
  bio: $('usr-bio'),
  bioCounter: $('usr-contador-bio'),
  role: $('usr-papel'),
  roleHint: $('usr-papel-dica'),
  saveButton: $('usr-salvar'),
  cancelButton: $('usr-cancelar'),
};

const avatar = createAvatarPicker();

let people = [];
let counts = new Map();   // id da pessoa → { articles, reviews }
let countsKnown = true;
let editing = null;

const displayName = (person) => person.name || person.username || 'Sem nome';

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
    if (!row.author_id) return;
    const entry = counts.get(row.author_id) || { articles: 0, reviews: 0 };
    entry[key] += 1;
    counts.set(row.author_id, entry);
  });
}

function avatarHtml(person) {
  const letter = escapeHtml(displayName(person).trim().charAt(0).toUpperCase() || '?');
  return '<span class="avatar-sm">' +
    (person.avatar_url ? '<img src="' + escapeHtml(imageUrl(person.avatar_url)) + '" alt="">' : letter) +
  '</span>';
}

function render() {
  if (people.length === 0) {
    els.table.innerHTML = emptyState('Nenhum usuário encontrado', 'As pessoas com acesso ao painel aparecem aqui.');
    return;
  }

  const rows = people.map((person) => {
    const entry = counts.get(person.id) || { articles: 0, reviews: 0 };
    const articles = countsKnown ? numberFormat.format(entry.articles) : '—';
    const reviews = countsKnown ? numberFormat.format(entry.reviews) : '—';
    const name = escapeHtml(displayName(person));
    const isMe = person.id === me.id;

    return '<tr>' +
      '<td><div class="user-cell">' + avatarHtml(person) +
        '<div>' +
          '<span class="cell-title__link">' + name + '</span>' +
          (isMe ? ' <span class="flag">Você</span>' : '') +
          '<div class="cell-title__meta"><span>/' + escapeHtml(person.slug) + '</span></div>' +
        '</div>' +
      '</div></td>' +
      '<td><span class="badge badge--' + escapeHtml(person.role) + '">' +
        (person.role === 'admin' ? 'Administrador' : 'Editor') + '</span></td>' +
      '<td class="cell-muted num">' + articles + '</td>' +
      '<td class="cell-muted num">' + reviews + '</td>' +
      '<td><div class="cell-actions">' +
        '<button type="button" class="btn btn--ghost btn--sm" data-edit="' + escapeHtml(person.id) + '" aria-label="Editar ' + name + '">Editar</button>' +
        '<a class="btn btn--ghost btn--sm" href="../autor.html?slug=' + encodeURIComponent(person.slug) + '" target="_blank" rel="noopener" aria-label="Ver a página pública de ' + name + '">Ver página</a>' +
      '</div></td>' +
    '</tr>';
  }).join('');

  els.table.innerHTML =
    '<div class="table-wrap"><table class="table">' +
      '<thead><tr>' +
        '<th scope="col">Pessoa</th>' +
        '<th scope="col">Papel</th>' +
        '<th scope="col">Artigos</th>' +
        '<th scope="col">Reviews</th>' +
        '<th scope="col"><span class="visually-hidden">Ações</span></th>' +
      '</tr></thead><tbody>' + rows + '</tbody>' +
    '</table></div>';
}

async function load() {
  els.table.innerHTML =
    '<div class="skeleton" style="height:3.6rem;margin-bottom:0.5rem" aria-hidden="true"></div>'.repeat(3);

  const [profiles, posts, reviews] = await Promise.all([
    supabase.from('profiles').select('id, name, username, slug, bio, avatar_url, role').order('name'),
    supabase.from('posts').select('author_id').limit(1000),
    supabase.from('reviews').select('author_id').limit(1000),
  ]);

  if (profiles.error) {
    console.error('Erro ao carregar os usuários:', profiles.error);
    els.table.innerHTML = errorState();
    return;
  }

  people = profiles.data || [];
  counts = new Map();
  countsKnown = true;
  tally(posts, 'articles');
  tally(reviews, 'reviews');
  render();
}

// ---------- Editar ----------
function openEdit(person) {
  editing = person;
  const isMe = person.id === me.id;

  els.dialogTitle.textContent = 'Editar ' + displayName(person);
  els.name.value = person.name || '';
  els.slug.value = person.slug || '';
  els.bio.value = person.bio || '';
  els.bioCounter.textContent = String(els.bio.value.length);
  els.role.value = person.role;
  els.role.disabled = isMe;
  els.roleHint.textContent = isMe
    ? 'Você não pode mudar o seu próprio papel. Peça a outro administrador.'
    : 'Administradores fazem tudo. Editores criam, editam, publicam e agendam, mas não excluem nem gerenciam categorias, usuários e configurações.';

  avatar.setInitial(displayName(person));
  avatar.set(person.avatar_url);

  els.formError.hidden = true;
  els.dialog.showModal();
  els.name.focus();
}

els.bio.addEventListener('input', () => { els.bioCounter.textContent = String(els.bio.value.length); });
els.slug.addEventListener('blur', () => {
  els.slug.value = els.slug.value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
});
els.name.addEventListener('input', () => avatar.setInitial(els.name.value || displayName(editing || {})));

els.cancelButton.addEventListener('click', () => els.dialog.close());

els.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  els.formError.hidden = true;
  if (!editing) return;

  const isMe = editing.id === me.id;
  const name = els.name.value.trim();
  const slug = els.slug.value.trim();
  const bio = els.bio.value.trim();
  const role = els.role.value;

  if (!name) { formError('Informe o nome.', els.name); return; }
  if (!slug) { formError('Informe o endereço (slug).', els.slug); return; }
  if (!SLUG_RE.test(slug)) {
    formError('O endereço deve ter só letras minúsculas sem acento, números e hífens.', els.slug);
    return;
  }

  // Nunca deixar o site sem administrador
  const adminCount = people.filter((p) => p.role === 'admin').length;
  if (!isMe && editing.role === 'admin' && role !== 'admin' && adminCount <= 1) {
    formError('O site precisa de pelo menos um administrador.', els.role);
    return;
  }

  const payload = { name, slug, bio: bio || null, avatar_url: avatar.get() || null };
  if (!isMe) payload.role = role;

  els.saveButton.disabled = true;
  const { data, error } = await supabase.from('profiles').update(payload).eq('id', editing.id).select('id');
  els.saveButton.disabled = false;

  if (error) {
    console.error('Erro ao salvar o usuário:', error);
    if (error.code === '23505') {
      formError('Já existe uma pessoa com este endereço. Escolha outro.', els.slug);
    } else if (String(error.message).includes('último administrador')) {
      formError('O site precisa de pelo menos um administrador.', els.role);
    } else {
      formError('Não foi possível salvar. Confira a conexão e tente novamente.', null);
    }
    return;
  }
  if (!data || data.length === 0) {
    formError('Não foi possível salvar. Só administradores podem editar outras pessoas.', null);
    return;
  }

  els.dialog.close();
  notice('Dados de ' + name + ' atualizados.', 'success');
  load();
});

els.table.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-edit]');
  if (!button) return;
  const person = people.find((p) => p.id === button.dataset.edit);
  if (person) openEdit(person);
});

load();