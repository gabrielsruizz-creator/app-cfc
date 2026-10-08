import { describe, expect, it } from 'vitest';
import { cadastroUsuario, cnpjValido, cpfValido, formatarCentavos, telefone } from '../src';

describe('validações comuns', () => {
  it('valida CPF pelos dígitos verificadores', () => {
    expect(cpfValido('529.982.247-25')).toBe(true);
    expect(cpfValido('52998224725')).toBe(true);
    expect(cpfValido('529.982.247-24')).toBe(false);
    expect(cpfValido('111.111.111-11')).toBe(false);
  });

  it('valida CNPJ pelos dígitos verificadores', () => {
    expect(cnpjValido('11.222.333/0001-81')).toBe(true);
    expect(cnpjValido('11.222.333/0001-80')).toBe(false);
  });

  it('normaliza telefone para E.164', () => {
    expect(telefone.parse('(11) 98888-7777')).toBe('+5511988887777');
    expect(telefone.parse('+55 11 98888-7777')).toBe('+5511988887777');
    expect(telefone.safeParse('123').success).toBe(false);
  });

  it('formata centavos em reais', () => {
    expect(formatarCentavos(12350).replace(/\s/g, ' ')).toBe('R$ 123,50');
  });

  it('exige aceite de termos no cadastro', () => {
    const base = {
      nome: 'Maria Souza',
      cpf: '529.982.247-25',
      email: 'Maria@Exemplo.com',
      telefone: '11988887777',
      senha: 'segredo123',
      aceitouTermos: true,
      aceitouPrivacidade: true,
    };
    const ok = cadastroUsuario.parse(base);
    expect(ok.cpf).toBe('52998224725');
    expect(ok.email).toBe('maria@exemplo.com');
    expect(cadastroUsuario.safeParse({ ...base, aceitouTermos: false }).success).toBe(false);
  });
});
