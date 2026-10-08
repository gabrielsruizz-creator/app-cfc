import { Injectable } from '@nestjs/common';
import {
  CONFIGURACOES_PADRAO,
  DESCRICOES_CONFIGURACAO,
  TIPOS_DOCUMENTO_INSTRUTOR,
  type AtualizarConfiguracoes,
  type NovaRegraComissao,
} from '@volante/contracts';
import {
  and,
  auditar,
  autoescolaDocumentos,
  autoescolas,
  cobrancas,
  configuracoes,
  count,
  desc,
  documentosLegais,
  eq,
  estornos,
  inArray,
  instrutorDocumentos,
  instrutores,
  isNull,
  lerConfiguracoes,
  ne,
  outboxEventos,
  publicarEvento,
  registrosAuditoria,
  regrasComissao,
  sql,
  usuarios,
  veiculos,
  type Ator,
  type Tx,
} from '@volante/db';
import { ErroDominio, naoEncontrado } from '@volante/dominio';
import { BancoService } from '../../nucleo/banco.service';

@Injectable()
export class AdminService {
  constructor(private readonly banco: BancoService) {}

  async resumo(ator: Ator) {
    return this.banco.comAtor(ator, async (tx) => {
      const [i] = await tx.select({ n: count() }).from(instrutores).where(eq(instrutores.status, 'em_analise'));
      const [a] = await tx.select({ n: count() }).from(autoescolas).where(eq(autoescolas.status, 'em_analise'));
      const [o] = await tx
        .select({ n: count() })
        .from(outboxEventos)
        .where(inArray(outboxEventos.status, ['falhou', 'morto']));
      const [c] = await tx
        .select({ n: count() })
        .from(cobrancas)
        .where(eq(cobrancas.status, 'pendente_configuracao'));
      return {
        instrutoresEmAnalise: i!.n,
        autoescolasEmAnalise: a!.n,
        eventosComFalha: o!.n,
        cobrancasPendentesConfiguracao: c!.n,
      };
    });
  }

  // ---------- Instrutores ----------

  async listarInstrutores(status?: string) {
    const linhas = await this.banco.db
      .select({
        id: instrutores.id,
        nome: usuarios.nome,
        email: usuarios.email,
        status: instrutores.status,
        categorias: instrutores.categorias,
        enviadoAnaliseEm: instrutores.enviadoAnaliseEm,
        criadoEm: instrutores.criadoEm,
      })
      .from(instrutores)
      .innerJoin(usuarios, eq(usuarios.id, instrutores.usuarioId))
      .where(status ? eq(instrutores.status, status) : undefined)
      .orderBy(desc(instrutores.enviadoAnaliseEm))
      .limit(200);
    return linhas;
  }

  async detalheInstrutor(instrutorId: string) {
    const [linha] = await this.banco.db
      .select({ instrutor: instrutores, usuario: usuarios })
      .from(instrutores)
      .innerJoin(usuarios, eq(usuarios.id, instrutores.usuarioId))
      .where(eq(instrutores.id, instrutorId));
    if (!linha) throw naoEncontrado('instrutor');
    const docs = await this.banco.db
      .select()
      .from(instrutorDocumentos)
      .where(and(eq(instrutorDocumentos.instrutorId, instrutorId), ne(instrutorDocumentos.status, 'substituido')))
      .orderBy(instrutorDocumentos.tipo);
    const vs = await this.banco.db.select().from(veiculos).where(and(eq(veiculos.instrutorId, instrutorId), eq(veiculos.ativo, true)));
    const { senhaHash: _s, ...usuario } = linha.usuario;
    return { instrutor: linha.instrutor, usuario, documentos: docs, veiculos: vs };
  }

  async analisarDocumentoInstrutor(ator: Ator, instrutorId: string, documentoId: string, aprovado: boolean, motivo?: string) {
    await this.banco.comAtor(ator, async (tx) => {
      const [doc] = await tx
        .select()
        .from(instrutorDocumentos)
        .where(and(eq(instrutorDocumentos.id, documentoId), eq(instrutorDocumentos.instrutorId, instrutorId)))
        .for('update');
      if (!doc) throw naoEncontrado('documento');
      const depois = { status: aprovado ? 'aprovado' : 'reprovado', motivoReprovacao: aprovado ? null : motivo };
      await tx
        .update(instrutorDocumentos)
        .set({ ...depois, analisadoPor: ator.usuarioId, analisadoEm: new Date() })
        .where(eq(instrutorDocumentos.id, documentoId));
      await auditar(tx, {
        ator,
        entidadeTipo: 'instrutor_documento',
        entidadeId: documentoId,
        acao: aprovado ? 'documento.aprovado' : 'documento.reprovado',
        antes: { status: doc.status },
        depois,
        motivo,
      });
    });
    return this.detalheInstrutor(instrutorId);
  }

