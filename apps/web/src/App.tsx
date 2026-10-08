import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Navigate, NavLink, Outlet, Route, Routes, useNavigate } from 'react-router-dom';
import { api, sessao } from './api';
import { useAuth } from './auth';
import { Carregando } from './componentes/comum';
import { AdminAuditoria } from './paginas/admin/Auditoria';
import { AdminAulas } from './paginas/admin/Aulas';
import { AdminAutoescola, AdminAutoescolas } from './paginas/admin/Autoescolas';
import { AdminComissoes } from './paginas/admin/Comissoes';
import { AdminConfiguracoes } from './paginas/admin/Configuracoes';
import { AdminInicio } from './paginas/admin/Inicio';
import { AdminInstrutor, AdminInstrutores } from './paginas/admin/Instrutores';
import { AdminDenuncias, AdminDisputas, AdminUsuarios } from './paginas/admin/Moderacao';
import { AdminOperacoes } from './paginas/admin/Operacoes';
import { AutoescolaCadastro } from './paginas/autoescola/Cadastro';
import { PainelFinanceiro } from './componentes/Financeiro';
import {
  AutoescolaAgenda,
  AutoescolaAlunos,
  AutoescolaInstrutores,
} from './paginas/autoescola/Equipe';
import { AutoescolaIntegracoes } from './paginas/autoescola/Integracoes';
import { AutoescolaNovosAlunos } from './paginas/autoescola/NovosAlunos';
import { AutoescolaPacotes } from './paginas/autoescola/Pacotes';
import { AutoescolaPainel } from './paginas/autoescola/Painel';
import {
  AutoescolaAvaliacoes,
  AutoescolaConversas,
  AutoescolaVitrine,
} from './paginas/autoescola/Vitrine';
import { Entrar } from './paginas/Entrar';

function AlternarTema() {
  const [tema, setTema] = useState(() => {
    try {
      return localStorage.getItem('volante_tema') ?? 'sistema';
    } catch {
      return 'sistema';
    }
  });
  useEffect(() => {
    if (tema === 'sistema') document.documentElement.removeAttribute('data-tema');
    else document.documentElement.setAttribute('data-tema', tema);
    try {
      localStorage.setItem('volante_tema', tema);
    } catch {
      /* ignora */
    }
  }, [tema]);
  return (
    <div className="campo">
      <label htmlFor="tema">Tema</label>
      <select id="tema" value={tema} onChange={(e) => setTema(e.target.value)}>
        <option value="sistema">Automático</option>
        <option value="claro">Claro</option>
        <option value="escuro">Escuro</option>
      </select>
    </div>
  );
}

