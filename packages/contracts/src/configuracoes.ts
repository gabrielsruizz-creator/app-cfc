import { z } from 'zod';

/**
 * Configurações da plataforma editáveis pelo admin.
 * O banco guarda cada chave como jsonb; este schema é a fonte da verdade dos tipos e valores padrão.
 */
export const configuracoesSchema = z.object({
  'aula.duracao_padrao_min': z.number().int().min(20).max(180),
  'aula.intervalo_entre_aulas_min': z.number().int().min(0).max(120),
  'aula.prazo_aceite_horas': z.number().int().min(1).max(72),
  'aula.aceite_limite_antes_inicio_horas': z.number().int().min(0).max(48),
  'aula.pix_expira_min': z.number().int().min(5).max(1440),
  'aula.checkin_raio_m': z.number().int().min(50).max(5000),
  'aula.checkin_antecedencia_min': z.number().int().min(0).max(120),
  'aula.checkout_auto_confirmacao_h': z.number().int().min(1).max(168),
  'aula.antecedencia_minima_agendamento_h': z.number().int().min(0).max(168),
  'aula.dias_agenda_aberta': z.number().int().min(1).max(120),
  'cancelamento.gratis_ate_horas': z.number().int().min(0).max(168),
  'cancelamento.multa_bp': z.number().int().min(0).max(10000),
  'pedido.lembrete_horas': z.number().int().min(1).max(240),
  'pedido.expiracao_dias': z.number().int().min(1).max(30),
  'documento.alertas_dias': z.array(z.number().int().min(1).max(180)).min(1),
});
export type Configuracoes = z.infer<typeof configuracoesSchema>;
export type ChaveConfiguracao = keyof Configuracoes;

export const CONFIGURACOES_PADRAO: Configuracoes = {
  'aula.duracao_padrao_min': 50,
  'aula.intervalo_entre_aulas_min': 10,
  'aula.prazo_aceite_horas': 12,
  'aula.aceite_limite_antes_inicio_horas': 2,
  'aula.pix_expira_min': 30,
  'aula.checkin_raio_m': 300,
  'aula.checkin_antecedencia_min': 30,
  'aula.checkout_auto_confirmacao_h': 24,
  'aula.antecedencia_minima_agendamento_h': 2,
  'aula.dias_agenda_aberta': 30,
  'cancelamento.gratis_ate_horas': 24,
  'cancelamento.multa_bp': 5000,
  'pedido.lembrete_horas': 48,
  'pedido.expiracao_dias': 5,
  'documento.alertas_dias': [30, 15, 7],
};

export const DESCRICOES_CONFIGURACAO: Record<ChaveConfiguracao, string> = {
  'aula.duracao_padrao_min': 'Duração padrão da aula (minutos)',
  'aula.intervalo_entre_aulas_min': 'Intervalo mínimo entre aulas do instrutor (minutos)',
  'aula.prazo_aceite_horas': 'Prazo para o instrutor aceitar uma solicitação (horas)',
  'aula.aceite_limite_antes_inicio_horas': 'Aceite deve ocorrer até X horas antes do início',
  'aula.pix_expira_min': 'Validade do Pix (minutos)',
  'aula.checkin_raio_m': 'Distância máxima do ponto de encontro no check-in (metros)',
  'aula.checkin_antecedencia_min': 'Check-in liberado a partir de X minutos antes do início',
  'aula.checkout_auto_confirmacao_h': 'Confirmação automática do fim da aula (horas)',
  'aula.antecedencia_minima_agendamento_h': 'Antecedência mínima para agendar (horas)',
  'aula.dias_agenda_aberta': 'Quantos dias à frente o aluno pode agendar',
  'cancelamento.gratis_ate_horas': 'Cancelamento grátis até X horas antes',
  'cancelamento.multa_bp': 'Multa por cancelamento tardio (pontos-base; 5000 = 50%)',
  'pedido.lembrete_horas': 'Lembrete à autoescola sem resposta (horas)',
  'pedido.expiracao_dias': 'Estorno automático sem resposta da autoescola (dias)',
  'documento.alertas_dias': 'Alertas de documento vencendo (dias antes)',
};

export const atualizarConfiguracoes = configuracoesSchema.partial();
export type AtualizarConfiguracoes = z.infer<typeof atualizarConfiguracoes>;

/** Subconjunto das configurações que os apps precisam conhecer (ex.: regra de cancelamento). */
export const configuracoesPublicas = z.object({
  duracaoPadraoMin: z.number(),
  cancelamentoGratisAteHoras: z.number(),
  cancelamentoMultaBp: z.number(),
  diasAgendaAberta: z.number(),
  gatewayPagamento: z.string(),
});
export type ConfiguracoesPublicas = z.infer<typeof configuracoesPublicas>;
