import type { StatusAula as Status } from '@volante/contracts';
import { useTema } from '../tema/TemaProvider';
import { NOMES_STATUS_AULA } from '../util/formatos';
import { Selo } from './ui';

export function StatusAula({ status }: { status: Status | string }) {
  const { cores } = useTema();
  const verde = ['confirmada', 'concluida', 'em_andamento', 'a_caminho'];
  const amarelo = ['aguardando_pagamento', 'solicitada', 'aguardando_confirmacao'];
  const [cor, fundo] = verde.includes(status)
    ? [cores.sucesso, cores.sucessoSuave]
    : amarelo.includes(status)
      ? [cores.alerta, cores.alertaSuave]
      : [cores.textoSuave, cores.superficieAlt];
  return <Selo texto={NOMES_STATUS_AULA[status] ?? status} cor={cor} fundo={fundo} />;
}
