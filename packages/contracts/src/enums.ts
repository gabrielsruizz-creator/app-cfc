import { z } from 'zod';

/** Categorias da CNH que um aluno pode buscar e um instrutor pode ensinar. */
export const CATEGORIAS_CNH = ['A', 'B', 'AB', 'C', 'D', 'E', 'AC', 'AD', 'AE', 'ACC'] as const;
export const categoriaCnh = z.enum(CATEGORIAS_CNH);
export type CategoriaCnh = z.infer<typeof categoriaCnh>;

export const GENEROS = ['feminino', 'masculino', 'outro', 'prefiro_nao_informar'] as const;
export const genero = z.enum(GENEROS);
export type Genero = z.infer<typeof genero>;

export const CAMBIOS = ['manual', 'automatico'] as const;
export const cambio = z.enum(CAMBIOS);
export type Cambio = z.infer<typeof cambio>;

export const STATUS_USUARIO = ['ativo', 'bloqueado', 'excluido'] as const;
export type StatusUsuario = (typeof STATUS_USUARIO)[number];

export const STATUS_INSTRUTOR = [
  'rascunho',
  'em_analise',
  'aprovado',
  'reprovado',
  'suspenso_documento',
  'bloqueado',
] as const;
export const statusInstrutor = z.enum(STATUS_INSTRUTOR);
export type StatusInstrutor = z.infer<typeof statusInstrutor>;

export const STATUS_AUTOESCOLA = [
  'rascunho',
  'em_analise',
  'aprovada',
  'reprovada',
  'suspensa',
] as const;
export const statusAutoescola = z.enum(STATUS_AUTOESCOLA);
export type StatusAutoescola = z.infer<typeof statusAutoescola>;

export const TIPOS_DOCUMENTO_INSTRUTOR = [
  'cnh',
  'credencial_detran',
  'documento_veiculo',
  'comprovante_residencia',
  'selfie',
] as const;
export const tipoDocumentoInstrutor = z.enum(TIPOS_DOCUMENTO_INSTRUTOR);
export type TipoDocumentoInstrutor = z.infer<typeof tipoDocumentoInstrutor>;

/** Documentos cuja validade é obrigatória e monitorada. */
export const DOCUMENTOS_COM_VALIDADE: readonly TipoDocumentoInstrutor[] = [
  'cnh',
  'credencial_detran',
  'documento_veiculo',
];

export const TIPOS_DOCUMENTO_AUTOESCOLA = [
  'contrato_social',
  'cartao_cnpj',
  'credenciamento_detran',
  'alvara',
] as const;
export const tipoDocumentoAutoescola = z.enum(TIPOS_DOCUMENTO_AUTOESCOLA);
export type TipoDocumentoAutoescola = z.infer<typeof tipoDocumentoAutoescola>;

export const STATUS_DOCUMENTO = [
  'pendente',
  'aprovado',
  'reprovado',
  'vencido',
  'substituido',
] as const;
export type StatusDocumento = (typeof STATUS_DOCUMENTO)[number];

export const STATUS_AULA = [
  'aguardando_pagamento',
  'solicitada',
  'confirmada',
  'a_caminho',
  'em_andamento',
  'aguardando_confirmacao',
  'concluida',
  'recusada',
  'expirada',
  'cancelada',
  'nao_compareceu_aluno',
  'nao_compareceu_instrutor',
] as const;
export const statusAula = z.enum(STATUS_AULA);
export type StatusAula = z.infer<typeof statusAula>;

/** Status em que a aula ocupa o horário do instrutor e do aluno. */
export const STATUS_AULA_OCUPA_AGENDA: readonly StatusAula[] = [
  'aguardando_pagamento',
  'solicitada',
  'confirmada',
  'a_caminho',
  'em_andamento',
];

export const STATUS_PEDIDO = [
  'aguardando_pagamento',
  'pago',
  'cancelado',
  'estornado',
  'encerrado',
] as const;
export type StatusPedido = (typeof STATUS_PEDIDO)[number];

export const STATUS_ATENDIMENTO = [
  'novo',
  'em_contato',
  'confirmado',
  'recusado',
  'expirado',
] as const;
export type StatusAtendimento = (typeof STATUS_ATENDIMENTO)[number];

