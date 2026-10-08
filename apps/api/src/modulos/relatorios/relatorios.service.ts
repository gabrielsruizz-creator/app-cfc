import { Injectable } from '@nestjs/common';
import type { FiltroPeriodo, RelatorioAdmin, RelatorioAutoescola } from '@volante/contracts';
import { sql, type Ator, type Tx } from '@volante/db';
import { BancoService } from '../../nucleo/banco.service';

const FUSO = 'America/Sao_Paulo';
const n = (v: unknown) => Number(v ?? 0);

/** Intervalo [de 00:00, ate+1 00:00) no fuso de São Paulo. */
function intervalo(p: FiltroPeriodo) {
  return {
    de: sql`(${p.de}::date)::timestamp at time zone ${FUSO}`,
    ate: sql`((${p.ate}::date) + 1)::timestamp at time zone ${FUSO}`,
  };
}

type Linha = Record<string, unknown>;
const linhas = async (tx: Tx, q: ReturnType<typeof sql>) => (await tx.execute(q)).rows as Linha[];

/**
 * Relatórios do período. A RLS já limita os dados à autoescola do ator; o filtro por
 * autoescola nas consultas só deixa a intenção explícita (e usa os índices).
 */
@Injectable()
export class RelatoriosService {
  constructor(private readonly banco: BancoService) {}

  async autoescola(ator: Ator, periodo: FiltroPeriodo): Promise<RelatorioAutoescola> {
    const { de, ate } = intervalo(periodo);
    const aeId = ator.autoescolaId!;
    return this.banco.comAtor(ator, async (tx) => {
      const pagos = sql`p.autoescola_id = ${aeId} and p.pago_em >= ${de} and p.pago_em < ${ate}`;
      const [v] = await linhas(
        tx,
        sql`select count(*)::int as pedidos,
              coalesce(sum(p.valor_bruto_centavos), 0) as bruto,
              coalesce(sum(p.desconto_centavos), 0) as desconto,
              coalesce(sum(p.valor_total_centavos), 0) as pago,
              coalesce(sum(p.valor_liquido_vendedor_centavos), 0) as liquido,
              coalesce(sum((select coalesce(sum(c.valor_estornado_centavos), 0) from cobrancas c where c.pedido_id = p.id)), 0) as estornado
            from pedidos p where ${pagos}`,
      );
      const [f] = await linhas(
        tx,
        sql`select count(*)::int as recebidos,
              count(*) filter (where p.status_atendimento = 'confirmado')::int as confirmados,
              count(*) filter (where p.status_atendimento = 'recusado')::int as recusados,
              count(*) filter (where p.status_atendimento = 'expirado')::int as expirados,
              count(*) filter (where p.status_atendimento in ('novo', 'em_contato'))::int as em_aberto,
              avg(extract(epoch from (coalesce(p.primeiro_contato_em, p.confirmado_em, p.recusado_em) - p.pago_em)) / 60) as primeiro_contato,
              avg(extract(epoch from (p.confirmado_em - p.pago_em)) / 60) as confirmacao
            from pedidos p where ${pagos} and p.status_atendimento is not null`,
      );
      const semanas = await linhas(
        tx,
        sql`select to_char(date_trunc('week', p.pago_em at time zone ${FUSO}), 'YYYY-MM-DD') as semana,
              sum(p.valor_total_centavos) as pago
            from pedidos p where ${pagos} group by 1 order by 1`,
      );
      const porPacote = await linhas(
        tx,
        sql`select p.snapshot->>'descricao' as pacote, count(*)::int as pedidos, sum(p.valor_total_centavos) as pago
            from pedidos p where ${pagos} group by 1 order by 3 desc limit 20`,
      );
      const porInstrutor = await linhas(
        tx,
        sql`select u.nome as instrutor,
              count(*) filter (where a.status = 'concluida')::int as concluidas,
              count(*) filter (where a.status in ('cancelada', 'nao_compareceu_aluno', 'nao_compareceu_instrutor'))::int as canceladas,
              count(*) filter (where a.status in ('solicitada', 'confirmada', 'a_caminho', 'em_andamento', 'aguardando_confirmacao'))::int as agendadas
            from aulas a
            join instrutores i on i.id = a.instrutor_id
            join usuarios u on u.id = i.usuario_id
            where a.autoescola_id = ${aeId} and a.inicio >= ${de} and a.inicio < ${ate}
            group by u.nome order by 2 desc`,
      );
      const cupons = await linhas(
        tx,
        sql`select c.codigo, count(*)::int as usos, sum(u.desconto_centavos) as desconto
            from cupom_usos u
            join pedidos p on p.id = u.pedido_id
            join cupons c on c.id = u.cupom_id
            where ${pagos} and u.status = 'confirmado'
            group by c.codigo order by 2 desc`,
      );
      const fechados = n(f?.confirmados) + n(f?.recusados) + n(f?.expirados);
      const media = (x: unknown) => (x === null || x === undefined ? null : Math.round(Number(x)));
      return {
        periodo,
        vendas: {
          pedidos: n(v?.pedidos),
          brutoCentavos: n(v?.bruto),
          descontoCentavos: n(v?.desconto),
          pagoCentavos: n(v?.pago),
          liquidoCentavos: n(v?.liquido),
          estornadoCentavos: n(v?.estornado),
        },
        fila: {
          recebidos: n(f?.recebidos),
          confirmados: n(f?.confirmados),
          recusados: n(f?.recusados),
          expirados: n(f?.expirados),
          emAberto: n(f?.em_aberto),
          conversaoBp: fechados ? Math.round((n(f?.confirmados) / fechados) * 10000) : null,
          primeiroContatoMedioMin: media(f?.primeiro_contato),
          confirmacaoMediaMin: media(f?.confirmacao),
        },
        vendasPorSemana: semanas.map((s) => ({
          semana: String(s.semana),
          pagoCentavos: n(s.pago),
        })),
        porPacote: porPacote.map((p) => ({
          pacote: String(p.pacote),
          pedidos: n(p.pedidos),
          pagoCentavos: n(p.pago),
        })),
        aulasPorInstrutor: porInstrutor.map((a) => ({
          instrutor: String(a.instrutor),
          concluidas: n(a.concluidas),
          canceladas: n(a.canceladas),
          agendadas: n(a.agendadas),
        })),
        cupons: cupons.map((c) => ({
          codigo: String(c.codigo),
          usos: n(c.usos),
          descontoCentavos: n(c.desconto),
        })),
      };
    });
  }

