import { Injectable } from '@nestjs/common';
import type { Cupom, CupomEntrada, CupomParceiroEntrada, CupomValidado } from '@volante/contracts';
import {
  auditar,
  autoescolas,
  comoSistema,
  cupons,
  desc,
  eq,
  instrutores,
  pacotes,
  sql,
  usuarios,
  type Ator,
  type Tx,
} from '@volante/db';
import { codigoErroPostgres, ErroDominio, naoEncontrado, resolverCupom } from '@volante/dominio';
import { BancoService } from '../../nucleo/banco.service';

type LinhaCupom = typeof cupons.$inferSelect;

function paraCupom(
  c: LinhaCupom,
  extra: { usos: number; descontoTotal: number; vendedorNome: string | null },
): Cupom {
  return {
    id: c.id,
    codigo: c.codigo,
    campanha: c.campanha,
    descricao: c.descricao,
    tipo: c.tipo as Cupom['tipo'],
    valor: c.valor,
    descontoMaximoCentavos: c.descontoMaximoCentavos,
    valorMinimoCentavos: c.valorMinimoCentavos,
    produtoTipo: c.produtoTipo,
    instrutorId: c.instrutorId,
    autoescolaId: c.autoescolaId,
    vendedorNome: extra.vendedorNome,
    bancadoPor: c.bancadoPor as Cupom['bancadoPor'],
    limiteTotal: c.limiteTotal,
    limitePorAluno: c.limitePorAluno,
    apenasPrimeiraCompra: c.apenasPrimeiraCompra,
    inicioEm: c.inicioEm.toISOString(),
    fimEm: c.fimEm?.toISOString() ?? null,
    ativo: c.ativo,
    usos: extra.usos,
    descontoTotalCentavos: extra.descontoTotal,
  };
}

/** Converte a entrada do formulário em colunas da tabela. */
function colunas(d: CupomEntrada | CupomParceiroEntrada) {
  return {
    codigo: d.codigo,
    descricao: d.descricao ?? null,
    tipo: d.tipo,
    valor: d.valor,
    descontoMaximoCentavos: d.descontoMaximoCentavos ?? null,
    valorMinimoCentavos: d.valorMinimoCentavos,
    limiteTotal: d.limiteTotal ?? null,
    limitePorAluno: d.limitePorAluno,
    apenasPrimeiraCompra: d.apenasPrimeiraCompra,
    fimEm: d.fimEm ? new Date(d.fimEm) : null,
    ativo: d.ativo,
  };
}

const codigoDuplicado = (erro: unknown) => {
  if (codigoErroPostgres(erro).code === '23505')
    return new ErroDominio('cupom_duplicado', 'Já existe um cupom com esse código', 'conflito');
  return erro;
};

@Injectable()
export class PromocoesService {
  constructor(private readonly banco: BancoService) {}

  /** Lista os cupons visíveis ao ator (admin: todos; autoescola: os dela, via RLS). */
  async listar(ator: Ator): Promise<Cupom[]> {
    return this.banco.comAtor(ator, async (tx) => {
      const linhas = await tx
        .select({
          c: cupons,
          usos: sql<number>`(select count(*)::int from cupom_usos u where u.cupom_id = ${cupons.id} and u.status <> 'cancelado')`,
          descontoTotal: sql<string>`(select coalesce(sum(u.desconto_centavos), 0) from cupom_usos u where u.cupom_id = ${cupons.id} and u.status = 'confirmado')`,
          vendedorNome: sql<
            string | null
          >`coalesce(${autoescolas.nomeFantasia}, (select u.nome from usuarios u where u.id = ${instrutores.usuarioId}))`,
        })
        .from(cupons)
        .leftJoin(autoescolas, eq(autoescolas.id, cupons.autoescolaId))
        .leftJoin(instrutores, eq(instrutores.id, cupons.instrutorId))
        .orderBy(desc(cupons.criadoEm))
        .limit(500);
      return linhas.map((l) =>
        paraCupom(l.c, {
          usos: l.usos,
          descontoTotal: Number(l.descontoTotal),
          vendedorNome: l.vendedorNome,
        }),
      );
    });
  }

