import type { TipoEvento } from '@volante/contracts';
import { eventosConsumidos, outboxEventos, sql, type Db } from '@volante/db';
import type { Dependencias } from './dependencias';

export type Evento = typeof outboxEventos.$inferSelect;

export type Consumidor = {
  nome: string;
  eventos: readonly TipoEvento[];
  executar: (deps: Dependencias, evento: Evento) => Promise<void>;
};

export const MAX_TENTATIVAS = 10;
const LEASE_MIN = 5;

/** Espera exponencial: 1, 2, 4, 8... minutos, no máximo 60. */
export const esperaMinutos = (tentativas: number) => Math.min(60, 2 ** Math.max(0, tentativas - 1));

/**
 * Reserva um lote de eventos (lease de 5 min) sem travar a tabela durante o processamento.
 * Vários workers podem rodar em paralelo: SKIP LOCKED evita que dois peguem o mesmo evento.
 */
async function reservarLote(db: Db, limite: number): Promise<Evento[]> {
  const r = await db.execute<Record<string, unknown>>(sql`
    update outbox_eventos o
    set proxima_tentativa_em = now() + make_interval(mins => ${LEASE_MIN}), tentativas = o.tentativas + 1
    where o.id in (
      select id from outbox_eventos
      where status in ('pendente', 'falhou') and proxima_tentativa_em <= now()
      order by id
      limit ${limite}
      for update skip locked
    )
    returning o.id`);
  if (!r.rows.length) return [];
  const ids = r.rows.map((l) => l.id as string);
  return db
    .select()
    .from(outboxEventos)
    .where(sql`${outboxEventos.id} in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`)
    .orderBy(outboxEventos.id);
}

export async function processarLote(deps: Dependencias, consumidores: Consumidor[], limite = 20): Promise<number> {
  const { db } = deps;
  const lote = await reservarLote(db, limite);
  for (const evento of lote) {
    const interessados = consumidores.filter((c) => c.eventos.includes(evento.tipo as TipoEvento));
    try {
      for (const c of interessados) {
        const ja = await db.execute(
          sql`select 1 from eventos_consumidos where evento_id = ${evento.id} and consumidor = ${c.nome}`,
        );
        if (ja.rows.length) continue;
        await c.executar(deps, evento);
        await db.insert(eventosConsumidos).values({ eventoId: evento.id, consumidor: c.nome }).onConflictDoNothing();
      }
      await db
        .update(outboxEventos)
        .set({ status: 'processado', processadoEm: new Date(), ultimoErro: null })
        .where(sql`${outboxEventos.id} = ${evento.id}`);
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      const morto = evento.tentativas >= MAX_TENTATIVAS;
      deps.log.erro(`Falha ao processar ${evento.tipo} (${evento.id}): ${mensagem}`);
      await db
        .update(outboxEventos)
        .set({
          status: morto ? 'morto' : 'falhou',
          ultimoErro: mensagem.slice(0, 2000),
          proximaTentativaEm: new Date(Date.now() + esperaMinutos(evento.tentativas) * 60_000),
        })
        .where(sql`${outboxEventos.id} = ${evento.id}`);
    }
  }
  return lote.length;
}

/** Processa até esvaziar a fila (útil em testes e após um NOTIFY). */
export async function processarTudo(deps: Dependencias, consumidores: Consumidor[], maxLotes = 50) {
  let total = 0;
  for (let i = 0; i < maxLotes; i++) {
    const n = await processarLote(deps, consumidores);
    total += n;
    if (n === 0) break;
  }
  return total;
}
