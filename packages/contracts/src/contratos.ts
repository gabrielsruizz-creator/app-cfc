import { z } from 'zod';
import { id, instante, pontoGeo } from './comum';
import { categoriaCnh } from './enums';

/**
 * Aceite do contrato de prestação de serviços na compra: o aluno envia a impressão digital
 * (SHA-256) do texto que leu na prévia. O servidor só aceita se for idêntica à do contrato
 * gerado para a compra — assim fica provado que o texto gravado é exatamente o que ele aceitou.
 */
export const aceiteContrato = z.object({
  hash: z.string().regex(/^[0-9a-f]{64}$/, 'Aceite do contrato inválido'),
});
export type AceiteContrato = z.infer<typeof aceiteContrato>;

/** Dados da compra para montar a prévia do contrato (os mesmos da compra em si). */
export const previaContrato = z.discriminatedUnion('tipo', [
  z.object({
    tipo: z.literal('pacote'),
    pacoteId: id,
    cupom: z.string().trim().max(30).optional(),
    metodo: z.enum(['pix', 'cartao']).default('pix'),
    parcelas: z.number().int().min(1).max(12).default(1),
  }),
  z.object({
    tipo: z.literal('aula_avulsa'),
    instrutorId: id,
    inicio: instante,
    categoria: categoriaCnh,
    pontoEncontro: pontoGeo,
    pontoEncontroEndereco: z.string().trim().min(3).max(200),
    pontoEncontroReferencia: z.string().trim().max(200).optional(),
    cupom: z.string().trim().max(30).optional(),
  }),
]);
export type PreviaContrato = z.infer<typeof previaContrato>;

export interface TextoContrato {
  /** Versão do modelo usado. */
  versao: string;
  /** Texto exato, já preenchido com os dados da compra (Markdown simples). */
  corpoMd: string;
  /** SHA-256 do texto, em hexadecimal. */
  hash: string;
}

export const PARTES_CONTRATO = ['contratante', 'contratado'] as const;
export type ParteContrato = (typeof PARTES_CONTRATO)[number];

/** clique = "li e aceito" no app; oferta = adesão do vendedor ao publicar a oferta com este modelo. */
export const FORMAS_ACEITE = ['clique', 'oferta'] as const;
export type FormaAceite = (typeof FORMAS_ACEITE)[number];

export const STATUS_ENVIO_EMAIL = ['enviado', 'pendente_configuracao', 'erro'] as const;

export interface ContratoPedido extends TextoContrato {
  id: string;
  pedidoId: string;
  pedidoCodigo: string;
  criadoEm: string;
  aceites: {
    parte: ParteContrato;
    forma: FormaAceite;
    nome: string;
    /** CPF ou CNPJ, mascarado. */
    documento: string | null;
    aceitoEm: string;
    ip: string | null;
    dispositivo: string | null;
    detalhe: string | null;
  }[];
  envios: {
    parte: ParteContrato;
    /** E-mail mascarado (ex.: jo***@gmail.com). */
    para: string;
    status: (typeof STATUS_ENVIO_EMAIL)[number];
    erro: string | null;
    criadoEm: string;
  }[];
}
