import { payloadsEventos, type PayloadEvento, type TipoEvento } from '@volante/contracts';
import type { Executor } from './cliente';
import { outboxEventos } from './schema';

export type NovoEvento<T extends TipoEvento> = {
  tipo: T;
  agregadoTipo: string;
  agregadoId: string;
  autoescolaId?: string | null;
  payload: PayloadEvento<T>;
};

/**
 * Grava um evento de domínio na outbox. Deve ser chamado dentro da mesma transação
 * que alterou o estado, para que evento e mudança sejam gravados juntos ou nenhum dos dois.
 */
export async function publicarEvento<T extends TipoEvento>(tx: Executor, evento: NovoEvento<T>) {
  const payload = payloadsEventos[evento.tipo].parse(evento.payload);
  const [linha] = await tx
    .insert(outboxEventos)
    .values({
      tipo: evento.tipo,
      agregadoTipo: evento.agregadoTipo,
      agregadoId: evento.agregadoId,
      autoescolaId: evento.autoescolaId ?? null,
      payload,
    })
    .returning({ id: outboxEventos.id });
  return linha!.id;
}
