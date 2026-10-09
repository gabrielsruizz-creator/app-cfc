import type { AulaCfcPlus, EventoCfcPlus, TipoEvento } from '@volante/contracts';
import {
  alunos,
  and,
  asc,
  ATOR_SISTEMA,
  aulaAnotacoes,
  aulas,
  cobrancas,
  comAtor,
  desc,
  eq,
  habilidades,
  instrutores,
  integracoesAutoescola,
  isNotNull,
  matriculas,
  operacoesIntegracao,
  pedidos,
  registrosEvolucao,
  usuarios,
  veiculos,
  type Tx,
} from '@volante/db';
import { cargaHoraria, decifrar } from '@volante/dominio';
import type { Dependencias } from '../dependencias';
import type { Consumidor, Evento } from '../outbox';
import type { ConexaoCfcPlus, ResultadoCfcPlus } from '../portas/cfc-plus';

class ErroReprocessavel extends Error {}

type Integracao = typeof integracoesAutoescola.$inferSelect;

function integracaoDe(tx: Tx, autoescolaId: string) {
  return tx
    .select()
    .from(integracoesAutoescola)
    .where(
      and(
        eq(integracoesAutoescola.autoescolaId, autoescolaId),
        eq(integracoesAutoescola.sistema, 'cfc_plus'),
      ),
    )
    .then((r) => r[0]);
}

function conexaoDe(i: Integracao): ConexaoCfcPlus | null {
  if (!i.configuracaoCifrada) return null;
  return JSON.parse(decifrar(Buffer.from(i.configuracaoCifrada).toString('utf8')));
}

/** Monta o envelope (versão 1) com o estado atual do pedido e os dados do aluno. */
export async function montarEventoCfcPlus(
  tx: Tx,
  d: { id: string; tipo: EventoCfcPlus['tipo']; ocorridoEm: Date; pedidoId: string },
): Promise<EventoCfcPlus | null> {
  const [linha] = await tx
    .select({ pedido: pedidos, aluno: alunos, usuario: usuarios })
    .from(pedidos)
    .innerJoin(alunos, eq(alunos.id, pedidos.alunoId))
    .innerJoin(usuarios, eq(usuarios.id, alunos.usuarioId))
    .where(eq(pedidos.id, d.pedidoId));
  if (!linha) return null;
  const { pedido: p, aluno: a, usuario: u } = linha;
  const [cobranca] = await tx
    .select()
    .from(cobrancas)
    .where(eq(cobrancas.pedidoId, p.id))
    .orderBy(desc(cobrancas.criadoEm))
    .limit(1);
  const [matricula] = await tx
    .select({ id: matriculas.id })
    .from(matriculas)
    .where(eq(matriculas.pedidoId, p.id));
  return {
    versao: 1,
    id: d.id,
    tipo: d.tipo,
    ocorridoEm: d.ocorridoEm.toISOString(),
    pedido: {
      id: p.id,
      codigo: p.codigo,
      status: p.status,
      statusAtendimento: p.statusAtendimento,
      motivoRecusa: p.motivoRecusa,
      descricao: p.snapshot.descricao,
      categorias: p.snapshot.categorias,
      quantidadeAulas: p.quantidadeAulas,
      duracaoAulaMin: p.snapshot.duracaoAulaMin,
      valorBrutoCentavos: p.valorBrutoCentavos,
      descontoCentavos: p.descontoCentavos,
      valorPagoCentavos: p.valorTotalCentavos,
      valorLiquidoCentavos: p.valorLiquidoVendedorCentavos,
      cupom: p.snapshot.cupomCodigo ?? null,
      metodoPagamento: (cobranca?.metodo as 'pix' | 'cartao' | undefined) ?? null,
      parcelas: cobranca?.parcelas ?? 1,
      pagoEm: p.pagoEm?.toISOString() ?? null,
      matriculaId: matricula?.id ?? null,
    },
    aluno: {
      id: a.id,
      nome: u.nome,
      nomeSocial: u.nomeSocial,
      cpf: u.cpf,
      email: u.email,
      telefone: u.telefone,
      dataNascimento: u.dataNascimento,
      categoriaDesejada: a.categoriaDesejada,
      renach: a.renach,
    },
  };
}

