import type { CategoriaCnh, Pacote, PacoteEntrada } from '@volante/contracts';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert } from 'react-native';
import {
  Aviso,
  Botao,
  Campo,
  Cartao,
  Carregando,
  Chip,
  Coluna,
  Interruptor,
  Linha,
  Tela,
  Texto,
  Vazio,
} from '../../src/componentes/ui';
import { api, mensagemDeErro } from '../../src/servicos/api';
import { useTema } from '../../src/tema/TemaProvider';
import { formatarCentavos } from '../../src/util/formatos';

const CATEGORIAS: CategoriaCnh[] = ['A', 'B', 'C', 'D', 'E'];

function paraReais(centavos: number) {
  return centavos ? (centavos / 100).toFixed(2).replace('.', ',') : '';
}
function deReais(v: string) {
  return Math.round(Number(v.replace(/\./g, '').replace(',', '.')) * 100) || 0;
}

function Formulario({
  inicial,
  aoSalvar,
  aoCancelar,
}: {
  inicial: PacoteEntrada;
  aoSalvar: (d: PacoteEntrada) => Promise<void>;
  aoCancelar: () => void;
}) {
  const [d, setD] = useState(inicial);
  const [preco, setPreco] = useState(paraReais(inicial.precoCentavos));
  const [qtd, setQtd] = useState(String(inicial.quantidadeAulas));
  const [validade, setValidade] = useState(
    inicial.validadeDias ? String(inicial.validadeDias) : '',
  );
  const [salvando, setSalvando] = useState(false);
  const centavos = deReais(preco);
  const quantidade = Number(qtd) || 0;
  return (
    <Cartao>
      <Campo rotulo="Nome do pacote" value={d.nome} onChangeText={(nome) => setD({ ...d, nome })} />
      <Linha gap={12}>
        <Coluna style={{ flex: 1 }}>
          <Campo rotulo="Aulas" keyboardType="number-pad" value={qtd} onChangeText={setQtd} />
        </Coluna>
        <Coluna style={{ flex: 1 }}>
          <Campo
            rotulo="Preço total (R$)"
            keyboardType="decimal-pad"
            value={preco}
            onChangeText={setPreco}
          />
        </Coluna>
      </Linha>
      {centavos > 0 && quantidade > 0 && (
        <Texto tipo="pequeno">{formatarCentavos(Math.round(centavos / quantidade))} por aula</Texto>
      )}
      <Campo
        rotulo="Validade (dias)"
        keyboardType="number-pad"
        value={validade}
        onChangeText={setValidade}
        ajuda="Aulas não usadas nesse prazo expiram e o valor é liberado para você."
      />
      <Texto tipo="rotulo">Categorias</Texto>
      <Linha style={{ flexWrap: 'wrap' }}>
        {CATEGORIAS.map((c) => (
          <Chip
            key={c}
            rotulo={c}
            selecionado={d.categorias.includes(c)}
            aoPressionar={() =>
              setD({
                ...d,
                categorias: d.categorias.includes(c)
                  ? d.categorias.filter((x) => x !== c)
                  : [...d.categorias, c],
              })
            }
          />
        ))}
      </Linha>
      <Campo
        rotulo="Descrição (opcional)"
        value={d.descricao ?? ''}
        onChangeText={(descricao) => setD({ ...d, descricao })}
        multiline
      />
      <Interruptor
        rotulo="Publicado no meu perfil"
        ligado={d.publicado}
        aoMudar={(publicado) => setD({ ...d, publicado })}
      />
      <Botao
        titulo="Salvar pacote"
        carregando={salvando}
        desabilitado={
          d.nome.trim().length < 3 || centavos < 1000 || quantidade < 1 || !d.categorias.length
        }
        aoPressionar={async () => {
          setSalvando(true);
          try {
            await aoSalvar({
              ...d,
              precoCentavos: centavos,
              quantidadeAulas: quantidade,
              validadeDias: validade ? Number(validade) : undefined,
            });
          } finally {
            setSalvando(false);
          }
        }}
      />
      <Botao titulo="Cancelar" variante="texto" aoPressionar={aoCancelar} />
    </Cartao>
  );
}

export default function PacotesInstrutor() {
  const { cores } = useTema();
  const [editando, setEditando] = useState<Pacote | 'novo' | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ['instrutor', 'pacotes'],
    queryFn: () => api<Pacote[]>('/instrutor/pacotes'),
  });
  if (q.isLoading) return <Carregando />;

  async function salvar(d: PacoteEntrada) {
    setErro(null);
    try {
      if (editando === 'novo') await api('/instrutor/pacotes', { corpo: d });
      else if (editando)
        await api(`/instrutor/pacotes/${editando.id}`, { metodo: 'PUT', corpo: d });
      setEditando(null);
      await q.refetch();
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  }

  return (
    <Tela>
      <Texto tipo="suave">
        Pacotes dão desconto ao aluno e garantem aulas para você. O valor é liberado a cada aula
        realizada.
      </Texto>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {editando ? (
        <Formulario
          inicial={
            editando === 'novo'
              ? {
                  nome: '',
                  categorias: ['B'],
                  quantidadeAulas: 5,
                  duracaoAulaMin: 50,
                  precoCentavos: 0,
                  parcelasMax: 1,
                  validadeDias: 120,
                  publicado: true,
                }
              : editando
          }
          aoSalvar={salvar}
          aoCancelar={() => setEditando(null)}
        />
      ) : (
        <Botao titulo="Novo pacote" icone="add" aoPressionar={() => setEditando('novo')} />
      )}
      {!q.data?.length && !editando ? (
        <Vazio
          icone="albums-outline"
          titulo="Nenhum pacote"
          texto="Crie o primeiro, ex.: 5 aulas com 10% de desconto."
        />
      ) : (
        q.data?.map((p) => (
          <Cartao key={p.id}>
            <Linha style={{ justifyContent: 'space-between' }}>
              <Texto negrito style={{ flex: 1 }}>
                {p.nome}
              </Texto>
              <Texto tipo="subtitulo" cor={cores.primaria}>
                {formatarCentavos(p.precoCentavos)}
              </Texto>
            </Linha>
            <Texto tipo="suave">
              {p.quantidadeAulas} aulas · {formatarCentavos(p.precoPorAulaCentavos)} por aula ·{' '}
              {p.publicado ? 'publicado' : 'oculto'}
            </Texto>
            <Linha>
              <Botao
                titulo="Editar"
                compacto
                variante="secundario"
                aoPressionar={() => setEditando(p)}
              />
              <Botao
                titulo="Arquivar"
                compacto
                variante="texto"
                aoPressionar={() =>
                  Alert.alert('Arquivar pacote?', 'Quem já comprou continua com as aulas.', [
                    { text: 'Voltar', style: 'cancel' },
                    {
                      text: 'Arquivar',
                      style: 'destructive',
                      onPress: async () => {
                        try {
                          await api(`/instrutor/pacotes/${p.id}`, { metodo: 'DELETE' });
                          await q.refetch();
                        } catch (e) {
                          setErro(mensagemDeErro(e));
                        }
                      },
                    },
                  ])
                }
              />
            </Linha>
          </Cartao>
        ))
      )}
    </Tela>
  );
}
