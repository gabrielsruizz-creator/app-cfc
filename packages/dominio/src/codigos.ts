import { randomInt } from 'node:crypto';

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem 0/O e 1/I para evitar confusão

/** Código curto e legível de pedido, ex.: PD-7K3Q9X. */
export function gerarCodigoPedido(): string {
  let s = '';
  for (let i = 0; i < 6; i++) s += ALFABETO[randomInt(ALFABETO.length)];
  return `PD-${s}`;
}

/** Código de 4 dígitos que o aluno mostra ao instrutor no check-in. */
export function gerarCodigoCheckin(): string {
  return String(randomInt(0, 10000)).padStart(4, '0');
}
