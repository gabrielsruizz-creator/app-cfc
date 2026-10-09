import { Injectable } from '@nestjs/common';
import type { ConectarCfcPlus, IntegracaoCfcPlus, IntegracaoDisponivel } from '@volante/contracts';
import {
  and,
  auditar,
  desc,
  eq,
  integracoesAutoescola,
  operacoesIntegracao,
  pedidos,
  publicarEvento,
  sql,
  type Ator,
  type Tx,
} from '@volante/db';
import { cifrar, ErroDominio } from '@volante/dominio';
import { BancoService } from '../../nucleo/banco.service';

const NOME = 'CFC Plus';
const DESCRICAO =
  'Envie automaticamente as vendas e as aulas do app para o seu ERP CFC Plus: o aluno chega pronto para a matrícula e cada aula concluída entra na agenda, sem digitação.';

/** cfcp_ab12cd_****…wxyz — prefixo e final, nunca a chave inteira. */
export const mascararChave = (chave: string) => {
  const partes = chave.split('_');
  return `${partes.slice(0, 2).join('_')}_••••${chave.slice(-4)}`;
};

@Injectable()
export class IntegracoesService {
  constructor(private readonly banco: BancoService) {}

  private linha(tx: Tx, autoescolaId: string) {
    return tx
      .select()
      .from(integracoesAutoescola)
      .where(
        and(
          eq(integracoesAutoescola.autoescolaId, autoescolaId),
          eq(integracoesAutoescola.sistema, 'cfc_plus'),
        ),
      )
      .then((r) => r[0]);
  }

  async resumo(ator: Ator): Promise<IntegracaoDisponivel[]> {
    const l = await this.banco.comAtor(ator, (tx) => this.linha(tx, ator.autoescolaId!));
    return [
      {
        sistema: 'cfc_plus',
        nome: NOME,
        descricao: DESCRICAO,
        status: (l?.status ?? 'nao_conectada') as IntegracaoDisponivel['status'],
      },
    ];
  }

  async cfcPlus(ator: Ator): Promise<IntegracaoCfcPlus> {
    return this.banco.comAtor(ator, async (tx) => {
      const l = await this.linha(tx, ator.autoescolaId!);
      const operacoes = await tx
        .select({
          o: operacoesIntegracao,
          // aulas guardam o código do pedido no envio
          codigo: sql<
            string | null
          >`coalesce(${pedidos.codigo}, ${operacoesIntegracao.requisicao}->'aula'->>'pedidoCodigo')`,
        })
        .from(operacoesIntegracao)
        .leftJoin(pedidos, eq(pedidos.id, operacoesIntegracao.idInterno))
        .where(
          and(
            eq(operacoesIntegracao.autoescolaId, ator.autoescolaId!),
            eq(operacoesIntegracao.sistema, 'cfc_plus'),
          ),
        )
        .orderBy(desc(operacoesIntegracao.criadoEm))
        .limit(30);
      return {
        sistema: 'cfc_plus',
        nome: NOME,
        descricao: DESCRICAO,
        status: (l?.status ?? 'nao_conectada') as IntegracaoCfcPlus['status'],
        url: l?.url ?? null,
        chaveMascarada: l?.chaveMascarada ?? null,
        nomeNoErp: l?.nomeNoSistema ?? null,
        conectadaEm: l?.conectadaEm?.toISOString() ?? null,
        testadaEm: l?.testadaEm?.toISOString() ?? null,
        ultimoErro: l?.ultimoErro ?? null,
        operacoes: operacoes.map(({ o, codigo }) => ({
          id: o.id,
          operacao: o.operacao,
          pedidoCodigo: codigo,
          status: o.status,
          httpStatus: o.httpStatus,
          ultimoErro: o.ultimoErro,
          tentativas: o.tentativas,
          criadoEm: o.criadoEm.toISOString(),
        })),
      };
    });
  }

