import { bigint, index, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { pedidos } from './comercial';
import { usuarios } from './identidade';
import { aulas } from './aulas';
import { carimbos, idPk, instanteTz } from './tipos';
import { checkValores } from './util';

/** [F2] Denúncias de usuários (análise pelo admin). */
export const denuncias = pgTable(
  'denuncias',
  {
    id: idPk(),
    denuncianteUsuarioId: uuid()
      .notNull()
      .references(() => usuarios.id),
    alvoTipo: text().notNull(),
    alvoId: uuid().notNull(),
    aulaId: uuid().references(() => aulas.id),
    motivo: text().notNull(),
    descricao: text(),
    status: text().notNull().default('aberta'),
    resolucao: text(),
    resolvidaPor: uuid().references(() => usuarios.id),
    resolvidaEm: instanteTz(),
    ...carimbos,
  },
  (t) => [
    checkValores('denuncias_alvo_ck', t.alvoTipo, [
      'instrutor',
      'autoescola',
      'aluno',
      'avaliacao',
    ]),
    checkValores('denuncias_status_ck', t.status, [
      'aberta',
      'em_analise',
      'resolvida',
      'descartada',
    ]),
    index('denuncias_status_idx').on(t.status),
  ],
);

/** [F2] Disputas sobre aulas (ex.: aula não aconteceu). Enquanto aberta, a liberação automática fica suspensa. */
export const disputas = pgTable(
  'disputas',
  {
    id: idPk(),
    aulaId: uuid()
      .notNull()
      .references(() => aulas.id),
    pedidoId: uuid()
      .notNull()
      .references(() => pedidos.id),
    abertaPorUsuarioId: uuid()
      .notNull()
      .references(() => usuarios.id),
    abertaPorPapel: text().notNull(),
    motivo: text().notNull(),
    descricao: text().notNull(),
    status: text().notNull().default('aberta'),
    decisao: text(),
    valorEstornoCentavos: bigint({ mode: 'number' }),
    resolucao: text(),
    resolvidaPor: uuid().references(() => usuarios.id),
    resolvidaEm: instanteTz(),
    ...carimbos,
  },
  (t) => [
    checkValores('disputas_status_ck', t.status, ['aberta', 'resolvida']),
    checkValores('disputas_decisao_ck', t.decisao, ['estorno_total', 'estorno_parcial', 'negada']),
    checkValores('disputas_papel_ck', t.abertaPorPapel, [
      'aluno',
      'instrutor',
      'autoescola',
      'admin',
    ]),
    index('disputas_aula_idx').on(t.aulaId),
  ],
);
