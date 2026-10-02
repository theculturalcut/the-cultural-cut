// admin/js/perfil.js
// Meu perfil: cada pessoa edita a própria foto, nome e bio, e troca a própria senha.

import { supabase } from '../../js/supabase.js';
import { escapeHtml } from '../../js/utils.js';
import { initAdminLayout } from './layout.js';
import { createAvatarPicker } from './avatar.js';

const MIN_PASSWORD = 8;

const me = await initAdminLayout({ active: 'perfil' });

const $ = (id) => document.getElementById(id);
const els = {
  form: $('form-perfil'),
  name: $('perfil-nome'),
  bio: $('perfil-bio'),
  bioCounter: $('perfil-contador-bio'),
  slug: $('perfil-slug'),
  role: $('perfil-papel'),
  email: $('perfil-email'),
  publicLink: $('perfil-pagina'),
  save: $('perfil-salvar'),
  saveState: $('perfil-estado'),
  errors: $('perfil-erros'),
  notice: $('perfil-aviso'),
  passwordForm: $('form-senha'),
  password: $('senha-nova'),
  passwordConfirm: $('senha-confirmar'),
  passwordSave: $('senha-salvar'),
  passwordErrors: $('senha-erros'),
  passwordNotice: $('senha-aviso'),
};

let dirty = false;
let saving = false;

function setDirty(value) {
  dirty = value;
  els.saveState.textContent = value ? 'Alterações não salvas' : '';
}

const avatar = createAvatarPicker({ onChange: () => setDirty(true) });

function showProfileError(text) {
  els.notice.hidden = true;
  els.errors.textContent = text;
  els.errors.hidden = false;
}

// ---------- Salvar perfil ----------
async function saveProfile() {
  if (saving) return;

  const name = els.name.value.trim();
  const bio = els.bio.value.trim();

  if (!name) {
    showProfileError('Informe o seu nome.');
    els.name.setAttribute('aria-invalid', 'true');
    els.name.focus();
    return;
  }
  els.name.removeAttribute('aria-invalid');
  els.errors.hidden = true;

  saving = true;
  els.save.disabled = true;
  els.save.textContent = 'Salvando...';

  const { data, error } = await supabase.from('profiles')
    .update({ name, bio: bio || null, avatar_url: avatar.get() || null })
    .eq('id', me.id)
    .select('id');

  saving = false;
  els.save.disabled = false;
  els.save.textContent = 'Salvar perfil';

  if (error || !data || data.length === 0) {
    if (error) console.error('Erro ao salvar o perfil:', error);
    showProfileError('Não foi possível salvar. Confira a conexão e tente novamente.');
    return;
  }

  setDirty(false);
  els.notice.textContent = 'Perfil salvo. O nome no menu muda na próxima vez que você abrir uma página.';
  els.notice.hidden = false;
}

// ---------- Trocar a senha ----------
function passwordMessage(error) {
  switch (error.code) {
    case 'same_password': return 'A nova senha precisa ser diferente da atual.';
    case 'weak_password': return 'Senha fraca. Use pelo menos ' + MIN_PASSWORD + ' caracteres, misturando letras e números.';
    case 'reauthentication_needed': return 'Por segurança, saia do painel, entre de novo e tente trocar a senha.';
    default: return 'Não foi possível trocar a senha. Tente novamente.';
  }
}

async function savePassword() {
  els.passwordNotice.hidden = true;
  els.passwordErrors.hidden = true;

  const password = els.password.value;
  const confirmation = els.passwordConfirm.value;

  if (password.length < MIN_PASSWORD) {
    els.passwordErrors.textContent = 'A senha precisa ter pelo menos ' + MIN_PASSWORD + ' caracteres.';
    els.passwordErrors.hidden = false;
    els.password.focus();
    return;
  }
  if (password !== confirmation) {
    els.passwordErrors.textContent = 'As duas senhas não são iguais.';
    els.passwordErrors.hidden = false;
    els.passwordConfirm.focus();
    return;
  }

  els.passwordSave.disabled = true;
  const { error } = await supabase.auth.updateUser({ password });
  els.passwordSave.disabled = false;

  if (error) {
    console.error('Erro ao trocar a senha:', error);
    els.passwordErrors.textContent = passwordMessage(error);
    els.passwordErrors.hidden = false;
    return;
  }

  els.password.value = '';
  els.passwordConfirm.value = '';
  els.passwordNotice.textContent = 'Senha trocada. Use a nova senha na próxima vez que entrar.';
  els.passwordNotice.hidden = false;
}

// ---------- Início ----------
async function init() {
  const { data, error } = await supabase.from('profiles')
    .select('id, name, slug, bio, avatar_url, role')
    .eq('id', me.id)
    .maybeSingle();

  if (error || !data) {
    if (error) console.error('Erro ao carregar o perfil:', error);
    showProfileError('Não foi possível carregar o seu perfil. Recarregue a página.');
    els.save.disabled = true;
    return;
  }

  els.name.value = data.name || '';
  els.bio.value = data.bio || '';
  els.bioCounter.textContent = String(els.bio.value.length);
  els.slug.value = data.slug || '';
  els.role.value = data.role === 'admin' ? 'Administrador' : 'Editor';
  els.email.value = me.email || '';
  els.publicLink.href = '../autor.html?slug=' + encodeURIComponent(data.slug || '');

  avatar.setInitial(data.name || me.email);
  avatar.set(data.avatar_url);

  els.name.addEventListener('input', () => avatar.setInitial(els.name.value || me.email));
  els.bio.addEventListener('input', () => { els.bioCounter.textContent = String(els.bio.value.length); });
  els.form.addEventListener('input', () => setDirty(true));
  els.form.addEventListener('submit', (event) => { event.preventDefault(); saveProfile(); });
  els.passwordForm.addEventListener('submit', (event) => { event.preventDefault(); savePassword(); });

  window.addEventListener('beforeunload', (event) => {
    if (!dirty) return;
    event.preventDefault();
    event.returnValue = '';
  });
}

init();