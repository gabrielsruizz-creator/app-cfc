export { formatarCentavos } from '@volante/contracts';

const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const doisDigitos = (n: number) => String(n).padStart(2, '0');

export function hora(iso: string | Date) {
  const d = new Date(iso);
  return `${doisDigitos(d.getHours())}:${doisDigitos(d.getMinutes())}`;
}

export function dataCurta(iso: string | Date) {
  const d = new Date(iso);
  return `${DIAS[d.getDay()]}, ${d.getDate()} ${MESES[d.getMonth()]}`;
}

export function dataHora(iso: string | Date) {
  return `${dataCurta(iso)} · ${hora(iso)}`;
}

/** "AAAA-MM-DD" → objeto para chips do calendário (a data é tratada como local). */
export function partesData(data: string) {
  const [a, m, d] = data.split('-').map(Number);
  const dt = new Date(a!, m! - 1, d!);
  return { semana: DIAS[dt.getDay()]!, dia: d!, mes: MESES[dt.getMonth()]! };
}

export function mascararCpf(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

export function mascararTelefone(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 10) return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2');
  return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2');
}

export function mascararData(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 8);
  return d.replace(/(\d{2})(\d)/, '$1/$2').replace(/(\d{2})(\d)/, '$1/$2');
}

/** "DD/MM/AAAA" → "AAAA-MM-DD" (ou undefined se incompleta). */
export function dataBrParaIso(v: string): string | undefined {
  const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : undefined;
}

export const NOMES_STATUS_AULA: Record<string, string> = {
  aguardando_pagamento: 'Aguardando pagamento',
  solicitada: 'Aguardando o instrutor',
  confirmada: 'Confirmada',
  a_caminho: 'Instrutor a caminho',
  em_andamento: 'Em andamento',
  aguardando_confirmacao: 'Confirme o fim da aula',
  concluida: 'Concluída',
  recusada: 'Recusada',
  expirada: 'Expirada',
  cancelada: 'Cancelada',
  nao_compareceu_aluno: 'Aluno não compareceu',
  nao_compareceu_instrutor: 'Instrutor não compareceu',
};

/** 125 → "2h05"; 50 → "50 min". */
export function duracao(minutos: number) {
  if (minutos < 60) return `${minutos} min`;
  return `${Math.floor(minutos / 60)}h${doisDigitos(minutos % 60)}`;
}
