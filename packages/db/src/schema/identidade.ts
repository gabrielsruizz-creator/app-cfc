import {
  FINALIDADES_ARQUIVO,
  FINALIDADES_CONSENTIMENTO,
  GENEROS,
  CATEGORIAS_CNH,
  STATUS_USUARIO,
  TIPOS_DOCUMENTO_LEGAL,
} from '@volante/contracts';
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  char,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { carimbos, criadoEm, idPk, instanteTz } from './tipos';
import { checkValores } from './util';

export const usuarios = pgTable(
  'usuarios',
  {
    id: idPk(),
    nome: text().notNull(),
    nomeSocial: text(),
    cpf: char({ length: 11 }),
    email: text().notNull(),
    emailVerificadoEm: instanteTz(),
    telefone: text().notNull(),
    telefoneVerificadoEm: instanteTz(),
    senhaHash: text().notNull(),
    dataNascimento: date({ mode: 'string' }),
    genero: text(),
    fotoArquivoId: uuid(),
    status: text().notNull().default('ativo'),
    ultimoAcessoEm: instanteTz(),
    excluidoEm: instanteTz(),
    ...carimbos,
  },
  (t) => [
    uniqueIndex('usuarios_cpf_uk').on(t.cpf),
    uniqueIndex('usuarios_email_uk').on(sql`lower(${t.email})`),
    uniqueIndex('usuarios_telefone_uk').on(t.telefone),
    checkValores('usuarios_status_ck', t.status, STATUS_USUARIO),
    checkValores('usuarios_genero_ck', t.genero, GENEROS),
  ],
);

export const adminsPlataforma = pgTable(
  'admins_plataforma',
  {
    usuarioId: uuid()
      .primaryKey()
      .references(() => usuarios.id),
    nivel: text().notNull().default('total'),
    criadoEm: criadoEm(),
  },
  (t) => [checkValores('admins_nivel_ck', t.nivel, ['total', 'analista', 'financeiro', 'suporte'])],
);

export const sessoes = pgTable(
  'sessoes',
  {
    id: idPk(),
    usuarioId: uuid()
      .notNull()
      .references(() => usuarios.id),
    /** Agrupa os tokens rotacionados de um mesmo login; reuso de token revogado derruba a família. */
    familia: uuid().notNull(),
    refreshTokenHash: text().notNull(),
    dispositivo: text(),
    ip: text(),
    userAgent: text(),
    expiraEm: instanteTz().notNull(),
    revogadaEm: instanteTz(),
    criadoEm: criadoEm(),
  },
  (t) => [
    uniqueIndex('sessoes_token_uk').on(t.refreshTokenHash),
    index('sessoes_usuario_idx').on(t.usuarioId),
  ],
);

export const codigosVerificacao = pgTable(
  'codigos_verificacao',
  {
    id: idPk(),
    usuarioId: uuid().references(() => usuarios.id),
    finalidade: text().notNull(),
    canal: text().notNull(),
    destino: text().notNull(),
    codigoHash: text().notNull(),
    tentativas: smallint().notNull().default(0),
    expiraEm: instanteTz().notNull(),
    usadoEm: instanteTz(),
    criadoEm: criadoEm(),
  },
  (t) => [
    checkValores('codigos_finalidade_ck', t.finalidade, [
      'verificar_telefone',
      'verificar_email',
      'redefinir_senha',
    ]),
    checkValores('codigos_canal_ck', t.canal, ['sms', 'email']),
    index('codigos_destino_idx').on(t.destino, t.finalidade),
  ],
);

export const dispositivosPush = pgTable(
  'dispositivos_push',
  {
    id: idPk(),
    usuarioId: uuid()
      .notNull()
      .references(() => usuarios.id),
    expoPushToken: text().notNull(),
    plataforma: text().notNull(),
    ativo: boolean().notNull().default(true),
    ultimoUsoEm: instanteTz(),
    criadoEm: criadoEm(),
  },
  (t) => [uniqueIndex('dispositivos_token_uk').on(t.expoPushToken)],
);

