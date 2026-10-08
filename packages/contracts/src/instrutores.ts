import { z } from 'zod';
import { centavos, dataIso, horaMinuto, id, instante, pontoGeo, uf } from './comum';
import {
  cambio,
  categoriaCnh,
  genero,
  statusInstrutor,
  tipoDocumentoInstrutor,
  DOCUMENTOS_COM_VALIDADE,
} from './enums';

// ---------- Aluno ----------

export const criarPerfilAluno = z.object({
  categoriaDesejada: categoriaCnh,
  renach: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}\d{9}$/, 'RENACH inválido (ex.: SP123456789)')
    .transform((v) => v.toUpperCase())
    .optional(),
  selfieArquivoId: id,
  municipio: z.string().max(80).optional(),
  uf: uf.optional(),
});
export type CriarPerfilAluno = z.infer<typeof criarPerfilAluno>;

// ---------- Instrutor: cadastro ----------

export const perfilProfissional = z.object({
  bio: z.string().trim().min(20, 'Conte um pouco sobre você (mínimo 20 caracteres)').max(1000),
  atuaDesde: z.number().int().min(1960).max(new Date().getFullYear()),
  categorias: z.array(categoriaCnh).min(1, 'Selecione ao menos uma categoria'),
  fotoArquivoId: id.optional(),
});
export type PerfilProfissional = z.infer<typeof perfilProfissional>;

export const atendimento = z.object({
  precoAulaCentavos: centavos.min(1000, 'Preço mínimo de R$ 10,00'),
  duracaoAulaMin: z.number().int().min(30).max(120),
  raioAtendimentoKm: z.number().int().min(1).max(100),
  baseLocalizacao: pontoGeo,
  forneceVeiculo: z.boolean(),
  aceitaVeiculoAluno: z.boolean(),
  antecedenciaMinimaH: z.number().int().min(0).max(168).optional(),
  fusoHorario: z.string().default('America/Sao_Paulo'),
});
export type Atendimento = z.infer<typeof atendimento>;

export const enviarDocumentoInstrutor = z
  .object({
    tipo: tipoDocumentoInstrutor,
    arquivoId: id,
    numero: z.string().trim().max(40).optional(),
    ufEmissor: uf.optional(),
    validade: dataIso.optional(),
  })
  .refine((d) => !DOCUMENTOS_COM_VALIDADE.includes(d.tipo) || !!d.validade, {
    message: 'Informe a data de validade deste documento',
    path: ['validade'],
  });
export type EnviarDocumentoInstrutor = z.infer<typeof enviarDocumentoInstrutor>;

export const veiculoEntrada = z.object({
  placa: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}-?\d[A-Z0-9]\d{2}$/, 'Placa inválida'),
  marca: z.string().trim().min(2).max(40),
  modelo: z.string().trim().min(1).max(60),
  ano: z
    .number()
    .int()
    .min(1980)
    .max(new Date().getFullYear() + 1),
  cor: z.string().trim().max(30).optional(),
  cambio,
  adaptadoPcd: z.boolean().default(false),
  adaptacoes: z.string().max(300).optional(),
  categoria: categoriaCnh,
  fotoArquivoId: id.optional(),
});
export type VeiculoEntrada = z.infer<typeof veiculoEntrada>;

export const veiculo = veiculoEntrada.extend({ id, ativo: z.boolean() });
export type Veiculo = z.infer<typeof veiculo>;

export const documentoInstrutor = z.object({
  id,
  tipo: tipoDocumentoInstrutor,
  arquivoId: id,
  numero: z.string().nullable(),
  validade: z.string().nullable(),
  status: z.string(),
  motivoReprovacao: z.string().nullable(),
  criadoEm: z.string(),
});
export type DocumentoInstrutor = z.infer<typeof documentoInstrutor>;

export const perfilInstrutorProprio = z.object({
  id,
  status: statusInstrutor,
  motivoStatus: z.string().nullable(),
  bio: z.string().nullable(),
  atuaDesde: z.number().nullable(),
  categorias: z.array(categoriaCnh),
  precoAulaCentavos: z.number().nullable(),
  duracaoAulaMin: z.number(),
  raioAtendimentoKm: z.number().nullable(),
  baseLocalizacao: pontoGeo.nullable(),
  forneceVeiculo: z.boolean(),
  aceitaVeiculoAluno: z.boolean(),
  disponivel: z.boolean(),
  antecedenciaMinimaH: z.number().nullable(),
  fusoHorario: z.string(),
  notaMedia: z.number().nullable(),
  totalAvaliacoes: z.number(),
  totalAulas: z.number(),
  documentos: z.array(documentoInstrutor),
  veiculos: z.array(veiculo),
  pendenciasCadastro: z.array(z.string()),
});
export type PerfilInstrutorProprio = z.infer<typeof perfilInstrutorProprio>;

