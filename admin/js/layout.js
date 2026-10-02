// admin/js/layout.js
// Layout compartilhado de todas as páginas do admin: confere o acesso,
// monta o menu lateral e controla o menu do celular.
// Também guarda ajudantes usados por várias telas (etiqueta de status, "há 2 horas").
//
// Uso no começo do script de cada página do admin:
//   const profile = await initAdminLayout({ active: 'artigos' });
//   const profile = await initAdminLayout({ active: 'usuarios', adminOnly: true });

import { requireStaff, signOut, isAdmin } from '../../js/auth.js';
import { escapeHtml, formatDate } from '../../js/utils.js';

// ---------- Itens do menu ----------
const NAV = [
  { id: 'dashboard', label: 'Dashboard', href: 'index.html' },
  { id: 'artigos', label: 'Artigos', href: 'artigos.html' },
  { id: 'reviews', label: 'Reviews', href: 'reviews.html' },
];

// Só aparecem para administradores
const NAV_ADMIN = [
  { id: 'categorias', label: 'Categorias', href: 'categorias.html' },
  { id: 'usuarios', label: 'Usuários', href: 'usuarios.html' },
  { id: 'configuracoes', label: 'Configurações', href: 'configuracoes.html' },
];

const ICON_MENU =
  '<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5">' +
  '<path d="M2 5h16M2 10h16M2 15h16"/></svg>';
const ICON_CLOSE =
  '<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5">' +
  '<path d="M4 4l12 12M16 4L4 16"/></svg>';

// ---------- Ajudantes compartilhados ----------
export const STATUS_LABELS = {
  draft: 'Rascunho',
  review: 'Em revisão',
  scheduled: 'Agendado',
  published: 'Publicado',
  archived: 'Arquivado',
};

// Etiqueta colorida do status
export function statusBadge(status) {
  const label = STATUS_LABELS[status] || status;
  return '<span class="badge badge--' + escapeHtml(status) + '">' + escapeHtml(label) + '</span>';
}

// "há 3 horas", "ontem", ou a data completa se for muito antigo
const relativeFormat = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });
export function timeAgo(iso) {
  if (!iso) return '';
  const diff = (new Date(iso).getTime() - Date.now()) / 1000; // negativo = passado
  const abs = Math.abs(diff);
  if (Number.isNaN(abs)) return '';
  if (abs < 60) return 'agora mesmo';
  if (abs < 3600) return relativeFormat.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return relativeFormat.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 30) return relativeFormat.format(Math.round(diff / 86400), 'day');
  return formatDate(iso);
}

// ---------- Menu lateral ----------
function navLinks(items, active) {
  return items.map((item) => {
    const current = item.id === active ? ' aria-current="page"' : '';
    return '<a href="' + item.href + '"' + current + '>' + item.label + '</a>';
  }).join('');
}

function renderSidebar(profile, active) {
  const sidebar = document.getElementById('admin-sidebar');
  if (!sidebar) return;

  const roleLabel = isAdmin(profile) ? 'Administrador' : 'Editor';
  const adminSection = isAdmin(profile)
    ? '<p class="admin-nav__heading">Administração</p>' + navLinks(NAV_ADMIN, active)
    : '';

  sidebar.innerHTML =
    '<div class="admin-brand">' +
      '<a class="admin-brand__name" href="index.html">The Cultural Cut</a>' +
      '<span class="admin-brand__tag">Painel da redação</span>' +
    '</div>' +
    '<nav class="admin-nav" aria-label="Painel">' +
      navLinks(NAV, active) +
      adminSection +
    '</nav>' +
    '<div class="admin-user">' +
      '<div class="admin-user__info">' +
        '<span class="admin-user__name">' + escapeHtml(profile.name || profile.email) + '</span>' +
        '<span class="admin-user__role">' + roleLabel + '</span>' +
      '</div>' +
      '<div class="admin-user__actions">' +
        '<a href="../index.html">Ver o site</a>' +
        '<button type="button" class="admin-user__logout" id="admin-logout">Sair</button>' +
      '</div>' +
    '</div>';

  document.getElementById('admin-logout').addEventListener('click', () => signOut());
}

// ---------- Barra do topo e menu do celular ----------
function setupMobileMenu() {
  const sidebar = document.getElementById('admin-sidebar');
  const topbar = document.getElementById('admin-topbar');
  if (!sidebar || !topbar) return;

  topbar.innerHTML =
    '<a class="admin-brand__name" href="index.html">The Cultural Cut</a>' +
    '<button type="button" class="admin-menu-btn" aria-expanded="false" ' +
      'aria-controls="admin-sidebar" aria-label="Abrir menu">' + ICON_MENU + '</button>';

  const backdrop = document.createElement('div');
  backdrop.className = 'admin-backdrop';
  document.body.appendChild(backdrop);

  const button = topbar.querySelector('.admin-menu-btn');

  function setOpen(open) {
    sidebar.classList.toggle('is-open', open);
    backdrop.classList.toggle('is-open', open);
    button.setAttribute('aria-expanded', String(open));
    button.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
    button.innerHTML = open ? ICON_CLOSE : ICON_MENU;
    if (open) {
      const first = sidebar.querySelector('a');
      if (first) first.focus();
    }
  }

  button.addEventListener('click', () => setOpen(!sidebar.classList.contains('is-open')));
  backdrop.addEventListener('click', () => setOpen(false));

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && sidebar.classList.contains('is-open')) {
      setOpen(false);
      button.focus();
    }
  });

  // Se a janela ficar larga, o menu vira fixo e a gaveta fecha
  window.matchMedia('(min-width: 901px)').addEventListener('change', (event) => {
    if (event.matches) setOpen(false);
  });
}

// ---------- Início ----------
export async function initAdminLayout({ active = '', adminOnly = false } = {}) {
  // Se não estiver logado ou não tiver permissão, a página já é redirecionada aqui
  const profile = await requireStaff({ adminOnly });
  renderSidebar(profile, active);
  setupMobileMenu();
  return profile;
}