import { describe, expect, it } from 'vitest';
import { cargaHoraria } from '../src/aulas';

const base = new Date('2026-10-09T11:00:00Z');
const min = (n: number) => new Date(base.getTime() + n * 60_000);

describe('carga horária da aula', () => {
  it('conta o tempo real entre check-in e check-out', () => {
    expect(
      cargaHoraria({ inicio: base, fim: min(50), checkinEm: min(3), checkoutEm: min(48) }),
    ).toEqual({ agendados: 50, realizados: 45, contados: 45 });
  });

  it('não passa da duração agendada quando a aula se estende', () => {
    expect(
      cargaHoraria({ inicio: base, fim: min(50), checkinEm: base, checkoutEm: min(62) }),
    ).toEqual({ agendados: 50, realizados: 62, contados: 50 });
  });

  it('sem check-in ou check-out, vale a duração agendada', () => {
    expect(
      cargaHoraria({ inicio: base, fim: min(50), checkinEm: min(1), checkoutEm: null }),
    ).toEqual({
      agendados: 50,
      realizados: null,
      contados: 50,
    });
  });
});