  async admin(ator: Ator, periodo: FiltroPeriodo): Promise<RelatorioAdmin> {
    const { de, ate } = intervalo(periodo);
    return this.banco.comAtor(ator, async (tx) => {
      const pagos = sql`p.pago_em >= ${de} and p.pago_em < ${ate}`;
      const [t] = await linhas(
        tx,
        sql`select count(*)::int as pedidos,
              coalesce(sum(p.valor_total_centavos), 0) as pago,
              coalesce(sum(p.desconto_centavos), 0) as desconto,
              coalesce(sum(p.comissao_centavos), 0) as comissao,
              coalesce(sum((select coalesce(sum(c.valor_estornado_centavos), 0) from cobrancas c where c.pedido_id = p.id)), 0) as estornado
            from pedidos p where ${pagos}`,
      );
      const [a] = await linhas(
        tx,
        sql`select count(*) filter (where status = 'concluida')::int as concluidas,
              count(*) filter (where status in ('cancelada', 'nao_compareceu_aluno', 'nao_compareceu_instrutor'))::int as canceladas
            from aulas where inicio >= ${de} and inicio < ${ate}`,
      );
      const dias = await linhas(
        tx,
        sql`select to_char(p.pago_em at time zone ${FUSO}, 'YYYY-MM-DD') as dia, sum(p.valor_total_centavos) as pago
            from pedidos p where ${pagos} group by 1 order by 1`,
      );
      const metodos = await linhas(
        tx,
        sql`select c.metodo, c.parcelas, count(*)::int as pedidos, sum(p.valor_total_centavos) as pago
            from pedidos p join cobrancas c on c.pedido_id = p.id and c.status in ('paga', 'estornada', 'estornada_parcial')
            where ${pagos} group by 1, 2 order by 1, 2`,
      );
      const vendedores = await linhas(
        tx,
        sql`select p.snapshot->>'vendedorNome' as nome, p.vendedor_tipo as tipo,
              count(*)::int as pedidos, sum(p.valor_total_centavos) as pago
            from pedidos p where ${pagos}
            group by 1, 2, coalesce(p.instrutor_id, p.autoescola_id) order by 4 desc limit 10`,
      );
      const cupons = await linhas(
        tx,
        sql`select c.codigo, c.bancado_por, count(*)::int as usos, sum(u.desconto_centavos) as desconto
            from cupom_usos u join pedidos p on p.id = u.pedido_id join cupons c on c.id = u.cupom_id
            where ${pagos} and u.status = 'confirmado'
            group by 1, 2 order by 4 desc`,
      );
      return {
        periodo,
        totais: {
          pedidos: n(t?.pedidos),
          pagoCentavos: n(t?.pago),
          descontoCentavos: n(t?.desconto),
          comissaoCentavos: n(t?.comissao),
          estornadoCentavos: n(t?.estornado),
          aulasConcluidas: n(a?.concluidas),
          aulasCanceladas: n(a?.canceladas),
        },
        vendasPorDia: dias.map((d) => ({ dia: String(d.dia), pagoCentavos: n(d.pago) })),
        porMetodo: metodos.map((m) => ({
          metodo: String(m.metodo),
          parcelas: n(m.parcelas),
          pedidos: n(m.pedidos),
          pagoCentavos: n(m.pago),
        })),
        topVendedores: vendedores.map((v) => ({
          nome: String(v.nome),
          tipo: String(v.tipo),
          pedidos: n(v.pedidos),
          pagoCentavos: n(v.pago),
        })),
        cupons: cupons.map((c) => ({
          codigo: String(c.codigo),
          bancadoPor: String(c.bancado_por),
          usos: n(c.usos),
          descontoCentavos: n(c.desconto),
        })),
      };
    });
  }

