// js/auth.js
// Login, proteção das páginas do admin e saída (logout).
//
// - Em login.html: controla o formulário de entrada (inicia sozinho).
// - Nas páginas de /admin/: chame requireStaff() no começo do script da página.
//
// IMPORTANTE: esta verificação só controla o que a pessoa vê na tela.
// A segurança de verdade são as regras (RLS) do banco no Supabase.

import { supabase } from './supabase.js';

// Raiz do site (a pasta que contém /js/). Funciona no GitHub Pages e no Live Server.
const ROOT = new URL('../', import.meta.url);

const STAFF_ROLES = ['admin', 'editor'];
const DEFAULT_NEXT = 'admin/index.html';

// ---------- Endereços ----------
function loginUrl(params = {}) {
  const url = new URL('login.html', ROOT);
  Object.entries(params).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
  });
  return url.href;
}

// Só aceita voltar para páginas dentro de admin/ (impede redirecionar para outro site)
function isSafeNext(value) {
  return /^admin\/[A-Za-z0-9_\-\/]*(\.html)?(\?[A-Za-z0-9_\-=&%.]*)?$/.test(value);
}

// Endereço da página atual, relativo à raiz do site (ex.: "admin/artigos.html")
function currentRelativePath() {
  const path = window.location.pathname;
  if (!path.startsWith(ROOT.pathname)) return '';
  return path.slice(ROOT.pathname.length) + window.location.search;
}

function nextUrl() {
  const raw = new URLSearchParams(window.location.search).get('next') || '';
  return new URL(isSafeNext(raw) ? raw : DEFAULT_NEXT, ROOT).href;
}

// Troca de página e "trava" o resto do script, para a página protegida não aparecer
function goTo(url) {
  window.location.replace(url);
  return new Promise(() => {});
}

// ---------- Verificar quem está logado ----------
// Devolve { state, profile }. state pode ser:
//   'ok'        → logado e com perfil admin ou editor
//   'anon'      → ninguém logado
//   'forbidden' → logado, mas sem perfil de admin/editor
//   'error'     → não deu para verificar (falha de conexão, por exemplo)
async function checkAccess() {
  const { data, error } = await supabase.auth.getUser();

  if (error || !data || !data.user) {
    const noSession =
      !error ||
      error.name === 'AuthSessionMissingError' ||
      error.status === 401 ||
      error.status === 403;
    return { state: noSession ? 'anon' : 'error' };
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, name, slug, avatar_url, role')
    .eq('id', data.user.id)
    .maybeSingle();

  if (profileError) return { state: 'error' };
  if (!profile || !STAFF_ROLES.includes(profile.role)) return { state: 'forbidden' };

  return { state: 'ok', profile: { ...profile, email: data.user.email } };
}

// Perfil de quem está logado (admin ou editor), ou null
export async function getStaff() {
  const access = await checkAccess();
  return access.state === 'ok' ? access.profile : null;
}

export function isAdmin(profile) {
  return Boolean(profile) && profile.role === 'admin';
}

// ---------- Proteger páginas do admin ----------
// Uso, no começo do script da página:
//   const profile = await requireStaff();                    // admin ou editor
//   const profile = await requireStaff({ adminOnly: true }); // só admin
let watchingSignOut = false;

function watchSignOut() {
  if (watchingSignOut) return;
  watchingSignOut = true;
  // Se a pessoa sair em outra aba, esta aba também volta para o login
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') window.location.replace(loginUrl());
  });
}

export async function requireStaff({ adminOnly = false } = {}) {
  const access = await checkAccess();

  if (access.state === 'anon') {
    const rel = currentRelativePath();
    return goTo(loginUrl({ next: isSafeNext(rel) ? rel : '' }));
  }

  if (access.state === 'forbidden') {
    await supabase.auth.signOut();
    return goTo(loginUrl({ erro: 'sem-acesso' }));
  }

  if (access.state === 'error') {
    document.body.classList.remove('is-checking');
    document.body.innerHTML =
      '<main class="container section">' +
        '<div class="message message--error" role="alert">' +
          'Não foi possível verificar o seu acesso. Confira a conexão e ' +
          '<a href="">tente novamente</a>.' +
        '</div>' +
      '</main>';
    return new Promise(() => {});
  }

  if (adminOnly && !isAdmin(access.profile)) {
    return goTo(new URL('admin/index.html?aviso=restrito', ROOT).href);
  }

  watchSignOut();
  document.body.classList.remove('is-checking');
  return access.profile;
}

// ---------- Sair ----------
export async function signOut() {
  await supabase.auth.signOut();
  window.location.replace(loginUrl());
}

// ---------- Página de login ----------
function translateError(error) {
  const text = String(error.message || '').toLowerCase();

  if (error.status === 429 || text.includes('rate limit')) {
    return 'Muitas tentativas. Aguarde alguns minutos e tente de novo.';
  }
  if (text.includes('email not confirmed')) {
    return 'Este e-mail ainda não foi confirmado.';
  }
  if (error.code === 'invalid_credentials' || text.includes('invalid login credentials')) {
    return 'E-mail ou senha incorretos.';
  }
  if (error.name === 'AuthRetryableFetchError' || text.includes('failed to fetch') || text.includes('network')) {
    return 'Sem conexão. Verifique a internet e tente de novo.';
  }
  return 'Não foi possível entrar. Tente novamente.';
}

function initLoginPage() {
  const form = document.getElementById('form-login');
  if (!form) return;

  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('senha');
  const showPassword = document.getElementById('mostrar-senha');
  const button = document.getElementById('login-botao');
  const message = document.getElementById('login-mensagem');

  function showMessage(text) {
    message.textContent = text;
    message.hidden = false;
  }

  function setLoading(loading) {
    button.disabled = loading;
    button.textContent = loading ? 'Entrando...' : 'Entrar';
    form.setAttribute('aria-busy', String(loading));
  }

  // Aviso vindo de outra página (ex.: conta sem permissão)
  if (new URLSearchParams(window.location.search).get('erro') === 'sem-acesso') {
    showMessage('Esta conta não tem acesso à área da redação.');
  }

  // Se já está logado, vai direto para o painel
  checkAccess().then((access) => {
    if (access.state === 'ok') window.location.replace(nextUrl());
  });

  showPassword.addEventListener('change', () => {
    passwordInput.type = showPassword.checked ? 'text' : 'password';
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    message.hidden = true;

    const email = emailInput.value.trim();
    const password = passwordInput.value;
    if (!email || !password) {
      showMessage('Informe o e-mail e a senha.');
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setLoading(false);
      showMessage(translateError(error));
      passwordInput.value = '';
      passwordInput.focus();
      return;
    }

    // Entrou no login, mas precisa ser admin ou editor
    const staff = await getStaff();
    if (!staff) {
      await supabase.auth.signOut();
      setLoading(false);
      showMessage('Esta conta não tem acesso à área da redação.');
      return;
    }

    window.location.replace(nextUrl());
  });
}

initLoginPage();