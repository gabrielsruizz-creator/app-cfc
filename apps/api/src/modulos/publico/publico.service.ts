import { Inject, Injectable } from '@nestjs/common';
import {
  type AvaliacaoPublica,
  type BuscaInstrutores,
  type ConfiguracoesPublicas,
  type InstrutorCard,
  type PerfilInstrutorPublico,
} from '@volante/contracts';
import {
  alunos,
  and,
  avaliacoes,
  bloqueiosAgenda,
  desc,
  disponibilidadesSemanais,
  documentosLegais,
  eq,
  gte,
  habilidades,
  lerConfiguracoes,
  lt,
  sql,
  usuarios,
  veiculos,
} from '@volante/db';
import {
  calcularHorariosLivres,
  carregarInstrutorAtivo,
  horariosLivresInstrutor,
  naoEncontrado,
  proximasDatas,
} from '@volante/dominio';
import { CONFIG, type Config } from '../../config';
import { BancoService } from '../../nucleo/banco.service';

type LinhaBusca = {
  id: string;
  nome: string;
  foto_arquivo_id: string | null;
  genero: string | null;
  categorias: string[];
  preco_aula_centavos: string;
  duracao_aula_min: number;
  nota_media: string | null;
  total_avaliacoes: number;
  atua_desde: number | null;
  fornece_veiculo: boolean;
  distancia_km: string;
  lat_aprox: number;
  lng_aprox: number;
  cambios: string[];
  adaptado_pcd: boolean;
};

