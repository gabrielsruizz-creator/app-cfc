import type { PreviaContrato, TextoContrato } from '@volante/contracts';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Modal, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, mensagemDeErro } from '../servicos/api';
import { useTema } from '../tema/TemaProvider';
import { Aviso, Botao, CaixaSelecao, Cartao, Texto } from './ui';

/** Markdown simples do contrato (títulos, citações, parágrafos com **negrito**). */
export function TextoContratoView({ corpoMd }: { corpoMd: string }) {
  const { cores } = useTema();
  return (
    <View style={{ gap: 10 }}>
      {corpoMd
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p, i) => {
          if (p.startsWith('# '))
            return (
              <Texto key={i} tipo="titulo">
                {p.slice(2)}
              </Texto>
            );
          if (p.startsWith('## '))
            return (
              <Texto key={i} tipo="subtitulo">
                {p.slice(3)}
              </Texto>
            );
          if (p.startsWith('> '))
            return (
              <Texto key={i} tipo="suave" style={{ fontStyle: 'italic' }}>
                {p.replace(/^> ?/gm, '')}
              </Texto>
            );
          return (
            <Text key={i} style={{ color: cores.texto, fontSize: 15, lineHeight: 22 }}>
              {p
                .replace(/\n/g, ' ')
                .split(/(\*\*[^*]+\*\*)/g)
                .filter(Boolean)
                .map((t, j) =>
                  t.startsWith('**') ? (
                    <Text key={j} style={{ fontWeight: '700' }}>
                      {t.slice(2, -2)}
                    </Text>
                  ) : (
                    t
                  ),
                )}
            </Text>
          );
        })}
    </View>
  );
}

/** Contrato em tela cheia, para ler antes de aceitar. */
export function LeituraContrato({
  texto,
  aberto,
  aoFechar,
}: {
  texto: TextoContrato;
  aberto: boolean;
  aoFechar: () => void;
}) {
  const { cores } = useTema();
  return (
    <Modal visible={aberto} animationType="slide" onRequestClose={aoFechar}>
      <SafeAreaView style={{ flex: 1, backgroundColor: cores.fundo }}>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
          <TextoContratoView corpoMd={texto.corpoMd} />
          <Texto tipo="pequeno">
            Versão {texto.versao} · impressão digital (SHA-256) {texto.hash.slice(0, 16)}…
          </Texto>
        </ScrollView>
        <View style={{ padding: 16 }}>
          <Botao titulo="Fechar" variante="secundario" aoPressionar={aoFechar} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

/**
 * Prévia do contrato com os dados exatos da compra e o "Li e aceito". Devolve o hash do texto
 * aceito (ou null); mudou cupom, parcelas ou horário, o aceite volta a ser pedido.
 */
export function AceiteContrato({
  dados,
  aoMudar,
}: {
  dados: PreviaContrato;
  aoMudar: (hash: string | null) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [aceito, setAceito] = useState(false);
  const chave = JSON.stringify(dados);
  const q = useQuery({
    queryKey: ['contrato-previa', chave],
    queryFn: () => api<TextoContrato>('/aluno/contratos/previa', { corpo: dados }),
    retry: false,
  });
  useEffect(() => {
    setAceito(false);
    aoMudar(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, q.data?.hash]);

  return (
    <Cartao>
      <Texto tipo="subtitulo">Contrato de prestação de serviços</Texto>
      {q.isLoading ? (
        <Texto tipo="pequeno">Preparando o contrato com os dados da compra…</Texto>
      ) : q.error ? (
        <Aviso tipo="erro">{mensagemDeErro(q.error)}</Aviso>
      ) : q.data ? (
        <>
          <Texto tipo="suave">
            Feito com os dados desta compra, entre você e o vendedor. Cada um recebe uma cópia por
            e-mail depois do pagamento.
          </Texto>
          <Botao
            titulo="Ler o contrato"
            icone="document-text"
            variante="texto"
            compacto
            aoPressionar={() => setAberto(true)}
          />
          <CaixaSelecao
            rotulo="Li e aceito o contrato de prestação de serviços"
            marcado={aceito}
            aoMudar={(v) => {
              setAceito(v);
              aoMudar(v ? q.data!.hash : null);
            }}
          />
          <LeituraContrato texto={q.data} aberto={aberto} aoFechar={() => setAberto(false)} />
        </>
      ) : null}
    </Cartao>
  );
}

/** Erro "as condições mudaram": a prévia é refeita e o aceite, pedido de novo. */
export const contratoAlterado = (e: unknown) =>
  (e as { codigo?: string }).codigo === 'contrato_alterado';
