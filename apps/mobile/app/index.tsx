import { Redirect } from 'expo-router';
import { Carregando } from '../src/componentes/ui';
import { useAuth } from '../src/servicos/AuthProvider';

/** Decide a primeira tela conforme a sessão e o modo (aluno ou instrutor). */
export default function Inicio() {
  const { carregando, eu, modo } = useAuth();
  if (carregando) return <Carregando />;
  if (!eu) return <Redirect href="/boas-vindas" />;
  if (modo === 'instrutor' && eu.instrutor) return <Redirect href="/agenda" />;
  if (!eu.aluno && eu.instrutor) return <Redirect href="/agenda" />;
  if (!eu.aluno) return <Redirect href="/completar-aluno" />;
  return <Redirect href="/inicio" />;
}