export const STATUS_COBRANCA = [
  'pendente_envio',
  'aguardando_pagamento',
  'paga',
  'expirada',
  'falhou',
  'estornada',
  'estornada_parcial',
  'pendente_configuracao',
] as const;
export const statusCobranca = z.enum(STATUS_COBRANCA);
export type StatusCobranca = z.infer<typeof statusCobranca>;

export const GATEWAYS = ['asaas', 'pagarme', 'mercadopago', 'simulado', 'nao_configurado'] as const;
export type Gateway = (typeof GATEWAYS)[number];

export const METODOS_PAGAMENTO = ['pix', 'cartao'] as const;
export const metodoPagamento = z.enum(METODOS_PAGAMENTO);

export const PAPEIS_AUTOESCOLA = ['dono', 'gerente', 'atendente', 'financeiro'] as const;
export const papelAutoescola = z.enum(PAPEIS_AUTOESCOLA);
export type PapelAutoescola = z.infer<typeof papelAutoescola>;

export const FINALIDADES_ARQUIVO = [
  'selfie',
  'documento',
  'foto_perfil',
  'foto_veiculo',
  'foto_autoescola',
  'logo',
  'recibo',
] as const;
export const finalidadeArquivo = z.enum(FINALIDADES_ARQUIVO);
export type FinalidadeArquivo = z.infer<typeof finalidadeArquivo>;

/** Finalidades cujo arquivo pode ser servido publicamente (perfil, vitrine). */
export const FINALIDADES_PUBLICAS: readonly FinalidadeArquivo[] = [
  'foto_perfil',
  'foto_veiculo',
  'foto_autoescola',
  'logo',
];

export const TIPOS_DOCUMENTO_LEGAL = [
  'termos_uso',
  'politica_privacidade',
  'termo_instrutor',
  'termo_autoescola',
] as const;
export const tipoDocumentoLegal = z.enum(TIPOS_DOCUMENTO_LEGAL);
export type TipoDocumentoLegal = z.infer<typeof tipoDocumentoLegal>;

export const FINALIDADES_CONSENTIMENTO = [
  'termos_uso',
  'politica_privacidade',
  'termo_instrutor',
  'termo_autoescola',
  'marketing',
  'compartilhar_localizacao',
] as const;
export const finalidadeConsentimento = z.enum(FINALIDADES_CONSENTIMENTO);
export type FinalidadeConsentimento = z.infer<typeof finalidadeConsentimento>;

export const MODOS = ['aluno', 'instrutor', 'autoescola', 'admin'] as const;
export type Modo = (typeof MODOS)[number];

export const TIPOS_REGISTRO_EXTERNO = [
  'aluno',
  'pedido',
  'matricula',
  'instrutor',
  'aula',
] as const;
export type TipoRegistroExterno = (typeof TIPOS_REGISTRO_EXTERNO)[number];

export const SISTEMAS_EXTERNOS = ['cfc_plus'] as const;
export type SistemaExterno = (typeof SISTEMAS_EXTERNOS)[number];

// ---------- Fase 2 ----------

export const STATUS_VINCULO = ['convidado', 'ativo', 'recusado', 'encerrado'] as const;
export type StatusVinculo = (typeof STATUS_VINCULO)[number];

export const TIPOS_CHAVE_PIX = ['cpf', 'cnpj', 'email', 'telefone', 'aleatoria'] as const;
export const tipoChavePix = z.enum(TIPOS_CHAVE_PIX);
export type TipoChavePix = z.infer<typeof tipoChavePix>;

export const STATUS_SAQUE = [
  'solicitado',
  'pendente_configuracao',
  'processando',
  'concluido',
  'falhou',
] as const;
export type StatusSaque = (typeof STATUS_SAQUE)[number];

export const ALVOS_DENUNCIA = ['instrutor', 'autoescola', 'aluno', 'avaliacao'] as const;
export const alvoDenuncia = z.enum(ALVOS_DENUNCIA);
export const STATUS_DENUNCIA = ['aberta', 'em_analise', 'resolvida', 'descartada'] as const;

export const STATUS_DISPUTA = ['aberta', 'resolvida'] as const;
export const DECISOES_DISPUTA = ['estorno_total', 'estorno_parcial', 'negada'] as const;
export const decisaoDisputa = z.enum(DECISOES_DISPUTA);
