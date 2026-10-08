import { Injectable } from '@nestjs/common';
import type {
  AutoescolaCard,
  ItemFila,
  PerfilAutoescolaPublico,
  VitrineEntrada,
} from '@volante/contracts';
import {
  alunos,
  and,
  asc,
  autoescolaFotos,
  autoescolaHorarios,
  autoescolas,
  avaliacoes,
  creditosAula,
  desc,
  eq,
  inArray,
  instrutores,
  instrutorVinculos,
  isNotNull,
  matriculas,
  pedidos,
  publicarEvento,
  sql,
  usuarios,
  type Ator,
} from '@volante/db';
import {
  aulasDisponiveis,
  confirmarPedidoAutoescola,
  ErroDominio,
  marcarEmContato,
  naoEncontrado,
  recusarPedidoAutoescola,
  saldosConta,
  contaDe,
} from '@volante/dominio';
import { BancoService } from '../../nucleo/banco.service';
import { ArquivosService } from '../arquivos/arquivos.service';
import { ComercialService } from '../comercial/comercial.service';

const formatarHora = (t: string) => t.slice(0, 5);

function linkWhatsapp(telefone: string, mensagem: string) {
  return `https://wa.me/${telefone.replace(/\D/g, '')}?text=${encodeURIComponent(mensagem)}`;
}

@Injectable()
export class PainelAutoescolaService {
  constructor(
    private readonly banco: BancoService,
    private readonly arquivos: ArquivosService,
    private readonly comercial: ComercialService,
  ) {}

  // ---------- Fila "Novos alunos do app" ----------

  async fila(ator: Ator, status?: string): Promise<ItemFila[]> {
    return this.banco.comAtor(ator, async (tx) => {
      const [a] = await tx.select().from(autoescolas).where(eq(autoescolas.id, ator.autoescolaId!));
      const linhas = await tx
        .select({ p: pedidos, u: usuarios, aluno: alunos })
        .from(pedidos)
        .innerJoin(alunos, eq(alunos.id, pedidos.alunoId))
        .innerJoin(usuarios, eq(usuarios.id, alunos.usuarioId))
        .where(
          and(
            eq(pedidos.autoescolaId, ator.autoescolaId!),
            isNotNull(pedidos.statusAtendimento),
            status ? eq(pedidos.statusAtendimento, status) : undefined,
          ),
        )
        .orderBy(asc(pedidos.pagoEm))
        .limit(300);
      const agora = Date.now();
      return linhas.map(({ p, u, aluno }) => {
        const mensagem = (a?.mensagemWhatsappPadrao ?? '')
          .replaceAll('{aluno}', u.nome.split(' ')[0] ?? u.nome)
          .replaceAll('{autoescola}', a?.nomeFantasia ?? '')
          .replaceAll('{pacote}', p.snapshot.descricao);
        return {
          pedidoId: p.id,
          codigo: p.codigo,
          statusAtendimento: p.statusAtendimento as ItemFila['statusAtendimento'],
          aluno: {
            id: aluno.id,
            nome: u.nome,
            cpf: u.cpf,
            telefone: u.telefone,
            email: u.email,
            categoriaDesejada: aluno.categoriaDesejada,
            renach: aluno.renach,
          },
          descricao: p.snapshot.descricao,
          quantidadeAulas: p.quantidadeAulas,
          valorPagoCentavos: p.valorTotalCentavos,
          valorLiquidoCentavos: p.valorLiquidoVendedorCentavos,
          pagoEm: p.pagoEm?.toISOString() ?? null,
          prazoRespostaEm: p.prazoRespostaEm?.toISOString() ?? null,
          minutosEsperando: p.pagoEm ? Math.round((agora - p.pagoEm.getTime()) / 60_000) : 0,
          motivoRecusa: p.motivoRecusa,
          linkWhatsapp: linkWhatsapp(u.telefone, mensagem),
        };
      });
    });
  }

  async atualizarPedido(
    ator: Ator,
    pedidoId: string,
    acao: 'em_contato' | 'confirmar' | 'recusar',
    motivo?: string,
  ) {
    await this.banco.comAtor(ator, async (tx) => {
      // Confere no contexto da autoescola (RLS) e eleva só para gravar o financeiro.
      const [p] = await tx.select({ id: pedidos.id }).from(pedidos).where(eq(pedidos.id, pedidoId));
      if (!p) throw naoEncontrado('pedido');
      await this.banco.elevarParaSistema(tx);
      if (acao === 'em_contato')
        await marcarEmContato(tx, pedidoId, ator.autoescolaId!, ator.usuarioId!);
      else if (acao === 'confirmar')
        await confirmarPedidoAutoescola(tx, pedidoId, ator.autoescolaId!, ator.usuarioId!);
      else
        await recusarPedidoAutoescola(tx, pedidoId, ator.autoescolaId!, motivo!, ator.usuarioId!);
    });
  }

