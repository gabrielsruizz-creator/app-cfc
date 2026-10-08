import { SISTEMAS_EXTERNOS, TIPOS_REGISTRO_EXTERNO } from '@volante/contracts';
import { sql } from 'drizzle-orm';
import {
  bigint,
  index,
  integer,
  jsonb,
  pgSchema,
  pgTable,
  primaryKey,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { usuarios } from './identidade';
import { autoescolas } from './parceiros';
import { bytea, carimbos, criadoEm, idPk, instanteTz } from './tipos';
import { checkValores } from './util';

export const configuracoes = pgTable('configuracoes', {
  chave: text().primaryKey(),
  valor: jsonb().notNull(),
  atualizadoPor: uuid().references(() => usuarios.id),
  atualizadoEm: instanteTz().defaultNow().notNull(),
});

// ---------- Notificações ----------

export const notificacoes = pgTable(
  'notificacoes',
  {
    id: idPk(),
    usuarioId: uuid()
      .notNull()
      .references(() => usuarios.id),
    tipo: text().notNull(),
    titulo: text().notNull(),
    corpo: text().notNull(),
    dados: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    canais: text().array().notNull().default(sql`'{push}'::text[]`),
    lidaEm: instanteTz(),
    criadoEm: criadoEm(),
  },
  (t) => [index('notificacoes_usuario_idx').on(t.usuarioId, t.criadoEm)],
);

export const entregasNotificacao = pgTable(
  'entregas_notificacao',
  {
    id: idPk(),
    notificacaoId: uuid()
      .notNull()
      .references(() => notificacoes.id),
    canal: text().notNull(),
    status: text().notNull().default('pendente'),
    tentativas: smallint().notNull().default(0),
    erro: text(),
    enviadaEm: instanteTz(),
    criadoEm: criadoEm(),
  },
  (t) => [
    checkValores('entregas_canal_ck', t.canal, ['push', 'email', 'sms']),
    checkValores('entregas_status_ck', t.status, [
      'pendente',
      'enviada',
      'falhou',
      'pendente_configuracao',
      'sem_destino',
    ]),
  ],
);

// ---------- Outbox ----------

export const outboxEventos = pgTable(
  'outbox_eventos',
  {
    id: idPk(),
    tipo: text().notNull(),
    versao: smallint().notNull().default(1),
    agregadoTipo: text().notNull(),
    agregadoId: uuid().notNull(),
    autoescolaId: uuid(),
    payload: jsonb().notNull(),
    ocorridoEm: instanteTz().defaultNow().notNull(),
    status: text().notNull().default('pendente'),
    tentativas: integer().notNull().default(0),
    proximaTentativaEm: instanteTz().defaultNow().notNull(),
    ultimoErro: text(),
    processadoEm: instanteTz(),
  },
  (t) => [
    checkValores('outbox_status_ck', t.status, ['pendente', 'processado', 'falhou', 'morto']),
    index('outbox_pendentes_idx')
      .on(t.proximaTentativaEm, t.id)
      .where(sql`${t.status} in ('pendente', 'falhou')`),
    index('outbox_agregado_idx').on(t.agregadoTipo, t.agregadoId),
  ],
);

export const eventosConsumidos = pgTable(
  'eventos_consumidos',
  {
    eventoId: uuid()
      .notNull()
      .references(() => outboxEventos.id),
    consumidor: text().notNull(),
    processadoEm: instanteTz().defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.eventoId, t.consumidor] })],
);

export const requisicoesIdempotentes = pgTable(
  'requisicoes_idempotentes',
  {
    chave: text().notNull(),
    usuarioId: uuid().notNull(),
    rota: text().notNull(),
    hashCorpo: text().notNull(),
    statusHttp: smallint().notNull(),
    resposta: jsonb().notNull(),
    criadoEm: criadoEm(),
  },
  (t) => [primaryKey({ columns: [t.usuarioId, t.chave] })],
);

// ---------- Auditoria imutável (schema próprio) ----------

export const schemaAuditoria = pgSchema('auditoria');

