// js/conteudo.js
// Ajudantes das páginas de artigo e review: transforma o texto (Markdown)
// em HTML seguro, atualiza título/descrição da página, calcula tempo de
// leitura e conta visualizações.

import { marked } from 'https://cdn.jsdelivr.net/npm/marked@13/+esm';
import DOMPurify from 'https://cdn.jsdelivr.net/npm/dompurify@3/+esm';
import { supabase, imageUrl } from './supabase.js';

const SITE_NAME = 'The Cultural Cut';

// ---------- Vídeos e músicas incorporados (YouTube e Spotify) ----------
// Só estes dois sites são aceitos. Qualquer outro endereço (ou iframe) é ignorado.
// O endereço é sempre reescrito por nós em um formato fixo, nunca usado como veio.
const YOUTUBE_HOSTS = [
  'youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com',
  'youtube-nocookie.com', 'www.youtube-nocookie.com',
];
const YOUTUBE_ID = /^[A-Za-z0-9_-]{6,20}$/;
const YOUTUBE_LIST = /^[A-Za-z0-9_-]{10,60}$/;
const SPOTIFY_TYPES = ['track', 'album', 'playlist', 'episode', 'show', 'artist'];
const SPOTIFY_ID = /^[A-Za-z0-9]{10,30}$/;

// "90", "1m30s", "1h2m3s" → segundos
function parseStart(value) {
  if (!value) return 0;
  if (/^\d+$/.test(value)) return Number(value);
  const match = String(value).match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!match || !match[0]) return 0;
  return Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0);
}

// Recebe um link do YouTube/Spotify OU o código <iframe> inteiro e devolve
// { kind, url, title, height, allow } com o endereço seguro, ou null se não for aceito.
export function parseEmbed(input) {
  const text = String(input ?? '').trim();
  if (!text) return null;

  const iframe = text.match(/<iframe\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i);
  const raw = (iframe ? iframe[1] : text).replace(/&amp;/g, '&').trim();

  let link;
  try { link = new URL(raw); } catch (error) { return null; }
  if (link.protocol !== 'https:' && link.protocol !== 'http:') return null;

  const host = link.hostname.toLowerCase();
  const parts = link.pathname.split('/').filter(Boolean);

  // ----- YouTube -----
  if (host === 'youtu.be' || YOUTUBE_HOSTS.includes(host)) {
    let id = '';
    let list = '';

    if (host === 'youtu.be') {
      id = parts[0] || '';
    } else if (parts[0] === 'watch') {
      id = link.searchParams.get('v') || '';
    } else if (['embed', 'shorts', 'live', 'v'].includes(parts[0])) {
      id = parts[1] || '';
    } else if (parts[0] === 'playlist') {
      list = link.searchParams.get('list') || '';
    }
    if (id === 'videoseries') { id = ''; list = link.searchParams.get('list') || ''; }

    const base = 'https://www.youtube-nocookie.com/embed/';
    const allow = 'accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';

    if (id && YOUTUBE_ID.test(id)) {
      const start = parseStart(link.searchParams.get('start') || link.searchParams.get('t'));
      return { kind: 'youtube', url: base + id + (start > 0 ? '?start=' + start : ''), title: 'Vídeo do YouTube', allow };
    }
    if (list && YOUTUBE_LIST.test(list)) {
      return { kind: 'youtube', url: base + 'videoseries?list=' + list, title: 'Playlist do YouTube', allow };
    }
    return null;
  }

  // ----- Spotify -----
  if (host === 'open.spotify.com') {
    const clean = parts.filter((part) => !/^intl-[a-z-]+$/i.test(part) && part !== 'embed');
    const type = clean[0];
    const id = clean[1];
    if (SPOTIFY_TYPES.includes(type) && SPOTIFY_ID.test(id || '')) {
      return {
        kind: 'spotify',
        url: 'https://open.spotify.com/embed/' + type + '/' + id,
        title: 'Player do Spotify',
        height: type === 'track' || type === 'episode' ? 152 : 352,
        allow: 'encrypted-media; clipboard-write; fullscreen; picture-in-picture',
      };
    }
  }

  return null;
}

// Monta o player com atributos fixos (o endereço já foi validado por parseEmbed)
function buildEmbed(embed) {
  const wrapper = document.createElement('div');
  wrapper.className = 'embed embed--' + embed.kind;

  const frame = document.createElement('iframe');
  frame.setAttribute('src', embed.url);
  frame.setAttribute('title', embed.title);
  frame.setAttribute('loading', 'lazy');
  frame.setAttribute('allow', embed.allow);
  frame.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
  if (embed.kind === 'youtube') frame.setAttribute('allowfullscreen', '');
  if (embed.height) frame.setAttribute('height', String(embed.height));

  wrapper.appendChild(frame);
  return wrapper;
}

// ---------- Texto (Markdown) → HTML seguro ----------
// O texto dos artigos é escrito em Markdown (## Título, **negrito**, - lista...).
// O DOMPurify remove qualquer código perigoso (scripts, onclick etc.) antes de exibir.
export function renderMarkdown(text) {
  // Código <iframe> colado no texto: se for do YouTube ou do Spotify, vira [embed](link)
  const source = String(text ?? '').replace(/<iframe\b[^>]*>(?:\s*<\/iframe>)?/gi, (tag) => {
    const embed = parseEmbed(tag);
    return embed ? '\n\n[embed](' + embed.url + ')\n\n' : tag;
  });

  const rawHtml = marked.parse(source, { gfm: true, breaks: false, async: false });
  const cleanHtml = DOMPurify.sanitize(rawHtml, {
    FORBID_TAGS: ['style'],
    FORBID_ATTR: ['style'],
  });

  const template = document.createElement('template');
  template.innerHTML = cleanHtml;

  // Parágrafo com só [embed](link) de YouTube/Spotify vira o player.
  // Se o link não for aceito, continua como link comum.
  template.content.querySelectorAll('p').forEach((paragraph) => {
    const link = paragraph.childNodes.length === 1 ? paragraph.firstElementChild : null;
    if (!link || link.tagName !== 'A' || link.textContent.trim().toLowerCase() !== 'embed') return;
    const embed = parseEmbed(link.getAttribute('href'));
    if (embed) paragraph.replaceWith(buildEmbed(embed));
  });

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
