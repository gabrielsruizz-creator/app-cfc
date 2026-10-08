import { DOCUMENTOS_COM_VALIDADE, TIPOS_DOCUMENTO_INSTRUTOR, type TipoDocumentoInstrutor } from '@volante/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Aviso, Botao, Campo, Cartao, Carregando, Coluna, Linha, Selo, Tela, Texto } from '../../src/componentes/ui';
import { api, enviarArquivo, mensagemDeErro } from '../../src/servicos/api';
import { usePerfilInstrutor } from '../../src/servicos/instrutor';
import { useTema } from '../../src/tema/TemaProvider';
import { perguntarOrigemImagem } from '../../src/util/dispositivo';
import { dataBrParaIso, mascararData } from '../../src/util/formatos';

const INFO: Record<TipoDocumentoInstrutor, { nome: string; dica: string }> = {
  cnh: { nome: 'CNH', dica: 'Foto da CNH aberta, frente e verso legíveis.' },
  credencial_detran: { nome: 'Credencial de instrutor (DETRAN)', dica: 'Credencial de instrutor de trânsito válida.' },
  documento_veiculo: { nome: 'Documento do veículo (CRLV)', dica: 'CRLV do veículo usado nas aulas.' },
  comprovante_residencia: { nome: 'Comprovante de residência', dica: 'Conta de consumo dos últimos 3 meses.' },
  selfie: { nome: 'Selfie', dica: 'Foto do seu rosto, sem óculos escuros ou boné.' },
};

function CartaoDocumento({ tipo, atual, aoEnviar }: { tipo: TipoDocumentoInstrutor; atual?: { status: string; validade: string | null; motivoReprovacao: string | null }; aoEnviar: () => void }) {
  const { cores } = useTema();
  const [validade, setValidade] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const exigeValidade = DOCUMENTOS_COM_VALIDADE.includes(tipo);
  const status = atual?.status;
  const selo =
    status === 'aprovado'
      ? { texto: 'Aprovado', cor: cores.sucesso, fundo: cores.sucessoSuave }
      : status === 'reprovado'
        ? { texto: 'Reprovado', cor: cores.erro, fundo: cores.erroSuave }
        : status === 'vencido'
          ? { texto: 'Vencido', cor: cores.erro, fundo: cores.erroSuave }
          : status === 'pendente'
            ? { texto: 'Em análise', cor: cores.alerta, fundo: cores.alertaSuave }
            : { texto: 'Não enviado', cor: cores.textoSuave, fundo: cores.superficieAlt };

  async function enviar() {
    setErro(null);
    const iso = dataBrParaIso(validade);
    if (exigeValidade && !iso) return setErro('Informe a validade no formato DD/MM/AAAA.');
    const uri = await perguntarOrigemImagem(tipo === 'selfie');
    if (!uri) return;
    setEnviando(true);
    try {
      const arquivoId = await enviarArquivo(uri, tipo === 'selfie' ? 'selfie' : 'documento');
      await api('/instrutor/documentos', { corpo: { tipo, arquivoId, validade: iso } });
      setValidade('');
      aoEnviar();
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Cartao>
      <Linha style={{ justifyContent: 'space-between' }}>
        <Texto negrito style={{ flex: 1 }}>
          {INFO[tipo].nome}
        </Texto>
        <Selo {...selo} />
      </Linha>
      <Texto tipo="pequeno">{INFO[tipo].dica}</Texto>
      {atual?.validade && <Texto tipo="pequeno">Validade: {atual.validade.split('-').reverse().join('/')}</Texto>}
      {atual?.motivoReprovacao && status === 'reprovado' && <Aviso tipo="erro">{atual.motivoReprovacao}</Aviso>}
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {exigeValidade && (
        <Campo rotulo="Validade" value={validade} onChangeText={(v) => setValidade(mascararData(v))} keyboardType="number-pad" placeholder="DD/MM/AAAA" />
      )}
      <Botao titulo={atual ? 'Enviar nova versão' : 'Enviar'} compacto variante={atual ? 'secundario' : 'primario'} icone="cloud-upload" carregando={enviando} aoPressionar={enviar} />
    </Cartao>
  );
}

export default function Documentos() {
  const queryClient = useQueryClient();
  const q = usePerfilInstrutor();
  if (q.isLoading) return <Carregando />;
  if (!q.data) return <Tela><Aviso tipo="alerta">Preencha primeiro o perfil profissional.</Aviso></Tela>;
  return (
    <Tela aoAtualizar={() => void q.refetch()} atualizando={q.isRefetching}>
      <Coluna gap={4}>
        <Texto tipo="suave">Os documentos ficam em armazenamento privado e só a equipe de análise tem acesso.</Texto>
        <Texto tipo="pequeno">Avisaremos 30, 15 e 7 dias antes de um documento vencer.</Texto>
      </Coluna>
      {TIPOS_DOCUMENTO_INSTRUTOR.map((tipo) => (
        <CartaoDocumento
          key={tipo}
          tipo={tipo}
          atual={q.data!.documentos.find((d) => d.tipo === tipo)}
          aoEnviar={() => void queryClient.invalidateQueries({ queryKey: ['instrutor'] })}
        />
      ))}
    </Tela>
  );
}
