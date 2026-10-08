import type { TipoEvento } from '@volante/contracts';
import {
  adminsPlataforma,
  alunos,
  and,
  ATOR_SISTEMA,
  autoescolaMembros,
  aulas,
  comAtor,
  dispositivosPush,
  entregasNotificacao,
  eq,
  inArray,
  instrutores,
  notificacoes,
  type Db,
} from '@volante/db';
import { formatarCentavos } from '@volante/contracts';
import type { Dependencias } from '../dependencias';
import type { Consumidor, Evento } from '../outbox';

type Aviso = { usuarioId: string; titulo: string; corpo: string; dados?: Record<string, unknown> };

const usuarioDoAluno = async (db: Db, alunoId: string) =>
  (await db.select({ id: alunos.usuarioId }).from(alunos).where(eq(alunos.id, alunoId)))[0]?.id;
const usuarioDoInstrutor = async (db: Db, instrutorId: string) =>
  (
    await db
      .select({ id: instrutores.usuarioId })
      .from(instrutores)
      .where(eq(instrutores.id, instrutorId))
  )[0]?.id;

function quando(inicio: Date) {
  return inicio.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Traduz um evento de domínio em avisos para as pessoas envolvidas. */
async function montarAvisos(db: Db, evento: Evento): Promise<Aviso[]> {
  const p = evento.payload as Record<string, string>;
  const avisos: Aviso[] = [];
  const aula = p.aulaId
    ? (
        await comAtor(db, ATOR_SISTEMA, (tx) =>
          tx.select().from(aulas).where(eq(aulas.id, p.aulaId!)),
        )
      )[0]
    : undefined;
  const aluno = p.alunoId ? await usuarioDoAluno(db, p.alunoId) : undefined;
  const instrutor = p.instrutorId ? await usuarioDoInstrutor(db, p.instrutorId) : undefined;
  const dadosAula: Record<string, unknown> | undefined = aula
    ? { tela: 'aula', aulaId: aula.id }
    : undefined;
  const em = aula ? quando(aula.inicio) : '';
  const add = (
    usuarioId: string | undefined,
    titulo: string,
    corpo: string,
    dados: Record<string, unknown> | undefined = dadosAula,
  ) => {
    if (usuarioId) avisos.push({ usuarioId, titulo, corpo, dados });
  };

  switch (evento.tipo as TipoEvento) {
    case 'aula.solicitada':
      add(instrutor, 'Nova solicitação de aula', `Um aluno quer aula em ${em}. Responda no app.`);
      add(aluno, 'Pagamento confirmado', `Sua solicitação para ${em} foi enviada ao instrutor.`);
      break;
    case 'aula.confirmada':
      add(aluno, 'Aula confirmada! 🚗', `Sua aula de ${em} foi confirmada pelo instrutor.`);
      break;
    case 'aula.recusada':
      add(
        aluno,
        'Aula não aceita',
        `O instrutor não pôde aceitar a aula de ${em}. O valor será devolvido.`,
      );
      break;
    case 'aula.expirada':
      add(
        aluno,
        'Solicitação expirou',
        `O instrutor não respondeu a tempo para ${em}. O valor será devolvido.`,
      );
      break;
    case 'aula.cancelada':
      if (p.canceladaPor === 'aluno')
        add(instrutor, 'Aula cancelada', `O aluno cancelou a aula de ${em}.`);
      else add(aluno, 'Aula cancelada', `A aula de ${em} foi cancelada. O valor será devolvido.`);
      break;
    case 'aula.remarcada':
      add(instrutor, 'Aula remarcada', `Um aluno remarcou a aula para ${em}. Confirme no app.`);
      break;
    case 'aula.checkin':
      add(aluno, 'Aula iniciada', 'Boa aula! Dirija com atenção.');
      break;
    case 'aula.checkout':
      add(aluno, 'Aula finalizada', 'Confirme o fim da aula e conte como foi.');
      break;
    case 'aula.concluida':
      add(aluno, 'Como foi sua aula?', 'Avalie seu instrutor e veja sua evolução.');
      if (aula)
        add(
          instrutor,
          'Valor liberado',
          `O valor da aula de ${em} foi liberado (${formatarCentavos(aula.valorCentavos)} bruto).`,
        );
      break;
    case 'aula.avaliada':
      add(instrutor, 'Nova avaliação', `Você recebeu ${p.nota} estrela(s).`);
      break;
    case 'cobranca.expirada':
      break;
    case 'instrutor.aprovado':
      add(
        p.usuarioId,
        'Cadastro aprovado! 🎉',
        'Ative "Disponível" para começar a receber alunos.',
        { tela: 'instrutor' },
      );
      break;
    case 'instrutor.reprovado':
      add(
        p.usuarioId,
        'Cadastro precisa de ajustes',
        String(p.motivo || 'Veja os detalhes no app.'),
        { tela: 'instrutor' },
      );
      break;
    case 'instrutor.bloqueado':
      add(p.usuarioId, 'Conta de instrutor bloqueada', String(p.motivo || 'Fale com o suporte.'), {
        tela: 'instrutor',
      });
      break;
    case 'instrutor.documento_vencendo':
    case 'instrutor.documento_vencido': {
      const u = await usuarioDoInstrutor(db, p.instrutorId!);
      const vencido = evento.tipo === 'instrutor.documento_vencido';
      add(
        u,
        vencido ? 'Documento vencido' : 'Documento vencendo',
        vencido
          ? 'Um documento seu venceu e sua conta foi suspensa. Envie o documento atualizado.'
          : `Um documento seu vence em ${p.diasRestantes} dias. Envie a versão atualizada.`,
        { tela: 'documentos' },
      );
      break;
    }
    case 'instrutor.enviado_analise': {
      const admins = await db.select({ id: adminsPlataforma.usuarioId }).from(adminsPlataforma);
      for (const a of admins)
        add(
          a.id,
          'Instrutor aguardando análise',
          'Há um novo cadastro de instrutor para analisar.',
          { tela: 'admin' },
        );
      break;
    }
    case 'autoescola.aprovada':
    case 'autoescola.reprovada': {
      const membros = await comAtor(db, ATOR_SISTEMA, (tx) =>
        tx
          .select({ id: autoescolaMembros.usuarioId })
          .from(autoescolaMembros)
          .where(
            and(
              eq(autoescolaMembros.autoescolaId, p.autoescolaId!),
              inArray(autoescolaMembros.papel, ['dono', 'gerente']),
            ),
          ),
      );
      for (const m of membros) {
        add(
          m.id,
          evento.tipo === 'autoescola.aprovada'
            ? 'Autoescola aprovada'
            : 'Cadastro da autoescola precisa de ajustes',
          evento.tipo === 'autoescola.aprovada'
            ? 'Sua autoescola já aparece no app.'
            : String(p.motivo || ''),
          { tela: 'autoescola' },
        );
      }
      break;
    }
    default:
      break;
  }
  return avisos;
}

async function entregarPush(deps: Dependencias, notificacaoId: string, aviso: Aviso) {
  const dispositivos = await deps.db
    .select()
    .from(dispositivosPush)
    .where(and(eq(dispositivosPush.usuarioId, aviso.usuarioId), eq(dispositivosPush.ativo, true)));
  if (!dispositivos.length) {
    await deps.db
      .insert(entregasNotificacao)
      .values({ notificacaoId, canal: 'push', status: 'sem_destino' });
    return;
  }
  const r = await deps.push.enviar({
    tokens: dispositivos.map((d) => d.expoPushToken),
    titulo: aviso.titulo,
    corpo: aviso.corpo,
    dados: { ...aviso.dados, notificacaoId },
  });
  await deps.db.insert(entregasNotificacao).values({
    notificacaoId,
    canal: 'push',
    status: r.status,
    tentativas: 1,
    erro: r.status === 'enviada' ? null : r.motivo,
    enviadaEm: r.status === 'enviada' ? new Date() : null,
  });
  if (r.status === 'falhou' && r.tokensInvalidos?.length) {
    await deps.db
      .update(dispositivosPush)
      .set({ ativo: false })
      .where(inArray(dispositivosPush.expoPushToken, r.tokensInvalidos));
  }
}

export const EVENTOS_COM_AVISO: TipoEvento[] = [
  'aula.solicitada',
  'aula.confirmada',
  'aula.recusada',
  'aula.expirada',
  'aula.cancelada',
  'aula.remarcada',
  'aula.checkin',
  'aula.checkout',
  'aula.concluida',
  'aula.avaliada',
  'instrutor.aprovado',
  'instrutor.reprovado',
  'instrutor.bloqueado',
  'instrutor.documento_vencendo',
  'instrutor.documento_vencido',
  'instrutor.enviado_analise',
  'autoescola.aprovada',
  'autoescola.reprovada',
];

/** Grava a notificação in-app (sempre) e tenta o push (pode ficar pendente de configuração). */
export const notificar: Consumidor = {
  nome: 'notificacoes',
  eventos: EVENTOS_COM_AVISO,
  async executar(deps, evento) {
    const avisos = await montarAvisos(deps.db, evento);
    for (const aviso of avisos) {
      const [n] = await deps.db
        .insert(notificacoes)
        .values({
          usuarioId: aviso.usuarioId,
          tipo: evento.tipo,
          titulo: aviso.titulo,
          corpo: aviso.corpo,
          dados: aviso.dados ?? {},
        })
        .returning();
      await entregarPush(deps, n!.id, aviso);
    }
  },
};