/** Envelope (versão 1) de uma aula concluída: horários reais, minutos, instrutor e evolução. */
export async function montarAulaCfcPlus(
  tx: Tx,
  d: { id: string; tipo: AulaCfcPlus['tipo']; ocorridoEm: Date; aulaId: string },
): Promise<AulaCfcPlus | null> {
  const [linha] = await tx
    .select({ aula: aulas, pedidoCodigo: pedidos.codigo, veiculo: veiculos })
    .from(aulas)
    .innerJoin(pedidos, eq(pedidos.id, aulas.pedidoId))
    .leftJoin(veiculos, eq(veiculos.id, aulas.veiculoId))
    .where(eq(aulas.id, d.aulaId));
  if (!linha || linha.aula.status !== 'concluida') return null;
  const a = linha.aula;
  const [instrutor] = await tx
    .select({ nome: usuarios.nome, cpf: usuarios.cpf })
    .from(instrutores)
    .innerJoin(usuarios, eq(usuarios.id, instrutores.usuarioId))
    .where(eq(instrutores.id, a.instrutorId));
  const [aluno] = await tx
    .select({ nome: usuarios.nome, cpf: usuarios.cpf })
    .from(alunos)
    .innerJoin(usuarios, eq(usuarios.id, alunos.usuarioId))
    .where(eq(alunos.id, a.alunoId));
  const evolucao = await tx
    .select({ nome: habilidades.nome, nivel: registrosEvolucao.nivel })
    .from(registrosEvolucao)
    .innerJoin(habilidades, eq(habilidades.id, registrosEvolucao.habilidadeId))
    .where(eq(registrosEvolucao.aulaId, a.id))
    .orderBy(asc(habilidades.ordem));
  const [nota] = await tx.select().from(aulaAnotacoes).where(eq(aulaAnotacoes.aulaId, a.id));
  const c = cargaHoraria(a);
  const v = linha.veiculo;
  return {
    versao: 1,
    id: d.id,
    tipo: d.tipo,
    ocorridoEm: d.ocorridoEm.toISOString(),
    aula: {
      id: a.id,
      pedidoId: a.pedidoId,
      pedidoCodigo: linha.pedidoCodigo,
      categoria: a.categoria,
      inicio: a.inicio.toISOString(),
      fim: a.fim.toISOString(),
      checkinEm: a.checkinEm?.toISOString() ?? null,
      checkoutEm: a.checkoutEm?.toISOString() ?? null,
      minutosAgendados: c.agendados,
      minutosRealizados: a.minutosRealizados ?? c.realizados,
      minutosContados: c.contados,
      instrutor: { nome: instrutor?.nome ?? 'Instrutor', cpf: instrutor?.cpf ?? null },
      veiculo: v
        ? {
            placa: v.placa,
            descricao: `${v.marca} ${v.modelo}${v.cor ? ` ${v.cor.toLowerCase()}` : ''}`,
          }
        : null,
      pontoEncontro: a.pontoEncontroEndereco,
      habilidades: evolucao,
      anotacao: nota?.texto ?? null,
    },
    aluno: { id: a.alunoId, nome: aluno?.nome ?? 'Aluno', cpf: aluno?.cpf ?? null },
  };
}

/** Registra a tentativa (em transação própria, para não sumir se o evento for reprocessado). */
async function registrarOperacao(
  deps: Dependencias,
  d: {
    integracao: Integracao;
    eventoOrigemId: string | null;
    envio: EventoCfcPlus | AulaCfcPlus;
    resultado: ResultadoCfcPlus;
  },
) {
  const r = d.resultado;
  const ehAula = 'aula' in d.envio;
  await comAtor(deps.db, ATOR_SISTEMA, async (tx) => {
    await tx.insert(operacoesIntegracao).values({
      autoescolaId: d.integracao.autoescolaId,
      sistema: 'cfc_plus',
      operacao: d.envio.tipo,
      eventoOrigemId: d.eventoOrigemId,
      tipoRegistro: ehAula ? 'aula' : 'pedido',
      idInterno: 'aula' in d.envio ? d.envio.aula.id : d.envio.pedido.id,
      requisicao: d.envio,
      resposta: r.status === 'pendente_configuracao' ? null : ((r.resposta ?? null) as never),
      httpStatus: r.status === 'pendente_configuracao' ? null : (r.httpStatus ?? null),
      status:
        r.status === 'sucesso'
          ? 'sucesso'
          : r.status === 'pendente_configuracao'
            ? 'pendente_configuracao'
            : r.reprocessar
              ? 'aguardando_reprocessamento'
              : 'erro',
      tentativas: 1,
      ultimoErro: r.status === 'sucesso' ? null : r.motivo,
      concluidaEm: r.status === 'sucesso' ? new Date() : null,
    });
    if (r.status === 'erro' && r.credencialInvalida) {
      await tx
        .update(integracoesAutoescola)
        .set({ status: 'erro', ultimoErro: r.motivo, atualizadoEm: new Date() })
        .where(eq(integracoesAutoescola.id, d.integracao.id));
    }
  });
}