  // ---------- Alunos (matrículas) ----------

  async alunos(ator: Ator) {
    return this.banco.comAtor(ator, async (tx) => {
      const linhas = await tx
        .select({ m: matriculas, u: usuarios, aluno: alunos })
        .from(matriculas)
        .innerJoin(alunos, eq(alunos.id, matriculas.alunoId))
        .innerJoin(usuarios, eq(usuarios.id, alunos.usuarioId))
        .orderBy(desc(matriculas.criadoEm));
      const creditos = await tx
        .select()
        .from(creditosAula)
        .where(eq(creditosAula.autoescolaId, ator.autoescolaId!));
      return linhas.map(({ m, u, aluno }) => {
        const doAluno = creditos.filter((c) => c.alunoId === aluno.id && c.status === 'ativo');
        return {
          matriculaId: m.id,
          alunoId: aluno.id,
          nome: u.nome,
          cpf: u.cpf,
          telefone: u.telefone,
          email: u.email,
          categorias: m.categorias,
          status: m.status,
          desde: m.criadoEm.toISOString(),
          aulasDisponiveis: doAluno.reduce((acc, c) => acc + aulasDisponiveis(c), 0),
          aulasConcluidas: aluno.aulasConcluidas,
        };
      });
    });
  }

  // ---------- Instrutores vinculados ----------

  async instrutores(ator: Ator) {
    return this.banco.comAtor(ator, (tx) =>
      tx
        .select({
          vinculoId: instrutorVinculos.id,
          status: instrutorVinculos.status,
          desde: instrutorVinculos.inicioEm,
          instrutorId: instrutores.id,
          nome: usuarios.nome,
          email: usuarios.email,
          fotoArquivoId: usuarios.fotoArquivoId,
          categorias: instrutores.categorias,
          statusInstrutor: instrutores.status,
        })
        .from(instrutorVinculos)
        .innerJoin(instrutores, eq(instrutores.id, instrutorVinculos.instrutorId))
        .innerJoin(usuarios, eq(usuarios.id, instrutores.usuarioId))
        .where(
          and(
            eq(instrutorVinculos.autoescolaId, ator.autoescolaId!),
            inArray(instrutorVinculos.status, ['convidado', 'ativo']),
          ),
        )
        .orderBy(usuarios.nome),
    );
  }

  async convidarInstrutor(ator: Ator, cpfOuEmail: string) {
    const termo = cpfOuEmail.trim().toLowerCase();
    const cpf = termo.replace(/\D/g, '');
    const [alvo] = await this.banco.db
      .select({ instrutor: instrutores })
      .from(usuarios)
      .innerJoin(instrutores, eq(instrutores.usuarioId, usuarios.id))
      .where(termo.includes('@') ? eq(usuarios.email, termo) : eq(usuarios.cpf, cpf));
    if (!alvo) {
      throw new ErroDominio(
        'instrutor_nao_encontrado',
        'Nenhum instrutor com esse CPF ou e-mail. Ele precisa se cadastrar no app primeiro.',
      );
    }
    if (alvo.instrutor.status !== 'aprovado') {
      throw new ErroDominio(
        'instrutor_nao_aprovado',
        'Este instrutor ainda não teve o cadastro aprovado',
      );
    }
    await this.banco.comAtor(ator, async (tx) => {
      const [a] = await tx
        .select({ status: autoescolas.status })
        .from(autoescolas)
        .where(eq(autoescolas.id, ator.autoescolaId!));
      if (a?.status !== 'aprovada')
        throw new ErroDominio(
          'autoescola_nao_aprovada',
          'Sua autoescola precisa estar aprovada para convidar instrutores',
        );
      const [v] = await tx
        .insert(instrutorVinculos)
        .values({
          instrutorId: alvo.instrutor.id,
          autoescolaId: ator.autoescolaId!,
          convidadoPor: ator.usuarioId ?? null,
        })
        .onConflictDoNothing()
        .returning();
      if (!v)
        throw new ErroDominio(
          'convite_existente',
          'Este instrutor já foi convidado ou já está vinculado',
          'conflito',
        );
      await publicarEvento(tx, {
        tipo: 'instrutor.convidado',
        agregadoTipo: 'vinculo',
        agregadoId: v.id,
        autoescolaId: ator.autoescolaId,
        payload: {
          vinculoId: v.id,
          instrutorId: alvo.instrutor.id,
          autoescolaId: ator.autoescolaId!,
        },
      });
    });
    return this.instrutores(ator);
  }