export const registrosAuditoria = schemaAuditoria.table(
  'registros',
  {
    id: idPk(),
    /** Ordem da cadeia de hashes; atribuída pela trigger sob lock. */
    seq: bigint({ mode: 'number' }),
    ocorridoEm: instanteTz().defaultNow().notNull(),
    atorUsuarioId: uuid(),
    atorTipo: text().notNull(),
    autoescolaId: uuid(),
    entidadeTipo: text().notNull(),
    entidadeId: uuid().notNull(),
    acao: text().notNull(),
    antes: jsonb(),
    depois: jsonb(),
    motivo: text(),
    ip: text(),
    userAgent: text(),
    requestId: text(),
    /** Preenchidos por trigger: encadeamento SHA-256 que evidencia adulteração. */
    hashAnterior: bytea(),
    hash: bytea(),
  },
  (t) => [
    uniqueIndex('auditoria_seq_uk').on(t.seq),
    index('auditoria_entidade_idx').on(t.entidadeTipo, t.entidadeId),
    index('auditoria_ator_idx').on(t.atorUsuarioId),
    index('auditoria_autoescola_idx').on(t.autoescolaId),
  ],
);

// ---------- Preparação para integrações externas (CFC Plus) ----------

export const integracoesAutoescola = pgTable(
  'integracoes_autoescola',
  {
    id: idPk(),
    autoescolaId: uuid()
      .notNull()
      .references(() => autoescolas.id),
    sistema: text().notNull(),
    status: text().notNull().default('nao_conectada'),
    configuracaoCifrada: bytea(),
    conectadaEm: instanteTz(),
    ...carimbos,
  },
  (t) => [
    uniqueIndex('integracoes_autoescola_uk').on(t.autoescolaId, t.sistema),
    checkValores('integracoes_sistema_ck', t.sistema, SISTEMAS_EXTERNOS),
    checkValores('integracoes_status_ck', t.status, ['nao_conectada', 'conectada', 'erro', 'desativada']),
  ],
);

export const vinculosExternos = pgTable(
  'vinculos_externos',
  {
    id: idPk(),
    tipoRegistro: text().notNull(),
    idInterno: uuid().notNull(),
    sistemaExterno: text().notNull(),
    autoescolaId: uuid()
      .notNull()
      .references(() => autoescolas.id),
    idExterno: text().notNull(),
    metadados: jsonb().notNull().default({}),
    ...carimbos,
  },
  (t) => [
    uniqueIndex('vinculos_interno_uk').on(t.sistemaExterno, t.autoescolaId, t.tipoRegistro, t.idInterno),
    uniqueIndex('vinculos_externo_uk').on(t.sistemaExterno, t.autoescolaId, t.tipoRegistro, t.idExterno),
    checkValores('vinculos_tipo_ck', t.tipoRegistro, TIPOS_REGISTRO_EXTERNO),
    checkValores('vinculos_sistema_ck', t.sistemaExterno, SISTEMAS_EXTERNOS),
  ],
);

export const operacoesIntegracao = pgTable(
  'operacoes_integracao',
  {
    id: idPk(),
    autoescolaId: uuid()
      .notNull()
      .references(() => autoescolas.id),
    sistema: text().notNull(),
    operacao: text().notNull(),
    eventoOrigemId: uuid().references(() => outboxEventos.id),
    tipoRegistro: text().notNull(),
    idInterno: uuid().notNull(),
    requisicao: jsonb().notNull(),
    resposta: jsonb(),
    httpStatus: smallint(),
    status: text().notNull().default('pendente'),
    tentativas: integer().notNull().default(0),
    proximaTentativaEm: instanteTz(),
    ultimoErro: text(),
    concluidaEm: instanteTz(),
    ...carimbos,
  },
  (t) => [
    checkValores('operacoes_status_ck', t.status, [
      'pendente',
      'pendente_configuracao',
      'sucesso',
      'erro',
      'aguardando_reprocessamento',
      'descartada',
    ]),
    checkValores('operacoes_sistema_ck', t.sistema, SISTEMAS_EXTERNOS),
    checkValores('operacoes_tipo_ck', t.tipoRegistro, TIPOS_REGISTRO_EXTERNO),
    index('operacoes_status_idx').on(t.status, t.proximaTentativaEm),
  ],
);
