import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Aviso,
  Botao,
  Campo,
  Cartao,
  Carregando,
  Coluna,
  Interruptor,
  Linha,
  Tela,
  Texto,
} from '../../src/componentes/ui';
import { api, mensagemDeErro } from '../../src/servicos/api';

type Faixa = { diaSemana: number; horaInicio: string; horaFim: string };
const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

const mascararHora = (v: string) =>
  v
    .replace(/\D/g, '')
    .slice(0, 4)
    .replace(/(\d{2})(\d)/, '$1:$2');

export default function Jornada() {
  const queryClient = useQueryClient();
  const q = useQuery({
    queryKey: ['instrutor', 'jornada'],
    queryFn: () => api<{ faixas: Faixa[] }>('/instrutor/jornada'),
  });
  const [dias, setDias] = useState<Record<number, { ativo: boolean; inicio: string; fim: string }>>(
    {},
  );
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!q.data) return;
    const inicial: typeof dias = {};
    for (let d = 0; d < 7; d++) {
      const f = q.data.faixas.find((x) => x.diaSemana === d);
      inicial[d] = { ativo: !!f, inicio: f?.horaInicio ?? '08:00', fim: f?.horaFim ?? '18:00' };
    }
    setDias(inicial);
  }, [q.data]);

  async function salvar() {
    setErro(null);
    setSalvando(true);
    try {
      const faixas = Object.entries(dias)
        .filter(([, v]) => v.ativo)
        .map(([d, v]) => ({ diaSemana: Number(d), horaInicio: v.inicio, horaFim: v.fim }));
      await api('/instrutor/jornada', { metodo: 'PUT', corpo: { faixas } });
      await queryClient.invalidateQueries({ queryKey: ['instrutor'] });
      router.back();
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setSalvando(false);
    }
  }

  if (q.isLoading || !Object.keys(dias).length) return <Carregando />;
  return (
    <Tela>
      <Texto tipo="suave">
        Defina os dias e horários em que você atende. Os alunos só veem horários livres dentro da
        jornada.
      </Texto>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {DIAS.map((nome, d) => {
        const v = dias[d]!;
        const mudar = (x: Partial<typeof v>) => setDias({ ...dias, [d]: { ...v, ...x } });
        return (
          <Cartao key={d}>
            <Interruptor rotulo={nome} ligado={v.ativo} aoMudar={(ativo) => mudar({ ativo })} />
            {v.ativo && (
              <Linha>
                <Coluna style={{ flex: 1 }}>
                  <Campo
                    rotulo="Início"
                    value={v.inicio}
                    onChangeText={(t) => mudar({ inicio: mascararHora(t) })}
                    keyboardType="number-pad"
                  />
                </Coluna>
                <Coluna style={{ flex: 1 }}>
                  <Campo
                    rotulo="Fim"
                    value={v.fim}
                    onChangeText={(t) => mudar({ fim: mascararHora(t) })}
                    keyboardType="number-pad"
                  />
                </Coluna>
              </Linha>
            )}
          </Cartao>
        );
      })}
      <Botao titulo="Salvar jornada" carregando={salvando} aoPressionar={salvar} />
      <Botao
        titulo="Folgas e férias"
        variante="texto"
        aoPressionar={() => router.push('/area-instrutor/bloqueios')}
      />
    </Tela>
  );
}
