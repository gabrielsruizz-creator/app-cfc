import { z } from 'zod';
import { id } from './comum';

export const iniciarConversa = z
  .object({ instrutorId: id.optional(), autoescolaId: id.optional(), alunoId: id.optional() })
  .refine((d) => [d.instrutorId, d.autoescolaId, d.alunoId].filter(Boolean).length === 1, {
    message: 'Informe com quem conversar',
  });

export const enviarMensagem = z.object({ texto: z.string().trim().min(1).max(2000) });

export const resumoConversa = z.object({
  id,
  tipo: z.enum(['aluno_instrutor', 'aluno_autoescola']),
  outraParte: z.object({ nome: z.string(), fotoArquivoId: id.nullable(), papel: z.string() }),
  ultimaMensagem: z.string().nullable(),
  ultimaMensagemEm: z.string().nullable(),
  naoLidas: z.number(),
});
export type ResumoConversa = z.infer<typeof resumoConversa>;

export const mensagem = z.object({
  id,
  texto: z.string(),
  minha: z.boolean(),
  autorPapel: z.string(),
  criadoEm: z.string(),
  lidaEm: z.string().nullable(),
});
export type Mensagem = z.infer<typeof mensagem>;

/** Detecta números de telefone no texto, para alertar que o contato deve ficar no app. */
export function contemTelefone(texto: string): boolean {
  return /(\+?55\s?)?\(?\d{2}\)?\s?9?\d{4}[-.\s]?\d{4}/.test(texto);
}
