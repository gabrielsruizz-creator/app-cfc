import { z } from 'zod';
import { id, instante, pontoGeo } from './comum';
import { categoriaCnh, statusAula, statusCobranca } from './enums';

export const solicitarAula = z.object({
  instrutorId: id,
  inicio: instante,
  categoria: categoriaCnh,
  pontoEncontro: pontoGeo,
  pontoEncontroEndereco: z.string().trim().min(3).max(200),
  pontoEncontroReferencia: z.string().trim().max(200).optional(),
  /** Usar saldo de um pacote em vez de pagar uma aula avulsa (Fase 2). */
  creditoId: id.optional(),
});
export type SolicitarAula = z.infer<typeof solicitarAula>;

export const resumoCobranca = z.object({
  id,
  status: statusCobranca,
  gateway: z.string(),
  metodo: z.string(),
  valorCentavos: z.number(),
  pixCopiaCola: z.string().nullable(),
  pixQrCodeBase64: z.string().nullable(),
  pixExpiraEm: z.string().nullable(),
  pagoEm: z.string().nullable(),
  /** Verdadeiro quando o gateway é o simulador de testes (nunca em produção). */
  ambienteTeste: z.boolean(),
});
export type ResumoCobranca = z.infer<typeof resumoCobranca>;

export const pessoaResumo = z.object({
  id,
  nome: z.string(),
  fotoArquivoId: id.nullable(),
});

export const aulaResumo = z.object({
  id,
  status: statusAula,
  inicio: z.string(),
  fim: z.string(),
  categoria: categoriaCnh,
  valorCentavos: z.number(),
  pontoEncontro: pontoGeo,
  pontoEncontroEndereco: z.string(),
  pontoEncontroReferencia: z.string().nullable(),
  aluno: pessoaResumo,
  instrutor: pessoaResumo,
  aceiteAte: z.string().nullable(),
  avaliada: z.boolean(),
});
export type AulaResumo = z.infer<typeof aulaResumo>;

export const eventoAula = z.object({
  paraStatus: z.string(),
  motivo: z.string().nullable(),
  criadoEm: z.string(),
});

export const aulaDetalhe = aulaResumo.extend({
  pedidoId: id,
  /** Só é enviado ao aluno. */
  codigoCheckin: z.string().nullable(),
  checkinEm: z.string().nullable(),
  checkoutEm: z.string().nullable(),
  checkoutConfirmadoEm: z.string().nullable(),
  canceladaEm: z.string().nullable(),
  motivoCancelamento: z.string().nullable(),
  multaCancelamentoCentavos: z.number(),
  cobranca: resumoCobranca.nullable(),
  historico: z.array(eventoAula),
  veiculo: z
    .object({
      marca: z.string(),
      modelo: z.string(),
      cor: z.string().nullable(),
      cambio: z.string(),
    })
    .nullable(),
  anotacao: z.string().nullable(),
  evolucao: z.array(
    z.object({
      habilidadeId: id,
      habilidade: z.string(),
      nivel: z.number(),
      observacao: z.string().nullable(),
    }),
  ),
});
export type AulaDetalhe = z.infer<typeof aulaDetalhe>;

export const respostaSolicitacao = z.object({ aula: aulaDetalhe });

export const recusarAula = z.object({ motivo: z.string().trim().min(3).max(300) });
export const cancelarAula = z.object({ motivo: z.string().trim().min(3).max(300) });

export const previaCancelamento = z.object({
  gratuito: z.boolean(),
  multaCentavos: z.number(),
  reembolsoCentavos: z.number(),
  gratisAte: z.string(),
});
export type PreviaCancelamento = z.infer<typeof previaCancelamento>;

export const remarcarAula = z.object({ inicio: instante });

export const checkin = z.object({
  codigo: z.string().regex(/^\d{4}$/, 'O código tem 4 dígitos'),
  local: pontoGeo,
});
export type Checkin = z.infer<typeof checkin>;

export const checkout = z.object({ local: pontoGeo });

export const avaliarAula = z.object({
  nota: z.number().int().min(1).max(5),
  comentario: z.string().trim().max(1000).optional(),
});
export type AvaliarAula = z.infer<typeof avaliarAula>;

export const registrarEvolucao = z.object({
  registros: z
    .array(
      z.object({
        habilidadeId: id,
        nivel: z.number().int().min(1).max(5),
        observacao: z.string().trim().max(500).optional(),
      }),
    )
    .max(30),
  anotacao: z.string().trim().max(2000).optional(),
  anotacaoVisivelAluno: z.boolean().default(true),
});
export type RegistrarEvolucao = z.infer<typeof registrarEvolucao>;

export const habilidade = z.object({
  id,
  codigo: z.string(),
  nome: z.string(),
  categorias: z.array(z.string()),
});
export type Habilidade = z.infer<typeof habilidade>;

export const evolucaoAluno = z.object({
  horasAcumuladasMin: z.number(),
  aulasConcluidas: z.number(),
  habilidades: z.array(
    z.object({
      habilidadeId: id,
      nome: z.string(),
      nivelAtual: z.number(),
      historico: z.array(z.object({ nivel: z.number(), data: z.string() })),
    }),
  ),
  anotacoes: z.array(
    z.object({ aulaId: id, data: z.string(), instrutor: z.string(), texto: z.string() }),
  ),
});
export type EvolucaoAluno = z.infer<typeof evolucaoAluno>;

export const recibo = z.object({
  id,
  numero: z.number(),
  pedidoId: id,
  valorCentavos: z.number(),
  emissorNome: z.string(),
  itens: z.array(z.object({ descricao: z.string(), valorCentavos: z.number() })),
  emitidoEm: z.string(),
});
export type Recibo = z.infer<typeof recibo>;
