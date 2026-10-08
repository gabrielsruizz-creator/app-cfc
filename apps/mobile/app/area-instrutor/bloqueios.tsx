import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  Aviso,
  Botao,
  BotaoIcone,
  Campo,
  Cartao,
  Carregando,
  Chip,
  Coluna,
  Linha,
  Tela,
  Texto,
  Vazio,
} from '../../src/componentes/ui';
import { api, mensagemDeErro } from '../../src/servicos/api';
import { useTema } from '../../src/tema/TemaProvider';
import { dataBrParaIso, dataCurta, mascararData } from '../../src/util/formatos';

type Bloqueio = {
  id: string;
  inicio: string;
  fim: string;
  tipo: 'bloqueio' | 'ferias';
  motivo: string | null;
};

export default function Bloqueios() {
  const { cores } = useTema();
  const q = useQuery({
    queryKey: ['instrutor', 'bloqueios'],
    queryFn: () => api<Bloqueio[]>('/instrutor/bloqueios'),
  });
  const [inicio, setInicio] = useState('');
  const [fim, setFim] = useState('');
  const [tipo, setTipo] = useState<'bloqueio' | 'ferias'>('bloqueio');
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function adicionar() {
    setErro(null);
    const di = dataBrParaIso(inicio);
    const df = dataBrParaIso(fim || inicio);
    if (!di || !df) return setErro('Informe as datas no formato DD/MM/AAAA.');
    setSalvando(true);
    try {
      const ini = new Date(`${di}T00:00:00`);
      const fi = new Date(`${df}T23:59:59`);
      await api('/instrutor/bloqueios', {
        corpo: {
          inicio: ini.toISOString(),
          fim: fi.toISOString(),
          tipo,
          motivo: motivo || undefined,
        },
      });
      setInicio('');
      setFim('');
      setMotivo('');
      await q.refetch();
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setSalvando(false);
    }
  }

  if (q.isLoading) return <Carregando />;
  return (
    <Tela>
      <Cartao>
        <Texto tipo="subtitulo">Novo bloqueio</Texto>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        <Linha>
          <Chip
            rotulo="Folga"
            selecionado={tipo === 'bloqueio'}
            aoPressionar={() => setTipo('bloqueio')}
          />
          <Chip
            rotulo="Férias"
            selecionado={tipo === 'ferias'}
            aoPressionar={() => setTipo('ferias')}
          />
        </Linha>
        <Linha>
          <Coluna style={{ flex: 1 }}>
            <Campo
              rotulo="De"
              value={inicio}
              onChangeText={(v) => setInicio(mascararData(v))}
              placeholder="DD/MM/AAAA"
              keyboardType="number-pad"
            />
          </Coluna>
          <Coluna style={{ flex: 1 }}>
            <Campo
              rotulo="Até"
              value={fim}
              onChangeText={(v) => setFim(mascararData(v))}
              placeholder="DD/MM/AAAA"
              keyboardType="number-pad"
            />
          </Coluna>
        </Linha>
        <Campo rotulo="Motivo (opcional)" value={motivo} onChangeText={setMotivo} />
        <Botao titulo="Adicionar" compacto carregando={salvando} aoPressionar={adicionar} />
      </Cartao>
      <Texto tipo="subtitulo">Próximos bloqueios</Texto>
      {q.data?.length ? (
        q.data.map((b) => (
          <Cartao key={b.id}>
            <Linha style={{ justifyContent: 'space-between' }}>
              <Coluna gap={2} style={{ flex: 1 }}>
                <Texto negrito>{b.tipo === 'ferias' ? 'Férias' : 'Folga'}</Texto>
                <Texto tipo="suave">
                  {dataCurta(b.inicio)} até {dataCurta(b.fim)}
                </Texto>
                {b.motivo && <Texto tipo="pequeno">{b.motivo}</Texto>}
              </Coluna>
              <BotaoIcone
                icone="trash"
                rotulo="Remover bloqueio"
                cor={cores.erro}
                aoPressionar={async () => {
                  await api(`/instrutor/bloqueios/${b.id}`, { metodo: 'DELETE' });
                  await q.refetch();
                }}
              />
            </Linha>
          </Cartao>
        ))
      ) : (
        <Vazio icone="sunny-outline" titulo="Nenhum bloqueio" />
      )}
    </Tela>
  );
}