  async decidirInstrutor(ator: Ator, instrutorId: string, decisao: 'aprovar' | 'reprovar' | 'bloquear', motivo?: string) {
    await this.banco.comAtor(ator, async (tx) => {
      const [i] = await tx.select().from(instrutores).where(eq(instrutores.id, instrutorId)).for('update');
      if (!i) throw naoEncontrado('instrutor');
      if (decisao === 'aprovar') {
        if (!['em_analise'].includes(i.status)) {
          throw new ErroDominio('status_invalido', 'Só é possível aprovar cadastros em análise', 'conflito');
        }
        const docs = await tx
          .select()
          .from(instrutorDocumentos)
          .where(and(eq(instrutorDocumentos.instrutorId, instrutorId), ne(instrutorDocumentos.status, 'substituido')));
        const faltando = TIPOS_DOCUMENTO_INSTRUTOR.filter((t) => !docs.some((d) => d.tipo === t && d.status === 'aprovado'));
        if (faltando.length) {
          throw new ErroDominio('documentos_pendentes', 'Aprove todos os documentos antes de aprovar o cadastro', 'regra_negocio', { faltando });
        }
      }
      const novoStatus = decisao === 'aprovar' ? 'aprovado' : decisao === 'reprovar' ? 'reprovado' : 'bloqueado';
      await tx
        .update(instrutores)
        .set({
          status: novoStatus,
          motivoStatus: motivo ?? null,
          ...(decisao === 'aprovar' ? { aprovadoEm: new Date(), aprovadoPor: ator.usuarioId } : { disponivel: false }),
        })
        .where(eq(instrutores.id, instrutorId));
      await auditar(tx, {
        ator,
        entidadeTipo: 'instrutor',
        entidadeId: instrutorId,
        acao: `instrutor.${novoStatus}`,
        antes: { status: i.status },
        depois: { status: novoStatus },
        motivo,
      });
      const tipo = decisao === 'aprovar' ? 'instrutor.aprovado' : decisao === 'reprovar' ? 'instrutor.reprovado' : 'instrutor.bloqueado';
      await publicarEvento(tx, {
        tipo,
        agregadoTipo: 'instrutor',
        agregadoId: instrutorId,
        payload: { instrutorId, usuarioId: i.usuarioId, motivo: motivo ?? '' } as never,
      });
    });
    return this.detalheInstrutor(instrutorId);
  }

  // ---------- Autoescolas ----------

  async listarAutoescolas(ator: Ator, status?: string) {
    return this.banco.comAtor(ator, (tx) =>
      tx
        .select({
          id: autoescolas.id,
          nomeFantasia: autoescolas.nomeFantasia,
          cnpj: autoescolas.cnpj,
          municipio: autoescolas.municipio,
          uf: autoescolas.uf,
          status: autoescolas.status,
          enviadaAnaliseEm: autoescolas.enviadaAnaliseEm,
        })
        .from(autoescolas)
        .where(status ? eq(autoescolas.status, status) : undefined)
        .orderBy(desc(autoescolas.enviadaAnaliseEm))
        .limit(200),
    );
  }

  async detalheAutoescola(ator: Ator, id: string) {
    return this.banco.comAtor(ator, async (tx) => {
      const [a] = await tx.select().from(autoescolas).where(eq(autoescolas.id, id));
      if (!a) throw naoEncontrado('autoescola');
      const docs = await tx
        .select()
        .from(autoescolaDocumentos)
        .where(and(eq(autoescolaDocumentos.autoescolaId, id), ne(autoescolaDocumentos.status, 'substituido')));
      return { autoescola: a, documentos: docs };
    });
  }

  async analisarDocumentoAutoescola(ator: Ator, autoescolaId: string, documentoId: string, aprovado: boolean, motivo?: string) {
    await this.banco.comAtor(ator, async (tx) => {
      const r = await tx
        .update(autoescolaDocumentos)
        .set({
          status: aprovado ? 'aprovado' : 'reprovado',
          motivoReprovacao: aprovado ? null : motivo,
          analisadoPor: ator.usuarioId,
          analisadoEm: new Date(),
        })
        .where(and(eq(autoescolaDocumentos.id, documentoId), eq(autoescolaDocumentos.autoescolaId, autoescolaId)))
        .returning();
      if (!r.length) throw naoEncontrado('documento');
      await auditar(tx, {
        ator,
        autoescolaId,
        entidadeTipo: 'autoescola_documento',
        entidadeId: documentoId,
        acao: aprovado ? 'documento.aprovado' : 'documento.reprovado',
        motivo,
      });
    });
    return this.detalheAutoescola(ator, autoescolaId);
  }

