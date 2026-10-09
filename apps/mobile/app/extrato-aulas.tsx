import type { ExtratoAulas } from '@volante/contracts';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  Aviso,
  Botao,
  Cartao,
  Carregando,
  Coluna,
  Linha,
  Tela,
  Texto,
  Vazio,
} from '../src/componentes/ui';
import { api, mensagemDeErro } from '../src/servicos/api';
import { compartilharExtrato } from '../src/servicos/extrato-pdf';
import { useTema } from '../src/tema/TemaProvider';
import { dataCurta, duracao, hora } from '../src/util/formatos';

/** Comprovante de carga horária: cada aula concluída com horários reais e o que foi trabalhado. */
export default function ExtratoAulasTela() {
  const { cores } = useTema();
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ['aluno', 'extrato-aulas'],
    queryFn: () => api<ExtratoAulas>('/aluno/extrato-aulas'),
  });
  if (q.isLoading || !q.data) return <Carregando />;
  const e = q.data;

  async function exportar() {
    setErro(null);
    setGerando(true);
    try {
      await compartilharExtrato(e);
    } catch (x) {
      setErro(mensagemDeErro(x));
    } finally {
      setGerando(false);
    }
  }

  return (
    <Tela aoAtualizar={() => void q.refetch()} atualizando={q.isRefetching}>
      <Linha gap={12}>
        <Cartao style={{ flex: 1 }}>
          <Texto tipo="rotulo">Carga horária</Texto>
          <Texto tipo="titulo" cor={cores.primaria}>
            {duracao(e.totais.minutosContados)}
          </Texto>
        </Cartao>
        <Cartao style={{ flex: 1 }}>
          <Texto tipo="rotulo">Aulas concluídas</Texto>
          <Texto tipo="titulo" cor={cores.primaria}>
            {e.totais.aulas}
          </Texto>
        </Cartao>
      </Linha>
      <Texto tipo="pequeno">
        Conta o tempo real de cada aula (do check-in ao check-out), até a duração agendada.
      </Texto>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      <Botao
        titulo="Exportar PDF"
        icone="document-text"
        variante="secundario"
        carregando={gerando}
        desabilitado={!e.aulas.length}
        aoPressionar={exportar}
      />
      {e.aulas.length ? (
        e.aulas.map((a) => (
          <Cartao key={a.aulaId}>
            <Linha style={{ justifyContent: 'space-between' }}>
              <Texto negrito>{dataCurta(a.inicio)}</Texto>
              <Texto negrito>{duracao(a.minutosContados)}</Texto>
            </Linha>
            <Texto tipo="suave">
              Agendada {hora(a.inicio)}–{hora(a.fim)}
              {a.checkinEm && a.checkoutEm
                ? ` · realizada ${hora(a.checkinEm)}–${hora(a.checkoutEm)} (${a.minutosRealizados} min)`
                : ' · sem check-out registrado'}
            </Texto>
            <Texto tipo="pequeno">
              {a.instrutor}
              {a.autoescola ? ` · ${a.autoescola}` : ''} · categoria {a.categoria}
              {a.veiculo ? ` · ${a.veiculo}` : ''}
            </Texto>
            {(a.habilidades.length > 0 || a.anotacao) && (
              <Coluna gap={2}>
                {a.habilidades.length > 0 && (
                  <Texto tipo="pequeno">
                    {a.habilidades.map((h) => `${h.nome} ${h.nivel}/5`).join(' · ')}
                  </Texto>
                )}
                {a.anotacao && <Texto tipo="pequeno">“{a.anotacao}”</Texto>}
              </Coluna>
            )}
          </Cartao>
        ))
      ) : (
        <Vazio
          icone="time-outline"
          titulo="Nenhuma aula concluída ainda"
          texto="Cada aula concluída aparece aqui com o horário real e o que foi trabalhado."
        />
      )}
    </Tela>
  );
}
