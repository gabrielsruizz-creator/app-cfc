import type { AulaResumo, PerfilInstrutorProprio } from '@volante/contracts';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { CartaoAula } from '../../src/componentes/CartaoAula';
import { Aviso, Botao, Cartao, Carregando, Coluna, Interruptor, Tela, Texto, Vazio } from '../../src/componentes/ui';
import { api, mensagemDeErro } from '../../src/servicos/api';
import { dataCurta } from '../../src/util/formatos';

const STATUS_CADASTRO: Record<string, { tipo: 'info' | 'alerta' | 'erro'; texto: string }> = {
  rascunho: { tipo: 'alerta', texto: 'Seu cadastro ainda não foi enviado para análise.' },
  em_analise: { tipo: 'info', texto: 'Seu cadastro está em análise. Avisaremos assim que for aprovado.' },
  reprovado: { tipo: 'erro', texto: 'Seu cadastro precisa de ajustes.' },
  suspenso_documento: { tipo: 'erro', texto: 'Um documento venceu. Envie a versão atualizada para voltar a receber aulas.' },
  bloqueado: { tipo: 'erro', texto: 'Sua conta de instrutor está bloqueada. Fale com o suporte.' },
};

export default function Agenda() {
  const [erro, setErro] = useState<string | null>(null);
  const perfil = useQuery({ queryKey: ['instrutor', 'perfil'], queryFn: () => api<PerfilInstrutorProprio>('/instrutor/perfil') });
  const aulas = useQuery({ queryKey: ['instrutor', 'aulas'], queryFn: () => api<AulaResumo[]>('/instrutor/aulas') });
  const solicitacoes = useQuery({ queryKey: ['instrutor', 'solicitacoes'], queryFn: () => api<AulaResumo[]>('/instrutor/solicitacoes') });

  if (perfil.isLoading) return <Carregando />;
  const p = perfil.data;
  const status = p ? STATUS_CADASTRO[p.status] : undefined;
  const proximas = (aulas.data ?? []).filter((a) => a.status !== 'solicitada' && a.status !== 'concluida' && new Date(a.fim) > new Date(Date.now() - 3 * 3600_000));
  const porDia = new Map<string, AulaResumo[]>();
  for (const a of proximas) {
    const chave = dataCurta(a.inicio);
    porDia.set(chave, [...(porDia.get(chave) ?? []), a]);
  }

  async function alternar(v: boolean) {
    setErro(null);
    try {
      await api('/instrutor/disponibilidade', { metodo: 'PUT', corpo: { disponivel: v } });
      await perfil.refetch();
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  }

  return (
    <Tela
      aoAtualizar={() => {
        void perfil.refetch();
        void aulas.refetch();
        void solicitacoes.refetch();
      }}
      atualizando={aulas.isRefetching}
    >
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {status && (
        <Aviso tipo={status.tipo} titulo="Cadastro">
          <Coluna>
            <Texto>{p?.motivoStatus ? `${status.texto} Motivo: ${p.motivoStatus}` : status.texto}</Texto>
            <Botao titulo="Ver cadastro" compacto variante="secundario" aoPressionar={() => router.push('/area-instrutor/cadastro')} />
          </Coluna>
        </Aviso>
      )}
      {p?.status === 'aprovado' && (
        <Cartao>
          <Interruptor
            rotulo={p.disponivel ? 'Disponível para novos alunos' : 'Indisponível'}
            descricao={p.disponivel ? 'Você aparece na busca dos alunos.' : 'Você não aparece na busca.'}
            ligado={p.disponivel}
            aoMudar={alternar}
          />
        </Cartao>
      )}
      {!!solicitacoes.data?.length && (
        <Aviso tipo="alerta" titulo={`${solicitacoes.data.length} solicitação(ões) aguardando resposta`}>
          <Botao titulo="Responder" compacto aoPressionar={() => router.push('/solicitacoes')} />
        </Aviso>
      )}
      <Texto tipo="subtitulo">Próximas aulas</Texto>
      {aulas.isLoading ? (
        <Carregando />
      ) : porDia.size ? (
        [...porDia.entries()].map(([dia, lista]) => (
          <Coluna key={dia}>
            <Texto tipo="rotulo">{dia}</Texto>
            {lista.map((a) => (
              <CartaoAula key={a.id} aula={a} visao="instrutor" aoPressionar={() => router.push(`/area-instrutor/aula/${a.id}`)} />
            ))}
          </Coluna>
        ))
      ) : (
        <Vazio icone="calendar-outline" titulo="Nenhuma aula confirmada" texto="As aulas aceitas aparecem aqui." />
      )}
      <Botao titulo="Minha jornada e folgas" variante="secundario" icone="time" aoPressionar={() => router.push('/area-instrutor/jornada')} />
    </Tela>
  );
}
