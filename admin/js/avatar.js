// admin/js/avatar.js
// Seletor de foto de perfil (envio, prévia, remoção, arrastar e soltar).
// Usado na tela de Usuários e em Meu perfil. A página precisa ter os elementos
// com os ids: avatar-area, avatar-moldura, avatar-imagem, avatar-inicial,
// avatar-escolher, avatar-remover, avatar-status e avatar-arquivo.

import { imageUrl } from '../../js/supabase.js';
import { uploadImage, isSupportedImage } from './imagens.js';

const HINT = 'Foto quadrada fica melhor. JPG, PNG, WebP ou GIF; você também pode arrastar a imagem para cá.';

export function createAvatarPicker({ onChange } = {}) {
  const $ = (id) => document.getElementById(id);
  const area = $('avatar-area');
  const image = $('avatar-imagem');
  const initial = $('avatar-inicial');
  const pick = $('avatar-escolher');
  const remove = $('avatar-remover');
  const status = $('avatar-status');
  const file = $('avatar-arquivo');

  let path = null; // caminho da foto no Storage (ou null, se não tem foto)
  let letter = '?';

  function render() {
    initial.textContent = letter;
    if (path) {
      image.src = imageUrl(path);
      image.hidden = false;
      initial.hidden = true;
    } else {
      image.hidden = true;
      image.removeAttribute('src');
      initial.hidden = false;
    }
    remove.hidden = !path;
  }

  function setStatus(text, isError = false) {
    status.textContent = text;
    status.classList.toggle('is-error', isError);
  }

  async function upload(chosen) {
    pick.disabled = true;
    setStatus('Enviando foto...');
    try {
      const result = await uploadImage(chosen, { folder: 'authors' });
      path = result.path;
      render();
      setStatus('Foto enviada. Salve para aplicar.');
      if (onChange) onChange();
    } catch (error) {
      setStatus(error.message, true);
    } finally {
      pick.disabled = false;
    }
  }

  // Se a foto não carregar, volta para a inicial do nome
  image.addEventListener('error', () => {
    image.hidden = true;
    initial.hidden = false;
  });

  pick.addEventListener('click', () => file.click());
  file.addEventListener('change', () => {
    const chosen = file.files && file.files[0];
    file.value = '';
    if (chosen) upload(chosen);
  });
  remove.addEventListener('click', () => {
    path = null;
    render();
    setStatus(HINT);
    if (onChange) onChange();
  });

  // Arrastar e soltar
  ['dragenter', 'dragover'].forEach((name) =>
    area.addEventListener(name, () => area.classList.add('is-dragover')));
  ['dragleave', 'drop'].forEach((name) =>
    area.addEventListener(name, () => area.classList.remove('is-dragover')));
  area.addEventListener('dragover', (event) => {
    if (event.dataTransfer && event.dataTransfer.types.includes('Files')) event.preventDefault();
  });
  area.addEventListener('drop', (event) => {
    const files = event.dataTransfer && event.dataTransfer.files;
    if (!files || files.length === 0) return;
    event.preventDefault();
    const chosen = Array.from(files).find(isSupportedImage);
    if (!chosen) { setStatus('Só é possível enviar imagens JPG, PNG, WebP ou GIF.', true); return; }
    upload(chosen);
  });

  render();
  setStatus(HINT);

  return {
    get: () => path,
    set(newPath) { path = newPath || null; render(); setStatus(HINT); },
    setInitial(name) {
      letter = String(name || '?').trim().charAt(0).toUpperCase() || '?';
      render();
    },
  };
}