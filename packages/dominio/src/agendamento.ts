import type { CategoriaCnh, Gateway } from '@volante/contracts';
import {
  and,
  aulaHistorico,
  aulas,
  bloqueiosAgenda,
  cobrancas,
  creditosAula,
  creditosMovimentos,
  disponibilidadesSemanais,
  eq,
  gte,
  instrutores,
  lerConfiguracoes,
  lt,
  pedidos,
  publicarEvento,
  sql,
  usuarios,
  veiculos,
  type Executor,
  type Ponto,
  type Tx,
} from '@volante/db';
import { calcularHorariosLivres, dataLocal, type Intervalo } from './agenda';
import { gerarCodigoCheckin, gerarCodigoPedido } from './codigos';
import { codigoErroPostgres, ErroDominio, naoEncontrado } from './erros';
import { calcularAceiteAte, movimentarCredito } from './aulas';
import { calcularComissao, regraComissaoVigente } from './financeiro';
import { validarCreditoParaInstrutor } from './pacotes';

export async function carregarInstrutorAtivo(tx: Executor, instrutorId: string) {
  const [linha] = await tx
    .select({ instrutor: instrutores, nome: usuarios.nome })
    .from(instrutores)
    .innerJoin(usuarios, eq(usuarios.id, instrutores.usuarioId))
    .where(eq(instrutores.id, instrutorId));
  if (!linha) throw naoEncontrado('instrutor');
  return linha;
}

/** Horários livres do instrutor num dia (AAAA-MM-DD no fuso do instrutor). */
export async function horariosLivresInstrutor(
  tx: Executor,
  instrutor: typeof instrutores.$inferSelect,
  data: string,
  agora = new Date(),
): Promise<Intervalo[]> {
  const cfg = await lerConfiguracoes(tx);
  const faixas = await tx
    .select()
    .from(disponibilidadesSemanais)
    .where(eq(disponibilidadesSemanais.instrutorId, instrutor.id));
  // Janela ampla (±1 dia) para cobrir diferenças de fuso.
  const de = new Date(`${data}T00:00:00Z`);
  de.setUTCDate(de.getUTCDate() - 1);
  const ate = new Date(`${data}T00:00:00Z`);
  ate.setUTCDate(ate.getUTCDate() + 2);

  const ocupados = await tx.execute<{ inicio: string; fim: string }>(
    sql`select inicio, fim from horarios_ocupados_instrutor(${instrutor.id}, ${de.toISOString()}, ${ate.toISOString()})`,
  );
  const bloqueios = await tx
    .select()
    .from(bloqueiosAgenda)
    .where(
      and(
        eq(bloqueiosAgenda.instrutorId, instrutor.id),
        lt(bloqueiosAgenda.inicio, ate),
        gte(bloqueiosAgenda.fim, de),
      ),
    );

  return calcularHorariosLivres({
    data,
    fusoHorario: instrutor.fusoHorario,
    faixas: faixas.map((f) => ({
      diaSemana: f.diaSemana,
      horaInicio: f.horaInicio,
      horaFim: f.horaFim,
    })),
    duracaoMin: instrutor.duracaoAulaMin,
    intervaloMin: cfg['aula.intervalo_entre_aulas_min'],
    ocupados: ocupados.rows.map((o) => ({ inicio: new Date(o.inicio), fim: new Date(o.fim) })),
    bloqueios: bloqueios.map((b) => ({ inicio: b.inicio, fim: b.fim })),
    agora,
    antecedenciaMinimaH: Math.max(
      instrutor.antecedenciaMinimaH ?? 0,
      cfg['aula.antecedencia_minima_agendamento_h'],
    ),
  });
}

export type DadosSolicitacao = {
  alunoId: string;
  instrutorId: string;
  inicio: Date;
  categoria: CategoriaCnh;
  pontoEncontro: Ponto;
  pontoEncontroEndereco: string;
  pontoEncontroReferencia?: string | null;
  gateway: Gateway;
  chaveIdempotencia: string;
  agora?: Date;
};

/**
 * Aluno solicita uma aula avulsa: cria pedido, crédito de 1 aula, aula (segurando o horário)
 * e cobrança Pix. A cobrança é enviada ao gateway pelo worker (evento cobranca.solicitada).
 */
