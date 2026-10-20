import { Inject, Injectable } from '@nestjs/common';
import type {
  ContratoPedido,
  ParteContrato,
  PreviaContrato,
  TextoContrato,
} from '@volante/contracts';
import {
  and,
  asc,
  contratoAceites,
  contratoEnvios,
  contratos,
  desc,
  eq,
  gt,
  pedidos,
  publicarEvento,
  type Ator,
} from '@volante/db';
import {
  comprarPacote,
  ErroDominio,
  naoEncontrado,
  previaDoContrato,
  solicitarAulaAvulsa,
} from '@volante/dominio';
import { randomUUID } from 'node:crypto';
import { CONFIG, type Config } from '../../config';
import { BancoService } from '../../nucleo/banco.service';

/** 123.456.789-09 → ***.456.789-**; CNPJ fica inteiro (é público). */
const mascararDocumento = (d: string | null) =>
  d && /^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(d) ? `***.${d.slice(4, 11)}-**` : d;
/** joana@gmail.com → jo***@gmail.com */
export const mascararEmail = (e: string) => {
  const [u, dominio] = e.split('@');
  return dominio ? `${u!.slice(0, 2)}***@${dominio}` : e;
};
/** 189.45.10.200 → 189.45.x.x */
const mascararIp = (ip: string | null) =>
  ip
    ? ip.includes('.')
      ? ip.split('.').slice(0, 2).join('.') + '.x.x'
      : ip.split(':').slice(0, 3).join(':') + ':…'
    : null;
const aparelho = (ua: string | null) =>
  !ua
    ? null
    : /iphone|ipad|ios/i.test(ua)
      ? 'iPhone/iPad'
      : /android/i.test(ua)
        ? 'Android'
        : /okhttp|expo/i.test(ua)
          ? 'App'
          : 'Navegador';

const INTERVALO_REENVIO_MS = 5 * 60_000;

@Injectable()
export class ContratosService {
  constructor(
    private readonly banco: BancoService,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  /** Texto exato que será gravado se o aluno comprar agora com estes dados. */
  previa(ator: Ator & { alunoId: string }, d: PreviaContrato): Promise<TextoContrato> {
    const base = {
      alunoId: ator.alunoId,
      gateway: this.config.PAGAMENTO_GATEWAY,
      chaveIdempotencia: `previa:${randomUUID()}`,
      cupom: d.cupom || null,
    };
    return this.banco.comAtor(ator, (tx) =>
      previaDoContrato(tx, async (sp) =>
        d.tipo === 'pacote'
          ? {
              pedidoId: (
                await comprarPacote(sp, {
                  ...base,
                  pacoteId: d.pacoteId,
                  metodo: d.metodo,
                  parcelas: d.parcelas,
                })
              ).pedido.id,
            }
          : {
              pedidoId: (
                await solicitarAulaAvulsa(sp, {
                  ...base,
                  instrutorId: d.instrutorId,
                  inicio: new Date(d.inicio),
                  categoria: d.categoria,
                  pontoEncontro: d.pontoEncontro,
                  pontoEncontroEndereco: d.pontoEncontroEndereco,
                  pontoEncontroReferencia: d.pontoEncontroReferencia,
                })
              ).pedido.id,
            },
      ),
    );
  }

  /** Contrato do pedido (a RLS garante que só as partes e a plataforma o veem). */
  obter(ator: Ator, pedidoId: string): Promise<ContratoPedido> {
    return this.banco.comAtor(ator, async (tx) => {
      const [linha] = await tx
        .select({ c: contratos, codigo: pedidos.codigo })
        .from(contratos)
        .innerJoin(pedidos, eq(pedidos.id, contratos.pedidoId))
        .where(eq(contratos.pedidoId, pedidoId));
      if (!linha) throw naoEncontrado('contrato');
      const aceites = await tx
        .select()
        .from(contratoAceites)
        .where(eq(contratoAceites.contratoId, linha.c.id))
        .orderBy(asc(contratoAceites.aceitoEm));
      const envios = await tx
        .select()
        .from(contratoEnvios)
        .where(eq(contratoEnvios.contratoId, linha.c.id))
        .orderBy(desc(contratoEnvios.criadoEm))
        .limit(20);
      return {
        id: linha.c.id,
        pedidoId,
        pedidoCodigo: linha.codigo,
        versao: linha.c.versao,
        corpoMd: linha.c.corpoMd,
        hash: linha.c.hashCorpo,
        criadoEm: linha.c.criadoEm.toISOString(),
        aceites: aceites.map((a) => ({
          parte: a.parte as ParteContrato,
          forma: a.forma as ContratoPedido['aceites'][number]['forma'],
          nome: a.nome,
          documento: mascararDocumento(a.documento),
          aceitoEm: a.aceitoEm.toISOString(),
          ip: mascararIp(a.ip),
          dispositivo: aparelho(a.userAgent),
          detalhe: a.detalhe,
        })),
        envios: envios.map((e) => ({
          parte: e.parte as ParteContrato,
          para: mascararEmail(e.para),
          status: e.status as ContratoPedido['envios'][number]['status'],
          erro: e.erro,
          criadoEm: e.criadoEm.toISOString(),
        })),
      };
    });
  }

  /** Pede ao worker uma nova cópia por e-mail para quem pediu. */
  reenviar(ator: Ator, pedidoId: string, parte: ParteContrato) {
    return this.banco.comAtor(ator, async (tx) => {
      const [c] = await tx.select().from(contratos).where(eq(contratos.pedidoId, pedidoId));
      if (!c) throw naoEncontrado('contrato');
      const [recente] = await tx
        .select({ id: contratoEnvios.id })
        .from(contratoEnvios)
        .where(
          and(
            eq(contratoEnvios.contratoId, c.id),
            eq(contratoEnvios.parte, parte),
            gt(contratoEnvios.criadoEm, new Date(Date.now() - INTERVALO_REENVIO_MS)),
          ),
        )
        .limit(1);
      if (recente) {
        throw new ErroDominio(
          'reenvio_recente',
          'Uma cópia acabou de ser enviada. Confira sua caixa de entrada (e o spam) ou tente em alguns minutos.',
          'conflito',
        );
      }
      await publicarEvento(tx, {
        tipo: 'contrato.reenviar',
        agregadoTipo: 'contrato',
        agregadoId: c.id,
        autoescolaId: c.autoescolaId,
        payload: { contratoId: c.id, parte },
      });
      return { ok: true };
    });
  }
}
