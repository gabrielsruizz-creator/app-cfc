import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, enviarArquivo, mensagem } from '../../api';
import { Aviso, Carregando, Status } from '../../componentes/comum';

type Painel = {
  autoescola: {
    id: string;
    nomeFantasia: string;
    status: string;
    motivoStatus: string | null;
    municipio: string;
    uf: string;
  };
  documentos: { id: string; tipo: string; status: string; motivoReprovacao: string | null }[];
  pendencias: string[];
};

const DOCUMENTOS = [
  ['contrato_social', 'Contrato social'],
  ['cartao_cnpj', 'Cartão CNPJ'],
  ['credenciamento_detran', 'Credenciamento no DETRAN'],
  ['alvara', 'Alvará de funcionamento'],
] as const;

export function AutoescolaPainel() {
  const q = useQuery({
    queryKey: ['autoescola', 'painel'],
    queryFn: () => api<Painel>('/autoescola/painel'),
  });
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState<string | null>(null);
  if (!q.data) return <Carregando />;
  const { autoescola: a, documentos, pendencias } = q.data;

  async function enviarDoc(tipo: string, arquivo: File | undefined) {
    if (!arquivo) return;
    setErro(null);
    setEnviando(tipo);
    try {
      const arquivoId = await enviarArquivo(arquivo, 'documento');
      await api('/autoescola/documentos', { corpo: { tipo, arquivoId } });
      await q.refetch();
    } catch (e) {
      setErro(mensagem(e));
    } finally {
      setEnviando(null);
    }
  }

  async function enviarAnalise() {
    setErro(null);
    try {
      await api('/autoescola/enviar-analise', { metodo: 'POST' });
      await q.refetch();
    } catch (e) {
      setErro(mensagem(e));
    }
  }

  return (
    <div className="coluna">
      <div className="linha entre">
        <div>
          <h1>{a.nomeFantasia}</h1>
          <span className="suave">
            {a.municipio}/{a.uf}
          </span>
        </div>
        <Status valor={a.status} />
      </div>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {a.status === 'rascunho' && (
        <Aviso tipo="alerta">
          Envie os documentos abaixo e solicite a análise para publicar sua autoescola no app.
        </Aviso>
      )}
      {a.status === 'em_analise' && (
        <Aviso>Seu cadastro está em análise. Avisaremos por notificação quando for aprovado.</Aviso>
      )}
      {a.status === 'reprovada' && (
        <Aviso tipo="erro">Cadastro reprovado: {a.motivoStatus}. Corrija e envie novamente.</Aviso>
      )}
      {a.status === 'aprovada' && (
        <Aviso tipo="sucesso">
          Sua autoescola está aprovada. A vitrine, os pacotes e a fila "Novos alunos do app" chegam
          na próxima fase.
        </Aviso>
      )}

      <div className="cartao">
        <h2>Documentos</h2>
        <table>
          <tbody>
            {DOCUMENTOS.map(([tipo, nome]) => {
              const d = documentos.find((x) => x.tipo === tipo);
              return (
                <tr key={tipo}>
                  <td>
                    {nome}
                    {d?.motivoReprovacao && (
                      <div className="pequeno" style={{ color: 'var(--erro)' }}>
                        {d.motivoReprovacao}
                      </div>
                    )}
                  </td>
                  <td>
                    {d ? <Status valor={d.status} /> : <span className="selo">Não enviado</span>}
                  </td>
                  <td>
                    <label className="botao pequeno secundario" style={{ cursor: 'pointer' }}>
                      {enviando === tipo
                        ? 'Enviando…'
                        : d
                          ? 'Enviar nova versão'
                          : 'Enviar arquivo'}
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        hidden
                        onChange={(e) => enviarDoc(tipo, e.target.files?.[0])}
                      />
                    </label>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {['rascunho', 'reprovada'].includes(a.status) && (
          <div className="linha">
            <button className="botao" disabled={pendencias.length > 0} onClick={enviarAnalise}>
              Enviar para análise
            </button>
            {pendencias.length > 0 && (
              <span className="pequeno suave">{pendencias.join(' · ')}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
