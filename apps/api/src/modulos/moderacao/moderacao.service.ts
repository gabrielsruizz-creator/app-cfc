import { Injectable } from '@nestjs/common';
import {
  and,
  auditar,
  aulas,
  autoescolas,
  denuncias,
  desc,
  disputas,
  eq,
  ilike,
  instrutores,
  lancamentos,
  or,
  pedidos,
  sessoes,
  sql,
  usuarios,
  contasFinanceiras,
  type Ator,
} from '@volante/db';
import { abrirDisputa, decidirDisputa, naoEncontrado } from '@volante/dominio';
import type { Sessao } from '../../nucleo/auth/sessao';
import { BancoService } from '../../nucleo/banco.service';

@Injectable()
export class ModeracaoService {
  constructor(private readonly banco: BancoService) {}

  // ---------- Usuários ----------

  async denunciar(
    s: Sessao,
    d: { alvoTipo: string; alvoId: string; aulaId?: string; motivo: string; descricao?: string },
  ) {
    const [den] = await this.banco.db
      .insert(denuncias)
      .values({
        denuncianteUsuarioId: s.usuarioId,
        alvoTipo: d.alvoTipo,
        alvoId: d.alvoId,
        aulaId: d.aulaId ?? null,
        motivo: d.motivo,
        descricao: d.descricao ?? null,
      })
      .returning({ id: denuncias.id });
    return den!;
  }

  async abrirDisputa(ator: Ator, papel: 'aluno' | 'instrutor', d: { aulaId: string; motivo: string; descricao: string }) {
    return this.banco.comAtor(ator, async (tx) => {
      // RLS garante que a aula é do usuário; depois o domínio grava como sistema.
      const [a] = await tx.select({ id: aulas.id }).from(aulas).where(eq(aulas.id, d.aulaId));
      if (!a) throw naoEncontrado('aula');
      await this.banco.elevarParaSistema(tx);
      return abrirDisputa(tx, { ...d, usuarioId: ator.usuarioId!, papel });
    });
  }

  // ---------- Admin ----------

  async listarDenuncias(ator: Ator, status?: string) {
    return this.banco.comAtor(ator, (tx) =>
      tx
        .select({ d: denuncias, denunciante: usuarios.nome })
        .from(denuncias)
        .innerJoin(usuarios, eq(usuarios.id, denuncias.denuncianteUsuarioId))
        .where(status ? eq(denuncias.status, status) : undefined)
        .orderBy(desc(denuncias.criadoEm))
        .limit(200),
    );
  }

  async resolverDenuncia(ator: Ator, id: string, d: { status: 'resolvida' | 'descartada'; resolucao: string }) {
    await this.banco.comAtor(ator, async (tx) => {
      const r = await tx
        .update(denuncias)
        .set({ status: d.status, resolucao: d.resolucao, resolvidaPor: ator.usuarioId ?? null, resolvidaEm: new Date() })
        .where(eq(denuncias.id, id))
        .returning();
      if (!r.length) throw naoEncontrado('denuncia');
      await auditar(tx, { ator, entidadeTipo: 'denuncia', entidadeId: id, acao: `denuncia.${d.status}`, motivo: d.resolucao });
    });
  }

  async listarDisputas(ator: Ator, status?: string) {
    return this.banco.comAtor(ator, (tx) =>
      tx
        .select({
          d: disputas,
          aula: { inicio: aulas.inicio, status: aulas.status, valorCentavos: aulas.valorCentavos },
          abertaPor: usuarios.nome,
        })
        .from(disputas)
        .innerJoin(aulas, eq(aulas.id, disputas.aulaId))
        .innerJoin(usuarios, eq(usuarios.id, disputas.abertaPorUsuarioId))
        .where(status ? eq(disputas.status, status) : undefined)
        .orderBy(desc(disputas.criadoEm))
        .limit(200),
    );
  }

  async decidirDisputa(
    ator: Ator,
    id: string,
    d: { decisao: 'estorno_total' | 'estorno_parcial' | 'negada'; valorEstornoCentavos?: number; resolucao: string },
  ) {
    await this.banco.comAtor(ator, (tx) => decidirDisputa(tx, { disputaId: id, ator, ...d }));
  }

  async buscarUsuarios(termo?: string) {
    const t = termo?.trim();
    const filtro = t
      ? or(ilike(usuarios.nome, `%${t}%`), ilike(usuarios.email, `%${t}%`), eq(usuarios.cpf, t.replace(/\D/g, '') || '-'))
      : undefined;
    return this.banco.db
      .select({
        id: usuarios.id,
        nome: usuarios.nome,
        email: usuarios.email,
        telefone: usuarios.telefone,
        cpf: usuarios.cpf,
        status: usuarios.status,
        criadoEm: usuarios.criadoEm,
        ultimoAcessoEm: usuarios.ultimoAcessoEm,
        aluno: sql<boolean>`exists (select 1 from alunos a where a.usuario_id = ${usuarios.id})`,
        instrutor: sql<boolean>`exists (select 1 from instrutores i where i.usuario_id = ${usuarios.id})`,
      })
      .from(usuarios)
      .where(filtro)
      .orderBy(desc(usuarios.criadoEm))
      .limit(100);
  }

