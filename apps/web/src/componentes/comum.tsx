import { useEffect, useState, type ReactNode } from 'react';
import { mensagem, urlArquivo } from '../api';

export function Aviso({
  tipo,
  children,
}: {
  tipo?: 'erro' | 'sucesso' | 'alerta';
  children: ReactNode;
}) {
  return (
    <div role={tipo === 'erro' ? 'alert' : 'status'} className={`aviso ${tipo ?? ''}`}>
      {children}
    </div>
  );
}

export function Carregando() {
  return (
    <p className="suave" aria-live="polite">
      Carregando…
    </p>
  );
}

const CORES_STATUS: Record<string, string> = {
  aprovado: 'verde',
  aprovada: 'verde',
  concluida: 'verde',
  confirmada: 'verde',
  em_analise: 'amarelo',
  pendente: 'amarelo',
  solicitada: 'amarelo',
  aguardando_pagamento: 'amarelo',
  aguardando_confirmacao: 'amarelo',
  pendente_configuracao: 'amarelo',
  falhou: 'vermelho',
  morto: 'vermelho',
  reprovado: 'vermelho',
  reprovada: 'vermelho',
  bloqueado: 'vermelho',
  suspensa: 'vermelho',
  suspenso_documento: 'vermelho',
  vencido: 'vermelho',
  rascunho: '',
};

const NOMES_STATUS: Record<string, string> = {
  em_analise: 'Em análise',
  suspenso_documento: 'Suspenso (documento)',
  pendente_configuracao: 'Pendente de configuração',
  aguardando_pagamento: 'Aguardando pagamento',
  aguardando_confirmacao: 'Aguardando confirmação',
};

export function Status({ valor }: { valor: string }) {
  const nome =
    NOMES_STATUS[valor] ?? valor.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
  return <span className={`selo ${CORES_STATUS[valor] ?? 'azul'}`}>{nome}</span>;
}

export function Campo({
  rotulo,
  ajuda,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { rotulo: string; ajuda?: string }) {
  const id = props.id ?? `campo-${rotulo.replace(/\W/g, '-').toLowerCase()}`;
  return (
    <div className="campo">
      <label htmlFor={id}>{rotulo}</label>
      <input id={id} {...props} />
      {ajuda && <span className="ajuda">{ajuda}</span>}
    </div>
  );
}

/** Mostra uma imagem ou PDF protegido (baixado com o token do usuário). */
export function VisualizadorArquivo({ arquivoId }: { arquivoId: string }) {
  const [estado, setEstado] = useState<{ url: string; tipo: string } | { erro: string } | null>(
    null,
  );
  useEffect(() => {
    let url: string | null = null;
    setEstado(null);
    urlArquivo(arquivoId)
      .then((r) => {
        url = r.url;
        setEstado(r);
      })
      .catch((e) => setEstado({ erro: mensagem(e) }));
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [arquivoId]);
  if (!estado)
    return (
      <div className="documento">
        <Carregando />
      </div>
    );
  if ('erro' in estado)
    return (
      <div className="documento">
        <span className="suave">{estado.erro}</span>
      </div>
    );
  return (
    <div className="documento">
      {estado.tipo === 'application/pdf' ? (
        <iframe title="Documento" src={estado.url} />
      ) : (
        <img src={estado.url} alt="Documento enviado" />
      )}
    </div>
  );
}
