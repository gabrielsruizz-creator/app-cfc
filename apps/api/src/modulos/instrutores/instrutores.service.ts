import { Injectable } from '@nestjs/common';
import {
  DOCUMENTOS_COM_VALIDADE,
  TIPOS_DOCUMENTO_INSTRUTOR,
  type Atendimento,
  type CriarBloqueio,
  type EnviarDocumentoInstrutor,
  type JornadaSemanal,
  type PerfilInstrutorProprio,
  type PerfilProfissional,
  type VeiculoEntrada,
} from '@volante/contracts';
import {
  and,
  auditar,
  bloqueiosAgenda,
  consentimentos,
  desc,
  disponibilidadesSemanais,
  documentosLegais,
  eq,
  gte,
  instrutorDocumentos,
  instrutores,
  ne,
  publicarEvento,
  usuarios,
  veiculos,
  type Ator,
} from '@volante/db';
import { ErroDominio, naoEncontrado } from '@volante/dominio';
import type { Sessao } from '../../nucleo/auth/sessao';
import { BancoService } from '../../nucleo/banco.service';
import { ArquivosService } from '../arquivos/arquivos.service';

const NOMES_DOCUMENTO: Record<string, string> = {
  cnh: 'CNH',
  credencial_detran: 'Credencial de instrutor do DETRAN',
  documento_veiculo: 'Documento do veículo (CRLV)',
  comprovante_residencia: 'Comprovante de residência',
  selfie: 'Selfie',
};

@Injectable()
export class InstrutoresService {
  constructor(
    private readonly banco: BancoService,
    private readonly arquivos: ArquivosService,
  ) {}

  private async carregar(instrutorId: string) {
    const [i] = await this.banco.db
      .select()
      .from(instrutores)
      .where(eq(instrutores.id, instrutorId));
    if (!i) throw naoEncontrado('instrutor');
    return i;
  }

  async criarPerfil(sessao: Sessao, dados: PerfilProfissional) {
    if (sessao.instrutorId) {
      throw new ErroDominio('perfil_existente', 'Você já tem um cadastro de instrutor', 'conflito');
    }
    const [u] = await this.banco.db
      .select()
      .from(usuarios)
      .where(eq(usuarios.id, sessao.usuarioId));
    if (!u?.cpf)
      throw new ErroDominio(
        'cpf_obrigatorio',
        'Informe seu CPF antes de se cadastrar como instrutor',
      );
    if (dados.fotoArquivoId) await this.definirFoto(sessao.usuarioId, dados.fotoArquivoId);
    const [i] = await this.banco.db
      .insert(instrutores)
      .values({
        usuarioId: sessao.usuarioId,
        bio: dados.bio,
        atuaDesde: dados.atuaDesde,
        categorias: dados.categorias,
      })
      .returning({ id: instrutores.id });
    return this.perfil(i!.id);
  }

  private async definirFoto(usuarioId: string, arquivoId: string) {
    await this.arquivos.exigirDono(arquivoId, usuarioId);
    await this.banco.db
      .update(usuarios)
      .set({ fotoArquivoId: arquivoId })
      .where(eq(usuarios.id, usuarioId));
  }

  async atualizarPerfil(sessao: Sessao, instrutorId: string, dados: PerfilProfissional) {
    if (dados.fotoArquivoId) await this.definirFoto(sessao.usuarioId, dados.fotoArquivoId);
    await this.banco.db
      .update(instrutores)
      .set({ bio: dados.bio, atuaDesde: dados.atuaDesde, categorias: dados.categorias })
      .where(eq(instrutores.id, instrutorId));
    return this.perfil(instrutorId);
  }