  async decidirAutoescola(ator: Ator, id: string, decisao: 'aprovar' | 'reprovar' | 'suspender', motivo?: string) {
    await this.banco.comAtor(ator, async (tx) => {
      const [a] = await tx.select().from(autoescolas).where(eq(autoescolas.id, id)).for('update');
      if (!a) throw naoEncontrado('autoescola');
      if (decisao === 'aprovar') {
        if (a.status !== 'em_analise') throw new ErroDominio('status_invalido', 'Só é possível aprovar cadastros em análise', 'conflito');
        const docs = await tx
          .select()
          .from(autoescolaDocumentos)
          .where(and(eq(autoescolaDocumentos.autoescolaId, id), ne(autoescolaDocumentos.status, 'substituido')));
        if (docs.length === 0 || docs.some((d) => d.status !== 'aprovado')) {
          throw new ErroDominio('documentos_pendentes', 'Aprove todos os documentos antes de aprovar o cadastro');
        }
      }
      const novo = decisao === 'aprovar' ? 'aprovada' : decisao === 'reprovar' ? 'reprovada' : 'suspensa';
      await tx
        .update(autoescolas)
        .set({
          status: novo,
          motivoStatus: motivo ?? null,
          ...(decisao === 'aprovar' ? { aprovadaEm: new Date(), aprovadaPor: ator.usuarioId } : {}),
        })
        .where(eq(autoescolas.id, id));
      await auditar(tx, {
        ator,
        autoescolaId: id,
        entidadeTipo: 'autoescola',
        entidadeId: id,
        acao: `autoescola.${novo}`,
        antes: { status: a.status },
        depois: { status: novo },
        motivo,
      });
      if (decisao !== 'suspender') {
        await publicarEvento(tx, {
          tipo: decisao === 'aprovar' ? 'autoescola.aprovada' : 'autoescola.reprovada',
          agregadoTipo: 'autoescola',
          agregadoId: id,
          autoescolaId: id,
          payload: { autoescolaId: id, motivo: motivo ?? '' } as never,
        });
      }
    });
    return this.detalheAutoescola(ator, id);
  }

  // ---------- Comissões e configurações ----------

  async comissoes() {
    return this.banco.db.select().from(regrasComissao).orderBy(desc(regrasComissao.vigenteDesde)).limit(200);
  }

  async novaComissao(ator: Ator, d: NovaRegraComissao) {
    await this.banco.comAtor(ator, async (tx) => {
      const filtroDono = d.instrutorId
        ? eq(regrasComissao.instrutorId, d.instrutorId)
        : d.autoescolaId
          ? eq(regrasComissao.autoescolaId, d.autoescolaId)
          : and(isNull(regrasComissao.instrutorId), isNull(regrasComissao.autoescolaId));
      const agora = new Date();
      const encerradas = await tx
        .update(regrasComissao)
        .set({ vigenteAte: agora })
        .where(
          and(
            eq(regrasComissao.vendedorTipo, d.vendedorTipo),
            eq(regrasComissao.produtoTipo, d.produtoTipo),
            isNull(regrasComissao.vigenteAte),
            filtroDono,
          ),
        )
        .returning();
      const [nova] = await tx
        .insert(regrasComissao)
        .values({
          vendedorTipo: d.vendedorTipo,
          produtoTipo: d.produtoTipo,
          instrutorId: d.instrutorId ?? null,
          autoescolaId: d.autoescolaId ?? null,
          percentualBp: d.percentualBp,
          valorFixoCentavos: d.valorFixoCentavos,
          vigenteDesde: agora,
          criadoPor: ator.usuarioId,
          motivo: d.motivo,
        })
        .returning();
      await auditar(tx, {
        ator,
        entidadeTipo: 'regra_comissao',
        entidadeId: nova!.id,
        acao: 'comissao.alterada',
        antes: encerradas.map((e) => ({ id: e.id, percentualBp: e.percentualBp, valorFixoCentavos: e.valorFixoCentavos })),
        depois: { percentualBp: nova!.percentualBp, valorFixoCentavos: nova!.valorFixoCentavos },
        motivo: d.motivo,
      });
    });
    return this.comissoes();
  }

