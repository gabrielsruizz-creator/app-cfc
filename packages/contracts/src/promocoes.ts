import { z } from 'zod';
import { centavos, id } from './comum';

export const TIPOS_CUPOM = ['percentual', 'valor_fixo'] as const;

const codigoCupom = z
  .string()
  .trim()
  .min(3, 'Mínimo de 3 caracteres')
  .max(30)
  .regex(/^[A-Za-z0-9_-]+$/, 'Use só letras, números, - e _')
  .transform((c) => c.toUpperCase());

/** Cupom criado pelo admin (pode ser bancado pela plataforma ou por um parceiro). */
export const cupomEntrada = z
  .object({
    codigo: codigoCupom,
    campanha: z.string().trim().max(80).optional(),
    descricao: z.string().trim().max(300).optional(),
    tipo: z.enum(TIPOS_CUPOM),
    /** Percentual em pontos-base (1000 = 10%) ou valor fixo em centavos. */
    valor: z.number().int().positive(),
    descontoMaximoCentavos: centavos.optional(),
    valorMinimoCentavos: centavos.default(0),
    produtoTipo: z.enum(['aula_avulsa', 'pacote']).optional(),
    instrutorId: id.optional(),
    autoescolaId: id.optional(),
    bancadoPor: z.enum(['plataforma', 'vendedor']).default('plataforma'),
    limiteTotal: z.number().int().positive().optional(),
    limitePorAluno: z.number().int().positive().default(1),
    apenasPrimeiraCompra: z.boolean().default(false),
    inicioEm: z.iso.datetime({ offset: true }).optional(),
    fimEm: z.iso.datetime({ offset: true }).optional(),
    ativo: z.boolean().default(true),
  })
  .refine((c) => c.tipo !== 'percentual' || c.valor <= 10000, {
    message: 'O percentual vai até 100%',
    path: ['valor'],
  })
  .refine((c) => !(c.instrutorId && c.autoescolaId), {
    message: 'Escolha um instrutor OU uma autoescola',
    path: ['autoescolaId'],
  })
  .refine((c) => c.bancadoPor !== 'vendedor' || c.instrutorId || c.autoescolaId, {
    message: 'Cupom bancado pelo vendedor precisa de um instrutor ou autoescola',
    path: ['bancadoPor'],
  });
export type CupomEntrada = z.infer<typeof cupomEntrada>;

/** Cupom criado pela própria autoescola (sempre bancado por ela, só vale para ela). */
export const cupomParceiroEntrada = z
  .object({
    codigo: codigoCupom,
    descricao: z.string().trim().max(300).optional(),
    tipo: z.enum(TIPOS_CUPOM),
    valor: z.number().int().positive(),
    descontoMaximoCentavos: centavos.optional(),
    valorMinimoCentavos: centavos.default(0),
    limiteTotal: z.number().int().positive().optional(),
    limitePorAluno: z.number().int().positive().default(1),
    apenasPrimeiraCompra: z.boolean().default(false),
    fimEm: z.iso.datetime({ offset: true }).optional(),
    ativo: z.boolean().default(true),
  })
  .refine((c) => c.tipo !== 'percentual' || c.valor <= 10000, {
    message: 'O percentual vai até 100%',
    path: ['valor'],
  });
export type CupomParceiroEntrada = z.infer<typeof cupomParceiroEntrada>;

export const cupom = z.object({
  id,
  codigo: z.string(),
  campanha: z.string().nullable(),
  descricao: z.string().nullable(),
  tipo: z.enum(TIPOS_CUPOM),
  valor: z.number(),
  descontoMaximoCentavos: z.number().nullable(),
  valorMinimoCentavos: z.number(),
  produtoTipo: z.string().nullable(),
  instrutorId: id.nullable(),
  autoescolaId: id.nullable(),
  vendedorNome: z.string().nullable(),
  bancadoPor: z.enum(['plataforma', 'vendedor']),
  limiteTotal: z.number().nullable(),
  limitePorAluno: z.number(),
  apenasPrimeiraCompra: z.boolean(),
  inicioEm: z.string(),
  fimEm: z.string().nullable(),
  ativo: z.boolean(),
  usos: z.number(),
  descontoTotalCentavos: z.number(),
});
export type Cupom = z.infer<typeof cupom>;

/** O aluno confere um cupom antes de pagar. */
export const validarCupom = z
  .object({
    codigo: z.string().trim().min(1).max(30),
    pacoteId: id.optional(),
    instrutorId: id.optional(),
  })
  .refine((v) => v.pacoteId || v.instrutorId, { message: 'Informe o pacote ou o instrutor' });

export const cupomValidado = z.object({
  codigo: z.string(),
  descricao: z.string().nullable(),
  valorBrutoCentavos: z.number(),
  descontoCentavos: z.number(),
  valorFinalCentavos: z.number(),
});
export type CupomValidado = z.infer<typeof cupomValidado>;

/** Texto curto do benefício, ex.: "10% de desconto (até R$ 50,00)". */
export function descreverCupom(c: Pick<Cupom, 'tipo' | 'valor' | 'descontoMaximoCentavos'>) {
  const reais = (v: number) =>
    (v / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  if (c.tipo === 'valor_fixo') return `${reais(c.valor)} de desconto`;
  const pct = `${(c.valor / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% de desconto`;
  return c.descontoMaximoCentavos ? `${pct} (até ${reais(c.descontoMaximoCentavos)})` : pct;
}