  /** Grava endereço e chave (cifrada) e pede ao worker para testar a conexão. */
  async conectar(ator: Ator, d: ConectarCfcPlus): Promise<IntegracaoCfcPlus> {
    await this.banco.comAtor(ator, async (tx) => {
      const autoescolaId = ator.autoescolaId!;
      const valores = {
        status: 'testando',
        url: d.url,
        chaveMascarada: mascararChave(d.chave),
        configuracaoCifrada: Buffer.from(cifrar(JSON.stringify({ url: d.url, chave: d.chave }))),
        ultimoErro: null,
        nomeNoSistema: null,
        conectadaEm: null,
        atualizadoEm: new Date(),
      };
      const existente = await this.linha(tx, autoescolaId);
      if (existente) {
        await tx
          .update(integracoesAutoescola)
          .set(valores)
          .where(eq(integracoesAutoescola.id, existente.id));
      } else {
        await tx
          .insert(integracoesAutoescola)
          .values({ autoescolaId, sistema: 'cfc_plus', ...valores });
      }
      await auditar(tx, {
        ator,
        entidadeTipo: 'integracao',
        entidadeId: existente?.id ?? autoescolaId,
        acao: 'integracao.cfc_plus.configurada',
        depois: { url: d.url, chave: valores.chaveMascarada },
      });
      await this.pedirTeste(tx, autoescolaId);
    });
    return this.cfcPlus(ator);
  }

  private pedirTeste(tx: Tx, autoescolaId: string) {
    return publicarEvento(tx, {
      tipo: 'integracao.testar',
      agregadoTipo: 'integracao',
      agregadoId: autoescolaId,
      autoescolaId,
      payload: { autoescolaId },
    });
  }

  async testar(ator: Ator): Promise<IntegracaoCfcPlus> {
    await this.banco.comAtor(ator, async (tx) => {
      const l = await this.linha(tx, ator.autoescolaId!);
      if (!l?.configuracaoCifrada || l.status === 'desativada')
        throw new ErroDominio('integracao_nao_configurada', 'Conecte o CFC Plus primeiro');
      await tx
        .update(integracoesAutoescola)
        .set({ status: 'testando', atualizadoEm: new Date() })
        .where(eq(integracoesAutoescola.id, l.id));
      await this.pedirTeste(tx, ator.autoescolaId!);
    });
    return this.cfcPlus(ator);
  }

  /** Reenvia ao CFC Plus o estado atual de todos os pedidos pagos (ex.: logo depois de conectar). */
  async sincronizar(ator: Ator): Promise<IntegracaoCfcPlus> {
    await this.banco.comAtor(ator, async (tx) => {
      const l = await this.linha(tx, ator.autoescolaId!);
      if (l?.status !== 'conectada')
        throw new ErroDominio(
          'integracao_nao_conectada',
          'A conexão com o CFC Plus precisa estar funcionando para enviar os pedidos',
        );
      await publicarEvento(tx, {
        tipo: 'integracao.sincronizar',
        agregadoTipo: 'integracao',
        agregadoId: l.id,
        autoescolaId: ator.autoescolaId!,
        payload: { autoescolaId: ator.autoescolaId! },
      });
    });
    return this.cfcPlus(ator);
  }

  async desconectar(ator: Ator): Promise<IntegracaoCfcPlus> {
    await this.banco.comAtor(ator, async (tx) => {
      const l = await this.linha(tx, ator.autoescolaId!);
      if (!l) return;
      await tx
        .update(integracoesAutoescola)
        .set({
          status: 'desativada',
          configuracaoCifrada: null,
          chaveMascarada: null,
          ultimoErro: null,
          atualizadoEm: new Date(),
        })
        .where(eq(integracoesAutoescola.id, l.id));
      await auditar(tx, {
        ator,
        entidadeTipo: 'integracao',
        entidadeId: l.id,
        acao: 'integracao.cfc_plus.desconectada',
      });
    });
    return this.cfcPlus(ator);
  }
}
