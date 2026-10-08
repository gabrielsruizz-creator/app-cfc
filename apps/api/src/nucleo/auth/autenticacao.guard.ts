import { type CanActivate, type ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  adminsPlataforma,
  alunos,
  and,
  autoescolaMembros,
  eq,
  instrutores,
  sessoes,
  usuarios,
} from '@volante/db';
import type { Request } from 'express';
import { BancoService } from '../banco.service';
import { ROTA_PUBLICA, type Sessao } from './sessao';
import { TokensService } from './tokens.service';

/**
 * Guard global: valida o token de acesso e carrega os perfis do usuário (aluno, instrutor,
 * autoescolas, admin). Rotas marcadas com @Publico() funcionam sem login, mas recebem a sessão
 * se o token for enviado.
 */
@Injectable()
export class AutenticacaoGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokensService,
    private readonly banco: BancoService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const publico = this.reflector.getAllAndOverride<boolean>(ROTA_PUBLICA, [ctx.getHandler(), ctx.getClass()]);
    const req = ctx.switchToHttp().getRequest<Request & { sessao?: Sessao }>();
    const cabecalho = req.headers.authorization;
    const token = cabecalho?.startsWith('Bearer ') ? cabecalho.slice(7) : null;

    if (!token) {
      if (publico) return true;
      throw new UnauthorizedException();
    }
    const sessao = await this.carregar(token, req);
    if (!sessao) {
      if (publico) return true;
      throw new UnauthorizedException();
    }
    req.sessao = sessao;
    return true;
  }

  private async carregar(token: string, req: Request): Promise<Sessao | null> {
    const dados = await this.tokens.verificarAcesso(token);
    if (!dados) return null;
    const db = this.banco.db;
    const [linha] = await db
      .select({ usuario: usuarios, sessaoRevogada: sessoes.revogadaEm })
      .from(usuarios)
      .innerJoin(sessoes, eq(sessoes.id, dados.sessaoId))
      .where(and(eq(usuarios.id, dados.usuarioId), eq(sessoes.usuarioId, dados.usuarioId)));
    if (!linha || linha.sessaoRevogada || linha.usuario.status !== 'ativo') return null;

    const [aluno] = await db.select({ id: alunos.id }).from(alunos).where(eq(alunos.usuarioId, dados.usuarioId));
    const [instrutor] = await db
      .select({ id: instrutores.id, status: instrutores.status })
      .from(instrutores)
      .where(eq(instrutores.usuarioId, dados.usuarioId));
    const [admin] = await db
      .select({ nivel: adminsPlataforma.nivel })
      .from(adminsPlataforma)
      .where(eq(adminsPlataforma.usuarioId, dados.usuarioId));
    const vinculos = await this.banco.comAtor({ tipo: 'anonimo', usuarioId: dados.usuarioId }, (tx) =>
      tx
        .select({ autoescolaId: autoescolaMembros.autoescolaId, papel: autoescolaMembros.papel })
        .from(autoescolaMembros)
        .where(and(eq(autoescolaMembros.usuarioId, dados.usuarioId), eq(autoescolaMembros.status, 'ativo'))),
    );

    return {
      usuarioId: dados.usuarioId,
      sessaoId: dados.sessaoId,
      nome: linha.usuario.nome,
      alunoId: aluno?.id ?? null,
      instrutorId: instrutor?.id ?? null,
      instrutorStatus: instrutor?.status ?? null,
      adminNivel: admin?.nivel ?? null,
      autoescolas: vinculos,
      ip: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    };
  }
}

