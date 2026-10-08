import type { RespostaSessao } from '@volante/contracts';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, mensagem, sessao } from '../../api';
import { useAuth } from '../../auth';
import { Aviso, Campo } from '../../componentes/comum';

const vazioConta = { nome: '', cpf: '', email: '', telefone: '', senha: '' };
const vazioEmpresa = {
  razaoSocial: '',
  nomeFantasia: '',
  cnpj: '',
  credenciamentoDetran: '',
  telefone: '',
  whatsapp: '',
  email: '',
  cep: '',
  logradouro: '',
  numero: '',
  complemento: '',
  bairro: '',
  municipio: '',
  uf: '',
};

/** Busca as coordenadas do endereço (OpenStreetMap) para posicionar a autoescola no mapa. */
async function geocodificar(endereco: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(endereco)}`,
    );
    const [p] = (await r.json()) as { lat: string; lon: string }[];
    return p ? { lat: Number(p.lat), lng: Number(p.lon) } : null;
  } catch {
    return null;
  }
}

export function AutoescolaCadastro() {
  const { eu, aplicar, recarregar } = useAuth();
  const navegar = useNavigate();
  const [conta, setConta] = useState(vazioConta);
  const [empresa, setEmpresa] = useState(vazioEmpresa);
  const [termos, setTermos] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function buscarCep() {
    const cep = empresa.cep.replace(/\D/g, '');
    if (cep.length !== 8) return;
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const d = await r.json();
      if (!d.erro)
        setEmpresa((e) => ({
          ...e,
          logradouro: d.logradouro,
          bairro: d.bairro,
          municipio: d.localidade,
          uf: d.uf,
        }));
    } catch {
      /* preenchimento manual */
    }
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      if (!eu) {
        const r = await api<RespostaSessao>('/auth/cadastro', {
          corpo: { ...conta, aceitouTermos: termos, aceitouPrivacidade: termos },
        });
        aplicar(r);
      }
      const endereco = `${empresa.logradouro}, ${empresa.numero}, ${empresa.municipio}, ${empresa.uf}`;
      const localizacao =
        (await geocodificar(endereco)) ??
        (await geocodificar(`${empresa.municipio}, ${empresa.uf}`));
      if (!localizacao)
        throw new Error('Não encontramos o endereço no mapa. Confira o CEP e o número.');
      const painel = await api<{ autoescola: { id: string } }>('/autoescolas', {
        corpo: {
          ...empresa,
          complemento: empresa.complemento || undefined,
          localizacao,
          aceitouTermoAutoescola: termos,
        },
      });
      sessao.definirAutoescola(painel.autoescola.id);
      await recarregar();
      navegar('/autoescola');
    } catch (err) {
      setErro(mensagem(err));
    } finally {
      setEnviando(false);
    }
  }

  const mudarConta = (k: keyof typeof conta) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setConta({ ...conta, [k]: e.target.value });
  const mudar = (k: keyof typeof empresa) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setEmpresa({ ...empresa, [k]: e.target.value });

  return (
    <div className="conteudo" style={{ margin: '0 auto' }}>
      <form className="coluna" onSubmit={enviar}>
        <h1>Cadastre sua autoescola</h1>
        <p className="suave">
          Depois do cadastro, envie os documentos para análise. Após a aprovação, sua autoescola
          aparece no app.
        </p>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        {!eu && (
          <div className="cartao">
            <h2>Seus dados (responsável)</h2>
            <div className="campos">
              <Campo
                rotulo="Nome completo"
                value={conta.nome}
                onChange={mudarConta('nome')}
                required
              />
              <Campo rotulo="CPF" value={conta.cpf} onChange={mudarConta('cpf')} required />
              <Campo
                rotulo="E-mail"
                type="email"
                value={conta.email}
                onChange={mudarConta('email')}
                required
              />
              <Campo
                rotulo="Celular"
                value={conta.telefone}
                onChange={mudarConta('telefone')}
                required
              />
              <Campo
                rotulo="Senha"
                type="password"
                value={conta.senha}
                onChange={mudarConta('senha')}
                required
                minLength={8}
                ajuda="Mínimo de 8 caracteres"
              />
            </div>
          </div>
        )}
        <div className="cartao">
          <h2>Empresa</h2>
          <div className="campos">
            <Campo
              rotulo="Razão social"
              value={empresa.razaoSocial}
              onChange={mudar('razaoSocial')}
              required
            />
            <Campo
              rotulo="Nome fantasia"
              value={empresa.nomeFantasia}
              onChange={mudar('nomeFantasia')}
              required
            />
            <Campo rotulo="CNPJ" value={empresa.cnpj} onChange={mudar('cnpj')} required />
            <Campo
              rotulo="Nº de credenciamento no DETRAN"
              value={empresa.credenciamentoDetran}
              onChange={mudar('credenciamentoDetran')}
              required
            />
            <Campo
              rotulo="Telefone"
              value={empresa.telefone}
              onChange={mudar('telefone')}
              required
            />
            <Campo
              rotulo="WhatsApp"
              value={empresa.whatsapp}
              onChange={mudar('whatsapp')}
              required
            />
            <Campo
              rotulo="E-mail de contato"
              type="email"
              value={empresa.email}
              onChange={mudar('email')}
              required
            />
          </div>
        </div>
        <div className="cartao">
          <h2>Endereço</h2>
          <div className="campos">
            <Campo
              rotulo="CEP"
              value={empresa.cep}
              onChange={mudar('cep')}
              onBlur={buscarCep}
              required
            />
            <Campo
              rotulo="Logradouro"
              value={empresa.logradouro}
              onChange={mudar('logradouro')}
              required
            />
            <Campo rotulo="Número" value={empresa.numero} onChange={mudar('numero')} required />
            <Campo
              rotulo="Complemento"
              value={empresa.complemento}
              onChange={mudar('complemento')}
            />
            <Campo rotulo="Bairro" value={empresa.bairro} onChange={mudar('bairro')} required />
            <Campo
              rotulo="Cidade"
              value={empresa.municipio}
              onChange={mudar('municipio')}
              required
            />
            <Campo rotulo="UF" value={empresa.uf} onChange={mudar('uf')} required maxLength={2} />
          </div>
        </div>
        <label className="linha">
          <input
            type="checkbox"
            checked={termos}
            onChange={(e) => setTermos(e.target.checked)}
            required
          />
          <span>
            Li e aceito os termos de uso, a política de privacidade e o termo da autoescola
            parceira.
          </span>
        </label>
        <div>
          <button className="botao" disabled={enviando}>
            {enviando ? 'Enviando…' : 'Cadastrar autoescola'}
          </button>
        </div>
      </form>
    </div>
  );
}
