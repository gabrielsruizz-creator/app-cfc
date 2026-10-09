import { z } from 'zod';
import { id } from './comum';

/** A autoescola informa onde está o CFC Plus dela e a chave gerada lá (Configurações › Integrações). */
export const conectarCfcPlus = z.object({
  url: z
    .url({ message: 'Informe o endereço do CFC Plus (ex.: https://cfcplus.suaautoescola.com.br)' })
    .transform((u) => u.replace(/\/+$/, '')),
  chave: z
    .string()
    .trim()
    .regex(/^cfcp_[A-Za-z0-9]+_[A-Za-z0-9_-]{20,}$/, 'Cole a chave completa gerada no CFC Plus'),
});
export type ConectarCfcPlus = z.infer<typeof conectarCfcPlus>;

export const STATUS_INTEGRACAO = [
  'nao_conectada',
  'testando',
  'conectada',
  'erro',
  'desativada',
] as const;

export const integracaoCfcPlus = z.object({
  sistema: z.literal('cfc_plus'),
  nome: z.string(),
  descricao: z.string(),
  status: z.enum(STATUS_INTEGRACAO),
  url: z.string().nullable(),
  chaveMascarada: z.string().nullable(),
  /** Nome do CFC informado pelo próprio CFC Plus no teste de conexão. */
  nomeNoErp: z.string().nullable(),
  conectadaEm: z.string().nullable(),
  testadaEm: z.string().nullable(),
  ultimoErro: z.string().nullable(),
  operacoes: z.array(
    z.object({
      id,
      operacao: z.string(),
      pedidoCodigo: z.string().nullable(),
      status: z.string(),
      httpStatus: z.number().nullable(),
      ultimoErro: z.string().nullable(),
      tentativas: z.number(),
      criadoEm: z.string(),
    }),
  ),
});
export type IntegracaoCfcPlus = z.infer<typeof integracaoCfcPlus>;

// ---------- O que o Volante envia ao CFC Plus (versão 1) ----------

export const TIPOS_EVENTO_CFC_PLUS = [
  'pedido.pago',
  'pedido.confirmado',
  'pedido.recusado',
  'pedido.expirado',
  'matricula.criada',
  /** Reenvio do estado atual (botão "Reenviar vendas e aulas"). */
  'pedido.sincronizado',
] as const;

export const eventoCfcPlus = z.object({
  versao: z.literal(1),
  /** Único por envio: o CFC Plus ignora repetições do mesmo id. */
  id: z.string().min(1).max(120),
  tipo: z.enum(TIPOS_EVENTO_CFC_PLUS),
  ocorridoEm: z.string(),
  pedido: z.object({
    id,
    codigo: z.string(),
    status: z.string(),
    statusAtendimento: z.string().nullable(),
    motivoRecusa: z.string().nullable(),
    descricao: z.string(),
    categorias: z.array(z.string()),
    quantidadeAulas: z.number(),
    duracaoAulaMin: z.number(),
    valorBrutoCentavos: z.number(),
    descontoCentavos: z.number(),
    valorPagoCentavos: z.number(),
    /** O que a autoescola recebe depois da comissão do app. */
    valorLiquidoCentavos: z.number(),
    cupom: z.string().nullable(),
    metodoPagamento: z.enum(['pix', 'cartao']).nullable(),
    parcelas: z.number(),
    pagoEm: z.string().nullable(),
    matriculaId: id.nullable(),
  }),
  aluno: z.object({
    id,
    nome: z.string(),
    nomeSocial: z.string().nullable(),
    cpf: z.string().nullable(),
    email: z.string(),
    telefone: z.string(),
    dataNascimento: z.string().nullable(),
    categoriaDesejada: z.string(),
    renach: z.string().nullable(),
  }),
});
export type EventoCfcPlus = z.infer<typeof eventoCfcPlus>;

/** Aula concluída enviada ao CFC Plus, que a lança na agenda como realizada (POST /aulas). */
export const TIPOS_AULA_CFC_PLUS = ['aula.concluida', 'aula.atualizada'] as const;

export const aulaCfcPlus = z.object({
  versao: z.literal(1),
  /** Único por envio: o CFC Plus ignora repetições do mesmo id. */
  id: z.string().min(1).max(120),
  tipo: z.enum(TIPOS_AULA_CFC_PLUS),
  ocorridoEm: z.string(),
  aula: z.object({
    id,
    pedidoId: id,
    pedidoCodigo: z.string(),
    categoria: z.string(),
    /** Horário agendado. */
    inicio: z.string(),
    fim: z.string(),
    checkinEm: z.string().nullable(),
    checkoutEm: z.string().nullable(),
    minutosAgendados: z.number().int(),
    minutosRealizados: z.number().int().nullable(),
    minutosContados: z.number().int(),
    instrutor: z.object({ nome: z.string(), cpf: z.string().nullable() }),
    veiculo: z.object({ placa: z.string(), descricao: z.string() }).nullable(),
    pontoEncontro: z.string(),
    habilidades: z.array(z.object({ nome: z.string(), nivel: z.number().int() })),
    anotacao: z.string().nullable(),
  }),
  aluno: z.object({ id, nome: z.string(), cpf: z.string().nullable() }),
});
export type AulaCfcPlus = z.infer<typeof aulaCfcPlus>;
