import { sql } from 'drizzle-orm';
import { index, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { alunos, usuarios } from './identidade';
import { autoescolas, instrutores } from './parceiros';
import { criadoEm, idPk, instanteTz } from './tipos';
import { checkValores } from './util';

/** [F2] Conversa entre aluno e instrutor ou aluno e autoescola (sem expor telefones). */
export const conversas = pgTable(
  'conversas',
  {
    id: idPk(),
    tipo: text().notNull(),
    alunoId: uuid()
      .notNull()
      .references(() => alunos.id),
    instrutorId: uuid().references(() => instrutores.id),
    autoescolaId: uuid().references(() => autoescolas.id),
    ultimaMensagemEm: instanteTz(),
    criadoEm: criadoEm(),
  },
  (t) => [
    checkValores('conversas_tipo_ck', t.tipo, ['aluno_instrutor', 'aluno_autoescola']),
    uniqueIndex('conversas_instrutor_uk')
      .on(t.alunoId, t.instrutorId)
      .where(sql`${t.tipo} = 'aluno_instrutor'`),
    uniqueIndex('conversas_autoescola_uk')
      .on(t.alunoId, t.autoescolaId)
      .where(sql`${t.tipo} = 'aluno_autoescola'`),
  ],
);

export const mensagens = pgTable(
  'mensagens',
  {
    id: idPk(),
    conversaId: uuid()
      .notNull()
      .references(() => conversas.id),
    alunoId: uuid().notNull(),
    instrutorId: uuid(),
    autoescolaId: uuid(),
    autorUsuarioId: uuid()
      .notNull()
      .references(() => usuarios.id),
    autorPapel: text().notNull(),
    texto: text().notNull(),
    lidaEm: instanteTz(),
    criadoEm: criadoEm(),
  },
  (t) => [
    checkValores('mensagens_papel_ck', t.autorPapel, ['aluno', 'instrutor', 'autoescola']),
    index('mensagens_conversa_idx').on(t.conversaId, t.criadoEm),
  ],
);
