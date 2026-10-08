import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  Aviso,
  Botao,
  Cartao,
  Carregando,
  Coluna,
  Divisor,
  Linha,
  Tela,
  Texto,
} from '../../src/componentes/ui';
import { api, ErroApi, mensagemDeErro } from '../../src/servicos/api';
import { useAuth } from '../../src/servicos/AuthProvider';
import { usePerfilInstrutor } from '../../src/servicos/instrutor';
import { useTema } from '../../src/tema/TemaProvider';

type Etapa = { titulo: string; descricao: string; rota: string; feita: boolean };

export default function CadastroInstrutor() {
  const { cores } = useTema();
  const { recarregar } = useAuth();
  const queryClient = useQueryClient();
  const q = usePerfilInstrutor();
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (q.isLoading) return <Carregando />;
  const p = q.data;
  const docsOk = p
    ? p.documentos.length >= 5 && !p.documentos.some((d) => d.status === 'reprovado')
    : false;
  const etapas: Etapa[] = [
    {
      titulo: 'Perfil profissional',
      descricao: 'Foto, apresentação e categorias',
      rota: '/area-instrutor/perfil',
      feita: !!p?.bio,
    },
    {
      titulo: 'Preço e região',
      descricao: 'Valor da aula e raio de atendimento',
      rota: '/area-instrutor/atendimento',
      feita: !!p?.precoAulaCentavos && !!p.baseLocalizacao,
    },
    {
      titulo: 'Documentos',
      descricao: 'CNH, credencial DETRAN, veículo, residência e selfie',
      rota: '/area-instrutor/documentos',
      feita: docsOk,
    },
    {
      titulo: 'Veículo',
      descricao: 'Carro ou moto usado nas aulas',
      rota: '/area-instrutor/veiculo',
      feita: !p?.forneceVeiculo || (p?.veiculos.length ?? 0) > 0,
    },
    {
      titulo: 'Jornada semanal',
      descricao: 'Dias e horários em que você atende',
      rota: '/area-instrutor/jornada',
      feita: false,
    },
  ];

  async function enviar() {
    setErro(null);
    setEnviando(true);
    try {
      await api('/instrutor/enviar-analise', { metodo: 'POST' });
      await queryClient.invalidateQueries({ queryKey: ['instrutor'] });
      await recarregar();
    } catch (e) {
      const pend =
        e instanceof ErroApi
          ? (e.detalhes as { pendencias?: string[] } | undefined)?.pendencias
          : undefined;
      setErro(pend?.length ? `Falta: ${pend.join('; ')}` : mensagemDeErro(e));
    } finally {
      setEnviando(false);
    }
  }

  const podeEnviar = p && ['rascunho', 'reprovado'].includes(p.status);
  return (
    <Tela aoAtualizar={() => void q.refetch()} atualizando={q.isRefetching}>
      <Texto tipo="titulo">Seu cadastro</Texto>
      {p?.status === 'em_analise' && (
        <Aviso tipo="info" titulo="Em análise">
          Nossa equipe está conferindo seus documentos. Você será avisado.
        </Aviso>
      )}
      {p?.status === 'aprovado' && (
        <Aviso tipo="sucesso" titulo="Aprovado">
          Seu cadastro está aprovado. Mantenha os documentos em dia.
        </Aviso>
      )}
      {p?.status === 'reprovado' && (
        <Aviso tipo="erro" titulo="Precisa de ajustes">
          {p.motivoStatus ?? 'Corrija os itens indicados e envie novamente.'}
        </Aviso>
      )}
      {p?.status === 'suspenso_documento' && (
        <Aviso tipo="erro" titulo="Documento vencido">
          Envie o documento atualizado em "Documentos".
        </Aviso>
      )}
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      <Cartao>
        {etapas.map((e, i) => (
          <Coluna key={e.rota}>
            {i > 0 && <Divisor />}
            <Linha gap={12} style={{ minHeight: 56 }}>
              <Ionicons
                name={e.feita ? 'checkmark-circle' : 'ellipse-outline'}
                size={26}
                color={e.feita ? cores.sucesso : cores.textoSuave}
              />
              <Coluna gap={0} style={{ flex: 1 }}>
                <Texto negrito>{e.titulo}</Texto>
                <Texto tipo="pequeno">{e.descricao}</Texto>
              </Coluna>
              <Botao
                titulo={e.feita ? 'Editar' : 'Fazer'}
                compacto
                variante={e.feita ? 'texto' : 'secundario'}
                desabilitado={!p && i > 0}
                aoPressionar={() => router.push(e.rota as never)}
              />
            </Linha>
          </Coluna>
        ))}
      </Cartao>
      {p && p.pendenciasCadastro.length > 0 && podeEnviar && (
        <Aviso tipo="alerta" titulo="Para enviar, falta:">
          {p.pendenciasCadastro.map((x) => `• ${x}`).join('\n')}
        </Aviso>
      )}
      {podeEnviar && (
        <>
          <Texto tipo="pequeno">
            Ao enviar, você declara que as informações são verdadeiras e aceita o termo do instrutor
            parceiro.
          </Texto>
          <Botao
            titulo="Enviar para análise"
            icone="send"
            desabilitado={(p?.pendenciasCadastro.length ?? 1) > 0}
            carregando={enviando}
            aoPressionar={enviar}
          />
        </>
      )}
    </Tela>
  );
}
