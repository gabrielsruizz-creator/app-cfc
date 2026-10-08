import { z } from 'zod';
import { id, pontoGeo } from './comum';

export const enviarPosicao = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  precisaoM: z.number().min(0).max(10000).optional(),
});
export type EnviarPosicao = z.infer<typeof enviarPosicao>;

export const rastreamentoAula = z.object({
  aulaId: id,
  status: z.string(),
  /** Última posição do instrutor (só entre "a caminho" e o check-out). */
  posicao: z.object({ lat: z.number(), lng: z.number(), registradoEm: z.string() }).nullable(),
  pontoEncontro: pontoGeo,
  pontoEncontroEndereco: z.string(),
  /** Distância em linha reta até o ponto de encontro. */
  distanciaMetros: z.number().nullable(),
  /** Estimativa simples (velocidade média urbana). */
  chegadaEstimadaMin: z.number().nullable(),
  instrutor: z.object({ nome: z.string(), fotoArquivoId: id.nullable() }),
  veiculo: z
    .object({ modelo: z.string(), cor: z.string().nullable(), placa: z.string() })
    .nullable(),
  inicio: z.string(),
  fim: z.string(),
});
export type RastreamentoAula = z.infer<typeof rastreamentoAula>;

export const criarCompartilhamento = z.object({
  contatoNome: z.string().trim().max(80).optional(),
});

export const compartilhamento = z.object({
  id,
  url: z.string(),
  contatoNome: z.string().nullable(),
  expiraEm: z.string(),
});
export type Compartilhamento = z.infer<typeof compartilhamento>;

/** O que o contato de confiança vê pelo link (sem dados pessoais além do necessário). */
export const acompanhamentoPublico = rastreamentoAula
  .omit({ aulaId: true, instrutor: true })
  .extend({
    alunoPrimeiroNome: z.string(),
    instrutorNome: z.string(),
    expiraEm: z.string(),
  });
export type AcompanhamentoPublico = z.infer<typeof acompanhamentoPublico>;
