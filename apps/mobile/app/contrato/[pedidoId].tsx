import type { ContratoPedido } from '@volante/contracts';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { TextoContratoView } from '../../src/componentes/Contrato';
import {
  Aviso,
  Botao,
  Cartao,
  Carregando,
  Coluna,
  Divisor,
  Tela,
  Texto,
  Vazio,
} from '../../src/componentes/ui';
import { api, mensagemDeErro } from '../../src/servicos/api';
import { dataHora } from '../../src/util/formatos';

const STATUS_ENVIO: Record<string, string> = {
  enviado: 'enviado',
  pendente_configuracao: 'aguardando configuração do e-mail',
  erro: 'falhou',
};

/** Contrato de uma compra: texto exato, registro dos aceites, cópias por e-mail. */
export default function ContratoTela() {
  const { pedidoId, como } = useLocalSearchParams<{ pedidoId: string; como?: string }>();
  const base = como === 'instrutor' ? 'instrutor' : 'aluno';
  const [msg, setMsg] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const q = useQuery({
    queryKey: ['contrato', base, pedidoId],
    queryFn: () => api<ContratoPedido>(`/${base}/contratos/${pedidoId}`),
  });
  if (q.isLoading) return <Carregando />;
  if (!q.data)
    return (
      <Vazio
        icone="document-text-outline"
        titulo="Contrato não encontrado"
        texto={
          q.error
            ? mensagemDeErro(q.error)
            : 'Compras antigas, feitas antes dos contratos, não têm contrato.'
        }
      />
    );
  const c = q.data;

  async function reenviar() {
    setMsg(null);
    setEnviando(true);
    try {
      await api(`/${base}/contratos/${pedidoId}/reenviar`, { corpo: {} });
      setMsg({
        tipo: 'sucesso',
        texto: 'Pronto! Uma nova cópia vai chegar no seu e-mail em instantes.',
      });
      setTimeout(() => void q.refetch(), 4000);
    } catch (e) {
      setMsg({ tipo: 'erro', texto: mensagemDeErro(e) });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Tela aoAtualizar={() => void q.refetch()} atualizando={q.isRefetching}>
      <Cartao>
        <TextoContratoView corpoMd={c.corpoMd} />
      </Cartao>

      <Cartao>
        <Texto tipo="subtitulo">Registro dos aceites</Texto>
        {c.aceites.map((a, i) => (
          <Coluna key={a.parte} gap={2}>
            {i > 0 && <Divisor />}
            <Texto negrito>
              {a.parte === 'contratante' ? 'Contratante' : 'Contratado'}: {a.nome}
              {a.documento ? ` (${a.documento})` : ''}
            </Texto>
            <Texto tipo="suave">
              {a.forma === 'clique' ? 'Aceitou no app' : 'Aderiu pela oferta publicada'} em{' '}
              {dataHora(a.aceitoEm)}
              {a.dispositivo ? ` · ${a.dispositivo}` : ''}
              {a.ip ? ` · IP ${a.ip}` : ''}
            </Texto>
            {a.detalhe && <Texto tipo="pequeno">{a.detalhe}</Texto>}
          </Coluna>
        ))}
        <Texto tipo="pequeno">
          Pedido {c.pedidoCodigo} · modelo v{c.versao} · impressão digital (SHA-256): {c.hash}
        </Texto>
      </Cartao>

      <Cartao>
        <Texto tipo="subtitulo">Cópias por e-mail</Texto>
        {c.envios.length ? (
          c.envios.map((e, i) => (
            <Texto key={i} tipo="suave">
              {dataHora(e.criadoEm)} · {e.parte === 'contratante' ? 'contratante' : 'contratado'} ·{' '}
              {e.para} · {STATUS_ENVIO[e.status] ?? e.status}
            </Texto>
          ))
        ) : (
          <Texto tipo="suave">As cópias são enviadas quando o pagamento é confirmado.</Texto>
        )}
        {msg && <Aviso tipo={msg.tipo}>{msg.texto}</Aviso>}
        <Botao
          titulo="Enviar uma cópia para meu e-mail"
          icone="mail"
          variante="secundario"
          carregando={enviando}
          aoPressionar={reenviar}
        />
      </Cartao>
    </Tela>
  );
}