@Injectable()
export class PublicoService {
  constructor(
    private readonly banco: BancoService,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  async buscarInstrutores(f: BuscaInstrutores): Promise<InstrutorCard[]> {
    const ponto = sql`ST_SetSRID(ST_MakePoint(${f.lng}, ${f.lat}), 4326)::geography`;
    const condicoes = [
      sql`i.status = 'aprovado'`,
      sql`i.disponivel`,
      sql`u.status = 'ativo'`,
      sql`i.preco_aula_centavos is not null`,
      sql`ST_DWithin(i.base_localizacao, ${ponto}, i.raio_atendimento_km * 1000)`,
    ];
    if (f.categoria) condicoes.push(sql`${f.categoria} = any(i.categorias)`);
    if (f.precoMaxCentavos) condicoes.push(sql`i.preco_aula_centavos <= ${f.precoMaxCentavos}`);
    if (f.notaMin) condicoes.push(sql`coalesce(i.nota_media, 0) >= ${f.notaMin}`);
    if (f.genero) condicoes.push(sql`u.genero = ${f.genero}`);
    if (f.forneceVeiculo) condicoes.push(sql`i.fornece_veiculo`);

    const filtrosVeiculo = [];
    if (f.cambio) filtrosVeiculo.push(sql`bool_or(v.cambio = ${f.cambio})`);
    if (f.adaptadoPcd) filtrosVeiculo.push(sql`bool_or(v.adaptado_pcd)`);
    const having = filtrosVeiculo.length
      ? sql`having ${sql.join(filtrosVeiculo, sql` and `)}`
      : sql``;

    const ordem =
      f.ordenar === 'preco'
        ? sql`i.preco_aula_centavos asc, distancia_km asc`
        : f.ordenar === 'avaliacao'
          ? sql`i.nota_media desc nulls last, i.total_avaliacoes desc`
          : sql`distancia_km asc`;

    const r = await this.banco.db.execute<LinhaBusca>(sql`
      select i.id, u.nome, u.foto_arquivo_id, u.genero, i.categorias, i.preco_aula_centavos,
        i.duracao_aula_min, i.nota_media, i.total_avaliacoes, i.atua_desde, i.fornece_veiculo,
        round((ST_Distance(i.base_localizacao, ${ponto}) / 1000)::numeric, 1) as distancia_km,
        ST_Y(ST_SnapToGrid(i.base_localizacao::geometry, 0.005)) as lat_aprox,
        ST_X(ST_SnapToGrid(i.base_localizacao::geometry, 0.005)) as lng_aprox,
        coalesce(array_agg(distinct v.cambio) filter (where v.id is not null), '{}') as cambios,
        coalesce(bool_or(v.adaptado_pcd), false) as adaptado_pcd
      from instrutores i
      join usuarios u on u.id = i.usuario_id
      left join veiculos v on v.instrutor_id = i.id and v.ativo
      where ${sql.join(condicoes, sql` and `)}
      group by i.id, u.id
      ${having}
      order by ${ordem}
      limit ${f.limite}
    `);
    return r.rows.map((l) => this.card(l));
  }

  private card(l: LinhaBusca): InstrutorCard {
    return {
      id: l.id,
      nome: l.nome,
      fotoArquivoId: l.foto_arquivo_id,
      genero: (l.genero as InstrutorCard['genero']) ?? null,
      categorias: l.categorias as InstrutorCard['categorias'],
      precoAulaCentavos: Number(l.preco_aula_centavos),
      duracaoAulaMin: l.duracao_aula_min,
      notaMedia: l.nota_media === null ? null : Number(l.nota_media),
      totalAvaliacoes: l.total_avaliacoes,
      anosExperiencia: l.atua_desde ? new Date().getFullYear() - l.atua_desde : null,
      distanciaKm: Number(l.distancia_km),
      posicaoAproximada: { lat: Number(l.lat_aprox), lng: Number(l.lng_aprox) },
      forneceVeiculo: l.fornece_veiculo,
      cambios: l.cambios as InstrutorCard['cambios'],
      adaptadoPcd: l.adaptado_pcd,
      credencialVerificada: true,
    };
  }

  async perfilInstrutor(instrutorId: string): Promise<PerfilInstrutorPublico> {
    const { instrutor: i, nome } = await carregarInstrutorAtivo(this.banco.db, instrutorId);
    if (i.status !== 'aprovado') throw naoEncontrado('instrutor');
    const [u] = await this.banco.db.select().from(usuarios).where(eq(usuarios.id, i.usuarioId));
    const vs = await this.banco.db
      .select()
      .from(veiculos)
      .where(and(eq(veiculos.instrutorId, i.id), eq(veiculos.ativo, true)));
    const aproximada = await this.banco.db.execute<{ lat: number; lng: number }>(sql`
      select ST_Y(ST_SnapToGrid(base_localizacao::geometry, 0.005)) as lat,
             ST_X(ST_SnapToGrid(base_localizacao::geometry, 0.005)) as lng
      from instrutores where id = ${i.id}`);
    return {
      id: i.id,
      nome,
      fotoArquivoId: u?.fotoArquivoId ?? null,
      genero: (u?.genero as PerfilInstrutorPublico['genero']) ?? null,
      categorias: i.categorias as PerfilInstrutorPublico['categorias'],
      precoAulaCentavos: i.precoAulaCentavos ?? 0,
      duracaoAulaMin: i.duracaoAulaMin,
      notaMedia: i.notaMedia,
      totalAvaliacoes: i.totalAvaliacoes,
      anosExperiencia: i.atuaDesde ? new Date().getFullYear() - i.atuaDesde : null,
      posicaoAproximada: {
        lat: Number(aproximada.rows[0]?.lat ?? 0),
        lng: Number(aproximada.rows[0]?.lng ?? 0),
      },
      forneceVeiculo: i.forneceVeiculo,
      cambios: [...new Set(vs.map((v) => v.cambio))] as PerfilInstrutorPublico['cambios'],
      adaptadoPcd: vs.some((v) => v.adaptadoPcd),
      credencialVerificada: true,
      bio: i.bio,
      veiculos: vs.map((v) => ({
        id: v.id,
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
      avaliacoes: await this.avaliacoesInstrutor(i.id),
      totalAulas: i.totalAulas,
      aceitaVeiculoAluno: i.aceitaVeiculoAluno,
      raioAtendimentoKm: i.raioAtendimentoKm ?? 0,
    };
  }

  async avaliacoesInstrutor(instrutorId: string, limite = 20): Promise<AvaliacaoPublica[]> {
    const linhas = await this.banco.comAtor({ tipo: 'anonimo' }, (tx) =>
      tx
        .select({
          id: avaliacoes.id,
          nota: avaliacoes.nota,
          comentario: avaliacoes.comentario,
          nome: usuarios.nome,
          criadoEm: avaliacoes.criadoEm,
        })
        .from(avaliacoes)
        .innerJoin(alunos, eq(alunos.id, avaliacoes.autorAlunoId))
        .innerJoin(usuarios, eq(usuarios.id, alunos.usuarioId))
        .where(and(eq(avaliacoes.instrutorId, instrutorId), eq(avaliacoes.status, 'publicada')))
        .orderBy(desc(avaliacoes.criadoEm))
        .limit(limite),
    );
    return linhas.map((l) => ({
      id: l.id,
      nota: l.nota,
      comentario: l.comentario,
      autorPrimeiroNome: l.nome.split(' ')[0] ?? 'Aluno',
      criadoEm: l.criadoEm.toISOString(),
    }));
  }

  async horarios(instrutorId: string, data: string) {
    const { instrutor } = await carregarInstrutorAtivo(this.banco.db, instrutorId);
    if (instrutor.status !== 'aprovado') throw naoEncontrado('instrutor');
    const livres = await horariosLivresInstrutor(this.banco.db, instrutor, data);
    return livres.map((l) => ({ inicio: l.inicio.toISOString(), fim: l.fim.toISOString() }));
  }

  /** Quantidade de horários livres em cada um dos próximos dias (para o calendário). */
  async diasDisponiveis(instrutorId: string) {
    const db = this.banco.db;
    const { instrutor } = await carregarInstrutorAtivo(db, instrutorId);
    if (instrutor.status !== 'aprovado') throw naoEncontrado('instrutor');
    const cfg = await lerConfiguracoes(db);
    const agora = new Date();
    const datas = proximasDatas(agora, instrutor.fusoHorario, cfg['aula.dias_agenda_aberta']);
    const de = new Date(agora.getTime() - 86400_000);
    const ate = new Date(agora.getTime() + (datas.length + 2) * 86400_000);

    const faixas = await db
      .select()
      .from(disponibilidadesSemanais)
      .where(eq(disponibilidadesSemanais.instrutorId, instrutor.id));
    const ocupados = await db.execute<{ inicio: string; fim: string }>(
      sql`select inicio, fim from horarios_ocupados_instrutor(${instrutor.id}, ${de.toISOString()}, ${ate.toISOString()})`,
    );
    const bloqueios = await db
      .select()
      .from(bloqueiosAgenda)
      .where(
        and(
          eq(bloqueiosAgenda.instrutorId, instrutor.id),
          lt(bloqueiosAgenda.inicio, ate),
          gte(bloqueiosAgenda.fim, de),
        ),
      );

    const parametros = {
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
    };
    return {
      dias: datas.map((data) => ({
        data,
        quantidadeHorarios: calcularHorariosLivres({ ...parametros, data }).length,
      })),
    };
  }

  async configuracoes(): Promise<ConfiguracoesPublicas> {
    const cfg = await lerConfiguracoes(this.banco.db);
    return {
      duracaoPadraoMin: cfg['aula.duracao_padrao_min'],
      cancelamentoGratisAteHoras: cfg['cancelamento.gratis_ate_horas'],
      cancelamentoMultaBp: cfg['cancelamento.multa_bp'],
      diasAgendaAberta: cfg['aula.dias_agenda_aberta'],
      gatewayPagamento: this.config.PAGAMENTO_GATEWAY,
    };
  }

  async documentosLegais() {
    return this.banco.db
      .select({
        id: documentosLegais.id,
        tipo: documentosLegais.tipo,
        versao: documentosLegais.versao,
        conteudoMd: documentosLegais.conteudoMd,
        publicadoEm: documentosLegais.publicadoEm,
      })
      .from(documentosLegais)
      .where(eq(documentosLegais.vigente, true));
  }

  async habilidades() {
    return this.banco.db
      .select({
        id: habilidades.id,
        codigo: habilidades.codigo,
        nome: habilidades.nome,
        categorias: habilidades.categorias,
      })
      .from(habilidades)
      .where(eq(habilidades.ativa, true))
      .orderBy(habilidades.ordem);
  }
}
