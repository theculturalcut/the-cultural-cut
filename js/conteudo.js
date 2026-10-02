// js/conteudo.js
// Ajudantes das páginas de artigo e review: transforma o texto (Markdown)
// em HTML seguro, atualiza título/descrição da página, calcula tempo de
// leitura e conta visualizações.

import { marked } from 'https://cdn.jsdelivr.net/npm/marked@13/+esm';
import DOMPurify from 'https://cdn.jsdelivr.net/npm/dompurify@3/+esm';
import { supabase, imageUrl } from './supabase.js';

const SITE_NAME = 'The Cultural Cut';

// ---------- Texto (Markdown) → HTML seguro ----------
// O texto dos artigos é escrito em Markdown (## Título, **negrito**, - lista...).
// O DOMPurify remove qualquer código perigoso (scripts, onclick etc.) antes de exibir.
export function renderMarkdown(text) {
  const rawHtml = marked.parse(String(text ?? ''), { gfm: true, breaks: false, async: false });
  const cleanHtml = DOMPurify.sanitize(rawHtml, {
    FORBID_TAGS: ['style'],
    FORBID_ATTR: ['style'],
  });

  const template = document.createElement('template');
  template.innerHTML = cleanHtml;

  // A página já tem um título principal (h1): títulos "#" viram "##"
  template.content.querySelectorAll('h1').forEach((h1) => {
    const h2 = document.createElement('h2');
    h2.innerHTML = h1.innerHTML;
    h1.replaceWith(h2);
  });

  // Links externos abrem em nova aba, de forma segura
  template.content.querySelectorAll('a[href]').forEach((link) => {
    if (/^https?:\/\//i.test(link.getAttribute('href') || '')) {
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
    }
  });

  // Imagens: carregam só quando chegam perto da tela.
  // Com legenda, ![descrição](endereço "legenda"), viram figura com texto embaixo.
  template.content.querySelectorAll('img').forEach((img) => {
    img.setAttribute('loading', 'lazy');

    const caption = img.getAttribute('title');
    const parent = img.parentElement;
    if (!caption || !parent || parent.tagName !== 'P' || parent.childNodes.length !== 1) return;

    img.removeAttribute('title');
    const figure = document.createElement('figure');
    const figcaption = document.createElement('figcaption');
    figcaption.textContent = caption;
    figure.appendChild(img);
    figure.appendChild(figcaption);
    parent.replaceWith(figure);
  });

  // Tabelas largas rolam para o lado em vez de estourar a página
  template.content.querySelectorAll('table').forEach((table) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'table-scroll';
    table.replaceWith(wrapper);
    wrapper.appendChild(table);
  });

  return template.innerHTML;
}

// ---------- Tempo de leitura ----------
export function readingTime(text) {
  const words = String(text ?? '').trim().split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.round(words / 200));
  return minutes + ' min de leitura';
}

// ---------- Título e descrição da página (aba do navegador e compartilhamento) ----------
function setMeta(attribute, key, value) {
  if (!value) return;
  let element = document.head.querySelector('meta[' + attribute + '="' + key + '"]');
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.setAttribute('content', value);
}

export function setPageMeta({ title, description, image, type = 'website' } = {}) {
  const fullTitle = title ? title + ' | ' + SITE_NAME : SITE_NAME;
  document.title = fullTitle;

  setMeta('name', 'description', description);
  setMeta('property', 'og:site_name', SITE_NAME);
  setMeta('property', 'og:type', type);
  setMeta('property', 'og:title', fullTitle);
  setMeta('property', 'og:description', description);
  setMeta('property', 'og:url', window.location.href);
  if (image) {
    setMeta('property', 'og:image', imageUrl(image));
    setMeta('name', 'twitter:card', 'summary_large_image');
  }
}

// ---------- Contador de visualizações ----------
// Conta uma vez por aba do navegador (atualizar a página não conta de novo).
// table: 'posts' ou 'reviews'
export function countView(table, slug) {
  const key = 'tcc-view:' + table + ':' + slug;
  try {
    if (window.sessionStorage.getItem(key)) return;
    window.sessionStorage.setItem(key, '1');
  } catch (error) {
    // se o navegador bloquear o armazenamento, conta mesmo assim
  }
  supabase.rpc('increment_views', { p_table: table, p_slug: slug }).then(({ error }) => {
    if (error) console.warn('Não foi possível registrar a visualização:', error.message);
  });
}