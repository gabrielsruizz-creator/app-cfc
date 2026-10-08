import { Inject, Injectable } from '@nestjs/common';
import type { ContaRecebimentoEntrada, ResumoFinanceiro } from '@volante/contracts';
import { and, contasRecebimento, desc, eq, lancamentos, saques, sql, type Ator } from '@volante/db';
import { cifrar, contaDe, mascararChavePix, saldosConta, solicitarSaque, type Titular } from '@volante/dominio';
import { CONFIG, type Config } from '../../config';
import { BancoService } from '../../nucleo/banco.service';

function titularDe(ator: Ator): Titular {
  return ator.tipo === 'instrutor'
    ? { tipo: 'instrutor', instrutorId: ator.instrutorId! }
    : { tipo: 'autoescola', autoescolaId: ator.autoescolaId! };
}

/** Financeiro do instrutor ou da autoescola: saldos, ganhos, extrato, chave Pix e saques. */
@Injectable()
export class FinanceiroService {
  constructor(
    private readonly banco: BancoService,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  async resumo(ator: Ator): Promise<ResumoFinanceiro> {
    const titular = titularDe(ator);
    const conta = await this.banco.comAtor({ tipo: 'sistema' }, (tx) => contaDe(tx, titular));
    return this.banco.comAtor(ator, async (tx) => {
      const saldos = await saldosConta(tx, conta.id);
      const ganhos = (desde: string) => sql<string>`coalesce(sum(${lancamentos.valorCentavos}) filter (
          where ${lancamentos.tipo} = 'liberacao' and ${lancamentos.bucket} = 'disponivel' and ${lancamentos.criadoEm} >= ${sql.raw(desde)}), 0)`;
      const [g] = await tx
        .select({
          hoje: ganhos(`date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'`),
          semana: ganhos(`date_trunc('week', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'`),
          mes: ganhos(`date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'`),
        })
        .from(lancamentos)
        .where(eq(lancamentos.contaId, conta.id));
      const extrato = await tx
        .select()
        .from(lancamentos)
        .where(and(eq(lancamentos.contaId, conta.id), sql`${lancamentos.bucket} <> 'movimento'`))
        .orderBy(desc(lancamentos.criadoEm))
        .limit(100);
      const [cr] = await tx.select().from(contasRecebimento).where(eq(contasRecebimento.ativa, true));
      const ss = await tx.select().from(saques).orderBy(desc(saques.criadoEm)).limit(30);
      return {
        retidoCentavos: saldos.retido,
        disponivelCentavos: saldos.disponivel,
        ganhosHojeCentavos: Number(g?.hoje ?? 0),
        ganhosSemanaCentavos: Number(g?.semana ?? 0),
        ganhosMesCentavos: Number(g?.mes ?? 0),
        contaRecebimento: cr ? { tipoChave: cr.tipoChavePix, chaveMascarada: cr.chavePixMascarada, titularNome: cr.titularNome } : null,
        extrato: extrato.map((l) => ({
          id: l.id,
          tipo: l.tipo,
          bucket: l.bucket,
          valorCentavos: l.valorCentavos,
          descricao: l.descricao,
          criadoEm: l.criadoEm.toISOString(),
        })),
        saques: ss.map((s) => ({
          id: s.id,
          valorCentavos: s.valorCentavos,
          status: s.status,
          criadoEm: s.criadoEm.toISOString(),
          ultimoErro: s.ultimoErro,
        })),
      };
    });
  }

  async salvarContaRecebimento(ator: Ator, d: ContaRecebimentoEntrada) {
    const titular = titularDe(ator);
    await this.banco.comAtor(ator, async (tx) => {
      await tx.update(contasRecebimento).set({ ativa: false }).where(eq(contasRecebimento.ativa, true));
      await tx.insert(contasRecebimento).values({
        titularTipo: titular.tipo,
        instrutorId: titular.tipo === 'instrutor' ? titular.instrutorId : null,
        autoescolaId: titular.tipo === 'autoescola' ? titular.autoescolaId : null,
        tipoChavePix: d.tipoChave,
        chavePixCifrada: cifrar(d.chave),
        chavePixMascarada: mascararChavePix(d.chave, d.tipoChave),
        titularNome: d.titularNome,
        titularDocumento: d.titularDocumento.replace(/\D/g, ''),
      });
    });
    return this.resumo(ator);
  }

  async sacar(ator: Ator, valorCentavos: number) {
    await this.banco.comAtor(ator, async (tx) => {
      await this.banco.elevarParaSistema(tx);
      await solicitarSaque(tx, {
        titular: titularDe(ator),
        valorCentavos,
        gateway: this.config.PAGAMENTO_GATEWAY,
        solicitadoPor: ator.usuarioId ?? null,
      });
    });
    return this.resumo(ator);
  }
}
