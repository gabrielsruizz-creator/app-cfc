/**
 * Porta da integração com o ERP CFC Plus (Fase 4). Hoje só existe o adaptador NaoConfigurado.
 * A integração é por autoescola e opcional: autoescola não conectada e instrutor autônomo nunca passam por aqui.
 */
export type OperacaoCfcPlus = {
  operacao: 'enviar_aluno' | 'enviar_pedido' | 'enviar_matricula' | 'atualizar_pedido';
  autoescolaId: string;
  tipoRegistro: 'aluno' | 'pedido' | 'matricula' | 'instrutor' | 'aula';
  idInterno: string;
  /** CPF do aluno: chave para casar o cadastro com o ERP sem duplicar. */
  cpfAluno?: string | null;
  dados: Record<string, unknown>;
};

export type ResultadoCfcPlus =
  | { status: 'sucesso'; idExterno: string; resposta: unknown; httpStatus?: number }
  | { status: 'pendente_configuracao'; motivo: string }
  | { status: 'erro'; motivo: string; resposta?: unknown; httpStatus?: number };

export interface CfcPlusPort {
  executar(op: OperacaoCfcPlus): Promise<ResultadoCfcPlus>;
}