  private async gravar(
    ator: Ator,
    id: string | null,
    valores: Partial<typeof cupons.$inferInsert>,
    /** Parceiro só altera cupons bancados por ele (não os da plataforma). */
    soBancadoPeloVendedor = false,
  ): Promise<Cupom[]> {
    try {
      await this.banco.comAtor(ator, async (tx) => {
        if (id) {
          const [antes] = await tx.select().from(cupons).where(eq(cupons.id, id)).for('update');
          if (!antes || (soBancadoPeloVendedor && antes.bancadoPor !== 'vendedor'))
            throw naoEncontrado('cupom');
          await tx
            .update(cupons)
            .set({ ...valores, atualizadoEm: new Date() })
            .where(eq(cupons.id, id));
          await auditar(tx, {
            ator,
            entidadeTipo: 'cupom',
            entidadeId: id,
            acao: 'cupom.alterado',
            antes,
            depois: valores,
            autoescolaId: antes.autoescolaId,
          });
        } else {
          const [novo] = await tx
            .insert(cupons)
            .values({
              ...(valores as typeof cupons.$inferInsert),
              criadoPor: ator.usuarioId ?? null,
            })
            .returning();
          await auditar(tx, {
            ator,
            entidadeTipo: 'cupom',
            entidadeId: novo!.id,
            acao: 'cupom.criado',
            depois: novo,
            autoescolaId: novo!.autoescolaId,
          });
        }
      });
    } catch (erro) {
      throw codigoDuplicado(erro);
    }
    return this.listar(ator);
  }

  salvarAdmin(ator: Ator, id: string | null, d: CupomEntrada) {
    return this.gravar(ator, id, {
      ...colunas(d),
      campanha: d.campanha ?? null,
      produtoTipo: d.produtoTipo ?? null,
      instrutorId: d.instrutorId ?? null,
      autoescolaId: d.autoescolaId ?? null,
      bancadoPor: d.bancadoPor,
      ...(d.inicioEm ? { inicioEm: new Date(d.inicioEm) } : {}),
    });
  }

  /** Cupom da própria autoescola: sempre bancado por ela e válido só para os pacotes dela. */
  salvarAutoescola(ator: Ator, id: string | null, d: CupomParceiroEntrada) {
    return this.gravar(
      ator,
      id,
      {
        ...colunas(d),
        autoescolaId: ator.autoescolaId!,
        instrutorId: null,
        bancadoPor: 'vendedor',
        produtoTipo: 'pacote',
      },
      true,
    );
  }

  /** Prévia do desconto antes de pagar (nada é reservado aqui). */
  async validar(
    ator: Ator & { alunoId: string },
    d: { codigo: string; pacoteId?: string; instrutorId?: string },
  ): Promise<CupomValidado> {
    return this.banco.comAtor(ator, async (tx) => {
      const alvo = await this.alvo(tx, d);
      const r = await resolverCupom(tx, {
        codigo: d.codigo,
        alunoId: ator.alunoId,
        ...alvo,
      });
      return {
        codigo: r.cupom.codigo,
        descricao: r.cupom.descricao,
        valorBrutoCentavos: alvo.valorBrutoCentavos,
        descontoCentavos: r.descontoCentavos,
        valorFinalCentavos: alvo.valorBrutoCentavos - r.descontoCentavos,
      };
    });
  }

  private async alvo(tx: Tx, d: { pacoteId?: string; instrutorId?: string }) {
    return comoSistema(tx, async () => {
      if (d.pacoteId) {
        const [p] = await tx.select().from(pacotes).where(eq(pacotes.id, d.pacoteId));
        if (!p || !p.publicado || p.arquivadoEm) throw naoEncontrado('pacote');
        return {
          produtoTipo: 'pacote' as const,
          instrutorId: p.instrutorId,
          autoescolaId: p.autoescolaId,
          valorBrutoCentavos: p.precoCentavos,
        };
      }
      const [i] = await tx
        .select({ id: instrutores.id, preco: instrutores.precoAulaCentavos })
        .from(instrutores)
        .innerJoin(usuarios, eq(usuarios.id, instrutores.usuarioId))
        .where(eq(instrutores.id, d.instrutorId!));
      if (!i?.preco) throw naoEncontrado('instrutor');
      return {
        produtoTipo: 'aula_avulsa' as const,
        instrutorId: i.id,
        autoescolaId: null,
        valorBrutoCentavos: i.preco,
      };
    });
  }
}
