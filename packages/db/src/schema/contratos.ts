import { FORMAS_ACEITE, PARTES_CONTRATO, STATUS_ENVIO_EMAIL } from '@volante/contracts';
import { char, index, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { pedidos } from './comercial';
import { alunos, documentosLegais, usuarios } from './identidade';
import { autoescolas, instrutores } from './parceiros';
import { criadoEm, idPk, instanteTz } from './tipos';
import { checkValores } from './util';

/**
 * Contrato de prestação de serviços de um pedido, com o TEXTO EXATO aceito (já preenchido) e
 * seu SHA-256. Somente inclusão: nada é alterado depois de gravado.
 */
export const contratos = pgTable(
  'contratos',
  {
    id: idPk(),
    pedidoId: uuid()
      .notNull()
      .references(() => pedidos.id),
    alunoId: uuid()
      .notNull()
      .references(() => alunos.id),
    instrutorId: uuid().references(() => instrutores.id),
    autoescolaId: uuid().references(() => autoescolas.id),
    documentoLegalId: uuid().references(() => documentosLegais.id),
    versao: text().notNull(),
    corpoMd: text().notNull(),
    hashCorpo: char({ length: 64 }).notNull(),
    criadoEm: criadoEm(),
  },
  (t) => [
    uniqueIndex('contratos_pedido_uk').on(t.pedidoId),
    index('contratos_aluno_idx').on(t.alunoId),
  ],
);

/** Aceite de cada parte (somente inclusão). */
export const contratoAceites = pgTable(
  'contrato_aceites',
  {
    id: idPk(),
    contratoId: uuid()
      .notNull()
      .references(() => contratos.id),
    parte: text().notNull(),
    forma: text().notNull(),
    usuarioId: uuid().references(() => usuarios.id),
    nome: text().notNull(),
    documento: text(),
    /** Hash do texto que esta parte aceitou (igual ao do contrato). */
    hashAceito: char({ length: 64 }).notNull(),
    ip: text(),
    userAgent: text(),
    /** Ex.: termo de parceiro aceito (versão e data) que sustenta a adesão por oferta. */
    detalhe: text(),
    aceitoEm: instanteTz().defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('contrato_aceites_parte_uk').on(t.contratoId, t.parte),
    checkValores('contrato_aceites_parte_ck', t.parte, PARTES_CONTRATO),
    checkValores('contrato_aceites_forma_ck', t.forma, FORMAS_ACEITE),
  ],
);

/** Cada cópia enviada por e-mail (ou tentativa), para as duas partes. */
export const contratoEnvios = pgTable(
  'contrato_envios',
  {
    id: idPk(),
    contratoId: uuid()
      .notNull()
      .references(() => contratos.id),
    parte: text().notNull(),
    para: text().notNull(),
    status: text().notNull(),
    erro: text(),
    eventoOrigemId: uuid(),
    criadoEm: criadoEm(),
  },
  (t) => [
    index('contrato_envios_contrato_idx').on(t.contratoId, t.parte),
    checkValores('contrato_envios_parte_ck', t.parte, PARTES_CONTRATO),
    checkValores('contrato_envios_status_ck', t.status, STATUS_ENVIO_EMAIL),
  ],
);
