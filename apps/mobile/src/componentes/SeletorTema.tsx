import { useTema, type PreferenciaTema } from '../tema/TemaProvider';
import { Chip, Linha } from './ui';

const OPCOES: { valor: PreferenciaTema; rotulo: string }[] = [
  { valor: 'sistema', rotulo: 'Automático' },
  { valor: 'claro', rotulo: 'Claro' },
  { valor: 'escuro', rotulo: 'Escuro' },
];

export function SeletorTema() {
  const { preferencia, definirPreferencia } = useTema();
  return (
    <Linha style={{ flexWrap: 'wrap' }}>
      {OPCOES.map((o) => (
        <Chip key={o.valor} rotulo={o.rotulo} selecionado={preferencia === o.valor} aoPressionar={() => definirPreferencia(o.valor)} />
      ))}
    </Linha>
  );
}