  async configuracoes() {
    const valores = await lerConfiguracoes(this.banco.db);
    return Object.entries(valores).map(([chave, valor]) => ({
      chave,
      valor,
      padrao: CONFIGURACOES_PADRAO[chave as keyof typeof CONFIGURACOES_PADRAO],
      descricao: DESCRICOES_CONFIGURACAO[chave as keyof typeof DESCRICOES_CONFIGURACAO],
    }));
  }

  async atualizarConfiguracoes(ator: Ator, d: AtualizarConfiguracoes) {
    await this.banco.comAtor(ator, async (tx: Tx) => {
      const antes = await lerConfiguracoes(tx);
      for (const [chave, valor] of Object.entries(d)) {
        if (valor === undefined) continue;
        await tx
          .insert(configuracoes)
          .values({ chave, valor, atualizadoPor: ator.usuarioId })
          .onConflictDoUpdate({ target: configuracoes.chave, set: { valor, atualizadoPor: ator.usuarioId, atualizadoEm: new Date() } });
        await auditar(tx, {
          ator,
          entidadeTipo: 'configuracao',
          entidadeId: '00000000-0000-7000-8000-000000000000',
          acao: 'configuracao.alterada',
          antes: { [chave]: antes[chave as keyof typeof antes] },
          depois: { [chave]: valor },
        });
      }
    });
    return this.configuracoes();
  }

  async publicarDocumentoLegal(ator: Ator, d: { tipo: string; versao: string; conteudoMd: string }) {
    await this.banco.comAtor(ator, async (tx) => {
      await tx.update(documentosLegais).set({ vigente: false }).where(eq(documentosLegais.tipo, d.tipo));
      const [doc] = await tx.insert(documentosLegais).values({ ...d, vigente: true }).returning();
      await auditar(tx, { ator, entidadeTipo: 'documento_legal', entidadeId: doc!.id, acao: 'documento_legal.publicado', depois: { tipo: d.tipo, versao: d.versao } });
    });
  }

  // ---------- Auditoria e operações ----------

  async auditoria(f: { entidadeTipo?: string; entidadeId?: string; atorUsuarioId?: string; limite: number }) {
    const condicoes = [];
    if (f.entidadeTipo) condicoes.push(eq(registrosAuditoria.entidadeTipo, f.entidadeTipo));
    if (f.entidadeId) condicoes.push(eq(registrosAuditoria.entidadeId, f.entidadeId));
    if (f.atorUsuarioId) condicoes.push(eq(registrosAuditoria.atorUsuarioId, f.atorUsuarioId));
    const linhas = await this.banco.db
      .select()
      .from(registrosAuditoria)
      .where(condicoes.length ? and(...condicoes) : undefined)
      .orderBy(desc(registrosAuditoria.seq))
      .limit(f.limite);
    const integridade = await this.banco.db.execute<{ quebra: string | null }>(
      sql`select auditoria.verificar_cadeia() as quebra`,
    );
    return {
      cadeiaIntegra: integridade.rows[0]?.quebra === null,
      registros: linhas.map(({ hash, hashAnterior, ...r }) => ({
        ...r,
        hash: hash?.toString('hex') ?? null,
        hashAnterior: hashAnterior?.toString('hex') ?? null,
      })),
    };
  }

  async operacoes(ator: Ator) {
    return this.banco.comAtor(ator, async (tx) => {
      const eventos = await tx
        .select()
        .from(outboxEventos)
        .where(inArray(outboxEventos.status, ['falhou', 'morto']))
        .orderBy(desc(outboxEventos.ocorridoEm))
        .limit(100);
      const cobrancasPendentes = await tx
        .select()
        .from(cobrancas)
        .where(eq(cobrancas.status, 'pendente_configuracao'))
        .orderBy(desc(cobrancas.criadoEm))
        .limit(100);
      const estornosPendentes = await tx
        .select()
        .from(estornos)
        .where(inArray(estornos.status, ['pendente_configuracao', 'falhou']))
        .orderBy(desc(estornos.criadoEm))
        .limit(100);
      return { eventos, cobrancasPendentes, estornosPendentes };
    });
  }

  async reprocessarEvento(ator: Ator, eventoId: string) {
    await this.banco.comAtor(ator, async (tx) => {
      const r = await tx
        .update(outboxEventos)
        .set({ status: 'pendente', proximaTentativaEm: new Date(), ultimoErro: null })
        .where(and(eq(outboxEventos.id, eventoId), inArray(outboxEventos.status, ['falhou', 'morto'])))
        .returning();
      if (!r.length) throw naoEncontrado('evento');
      await auditar(tx, { ator, entidadeTipo: 'outbox_evento', entidadeId: eventoId, acao: 'evento.reprocessado' });
    });
  }
}
