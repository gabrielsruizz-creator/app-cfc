/** Porta de envio de e-mail (cópia do contrato para as partes). */
export type Anexo = { nome: string; conteudo: Buffer; tipo: string };

export type MensagemEmail = {
  para: string;
  assunto: string;
  texto: string;
  html: string;
  anexos?: Anexo[];
};

export type ResultadoEmail =
  | { status: 'enviado'; id?: string }
  | { status: 'pendente_configuracao'; motivo: string }
  | { status: 'erro'; motivo: string; reprocessar: boolean };

export interface EmailPort {
  enviar(m: MensagemEmail): Promise<ResultadoEmail>;
}
