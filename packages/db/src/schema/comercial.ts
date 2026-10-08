import {
  CATEGORIAS_CNH,
  GATEWAYS,
  STATUS_ATENDIMENTO,
  STATUS_COBRANCA,
  STATUS_PEDIDO,
} from '@volante/contracts';
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { alunos, arquivos, usuarios } from './identidade';
import { autoescolas, instrutores } from './parceiros';
import { carimbos, criadoEm, idPk, instanteTz } from './tipos';
import { checkValores } from './util';

const VENDEDORES = ['instrutor', 'autoescola'] as const;

/** Regras de comissão versionadas: nunca são editadas, apenas encerradas e substituídas. */
export const regrasComissao = pgTable(
  'regras_comissao',
  {
    id: idPk(),
    vendedorTipo: text().notNull(),
    produtoTipo: text().notNull(),
    instrutorId: uuid().references(() => instrutores.id),
    autoescolaId: uuid().references(() => autoescolas.id),
    percentualBp: integer().notNull(),
    valorFixoCentavos: bigint({ mode: 'number' }).notNull().default(0),
    vigenteDesde: instanteTz().defaultNow().notNull(),
    vigenteAte: instanteTz(),
    criadoPor: uuid().references(() => usuarios.id),
    motivo: text(),
  },
  (t) => [
    checkValores('regras_vendedor_ck', t.vendedorTipo, VENDEDORES),
    checkValores('regras_produto_ck', t.produtoTipo, ['aula_avulsa', 'pacote']),
    check('regras_percentual_ck', sql`${t.percentualBp} between 0 and 10000`),
    index('regras_vigentes_idx').on(t.vendedorTipo, t.produtoTipo, t.vigenteAte),
  ],
);

/** [F2] Pacotes de aulas de instrutores ou autoescolas. */
export const pacotes = pgTable(
  'pacotes',
  {
    id: idPk(),
    vendedorTipo: text().notNull(),
    instrutorId: uuid().references(() => instrutores.id),
    autoescolaId: uuid().references(() => autoescolas.id),
    nome: text().notNull(),
    descricao: text(),
    categorias: text().array().notNull(),
    quantidadeAulas: smallint().notNull(),
    duracaoAulaMin: smallint().notNull(),
    precoCentavos: bigint({ mode: 'number' }).notNull(),
    parcelasMax: smallint().notNull().default(1),
    validadeDias: smallint(),
    publicado: boolean().notNull().default(false),
    arquivadoEm: instanteTz(),
    ...carimbos,
  },
  (t) => [
    checkValores('pacotes_vendedor_ck', t.vendedorTipo, VENDEDORES),
    check('pacotes_dono_ck', sql`num_nonnulls(${t.instrutorId}, ${t.autoescolaId}) = 1`),
    check('pacotes_qtd_ck', sql`${t.quantidadeAulas} > 0`),
    index('pacotes_autoescola_idx').on(t.autoescolaId),
  ],
);

export type SnapshotPedido = {
  descricao: string;
  categorias: string[];
  quantidadeAulas: number;
  duracaoAulaMin: number;
  precoUnitarioCentavos: number;
  vendedorNome: string;
  /** [F3] Cupom aplicado na compra. */
  cupomCodigo?: string;
};