  async encerrarVinculo(ator: Ator, vinculoId: string) {
    await this.banco.comAtor(ator, async (tx) => {
      const r = await tx
        .update(instrutorVinculos)
        .set({ status: 'encerrado', fimEm: new Date() })
        .where(
          and(
            eq(instrutorVinculos.id, vinculoId),
            inArray(instrutorVinculos.status, ['convidado', 'ativo']),
          ),
        )
        .returning();
      if (!r.length) throw naoEncontrado('vinculo');
    });
    return this.instrutores(ator);
  }

  // ---------- Vitrine ----------

  async vitrine(ator: Ator) {
    return this.banco.comAtor(ator, async (tx) => {
      const [a] = await tx.select().from(autoescolas).where(eq(autoescolas.id, ator.autoescolaId!));
      if (!a) throw naoEncontrado('autoescola');
      const fotos = await tx
        .select()
        .from(autoescolaFotos)
        .where(eq(autoescolaFotos.autoescolaId, a.id))
        .orderBy(asc(autoescolaFotos.ordem));
      const horarios = await tx
        .select()
        .from(autoescolaHorarios)
        .where(eq(autoescolaHorarios.autoescolaId, a.id))
        .orderBy(asc(autoescolaHorarios.diaSemana));
      return {
        descricao: a.descricao,
        mensagemWhatsappPadrao: a.mensagemWhatsappPadrao,
        logoArquivoId: a.logoArquivoId,
        fotos: fotos.map((f) => ({ id: f.id, arquivoId: f.arquivoId, legenda: f.legenda })),
        horarios: horarios.map((h) => ({
          diaSemana: h.diaSemana,
          abre: formatarHora(h.abre),
          fecha: formatarHora(h.fecha),
        })),
      };
    });
  }

  async salvarVitrine(ator: Ator, d: VitrineEntrada) {
    if (d.logoArquivoId) await this.arquivos.exigirDono(d.logoArquivoId, ator.usuarioId!);
    await this.banco.comAtor(ator, async (tx) => {
      await tx
        .update(autoescolas)
        .set({
          descricao: d.descricao ?? null,
          mensagemWhatsappPadrao: d.mensagemWhatsappPadrao,
          ...(d.logoArquivoId ? { logoArquivoId: d.logoArquivoId } : {}),
        })
        .where(eq(autoescolas.id, ator.autoescolaId!));
      await tx
        .delete(autoescolaHorarios)
        .where(eq(autoescolaHorarios.autoescolaId, ator.autoescolaId!));
      if (d.horarios.length) {
        await tx
          .insert(autoescolaHorarios)
          .values(d.horarios.map((h) => ({ ...h, autoescolaId: ator.autoescolaId! })));
      }
    });
    return this.vitrine(ator);
  }

  async adicionarFoto(ator: Ator, arquivoId: string, legenda?: string) {
    await this.arquivos.exigirDono(arquivoId, ator.usuarioId!);
    await this.banco.comAtor(ator, async (tx) => {
      const [{ n }] = (await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(autoescolaFotos)
        .where(eq(autoescolaFotos.autoescolaId, ator.autoescolaId!))) as [{ n: number }];
      if (n >= 12) throw new ErroDominio('limite_fotos', 'Máximo de 12 fotos na vitrine');
      await tx.insert(autoescolaFotos).values({
        autoescolaId: ator.autoescolaId!,
        arquivoId,
        legenda: legenda ?? null,
        ordem: n,
      });
    });
    return this.vitrine(ator);
  }

  async removerFoto(ator: Ator, fotoId: string) {
    await this.banco.comAtor(ator, (tx) =>
      tx.delete(autoescolaFotos).where(eq(autoescolaFotos.id, fotoId)),
    );
    return this.vitrine(ator);
  }

  // ---------- Avaliações ----------

  async avaliacoes(ator: Ator) {
    return this.banco.comAtor(ator, (tx) =>
      tx
        .select({
          id: avaliacoes.id,
          nota: avaliacoes.nota,
          comentario: avaliacoes.comentario,
          resposta: avaliacoes.resposta,
          criadoEm: avaliacoes.criadoEm,
          autor: usuarios.nome,
        })
        .from(avaliacoes)
        .innerJoin(alunos, eq(alunos.id, avaliacoes.autorAlunoId))
        .innerJoin(usuarios, eq(usuarios.id, alunos.usuarioId))
        .where(eq(avaliacoes.autoescolaId, ator.autoescolaId!))
        .orderBy(desc(avaliacoes.criadoEm)),
    );
  }