// ---------- Arquivos ----------

export const arquivos = pgTable(
  'arquivos',
  {
    id: idPk(),
    donoUsuarioId: uuid()
      .notNull()
      .references(() => usuarios.id),
    chaveStorage: text().notNull(),
    nomeOriginal: text(),
    mime: text().notNull(),
    tamanhoBytes: bigint({ mode: 'number' }).notNull(),
    sha256: text().notNull(),
    visibilidade: text().notNull().default('privado'),
    finalidade: text().notNull(),
    excluidoEm: instanteTz(),
    criadoEm: criadoEm(),
  },
  (t) => [
    checkValores('arquivos_visibilidade_ck', t.visibilidade, ['privado', 'publico']),
    checkValores('arquivos_finalidade_ck', t.finalidade, FINALIDADES_ARQUIVO),
    index('arquivos_dono_idx').on(t.donoUsuarioId),
  ],
);

// ---------- LGPD ----------

export const documentosLegais = pgTable(
  'documentos_legais',
  {
    id: idPk(),
    tipo: text().notNull(),
    versao: text().notNull(),
    conteudoMd: text().notNull(),
    publicadoEm: instanteTz().defaultNow().notNull(),
    vigente: boolean().notNull().default(true),
  },
  (t) => [
    uniqueIndex('documentos_legais_versao_uk').on(t.tipo, t.versao),
    uniqueIndex('documentos_legais_vigente_uk')
      .on(t.tipo)
      .where(sql`${t.vigente}`),
    checkValores('documentos_legais_tipo_ck', t.tipo, TIPOS_DOCUMENTO_LEGAL),
  ],
);

/** Append-only: revogar um consentimento é inserir uma nova linha com aceito = false. */
export const consentimentos = pgTable(
  'consentimentos',
  {
    id: idPk(),
    usuarioId: uuid()
      .notNull()
      .references(() => usuarios.id),
    documentoLegalId: uuid().references(() => documentosLegais.id),
    finalidade: text().notNull(),
    aceito: boolean().notNull(),
    ip: text(),
    userAgent: text(),
    criadoEm: criadoEm(),
  },
  (t) => [
    checkValores('consentimentos_finalidade_ck', t.finalidade, FINALIDADES_CONSENTIMENTO),
    index('consentimentos_usuario_idx').on(t.usuarioId, t.finalidade),
  ],
);

export const solicitacoesExclusao = pgTable(
  'solicitacoes_exclusao',
  {
    id: idPk(),
    usuarioId: uuid()
      .notNull()
      .references(() => usuarios.id),
    status: text().notNull().default('solicitada'),
    motivo: text(),
    pendencias: jsonb().$type<string[]>().notNull().default([]),
    solicitadaEm: instanteTz().defaultNow().notNull(),
    concluidaEm: instanteTz(),
  },
  (t) => [
    checkValores('exclusao_status_ck', t.status, [
      'solicitada',
      'em_processamento',
      'concluida',
      'bloqueada_pendencia',
    ]),
  ],
);

// ---------- Aluno ----------

export const alunos = pgTable(
  'alunos',
  {
    id: idPk(),
    usuarioId: uuid()
      .notNull()
      .references(() => usuarios.id),
    categoriaDesejada: text().notNull(),
    renach: text(),
    selfieArquivoId: uuid()
      .notNull()
      .references(() => arquivos.id),
    municipio: text(),
    uf: char({ length: 2 }),
    horasAcumuladasMin: integer().notNull().default(0),
    aulasConcluidas: integer().notNull().default(0),
    ...carimbos,
  },
  (t) => [
    uniqueIndex('alunos_usuario_uk').on(t.usuarioId),
    checkValores('alunos_categoria_ck', t.categoriaDesejada, CATEGORIAS_CNH),
  ],
);
