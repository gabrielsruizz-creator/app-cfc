import { Inject, Injectable } from '@nestjs/common';
import type {
  AvaliarAula,
  Checkin,
  PreviaCancelamento,
  RegistrarEvolucao,
  SolicitarAula,
} from '@volante/contracts';
import {
  aulaAnotacoes,
  aulas,
  avaliacoes,
  cobrancas,
  eq,
  instrutores,
  lerConfiguracoes,
  publicarEvento,
  registrosEvolucao,
  sql,
  type Ator,
  type Ponto,
} from '@volante/db';
import {
  calcularAceiteAte,
  calcularCancelamento,
  cancelarAula,
  carregarAulaParaAlterar,
  carregarInstrutorAtivo,
  concluirAula,
  dataLocal,
  distanciaMetros,
  encerrarComEstornoTotal,
  ErroDominio,
  horariosLivresInstrutor,
  mudarStatusAula,
  solicitarAulaAvulsa,
  type Aula,
} from '@volante/dominio';
import { CONFIG, type Config } from '../../config';
import { BancoService } from '../../nucleo/banco.service';

const MAX_TENTATIVAS_CHECKIN = 5;

@Injectable()
export class AulasService {
  constructor(
    private readonly banco: BancoService,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  /** Retorna o id da aula (nova ou já criada com a mesma chave de idempotência). */
  async solicitar(
    ator: Ator & { alunoId: string },
    dados: SolicitarAula,
    chaveIdempotencia: string,
  ) {
    if (dados.creditoId) {
      throw new ErroDominio(
        'pacotes_em_breve',
        'Agendamento com saldo de pacote chega na próxima versão',
      );
    }
    const chave = `${ator.alunoId}:${chaveIdempotencia}`;
    return this.banco.comAtor(ator, async (tx) => {
      const [existente] = await tx
        .select({ pedidoId: cobrancas.pedidoId })
        .from(cobrancas)
        .where(eq(cobrancas.chaveIdempotencia, chave));
      if (existente) {
        const [a] = await tx
          .select({ id: aulas.id })
          .from(aulas)
          .where(eq(aulas.pedidoId, existente.pedidoId));
        return a!.id;
      }
      const r = await solicitarAulaAvulsa(tx, {
        alunoId: ator.alunoId,
        instrutorId: dados.instrutorId,
        inicio: new Date(dados.inicio),
        categoria: dados.categoria,
        pontoEncontro: dados.pontoEncontro,
        pontoEncontroEndereco: dados.pontoEncontroEndereco,
        pontoEncontroReferencia: dados.pontoEncontroReferencia,
        gateway: this.config.PAGAMENTO_GATEWAY,
        chaveIdempotencia: chave,
      });
      return r.aula.id;
    });
  }

  /** Carrega a aula no contexto do usuário (RLS garante que ela é dele) e trava a linha. */
  private async comAula<T>(
    ator: Ator,
    aulaId: string,
    fn: (aula: Aula, tx: Parameters<Parameters<BancoService['comAtor']>[1]>[0]) => Promise<T>,
  ) {
    return this.banco.comAtor(ator, async (tx) => {
      const aula = await carregarAulaParaAlterar(tx, aulaId);
      return fn(aula, tx);
    });
  }

  previaCancelamento(ator: Ator, aulaId: string): Promise<PreviaCancelamento> {
    return this.comAula(ator, aulaId, async (aula) => {
      const c = calcularCancelamento(aula, new Date());
      const porInstrutor = ator.tipo === 'instrutor';
      return {
        gratuito: porInstrutor || c.gratuito,
        multaCentavos: porInstrutor ? 0 : c.multaCentavos,
        reembolsoCentavos: porInstrutor ? aula.valorCentavos : c.reembolsoCentavos,
        gratisAte: c.gratisAte.toISOString(),
      };
    });
  }

  cancelar(ator: Ator, aulaId: string, motivo: string) {
    return this.comAula(ator, aulaId, async (aula, tx) => {
      const cancelaveis = ['aguardando_pagamento', 'solicitada', 'confirmada', 'a_caminho'];
      if (!cancelaveis.includes(aula.status)) {
        throw new ErroDominio(
          'nao_cancelavel',
          'Esta aula não pode mais ser cancelada',
          'conflito',
        );
      }
      await this.banco.elevarParaSistema(tx);
      await cancelarAula(tx, aula, {
        por: ator.tipo === 'instrutor' ? 'instrutor' : 'aluno',
        motivo,
        atorUsuarioId: ator.usuarioId,
      });
    });
  }

  remarcar(ator: Ator & { alunoId: string }, aulaId: string, novoInicio: Date) {
    return this.comAula(ator, aulaId, async (aula, tx) => {
      if (!['solicitada', 'confirmada'].includes(aula.status)) {
        throw new ErroDominio('nao_remarcavel', 'Esta aula não pode ser remarcada', 'conflito');
      }
      const agora = new Date();
      if (!calcularCancelamento(aula, agora).gratuito) {
        throw new ErroDominio(
          'fora_do_prazo',
          `A remarcação só é possível até ${aula.politicaCancelamento.gratisAteHoras} horas antes da aula`,
        );
      }
      const { instrutor } = await carregarInstrutorAtivo(tx, aula.instrutorId);
      const livres = await horariosLivresInstrutor(
        tx,
        instrutor,
        dataLocal(novoInicio, instrutor.fusoHorario),
        agora,
      );
      const slot = livres.find((l) => l.inicio.getTime() === novoInicio.getTime());
      if (!slot)
        throw new ErroDominio(
          'horario_indisponivel',
          'Esse horário não está disponível',
          'conflito',
        );
      const cfg = await lerConfiguracoes(tx);
      await mudarStatusAula(tx, aula, 'solicitada', {
        atorUsuarioId: ator.usuarioId,
        motivo: `Remarcada de ${aula.inicio.toISOString()}`,
        extras: {
          inicio: slot.inicio,
          fim: slot.fim,
          aceiteAte: calcularAceiteAte(agora, slot.inicio, {
            prazoAceiteHoras: cfg['aula.prazo_aceite_horas'],
            limiteAntesInicioHoras: cfg['aula.aceite_limite_antes_inicio_horas'],
          }),
        },
      });
      await publicarEvento(tx, {
        tipo: 'aula.remarcada',
        agregadoTipo: 'aula',
        agregadoId: aula.id,
        autoescolaId: aula.autoescolaId,
        payload: { aulaId: aula.id, alunoId: aula.alunoId, instrutorId: aula.instrutorId },
      });
    });
  }

  confirmarFim(ator: Ator, aulaId: string) {
    return this.comAula(ator, aulaId, async (aula, tx) => {
      if (aula.status !== 'aguardando_confirmacao') {
        throw new ErroDominio(
          'aula_nao_finalizada',
          'O instrutor ainda não finalizou esta aula',
          'conflito',
        );
      }
      await this.banco.elevarParaSistema(tx);
      await concluirAula(tx, aula.id, 'aluno', { atorUsuarioId: ator.usuarioId });
    });
  }

  avaliar(ator: Ator & { alunoId: string }, aulaId: string, dados: AvaliarAula) {
    return this.comAula(ator, aulaId, async (aula, tx) => {
      if (aula.status !== 'concluida') {
        throw new ErroDominio(
          'aula_nao_concluida',
          'Você poderá avaliar depois que a aula for concluída',
        );
      }
      const [existente] = await tx
        .select({ id: avaliacoes.id })
        .from(avaliacoes)
        .where(eq(avaliacoes.aulaId, aula.id));
      if (existente) throw new ErroDominio('ja_avaliada', 'Você já avaliou esta aula', 'conflito');
      await tx.insert(avaliacoes).values({
        aulaId: aula.id,
        autorAlunoId: ator.alunoId,
        alvoTipo: 'instrutor',
        instrutorId: aula.instrutorId,
        nota: dados.nota,
        comentario: dados.comentario || null,
      });
      await tx
        .update(instrutores)
        .set({
          totalAvaliacoes: sql`${instrutores.totalAvaliacoes} + 1`,
          somaNotas: sql`${instrutores.somaNotas} + ${dados.nota}`,
          notaMedia: sql`round((${instrutores.somaNotas} + ${dados.nota})::numeric / (${instrutores.totalAvaliacoes} + 1), 1)`,
        })
        .where(eq(instrutores.id, aula.instrutorId));
      await publicarEvento(tx, {
        tipo: 'aula.avaliada',
        agregadoTipo: 'aula',
        agregadoId: aula.id,
        payload: { aulaId: aula.id, instrutorId: aula.instrutorId, nota: dados.nota },
      });
    });
  }

  // ---------- Instrutor ----------

  aceitar(ator: Ator, aulaId: string) {
    return this.comAula(ator, aulaId, async (aula, tx) => {
      if (aula.status !== 'solicitada') {
        throw new ErroDominio(
          'nao_aceitavel',
          'Esta solicitação não está mais pendente',
          'conflito',
        );
      }
      if (aula.aceiteAte && aula.aceiteAte < new Date()) {
        throw new ErroDominio(
          'prazo_encerrado',
          'O prazo para aceitar esta aula terminou',
          'conflito',
        );
      }
      await mudarStatusAula(tx, aula, 'confirmada', {
        atorUsuarioId: ator.usuarioId,
        motivo: 'Aceita pelo instrutor',
      });
      await publicarEvento(tx, {
        tipo: 'aula.confirmada',
        agregadoTipo: 'aula',
        agregadoId: aula.id,
        autoescolaId: aula.autoescolaId,
        payload: { aulaId: aula.id, alunoId: aula.alunoId, instrutorId: aula.instrutorId },
      });
    });
  }

  recusar(ator: Ator, aulaId: string, motivo: string) {
    return this.comAula(ator, aulaId, async (aula, tx) => {
      if (aula.status !== 'solicitada') {
        throw new ErroDominio(
          'nao_recusavel',
          'Esta solicitação não está mais pendente',
          'conflito',
        );
      }
      await this.banco.elevarParaSistema(tx);
      await encerrarComEstornoTotal(tx, aula, 'recusada', {
        motivo,
        atorUsuarioId: ator.usuarioId,
      });
      await publicarEvento(tx, {
        tipo: 'aula.recusada',
        agregadoTipo: 'aula',
        agregadoId: aula.id,
        autoescolaId: aula.autoescolaId,
        payload: { aulaId: aula.id, alunoId: aula.alunoId, instrutorId: aula.instrutorId, motivo },
      });
    });
  }

  async checkin(ator: Ator, aulaId: string, dados: Checkin) {
    const resultado = await this.comAula(ator, aulaId, async (aula, tx) => {
      if (!['confirmada', 'a_caminho'].includes(aula.status)) {
        throw new ErroDominio(
          'checkin_indisponivel',
          'O check-in só é possível em aulas confirmadas',
          'conflito',
        );
      }
      const cfg = await lerConfiguracoes(tx);
      const agora = new Date();
      const liberadoEm = new Date(
        aula.inicio.getTime() - cfg['aula.checkin_antecedencia_min'] * 60_000,
      );
      if (agora < liberadoEm) {
        throw new ErroDominio(
          'checkin_cedo',
          `O check-in é liberado ${cfg['aula.checkin_antecedencia_min']} minutos antes do início da aula`,
        );
      }
      if (agora > aula.fim)
        throw new ErroDominio('checkin_tarde', 'O horário desta aula já terminou');
      if (aula.tentativasCheckin >= MAX_TENTATIVAS_CHECKIN) {
        throw new ErroDominio(
          'checkin_bloqueado',
          'Muitas tentativas com código errado. Fale com o suporte.',
        );
      }
      if (dados.codigo !== aula.codigoCheckin) return { codigoErrado: true as const };
      const distancia = distanciaMetros(dados.local, aula.pontoEncontro);
      if (distancia > cfg['aula.checkin_raio_m']) {
        throw new ErroDominio(
          'longe_do_ponto',
          `Você está a ${distancia} m do ponto de encontro. Aproxime-se (até ${cfg['aula.checkin_raio_m']} m) para fazer o check-in.`,
        );
      }
      await mudarStatusAula(tx, aula, 'em_andamento', {
        atorUsuarioId: ator.usuarioId,
        local: dados.local,
        motivo: 'Check-in',
        extras: { checkinEm: agora, checkinLocal: dados.local, checkinDistanciaM: distancia },
      });
      await publicarEvento(tx, {
        tipo: 'aula.checkin',
        agregadoTipo: 'aula',
        agregadoId: aula.id,
        autoescolaId: aula.autoescolaId,
        payload: { aulaId: aula.id, alunoId: aula.alunoId, instrutorId: aula.instrutorId },
      });
      return { codigoErrado: false as const };
    });
    if (resultado.codigoErrado) {
      // Conta a tentativa em transação própria (o erro abaixo não pode desfazer a contagem).
      await this.banco.comAtor(ator, (tx) =>
        tx
          .update(aulas)
          .set({ tentativasCheckin: sql`${aulas.tentativasCheckin} + 1` })
          .where(eq(aulas.id, aulaId)),
      );
      throw new ErroDominio(
        'codigo_invalido',
        'Código incorreto. Peça ao aluno o código exibido no app dele.',
        'validacao',
      );
    }
  }

  checkout(ator: Ator, aulaId: string, local: Ponto) {
    return this.comAula(ator, aulaId, async (aula, tx) => {
      if (aula.status !== 'em_andamento') {
        throw new ErroDominio(
          'checkout_indisponivel',
          'Faça o check-in antes de finalizar a aula',
          'conflito',
        );
      }
      await mudarStatusAula(tx, aula, 'aguardando_confirmacao', {
        atorUsuarioId: ator.usuarioId,
        local,
        motivo: 'Check-out',
        extras: { checkoutEm: new Date(), checkoutLocal: local },
      });
      await publicarEvento(tx, {
        tipo: 'aula.checkout',
        agregadoTipo: 'aula',
        agregadoId: aula.id,
        autoescolaId: aula.autoescolaId,
        payload: { aulaId: aula.id, alunoId: aula.alunoId, instrutorId: aula.instrutorId },
      });
    });
  }

  registrarEvolucao(ator: Ator, aulaId: string, dados: RegistrarEvolucao) {
    return this.comAula(ator, aulaId, async (aula, tx) => {
      if (!['em_andamento', 'aguardando_confirmacao', 'concluida'].includes(aula.status)) {
        throw new ErroDominio(
          'evolucao_indisponivel',
          'Registre a evolução depois do check-in da aula',
        );
      }
      for (const r of dados.registros) {
        await tx
          .insert(registrosEvolucao)
          .values({
            aulaId: aula.id,
            alunoId: aula.alunoId,
            instrutorId: aula.instrutorId,
            autoescolaId: aula.autoescolaId,
            habilidadeId: r.habilidadeId,
            nivel: r.nivel,
            observacao: r.observacao ?? null,
          })
          .onConflictDoUpdate({
            target: [registrosEvolucao.aulaId, registrosEvolucao.habilidadeId],
            set: { nivel: r.nivel, observacao: r.observacao ?? null },
          });
      }
      if (dados.anotacao) {
        await tx
          .insert(aulaAnotacoes)
          .values({
            aulaId: aula.id,
            alunoId: aula.alunoId,
            instrutorId: aula.instrutorId,
            autoescolaId: aula.autoescolaId,
            texto: dados.anotacao,
            visivelAluno: dados.anotacaoVisivelAluno,
          })
          .onConflictDoUpdate({
            target: aulaAnotacoes.aulaId,
            set: { texto: dados.anotacao, visivelAluno: dados.anotacaoVisivelAluno },
          });
      }
    });
  }
}
