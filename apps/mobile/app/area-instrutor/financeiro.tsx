import type { ResumoFinanceiro, TipoChavePix } from '@volante/contracts';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  Aviso,
  Botao,
  Campo,
  Cartao,
  Carregando,
  Chip,
  Coluna,
  Divisor,
  Linha,
  Tela,
  Texto,
} from '../../src/componentes/ui';
import { api, mensagemDeErro } from '../../src/servicos/api';
import { useAuth } from '../../src/servicos/AuthProvider';
import { useTema } from '../../src/tema/TemaProvider';
import { dataHora, formatarCentavos } from '../../src/util/formatos';

const TIPOS: { id: TipoChavePix; nome: string }[] = [
  { id: 'cpf', nome: 'CPF' },
  { id: 'email', nome: 'E-mail' },
  { id: 'telefone', nome: 'Telefone' },
  { id: 'aleatoria', nome: 'Aleatória' },
  { id: 'cnpj', nome: 'CNPJ' },
];

const NOMES_SAQUE: Record<string, string> = {
  solicitado: 'Processando',
  processando: 'Processando',
  pendente_configuracao: 'Aguardando configuração do pagamento',
  concluido: 'Enviado',
  falhou: 'Não realizado (valor devolvido ao saldo)',
};

export default function Financeiro() {
  const { cores } = useTema();
  const { eu } = useAuth();
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [tipoChave, setTipoChave] = useState<TipoChavePix>('cpf');
  const [chave, setChave] = useState('');
  const [valor, setValor] = useState('');
  const [enviando, setEnviando] = useState(false);
  const q = useQuery({
    queryKey: ['instrutor', 'financeiro'],
    queryFn: () => api<ResumoFinanceiro>('/instrutor/financeiro'),
  });
  if (q.isLoading || !q.data) return <Carregando />;
  const f = q.data;
  const centavos = Math.round(Number(valor.replace(/\./g, '').replace(',', '.')) * 100) || 0;

  async function executar(fn: () => Promise<unknown>, sucesso: string) {
    setErro(null);
    setOk(null);
    setEnviando(true);
    try {
      await fn();
      setOk(sucesso);
      await q.refetch();
      return true;
    } catch (e) {
      setErro(mensagemDeErro(e));
      return false;
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Tela aoAtualizar={() => void q.refetch()} atualizando={q.isRefetching}>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {ok && <Aviso tipo="sucesso">{ok}</Aviso>}
      <Cartao>
        <Texto tipo="rotulo">Disponível para saque</Texto>
        <Texto tipo="titulo" cor={cores.primaria}>
          {formatarCentavos(f.disponivelCentavos)}
        </Texto>
        <Texto tipo="pequeno">
          A liberar: {formatarCentavos(f.retidoCentavos)} (aulas ainda não realizadas, valor bruto)
        </Texto>
      </Cartao>
      <Linha gap={8}>
        {[
          ['Hoje', f.ganhosHojeCentavos],
          ['Semana', f.ganhosSemanaCentavos],
          ['Mês', f.ganhosMesCentavos],
        ].map(([rotulo, v]) => (
          <Cartao key={rotulo as string} style={{ flex: 1, alignItems: 'center' }}>
            <Texto tipo="rotulo">{rotulo}</Texto>
            <Texto negrito>{formatarCentavos(v as number)}</Texto>
          </Cartao>
        ))}
      </Linha>

      <Cartao>
        <Texto tipo="subtitulo">Chave Pix</Texto>
        {f.contaRecebimento && !editando ? (
          <Coluna>
            <Texto>
              {TIPOS.find((t) => t.id === f.contaRecebimento!.tipoChave)?.nome}:{' '}
              {f.contaRecebimento.chaveMascarada}
            </Texto>
            <Texto tipo="pequeno">Titular: {f.contaRecebimento.titularNome}</Texto>
            <Botao
              titulo="Trocar chave"
              compacto
              variante="texto"
              aoPressionar={() => setEditando(true)}
            />
          </Coluna>
        ) : (
          <Coluna>
            <Linha style={{ flexWrap: 'wrap' }}>
              {TIPOS.map((t) => (
                <Chip
                  key={t.id}
                  rotulo={t.nome}
                  selecionado={tipoChave === t.id}
                  aoPressionar={() => setTipoChave(t.id)}
                />
              ))}
            </Linha>
            <Campo
              rotulo="Chave"
              value={chave}
              onChangeText={setChave}
              autoCapitalize="none"
              ajuda="Precisa estar no seu nome (CPF do cadastro)."
            />
            <Botao
              titulo="Salvar chave"
              carregando={enviando}
              desabilitado={chave.trim().length < 3}
              aoPressionar={async () => {
                if (
                  await executar(
                    () =>
                      api('/instrutor/conta-recebimento', {
                        metodo: 'PUT',
                        corpo: {
                          tipoChave,
                          chave,
                          titularNome: eu?.nome ?? '',
                          titularDocumento: eu?.cpf ?? '',
                        },
                      }),
                    'Chave Pix salva.',
                  )
                ) {
                  setEditando(false);
                  setChave('');
                }
              }}
            />
          </Coluna>
        )}
      </Cartao>

      <Cartao>
        <Texto tipo="subtitulo">Sacar</Texto>
        <Campo
          rotulo="Valor (R$)"
          keyboardType="decimal-pad"
          value={valor}
          onChangeText={setValor}
          ajuda="Mínimo R$ 10,00. O Pix cai na chave cadastrada."
        />
        <Linha>
          <Botao
            titulo="Sacar tudo"
            compacto
            variante="texto"
            aoPressionar={() => setValor((f.disponivelCentavos / 100).toFixed(2).replace('.', ','))}
          />
        </Linha>
        <Botao
          titulo="Solicitar saque"
          icone="cash"
          carregando={enviando}
          desabilitado={!f.contaRecebimento || centavos < 1000 || centavos > f.disponivelCentavos}
          aoPressionar={async () => {
            if (
              await executar(
                () => api('/instrutor/saques', { corpo: { valorCentavos: centavos } }),
                'Saque solicitado. Avisaremos quando o Pix for enviado.',
              )
            )
              setValor('');
          }}
        />
      </Cartao>

      {f.saques.length > 0 && (
        <Cartao>
          <Texto tipo="subtitulo">Saques</Texto>
          {f.saques.map((s, i) => (
            <Coluna key={s.id} gap={2}>
              {i > 0 && <Divisor />}
              <Linha style={{ justifyContent: 'space-between' }}>
                <Texto>{dataHora(s.criadoEm)}</Texto>
                <Texto negrito>{formatarCentavos(s.valorCentavos)}</Texto>
              </Linha>
              <Texto tipo="pequeno">{NOMES_SAQUE[s.status] ?? s.status}</Texto>
            </Coluna>
          ))}
        </Cartao>
      )}

      <Cartao>
        <Texto tipo="subtitulo">Extrato</Texto>
        {!f.extrato.length && <Texto tipo="suave">Nenhuma movimentação ainda.</Texto>}
        {f.extrato.map((l, i) => (
          <Coluna key={l.id} gap={2}>
            {i > 0 && <Divisor />}
            <Linha style={{ justifyContent: 'space-between' }}>
              <Texto style={{ flex: 1 }}>{l.descricao}</Texto>
              <Texto negrito cor={l.valorCentavos < 0 ? cores.erro : undefined}>
                {formatarCentavos(l.valorCentavos)}
              </Texto>
            </Linha>
            <Texto tipo="pequeno">
              {dataHora(l.criadoEm)} · {l.bucket === 'retido' ? 'a liberar' : 'disponível'}
            </Texto>
          </Coluna>
        ))}
      </Cartao>
    </Tela>
  );
}
