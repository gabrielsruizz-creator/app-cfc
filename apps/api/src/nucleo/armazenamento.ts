import { createReadStream } from 'node:fs';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';

/**
 * Porta de armazenamento de arquivos. O armazenamento é infraestrutura (como o banco):
 * desenvolvimento usa disco local; produção deve usar um adaptador S3 compatível com bucket privado.
 */
export interface Armazenamento {
  salvar(chave: string, conteudo: Buffer, mime: string): Promise<void>;
  ler(chave: string): Promise<Readable | null>;
}

export class ArmazenamentoLocal implements Armazenamento {
  constructor(private readonly raiz: string) {}

  private caminho(chave: string) {
    const destino = path.resolve(this.raiz, chave);
    if (!destino.startsWith(path.resolve(this.raiz) + path.sep)) throw new Error('Chave inválida');
    return destino;
  }

  async salvar(chave: string, conteudo: Buffer): Promise<void> {
    const destino = this.caminho(chave);
    await mkdir(path.dirname(destino), { recursive: true });
    await writeFile(destino, conteudo, { mode: 0o600 });
  }

  async ler(chave: string): Promise<Readable | null> {
    const origem = this.caminho(chave);
    try {
      await stat(origem);
    } catch {
      return null;
    }
    return createReadStream(origem);
  }
}
