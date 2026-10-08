import { z } from 'zod';
import { centavos, id } from './comum';
import { tipoChavePix } from './enums';

export const contaRecebimentoEntrada = z.object({
  tipoChave: tipoChavePix,
  chave: z.string().trim().min(3).max(140),
  titularNome: z.string().trim().min(3).max(120),
  titularDocumento: z.string().trim().min(11).max(18),
});
export type ContaRecebimentoEntrada = z.infer<typeof contaRecebimentoEntrada>;

export const solicitarSaque = z.object({
  valorCentavos: centavos.min(1000, 'Saque mínimo de R$ 10,00'),
});

export const resumoFinanceiro = z.object({
  retidoCentavos: z.number(),
  disponivelCentavos: z.number(),
  ganhosHojeCentavos: z.number(),
  ganhosSemanaCentavos: z.number(),
  ganhosMesCentavos: z.number(),
  contaRecebimento: z
    .object({ tipoChave: z.string(), chaveMascarada: z.string(), titularNome: z.string() })
    .nullable(),
  extrato: z.array(
    z.object({
      id,
      tipo: z.string(),
      bucket: z.string(),
      valorCentavos: z.number(),
      descricao: z.string(),
      criadoEm: z.string(),
    }),
  ),
  saques: z.array(
    z.object({
      id,
      valorCentavos: z.number(),
      status: z.string(),
      criadoEm: z.string(),
      ultimoErro: z.string().nullable(),
    }),
  ),
});
export type ResumoFinanceiro = z.infer<typeof resumoFinanceiro>;

// ---------- Moderação ----------

export const abrirDenuncia = z.object({
  alvoTipo: z.enum(['instrutor', 'autoescola', 'aluno', 'avaliacao']),
  alvoId: id,
  aulaId: id.optional(),
  motivo: z.string().trim().min(3).max(120),
  descricao: z.string().trim().max(1500).optional(),
});

export const abrirDisputa = z.object({
  aulaId: id,
  motivo: z.string().trim().min(3).max(120),
  descricao: z.string().trim().min(10, 'Descreva o que aconteceu').max(2000),
});

export const decidirDisputa = z.object({
  decisao: z.enum(['estorno_total', 'estorno_parcial', 'negada']),
  valorEstornoCentavos: z.number().int().min(0).optional(),
  resolucao: z.string().trim().min(5).max(1000),
});

export const resolverDenuncia = z.object({
  status: z.enum(['resolvida', 'descartada']),
  resolucao: z.string().trim().min(5).max(1000),
});
