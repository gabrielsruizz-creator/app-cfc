import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { mensagem } from '../api';
import { useAuth } from '../auth';
import { Aviso, Campo } from '../componentes/comum';

export function Entrar() {
  const { entrar } = useAuth();
  const navegar = useNavigate();
  const [login, setLogin] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await entrar(login, senha);
      navegar('/');
    } catch (err) {
      setErro(mensagem(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="centro-tela">
      <form className="cartao cartao-login" onSubmit={enviar}>
        <h1>Volante</h1>
        <p className="suave">Painel da autoescola e administração</p>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        <Campo
          rotulo="E-mail ou CPF"
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          autoComplete="username"
          required
        />
        <Campo
          rotulo="Senha"
          type="password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          autoComplete="current-password"
          required
        />
        <button className="botao" disabled={enviando}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
        <p className="pequeno suave">
          Ainda não tem conta? Crie pelo app e depois{' '}
          <Link to="/autoescola/cadastro">cadastre sua autoescola</Link>.
        </p>
      </form>
    </div>
  );
}
