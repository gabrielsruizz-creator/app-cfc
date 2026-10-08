import { z } from 'zod';

export const somenteDigitos = (valor: string) => valor.replace(/\D/g, '');

/** Valida CPF pelos dígitos verificadores. Aceita com ou sem máscara. */
export function cpfValido(valor: string): boolean {
  const cpf = somenteDigitos(valor);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const digito = (base: string, pesoInicial: number) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (pesoInicial - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  const d1 = digito(cpf.slice(0, 9), 10);
  const d2 = digito(cpf.slice(0, 10), 11);
  return d1 === Number(cpf[9]) && d2 === Number(cpf[10]);
}

/** Valida CNPJ pelos dígitos verificadores. Aceita com ou sem máscara. */
export function cnpjValido(valor: string): boolean {
  const cnpj = somenteDigitos(valor);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const digito = (base: string) => {
    const pesos =
      base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = pesos.reduce((acc, peso, i) => acc + Number(base[i]) * peso, 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return digito(cnpj.slice(0, 12)) === Number(cnpj[12]) && digito(cnpj.slice(0, 13)) === Number(cnpj[13]);
}

export const cpf = z
  .string()
  .transform(somenteDigitos)
  .refine(cpfValido, { message: 'CPF inválido' });

export const cnpj = z
  .string()
  .transform(somenteDigitos)
  .refine(cnpjValido, { message: 'CNPJ inválido' });

/** Telefone brasileiro normalizado para E.164 (+55DDDNUMERO). */
export const telefone = z
  .string()
  .transform((v) => {
    const d = somenteDigitos(v);
    return d.startsWith('55') && d.length >= 12 ? `+${d}` : `+55${d}`;
  })
  .refine((v) => /^\+55\d{10,11}$/.test(v), { message: 'Telefone inválido' });

export const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ message: 'E-mail inválido' }));

export const senha = z
  .string()
  .min(8, 'A senha precisa ter pelo menos 8 caracteres')
  .max(128, 'Senha muito longa');

export const id = z.uuid();

/** Valor monetário em centavos (inteiro, nunca negativo). */
export const centavos = z.number().int().nonnegative();

export const pontoGeo = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type PontoGeo = z.infer<typeof pontoGeo>;

/** Data no formato AAAA-MM-DD. */
export const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (use AAAA-MM-DD)');

/** Horário no formato HH:MM. */
export const horaMinuto = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Horário inválido (use HH:MM)');

export const instante = z.iso.datetime({ offset: true });

export const uf = z
  .string()
  .length(2)
  .transform((v) => v.toUpperCase());

/** Formato de erro padrão retornado pela API. */
export const erroApi = z.object({
  codigo: z.string(),
  mensagem: z.string(),
  detalhes: z.unknown().optional(),
});
export type ErroApi = z.infer<typeof erroApi>;

export function formatarCentavos(valor: number): string {
  return (valor / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function mascararCpf(valor: string): string {
  const d = somenteDigitos(valor);
  return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
}