  async atualizarAtendimento(ator: Ator, instrutorId: string, dados: Atendimento) {
    await this.banco.comAtor(ator, async (tx) => {
      const [antes] = await tx
        .select()
        .from(instrutores)
        .where(eq(instrutores.id, instrutorId))
        .for('update');
      await tx
        .update(instrutores)
        .set({
          precoAulaCentavos: dados.precoAulaCentavos,
          duracaoAulaMin: dados.duracaoAulaMin,
          raioAtendimentoKm: dados.raioAtendimentoKm,
          baseLocalizacao: dados.baseLocalizacao,
          forneceVeiculo: dados.forneceVeiculo,
          aceitaVeiculoAluno: dados.aceitaVeiculoAluno,
          antecedenciaMinimaH: dados.antecedenciaMinimaH ?? null,
          fusoHorario: dados.fusoHorario,
        })
        .where(eq(instrutores.id, instrutorId));
      if (antes && antes.precoAulaCentavos !== dados.precoAulaCentavos) {
        await auditar(tx, {
          ator,
          entidadeTipo: 'instrutor',
          entidadeId: instrutorId,
          acao: 'preco.alterado',
          antes: { precoAulaCentavos: antes.precoAulaCentavos },
          depois: { precoAulaCentavos: dados.precoAulaCentavos },
        });
      }
    });
    return this.perfil(instrutorId);
  }

  async enviarDocumento(sessao: Sessao, instrutorId: string, dados: EnviarDocumentoInstrutor) {
    await this.arquivos.exigirDono(dados.arquivoId, sessao.usuarioId);
    if (
      dados.validade &&
      DOCUMENTOS_COM_VALIDADE.includes(dados.tipo) &&
      new Date(dados.validade) < new Date()
    ) {
      throw new ErroDominio(
        'documento_vencido',
        'Este documento está vencido. Envie um documento válido.',
        'validacao',
      );
    }
    await this.banco.db.transaction(async (tx) => {
      await tx
        .update(instrutorDocumentos)
        .set({ status: 'substituido' })
        .where(
          and(
            eq(instrutorDocumentos.instrutorId, instrutorId),
            eq(instrutorDocumentos.tipo, dados.tipo),
            ne(instrutorDocumentos.status, 'substituido'),
          ),
        );
      await tx.insert(instrutorDocumentos).values({
        instrutorId,
        tipo: dados.tipo,
        arquivoId: dados.arquivoId,
        numero: dados.numero ?? null,
        ufEmissor: dados.ufEmissor ?? null,
        validade: dados.validade ?? null,
      });
      const [i] = await tx.select().from(instrutores).where(eq(instrutores.id, instrutorId));
      // Instrutor suspenso por documento vencido volta para análise ao enviar o novo.
      if (i?.status === 'suspenso_documento') {
        await tx
          .update(instrutores)
          .set({ status: 'em_analise', enviadoAnaliseEm: new Date(), disponivel: false })
          .where(eq(instrutores.id, instrutorId));
        await publicarEvento(tx, {
          tipo: 'instrutor.enviado_analise',
          agregadoTipo: 'instrutor',
          agregadoId: instrutorId,
          payload: { instrutorId },
        });
      }
    });
    return this.perfil(instrutorId);
  }

  async salvarVeiculo(instrutorId: string, dados: VeiculoEntrada, veiculoId?: string) {
    const valores = {
      placa: dados.placa.replace('-', ''),
      marca: dados.marca,
      modelo: dados.modelo,
      ano: dados.ano,
      cor: dados.cor ?? null,
      cambio: dados.cambio,
      adaptadoPcd: dados.adaptadoPcd,
      adaptacoes: dados.adaptacoes ?? null,
      categoria: dados.categoria,
      fotoArquivoId: dados.fotoArquivoId ?? null,
    };
    if (veiculoId) {
      const r = await this.banco.db
        .update(veiculos)
        .set(valores)
        .where(and(eq(veiculos.id, veiculoId), eq(veiculos.instrutorId, instrutorId)))
        .returning();
      if (!r.length) throw naoEncontrado('veiculo');
    } else {
      await this.banco.db.insert(veiculos).values({ ...valores, instrutorId });
    }
    return this.perfil(instrutorId);
  }

  async removerVeiculo(instrutorId: string, veiculoId: string) {
    await this.banco.db
      .update(veiculos)
      .set({ ativo: false })
      .where(and(eq(veiculos.id, veiculoId), eq(veiculos.instrutorId, instrutorId)));
    return this.perfil(instrutorId);
  }

