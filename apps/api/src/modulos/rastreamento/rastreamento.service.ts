import { Inject, Injectable } from '@nestjs/common';
import type {
  AcompanhamentoPublico,
  Compartilhamento,
  EnviarPosicao,
  RastreamentoAula,
} from '@volante/contracts';
import { and, aulaCompartilhamentos, aulas, desc, eq, gt, isNull, type Ator } from '@volante/db';
import {
  acompanharPorToken,
  criarCompartilhamento,
  iniciarACaminho,
  naoEncontrado,
  rastreamentoDaAula,
  registrarPosicao,
  revogarCompartilhamento,
} from '@volante/dominio';
import { CONFIG, urlPainel, type Config } from '../../config';
import { BancoService } from '../../nucleo/banco.service';

@Injectable()
export class RastreamentoService {
  constructor(
    private readonly banco: BancoService,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  // ---------- Instrutor ----------

  aCaminho(ator: Ator & { instrutorId: string }, aulaId: string, posicao?: EnviarPosicao) {
    return this.banco.comAtor(ator, async (tx) => {
      const aula = await iniciarACaminho(tx, {
        aulaId,
        instrutorId: ator.instrutorId,
        usuarioId: ator.usuarioId!,
        posicao: posicao ? { lat: posicao.lat, lng: posicao.lng } : null,
      });
      return { status: aula.status };
    });
  }

  posicao(ator: Ator & { instrutorId: string }, aulaId: string, p: EnviarPosicao) {
    return this.banco.comAtor(ator, (tx) =>
      registrarPosicao(tx, {
        aulaId,
        instrutorId: ator.instrutorId,
        posicao: { lat: p.lat, lng: p.lng },
        precisaoM: p.precisaoM,
      }),
    );
  }

  // ---------- Aluno ----------

  /** Mapa do aluno: a RLS garante que a aula é dele; os dados do instrutor vêm como sistema. */
  rastreamento(ator: Ator, aulaId: string): Promise<RastreamentoAula> {
    return this.banco.comAtor(ator, async (tx) => {
      const [a] = await tx.select({ id: aulas.id }).from(aulas).where(eq(aulas.id, aulaId));
      if (!a) throw naoEncontrado('aula');
      await this.banco.elevarParaSistema(tx);
      return rastreamentoDaAula(tx, aulaId);
    });
  }

  async compartilhar(
    ator: Ator & { alunoId: string },
    aulaId: string,
    contatoNome?: string,
  ): Promise<Compartilhamento> {
    const { compartilhamento, token } = await this.banco.comAtor(ator, (tx) =>
      criarCompartilhamento(tx, { aulaId, alunoId: ator.alunoId, contatoNome }),
    );
    return {
      id: compartilhamento.id,
      url: `${urlPainel(this.config)}/acompanhar/${token}`,
      contatoNome: compartilhamento.contatoNome,
      expiraEm: compartilhamento.expiraEm.toISOString(),
    };
  }

  /** Links ativos (sem a URL: o token só existe no momento da criação). */
  compartilhamentos(ator: Ator, aulaId: string) {
    return this.banco.comAtor(ator, (tx) =>
      tx
        .select({
          id: aulaCompartilhamentos.id,
          contatoNome: aulaCompartilhamentos.contatoNome,
          expiraEm: aulaCompartilhamentos.expiraEm,
          criadoEm: aulaCompartilhamentos.criadoEm,
        })
        .from(aulaCompartilhamentos)
        .where(
          and(
            eq(aulaCompartilhamentos.aulaId, aulaId),
            isNull(aulaCompartilhamentos.revogadoEm),
            gt(aulaCompartilhamentos.expiraEm, new Date()),
          ),
        )
        .orderBy(desc(aulaCompartilhamentos.criadoEm)),
    );
  }

  revogar(ator: Ator & { alunoId: string }, compartilhamentoId: string) {
    return this.banco.comAtor(ator, (tx) =>
      revogarCompartilhamento(tx, { compartilhamentoId, alunoId: ator.alunoId }),
    );
  }

  // ---------- Público (contato de confiança) ----------

  async publico(token: string): Promise<AcompanhamentoPublico> {
    const r = await this.banco.comAtor({ tipo: 'sistema' }, (tx) => acompanharPorToken(tx, token));
    if (!r) throw naoEncontrado('link');
    return r;
  }
}
