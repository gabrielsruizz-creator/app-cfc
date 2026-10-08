import {
  createParamDecorator,
  type ExecutionContext,
  ForbiddenException,
  SetMetadata,
} from '@nestjs/common';
import type { Ator } from '@volante/db';

export type Sessao = {
  usuarioId: string;
  sessaoId: string;
  nome: string;
  alunoId: string | null;
  instrutorId: string | null;
  instrutorStatus: string | null;
  adminNivel: string | null;
  autoescolas: { autoescolaId: string; papel: string }[];
  ip: string | null;
  userAgent: string | null;
};

export const ROTA_PUBLICA = 'rotaPublica';
/** Marca a rota como acessível sem login. */
export const Publico = () => SetMetadata(ROTA_PUBLICA, true);

export const SessaoAtual = createParamDecorator((_: unknown, ctx: ExecutionContext): Sessao => {
  return ctx.switchToHttp().getRequest().sessao;
});

export const SessaoOpcional = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): Sessao | null => {
    return ctx.switchToHttp().getRequest().sessao ?? null;
  },
);

export const negar = (codigo: string, mensagem: string) =>
  new ForbiddenException({ codigo, mensagem });

export function atorUsuario(s: Sessao): Ator {
  return { tipo: 'anonimo', usuarioId: s.usuarioId };
}

export function atorAluno(s: Sessao): Ator & { alunoId: string } {
  if (!s.alunoId)
    throw negar('perfil_aluno_necessario', 'Complete seu cadastro de aluno para continuar');
  return { tipo: 'aluno', usuarioId: s.usuarioId, alunoId: s.alunoId };
}

export function atorInstrutor(s: Sessao): Ator & { instrutorId: string } {
  if (!s.instrutorId)
    throw negar('perfil_instrutor_necessario', 'Você ainda não tem cadastro de instrutor');
  return { tipo: 'instrutor', usuarioId: s.usuarioId, instrutorId: s.instrutorId };
}

export function atorAdmin(s: Sessao): Ator {
  if (!s.adminNivel) throw negar('acesso_negado', 'Acesso restrito à administração');
  return { tipo: 'admin', usuarioId: s.usuarioId };
}

export function atorAutoescola(
  s: Sessao,
  autoescolaId: string | undefined,
): Ator & { autoescolaId: string } {
  if (!autoescolaId || !s.autoescolas.some((a) => a.autoescolaId === autoescolaId)) {
    throw negar('acesso_negado', 'Você não faz parte desta autoescola');
  }
  return { tipo: 'autoescola', usuarioId: s.usuarioId, autoescolaId };
}
