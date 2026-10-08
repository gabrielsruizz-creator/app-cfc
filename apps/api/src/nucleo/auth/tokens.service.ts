import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';
import { CONFIG, type Config } from '../../config';

export const DURACAO_ACESSO_MIN = 15;
export const DURACAO_REFRESH_DIAS = 30;

@Injectable()
export class TokensService {
  private readonly chave: Uint8Array;

  constructor(@Inject(CONFIG) config: Config) {
    this.chave = new TextEncoder().encode(config.JWT_SEGREDO);
  }

  async emitirAcesso(
    usuarioId: string,
    sessaoId: string,
  ): Promise<{ token: string; expiraEm: Date }> {
    const expiraEm = new Date(Date.now() + DURACAO_ACESSO_MIN * 60_000);
    const token = await new SignJWT({ sid: sessaoId })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(usuarioId)
      .setIssuedAt()
      .setExpirationTime(Math.floor(expiraEm.getTime() / 1000))
      .sign(this.chave);
    return { token, expiraEm };
  }

  async verificarAcesso(token: string): Promise<{ usuarioId: string; sessaoId: string } | null> {
    try {
      const { payload } = await jwtVerify(token, this.chave, { algorithms: ['HS256'] });
      if (!payload.sub || typeof payload.sid !== 'string') return null;
      return { usuarioId: payload.sub, sessaoId: payload.sid };
    } catch {
      return null;
    }
  }

  novoRefresh(): { token: string; hash: string } {
    const token = randomBytes(32).toString('base64url');
    return { token, hash: TokensService.hash(token) };
  }

  static hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
