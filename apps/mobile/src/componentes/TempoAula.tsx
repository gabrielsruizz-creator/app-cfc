import type { AulaDetalhe } from '@volante/contracts';
import { duracao, hora } from '../util/formatos';
import { Cartao, Linha, Texto } from './ui';

/** Duração real (check-in → check-out) ao lado da agendada, depois do check-out. */
export function TempoAula({
  aula,
}: {
  aula: Pick<AulaDetalhe, 'inicio' | 'fim' | 'checkinEm' | 'checkoutEm'>;
}) {
  if (!aula.checkinEm || !aula.checkoutEm) return null;
  const agendados = Math.round((Date.parse(aula.fim) - Date.parse(aula.inicio)) / 60_000);
  const reais = Math.max(
    0,
    Math.round((Date.parse(aula.checkoutEm) - Date.parse(aula.checkinEm)) / 60_000),
  );
  return (
    <Cartao>
      <Linha style={{ justifyContent: 'space-between' }}>
        <Texto tipo="subtitulo">Tempo de aula</Texto>
        <Texto negrito>{duracao(reais)}</Texto>
      </Linha>
      <Texto tipo="suave">
        Check-in {hora(aula.checkinEm)} · check-out {hora(aula.checkoutEm)} · agendada{' '}
        {duracao(agendados)}
      </Texto>
      <Texto tipo="pequeno">
        Entram na carga horária {duracao(Math.min(reais, agendados))}
        {reais > agendados ? ' (o tempo além do agendado não conta)' : ''}.
      </Texto>
    </Cartao>
  );
}
