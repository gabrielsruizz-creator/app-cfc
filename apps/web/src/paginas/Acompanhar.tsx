import type { AcompanhamentoPublico } from '@volante/contracts';
import { useQuery } from '@tanstack/react-query';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { api, dataHora, ErroApi } from '../api';
import { Aviso, Carregando } from '../componentes/comum';

const NOMES_STATUS: Record<string, string> = {
  solicitada: 'Aguardando o instrutor confirmar',
  confirmada: 'Aula confirmada',
  a_caminho: 'Instrutor a caminho',
  em_andamento: 'Aula em andamento',
  aguardando_confirmacao: 'Aula finalizada',
  concluida: 'Aula concluída',
  cancelada: 'Aula cancelada',
};

const cor = (variavel: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(variavel).trim() || '#0a8f86';

function Mapa({ dados }: { dados: AcompanhamentoPublico }) {
  const elemento = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);
  const instrutor = useRef<L.CircleMarker | null>(null);

  useEffect(() => {
    if (!elemento.current || mapa.current) return;
    const m = L.map(elemento.current, { zoomControl: true, attributionControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; colaboradores do OpenStreetMap',
    }).addTo(m);
    L.circleMarker([dados.pontoEncontro.lat, dados.pontoEncontro.lng], {
      radius: 9,
      color: cor('--superficie'),
      weight: 2,
      fillColor: cor('--destaque'),
      fillOpacity: 1,
    })
      .bindTooltip('Ponto de encontro')
      .addTo(m);
    m.setView([dados.pontoEncontro.lat, dados.pontoEncontro.lng], 15);
    mapa.current = m;
    return () => {
      m.remove();
      mapa.current = null;
      instrutor.current = null;
    };
    // o mapa é criado uma vez; as posições são atualizadas no efeito abaixo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = mapa.current;
    if (!m || !dados.posicao) return;
    const p: L.LatLngExpression = [dados.posicao.lat, dados.posicao.lng];
    if (!instrutor.current) {
      instrutor.current = L.circleMarker(p, {
        radius: 10,
        color: cor('--superficie'),
        weight: 3,
        fillColor: cor('--serie-1'),
        fillOpacity: 1,
      })
        .bindTooltip('Instrutor')
        .addTo(m);
      m.fitBounds(
        L.latLngBounds([p, [dados.pontoEncontro.lat, dados.pontoEncontro.lng]]).pad(0.3),
        { maxZoom: 16 },
      );
    } else {
      instrutor.current.setLatLng(p);
    }
  }, [dados.posicao, dados.pontoEncontro]);

  return (
    <div
      ref={elemento}
      role="img"
      aria-label="Mapa com a posição do instrutor e o ponto de encontro"
      style={{
        height: 360,
        borderRadius: 12,
        overflow: 'hidden',
        border: '1px solid var(--borda)',
      }}
    />
  );
}

/** Página pública que o contato de confiança abre pelo link compartilhado pelo aluno. */
export function Acompanhar() {
  const { token } = useParams<{ token: string }>();
  const q = useQuery({
    queryKey: ['acompanhar', token],
    queryFn: () => api<AcompanhamentoPublico>(`/publico/acompanhar/${token}`),
    refetchInterval: (c) => (c.state.error ? false : 10_000),
    retry: false,
  });

  const conteudo = () => {
    if (q.isLoading) return <Carregando />;
    if (q.error) {
      const expirado = q.error instanceof ErroApi && q.error.status === 404;
      return (
        <Aviso tipo="erro">
          {expirado
            ? 'Este link não está mais disponível: ele expirou ou foi desativado por quem compartilhou.'
            : 'Não foi possível carregar agora. Tente de novo em instantes.'}
        </Aviso>
      );
    }
    const d = q.data!;
    const rastreando = d.status === 'a_caminho' || d.status === 'em_andamento';
    return (
      <>
        <div>
          <h1 style={{ marginBottom: 4 }}>Aula de {d.alunoPrimeiroNome}</h1>
          <span className="selo azul">{NOMES_STATUS[d.status] ?? d.status}</span>
        </div>
        {d.status === 'a_caminho' && d.chegadaEstimadaMin !== null && (
          <Aviso>
            Chegada estimada em cerca de <strong>{d.chegadaEstimadaMin} min</strong>
            {d.distanciaMetros !== null &&
              ` (${(d.distanciaMetros / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km)`}
            .
          </Aviso>
        )}
        <Mapa dados={d} />
        <div className="linha pequeno suave" aria-hidden="true">
          <span className="linha" style={{ gap: 6 }}>
            <span
              style={{
                width: 12,
                height: 12,
                borderRadius: 6,
                background: 'var(--serie-1)',
                display: 'inline-block',
              }}
            />
            Instrutor
          </span>
          <span className="linha" style={{ gap: 6 }}>
            <span
              style={{
                width: 12,
                height: 12,
                borderRadius: 6,
                background: 'var(--destaque)',
                display: 'inline-block',
              }}
            />
            Ponto de encontro
          </span>
          {d.posicao && <span>Posição de {dataHora(d.posicao.registradoEm)}</span>}
        </div>
        {!rastreando && (
          <p className="suave pequeno">
            A posição do instrutor aparece quando ele avisar que está a caminho e some no fim da
            aula.
          </p>
        )}
        <div className="cartao">
          <table>
            <tbody>
              <tr>
                <th>Instrutor</th>
                <td>{d.instrutorNome}</td>
              </tr>
              {d.veiculo && (
                <tr>
                  <th>Veículo</th>
                  <td>
                    {d.veiculo.modelo}
                    {d.veiculo.cor ? ` · ${d.veiculo.cor}` : ''} · placa{' '}
                    <strong>{d.veiculo.placa}</strong>
                  </td>
                </tr>
              )}
              <tr>
                <th>Horário</th>
                <td>
                  {dataHora(d.inicio)} às{' '}
                  {new Date(d.fim).toLocaleTimeString('pt-BR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </td>
              </tr>
              <tr>
                <th>Encontro</th>
                <td>{d.pontoEncontroEndereco}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="suave pequeno">
          Link válido até {dataHora(d.expiraEm)}. Em caso de emergência, ligue 190.
        </p>
      </>
    );
  };

  return (
    <div className="centro-tela" style={{ alignItems: 'flex-start' }}>
      <main className="coluna" style={{ width: '100%', maxWidth: 720 }}>
        <div className="marca" style={{ color: 'var(--primaria)', fontWeight: 800, fontSize: 22 }}>
          Volante
        </div>
        {conteudo()}
      </main>
    </div>
  );
}
