import { router } from 'expo-router';
import {
  Avatar,
  Cartao,
  Coluna,
  Divisor,
  ItemLista,
  Linha,
  Tela,
  Texto,
} from '../../src/componentes/ui';
import { SeletorTema } from '../../src/componentes/SeletorTema';
import { useAuth } from '../../src/servicos/AuthProvider';

export default function ContaAluno() {
  const { eu, sair, definirModo } = useAuth();
  if (!eu) return null;
  return (
    <Tela>
      <Linha gap={16}>
        <Avatar nome={eu.nome} arquivoId={eu.fotoArquivoId} tamanho={64} />
        <Coluna gap={2} style={{ flex: 1 }}>
          <Texto tipo="subtitulo">{eu.nome}</Texto>
          <Texto tipo="suave">{eu.email}</Texto>
          {eu.aluno && (
            <Texto tipo="pequeno">Categoria desejada: {eu.aluno.categoriaDesejada}</Texto>
          )}
        </Coluna>
      </Linha>
      <Cartao>
        <ItemLista
          icone="trending-up"
          titulo="Minha evolução"
          aoPressionar={() => router.push('/evolucao')}
        />
        <Divisor />
        <ItemLista icone="receipt" titulo="Recibos" aoPressionar={() => router.push('/recibos')} />
        <Divisor />
        <ItemLista
          icone="notifications"
          titulo="Notificações"
          aoPressionar={() => router.push('/notificacoes')}
        />
      </Cartao>
      <Cartao>
        {eu.instrutor ? (
          <ItemLista
            icone="swap-horizontal"
            titulo="Mudar para modo instrutor"
            aoPressionar={() => {
              definirModo('instrutor');
              router.replace('/agenda');
            }}
          />
        ) : (
          <ItemLista
            icone="id-card"
            titulo="Quero ser instrutor"
            descricao="Cadastre-se como instrutor credenciado"
            aoPressionar={() => {
              definirModo('instrutor');
              router.push('/area-instrutor/cadastro');
            }}
          />
        )}
      </Cartao>
      <Cartao>
        <Texto tipo="rotulo">Aparência</Texto>
        <SeletorTema />
      </Cartao>
      <Cartao>
        <ItemLista
          icone="shield-checkmark"
          titulo="Privacidade e dados"
          aoPressionar={() => router.push('/privacidade')}
        />
        <Divisor />
        <ItemLista
          icone="document-text"
          titulo="Termos de uso"
          aoPressionar={() => router.push('/documento-legal/termos_uso')}
        />
        <Divisor />
        <ItemLista
          icone="log-out"
          titulo="Sair"
          aoPressionar={async () => {
            await sair();
            router.replace('/boas-vindas');
          }}
        />
      </Cartao>
    </Tela>
  );
}
