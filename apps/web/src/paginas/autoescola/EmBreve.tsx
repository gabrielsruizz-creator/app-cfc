import { useParams } from 'react-router-dom';

const TITULOS: Record<string, string> = {
  'novos-alunos': 'Novos alunos do app',
  alunos: 'Alunos',
  agenda: 'Agenda geral',
  instrutores: 'Instrutores vinculados',
  pacotes: 'Pacotes',
  vitrine: 'Vitrine',
  financeiro: 'Financeiro',
};

export function EmBreve() {
  const { secao = '' } = useParams();
  return (
    <div className="coluna">
      <h1>{TITULOS[secao] ?? 'Em breve'}</h1>
      <div className="cartao">
        <p>
          Esta área faz parte da Fase 2 (fila de novos alunos, pacotes, vitrine, agenda e financeiro
          da autoescola).
        </p>
      </div>
    </div>
  );
}
