// js/contato.js
// Páginas "Contato" e "Publicidade": coloca o e-mail das Configurações do painel
// no lugar de todo elemento marcado com data-contato-email.

import { supabase } from './supabase.js';

async function init() {
  const targets = document.querySelectorAll('[data-contato-email]');
  if (targets.length === 0) return;

  try {
    const { data } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'contact_email')
      .maybeSingle();

    const email = data && data.value ? String(data.value).trim() : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return; // mantém o texto padrão

    targets.forEach((target) => {
      const link = document.createElement('a');
      link.href = 'mailto:' + email;
      link.textContent = email;
      target.replaceChildren(link);
    });
  } catch (error) {
    // se der erro, o texto padrão continua na página
  }
}

init();