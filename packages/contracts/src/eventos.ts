import { z } from 'zod';
import { id } from './comum';

/**
 * Catálogo de eventos de domínio gravados na outbox (mesma transação da mudança de estado)
 * e consumidos pelo worker. Cada payload é versionado: mudanças incompatíveis criam uma nova versão.
 */
export const payloadsEventos = {
  'usuario.cadastrado': z.object({ usuarioId: id }),
  'instrutor.enviado_analise': z.object({ instrutorId: id }),
  'instrutor.aprovado': z.object({ instrutorId: id, usuarioId: id }),
  'instrutor.reprovado': z.object({ instrutorId: id, usuarioId: id, motivo: z.string() }),
  'instrutor.bloqueado': z.object({ instrutorId: id, usuarioId: id, motivo: z.string() }),
  'instrutor.documento_vencendo': z.object({
    instrutorId: id,
    documentoId: id,
    tipo: z.string(),
    validade: z.string(),
    diasRestantes: z.number(),
  }),
  'instrutor.documento_vencido': z.object({ instrutorId: id, documentoId: id, tipo: z.string() }),
  'autoescola.enviada_analise': z.object({ autoescolaId: id }),
  'autoescola.aprovada': z.object({ autoescolaId: id }),
  'autoescola.reprovada': z.object({ autoescolaId: id, motivo: z.string() }),
  'aula.solicitada': z.object({ aulaId: id, alunoId: id, instrutorId: id }),
  'aula.confirmada': z.object({ aulaId: id, alunoId: id, instrutorId: id }),
  'aula.recusada': z.object({ aulaId: id, alunoId: id, instrutorId: id, motivo: z.string() }),
  'aula.expirada': z.object({ aulaId: id, alunoId: id, instrutorId: id, motivo: z.string() }),
  'aula.cancelada': z.object({
    aulaId: id,
    alunoId: id,
    instrutorId: id,
    canceladaPor: z.enum(['aluno', 'instrutor', 'sistema', 'admin']),
    motivo: z.string(),
  }),
  'aula.remarcada': z.object({ aulaId: id, alunoId: id, instrutorId: id }),
  'aula.checkin': z.object({ aulaId: id, alunoId: id, instrutorId: id }),
  'aula.checkout': z.object({ aulaId: id, alunoId: id, instrutorId: id }),
  'aula.concluida': z.object({ aulaId: id, alunoId: id, instrutorId: id }),
  'aula.avaliada': z.object({ aulaId: id, instrutorId: id, nota: z.number() }),
  'cobranca.solicitada': z.object({ cobrancaId: id }),
  'cobranca.paga': z.object({ cobrancaId: id, pedidoId: id }),
  'cobranca.expirada': z.object({ cobrancaId: id, pedidoId: id }),
  'pagamento.webhook_recebido': z.object({ webhookId: id, gateway: z.string() }),
  'estorno.solicitado': z.object({ estornoId: id }),
  'repasse.solicitado': z.object({ repasseId: id }),
  'pedido.criado': z.object({ pedidoId: id, alunoId: id, autoescolaId: id.nullable() }),
  'pedido.pago': z.object({ pedidoId: id, alunoId: id, autoescolaId: id.nullable() }),
  'pedido.em_contato': z.object({ pedidoId: id, autoescolaId: id }),
  'pedido.confirmado': z.object({ pedidoId: id, alunoId: id, autoescolaId: id }),
  'pedido.recusado': z.object({ pedidoId: id, alunoId: id, autoescolaId: id, motivo: z.string() }),
  'pedido.expirado': z.object({ pedidoId: id, alunoId: id, autoescolaId: id }),
  'pedido.lembrete': z.object({ pedidoId: id, autoescolaId: id }),
  'matricula.criada': z.object({ matriculaId: id, pedidoId: id, alunoId: id, autoescolaId: id }),
  'saque.solicitado': z.object({ saqueId: id }),
  'saque.concluido': z.object({ saqueId: id }),
  'mensagem.enviada': z.object({
    mensagemId: id,
    conversaId: id,
    destinatarioUsuarioIds: z.array(id),
  }),
  'instrutor.convidado': z.object({ vinculoId: id, instrutorId: id, autoescolaId: id }),
  'disputa.aberta': z.object({ disputaId: id, aulaId: id }),
  'disputa.resolvida': z.object({ disputaId: id, aulaId: id, decisao: z.string() }),
  'notificacao.criada': z.object({ notificacaoId: id }),
} as const;

export type TipoEvento = keyof typeof payloadsEventos;
export type PayloadEvento<T extends TipoEvento> = z.infer<(typeof payloadsEventos)[T]>;
export const TIPOS_EVENTO = Object.keys(payloadsEventos) as TipoEvento[];
