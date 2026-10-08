import type { Executor } from './cliente';
import type { Ator } from './contexto';
import { registrosAuditoria } from './schema';

export type RegistroAuditoria = {
  ator: Ator;
  entidadeTipo: string;
  entidadeId: string;
  acao: string;
  antes?: unknown;
  depois?: unknown;
  motivo?: string | null;
  autoescolaId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
};

/** Grava um registro na auditoria imutável (o hash encadeado é calculado por trigger). */
export async function auditar(tx: Executor, r: RegistroAuditoria): Promise<void> {
  await tx.insert(registrosAuditoria).values({
    atorUsuarioId: r.ator.usuarioId ?? null,
    atorTipo: r.ator.tipo,
    autoescolaId: r.autoescolaId ?? r.ator.autoescolaId ?? null,
    entidadeTipo: r.entidadeTipo,
    entidadeId: r.entidadeId,
    acao: r.acao,
    antes: (r.antes ?? null) as never,
    depois: (r.depois ?? null) as never,
    motivo: r.motivo ?? null,
    ip: r.ip ?? null,
    userAgent: r.userAgent ?? null,
    requestId: r.requestId ?? null,
  });
}
