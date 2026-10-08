import type { RespostaSessao } from '@volante/contracts';
import { router } from 'expo-router';
import { useState } from 'react';
import { Aviso, Botao, Campo, Tela, Texto } from '../src/componentes/ui';
import { api, mensagemDeErro, urlApi } from '../src/servicos/api';
import { useAuth } from '../src/servicos/AuthProvider';

export default function Entrar() {
  const { aplicarSessao } = useAuth();
  const [login, setLogin] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function entrar() {
    setErro(null);
    setEnviando(true);
    try {
      const r = await api<RespostaSessao>('/auth/entrar', { corpo: { login, senha } });
      await aplicarSessao(r);
      router.replace('/');
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Tela>
      <Texto tipo="titulo">Bem-vindo de volta</Texto>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      <Campo
        rotulo="E-mail ou CPF"
        value={login}
        onChangeText={setLogin}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="username"
      />
      <Campo
        rotulo="Senha"
        value={senha}
        onChangeText={setSenha}
        secureTextEntry
        autoComplete="password"
        onSubmitEditing={entrar}
      />
      <Botao
        titulo="Entrar"
        aoPressionar={entrar}
        carregando={enviando}
        desabilitado={!login || !senha}
      />
      {__DEV__ && (
        <Texto tipo="pequeno" centro>
          Servidor: {urlApi()} · contas de teste: aluno@demo.com / instrutor@demo.com (senha
          demo1234)
        </Texto>
      )}
    </Tela>
  );
}