export const pedidos = pgTable(
  'pedidos',
  {
    id: idPk(),
    codigo: text().notNull(),
    alunoId: uuid()
      .notNull()
      .references(() => alunos.id),
    vendedorTipo: text().notNull(),
    instrutorId: uuid().references(() => instrutores.id),
    autoescolaId: uuid().references(() => autoescolas.id),
    tipo: text().notNull(),
    pacoteId: uuid().references(() => pacotes.id),
    snapshot: jsonb().$type<SnapshotPedido>().notNull(),
    quantidadeAulas: smallint().notNull(),
    valorBrutoCentavos: bigint({ mode: 'number' }).notNull(),
    descontoCentavos: bigint({ mode: 'number' }).notNull().default(0),
    valorTotalCentavos: bigint({ mode: 'number' }).notNull(),
    comissaoBp: integer().notNull(),
    comissaoCentavos: bigint({ mode: 'number' }).notNull(),
    regraComissaoId: uuid()
      .notNull()
      .references(() => regrasComissao.id),
    valorLiquidoVendedorCentavos: bigint({ mode: 'number' }).notNull(),
    status: text().notNull().default('aguardando_pagamento'),
    statusAtendimento: text(),
    motivoRecusa: text(),
    pagoEm: instanteTz(),
    primeiroContatoEm: instanteTz(),
    confirmadoEm: instanteTz(),
    recusadoEm: instanteTz(),
    expiradoEm: instanteTz(),
    lembreteEnviadoEm: instanteTz(),
    prazoRespostaEm: instanteTz(),
    /** [F3] FK para cupons (criada na migração, para evitar import circular). */
    cupomId: uuid(),
    ...carimbos,
  },
  (t) => [
    uniqueIndex('pedidos_codigo_uk').on(t.codigo),
    checkValores('pedidos_vendedor_ck', t.vendedorTipo, VENDEDORES),
    checkValores('pedidos_tipo_ck', t.tipo, ['aula_avulsa', 'pacote']),
    checkValores('pedidos_status_ck', t.status, STATUS_PEDIDO),
    checkValores('pedidos_atendimento_ck', t.statusAtendimento, STATUS_ATENDIMENTO),
    check(
      'pedidos_vendedor_dono_ck',
      sql`(${t.vendedorTipo} = 'instrutor' and ${t.instrutorId} is not null) or (${t.vendedorTipo} = 'autoescola' and ${t.autoescolaId} is not null)`,
    ),
    check(
      'pedidos_valores_ck',
      sql`${t.valorTotalCentavos} = ${t.valorBrutoCentavos} - ${t.descontoCentavos} and ${t.valorLiquidoVendedorCentavos} + ${t.comissaoCentavos} = ${t.valorTotalCentavos}`,
    ),
    check(
      'pedidos_recusa_motivo_ck',
      sql`${t.statusAtendimento} is distinct from 'recusado' or coalesce(length(trim(${t.motivoRecusa})), 0) > 0`,
    ),
    index('pedidos_aluno_idx').on(t.alunoId),
    index('pedidos_instrutor_idx').on(t.instrutorId),
    index('pedidos_fila_idx')
      .on(t.autoescolaId, t.statusAtendimento, t.pagoEm)
      .where(sql`${t.status} = 'pago'`),
  ],
);

/** Append-only. Linha do tempo exibida nas telas de pedido. */
export const pedidoHistorico = pgTable(
  'pedido_historico',
  {
    id: idPk(),
    pedidoId: uuid()
      .notNull()
      .references(() => pedidos.id),
    alunoId: uuid().notNull(),
    instrutorId: uuid(),
    autoescolaId: uuid(),
    deStatus: text(),
    paraStatus: text().notNull(),
    atorUsuarioId: uuid(),
    motivo: text(),
    criadoEm: criadoEm(),
  },
  (t) => [index('pedido_historico_pedido_idx').on(t.pedidoId)],
);

/** [F2] Matrícula criada quando a autoescola confirma um pedido. */
export const matriculas = pgTable(
  'matriculas',
  {
    id: idPk(),
    autoescolaId: uuid()
      .notNull()
      .references(() => autoescolas.id),
    alunoId: uuid()
      .notNull()
      .references(() => alunos.id),
    pedidoId: uuid()
      .notNull()
      .references(() => pedidos.id),
    categorias: text().array().notNull(),
    status: text().notNull().default('ativa'),
    ...carimbos,
  },
  (t) => [
    uniqueIndex('matriculas_pedido_uk').on(t.pedidoId),
    checkValores('matriculas_status_ck', t.status, ['ativa', 'concluida', 'cancelada']),
  ],
);