export async function solicitarAulaAvulsa(tx: Tx, d: DadosSolicitacao) {
  const agora = d.agora ?? new Date();
  const { instrutor, nome: nomeInstrutor } = await carregarInstrutorAtivo(tx, d.instrutorId);
  if (instrutor.status !== 'aprovado' || !instrutor.disponivel) {
    throw new ErroDominio(
      'instrutor_indisponivel',
      'Este instrutor não está recebendo aulas no momento',
    );
  }
  if (!instrutor.categorias.includes(d.categoria)) {
    throw new ErroDominio(
      'categoria_nao_atendida',
      `Este instrutor não dá aulas da categoria ${d.categoria}`,
    );
  }
  if (!instrutor.precoAulaCentavos) {
    throw new ErroDominio(
      'instrutor_sem_preco',
      'Este instrutor ainda não definiu o preço da aula',
    );
  }

  const livres = await horariosLivresInstrutor(
    tx,
    instrutor,
    dataLocal(d.inicio, instrutor.fusoHorario),
    agora,
  );
  const slot = livres.find((l) => l.inicio.getTime() === d.inicio.getTime());
  if (!slot) {
    throw new ErroDominio(
      'horario_indisponivel',
      'Esse horário não está mais disponível. Escolha outro.',
      'conflito',
    );
  }

  const cfg = await lerConfiguracoes(tx);
  const regra = await regraComissaoVigente(tx, 'instrutor', 'aula_avulsa', {
    instrutorId: instrutor.id,
  });
  const valor = instrutor.precoAulaCentavos;
  const comissao = calcularComissao(valor, regra);

  const [pedido] = await tx
    .insert(pedidos)
    .values({
      codigo: gerarCodigoPedido(),
      alunoId: d.alunoId,
      vendedorTipo: 'instrutor',
      instrutorId: instrutor.id,
      tipo: 'aula_avulsa',
      snapshot: {
        descricao: `Aula avulsa categoria ${d.categoria} (${instrutor.duracaoAulaMin} min)`,
        categorias: [d.categoria],
        quantidadeAulas: 1,
        duracaoAulaMin: instrutor.duracaoAulaMin,
        precoUnitarioCentavos: valor,
        vendedorNome: nomeInstrutor,
      },
      quantidadeAulas: 1,
      valorBrutoCentavos: valor,
      valorTotalCentavos: valor,
      comissaoBp: regra.percentualBp,
      comissaoCentavos: comissao,
      regraComissaoId: regra.id,
      valorLiquidoVendedorCentavos: valor - comissao,
    })
    .returning();

  const [credito] = await tx
    .insert(creditosAula)
    .values({
      pedidoId: pedido!.id,
      alunoId: d.alunoId,
      instrutorId: instrutor.id,
      categorias: [d.categoria],
      duracaoAulaMin: instrutor.duracaoAulaMin,
      quantidadeTotal: 1,
      quantidadeReservada: 1,
      status: 'aguardando_pagamento',
    })
    .returning();

  const [veiculo] = instrutor.forneceVeiculo
    ? await tx
        .select({ id: veiculos.id })
        .from(veiculos)
        .where(and(eq(veiculos.instrutorId, instrutor.id), eq(veiculos.ativo, true)))
        .limit(1)
    : [];

  let aula;
  try {
    [aula] = await tx
      .insert(aulas)
      .values({
        alunoId: d.alunoId,
        instrutorId: instrutor.id,
        pedidoId: pedido!.id,
        creditoId: credito!.id,
        veiculoId: veiculo?.id ?? null,
        categoria: d.categoria,
        inicio: slot.inicio,
        fim: slot.fim,
        valorCentavos: valor,
        pontoEncontro: d.pontoEncontro,
        pontoEncontroEndereco: d.pontoEncontroEndereco,
        pontoEncontroReferencia: d.pontoEncontroReferencia ?? null,
        status: 'aguardando_pagamento',
        codigoCheckin: gerarCodigoCheckin(),
        politicaCancelamento: {
          gratisAteHoras: cfg['cancelamento.gratis_ate_horas'],
          multaBp: cfg['cancelamento.multa_bp'],
        },
      })
      .returning();
  } catch (erro) {
    const pg = codigoErroPostgres(erro);
    if (pg.code === '23P01') {
      const mensagem =
        pg.constraint === 'aulas_sem_conflito_aluno'
          ? 'Você já tem uma aula nesse horário.'
          : 'Esse horário acabou de ser reservado. Escolha outro.';
      throw new ErroDominio('horario_indisponivel', mensagem, 'conflito');
    }
    throw erro;
  }
  await tx
    .insert(creditosMovimentos)
    .values({ creditoId: credito!.id, aulaId: aula!.id, tipo: 'reserva', quantidade: 1 });
  await tx.insert(aulaHistorico).values({
    aulaId: aula!.id,
    alunoId: d.alunoId,
    instrutorId: instrutor.id,
    paraStatus: 'aguardando_pagamento',
    motivo: 'Aula solicitada; aguardando o Pix',
  });

  const [cobranca] = await tx
    .insert(cobrancas)
    .values({
      pedidoId: pedido!.id,
      alunoId: d.alunoId,
      instrutorId: instrutor.id,
      gateway: d.gateway,
      metodo: 'pix',
      valorCentavos: valor,
      pixExpiraEm: new Date(agora.getTime() + cfg['aula.pix_expira_min'] * 60_000),
      chaveIdempotencia: d.chaveIdempotencia,
    })
    .returning();

  await publicarEvento(tx, {
    tipo: 'pedido.criado',
    agregadoTipo: 'pedido',
    agregadoId: pedido!.id,
    payload: { pedidoId: pedido!.id, alunoId: d.alunoId, autoescolaId: null },
  });
  await publicarEvento(tx, {
    tipo: 'cobranca.solicitada',
    agregadoTipo: 'cobranca',
    agregadoId: cobranca!.id,
    payload: { cobrancaId: cobranca!.id },
  });
  return { pedido: pedido!, aula: aula!, cobranca: cobranca! };
}

