import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { pedidos } from './comercial';
import { alunos, usuarios } from './identidade';
import { autoescolas, instrutores } from './parceiros';
import { carimbos, idPk, instanteTz } from './tipos';
import { checkValores } from './util';

/**
 * [F3] Cupons de desconto. Quem banca o desconto:
 * - `plataforma`: o vendedor recebe como se não houvesse cupom (a comissão absorve o desconto);
 * - `vendedor`: o preço cai e a comissão é calculada sobre o valor com desconto.
 * Cupom bancado pelo vendedor é sempre de um instrutor ou autoescola específico.
 */
export const cupons = pgTable(
  'cupons',
  {
    id: idPk(),
    /** Sempre em maiúsculas. */
    codigo: text().notNull(),
    campanha: text(),
    descricao: text(),
    tipo: text().notNull(),
    /** Percentual em pontos-base (1000 = 10%) ou valor fixo em centavos. */
    valor: bigint({ mode: 'number' }).notNull(),
    descontoMaximoCentavos: bigint({ mode: 'number' }),
    valorMinimoCentavos: bigint({ mode: 'number' }).notNull().default(0),
    /** Nulo = vale para aula avulsa e pacote. */
    produtoTipo: text(),
    instrutorId: uuid().references(() => instrutores.id),
    autoescolaId: uuid().references(() => autoescolas.id),
    bancadoPor: text().notNull(),
    limiteTotal: integer(),
    limitePorAluno: integer().notNull().default(1),
    apenasPrimeiraCompra: boolean().notNull().default(false),
    inicioEm: instanteTz().notNull().defaultNow(),
    fimEm: instanteTz(),
    ativo: boolean().notNull().default(true),
    criadoPor: uuid().references(() => usuarios.id),
    ...carimbos,
  },
  (t) => [
    uniqueIndex('cupons_codigo_uk').on(t.codigo),
    checkValores('cupons_tipo_ck', t.tipo, ['percentual', 'valor_fixo']),
    checkValores('cupons_bancado_ck', t.bancadoPor, ['plataforma', 'vendedor']),
    checkValores('cupons_produto_ck', t.produtoTipo, ['aula_avulsa', 'pacote']),
    check(
      'cupons_valor_ck',
      sql`${t.valor} > 0 and (${t.tipo} <> 'percentual' or ${t.valor} <= 10000)`,
    ),
    check(
      'cupons_codigo_ck',
      sql`${t.codigo} = upper(${t.codigo}) and length(${t.codigo}) between 3 and 30`,
    ),
    check(
      'cupons_vendedor_ck',
      sql`${t.bancadoPor} <> 'vendedor' or ${t.instrutorId} is not null or ${t.autoescolaId} is not null`,
    ),
    check('cupons_um_vendedor_ck', sql`${t.instrutorId} is null or ${t.autoescolaId} is null`),
    check(
      'cupons_limites_ck',
      sql`${t.limitePorAluno} > 0 and (${t.limiteTotal} is null or ${t.limiteTotal} > 0)`,
    ),
    index('cupons_autoescola_idx').on(t.autoescolaId),
  ],
);

/** [F3] Uso de cupom por pedido. Reservado na compra, confirmado no pagamento, cancelado se não pago. */
export const cupomUsos = pgTable(
  'cupom_usos',
  {
    id: idPk(),
    cupomId: uuid()
      .notNull()
      .references(() => cupons.id),
    pedidoId: uuid()
      .notNull()
      .references(() => pedidos.id),
    alunoId: uuid()
      .notNull()
      .references(() => alunos.id),
    instrutorId: uuid().references(() => instrutores.id),
    autoescolaId: uuid().references(() => autoescolas.id),
    descontoCentavos: bigint({ mode: 'number' }).notNull(),
    bancadoPor: text().notNull(),
    status: text().notNull().default('reservado'),
    ...carimbos,
  },
  (t) => [
    uniqueIndex('cupom_usos_pedido_uk').on(t.pedidoId),
    checkValores('cupom_usos_status_ck', t.status, ['reservado', 'confirmado', 'cancelado']),
    check('cupom_usos_desconto_ck', sql`${t.descontoCentavos} > 0`),
    index('cupom_usos_cupom_idx').on(t.cupomId),
    index('cupom_usos_aluno_idx').on(t.alunoId),
  ],
);