export const creditosAula = pgTable(
  'creditos_aula',
  {
    id: idPk(),
    pedidoId: uuid()
      .notNull()
      .references(() => pedidos.id),
    alunoId: uuid()
      .notNull()
      .references(() => alunos.id),
    instrutorId: uuid().references(() => instrutores.id),
    autoescolaId: uuid().references(() => autoescolas.id),
    categorias: text().array().notNull(),
    duracaoAulaMin: smallint().notNull(),
    quantidadeTotal: smallint().notNull(),
    quantidadeReservada: smallint().notNull().default(0),
    quantidadeConsumida: smallint().notNull().default(0),
    status: text().notNull(),
    validoAte: instanteTz(),
    ...carimbos,
  },
  (t) => [
    uniqueIndex('creditos_pedido_uk').on(t.pedidoId),
    checkValores('creditos_status_ck', t.status, [
      'aguardando_pagamento',
      'bloqueado',
      'ativo',
      'esgotado',
      'expirado',
      'estornado',
      'cancelado',
    ]),
    check(
      'creditos_saldo_ck',
      sql`${t.quantidadeReservada} >= 0 and ${t.quantidadeConsumida} >= 0 and ${t.quantidadeReservada} + ${t.quantidadeConsumida} <= ${t.quantidadeTotal}`,
    ),
    index('creditos_aluno_idx').on(t.alunoId),
  ],
);

export const creditosMovimentos = pgTable(
  'creditos_movimentos',
  {
    id: idPk(),
    creditoId: uuid()
      .notNull()
      .references(() => creditosAula.id),
    aulaId: uuid(),
    tipo: text().notNull(),
    quantidade: smallint().notNull(),
    criadoEm: criadoEm(),
  },
  (t) => [
    checkValores('creditos_mov_tipo_ck', t.tipo, [
      'reserva',
      'consumo',
      'devolucao',
      'estorno',
      'expiracao',
    ]),
    index('creditos_mov_credito_idx').on(t.creditoId),
  ],
);

// ---------- Pagamentos ----------

export const cobrancas = pgTable(
  'cobrancas',
  {
    id: idPk(),
    pedidoId: uuid()
      .notNull()
      .references(() => pedidos.id),
    alunoId: uuid().notNull(),
    instrutorId: uuid(),
    autoescolaId: uuid(),
    gateway: text().notNull(),
    gatewayCobrancaId: text(),
    metodo: text().notNull().default('pix'),
    parcelas: smallint().notNull().default(1),
    valorCentavos: bigint({ mode: 'number' }).notNull(),
    status: text().notNull().default('pendente_envio'),
    pixCopiaCola: text(),
    pixQrcodeBase64: text(),
    /** Prazo para pagar (Pix ou link do cartão). */
    pixExpiraEm: instanteTz(),
    /** [F3] Cartão: página de pagamento do gateway (o app nunca recebe dados do cartão). */
    urlPagamento: text(),
    pagoEm: instanteTz(),
    valorEstornadoCentavos: bigint({ mode: 'number' }).notNull().default(0),
    chaveIdempotencia: text().notNull(),
    dadosGateway: jsonb(),
    ultimoErro: text(),
    ...carimbos,
  },
  (t) => [
    uniqueIndex('cobrancas_gateway_uk').on(t.gateway, t.gatewayCobrancaId),
    uniqueIndex('cobrancas_idempotencia_uk').on(t.chaveIdempotencia),
    checkValores('cobrancas_status_ck', t.status, STATUS_COBRANCA),
    checkValores('cobrancas_gateway_ck', t.gateway, GATEWAYS),
    checkValores('cobrancas_metodo_ck', t.metodo, ['pix', 'cartao']),
    check(
      'cobrancas_parcelas_ck',
      sql`${t.parcelas} between 1 and 12 and (${t.metodo} = 'cartao' or ${t.parcelas} = 1)`,
    ),
    index('cobrancas_pedido_idx').on(t.pedidoId),
  ],
);

export const webhooksRecebidos = pgTable(
  'webhooks_recebidos',
  {
    id: idPk(),
    gateway: text().notNull(),
    eventoExternoId: text().notNull(),
    tipo: text(),
    cabecalhos: jsonb().notNull(),
    payload: jsonb().notNull(),
    recebidoEm: instanteTz().defaultNow().notNull(),
    processadoEm: instanteTz(),
    erro: text(),
  },
  (t) => [uniqueIndex('webhooks_evento_uk').on(t.gateway, t.eventoExternoId)],
);

