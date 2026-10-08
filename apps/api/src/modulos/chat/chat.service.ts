import { Injectable } from '@nestjs/common';
import type { Mensagem, ResumoConversa } from '@volante/contracts';
import {
  alunos,
  and,
  asc,
  aulas,
  autoescolaMembros,
  autoescolas,
  conversas,
  desc,
  eq,
  instrutores,
  isNull,
  mensagens,
  ne,
  pedidos,
  publicarEvento,
  sql,
  type Ator,
  type Tx,
} from '@volante/db';
import { ErroDominio, naoEncontrado } from '@volante/dominio';
import { BancoService } from '../../nucleo/banco.service';

type Papel = 'aluno' | 'instrutor' | 'autoescola';

const papelDo = (ator: Ator): Papel =>
  ator.tipo === 'aluno' ? 'aluno' : ator.tipo === 'instrutor' ? 'instrutor' : 'autoescola';

/** Chat entre aluno e instrutor/autoescola. Os telefones nunca são compartilhados por aqui. */
@Injectable()
export class ChatService {
  constructor(private readonly banco: BancoService) {}

  /** Abre (ou reaproveita) a conversa. Instrutor/autoescola só falam com alunos que já atenderam ou venderam. */
  async iniciar(
    ator: Ator,
    alvo: { instrutorId?: string; autoescolaId?: string; alunoId?: string },
  ) {
    return this.banco.comAtor(ator, async (tx) => {
      let chave: { alunoId: string; instrutorId: string | null; autoescolaId: string | null };
      if (ator.tipo === 'aluno') {
        if (!alvo.instrutorId && !alvo.autoescolaId)
          throw new ErroDominio('alvo_invalido', 'Escolha com quem conversar', 'validacao');
        chave = {
          alunoId: ator.alunoId!,
          instrutorId: alvo.instrutorId ?? null,
          autoescolaId: alvo.autoescolaId ?? null,
        };
      } else {
        if (!alvo.alunoId) throw new ErroDominio('alvo_invalido', 'Escolha o aluno', 'validacao');
        const relacao =
          ator.tipo === 'instrutor'
            ? await tx
                .select({ id: aulas.id })
                .from(aulas)
                .where(eq(aulas.alunoId, alvo.alunoId))
                .limit(1)
            : await tx
                .select({ id: pedidos.id })
                .from(pedidos)
                .where(eq(pedidos.alunoId, alvo.alunoId))
                .limit(1);
        if (!relacao.length)
          throw new ErroDominio(
            'sem_relacao',
            'Você só pode conversar com seus alunos',
            'proibido',
          );
        chave = {
          alunoId: alvo.alunoId,
          instrutorId: ator.tipo === 'instrutor' ? ator.instrutorId! : null,
          autoescolaId: ator.tipo === 'autoescola' ? ator.autoescolaId! : null,
        };
      }
      const tipo = chave.instrutorId ? 'aluno_instrutor' : 'aluno_autoescola';
      const filtro = chave.instrutorId
        ? and(eq(conversas.alunoId, chave.alunoId), eq(conversas.instrutorId, chave.instrutorId))
        : and(
            eq(conversas.alunoId, chave.alunoId),
            eq(conversas.autoescolaId, chave.autoescolaId!),
          );
      const [existente] = await tx.select().from(conversas).where(filtro);
      if (existente) return existente.id;
      const [nova] = await tx
        .insert(conversas)
        .values({ tipo, ...chave })
        .returning();
      return nova!.id;
    });
  }

