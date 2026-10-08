import { CATEGORIAS_CNH, STATUS_AULA } from '@volante/contracts';
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  char,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { creditosAula, pedidos } from './comercial';
import { alunos, usuarios } from './identidade';
import { autoescolas, habilidades, instrutores, veiculos } from './parceiros';
import { carimbos, criadoEm, geografiaPonto, idPk, instanteTz, intervaloTempo } from './tipos';
import { checkValores } from './util';

export type PoliticaCancelamento = { gratisAteHoras: number; multaBp: number };

export const aulas = pgTable(
  'aulas',
  {
    id: idPk(),
    alunoId: uuid()
      .notNull()
      .references(() => alunos.id),
    instrutorId: uuid()
      .notNull()
      .references(() => instrutores.id),
    autoescolaId: uuid().references(() => autoescolas.id),
    pedidoId: uuid()
      .notNull()
      .references(() => pedidos.id),
    creditoId: uuid()
      .notNull()
      .references(() => creditosAula.id),
    veiculoId: uuid().references(() => veiculos.id),
    categoria: text().notNull(),
    inicio: instanteTz().notNull(),
    fim: instanteTz().notNull(),
    periodo: intervaloTempo().generatedAlwaysAs(sql`tstzrange(inicio, fim, '[)')`),
    valorCentavos: bigint({ mode: 'number' }).notNull(),
    pontoEncontro: geografiaPonto().notNull(),
    pontoEncontroEndereco: text().notNull(),
    pontoEncontroReferencia: text(),
    status: text().notNull(),
    aceiteAte: instanteTz(),
    codigoCheckin: char({ length: 4 }).notNull(),
    tentativasCheckin: smallint().notNull().default(0),
    checkinEm: instanteTz(),
    checkinLocal: geografiaPonto(),
    checkinDistanciaM: integer(),
    checkoutEm: instanteTz(),
    checkoutLocal: geografiaPonto(),
    checkoutConfirmadoEm: instanteTz(),
    checkoutConfirmadoPor: text(),
    canceladaEm: instanteTz(),
    canceladaPor: text(),
    motivoCancelamento: text(),
    multaCancelamentoCentavos: bigint({ mode: 'number' }).notNull().default(0),
    politicaCancelamento: jsonb().$type<PoliticaCancelamento>().notNull(),
    remarcadaDeId: uuid(),
    ...carimbos,
  },
  (t) => [
    checkValores('aulas_status_ck', t.status, STATUS_AULA),
    checkValores('aulas_categoria_ck', t.categoria, CATEGORIAS_CNH),
    check('aulas_periodo_ck', sql`${t.fim} > ${t.inicio}`),
    index('aulas_instrutor_idx').on(t.instrutorId, t.inicio),
    index('aulas_aluno_idx').on(t.alunoId, t.inicio),
    index('aulas_status_idx').on(t.status),
    // As restrições EXCLUDE (sem conflito de horário) ficam na migração SQL personalizada.
  ],
);

export const aulaHistorico = pgTable(
  'aula_historico',
  {
    id: idPk(),
    aulaId: uuid()
      .notNull()
      .references(() => aulas.id),
    alunoId: uuid().notNull(),
    instrutorId: uuid().notNull(),
    autoescolaId: uuid(),
    deStatus: text(),
    paraStatus: text().notNull(),
    atorUsuarioId: uuid(),
    local: geografiaPonto(),
    motivo: text(),
    criadoEm: criadoEm(),
  },
  (t) => [index('aula_historico_aula_idx').on(t.aulaId)],
);

export const registrosEvolucao = pgTable(
  'registros_evolucao',
  {
    id: idPk(),
    aulaId: uuid()
      .notNull()
      .references(() => aulas.id),
    alunoId: uuid()
      .notNull()
      .references(() => alunos.id),
    instrutorId: uuid()
      .notNull()
      .references(() => instrutores.id),
    autoescolaId: uuid(),
    habilidadeId: uuid()
      .notNull()
      .references(() => habilidades.id),
    nivel: smallint().notNull(),
    observacao: text(),
    criadoEm: criadoEm(),
  },
  (t) => [
    uniqueIndex('evolucao_aula_habilidade_uk').on(t.aulaId, t.habilidadeId),
    check('evolucao_nivel_ck', sql`${t.nivel} between 1 and 5`),
    index('evolucao_aluno_idx').on(t.alunoId),
  ],
);

export const aulaAnotacoes = pgTable('aula_anotacoes', {
  aulaId: uuid()
    .primaryKey()
    .references(() => aulas.id),
  alunoId: uuid().notNull(),
  instrutorId: uuid().notNull(),
  autoescolaId: uuid(),
  texto: text().notNull(),
  visivelAluno: boolean().notNull().default(true),
  ...carimbos,
});

export const avaliacoes = pgTable(
  'avaliacoes',
  {
    id: idPk(),
    aulaId: uuid().references(() => aulas.id),
    pedidoId: uuid().references(() => pedidos.id),
    autorAlunoId: uuid()
      .notNull()
      .references(() => alunos.id),
    alvoTipo: text().notNull(),
    instrutorId: uuid().references(() => instrutores.id),
    autoescolaId: uuid().references(() => autoescolas.id),
    nota: smallint().notNull(),
    comentario: text(),
    status: text().notNull().default('publicada'),
    moderadaPor: uuid().references(() => usuarios.id),
    resposta: text(),
    respondidaEm: instanteTz(),
    ...carimbos,
  },
  (t) => [
    uniqueIndex('avaliacoes_aula_alvo_uk').on(t.aulaId, t.alvoTipo),
    checkValores('avaliacoes_alvo_ck', t.alvoTipo, ['instrutor', 'autoescola']),
    checkValores('avaliacoes_status_ck', t.status, ['publicada', 'oculta']),
    check('avaliacoes_nota_ck', sql`${t.nota} between 1 and 5`),
    index('avaliacoes_instrutor_idx').on(t.instrutorId, t.criadoEm),
  ],
);
