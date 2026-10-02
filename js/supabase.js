// js/supabase.js
// Conexão única com o Supabase. Todas as outras páginas importam daqui.

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://qysaeowstxcdmowaygxs.supabase.co';
const SUPABASE_KEY = 'sb_publishable_cAVO1yoOhtvSgZqtdF8XxA_ktlcF_Ck';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Nome do bucket de imagens no Storage
export const BUCKET = 'media';

// Converte o caminho salvo no banco (ex.: "articles/capa.jpg")
// no endereço público da imagem.
export function imageUrl(path) {
  if (!path) return '';
  if (path.startsWith('http')) return path; // já é um link completo
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}        