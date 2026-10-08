import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * Cifra dados sensíveis (ex.: chave Pix) com AES-256-GCM antes de gravar no banco.
 * A chave vem de CHAVE_CIFRAGEM (qualquer texto longo; é derivada com SHA-256).
 * Em desenvolvimento há uma chave padrão; em produção ela é obrigatória.
 */
function chave(): Buffer {
  const segredo = process.env.CHAVE_CIFRAGEM;
  if (!segredo && process.env.NODE_ENV === 'production') {
    throw new Error('Defina CHAVE_CIFRAGEM em produção');
  }
  return createHash('sha256').update(segredo ?? 'volante-desenvolvimento-nao-usar-em-producao').digest();
}

export function cifrar(texto: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', chave(), iv);
  const dados = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), dados.toString('base64')].join('.');
}

export function decifrar(cifrado: string): string {
  const [versao, iv, tag, dados] = cifrado.split('.');
  if (versao !== 'v1' || !iv || !tag || !dados) throw new Error('Formato cifrado desconhecido');
  const d = createDecipheriv('aes-256-gcm', chave(), Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(dados, 'base64')), d.final()]).toString('utf8');
}

/** Mostra só o começo e o fim da chave Pix (ex.: "529.***.***-25", "ma***@gmail.com"). */
export function mascararChavePix(chave: string, tipo: string): string {
  if (tipo === 'email') {
    const [u, d] = chave.split('@');
    return `${(u ?? '').slice(0, 2)}***@${d ?? ''}`;
  }
  if (chave.length <= 6) return '***';
  return `${chave.slice(0, 3)}***${chave.slice(-2)}`;
}