  async jornada(instrutorId: string) {
    const faixas = await this.banco.db
      .select()
      .from(disponibilidadesSemanais)
      .where(eq(disponibilidadesSemanais.instrutorId, instrutorId));
    return {
      faixas: faixas
        .map((f) => ({
          diaSemana: f.diaSemana,
          horaInicio: f.horaInicio.slice(0, 5),
          horaFim: f.horaFim.slice(0, 5),
        }))
        .sort((a, b) => a.diaSemana - b.diaSemana || a.horaInicio.localeCompare(b.horaInicio)),
    };
  }

  async salvarJornada(instrutorId: string, dados: JornadaSemanal) {
    for (const dia of new Set(dados.faixas.map((f) => f.diaSemana))) {
      const doDia = dados.faixas
        .filter((f) => f.diaSemana === dia)
        .sort((a, b) => a.horaInicio.localeCompare(b.horaInicio));
      for (let i = 1; i < doDia.length; i++) {
        if (doDia[i]!.horaInicio < doDia[i - 1]!.horaFim) {
          throw new ErroDominio(
            'faixas_sobrepostas',
            'Há faixas de horário sobrepostas no mesmo dia',
            'validacao',
          );
        }
      }
    }
    await this.banco.db.transaction(async (tx) => {
      await tx
        .delete(disponibilidadesSemanais)
        .where(eq(disponibilidadesSemanais.instrutorId, instrutorId));
      if (dados.faixas.length) {
        await tx
          .insert(disponibilidadesSemanais)
          .values(dados.faixas.map((f) => ({ ...f, instrutorId })));
      }
    });
    return this.jornada(instrutorId);
  }

  async bloqueios(instrutorId: string) {
    const linhas = await this.banco.db
      .select()
      .from(bloqueiosAgenda)
      .where(
        and(eq(bloqueiosAgenda.instrutorId, instrutorId), gte(bloqueiosAgenda.fim, new Date())),
      )
      .orderBy(bloqueiosAgenda.inicio);
    return linhas.map((b) => ({
      id: b.id,
      inicio: b.inicio.toISOString(),
      fim: b.fim.toISOString(),
      tipo: b.tipo as 'bloqueio' | 'ferias',
      motivo: b.motivo,
    }));
  }

  async criarBloqueio(instrutorId: string, dados: CriarBloqueio) {
    await this.banco.db.insert(bloqueiosAgenda).values({
      instrutorId,
      inicio: new Date(dados.inicio),
      fim: new Date(dados.fim),
      tipo: dados.tipo,
      motivo: dados.motivo ?? null,
    });
    return this.bloqueios(instrutorId);
  }

  async removerBloqueio(instrutorId: string, bloqueioId: string) {
    await this.banco.db
      .delete(bloqueiosAgenda)
      .where(and(eq(bloqueiosAgenda.id, bloqueioId), eq(bloqueiosAgenda.instrutorId, instrutorId)));
    return this.bloqueios(instrutorId);
  }

  async alterarDisponibilidade(instrutorId: string, disponivel: boolean) {
    const i = await this.carregar(instrutorId);
    if (disponivel && i.status !== 'aprovado') {
      throw new ErroDominio(
        'instrutor_nao_aprovado',
        'Você poderá ficar disponível assim que seu cadastro for aprovado',
      );
    }
    await this.banco.db
      .update(instrutores)
      .set({ disponivel })
      .where(eq(instrutores.id, instrutorId));
    return this.perfil(instrutorId);
  }

  async enviarParaAnalise(sessao: Sessao, instrutorId: string) {
    const perfil = await this.perfil(instrutorId);
    if (!['rascunho', 'reprovado'].includes(perfil.status)) {
      throw new ErroDominio(
        'status_invalido',
        'Seu cadastro já foi enviado para análise',
        'conflito',
      );
    }
    if (perfil.pendenciasCadastro.length) {
      throw new ErroDominio(
        'cadastro_incompleto',
        'Complete o cadastro antes de enviar',
        'validacao',
        {
          pendencias: perfil.pendenciasCadastro,
        },
      );
    }
    await this.banco.db.transaction(async (tx) => {
      const [termo] = await tx
        .select()
        .from(documentosLegais)
        .where(
          and(eq(documentosLegais.tipo, 'termo_instrutor'), eq(documentosLegais.vigente, true)),
        );
      await tx.insert(consentimentos).values({
        usuarioId: sessao.usuarioId,
        documentoLegalId: termo?.id ?? null,
        finalidade: 'termo_instrutor',
        aceito: true,
        ip: sessao.ip,
        userAgent: sessao.userAgent,
      });
      await tx
        .update(instrutores)
        .set({ status: 'em_analise', enviadoAnaliseEm: new Date(), motivoStatus: null })
        .where(eq(instrutores.id, instrutorId));
      await publicarEvento(tx, {
        tipo: 'instrutor.enviado_analise',
        agregadoTipo: 'instrutor',
        agregadoId: instrutorId,
        payload: { instrutorId },
      });
    });
    return this.perfil(instrutorId);
  }