export const estornos = pgTable(
  'estornos',
  {
    id: idPk(),
    cobrancaId: uuid()
      .notNull()
      .references(() => cobrancas.id),
    pedidoId: uuid()
      .notNull()
      .references(() => pedidos.id),
    alunoId: uuid().notNull(),
    instrutorId: uuid(),
    autoescolaId: uuid(),
    aulaId: uuid(),
    valorCentavos: bigint({ mode: 'number' }).notNull(),
    motivo: text().notNull(),
    status: text().notNull().default('solicitado'),
    solicitadoPor: uuid(),
    gatewayEstornoId: text(),
    ultimoErro: text(),
    concluidoEm: instanteTz(),
    ...carimbos,
  },
  (t) => [
    check('estornos_valor_ck', sql`${t.valorCentavos} > 0`),
    checkValores('estornos_motivo_ck', t.motivo, [
      'aula_recusada',
      'aula_expirada',
      'cancelamento',
      'pedido_recusado',
      'pedido_expirado',
      'disputa',
      'admin',
    ]),
    checkValores('estornos_status_ck', t.status, [
      'solicitado',
      'pendente_configuracao',
      'processando',
      'concluido',
      'falhou',
    ]),
  ],
);

// ---------- Financeiro (livro-razão) ----------

export const contasFinanceiras = pgTable(
  'contas_financeiras',
  {
    id: idPk(),
    titularTipo: text().notNull(),
    instrutorId: uuid().references(() => instrutores.id),
    autoescolaId: uuid().references(() => autoescolas.id),
    criadoEm: criadoEm(),
  },
  (t) => [
    checkValores('contas_titular_ck', t.titularTipo, [
      'plataforma',
      'externa',
      'instrutor',
      'autoescola',
    ]),
    uniqueIndex('contas_instrutor_uk').on(t.instrutorId),
    uniqueIndex('contas_autoescola_uk').on(t.autoescolaId),
    uniqueIndex('contas_sistema_uk')
      .on(t.titularTipo)
      .where(sql`${t.titularTipo} in ('plataforma', 'externa')`),
  ],
);

/**
 * Append-only. Cada operação gera lançamentos que somam zero:
 * a conta "externa" representa o dinheiro que entra e sai pelo gateway.
 */
export const lancamentos = pgTable(
  'lancamentos',
  {
    id: idPk(),
    operacaoId: uuid().notNull(),
    contaId: uuid()
      .notNull()
      .references(() => contasFinanceiras.id),
    instrutorId: uuid(),
    autoescolaId: uuid(),
    pedidoId: uuid().references(() => pedidos.id),
    aulaId: uuid(),
    estornoId: uuid(),
    tipo: text().notNull(),
    bucket: text().notNull(),
    valorCentavos: bigint({ mode: 'number' }).notNull(),
    descricao: text().notNull(),
    criadoEm: criadoEm(),
  },
  (t) => [
    checkValores('lancamentos_tipo_ck', t.tipo, [
      'retencao',
      'liberacao',
      'comissao',
      'estorno',
      'saque',
      'ajuste',
    ]),
    checkValores('lancamentos_bucket_ck', t.bucket, ['retido', 'disponivel', 'movimento']),
    index('lancamentos_conta_idx').on(t.contaId, t.criadoEm),
    index('lancamentos_operacao_idx').on(t.operacaoId),
    index('lancamentos_pedido_idx').on(t.pedidoId),
  ],
);

export const repasses = pgTable(
  'repasses',
  {
    id: idPk(),
    contaId: uuid()
      .notNull()
      .references(() => contasFinanceiras.id),
    instrutorId: uuid(),
    autoescolaId: uuid(),
    pedidoId: uuid().references(() => pedidos.id),
    aulaId: uuid(),
    valorCentavos: bigint({ mode: 'number' }).notNull(),
    status: text().notNull().default('pendente'),
    gatewayTransferenciaId: text(),
    ultimoErro: text(),
    ...carimbos,
  },
  (t) => [
    checkValores('repasses_status_ck', t.status, [
      'pendente',
      'pendente_configuracao',
      'enviado',
      'concluido',
      'falhou',
    ]),
  ],
);

