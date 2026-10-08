import { z } from 'zod';
import { cpf, dataIso, email, id, senha, telefone } from './comum';
import { categoriaCnh, genero, papelAutoescola, statusAutoescola, statusInstrutor } from './enums';

export const cadastroUsuario = z.object({
  nome: z.string().trim().min(3, 'Informe o nome completo').max(120),
  cpf,
  email,
  telefone,
  senha,
  dataNascimento: dataIso.optional(),
  genero: genero.optional(),
  aceitouTermos: z.literal(true, { message: 'É preciso aceitar os termos de uso' }),
  aceitouPrivacidade: z.literal(true, { message: 'É preciso aceitar a política de privacidade' }),
  aceitaMarketing: z.boolean().default(false),
});
export type CadastroUsuario = z.infer<typeof cadastroUsuario>;

export const entrar = z.object({
  /** E-mail ou CPF. */
  login: z.string().trim().min(3),
  senha: z.string().min(1),
  dispositivo: z.string().max(120).optional(),
});
export type Entrar = z.infer<typeof entrar>;

export const renovarSessao = z.object({ refreshToken: z.string().min(10) });

export const tokens = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiraEm: z.string(),
});
export type Tokens = z.infer<typeof tokens>;

export const esqueciSenha = z.object({ email });
export const redefinirSenha = z.object({
  email,
  codigo: z.string().regex(/^\d{6}$/),
  novaSenha: senha,
});

export const vinculoAutoescolaResumo = z.object({
  autoescolaId: id,
  nomeFantasia: z.string(),
  papel: papelAutoescola,
  status: statusAutoescola,
});

export const eu = z.object({
  id,
  nome: z.string(),
  email: z.string(),
  telefone: z.string(),
  cpf: z.string().nullable(),
  genero: genero.nullable(),
  fotoArquivoId: id.nullable(),
  aluno: z
    .object({ id, categoriaDesejada: categoriaCnh, renach: z.string().nullable() })
    .nullable(),
  instrutor: z.object({ id, status: statusInstrutor }).nullable(),
  autoescolas: z.array(vinculoAutoescolaResumo),
  admin: z.object({ nivel: z.string() }).nullable(),
});
export type Eu = z.infer<typeof eu>;

export const respostaSessao = z.object({ tokens, eu });
export type RespostaSessao = z.infer<typeof respostaSessao>;

export const registrarDispositivoPush = z.object({
  expoPushToken: z.string().min(10),
  plataforma: z.enum(['ios', 'android', 'web']),
});