/** Envia e registra; falha passageira vira exceção para o outbox tentar de novo mais tarde. */
async function enviar(
  deps: Dependencias,
  integracao: Integracao,
  conexao: ConexaoCfcPlus,
  envio: EventoCfcPlus,
  eventoOrigemId: string | null,
) {
  const resultado = await deps.cfcPlus.enviarEvento(conexao, envio);
  await registrarOperacao(deps, { integracao, eventoOrigemId, envio, resultado });
  return resultado;
}

async function enviarAula(
  deps: Dependencias,
  integracao: Integracao,
  conexao: ConexaoCfcPlus,
  envio: AulaCfcPlus,
  eventoOrigemId: string | null,
) {
  const resultado = await deps.cfcPlus.enviarAula(conexao, envio);
  await registrarOperacao(deps, { integracao, eventoOrigemId, envio, resultado });
  return resultado;
}

const EVENTOS_PEDIDO: TipoEvento[] = [
  'pedido.pago',
  'pedido.confirmado',
  'pedido.recusado',
  'pedido.expirado',
  'matricula.criada',
];

/**
 * Encaminha as vendas de autoescolas CONECTADAS ao CFC Plus. Autoescola não conectada e
 * instrutor autônomo são ignorados — nada no fluxo do app depende desta integração.
 * Cada tentativa fica em operacoes_integracao (requisição, resposta, status).
 */
export const integrarCfcPlus: Consumidor = {
  nome: 'integracao.cfc_plus',
  eventos: EVENTOS_PEDIDO,
  async executar(deps, evento) {
    if (!evento.autoescolaId) return;
    const preparo = await comAtor(deps.db, ATOR_SISTEMA, async (tx) => {
      const integracao = await integracaoDe(tx, evento.autoescolaId!);
      if (integracao?.status !== 'conectada') return null;
      const conexao = conexaoDe(integracao);
      if (!conexao) return null;
      const { pedidoId } = evento.payload as { pedidoId: string };
      const envio = await montarEventoCfcPlus(tx, {
        id: evento.id,
        tipo: evento.tipo as EventoCfcPlus['tipo'],
        ocorridoEm: evento.ocorridoEm,
        pedidoId,
      });
      return envio ? { integracao, conexao, envio } : null;
    });
    if (!preparo) return;
    const r = await enviar(deps, preparo.integracao, preparo.conexao, preparo.envio, evento.id);
    if (r.status === 'erro' && r.reprocessar) throw new ErroReprocessavel(r.motivo);
  },
};

/**
 * Aulas concluídas de autoescolas conectadas vão para a agenda do CFC Plus (lançadas como realizadas).
 * Evolução registrada depois da conclusão reenvia a aula como "aula.atualizada".
 */
export const integrarAulasCfcPlus: Consumidor = {
  nome: 'integracao.cfc_plus.aulas',
  eventos: ['aula.concluida', 'aula.evolucao_registrada'],
  async executar(deps, evento) {
    if (!evento.autoescolaId) return;
    const preparo = await comAtor(deps.db, ATOR_SISTEMA, async (tx) => {
      const integracao = await integracaoDe(tx, evento.autoescolaId!);
      if (integracao?.status !== 'conectada') return null;
      const conexao = conexaoDe(integracao);
      if (!conexao) return null;
      const { aulaId } = evento.payload as { aulaId: string };
      const envio = await montarAulaCfcPlus(tx, {
        id: evento.id,
        tipo: evento.tipo === 'aula.concluida' ? 'aula.concluida' : 'aula.atualizada',
        ocorridoEm: evento.ocorridoEm,
        aulaId,
      });
      return envio ? { integracao, conexao, envio } : null;
    });
    if (!preparo) return;
    const r = await enviarAula(deps, preparo.integracao, preparo.conexao, preparo.envio, evento.id);
    if (r.status === 'erro' && r.reprocessar) throw new ErroReprocessavel(r.motivo);
  },
};

