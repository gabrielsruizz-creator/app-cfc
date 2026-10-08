import { z } from 'zod';
import { centavos, id, pontoGeo } from './comum';
import { categoriaCnh, statusCobranca } from './enums';

export const pacoteEntrada = z.object({
  nome: z.string().trim().min(3).max(80),
  descricao: z.string().trim().max(600).optional(),
  categorias: z.array(categoriaCnh).min(1, 'Escolha ao menos uma categoria'),
  quantidadeAulas: z.number().int().min(1).max(100),
  duracaoAulaMin: z.number().int().min(30).max(120),
  precoCentavos: centavos.min(1000, 'Preço mínimo de R$ 10,00'),
  parcelasMax: z.number().int().min(1).max(12).default(1),
  validadeDias: z.number().int().min(7).max(730).optional(),
  publicado: z.boolean().default(true),
});
export type PacoteEntrada = z.infer<typeof pacoteEntrada>;

export const pacote = pacoteEntrada.extend({
  id,
  vendedorTipo: z.enum(['instrutor', 'autoescola']),
  instrutorId: id.nullable(),
  autoescolaId: id.nullable(),
  vendedorNome: z.string(),
  precoPorAulaCentavos: z.number(),
});
export type Pacote = z.infer<typeof pacote>;

export const comprarPacote = z.object({ pacoteId: id });

export const resumoPedido = z.object({
  id,
  codigo: z.string(),
  tipo: z.enum(['aula_avulsa', 'pacote']),
  vendedorTipo: z.enum(['instrutor', 'autoescola']),
  vendedorNome: z.string(),
  descricao: z.string(),
  quantidadeAulas: z.number(),
  valorTotalCentavos: z.number(),
  status: z.string(),
  statusAtendimento: z.string().nullable(),
  motivoRecusa: z.string().nullable(),
  pagoEm: z.string().nullable(),
  prazoRespostaEm: z.string().nullable(),
  criadoEm: z.string(),
  autoescolaId: id.nullable(),
  instrutorId: id.nullable(),
  cobranca: z
    .object({
      id,
      status: statusCobranca,
      gateway: z.string(),
      valorCentavos: z.number(),
      pixCopiaCola: z.string().nullable(),
      pixQrCodeBase64: z.string().nullable(),
      pixExpiraEm: z.string().nullable(),
      ambienteTeste: z.boolean(),
    })
    .nullable(),
  historico: z.array(
    z.object({ paraStatus: z.string(), motivo: z.string().nullable(), criadoEm: z.string() }),
  ),
  credito: z
    .object({
      id,
      quantidadeTotal: z.number(),
      quantidadeReservada: z.number(),
      quantidadeConsumida: z.number(),
      status: z.string(),
      validoAte: z.string().nullable(),
    })
    .nullable(),
  avaliado: z.boolean(),
});
export type ResumoPedido = z.infer<typeof resumoPedido>;

export const saldoCredito = z.object({
  id,
  pedidoId: id,
  descricao: z.string(),
  vendedorTipo: z.enum(['instrutor', 'autoescola']),
  vendedorNome: z.string(),
  instrutorId: id.nullable(),
  autoescolaId: id.nullable(),
  categorias: z.array(z.string()),
  duracaoAulaMin: z.number(),
  quantidadeTotal: z.number(),
  disponiveis: z.number(),
  status: z.string(),
  validoAte: z.string().nullable(),
});
export type SaldoCredito = z.infer<typeof saldoCredito>;

// ---------- Autoescola: vitrine e fila ----------

export const autoescolaCard = z.object({
  id,
  nomeFantasia: z.string(),
  logoArquivoId: id.nullable(),
  fotoCapaArquivoId: id.nullable(),
  bairro: z.string(),
  municipio: z.string(),
  uf: z.string(),
  distanciaKm: z.number(),
  notaMedia: z.number().nullable(),
  totalAvaliacoes: z.number(),
  aPartirDeCentavos: z.number().nullable(),
  localizacao: pontoGeo,
});
export type AutoescolaCard = z.infer<typeof autoescolaCard>;

export const perfilAutoescolaPublico = autoescolaCard.omit({ distanciaKm: true }).extend({
  descricao: z.string().nullable(),
  endereco: z.string(),
  telefone: z.string(),
  fotos: z.array(z.object({ arquivoId: id, legenda: z.string().nullable() })),
  horarios: z.array(z.object({ diaSemana: z.number(), abre: z.string(), fecha: z.string() })),
  pacotes: z.array(pacote),
  avaliacoes: z.array(
    z.object({
      id,
      nota: z.number(),
      comentario: z.string().nullable(),
      autorPrimeiroNome: z.string(),
      criadoEm: z.string(),
      resposta: z.string().nullable(),
    }),
  ),
  instrutores: z.array(z.object({ id, nome: z.string(), fotoArquivoId: id.nullable() })),
});
export type PerfilAutoescolaPublico = z.infer<typeof perfilAutoescolaPublico>;

export const buscaAutoescolas = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  raioKm: z.coerce.number().min(1).max(200).default(50),
  texto: z.string().max(80).optional(),
});

export const vitrineEntrada = z.object({
  descricao: z.string().trim().max(1500).optional(),
  mensagemWhatsappPadrao: z.string().trim().min(10).max(600),
  logoArquivoId: id.optional(),
  horarios: z
    .array(
      z.object({
        diaSemana: z.number().int().min(0).max(6),
        abre: z.string().regex(/^\d{2}:\d{2}$/),
        fecha: z.string().regex(/^\d{2}:\d{2}$/),
      }),
    )
    .max(14),
});
export type VitrineEntrada = z.infer<typeof vitrineEntrada>;

export const itemFila = z.object({
  pedidoId: id,
  codigo: z.string(),
  statusAtendimento: z.enum(['novo', 'em_contato', 'confirmado', 'recusado', 'expirado']),
  aluno: z.object({
    id,
    nome: z.string(),
    cpf: z.string().nullable(),
    telefone: z.string(),
    email: z.string(),
    categoriaDesejada: z.string(),
    renach: z.string().nullable(),
  }),
  descricao: z.string(),
  quantidadeAulas: z.number(),
  valorPagoCentavos: z.number(),
  valorLiquidoCentavos: z.number(),
  pagoEm: z.string().nullable(),
  prazoRespostaEm: z.string().nullable(),
  minutosEsperando: z.number(),
  motivoRecusa: z.string().nullable(),
  linkWhatsapp: z.string(),
});
export type ItemFila = z.infer<typeof itemFila>;

export const recusarPedido = z.object({
  motivo: z.string().trim().min(5, 'Explique o motivo (mín. 5 caracteres)').max(500),
});

export const convidarInstrutor = z.object({ cpfOuEmail: z.string().trim().min(5) });

export const agendarComCredito = z.object({
  creditoId: id,
  instrutorId: id,
  inicio: z.iso.datetime({ offset: true }),
  categoria: categoriaCnh,
  pontoEncontro: pontoGeo,
  pontoEncontroEndereco: z.string().trim().min(3).max(200),
  pontoEncontroReferencia: z.string().trim().max(200).optional(),
});
export type AgendarComCredito = z.infer<typeof agendarComCredito>;

export const avaliarAutoescola = z.object({
  nota: z.number().int().min(1).max(5),
  comentario: z.string().trim().max(1000).optional(),
});

export const responderAvaliacao = z.object({ resposta: z.string().trim().min(2).max(800) });