  /** Vendas do período em CSV (separador ";" e vírgula decimal, para abrir direto no Excel). */
  async vendasCsv(ator: Ator, periodo: FiltroPeriodo, comoAdmin: boolean): Promise<string> {
    const { de, ate } = intervalo(periodo);
    const rows = await this.banco.comAtor(ator, (tx) =>
      linhas(
        tx,
        sql`select to_char(p.pago_em at time zone ${FUSO}, 'DD/MM/YYYY HH24:MI') as pago_em,
              p.codigo, p.tipo, p.snapshot->>'descricao' as descricao, p.snapshot->>'vendedorNome' as vendedor,
              ua.nome as aluno, p.valor_bruto_centavos as bruto, p.desconto_centavos as desconto,
              p.snapshot->>'cupomCodigo' as cupom, p.valor_total_centavos as pago,
              p.valor_liquido_vendedor_centavos as liquido, p.comissao_centavos as comissao,
              c.metodo, c.parcelas, p.status, p.status_atendimento
            from pedidos p
            join alunos al on al.id = p.aluno_id
            join usuarios ua on ua.id = al.usuario_id
            left join lateral (select metodo, parcelas from cobrancas where pedido_id = p.id order by criado_em desc limit 1) c on true
            where p.pago_em >= ${de} and p.pago_em < ${ate}
              ${ator.autoescolaId ? sql`and p.autoescola_id = ${ator.autoescolaId}` : sql``}
            order by p.pago_em`,
      ),
    );
    const reais = (v: unknown) => (n(v) / 100).toFixed(2).replace('.', ',');
    const cel = (v: unknown) => {
      const t = v === null || v === undefined ? '' : String(v);
      return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    };
    const cabecalho = [
      'Pago em',
      'Pedido',
      'Tipo',
      'Descrição',
      ...(comoAdmin ? ['Vendedor'] : []),
      'Aluno',
      'Valor bruto',
      'Desconto',
      'Cupom',
      'Valor pago',
      'Líquido do vendedor',
      ...(comoAdmin ? ['Comissão'] : []),
      'Pagamento',
      'Parcelas',
      'Situação',
      'Atendimento',
    ];
    const corpo = rows.map((r) =>
      [
        r.pago_em,
        r.codigo,
        r.tipo === 'pacote' ? 'Pacote' : 'Aula avulsa',
        r.descricao,
        ...(comoAdmin ? [r.vendedor] : []),
        r.aluno,
        reais(r.bruto),
        reais(r.desconto),
        r.cupom,
        reais(r.pago),
        reais(r.liquido),
        ...(comoAdmin ? [reais(r.comissao)] : []),
        r.metodo === 'cartao' ? 'Cartão' : 'Pix',
        r.parcelas,
        r.status,
        r.status_atendimento,
      ]
        .map(cel)
        .join(';'),
    );
    // BOM para o Excel reconhecer UTF-8 (acentos).
    return `﻿${[cabecalho.join(';'), ...corpo].join('\r\n')}\r\n`;
  }
}
