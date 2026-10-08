import type { PerfilInstrutorProprio } from '@volante/contracts';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { SeletorTema } from '../../src/componentes/SeletorTema';
import {
  Avatar,
  Cartao,
  Coluna,
  Divisor,
  Estrelas,
  ItemLista,
  Linha,
  Tela,
  Texto,
} from '../../src/componentes/ui';
import { api } from '../../src/servicos/api';
import { useAuth } from '../../src/servicos/AuthProvider';

export default function PainelInstrutor() {
  const { eu, sair, definirModo } = useAuth();
  const perfil = useQuery({
    queryKey: ['instrutor', 'perfil'],
    queryFn: () => api<PerfilInstrutorProprio>('/instrutor/perfil'),
  });
  if (!eu) return null;
  const p = perfil.data;
  return (
    <Tela>
      <Linha gap={16}>
        <Avatar nome={eu.nome} arquivoId={eu.fotoArquivoId} tamanho={64} />
        <Coluna gap={2} style={{ flex: 1 }}>
          <Texto tipo="subtitulo">{eu.nome}</Texto>
          {p && (
            <Linha>
              <Estrelas nota={p.notaMedia ?? 0} tamanho={14} />
              <Texto tipo="pequeno">
                {p.totalAvaliacoes} avaliações · {p.totalAulas} aulas
              </Texto>
            </Linha>
          )}
        </Coluna>
      </Linha>
      <Cartao>
        <ItemLista
          icone="clipboard"
          titulo="Meu cadastro"
          descricao="Perfil, documentos e status"
          aoPressionar={() => router.push('/area-instrutor/cadastro')}
        />
        <Divisor />
        <ItemLista
          icone="cash"
          titulo="Preço e região"
          aoPressionar={() => router.push('/area-instrutor/atendimento')}
        />
        <Divisor />
        <ItemLista
          icone="time"
          titulo="Jornada semanal"
          aoPressionar={() => router.push('/area-instrutor/jornada')}
        />
        <Divisor />
        <ItemLista
          icone="airplane"
          titulo="Folgas e férias"
          aoPressionar={() => router.push('/area-instrutor/bloqueios')}
        />
        <Divisor />
        <ItemLista
          icone="document-attach"
          titulo="Documentos"
          aoPressionar={() => router.push('/area-instrutor/documentos')}
        />
        <Divisor />
        <ItemLista
          icone="car"
          titulo="Veículo"
          aoPressionar={() => router.push('/area-instrutor/veiculo')}
        />
        <Divisor />
        <ItemLista
          icone="star"
          titulo="Avaliações recebidas"
          aoPressionar={() => router.push('/area-instrutor/avaliacoes')}
        />
      </Cartao>
      <Cartao>
        <ItemLista icone="wallet" titulo="Ganhos e saques" descricao="Em breve" />
        <Divisor />
        <ItemLista
          icone="notifications"
          titulo="Notificações"
          aoPressionar={() => router.push('/notificacoes')}
        />
        <Divisor />
        <ItemLista
          icone="swap-horizontal"
          titulo="Mudar para modo aluno"
          aoPressionar={() => {
            definirModo('aluno');
            router.replace('/');
          }}
        />
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
