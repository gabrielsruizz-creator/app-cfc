import { Injectable } from '@nestjs/common';
import {
  TIPOS_DOCUMENTO_AUTOESCOLA,
  type CadastroAutoescola,
  type EnviarDocumentoAutoescola,
} from '@volante/contracts';
import {
  and,
  autoescolaDocumentos,
  autoescolaMembros,
  autoescolas,
  consentimentos,
  desc,
  documentosLegais,
  eq,
  ne,
  publicarEvento,
  type Ator,
} from '@volante/db';
import { ErroDominio, naoEncontrado } from '@volante/dominio';
import { uuidv7 } from 'uuidv7';
import type { Sessao } from '../../nucleo/auth/sessao';
import { BancoService } from '../../nucleo/banco.service';
import { ArquivosService } from '../arquivos/arquivos.service';

const NOMES: Record<string, string> = {
  contrato_social: 'Contrato social',
  cartao_cnpj: 'Cartão CNPJ',
  credenciamento_detran: 'Credenciamento no DETRAN',
  alvara: 'Alvará de funcionamento',
};

function slugificar(texto: string) {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60);
}

@Injectable()
export class AutoescolasService {
  constructor(
    private readonly banco: BancoService,
    private readonly arquivos: ArquivosService,
  ) {}

  async cadastrar(sessao: Sessao, d: CadastroAutoescola) {
    const id = uuidv7();
    const ator: Ator = { tipo: 'autoescola', usuarioId: sessao.usuarioId, autoescolaId: id };
    await this.banco.comAtor(ator, async (tx) => {
      await tx.insert(autoescolas).values({
        id,
        razaoSocial: d.razaoSocial,
        nomeFantasia: d.nomeFantasia,
        cnpj: d.cnpj,
        slug: `${slugificar(d.nomeFantasia)}-${id.slice(-6)}`,
        credenciamentoDetran: d.credenciamentoDetran,
        telefone: d.telefone,
        whatsapp: d.whatsapp,
        email: d.email,
        cep: d.cep.replace(/\D/g, ''),
        logradouro: d.logradouro,
        numero: d.numero,
        complemento: d.complemento ?? null,
        bairro: d.bairro,
        municipio: d.municipio,
        uf: d.uf,
        localizacao: d.localizacao,
      });
      await tx
        .insert(autoescolaMembros)
        .values({ autoescolaId: id, usuarioId: sessao.usuarioId, papel: 'dono' });
      const [termo] = await tx
        .select()
        .from(documentosLegais)
        .where(
          and(eq(documentosLegais.tipo, 'termo_autoescola'), eq(documentosLegais.vigente, true)),
        );
      await tx.insert(consentimentos).values({
        usuarioId: sessao.usuarioId,
        documentoLegalId: termo?.id ?? null,
        finalidade: 'termo_autoescola',
        aceito: true,
        ip: sessao.ip,
        userAgent: sessao.userAgent,
      });
    });
    return this.painel(ator);
  }

  async painel(ator: Ator) {
    return this.banco.comAtor(ator, async (tx) => {
      const [a] = await tx.select().from(autoescolas).where(eq(autoescolas.id, ator.autoescolaId!));
      if (!a) throw naoEncontrado('autoescola');
      const docs = await tx
        .select()
        .from(autoescolaDocumentos)
        .where(
          and(
            eq(autoescolaDocumentos.autoescolaId, a.id),
            ne(autoescolaDocumentos.status, 'substituido'),
          ),
        )
        .orderBy(desc(autoescolaDocumentos.criadoEm));
      const pendencias = TIPOS_DOCUMENTO_AUTOESCOLA.flatMap((tipo) => {
        const doc = docs.find((x) => x.tipo === tipo);
        if (!doc) return [`Envie: ${NOMES[tipo]}`];
        if (doc.status === 'reprovado')
          return [`Reenvie: ${NOMES[tipo]} (${doc.motivoReprovacao ?? 'reprovado'})`];
        return [];
      });
      return {
        autoescola: { ...a, localizacao: a.localizacao },
        documentos: docs.map((d) => ({
          id: d.id,
          tipo: d.tipo,
          arquivoId: d.arquivoId,
          numero: d.numero,
          validade: d.validade,
          status: d.status,
          motivoReprovacao: d.motivoReprovacao,
        })),
        pendencias,
      };
    });
  }

  async enviarDocumento(sessao: Sessao, ator: Ator, d: EnviarDocumentoAutoescola) {
    await this.arquivos.exigirDono(d.arquivoId, sessao.usuarioId);
    await this.banco.comAtor(ator, async (tx) => {
      await tx
        .update(autoescolaDocumentos)
        .set({ status: 'substituido' })
        .where(
          and(
            eq(autoescolaDocumentos.autoescolaId, ator.autoescolaId!),
            eq(autoescolaDocumentos.tipo, d.tipo),
            ne(autoescolaDocumentos.status, 'substituido'),
          ),
        );
      await tx.insert(autoescolaDocumentos).values({
        autoescolaId: ator.autoescolaId!,
        tipo: d.tipo,
        arquivoId: d.arquivoId,
        numero: d.numero ?? null,
        validade: d.validade ?? null,
      });
    });
    return this.painel(ator);
  }

  async enviarParaAnalise(ator: Ator) {
    const p = await this.painel(ator);
    if (!['rascunho', 'reprovada'].includes(p.autoescola.status)) {
      throw new ErroDominio(
        'status_invalido',
        'O cadastro já foi enviado para análise',
        'conflito',
      );
    }
    if (p.pendencias.length) {
      throw new ErroDominio(
        'cadastro_incompleto',
        'Envie todos os documentos antes de prosseguir',
        'validacao',
        {
          pendencias: p.pendencias,
        },
      );
    }
    await this.banco.comAtor(ator, async (tx) => {
      await tx
        .update(autoescolas)
        .set({ status: 'em_analise', enviadaAnaliseEm: new Date(), motivoStatus: null })
        .where(eq(autoescolas.id, ator.autoescolaId!));
      await publicarEvento(tx, {
        tipo: 'autoescola.enviada_analise',
        agregadoTipo: 'autoescola',
        agregadoId: ator.autoescolaId!,
        autoescolaId: ator.autoescolaId,
        payload: { autoescolaId: ator.autoescolaId! },
      });
    });
    return this.painel(ator);
  }

  /** Integrações disponíveis. O CFC Plus aparece como "em breve" até a Fase 4. */
}
