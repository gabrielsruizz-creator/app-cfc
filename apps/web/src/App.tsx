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
import { AdminOperacoes } from './paginas/admin/Operacoes';
import { AutoescolaCadastro } from './paginas/autoescola/Cadastro';
import { EmBreve } from './paginas/autoescola/EmBreve';
import { AutoescolaIntegracoes } from './paginas/autoescola/Integracoes';
import { AutoescolaPainel } from './paginas/autoescola/Painel';
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
            <NavLink to="/autoescola/novos-alunos">Novos alunos do app</NavLink>
            <NavLink to="/autoescola/alunos">Alunos</NavLink>
            <NavLink to="/autoescola/agenda">Agenda</NavLink>
            <NavLink to="/autoescola/instrutores">Instrutores</NavLink>
            <NavLink to="/autoescola/pacotes">Pacotes</NavLink>
            <NavLink to="/autoescola/vitrine">Vitrine</NavLink>
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
        <Route path="operacoes" element={<AdminOperacoes />} />
        <Route path="auditoria" element={<AdminAuditoria />} />
        <Route path="comissoes" element={<AdminComissoes />} />
        <Route path="configuracoes" element={<AdminConfiguracoes />} />
      </Route>
      <Route path="/autoescola" element={<Protegido area="autoescola" />}>
        <Route index element={<AutoescolaPainel />} />
        <Route path="integracoes" element={<AutoescolaIntegracoes />} />
        <Route path=":secao" element={<EmBreve />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
