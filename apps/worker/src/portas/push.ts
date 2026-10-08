export type MensagemPush = {
  tokens: string[];
  titulo: string;
  corpo: string;
  dados?: Record<string, unknown>;
};

export type ResultadoPush =
  | { status: 'enviada' }
  | { status: 'pendente_configuracao'; motivo: string }
  | { status: 'falhou'; motivo: string; tokensInvalidos?: string[] };

export interface PushPort {
  enviar(m: MensagemPush): Promise<ResultadoPush>;
}