  async listar(ator: Ator): Promise<ResumoConversa[]> {
    return this.banco.comAtor(ator, async (tx) => {
      const papel = papelDo(ator);
      const linhas = await tx
        .select({
          c: conversas,
          alunoNome: sql<string>`ua.nome`,
          alunoFoto: alunos.selfieArquivoId,
          instrutorNome: sql<string | null>`ui.nome`,
          instrutorFoto: sql<string | null>`ui.foto_arquivo_id`,
          autoescolaNome: autoescolas.nomeFantasia,
          autoescolaLogo: autoescolas.logoArquivoId,
          ultima: sql<
            string | null
          >`(select m.texto from mensagens m where m.conversa_id = ${conversas.id} order by m.criado_em desc limit 1)`,
          naoLidas: sql<number>`(select count(*)::int from mensagens m where m.conversa_id = ${conversas.id} and m.lida_em is null and m.autor_papel <> ${papel})`,
        })
        .from(conversas)
        .innerJoin(alunos, eq(alunos.id, conversas.alunoId))
        .innerJoin(sql`usuarios ua`, sql`ua.id = ${alunos.usuarioId}`)
        .leftJoin(instrutores, eq(instrutores.id, conversas.instrutorId))
        .leftJoin(sql`usuarios ui`, sql`ui.id = ${instrutores.usuarioId}`)
        .leftJoin(autoescolas, eq(autoescolas.id, conversas.autoescolaId))
        .orderBy(desc(sql`coalesce(${conversas.ultimaMensagemEm}, ${conversas.criadoEm})`))
        .limit(200);
      return linhas.map((l) => {
        const outra =
          papel === 'aluno'
            ? l.c.instrutorId
              ? {
                  nome: l.instrutorNome ?? 'Instrutor',
                  fotoArquivoId: l.instrutorFoto,
                  papel: 'instrutor',
                }
              : {
                  nome: l.autoescolaNome ?? 'Autoescola',
                  fotoArquivoId: l.autoescolaLogo,
                  papel: 'autoescola',
                }
            : { nome: l.alunoNome, fotoArquivoId: l.alunoFoto, papel: 'aluno' };
        return {
          id: l.c.id,
          tipo: l.c.tipo as ResumoConversa['tipo'],
          outraParte: outra,
          ultimaMensagem: l.ultima,
          ultimaMensagemEm: l.c.ultimaMensagemEm?.toISOString() ?? null,
          naoLidas: l.naoLidas,
        };
      });
    });
  }

  private async carregar(tx: Tx, conversaId: string) {
    const [c] = await tx.select().from(conversas).where(eq(conversas.id, conversaId));
    if (!c) throw naoEncontrado('conversa');
    return c;
  }

  async mensagens(ator: Ator, conversaId: string): Promise<Mensagem[]> {
    return this.banco.comAtor(ator, async (tx) => {
      const c = await this.carregar(tx, conversaId);
      const papel = papelDo(ator);
      await tx
        .update(mensagens)
        .set({ lidaEm: new Date() })
        .where(
          and(
            eq(mensagens.conversaId, c.id),
            isNull(mensagens.lidaEm),
            ne(mensagens.autorPapel, papel),
          ),
        );
      const linhas = await tx
        .select()
        .from(mensagens)
        .where(eq(mensagens.conversaId, c.id))
        .orderBy(asc(mensagens.criadoEm))
        .limit(500);
      return linhas.map((m) => ({
        id: m.id,
        texto: m.texto,
        minha: m.autorPapel === papel,
        autorPapel: m.autorPapel,
        criadoEm: m.criadoEm.toISOString(),
        lidaEm: m.lidaEm?.toISOString() ?? null,
      }));
    });
  }

  async enviar(ator: Ator, conversaId: string, texto: string) {
    await this.banco.comAtor(ator, async (tx) => {
      const c = await this.carregar(tx, conversaId);
      const papel = papelDo(ator);
      const [m] = await tx
        .insert(mensagens)
        .values({
          conversaId: c.id,
          alunoId: c.alunoId,
          instrutorId: c.instrutorId,
          autoescolaId: c.autoescolaId,
          autorUsuarioId: ator.usuarioId!,
          autorPapel: papel,
          texto,
        })
        .returning();
      await tx
        .update(conversas)
        .set({ ultimaMensagemEm: new Date() })
        .where(eq(conversas.id, c.id));
      // Destinatários (usuários) para o aviso: o aluno, o instrutor ou os membros da autoescola.
      await this.banco.elevarParaSistema(tx);
      const destinatarios: string[] = [];
      if (papel !== 'aluno') {
        const [a] = await tx
          .select({ u: alunos.usuarioId })
          .from(alunos)
          .where(eq(alunos.id, c.alunoId));
        if (a) destinatarios.push(a.u);
      } else if (c.instrutorId) {
        const [i] = await tx
          .select({ u: instrutores.usuarioId })
          .from(instrutores)
          .where(eq(instrutores.id, c.instrutorId));
        if (i) destinatarios.push(i.u);
      } else if (c.autoescolaId) {
        const ms = await tx
          .select({ u: autoescolaMembros.usuarioId })
          .from(autoescolaMembros)
          .where(
            and(
              eq(autoescolaMembros.autoescolaId, c.autoescolaId),
              eq(autoescolaMembros.status, 'ativo'),
            ),
          );
        destinatarios.push(...ms.map((x) => x.u));
      }
      await publicarEvento(tx, {
        tipo: 'mensagem.enviada',
        agregadoTipo: 'conversa',
        agregadoId: c.id,
        autoescolaId: c.autoescolaId,
        payload: { mensagemId: m!.id, conversaId: c.id, destinatarioUsuarioIds: destinatarios },
      });
    });
    return this.mensagens(ator, conversaId);
  }
}
