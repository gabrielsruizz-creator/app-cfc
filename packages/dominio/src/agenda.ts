import { DateTime } from 'luxon';

export type Intervalo = { inicio: Date; fim: Date };
export type FaixaJornada = { diaSemana: number; horaInicio: string; horaFim: string };

export type ParametrosHorarios = {
  /** Dia no fuso do instrutor (AAAA-MM-DD). */
  data: string;
  fusoHorario: string;
  faixas: FaixaJornada[];
  duracaoMin: number;
  intervaloMin: number;
  ocupados: Intervalo[];
  bloqueios: Intervalo[];
  agora: Date;
  antecedenciaMinimaH: number;
};

const sobrepoe = (a: Intervalo, b: Intervalo) => a.inicio < b.fim && b.inicio < a.fim;

function paraMinutos(hora: string): number {
  const [h, m] = hora.split(':').map(Number);
  return h! * 60 + m!;
}

/**
 * Horários livres de um instrutor num dia: divide cada faixa da jornada em aulas de `duracaoMin`
 * (com `intervaloMin` entre elas) e remove o que conflita com aulas, bloqueios e antecedência mínima.
 */
export function calcularHorariosLivres(p: ParametrosHorarios): Intervalo[] {
  const dia = DateTime.fromISO(p.data, { zone: p.fusoHorario });
  if (!dia.isValid) return [];
  const diaSemana = dia.weekday % 7; // luxon: 1 = segunda … 7 = domingo; aqui 0 = domingo
  const passo = p.duracaoMin + p.intervaloMin;
  const limiteInicial = new Date(p.agora.getTime() + p.antecedenciaMinimaH * 3600_000);

  // Ocupados são "alargados" pelo intervalo para garantir o deslocamento entre aulas.
  const indisponiveis: Intervalo[] = [
    ...p.ocupados.map((o) => ({
      inicio: new Date(o.inicio.getTime() - p.intervaloMin * 60_000),
      fim: new Date(o.fim.getTime() + p.intervaloMin * 60_000),
    })),
    ...p.bloqueios,
  ];

  const livres: Intervalo[] = [];
  const faixas = p.faixas
    .filter((f) => f.diaSemana === diaSemana)
    .sort((a, b) => paraMinutos(a.horaInicio) - paraMinutos(b.horaInicio));

  for (const faixa of faixas) {
    const fimFaixa = paraMinutos(faixa.horaFim);
    for (let m = paraMinutos(faixa.horaInicio); m + p.duracaoMin <= fimFaixa; m += passo) {
      const inicio = dia.set({ hour: Math.floor(m / 60), minute: m % 60, second: 0, millisecond: 0 });
      const slot = {
        inicio: inicio.toJSDate(),
        fim: inicio.plus({ minutes: p.duracaoMin }).toJSDate(),
      };
      if (slot.inicio < limiteInicial) continue;
      if (indisponiveis.some((i) => sobrepoe(slot, i))) continue;
      if (livres.some((l) => l.inicio.getTime() === slot.inicio.getTime())) continue;
      livres.push(slot);
    }
  }
  return livres.sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
}

/** Data local (AAAA-MM-DD) de um instante no fuso informado. */
export function dataLocal(instante: Date, fusoHorario: string): string {
  return DateTime.fromJSDate(instante, { zone: fusoHorario }).toISODate()!;
}

/** Lista as próximas `quantidade` datas locais a partir de hoje no fuso informado. */
export function proximasDatas(agora: Date, fusoHorario: string, quantidade: number): string[] {
  const hoje = DateTime.fromJSDate(agora, { zone: fusoHorario }).startOf('day');
  return Array.from({ length: quantidade }, (_, i) => hoje.plus({ days: i }).toISODate()!);
}

/** Distância em metros entre dois pontos (fórmula de Haversine). */
export function distanciaMetros(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371_000;
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}