export type DadosAgendamentoComCredito = Omit<DadosSolicitacao, 'gateway' | 'chaveIdempotencia'> & {
  creditoId: string;
};

/**
 * Aluno agenda usando o saldo de um pacote (de instrutor ou de autoescola). Não há cobrança:
 * a aula nasce "solicitada" e reserva 1 aula do saldo.
 */
export async function solicitarAulaComCredito(tx: Tx, d: DadosAgendamentoComCredito) {
  const agora = d.agora ?? new Date();
  const [credito] = await tx
    .select()
    .from(creditosAula)
    .where(and(eq(creditosAula.id, d.creditoId), eq(creditosAula.alunoId, d.alunoId)))
    .for('update');
  if (!credito) throw naoEncontrado('credito');
  await validarCreditoParaInstrutor(tx, credito, d.instrutorId);
  if (!credito.categorias.some((c) => c === d.categoria || c.includes(d.categoria))) {
    throw new ErroDominio('categoria_nao_atendida', 'Este pacote não inclui essa categoria');
  }

  const { instrutor } = await carregarInstrutorAtivo(tx, d.instrutorId);
  if (instrutor.status !== 'aprovado') {
    throw new ErroDominio('instrutor_indisponivel', 'Este instrutor não está atendendo no momento');
  }
  const livres = await horariosLivresInstrutor(
    tx,
    instrutor,
    dataLocal(d.inicio, instrutor.fusoHorario),
    agora,
  );
  const slot = livres.find((l) => l.inicio.getTime() === d.inicio.getTime());
  if (!slot)
    throw new ErroDominio(
      'horario_indisponivel',
      'Esse horário não está mais disponível. Escolha outro.',
      'conflito',
    );

  const [pedido] = await tx.select().from(pedidos).where(eq(pedidos.id, credito.pedidoId));
  const cfg = await lerConfiguracoes(tx);
  const [veiculo] = instrutor.forneceVeiculo
    ? await tx
        .select({ id: veiculos.id })
        .from(veiculos)
        .where(and(eq(veiculos.instrutorId, instrutor.id), eq(veiculos.ativo, true)))
        .limit(1)
    : [];

  let aula;
  try {
    [aula] = await tx
      .insert(aulas)
      .values({
        alunoId: d.alunoId,
        instrutorId: instrutor.id,
        autoescolaId: credito.autoescolaId,
        pedidoId: credito.pedidoId,
        creditoId: credito.id,
        veiculoId: veiculo?.id ?? null,
        categoria: d.categoria,
        inicio: slot.inicio,
        fim: slot.fim,
        valorCentavos: Math.round(pedido!.valorTotalCentavos / pedido!.quantidadeAulas),
        pontoEncontro: d.pontoEncontro,
        pontoEncontroEndereco: d.pontoEncontroEndereco,
        pontoEncontroReferencia: d.pontoEncontroReferencia ?? null,
        status: 'solicitada',
        aceiteAte: calcularAceiteAte(agora, slot.inicio, {
          prazoAceiteHoras: cfg['aula.prazo_aceite_horas'],
          limiteAntesInicioHoras: cfg['aula.aceite_limite_antes_inicio_horas'],
        }),
        codigoCheckin: gerarCodigoCheckin(),
        politicaCancelamento: {
          gratisAteHoras: cfg['cancelamento.gratis_ate_horas'],
          multaBp: cfg['cancelamento.multa_bp'],
        },
      })
      .returning();
  } catch (erro) {
    const pg = codigoErroPostgres(erro);
    if (pg.code === '23P01') {
      throw new ErroDominio(
        'horario_indisponivel',
        pg.constraint === 'aulas_sem_conflito_aluno'
          ? 'Você já tem uma aula nesse horário.'
          : 'Esse horário acabou de ser reservado. Escolha outro.',
        'conflito',
      );
    }
    throw erro;
  }
  await movimentarCredito(tx, credito.id, aula!.id, 'reserva');
  await tx.insert(aulaHistorico).values({
    aulaId: aula!.id,
    alunoId: d.alunoId,
    instrutorId: instrutor.id,
    autoescolaId: credito.autoescolaId,
    paraStatus: 'solicitada',
    motivo: 'Agendada com saldo de pacote',
  });
  await publicarEvento(tx, {
    tipo: 'aula.solicitada',
    agregadoTipo: 'aula',
    agregadoId: aula!.id,
    autoescolaId: credito.autoescolaId,
    payload: { aulaId: aula!.id, alunoId: d.alunoId, instrutorId: instrutor.id },
  });
  return aula!;
}