export const recibos = pgTable(
  'recibos',
  {
    id: idPk(),
    numero: integer().generatedAlwaysAsIdentity(),
    pedidoId: uuid()
      .notNull()
      .references(() => pedidos.id),
    alunoId: uuid().notNull(),
    instrutorId: uuid(),
    autoescolaId: uuid(),
    emissorTipo: text().notNull(),
    emissorNome: text().notNull(),
    valorCentavos: bigint({ mode: 'number' }).notNull(),
    itens: jsonb().$type<{ descricao: string; valorCentavos: number }[]>().notNull(),
    arquivoId: uuid().references(() => arquivos.id),
    emitidoEm: instanteTz().defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('recibos_pedido_uk').on(t.pedidoId),
    uniqueIndex('recibos_numero_uk').on(t.numero),
  ],
);

/** Estrutura pronta para nota fiscal; emissão real depende de um adaptador (hoje: NaoConfigurado). */
export const notasFiscais = pgTable(
  'notas_fiscais',
  {
    id: idPk(),
    reciboId: uuid()
      .notNull()
      .references(() => recibos.id),
    emissorTipo: text().notNull(),
    emissorId: uuid(),
    status: text().notNull().default('pendente_configuracao'),
    numero: text(),
    serie: text(),
    chaveAcesso: text(),
    xmlArquivoId: uuid().references(() => arquivos.id),
    pdfArquivoId: uuid().references(() => arquivos.id),
    ultimoErro: text(),
    ...carimbos,
  },
  (t) => [
    checkValores('nf_status_ck', t.status, [
      'nao_aplicavel',
      'pendente_configuracao',
      'emitida',
      'cancelada',
      'erro',
    ]),
  ],
);

export const CATEGORIAS = CATEGORIAS_CNH;

// ---------- Fase 2: recebimento e saques ----------

export const contasRecebimento = pgTable(
  'contas_recebimento',
  {
    id: idPk(),
    titularTipo: text().notNull(),
    instrutorId: uuid().references(() => instrutores.id),
    autoescolaId: uuid().references(() => autoescolas.id),
    tipoChavePix: text().notNull(),
    /** Chave Pix cifrada (AES-256-GCM) pela aplicação. */
    chavePixCifrada: text().notNull(),
    chavePixMascarada: text().notNull(),
    titularNome: text().notNull(),
    titularDocumento: text().notNull(),
    gatewaySubcontaId: text(),
    ativa: boolean().notNull().default(true),
    ...carimbos,
  },
  (t) => [
    checkValores('contas_rec_titular_ck', t.titularTipo, VENDEDORES),
    checkValores('contas_rec_chave_ck', t.tipoChavePix, [
      'cpf',
      'cnpj',
      'email',
      'telefone',
      'aleatoria',
    ]),
    check('contas_rec_dono_ck', sql`num_nonnulls(${t.instrutorId}, ${t.autoescolaId}) = 1`),
    uniqueIndex('contas_rec_instrutor_uk')
      .on(t.instrutorId)
      .where(sql`${t.ativa} and ${t.instrutorId} is not null`),
    uniqueIndex('contas_rec_autoescola_uk')
      .on(t.autoescolaId)
      .where(sql`${t.ativa} and ${t.autoescolaId} is not null`),
  ],
);

export const saques = pgTable(
  'saques',
  {
    id: idPk(),
    contaId: uuid()
      .notNull()
      .references(() => contasFinanceiras.id),
    instrutorId: uuid(),
    autoescolaId: uuid(),
    contaRecebimentoId: uuid()
      .notNull()
      .references(() => contasRecebimento.id),
    gateway: text().notNull(),
    valorCentavos: bigint({ mode: 'number' }).notNull(),
    status: text().notNull().default('solicitado'),
    gatewayRef: text(),
    ultimoErro: text(),
    solicitadoPor: uuid(),
    concluidoEm: instanteTz(),
    ...carimbos,
  },
  (t) => [
    check('saques_valor_ck', sql`${t.valorCentavos} > 0`),
    checkValores('saques_status_ck', t.status, [
      'solicitado',
      'pendente_configuracao',
      'processando',
      'concluido',
      'falhou',
    ]),
    index('saques_conta_idx').on(t.contaId),
  ],
);
