import { AVATAR_MAX_BYTES, AVATAR_MIME_TYPES } from 'mintly-lib';

/** Valor do `accept` do `<input type="file">` da foto de perfil. */
export const AVATAR_ACCEPT = AVATAR_MIME_TYPES.join(',');

/**
 * Valida (tipo e tamanho, os mesmos limites da API/lib) e lê a foto escolhida como data URL.
 * Rejeita com um `Error` de mensagem pronta pra mostrar ao usuário.
 */
export function readAvatarFile(file: File): Promise<string> {
  if (!(AVATAR_MIME_TYPES as readonly string[]).includes(file.type)) {
    return Promise.reject(new Error('Formato não aceito. Use JPG, PNG ou WebP.'));
  }
  if (file.size > AVATAR_MAX_BYTES) {
    return Promise.reject(
      new Error(`Imagem muito grande (${(file.size / 1024 / 1024).toFixed(1)}MB). Máximo de 1MB.`),
    );
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Não foi possível ler a imagem. Tente outro arquivo.'));
    reader.readAsDataURL(file);
  });
}
