import type { ResumoPedido } from '@volante/contracts';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { PixCobranca } from '../../src/componentes/PixCobranca';
import {
  Aviso,
  Botao,
  Cartao,
  Carregando,
  Campo,
  Coluna,
  Divisor,
  Estrelas,
  Linha,
  Tela,
  Texto,
} from '../../src/componentes/ui';
import { api, mensagemDeErro } from '../../src/servicos/api';
import { abrirConversa, NOMES_ATENDIMENTO } from '../../src/servicos/comercial';
import { useTema } from '../../src/tema/TemaProvider';
import { dataHora, formatarCentavos } from '../../src/util/formatos';

const NOMES_STATUS: Record<string, string> = {
  aguardando_pagamento: 'Aguardando pagamento',
  pago: 'Pago',
  cancelado: 'Cancelado',
  estornado: 'Valor devolvido',
  encerrado: 'Concluído',
};

export default function Pedido() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { cores } = useTema();
  const [erro, setErro] = useState<string | null>(null);
  const [nota, setNota] = useState(0);
  const [comentario, setComentario] = useState('');
  const [enviando, setEnviando] = useState(false);
  const q = useQuery({
    queryKey: ['pedido', id],
    queryFn: () => api<ResumoPedido>(`/aluno/pedidos/${id}`),
    refetchInterval: (c) => (c.state.data?.status === 'aguardando_pagamento' ? 3000 : false),
  });
  if (q.isLoading || !q.data) return <Carregando />;
  const p = q.data;
  const deAutoescola = p.vendedorTipo === 'autoescola';
  const disponiveis = p.credito
    ? p.credito.quantidadeTotal - p.credito.quantidadeReservada - p.credito.quantidadeConsumida
    : 0;

  async function cancelar() {
    setErro(null);
    try {
      await api(`/aluno/pedidos/${p.id}/cancelar`, { metodo: 'POST' });
      await q.refetch();
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  }

  async function avaliar() {
    setErro(null);
    setEnviando(true);
    try {
      await api(`/aluno/pedidos/${p.id}/avaliacao`, {
        corpo: { nota, comentario: comentario || undefined },
      });
      await q.refetch();
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Tela aoAtualizar={() => void q.refetch()} atualizando={q.isRefetching}>
      <Texto tipo="titulo">{p.descricao}</Texto>
      <Texto tipo="suave">
        {p.vendedorNome} · pedido {p.codigo}
      </Texto>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      {p.status === 'aguardando_pagamento' ? (
        <>
          <Texto tipo="subtitulo">
            {p.cobranca?.metodo === 'cartao' ? 'Pague com cartão' : 'Pague com Pix'}
          </Texto>
          <PixCobranca cobranca={p.cobranca} aoSimular={() => void q.refetch()} />
          <Botao titulo="Desistir da compra" variante="texto" aoPressionar={cancelar} />
        </>
      ) : (
        <Cartao>
          <Linha style={{ justifyContent: 'space-between' }}>
            <Texto tipo="rotulo">Situação</Texto>
            <Texto negrito>
              {deAutoescola && p.status === 'pago' && p.statusAtendimento
                ? NOMES_ATENDIMENTO[p.statusAtendimento]
                : (NOMES_STATUS[p.status] ?? p.status)}
            </Texto>
          </Linha>
          <Linha style={{ justifyContent: 'space-between' }}>
            <Texto tipo="rotulo">Valor</Texto>
            <Texto>{formatarCentavos(p.valorTotalCentavos)}</Texto>
          </Linha>
          {p.descontoCentavos > 0 && (
            <Linha style={{ justifyContent: 'space-between' }}>
              <Texto tipo="rotulo">Desconto{p.cupomCodigo ? ` (${p.cupomCodigo})` : ''}</Texto>
              <Texto cor={cores.sucesso}>− {formatarCentavos(p.descontoCentavos)}</Texto>
            </Linha>
          )}
          {p.cobranca?.metodo === 'cartao' && (
            <Linha style={{ justifyContent: 'space-between' }}>
              <Texto tipo="rotulo">Pagamento</Texto>
              <Texto>Cartão{p.cobranca.parcelas > 1 ? ` em ${p.cobranca.parcelas}x` : ''}</Texto>
            </Linha>
          )}
          {p.pagoEm && (
            <Linha style={{ justifyContent: 'space-between' }}>
              <Texto tipo="rotulo">Pago em</Texto>
              <Texto>{dataHora(p.pagoEm)}</Texto>
            </Linha>
          )}
        </Cartao>
      )}

      {deAutoescola &&
        p.status === 'pago' &&
        ['novo', 'em_contato'].includes(p.statusAtendimento ?? '') && (
          <Aviso tipo="info" titulo="Aguardando contato da autoescola">
            {`A ${p.vendedorNome} vai falar com você pelo WhatsApp ou telefone para combinar a matrícula. O valor fica guardado até ela confirmar${p.prazoRespostaEm ? `; se não houver resposta até ${dataHora(p.prazoRespostaEm)}, você recebe tudo de volta` : ''}.`}
          </Aviso>
        )}
      {p.motivoRecusa && (
        <Aviso tipo="alerta" titulo="A autoescola recusou o pedido">
          {`${p.motivoRecusa}. O valor será devolvido para você.`}
        </Aviso>
      )}

      {p.credito && ['ativo', 'esgotado', 'expirado'].includes(p.credito.status) && (
        <Cartao>
          <Texto tipo="rotulo">Saldo do pacote</Texto>
          <Texto tipo="subtitulo" cor={cores.primaria}>
            {disponiveis} de {p.credito.quantidadeTotal} aulas disponíveis
          </Texto>
          {p.credito.validoAte && (
            <Texto tipo="pequeno">Válido até {dataHora(p.credito.validoAte)}</Texto>
          )}
          {p.credito.status === 'ativo' && disponiveis > 0 && (
            <Botao
              titulo="Agendar aula"
              icone="calendar"
              compacto
              aoPressionar={() => router.push('/creditos')}
            />
          )}
        </Cartao>
      )}

      {deAutoescola && p.autoescolaId && p.status !== 'aguardando_pagamento' && (
        <Botao
          titulo="Conversar com a autoescola"
          icone="chatbubbles"
          variante="secundario"
          aoPressionar={() => abrirConversa({ autoescolaId: p.autoescolaId! })}
        />
      )}

      {deAutoescola && p.statusAtendimento === 'confirmado' && !p.avaliado && (
        <Cartao>
          <Texto tipo="subtitulo">Como foi o atendimento da autoescola?</Texto>
          <Estrelas nota={nota} tamanho={32} aoEscolher={setNota} />
          <Campo
            rotulo="Comentário (opcional)"
            value={comentario}
            onChangeText={setComentario}
            multiline
            maxLength={1000}
          />
          <Botao
            titulo="Enviar avaliação"
            desabilitado={!nota}
            carregando={enviando}
            aoPressionar={avaliar}
          />
        </Cartao>
      )}

      {p.historico.length > 0 && (
        <Coluna>
          <Texto tipo="subtitulo">Histórico</Texto>
          <Cartao>
            {p.historico.map((h, i) => (
              <Coluna key={`${h.criadoEm}-${i}`} gap={2}>
                {i > 0 && <Divisor />}
                <Texto negrito>
                  {NOMES_STATUS[h.paraStatus] ?? NOMES_ATENDIMENTO[h.paraStatus] ?? h.paraStatus}
                </Texto>
                {h.motivo && <Texto tipo="pequeno">{h.motivo}</Texto>}
                <Texto tipo="pequeno">{dataHora(h.criadoEm)}</Texto>
              </Coluna>
            ))}
          </Cartao>
        </Coluna>
      )}
    </Tela>
  );
}