  async perfil(instrutorId: string): Promise<PerfilInstrutorProprio> {
    const i = await this.carregar(instrutorId);
    const [u] = await this.banco.db.select().from(usuarios).where(eq(usuarios.id, i.usuarioId));
    const docs = await this.banco.db
      .select()
      .from(instrutorDocumentos)
      .where(
        and(
          eq(instrutorDocumentos.instrutorId, instrutorId),
          ne(instrutorDocumentos.status, 'substituido'),
        ),
      )
      .orderBy(desc(instrutorDocumentos.criadoEm));
    const vs = await this.banco.db
      .select()
      .from(veiculos)
      .where(and(eq(veiculos.instrutorId, instrutorId), eq(veiculos.ativo, true)));

    const pendencias: string[] = [];
    if (!u?.fotoArquivoId) pendencias.push('Adicione uma foto de perfil');
    if (!i.bio) pendencias.push('Escreva sua apresentação');
    if (!i.categorias.length) pendencias.push('Informe as categorias que você ensina');
    if (!i.precoAulaCentavos || !i.raioAtendimentoKm || !i.baseLocalizacao) {
      pendencias.push('Defina preço, região e raio de atendimento');
    }
    for (const tipo of TIPOS_DOCUMENTO_INSTRUTOR) {
      const d = docs.find((x) => x.tipo === tipo);
      if (!d) pendencias.push(`Envie: ${NOMES_DOCUMENTO[tipo]}`);
      else if (d.status === 'reprovado')
        pendencias.push(`Reenvie: ${NOMES_DOCUMENTO[tipo]} (${d.motivoReprovacao ?? 'reprovado'})`);
    }
    if (i.forneceVeiculo && !vs.length) pendencias.push('Cadastre o veículo usado nas aulas');

    return {
      id: i.id,
      status: i.status as PerfilInstrutorProprio['status'],
      motivoStatus: i.motivoStatus,
      bio: i.bio,
      atuaDesde: i.atuaDesde,
      categorias: i.categorias as PerfilInstrutorProprio['categorias'],
      precoAulaCentavos: i.precoAulaCentavos,
      duracaoAulaMin: i.duracaoAulaMin,
      raioAtendimentoKm: i.raioAtendimentoKm,
      baseLocalizacao: i.baseLocalizacao,
      forneceVeiculo: i.forneceVeiculo,
      aceitaVeiculoAluno: i.aceitaVeiculoAluno,
      disponivel: i.disponivel,
      antecedenciaMinimaH: i.antecedenciaMinimaH,
      fusoHorario: i.fusoHorario,
      notaMedia: i.notaMedia,
      totalAvaliacoes: i.totalAvaliacoes,
      totalAulas: i.totalAulas,
      documentos: docs.map((d) => ({
        id: d.id,
        tipo: d.tipo as never,
        arquivoId: d.arquivoId,
        numero: d.numero,
        validade: d.validade,
        status: d.status,
        motivoReprovacao: d.motivoReprovacao,
        criadoEm: d.criadoEm.toISOString(),
      })),
      veiculos: vs.map((v) => ({
        id: v.id,
        placa: v.placa,
        marca: v.marca,
        modelo: v.modelo,
        ano: v.ano,
        cor: v.cor ?? undefined,
        cambio: v.cambio as never,
        adaptadoPcd: v.adaptadoPcd,
        adaptacoes: v.adaptacoes ?? undefined,
        categoria: v.categoria as never,
        fotoArquivoId: v.fotoArquivoId ?? undefined,
        ativo: v.ativo,
      })),
      pendenciasCadastro: pendencias,
    };
  }
}
