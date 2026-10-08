import type { TipoEvento } from '@volante/contracts';
import {
  alunos,
  and,
  ATOR_SISTEMA,
  comAtor,
  eq,
  integracoesAutoescola,
  operacoesIntegracao,
  pedidos,
  usuarios,
} from '@volante/db';
import type { Consumidor } from '../outbox';

const EVENTOS: TipoEvento[] = ['pedido.pago', 'pedido.confirmado', 'pedido.recusado', 'pedido.expirado'];

/**
 * Encaminha eventos de pedidos de autoescolas CONECTADAS ao CFC Plus. Autoescola não conectada
 * e instrutor autônomo são ignorados aqui — nada no fluxo depende desta integração.
 * Cada tentativa fica em operacoes_integracao (requisição, resposta, status) para rastreio e reprocesso.
 */
export const integrarCfcPlus: Consumidor = {
  nome: 'integracao.cfc_plus',
  eventos: EVENTOS,
  async executar(deps, evento) {
    if (!evento.autoescolaId) return;
    await comAtor(deps.db, ATOR_SISTEMA, async (tx) => {
      const [integracao] = await tx
        .select()
        .from(integracoesAutoescola)
        .where(
          and(
            eq(integracoesAutoescola.autoescolaId, evento.autoescolaId!),
            eq(integracoesAutoescola.sistema, 'cfc_plus'),
            eq(integracoesAutoescola.status, 'conectada'),
          ),
        );
      if (!integracao) return;
      const { pedidoId } = evento.payload as { pedidoId: string };
      const [linha] = await tx
        .select({ pedido: pedidos, cpf: usuarios.cpf, nome: usuarios.nome })
        .from(pedidos)
        .innerJoin(alunos, eq(alunos.id, pedidos.alunoId))
        .innerJoin(usuarios, eq(usuarios.id, alunos.usuarioId))
        .where(eq(pedidos.id, pedidoId));
      if (!linha) return;
      const requisicao = {
        evento: evento.tipo,
        pedido: { codigo: linha.pedido.codigo, itens: linha.pedido.snapshot, valorCentavos: linha.pedido.valorTotalCentavos },
        aluno: { cpf: linha.cpf, nome: linha.nome },
      };
      const r = await deps.cfcPlus.executar({
        operacao: evento.tipo === 'pedido.pago' ? 'enviar_pedido' : 'atualizar_pedido',
        autoescolaId: evento.autoescolaId!,
        tipoRegistro: 'pedido',
        idInterno: pedidoId,
        cpfAluno: linha.cpf,
        dados: requisicao,
      });
      await tx.insert(operacoesIntegracao).values({
        autoescolaId: evento.autoescolaId!,
        sistema: 'cfc_plus',
        operacao: evento.tipo,
        eventoOrigemId: evento.id,
        tipoRegistro: 'pedido',
        idInterno: pedidoId,
        requisicao,
        resposta: r.status === 'sucesso' || r.status === 'erro' ? ((r.resposta ?? null) as never) : null,
        httpStatus: r.status === 'pendente_configuracao' ? null : (r.httpStatus ?? null),
        status: r.status,
        tentativas: 1,
        ultimoErro: r.status === 'sucesso' ? null : r.motivo,
        concluidaEm: r.status === 'sucesso' ? new Date() : null,
      });
    });
  },
};