/** Confere endereço e chave (pedido pelo painel ao conectar ou em "Testar conexão"). */
export const testarCfcPlus: Consumidor = {
  nome: 'integracao.cfc_plus.testar',
  eventos: ['integracao.testar'],
  async executar(deps, evento) {
    const { autoescolaId } = evento.payload as { autoescolaId: string };
    const integracao = await comAtor(deps.db, ATOR_SISTEMA, (tx) => integracaoDe(tx, autoescolaId));
    if (!integracao || integracao.status !== 'testando') return;
    const conexao = conexaoDe(integracao);
    if (!conexao) return;
    const r = await deps.cfcPlus.testar(conexao);
    if (r.status === 'erro' && r.reprocessar && evento.tentativas < 2) {
      throw new ErroReprocessavel(r.motivo); // uma nova tentativa rápida antes de mostrar o erro
    }
    const nome =
      r.status === 'sucesso'
        ? ((r.resposta as { cfc?: { nome?: string } } | null)?.cfc?.nome ?? null)
        : null;
    await comAtor(deps.db, ATOR_SISTEMA, (tx) =>
      tx
        .update(integracoesAutoescola)
        .set(
          r.status === 'sucesso'
            ? {
                status: 'conectada',
                conectadaEm: integracao.conectadaEm ?? new Date(),
                nomeNoSistema: nome,
                testadaEm: new Date(),
                ultimoErro: null,
                atualizadoEm: new Date(),
              }
            : {
                status: 'erro',
                testadaEm: new Date(),
                ultimoErro: r.motivo,
                atualizadoEm: new Date(),
              },
        )
        .where(eq(integracoesAutoescola.id, integracao.id)),
    );
  },
};

/** "Reenviar vendas e aulas": manda o estado atual de cada pedido pago e cada aula concluída da autoescola. */
export const sincronizarCfcPlus: Consumidor = {
  nome: 'integracao.cfc_plus.sincronizar',
  eventos: ['integracao.sincronizar'],
  async executar(deps, evento: Evento) {
    const { autoescolaId } = evento.payload as { autoescolaId: string };
    const preparo = await comAtor(deps.db, ATOR_SISTEMA, async (tx) => {
      const integracao = await integracaoDe(tx, autoescolaId);
      if (integracao?.status !== 'conectada') return null;
      const conexao = conexaoDe(integracao);
      if (!conexao) return null;
      const lista = await tx
        .select({ id: pedidos.id })
        .from(pedidos)
        .where(and(eq(pedidos.autoescolaId, autoescolaId), isNotNull(pedidos.pagoEm)))
        .orderBy(pedidos.pagoEm);
      const envios: (EventoCfcPlus | AulaCfcPlus)[] = [];
      for (const p of lista) {
        const e = await montarEventoCfcPlus(tx, {
          // mesmo id em cada nova tentativa deste evento: o CFC Plus ignora repetições
          id: `sync:${evento.id}:${p.id}`,
          tipo: 'pedido.sincronizado',
          ocorridoEm: new Date(),
          pedidoId: p.id,
        });
        if (e) envios.push(e);
      }
      const concluidas = await tx
        .select({ id: aulas.id })
        .from(aulas)
        .where(and(eq(aulas.autoescolaId, autoescolaId), eq(aulas.status, 'concluida')))
        .orderBy(aulas.inicio);
      for (const a of concluidas) {
        const e = await montarAulaCfcPlus(tx, {
          id: `sync:${evento.id}:${a.id}`,
          tipo: 'aula.concluida',
          ocorridoEm: new Date(),
          aulaId: a.id,
        });
        if (e) envios.push(e);
      }
      return { integracao, conexao, envios };
    });
    if (!preparo) return;
    let passageira: string | null = null;
    for (const envio of preparo.envios) {
      const r =
        'aula' in envio
          ? await enviarAula(deps, preparo.integracao, preparo.conexao, envio, evento.id)
          : await enviar(deps, preparo.integracao, preparo.conexao, envio, evento.id);
      if (r.status === 'erro' && r.credencialInvalida) return;
      if (r.status === 'erro' && r.reprocessar) passageira = r.motivo;
    }
    if (passageira) throw new ErroReprocessavel(passageira);
  },
};
