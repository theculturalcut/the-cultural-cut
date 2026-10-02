// admin/js/configuracoes.js
// Configurações do site (só para administradores): descrição, contato e redes sociais.
// A descrição e as redes aparecem no rodapé; o e-mail aparece nas páginas Contato e Publicidade.

import { supabase } from '../../js/supabase.js';
import { escapeHtml } from '../../js/utils.js';
import { initAdminLayout } from './layout.js';

// Quem não é administrador volta para o dashboard
await initAdminLayout({ active: 'configuracoes', adminOnly: true });

// Cada campo da tela e a chave dele na tabela "settings"
const FIELDS = [
  { key: 'site_description', id: 'cfg-descricao', label: 'Descrição do site', type: 'text' },
  { key: 'contact_email', id: 'cfg-email', label: 'E-mail de contato', type: 'email' },
  { key: 'social_instagram', id: 'cfg-instagram', label: 'Instagram', type: 'url' },
  { key: 'social_x', id: 'cfg-x', label: 'Twitter (X)', type: 'url' },
  { key: 'social_tiktok', id: 'cfg-tiktok', label: 'TikTok', type: 'url' },
  { key: 'social_youtube', id: 'cfg-youtube', label: 'YouTube', type: 'url' },
];

const $ = (id) => document.getElementById(id);
const els = {
  form: $('form-config'),
  save: $('config-salvar'),
  saveState: $('config-estado'),
  errors: $('config-erros'),
  notice: $('config-aviso'),
  counter: $('contador-descricao'),
};

let dirty = false;
let saving = false;

function setDirty(value) {
  dirty = value;
  els.saveState.textContent = value ? 'Alterações não salvas' : '';
}

function showErrors(errors) {
  FIELDS.forEach((field) => $(field.id).removeAttribute('aria-invalid'));

  if (errors.length === 0) { els.errors.hidden = true; return; }

  els.notice.hidden = true;
  els.errors.innerHTML =
    '<strong>Corrija antes de salvar:</strong><ul>' +
    errors.map((e) => '<li><a href="#' + e.id + '">' + escapeHtml(e.message) + '</a></li>').join('') +
    '</ul>';
  els.errors.hidden = false;

  errors.forEach((e) => $(e.id).setAttribute('aria-invalid', 'true'));
  $(errors[0].id).focus();
}

// Só aceita endereços https:// (evita links perigosos no rodapé do site)
function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === 'https:';
  } catch (error) {
    return false;
  }
}

function validate(values) {
  const errors = [];
  FIELDS.forEach((field) => {
    const value = values[field.key];
    if (!value) return;

    if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      errors.push({ id: field.id, message: field.label + ': informe um e-mail válido.' });
    }
    if (field.type === 'url' && !isHttpsUrl(value)) {
      errors.push({ id: field.id, message: field.label + ': use um endereço completo que comece com https://' });
    }
  });
  return errors;
}

function readValues() {
  const values = {};
  FIELDS.forEach((field) => { values[field.key] = $(field.id).value.trim(); });
  return values;
}

async function save() {
  if (saving) return;

  const values = readValues();
  const errors = validate(values);
  showErrors(errors);
  if (errors.length > 0) return;

  saving = true;
  els.save.disabled = true;
  els.save.textContent = 'Salvando...';

  const rows = FIELDS.map((field) => ({ key: field.key, value: values[field.key] }));
  const { error } = await supabase.from('settings').upsert(rows, { onConflict: 'key' });

  saving = false;
  els.save.disabled = false;
  els.save.textContent = 'Salvar configurações';

  if (error) {
    console.error('Erro ao salvar as configurações:', error);
    els.notice.hidden = true;
    els.errors.textContent = 'Não foi possível salvar. Confira a conexão e tente novamente.';
    els.errors.hidden = false;
    return;
  }

  setDirty(false);
  els.errors.hidden = true;
  els.notice.textContent = 'Configurações salvas. Elas já valem no site.';
  els.notice.hidden = false;
  window.scrollTo({ top: 0 });
}

async function init() {
  const { data, error } = await supabase.from('settings').select('key, value');

  if (error) {
    console.error('Erro ao carregar as configurações:', error);
    els.errors.textContent = 'Não foi possível carregar as configurações. Recarregue a página.';
    els.errors.hidden = false;
    els.save.disabled = true;
    return;
  }

  const saved = {};
  (data || []).forEach((row) => { saved[row.key] = row.value; });
  FIELDS.forEach((field) => { $(field.id).value = saved[field.key] || ''; });

  const description = $('cfg-descricao');
  const updateCounter = () => { els.counter.textContent = String(description.value.length); };
  description.addEventListener('input', updateCounter);
  updateCounter();

  els.form.addEventListener('input', () => setDirty(true));
  els.form.addEventListener('submit', (event) => { event.preventDefault(); save(); });

  window.addEventListener('beforeunload', (event) => {
    if (!dirty) return;
    event.preventDefault();
    event.returnValue = '';
  });
}

init();