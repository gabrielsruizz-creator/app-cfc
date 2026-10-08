import { z } from 'zod';

export const filtroPeriodo = z.object({
  de: z.iso.date(),
  ate: z.iso.date(),
});
export type FiltroPeriodo = z.infer<typeof filtroPeriodo>;

export const relatorioAutoescola = z.object({
  periodo: filtroPeriodo,
  vendas: z.object({
    pedidos: z.number(),
    brutoCentavos: z.number(),
    descontoCentavos: z.number(),
    pagoCentavos: z.number(),
    liquidoCentavos: z.number(),
    estornadoCentavos: z.number(),
  }),
  fila: z.object({
    recebidos: z.number(),
    confirmados: z.number(),
    recusados: z.number(),
    expirados: z.number(),
    emAberto: z.number(),
    /** Confirmados ÷ (recebidos − em aberto), em pontos-base. */
    conversaoBp: z.number().nullable(),
    primeiroContatoMedioMin: z.number().nullable(),
    confirmacaoMediaMin: z.number().nullable(),
  }),
  vendasPorSemana: z.array(z.object({ semana: z.string(), pagoCentavos: z.number() })),
  porPacote: z.array(
    z.object({ pacote: z.string(), pedidos: z.number(), pagoCentavos: z.number() }),
  ),
  aulasPorInstrutor: z.array(
    z.object({
      instrutor: z.string(),
      concluidas: z.number(),
      canceladas: z.number(),
      agendadas: z.number(),
    }),
  ),
  cupons: z.array(z.object({ codigo: z.string(), usos: z.number(), descontoCentavos: z.number() })),
});
export type RelatorioAutoescola = z.infer<typeof relatorioAutoescola>;

export const relatorioAdmin = z.object({
  periodo: filtroPeriodo,
  totais: z.object({
    pedidos: z.number(),
    pagoCentavos: z.number(),
    descontoCentavos: z.number(),
    comissaoCentavos: z.number(),
    estornadoCentavos: z.number(),
    aulasConcluidas: z.number(),
    aulasCanceladas: z.number(),
  }),
  vendasPorDia: z.array(z.object({ dia: z.string(), pagoCentavos: z.number() })),
  porMetodo: z.array(
    z.object({
      metodo: z.string(),
      parcelas: z.number(),
      pedidos: z.number(),
      pagoCentavos: z.number(),
    }),
  ),
  topVendedores: z.array(
    z.object({ nome: z.string(), tipo: z.string(), pedidos: z.number(), pagoCentavos: z.number() }),
  ),
  cupons: z.array(
    z.object({
      codigo: z.string(),
      bancadoPor: z.string(),
      usos: z.number(),
      descontoCentavos: z.number(),
    }),
  ),
});
export type RelatorioAdmin = z.infer<typeof relatorioAdmin>;
