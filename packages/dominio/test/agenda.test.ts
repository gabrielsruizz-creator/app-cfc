import { describe, expect, it } from 'vitest';
import { calcularHorariosLivres, distanciaMetros } from '../src';

const base = {
  data: '2026-10-12', // segunda-feira
  fusoHorario: 'America/Sao_Paulo',
  faixas: [{ diaSemana: 1, horaInicio: '08:00', horaFim: '12:00' }],
  duracaoMin: 50,
  intervaloMin: 10,
  ocupados: [],
  bloqueios: [],
  agora: new Date('2026-10-01T00:00:00Z'),
  antecedenciaMinimaH: 2,
};

const horas = (slots: { inicio: Date }[]) =>
  slots.map((s) =>
    s.inicio.toLocaleTimeString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      minute: '2-digit',
    }),
  );

describe('horários livres', () => {
  it('divide a jornada em aulas de 50 min com 10 min de intervalo', () => {
    expect(horas(calcularHorariosLivres(base))).toEqual(['08:00', '09:00', '10:00', '11:00']);
  });

  it('respeita o fuso do instrutor', () => {
    const [primeiro] = calcularHorariosLivres(base);
    expect(primeiro!.inicio.toISOString()).toBe('2026-10-12T11:00:00.000Z');
  });

  it('remove horários que conflitam com aulas (considerando o intervalo) e bloqueios', () => {
    const slots = calcularHorariosLivres({
      ...base,
      ocupados: [
        { inicio: new Date('2026-10-12T12:05:00Z'), fim: new Date('2026-10-12T12:55:00Z') },
      ],
      bloqueios: [
        { inicio: new Date('2026-10-12T14:00:00Z'), fim: new Date('2026-10-12T15:00:00Z') },
      ],
    });
    // 09:05–09:55 ocupado (+10 min de intervalo) derruba 09:00 e 10:00; o bloqueio das 11:00 derruba 11:00
    expect(horas(slots)).toEqual(['08:00']);
  });

  it('não oferece horários antes da antecedência mínima', () => {
    const slots = calcularHorariosLivres({ ...base, agora: new Date('2026-10-12T10:30:00Z') });
    expect(horas(slots)).toEqual(['10:00', '11:00']);
  });

  it('dia sem jornada não tem horários', () => {
    expect(calcularHorariosLivres({ ...base, data: '2026-10-11' })).toEqual([]);
  });
});

describe('distância', () => {
  it('calcula distância aproximada em metros', () => {
    const d = distanciaMetros({ lat: -23.5505, lng: -46.6333 }, { lat: -23.5595, lng: -46.6333 });
    expect(d).toBeGreaterThan(990);
    expect(d).toBeLessThan(1010);
  });
});
