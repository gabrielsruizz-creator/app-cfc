import { cadastroUsuario, type RespostaSessao } from '@volante/contracts';
import { Link, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  Aviso,
  Botao,
  CaixaSelecao,
  Campo,
  Chip,
  Coluna,
  Linha,
  Tela,
  Texto,
} from '../src/componentes/ui';
import { api, mensagemDeErro } from '../src/servicos/api';
import { useAuth } from '../src/servicos/AuthProvider';
import { useTema } from '../src/tema/TemaProvider';
import { dataBrParaIso, mascararCpf, mascararData, mascararTelefone } from '../src/util/formatos';

const GENEROS = [
  { valor: 'feminino', rotulo: 'Feminino' },
  { valor: 'masculino', rotulo: 'Masculino' },
  { valor: 'outro', rotulo: 'Outro' },
  { valor: 'prefiro_nao_informar', rotulo: 'Prefiro não dizer' },
] as const;

export default function Cadastro() {
  const { perfil } = useLocalSearchParams<{ perfil?: string }>();
  const instrutor = perfil === 'instrutor';
  const { aplicarSessao, definirModo } = useAuth();
  const { cores } = useTema();
  const [f, setF] = useState({
    nome: '',
    cpf: '',
    email: '',
    telefone: '',
    senha: '',
    nascimento: '',
    genero: '',
  });
  const [termos, setTermos] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const mudar = (campo: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [campo]: v }));

  async function enviar() {
    setErroGeral(null);
    const dados = {
      nome: f.nome,
      cpf: f.cpf,
      email: f.email,
      telefone: f.telefone,
      senha: f.senha,
      dataNascimento: dataBrParaIso(f.nascimento),
      genero: f.genero || undefined,
      aceitouTermos: termos,
      aceitouPrivacidade: termos,
      aceitaMarketing: marketing,
    };
    const validacao = cadastroUsuario.safeParse(dados);
    if (!validacao.success) {
      const e: Record<string, string> = {};
      for (const i of validacao.error.issues) e[String(i.path[0])] ??= i.message;
      setErros(e);
      return;
    }
    setErros({});
    setEnviando(true);
    try {
      const r = await api<RespostaSessao>('/auth/cadastro', { corpo: dados });
      await aplicarSessao(r);
      if (instrutor) {
        definirModo('instrutor');
        router.replace('/area-instrutor/cadastro');
      } else {
        definirModo('aluno');
        router.replace('/completar-aluno');
      }
    } catch (e) {
      setErroGeral(mensagemDeErro(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Tela>
      <Coluna gap={4}>
        <Texto tipo="titulo">{instrutor ? 'Cadastro de instrutor' : 'Vamos começar'}</Texto>
        <Texto tipo="suave">
          {instrutor
            ? 'Primeiro seus dados pessoais. Depois você envia os documentos para análise.'
            : 'Seus dados são usados para identificar você nas aulas e emitir recibos.'}
        </Texto>
      </Coluna>
      {erroGeral && <Aviso tipo="erro">{erroGeral}</Aviso>}
      <Campo
        rotulo="Nome completo"
        value={f.nome}
        onChangeText={mudar('nome')}
        erro={erros.nome}
        autoComplete="name"
      />
      <Campo
        rotulo="CPF"
        value={f.cpf}
        onChangeText={(v) => mudar('cpf')(mascararCpf(v))}
        erro={erros.cpf}
        keyboardType="number-pad"
      />
      <Campo
        rotulo="Celular"
        value={f.telefone}
        onChangeText={(v) => mudar('telefone')(mascararTelefone(v))}
        erro={erros.telefone}
        keyboardType="phone-pad"
        autoComplete="tel"
      />
      <Campo
        rotulo="E-mail"
        value={f.email}
        onChangeText={mudar('email')}
        erro={erros.email}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
      />
      <Campo
        rotulo="Data de nascimento (opcional)"
        value={f.nascimento}
        onChangeText={(v) => mudar('nascimento')(mascararData(v))}
        placeholder="DD/MM/AAAA"
        keyboardType="number-pad"
      />
      <Coluna>
        <Texto negrito>Gênero (opcional)</Texto>
        <Texto tipo="pequeno">
          {instrutor
            ? 'Alunos podem filtrar instrutores por gênero.'
            : 'Usado apenas para estatísticas.'}
        </Texto>
        <Linha style={{ flexWrap: 'wrap' }}>
          {GENEROS.map((g) => (
            <Chip
              key={g.valor}
              rotulo={g.rotulo}
              selecionado={f.genero === g.valor}
              aoPressionar={() => mudar('genero')(f.genero === g.valor ? '' : g.valor)}
            />
          ))}
        </Linha>
      </Coluna>
      <Campo
        rotulo="Senha"
        value={f.senha}
        onChangeText={mudar('senha')}
        erro={erros.senha}
        secureTextEntry
        ajuda="Mínimo de 8 caracteres"
        autoComplete="new-password"
      />
      <CaixaSelecao
        marcado={termos}
        aoMudar={setTermos}
        rotulo={
          <Texto>
            Li e aceito os{' '}
            <Link
              href="/documento-legal/termos_uso"
              style={{ color: cores.primaria, fontWeight: '700' }}
            >
              termos de uso
            </Link>{' '}
            e a{' '}
            <Link
              href="/documento-legal/politica_privacidade"
              style={{ color: cores.primaria, fontWeight: '700' }}
            >
              política de privacidade
            </Link>
          </Texto>
        }
      />
      {erros.aceitouTermos && <Texto cor={cores.erro}>{erros.aceitouTermos}</Texto>}
      <CaixaSelecao
        marcado={marketing}
        aoMudar={setMarketing}
        rotulo="Quero receber novidades e promoções (opcional)"
      />
      <Botao titulo="Criar conta" aoPressionar={enviar} carregando={enviando} />
    </Tela>
  );
}