function Layout({ area }: { area: 'admin' | 'autoescola' }) {
  const { eu, sair } = useAuth();
  const navegar = useNavigate();
  const resumo = useQuery({
    queryKey: ['admin', 'resumo'],
    queryFn: () =>
      api<{ instrutoresEmAnalise: number; autoescolasEmAnalise: number; eventosComFalha: number }>(
        '/admin/resumo',
      ),
    enabled: area === 'admin',
  });
  const dash = useQuery({
    queryKey: ['admin', 'dashboard'],
    queryFn: () => api<{ denunciasAbertas: number; disputasAbertas: number }>('/admin/dashboard'),
    enabled: area === 'admin',
  });
  const fila = useQuery({
    queryKey: ['autoescola', 'resumo'],
    queryFn: () => api<{ novos: number }>('/autoescola/resumo'),
    enabled: area === 'autoescola',
    retry: false,
    refetchInterval: 60_000,
  });
  const contador = (n?: number) => (n ? <span className="selo amarelo">{n}</span> : null);

  return (
    <div className="layout">
      <nav className="menu" aria-label="Menu principal">
        <div className="marca">Volante</div>
        {area === 'admin' ? (
          <>
            <NavLink to="/admin" end>
              Início
            </NavLink>
            <span className="rotulo">Aprovações</span>
            <NavLink to="/admin/instrutores">
              Instrutores {contador(resumo.data?.instrutoresEmAnalise)}
            </NavLink>
            <NavLink to="/admin/autoescolas">
              Autoescolas {contador(resumo.data?.autoescolasEmAnalise)}
            </NavLink>
            <span className="rotulo">Operação</span>
            <NavLink to="/admin/aulas">Aulas</NavLink>
            <NavLink to="/admin/usuarios">Usuários</NavLink>
            <NavLink to="/admin/disputas">Disputas {contador(dash.data?.disputasAbertas)}</NavLink>
            <NavLink to="/admin/denuncias">
              Denúncias {contador(dash.data?.denunciasAbertas)}
            </NavLink>
            <NavLink to="/admin/operacoes">
              Operações {contador(resumo.data?.eventosComFalha)}
            </NavLink>
            <NavLink to="/admin/auditoria">Auditoria</NavLink>
            <span className="rotulo">Regras</span>
            <NavLink to="/admin/comissoes">Comissões</NavLink>
            <NavLink to="/admin/configuracoes">Configurações</NavLink>
          </>
        ) : (
          <>
            {eu && eu.autoescolas.length > 1 && (
              <div className="campo">
                <label htmlFor="autoescola">Autoescola</label>
                <select
                  id="autoescola"
                  value={sessao.autoescola() ?? ''}
                  onChange={(e) => {
                    sessao.definirAutoescola(e.target.value);
                    window.location.reload();
                  }}
                >
                  {eu.autoescolas.map((a) => (
                    <option key={a.autoescolaId} value={a.autoescolaId}>
                      {a.nomeFantasia}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <NavLink to="/autoescola" end>
              Início
            </NavLink>
            <NavLink to="/autoescola/novos-alunos">
              Novos alunos do app {contador(fila.data?.novos)}
            </NavLink>
            <NavLink to="/autoescola/alunos">Alunos</NavLink>
            <NavLink to="/autoescola/agenda">Agenda</NavLink>
            <NavLink to="/autoescola/conversas">Conversas</NavLink>
            <span className="rotulo">Gestão</span>
            <NavLink to="/autoescola/instrutores">Instrutores</NavLink>
            <NavLink to="/autoescola/pacotes">Pacotes</NavLink>
            <NavLink to="/autoescola/vitrine">Vitrine</NavLink>
            <NavLink to="/autoescola/avaliacoes">Avaliações</NavLink>
            <NavLink to="/autoescola/financeiro">Financeiro</NavLink>
            <NavLink to="/autoescola/integracoes">Integrações</NavLink>
          </>
        )}
        <div className="rodape">
          {eu?.admin && eu.autoescolas.length > 0 && (
            <button
              className="botao texto pequeno"
              onClick={() => navegar(area === 'admin' ? '/autoescola' : '/admin')}
            >
              Ir para {area === 'admin' ? 'autoescola' : 'administração'}
            </button>
          )}
          <AlternarTema />
          <span className="pequeno suave">{eu?.nome}</span>
          <button
            className="botao secundario pequeno"
            onClick={async () => {
              await sair();
              navegar('/entrar');
            }}
          >
            Sair
          </button>
        </div>
      </nav>
      <main className="conteudo">
        <Outlet />
      </main>
    </div>
  );
}

function Protegido({ area }: { area: 'admin' | 'autoescola' }) {
  const { eu, carregando } = useAuth();
  if (carregando)
    return (
      <div className="centro-tela">
        <Carregando />
      </div>
    );
  if (!eu) return <Navigate to="/entrar" replace />;
  if (area === 'admin' && !eu.admin) return <Navigate to="/autoescola" replace />;
  if (area === 'autoescola' && !eu.autoescolas.length)
    return <Navigate to="/autoescola/cadastro" replace />;
  return <Layout area={area} />;
}

function Inicio() {
  const { eu, carregando } = useAuth();
  if (carregando)
    return (
      <div className="centro-tela">
        <Carregando />
      </div>
    );
  if (!eu) return <Navigate to="/entrar" replace />;
  if (eu.admin) return <Navigate to="/admin" replace />;
  if (eu.autoescolas.length) return <Navigate to="/autoescola" replace />;
  return <Navigate to="/autoescola/cadastro" replace />;
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Inicio />} />
      <Route path="/entrar" element={<Entrar />} />
      <Route path="/autoescola/cadastro" element={<AutoescolaCadastro />} />
      <Route path="/admin" element={<Protegido area="admin" />}>
        <Route index element={<AdminInicio />} />
        <Route path="instrutores" element={<AdminInstrutores />} />
        <Route path="instrutores/:id" element={<AdminInstrutor />} />
        <Route path="autoescolas" element={<AdminAutoescolas />} />
        <Route path="autoescolas/:id" element={<AdminAutoescola />} />
        <Route path="aulas" element={<AdminAulas />} />
        <Route path="usuarios" element={<AdminUsuarios />} />
        <Route path="disputas" element={<AdminDisputas />} />
        <Route path="denuncias" element={<AdminDenuncias />} />
        <Route path="operacoes" element={<AdminOperacoes />} />
        <Route path="auditoria" element={<AdminAuditoria />} />
        <Route path="comissoes" element={<AdminComissoes />} />
        <Route path="configuracoes" element={<AdminConfiguracoes />} />
      </Route>
      <Route path="/autoescola" element={<Protegido area="autoescola" />}>
        <Route index element={<AutoescolaPainel />} />
        <Route path="novos-alunos" element={<AutoescolaNovosAlunos />} />
        <Route path="alunos" element={<AutoescolaAlunos />} />
        <Route path="agenda" element={<AutoescolaAgenda />} />
        <Route path="conversas" element={<AutoescolaConversas />} />
        <Route path="instrutores" element={<AutoescolaInstrutores />} />
        <Route path="pacotes" element={<AutoescolaPacotes />} />
        <Route path="vitrine" element={<AutoescolaVitrine />} />
        <Route path="avaliacoes" element={<AutoescolaAvaliacoes />} />
        <Route path="financeiro" element={<PainelFinanceiro base="/autoescola" />} />
        <Route path="integracoes" element={<AutoescolaIntegracoes />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
