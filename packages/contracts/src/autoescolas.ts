import { z } from 'zod';
import { cnpj, dataIso, id, pontoGeo, telefone, uf } from './comum';
import { tipoDocumentoAutoescola } from './enums';

export const cadastroAutoescola = z.object({
  razaoSocial: z.string().trim().min(3).max(160),
  nomeFantasia: z.string().trim().min(2).max(120),
  cnpj,
  credenciamentoDetran: z.string().trim().min(3).max(40),
  telefone,
  whatsapp: telefone,
  email: z.email(),
  cep: z.string().regex(/^\d{5}-?\d{3}$/, 'CEP inválido'),
  logradouro: z.string().trim().min(2).max(160),
  numero: z.string().trim().min(1).max(20),
  complemento: z.string().trim().max(80).optional(),
  bairro: z.string().trim().min(2).max(80),
  municipio: z.string().trim().min(2).max(80),
  uf,
  localizacao: pontoGeo,
  aceitouTermoAutoescola: z.literal(true, { message: 'É preciso aceitar o termo da autoescola' }),
});
export type CadastroAutoescola = z.infer<typeof cadastroAutoescola>;

export const enviarDocumentoAutoescola = z.object({
  tipo: tipoDocumentoAutoescola,
  arquivoId: id,
  numero: z.string().trim().max(40).optional(),
  validade: dataIso.optional(),
});
export type EnviarDocumentoAutoescola = z.infer<typeof enviarDocumentoAutoescola>;

export const integracaoDisponivel = z.object({
  sistema: z.string(),
  nome: z.string(),
  descricao: z.string(),
  status: z.enum(['em_breve', 'nao_conectada', 'conectada', 'erro', 'desativada']),
});
export type IntegracaoDisponivel = z.infer<typeof integracaoDisponivel>;
