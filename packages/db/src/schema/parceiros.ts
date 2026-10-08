import {
  CAMBIOS,
  CATEGORIAS_CNH,
  PAPEIS_AUTOESCOLA,
  STATUS_AUTOESCOLA,
  STATUS_DOCUMENTO,
  STATUS_INSTRUTOR,
  TIPOS_DOCUMENTO_AUTOESCOLA,
  TIPOS_DOCUMENTO_INSTRUTOR,
} from '@volante/contracts';
import { sql } from 'drizzle-orm';
import {
  boolean,
  char,
  check,
  date,
  index,
  integer,
  numeric,
  pgTable,
  smallint,
  text,
  time,
  uniqueIndex,
  uuid,
  bigint,
} from 'drizzle-orm/pg-core';
import { arquivos, usuarios } from './identidade';
import { carimbos, criadoEm, geografiaPonto, idPk, instanteTz } from './tipos';
import { checkValores } from './util';

// ---------- Instrutor ----------

export const instrutores = pgTable(
  'instrutores',
  {
    id: idPk(),
    usuarioId: uuid()
      .notNull()
      .references(() => usuarios.id),
    status: text().notNull().default('rascunho'),
    motivoStatus: text(),
    enviadoAnaliseEm: instanteTz(),
    aprovadoEm: instanteTz(),
    aprovadoPor: uuid().references(() => usuarios.id),
    bio: text(),
    atuaDesde: smallint(),
    categorias: text().array().notNull().default(sql`'{}'::text[]`),
    precoAulaCentavos: bigint({ mode: 'number' }),
    duracaoAulaMin: smallint().notNull().default(50),
    raioAtendimentoKm: smallint(),
    baseLocalizacao: geografiaPonto(),
    forneceVeiculo: boolean().notNull().default(true),
    aceitaVeiculoAluno: boolean().notNull().default(false),
    disponivel: boolean().notNull().default(false),
    fusoHorario: text().notNull().default('America/Sao_Paulo'),
    antecedenciaMinimaH: smallint(),
    notaMedia: numeric({ precision: 2, scale: 1, mode: 'number' }),
    totalAvaliacoes: integer().notNull().default(0),
    somaNotas: integer().notNull().default(0),
    totalAulas: integer().notNull().default(0),
    modoAtuacao: text().notNull().default('autonomo'),
    ...carimbos,
  },
  (t) => [
    uniqueIndex('instrutores_usuario_uk').on(t.usuarioId),
    checkValores('instrutores_status_ck', t.status, STATUS_INSTRUTOR),
    checkValores('instrutores_modo_ck', t.modoAtuacao, ['autonomo', 'vinculado', 'ambos']),
    check('instrutores_preco_ck', sql`${t.precoAulaCentavos} is null or ${t.precoAulaCentavos} > 0`),
    index('instrutores_base_gix').using('gist', t.baseLocalizacao),
    index('instrutores_categorias_gin').using('gin', t.categorias),
    index('instrutores_busca_idx')
      .on(t.status, t.disponivel)
      .where(sql`${t.status} = 'aprovado' and ${t.disponivel}`),
  ],
);

export const instrutorDocumentos = pgTable(
  'instrutor_documentos',
  {
    id: idPk(),
    instrutorId: uuid()
      .notNull()
      .references(() => instrutores.id),
    tipo: text().notNull(),
    arquivoId: uuid()
      .notNull()
      .references(() => arquivos.id),
    numero: text(),
    ufEmissor: char({ length: 2 }),
    validade: date({ mode: 'string' }),
    status: text().notNull().default('pendente'),
    analisadoPor: uuid().references(() => usuarios.id),
    analisadoEm: instanteTz(),
    motivoReprovacao: text(),
    alertasEnviados: smallint().array().notNull().default(sql`'{}'::smallint[]`),
    ...carimbos,
  },
  (t) => [
    checkValores('instrutor_doc_tipo_ck', t.tipo, TIPOS_DOCUMENTO_INSTRUTOR),
    checkValores('instrutor_doc_status_ck', t.status, STATUS_DOCUMENTO),
    // Apenas um documento "em uso" por tipo; os antigos ficam como substituido.
    uniqueIndex('instrutor_doc_atual_uk')
      .on(t.instrutorId, t.tipo)
      .where(sql`${t.status} <> 'substituido'`),
    index('instrutor_doc_validade_idx')
      .on(t.validade)
      .where(sql`${t.status} = 'aprovado'`),
  ],
);

export const veiculos = pgTable(
  'veiculos',
  {
    id: idPk(),
    instrutorId: uuid().references(() => instrutores.id),
    autoescolaId: uuid().references(() => autoescolas.id),
    placa: text().notNull(),
    marca: text().notNull(),
    modelo: text().notNull(),
    ano: smallint().notNull(),
    cor: text(),
    cambio: text().notNull(),
    adaptadoPcd: boolean().notNull().default(false),
    adaptacoes: text(),
    categoria: text().notNull(),
    documentoId: uuid().references(() => instrutorDocumentos.id),
    fotoArquivoId: uuid().references(() => arquivos.id),
    ativo: boolean().notNull().default(true),
    ...carimbos,
  },
  (t) => [
    uniqueIndex('veiculos_placa_uk')
      .on(t.placa)
      .where(sql`${t.ativo}`),
    checkValores('veiculos_cambio_ck', t.cambio, CAMBIOS),
    checkValores('veiculos_categoria_ck', t.categoria, CATEGORIAS_CNH),
    check('veiculos_dono_ck', sql`num_nonnulls(${t.instrutorId}, ${t.autoescolaId}) = 1`),
    index('veiculos_instrutor_idx').on(t.instrutorId),
  ],
);