  async responderAvaliacao(ator: Ator, avaliacaoId: string, resposta: string) {
    await this.banco.comAtor(ator, async (tx) => {
      const r = await tx
        .update(avaliacoes)
        .set({ resposta, respondidaEm: new Date() })
        .where(and(eq(avaliacoes.id, avaliacaoId), eq(avaliacoes.autoescolaId, ator.autoescolaId!)))
        .returning();
      if (!r.length) throw naoEncontrado('avaliacao');
    });
    return this.avaliacoes(ator);
  }

  // ---------- Resumo (início do painel) ----------

  async resumo(ator: Ator) {
    return this.banco.comAtor(ator, async (tx) => {
      const [fila] = await tx
        .select({
          novos: sql<number>`count(*) filter (where ${pedidos.statusAtendimento} = 'novo')::int`,
          emContato: sql<number>`count(*) filter (where ${pedidos.statusAtendimento} = 'em_contato')::int`,
          atrasados: sql<number>`count(*) filter (where ${pedidos.statusAtendimento} in ('novo','em_contato') and ${pedidos.pagoEm} < now() - interval '48 hours')::int`,
        })
        .from(pedidos)
        .where(eq(pedidos.autoescolaId, ator.autoescolaId!));
      const [a] = await tx.select().from(autoescolas).where(eq(autoescolas.id, ator.autoescolaId!));
      const [m] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(matriculas)
        .where(eq(matriculas.status, 'ativa'));
      await this.banco.elevarParaSistema(tx);
      const conta = await contaDe(tx, { tipo: 'autoescola', autoescolaId: ator.autoescolaId! });
      const saldos = await saldosConta(tx, conta.id);
      return {
        novos: fila?.novos ?? 0,
        emContato: fila?.emContato ?? 0,
        atrasados: fila?.atrasados ?? 0,
        matriculasAtivas: m?.n ?? 0,
        notaMedia: a?.notaMedia ?? null,
        totalAvaliacoes: a?.totalAvaliacoes ?? 0,
        status: a?.status,
        ...saldos,
      };
    });
  }

  // ---------- Vitrine pública ----------

  async buscarPublico(f: {
    lat: number;
    lng: number;
    raioKm: number;
    texto?: string;
  }): Promise<AutoescolaCard[]> {
    const ponto = sql`ST_SetSRID(ST_MakePoint(${f.lng}, ${f.lat}), 4326)::geography`;
    const texto = f.texto?.trim() ? `%${f.texto.trim()}%` : null;
    return this.banco.comAtor({ tipo: 'anonimo' }, async (tx) => {
      const r = await tx.execute<{
        id: string;
        nome_fantasia: string;
        logo_arquivo_id: string | null;
        bairro: string;
        municipio: string;
        uf: string;
        nota_media: string | null;
        total_avaliacoes: number;
        distancia_km: string;
        lat: number;
        lng: number;
        a_partir_de: string | null;
        capa: string | null;
      }>(sql`
        select a.id, a.nome_fantasia, a.logo_arquivo_id, a.bairro, a.municipio, a.uf, a.nota_media, a.total_avaliacoes,
          round((ST_Distance(a.localizacao, ${ponto}) / 1000)::numeric, 1) as distancia_km,
          ST_Y(a.localizacao::geometry) as lat, ST_X(a.localizacao::geometry) as lng,
          (select min(p.preco_centavos) from pacotes p where p.autoescola_id = a.id and p.publicado and p.arquivado_em is null) as a_partir_de,
          (select f.arquivo_id from autoescola_fotos f where f.autoescola_id = a.id order by f.ordem limit 1) as capa
        from autoescolas a
        where a.status = 'aprovada'
          and ST_DWithin(a.localizacao, ${ponto}, ${f.raioKm * 1000})
          ${texto ? sql`and (a.nome_fantasia ilike ${texto} or a.bairro ilike ${texto} or a.municipio ilike ${texto})` : sql``}
        order by distancia_km
        limit 100`);
      return r.rows.map((l) => ({
        id: l.id,
        nomeFantasia: l.nome_fantasia,
        logoArquivoId: l.logo_arquivo_id,
        fotoCapaArquivoId: l.capa,
        bairro: l.bairro,
        municipio: l.municipio,
        uf: l.uf,
        distanciaKm: Number(l.distancia_km),
        notaMedia: l.nota_media === null ? null : Number(l.nota_media),
        totalAvaliacoes: l.total_avaliacoes,
        aPartirDeCentavos: l.a_partir_de === null ? null : Number(l.a_partir_de),
        localizacao: { lat: Number(l.lat), lng: Number(l.lng) },
      }));
    });
  }

