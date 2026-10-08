import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { Carregando, Tela, Texto } from '../../src/componentes/ui';
import { api } from '../../src/servicos/api';

type Doc = { tipo: string; versao: string; conteudoMd: string };

/** Exibe o texto vigente de um documento legal (termos, privacidade). */
export default function DocumentoLegal() {
  const { tipo } = useLocalSearchParams<{ tipo: string }>();
  const { data, isLoading } = useQuery({ queryKey: ['documentos-legais'], queryFn: () => api<Doc[]>('/publico/documentos-legais') });
  if (isLoading) return <Carregando />;
  const doc = data?.find((d) => d.tipo === tipo);
  return (
    <Tela>
      {doc ? (
        <>
          <Texto tipo="pequeno">Versão {doc.versao}</Texto>
          {doc.conteudoMd.split('\n').map((linha, i) =>
            linha.startsWith('# ') ? (
              <Texto key={i} tipo="titulo">
                {linha.slice(2)}
              </Texto>
            ) : linha.trim() ? (
              <Texto key={i}>{linha.replace(/\*\*/g, '')}</Texto>
            ) : null,
          )}
        </>
      ) : (
        <Texto>Documento não encontrado.</Texto>
      )}
    </Tela>
  );
}