export const disponibilidadesSemanais = pgTable(
  'disponibilidades_semanais',
  {
    id: idPk(),
    instrutorId: uuid()
      .notNull()
      .references(() => instrutores.id),
    diaSemana: smallint().notNull(),
    horaInicio: time().notNull(),
    horaFim: time().notNull(),
  },
  (t) => [
    check('disp_dia_ck', sql`${t.diaSemana} between 0 and 6`),
    check('disp_horas_ck', sql`${t.horaFim} > ${t.horaInicio}`),
    index('disp_instrutor_idx').on(t.instrutorId),
  ],
);

export const bloqueiosAgenda = pgTable(
  'bloqueios_agenda',
  {
    id: idPk(),
    instrutorId: uuid()
      .notNull()
      .references(() => instrutores.id),
    inicio: instanteTz().notNull(),
    fim: instanteTz().notNull(),
    tipo: text().notNull().default('bloqueio'),
    motivo: text(),
    criadoEm: criadoEm(),
  },
  (t) => [
    check('bloqueio_periodo_ck', sql`${t.fim} > ${t.inicio}`),
    checkValores('bloqueio_tipo_ck', t.tipo, ['bloqueio', 'ferias']),
    index('bloqueio_instrutor_idx').on(t.instrutorId, t.inicio),
  ],
);

// ---------- Autoescola (tenant) ----------

export const autoescolas = pgTable(
  'autoescolas',
  {
    id: idPk(),
    razaoSocial: text().notNull(),
    nomeFantasia: text().notNull(),
    cnpj: char({ length: 14 }).notNull(),
    slug: text().notNull(),
    status: text().notNull().default('rascunho'),
    motivoStatus: text(),
    descricao: text(),
    telefone: text().notNull(),
    whatsapp: text().notNull(),
    email: text().notNull(),
    cep: text().notNull(),
    logradouro: text().notNull(),
    numero: text().notNull(),
    complemento: text(),
    bairro: text().notNull(),
    municipio: text().notNull(),
    uf: char({ length: 2 }).notNull(),
    localizacao: geografiaPonto().notNull(),
    logoArquivoId: uuid().references(() => arquivos.id),
    credenciamentoDetran: text().notNull(),
    mensagemWhatsappPadrao: text()
      .notNull()
      .default(
        'Olá, {aluno}! Aqui é da {autoescola}. Recebemos sua compra de {pacote} pelo app e vamos combinar os próximos passos.',
      ),
    fusoHorario: text().notNull().default('America/Sao_Paulo'),
    notaMedia: numeric({ precision: 2, scale: 1, mode: 'number' }),
    totalAvaliacoes: integer().notNull().default(0),
    enviadaAnaliseEm: instanteTz(),
    aprovadaEm: instanteTz(),
    aprovadaPor: uuid().references(() => usuarios.id),
    ...carimbos,
  },
  (t) => [
    uniqueIndex('autoescolas_cnpj_uk').on(t.cnpj),
    uniqueIndex('autoescolas_slug_uk').on(t.slug),
    checkValores('autoescolas_status_ck', t.status, STATUS_AUTOESCOLA),
    index('autoescolas_localizacao_gix').using('gist', t.localizacao),
  ],
);

export const autoescolaMembros = pgTable(
  'autoescola_membros',
  {
    id: idPk(),
    autoescolaId: uuid()
      .notNull()
      .references(() => autoescolas.id),
    usuarioId: uuid()
      .notNull()
      .references(() => usuarios.id),
    papel: text().notNull(),
    status: text().notNull().default('ativo'),
    ...carimbos,
  },
  (t) => [
    uniqueIndex('membros_uk').on(t.autoescolaId, t.usuarioId),
    checkValores('membros_papel_ck', t.papel, PAPEIS_AUTOESCOLA),
    checkValores('membros_status_ck', t.status, ['convidado', 'ativo', 'removido']),
    index('membros_usuario_idx').on(t.usuarioId),
  ],
);

export const autoescolaDocumentos = pgTable(
  'autoescola_documentos',
  {
    id: idPk(),
    autoescolaId: uuid()
      .notNull()
      .references(() => autoescolas.id),
    tipo: text().notNull(),
    arquivoId: uuid()
      .notNull()
      .references(() => arquivos.id),
    numero: text(),
    validade: date({ mode: 'string' }),
    status: text().notNull().default('pendente'),
    analisadoPor: uuid().references(() => usuarios.id),
    analisadoEm: instanteTz(),
    motivoReprovacao: text(),
    ...carimbos,
  },
  (t) => [
    checkValores('autoescola_doc_tipo_ck', t.tipo, TIPOS_DOCUMENTO_AUTOESCOLA),
    checkValores('autoescola_doc_status_ck', t.status, STATUS_DOCUMENTO),
    uniqueIndex('autoescola_doc_atual_uk')
      .on(t.autoescolaId, t.tipo)
      .where(sql`${t.status} <> 'substituido'`),
  ],
);

export const habilidades = pgTable(
  'habilidades',
  {
    id: idPk(),
    codigo: text().notNull(),
    nome: text().notNull(),
    categorias: text().array().notNull(),
    ordem: smallint().notNull().default(0),
    ativa: boolean().notNull().default(true),
  },
  (t) => [uniqueIndex('habilidades_codigo_uk').on(t.codigo)],
);