  async perfilPublico(autoescolaId: string): Promise<PerfilAutoescolaPublico> {
    const base = await this.banco.comAtor({ tipo: 'anonimo' }, async (tx) => {
      const [a] = await tx
        .select()
        .from(autoescolas)
        .where(and(eq(autoescolas.id, autoescolaId), eq(autoescolas.status, 'aprovada')));
      if (!a) throw naoEncontrado('autoescola');
      const fotos = await tx
        .select()
        .from(autoescolaFotos)
        .where(eq(autoescolaFotos.autoescolaId, a.id))
        .orderBy(asc(autoescolaFotos.ordem));
      const horarios = await tx
        .select()
        .from(autoescolaHorarios)
        .where(eq(autoescolaHorarios.autoescolaId, a.id))
        .orderBy(asc(autoescolaHorarios.diaSemana));
      const avs = await tx
        .select({
          id: avaliacoes.id,
          nota: avaliacoes.nota,
          comentario: avaliacoes.comentario,
          resposta: avaliacoes.resposta,
          criadoEm: avaliacoes.criadoEm,
          nome: usuarios.nome,
        })
        .from(avaliacoes)
        .innerJoin(alunos, eq(alunos.id, avaliacoes.autorAlunoId))
        .innerJoin(usuarios, eq(usuarios.id, alunos.usuarioId))
        .where(and(eq(avaliacoes.autoescolaId, a.id), eq(avaliacoes.status, 'publicada')))
        .orderBy(desc(avaliacoes.criadoEm))
        .limit(30);
      return { a, fotos, horarios, avs };
    });
    const { a, fotos, horarios, avs } = base;
    const pacotes = await this.comercial.pacotesPublicos({ autoescolaId });
    return {
      id: a.id,
      nomeFantasia: a.nomeFantasia,
      logoArquivoId: a.logoArquivoId,
      fotoCapaArquivoId: fotos[0]?.arquivoId ?? null,
      bairro: a.bairro,
      municipio: a.municipio,
      uf: a.uf,
      notaMedia: a.notaMedia,
      totalAvaliacoes: a.totalAvaliacoes,
      aPartirDeCentavos: pacotes.length ? Math.min(...pacotes.map((p) => p.precoCentavos)) : null,
      localizacao: a.localizacao,
      descricao: a.descricao,
      endereco: `${a.logradouro}, ${a.numero}${a.complemento ? ` ${a.complemento}` : ''} — ${a.bairro}, ${a.municipio}/${a.uf}`,
      telefone: a.telefone,
      fotos: fotos.map((f) => ({ arquivoId: f.arquivoId, legenda: f.legenda })),
      horarios: horarios.map((h) => ({
        diaSemana: h.diaSemana,
        abre: formatarHora(h.abre),
        fecha: formatarHora(h.fecha),
      })),
      pacotes,
      avaliacoes: avs.map((v) => ({
        id: v.id,
        nota: v.nota,
        comentario: v.comentario,
        resposta: v.resposta,
        autorPrimeiroNome: v.nome.split(' ')[0] ?? 'Aluno',
        criadoEm: v.criadoEm.toISOString(),
      })),
      instrutores: await this.instrutoresPublicos(autoescolaId),
    };
  }

  /** Instrutores aprovados vinculados à autoescola (para o aluno agendar com o saldo do pacote). */
  async instrutoresPublicos(autoescolaId: string) {
    return this.banco.comAtor({ tipo: 'anonimo' }, (tx) =>
      tx
        .select({ id: instrutores.id, nome: usuarios.nome, fotoArquivoId: usuarios.fotoArquivoId })
        .from(instrutorVinculos)
        .innerJoin(instrutores, eq(instrutores.id, instrutorVinculos.instrutorId))
        .innerJoin(usuarios, eq(usuarios.id, instrutores.usuarioId))
        .where(
          and(
            eq(instrutorVinculos.autoescolaId, autoescolaId),
            eq(instrutorVinculos.status, 'ativo'),
            eq(instrutores.status, 'aprovado'),
          ),
        )
        .orderBy(usuarios.nome),
    );
  }
}
