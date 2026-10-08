import type { CupomValidado, Pacote, ResumoPedido } from '@volante/contracts';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import {
  Aviso,
  Botao,
  Campo,
  Cartao,
  Carregando,
  Chip,
  Coluna,
  Linha,
  Tela,
  Texto,
} from '../../src/componentes/ui';
import { api, mensagemDeErro } from '../../src/servicos/api';
import { useTema } from '../../src/tema/TemaProvider';
import { formatarCentavos } from '../../src/util/formatos';

/** Resumo da compra de um pacote: cupom, Pix ou cartão parcelado. */
export default function Checkout() {
  const { pacoteId } = useLocalSearchParams<{ pacoteId: string }>();
  const { cores } = useTema();
  const [codigo, setCodigo] = useState('');
  const [cupom, setCupom] = useState<CupomValidado | null>(null);
  const [erroCupom, setErroCupom] = useState<string | null>(null);
  const [validando, setValidando] = useState(false);
  const [metodo, setMetodo] = useState<'pix' | 'cartao'>('pix');
  const [parcelas, setParcelas] = useState(1);
  const [erro, setErro] = useState<string | null>(null);
  const [comprando, setComprando] = useState(false);
  const chave = useRef(`${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const q = useQuery({
    queryKey: ['pacote', pacoteId],
    queryFn: () => api<Pacote>(`/publico/pacotes/${pacoteId}`),
  });
  if (q.isLoading || !q.data) return <Carregando />;
  const p = q.data;
  const total = cupom ? cupom.valorFinalCentavos : p.precoCentavos;
  // parcela mínima de R$ 5,00
  const maxParcelas = Math.max(1, Math.min(p.parcelasMax, Math.floor(total / 500)));
  const parcelasValidas = Math.min(parcelas, maxParcelas);

  async function aplicar() {
    setErroCupom(null);
    setValidando(true);
    try {
      setCupom(
        await api<CupomValidado>('/aluno/cupons/validar', {
          corpo: { codigo: codigo.trim(), pacoteId },
        }),
      );
    } catch (e) {
      setCupom(null);
      setErroCupom(mensagemDeErro(e));
    } finally {
      setValidando(false);
    }
  }

  async function comprar() {
    setErro(null);
    setComprando(true);
    try {
      const pedido = await api<ResumoPedido>('/aluno/pedidos', {
        corpo: {
          pacoteId,
          cupom: cupom?.codigo,
          metodo,
          parcelas: metodo === 'cartao' ? parcelasValidas : 1,
        },
        cabecalhos: { 'idempotency-key': chave.current },
      });
      router.replace(`/pedido/${pedido.id}`);
    } catch (e) {
      setErro(mensagemDeErro(e));
      chave.current = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    } finally {
      setComprando(false);
    }
  }

  return (
    <Tela>
      <Texto tipo="titulo">{p.nome}</Texto>
      <Texto tipo="suave">
        {p.vendedorNome} · {p.quantidadeAulas} aulas de {p.duracaoAulaMin} min
      </Texto>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      <Cartao>
        <Texto tipo="rotulo">Cupom de desconto</Texto>
        {cupom ? (
          <Linha style={{ justifyContent: 'space-between' }}>
            <Coluna gap={2} style={{ flex: 1 }}>
              <Texto negrito>{cupom.codigo}</Texto>
              {cupom.descricao ? <Texto tipo="pequeno">{cupom.descricao}</Texto> : null}
            </Coluna>
            <Botao
              titulo="Remover"
              compacto
              variante="texto"
              aoPressionar={() => {
                setCupom(null);
                setCodigo('');
              }}
            />
          </Linha>
        ) : (
          <Linha style={{ alignItems: 'flex-end' }}>
            <View style={{ flex: 1 }}>
              <Campo
                rotulo="Código"
                autoCapitalize="characters"
                value={codigo}
                onChangeText={setCodigo}
                erro={erroCupom ?? undefined}
                returnKeyType="done"
                onSubmitEditing={aplicar}
              />
            </View>
            <Botao
              titulo="Aplicar"
              compacto
              variante="secundario"
              desabilitado={codigo.trim().length < 3}
              carregando={validando}
              aoPressionar={aplicar}
            />
          </Linha>
        )}
      </Cartao>

      <Cartao>
        <Texto tipo="rotulo">Forma de pagamento</Texto>
        <Linha style={{ flexWrap: 'wrap' }}>
          <Chip
            rotulo="Pix"
            icone="qr-code"
            selecionado={metodo === 'pix'}
            aoPressionar={() => setMetodo('pix')}
          />
          <Chip
            rotulo="Cartão de crédito"
            icone="card"
            selecionado={metodo === 'cartao'}
            aoPressionar={() => setMetodo('cartao')}
          />
        </Linha>
        {metodo === 'cartao' && (
          <Coluna>
            {maxParcelas > 1 ? (
              <>
                <Texto tipo="pequeno">Parcelas sem juros</Texto>
                <Linha style={{ flexWrap: 'wrap' }}>
                  {Array.from({ length: maxParcelas }, (_, i) => i + 1).map((n) => (
                    <Chip
                      key={n}
                      rotulo={`${n}x ${formatarCentavos(Math.ceil(total / n))}`}
                      selecionado={parcelasValidas === n}
                      aoPressionar={() => setParcelas(n)}
                    />
                  ))}
                </Linha>
              </>
            ) : (
              <Texto tipo="pequeno">Este pacote é só à vista no cartão.</Texto>
            )}
            <Texto tipo="pequeno">
              Você digita os dados do cartão na página segura do meio de pagamento, não no app.
            </Texto>
          </Coluna>
        )}
      </Cartao>

      <Cartao>
        {cupom && (
          <>
            <Linha style={{ justifyContent: 'space-between' }}>
              <Texto>Valor do pacote</Texto>
              <Texto>{formatarCentavos(p.precoCentavos)}</Texto>
            </Linha>
            <Linha style={{ justifyContent: 'space-between' }}>
              <Texto>Desconto ({cupom.codigo})</Texto>
              <Texto cor={cores.sucesso}>− {formatarCentavos(cupom.descontoCentavos)}</Texto>
            </Linha>
          </>
        )}
        <Linha style={{ justifyContent: 'space-between' }}>
          <Texto negrito>Total</Texto>
          <Texto tipo="subtitulo" cor={cores.primaria}>
            {formatarCentavos(total)}
          </Texto>
        </Linha>
        {metodo === 'cartao' && parcelasValidas > 1 && (
          <Texto tipo="pequeno">
            {parcelasValidas}x de {formatarCentavos(Math.ceil(total / parcelasValidas))} sem juros
          </Texto>
        )}
        <Texto tipo="pequeno">
          {p.vendedorTipo === 'autoescola'
            ? 'O valor fica guardado até a autoescola confirmar sua matrícula. Se ela recusar ou não responder no prazo, você recebe tudo de volta.'
            : 'O valor fica guardado e é repassado ao instrutor a cada aula realizada.'}
        </Texto>
      </Cartao>

      <Botao
        titulo={metodo === 'pix' ? 'Pagar com Pix' : 'Pagar com cartão'}
        icone={metodo === 'pix' ? 'qr-code' : 'card'}
        carregando={comprando}
        aoPressionar={comprar}
      />
    </Tela>
  );
}
