// admin/js/imagens.js
// Envio de imagens para o Storage (bucket "media"). Reduz o tamanho da foto
// antes de enviar, para o site carregar rápido e caber no limite de 5 MB.
//
// Uso:
//   const { path, url } = await uploadImage(arquivo, { folder: 'articles' });
//   path → o que fica salvo no banco (ex.: "articles/abc-foto.webp")
//   url  → o endereço completo da imagem (para colocar dentro do texto)

import { supabase, BUCKET, imageUrl } from '../../js/supabase.js';
import { slugify } from '../../js/utils.js';

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_INPUT_MB = 25;  // tamanho máximo do arquivo original
const MAX_UPLOAD_MB = 5;  // limite do bucket no Supabase
const MAX_SIDE = 1800;    // maior lado da imagem, em pixels
const QUALITY = 0.85;

const EXTENSIONS = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
};

export const ACCEPT_ATTR = ACCEPTED.join(',');

export function isSupportedImage(file) {
  return Boolean(file) && ACCEPTED.includes(file.type);
}

// ---------- Abrir a imagem ----------
async function loadImage(file) {
  if ('createImageBitmap' in window) {
    try {
      // "from-image" respeita a rotação da foto de celular
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch (error) {
      // segue para o plano B
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function sizeOf(image) {
  return {
    width: image.naturalWidth || image.width,
    height: image.naturalHeight || image.height,
  };
}

function toBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

// ---------- Reduzir ----------
// Devolve o arquivo original se ele já for pequeno ou se for GIF (pode ser animado).
async function shrink(file) {
  if (file.type === 'image/gif') return file;

  const image = await loadImage(file);
  const { width, height } = sizeOf(image);
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  canvas.getContext('2d').drawImage(image, 0, 0, targetWidth, targetHeight);
  if (typeof image.close === 'function') image.close();

  // WebP é menor; se o navegador não gerar WebP, usa JPEG
  let blob = await toBlob(canvas, 'image/webp', QUALITY);
  if (!blob || blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg', QUALITY);
  if (!blob) return file;

  // Se a versão "reduzida" ficou maior que a original e nada foi redimensionado, mantém a original
  if (scale === 1 && blob.size >= file.size) return file;
  return blob;
}

// ---------- Nome do arquivo ----------
function buildPath(folder, originalName, type) {
  const base = slugify(String(originalName || '').replace(/\.[^.]+$/, '')).slice(0, 40) || 'imagem';
  const unique = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const extension = EXTENSIONS[type] || 'jpg';
  return folder + '/' + unique + '-' + base + '.' + extension;
}

// ---------- Mensagens de erro em português ----------
function describeError(error) {
  const text = String((error && error.message) || '').toLowerCase();
  const status = String((error && (error.statusCode || error.status)) || '');

  if (text.includes('row-level security') || status === '403' || status === '401') {
    return 'Você não tem permissão para enviar imagens.';
  }
  if (text.includes('exceeded') || text.includes('too large') || status === '413') {
    return 'A imagem é grande demais (limite de ' + MAX_UPLOAD_MB + ' MB).';
  }
  if (text.includes('mime') || text.includes('not allowed') || text.includes('not supported')) {
    return 'Esse tipo de arquivo não é aceito. Use JPG, PNG, WebP ou GIF.';
  }
  return 'Não foi possível enviar a imagem. Confira a conexão e tente de novo.';
}

// ---------- Enviar ----------
// folder: 'articles' ou 'reviews' (as pastas liberadas pelas regras do Storage)
export async function uploadImage(file, { folder = 'articles' } = {}) {
  if (!isSupportedImage(file)) {
    throw new Error('Esse tipo de arquivo não é aceito. Use JPG, PNG, WebP ou GIF.');
  }
  if (file.size > MAX_INPUT_MB * 1024 * 1024) {
    throw new Error('O arquivo é grande demais (máximo ' + MAX_INPUT_MB + ' MB).');
  }

  let blob;
  try {
    blob = await shrink(file);
  } catch (error) {
    console.error('Erro ao reduzir a imagem:', error);
    throw new Error('Não foi possível ler essa imagem. Tente outro arquivo.');
  }

  if (blob.size > MAX_UPLOAD_MB * 1024 * 1024) {
    throw new Error('A imagem é grande demais (limite de ' + MAX_UPLOAD_MB + ' MB).');
  }

  const type = blob.type || file.type;
  const path = buildPath(folder, file.name, type);

  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: type,
    cacheControl: '31536000',
    upsert: false,
  });

  if (error) {
    console.error('Erro ao enviar a imagem:', error);
    throw new Error(describeError(error));
  }

  return { path, url: imageUrl(path) };
}