// ---------- Agenda ----------

export const faixaJornada = z
  .object({
    diaSemana: z.number().int().min(0).max(6),
    horaInicio: horaMinuto,
    horaFim: horaMinuto,
  })
  .refine((f) => f.horaFim > f.horaInicio, {
    message: 'O fim precisa ser depois do início',
    path: ['horaFim'],
  });
export const jornadaSemanal = z.object({ faixas: z.array(faixaJornada).max(50) });
export type JornadaSemanal = z.infer<typeof jornadaSemanal>;

export const criarBloqueio = z
  .object({
    inicio: instante,
    fim: instante,
    tipo: z.enum(['bloqueio', 'ferias']),
    motivo: z.string().max(200).optional(),
  })
  .refine((b) => new Date(b.fim) > new Date(b.inicio), {
    message: 'O fim precisa ser depois do início',
    path: ['fim'],
  });
export type CriarBloqueio = z.infer<typeof criarBloqueio>;

export const bloqueio = z.object({
  id,
  inicio: z.string(),
  fim: z.string(),
  tipo: z.enum(['bloqueio', 'ferias']),
  motivo: z.string().nullable(),
});

export const alterarDisponibilidade = z.object({ disponivel: z.boolean() });

// ---------- Busca pública ----------

const booleanoQuery = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .transform((v) => v === true || v === 'true');

export const buscaInstrutores = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  categoria: categoriaCnh.optional(),
  precoMaxCentavos: z.coerce.number().int().positive().optional(),
  notaMin: z.coerce.number().min(0).max(5).optional(),
  genero: genero.optional(),
  cambio: cambio.optional(),
  adaptadoPcd: booleanoQuery.optional(),
  forneceVeiculo: booleanoQuery.optional(),
  ordenar: z.enum(['distancia', 'preco', 'avaliacao']).default('distancia'),
  limite: z.coerce.number().int().min(1).max(100).default(50),
});
export type BuscaInstrutores = z.infer<typeof buscaInstrutores>;

export const instrutorCard = z.object({
  id,
  nome: z.string(),
  fotoArquivoId: id.nullable(),
  genero: genero.nullable(),
  categorias: z.array(categoriaCnh),
  precoAulaCentavos: z.number(),
  duracaoAulaMin: z.number(),
  notaMedia: z.number().nullable(),
  totalAvaliacoes: z.number(),
  anosExperiencia: z.number().nullable(),
  distanciaKm: z.number(),
  /** Posição aproximada (arredondada) — nunca a localização exata do instrutor. */
  posicaoAproximada: pontoGeo,
  forneceVeiculo: z.boolean(),
  cambios: z.array(cambio),
  adaptadoPcd: z.boolean(),
  credencialVerificada: z.boolean(),
});
export type InstrutorCard = z.infer<typeof instrutorCard>;

export const avaliacaoPublica = z.object({
  id,
  nota: z.number(),
  comentario: z.string().nullable(),
  autorPrimeiroNome: z.string(),
  criadoEm: z.string(),
});
export type AvaliacaoPublica = z.infer<typeof avaliacaoPublica>;

export const perfilInstrutorPublico = instrutorCard.omit({ distanciaKm: true }).extend({
  bio: z.string().nullable(),
  veiculos: z.array(veiculo.omit({ placa: true })),
  avaliacoes: z.array(avaliacaoPublica),
  totalAulas: z.number(),
  aceitaVeiculoAluno: z.boolean(),
  raioAtendimentoKm: z.number(),
});
export type PerfilInstrutorPublico = z.infer<typeof perfilInstrutorPublico>;

export const consultaHorarios = z.object({ data: dataIso });

export const horarioLivre = z.object({ inicio: z.string(), fim: z.string() });
export type HorarioLivre = z.infer<typeof horarioLivre>;

export const diasDisponiveis = z.object({
  dias: z.array(z.object({ data: dataIso, quantidadeHorarios: z.number() })),
});
