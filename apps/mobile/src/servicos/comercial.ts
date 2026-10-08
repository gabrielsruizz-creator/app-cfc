import type { ResumoPedido } from '@volante/contracts';
import { router } from 'expo-router';
import { Alert } from 'react-native';
import { api, mensagemDeErro } from './api';

/** Compra um pacote (instrutor ou autoescola) e abre a tela de pagamento do pedido. */
export async function comprarPacote(pacoteId: string, temPerfilAluno: boolean) {
  if (!temPerfilAluno) {
    router.push('/completar-aluno');
    return;
  }
  try {
    const pedido = await api<ResumoPedido>('/aluno/pedidos', {
      corpo: { pacoteId },
      cabecalhos: { 'idempotency-key': `${pacoteId}-${Date.now()}` },
    });
    router.push(`/pedido/${pedido.id}`);
  } catch (e) {
    Alert.alert('Não foi possível comprar', mensagemDeErro(e));
  }
}

/** Abre (ou cria) a conversa e navega para ela. */
export async function abrirConversa(
  alvo: { instrutorId?: string; autoescolaId?: string; alunoId?: string },
  como: 'aluno' | 'instrutor' = 'aluno',
) {
  try {
    const r = await api<{ id: string }>(`/conversas?como=${como}`, { corpo: alvo });
    router.push(`/conversa/${r.id}?como=${como}`);
  } catch (e) {
    Alert.alert('Não foi possível abrir a conversa', mensagemDeErro(e));
  }
}

export const NOMES_ATENDIMENTO: Record<string, string> = {
  novo: 'Aguardando contato da autoescola',
  em_contato: 'A autoescola está em contato',
  confirmado: 'Matrícula confirmada',
  recusado: 'Recusado pela autoescola',
  expirado: 'Expirou sem resposta',
};
