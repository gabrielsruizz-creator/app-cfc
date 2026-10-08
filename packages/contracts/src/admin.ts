import { z } from 'zod';
import { id } from './comum';
import { tipoDocumentoLegal } from './enums';

export const reprovarComMotivo = z.object({ motivo: z.string().trim().min(5).max(500) });

export const novaRegraComissao = z.object({
  vendedorTipo: z.enum(['instrutor', 'autoescola']),
  produtoTipo: z.enum(['aula_avulsa', 'pacote']),
  percentualBp: z.number().int().min(0).max(10000),
  valorFixoCentavos: z.number().int().min(0).default(0),
  instrutorId: id.optional(),
  autoescolaId: id.optional(),
  motivo: z.string().trim().min(3).max(300),
});
export type NovaRegraComissao = z.infer<typeof novaRegraComissao>;

export const publicarDocumentoLegal = z.object({
  tipo: tipoDocumentoLegal,
  versao: z.string().trim().min(1).max(20),
  conteudoMd: z.string().min(20),
});

export const filtroAuditoria = z.object({
  entidadeTipo: z.string().optional(),
  entidadeId: id.optional(),
  atorUsuarioId: id.optional(),
  limite: z.coerce.number().int().min(1).max(200).default(50),
});