  async alterarStatusUsuario(ator: Ator, usuarioId: string, bloquear: boolean, motivo: string) {
    await this.banco.comAtor(ator, async (tx) => {
      const [u] = await tx.select().from(usuarios).where(eq(usuarios.id, usuarioId)).for('update');
      if (!u || u.status === 'excluido') throw naoEncontrado('usuario');
      const novo = bloquear ? 'bloqueado' : 'ativo';
      await tx.update(usuarios).set({ status: novo }).where(eq(usuarios.id, usuarioId));
      if (bloquear) {
        await tx.update(sessoes).set({ revogadaEm: new Date() }).where(eq(sessoes.usuarioId, usuarioId));
        await tx.update(instrutores).set({ disponivel: false }).where(eq(instrutores.usuarioId, usuarioId));
      }
      await auditar(tx, {
        ator,
        entidadeTipo: 'usuario',
        entidadeId: usuarioId,
        acao: bloquear ? 'usuario.bloqueado' : 'usuario.desbloqueado',
        antes: { status: u.status },
        depois: { status: novo },
        motivo,
      });
    });
  }

  /** Indicadores do painel admin (mês corrente, fuso de São Paulo). */
  async dashboard(ator: Ator) {
    return this.banco.comAtor(ator, async (tx) => {
      const inicioMes = sql`date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'`;
      const [a] = await tx
        .select({
          aulasMes: sql<number>`count(*) filter (where ${aulas.status} = 'concluida' and ${aulas.inicio} >= ${inicioMes})::int`,
          aulasAgendadas: sql<number>`count(*) filter (where ${aulas.status} in ('solicitada','confirmada'))::int`,
        })
        .from(aulas);
      const [p] = await tx
        .select({
          faturamentoMes: sql<string>`coalesce(sum(${pedidos.valorTotalCentavos}) filter (where ${pedidos.pagoEm} >= ${inicioMes} and ${pedidos.status} in ('pago','encerrado')), 0)`,
          pedidosNaFila: sql<number>`count(*) filter (where ${pedidos.statusAtendimento} in ('novo','em_contato'))::int`,
        })
        .from(pedidos);
      const [receita] = await tx
        .select({ total: sql<string>`coalesce(sum(${lancamentos.valorCentavos}), 0)` })
        .from(lancamentos)
        .innerJoin(contasFinanceiras, eq(contasFinanceiras.id, lancamentos.contaId))
        .where(and(eq(contasFinanceiras.titularTipo, 'plataforma'), eq(lancamentos.tipo, 'comissao'), sql`${lancamentos.criadoEm} >= ${inicioMes}`));
      const [u] = await tx
        .select({
          ativos30d: sql<number>`count(*) filter (where ${usuarios.ultimoAcessoEm} > now() - interval '30 days')::int`,
          novosMes: sql<number>`count(*) filter (where ${usuarios.criadoEm} >= ${inicioMes})::int`,
          total: sql<number>`count(*) filter (where ${usuarios.status} = 'ativo')::int`,
        })
        .from(usuarios);
      const [parceiros] = await tx
        .select({
          instrutores: sql<number>`(select count(*)::int from instrutores where status = 'aprovado')`,
          autoescolas: sql<number>`(select count(*)::int from autoescolas where status = 'aprovada')`,
          alunos: sql<number>`(select count(*)::int from alunos)`,
        })
        .from(sql`(select 1) x`);
      const cidades = await tx
        .select({ municipio: autoescolas.municipio, uf: autoescolas.uf, autoescolas: sql<number>`count(*)::int` })
        .from(autoescolas)
        .where(eq(autoescolas.status, 'aprovada'))
        .groupBy(autoescolas.municipio, autoescolas.uf)
        .orderBy(desc(sql`count(*)`))
        .limit(10);
      const aulasPorDia = await tx
        .select({
          dia: sql<string>`to_char(${aulas.inicio} at time zone 'America/Sao_Paulo', 'YYYY-MM-DD')`,
          total: sql<number>`count(*)::int`,
        })
        .from(aulas)
        .where(and(eq(aulas.status, 'concluida'), sql`${aulas.inicio} > now() - interval '30 days'`))
        .groupBy(sql`1`)
        .orderBy(sql`1`);
      const [abertas] = await tx
        .select({
          denuncias: sql<number>`(select count(*)::int from denuncias where status in ('aberta','em_analise'))`,
          disputas: sql<number>`(select count(*)::int from disputas where status = 'aberta')`,
        })
        .from(sql`(select 1) x`);
      return {
        aulasRealizadasMes: a?.aulasMes ?? 0,
        aulasAgendadas: a?.aulasAgendadas ?? 0,
        faturamentoMesCentavos: Number(p?.faturamentoMes ?? 0),
        receitaPlataformaMesCentavos: Number(receita?.total ?? 0),
        pedidosNaFila: p?.pedidosNaFila ?? 0,
        usuariosAtivos30d: u?.ativos30d ?? 0,
        novosUsuariosMes: u?.novosMes ?? 0,
        usuariosTotal: u?.total ?? 0,
        instrutoresAprovados: parceiros?.instrutores ?? 0,
        autoescolasAprovadas: parceiros?.autoescolas ?? 0,
        alunos: parceiros?.alunos ?? 0,
        cidades,
        aulasPorDia,
        denunciasAbertas: abertas?.denuncias ?? 0,
        disputasAbertas: abertas?.disputas ?? 0,
      };
    });
  }
}
