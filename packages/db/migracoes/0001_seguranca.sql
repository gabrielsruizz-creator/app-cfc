-- =====================================================================
-- Segurança e integridade que o Drizzle não expressa no schema TS:
--   * papel da aplicação e permissões
--   * Row Level Security (isolamento entre autoescolas, alunos e instrutores)
--   * restrições EXCLUDE (sem conflito de horário na agenda)
--   * tabelas append-only e auditoria imutável com cadeia de hashes
--   * NOTIFY para acordar o worker quando há evento na outbox
-- =====================================================================

-- ---------- Papel da aplicação ----------
-- A API e o worker conectam assumindo o papel volante_app. Esse papel não é dono das
-- tabelas e não tem BYPASSRLS, então as políticas abaixo sempre se aplicam a ele.
-- Em bancos gerenciados que não permitem CREATE ROLE (ex.: alguns planos de nuvem), o papel
-- não é criado: o RLS passa a ser FORÇADO também para o dono das tabelas (fim deste arquivo)
-- e a aplicação conecta sem trocar de papel. O isolamento continua o mesmo.
CREATE OR REPLACE FUNCTION app_papel_disponivel() RETURNS boolean
  LANGUAGE sql STABLE AS $$
    SELECT CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'volante_app')
                THEN pg_has_role(current_user, 'volante_app', 'MEMBER') ELSE false END
  $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'volante_app') THEN
    BEGIN
      CREATE ROLE volante_app NOLOGIN;
    EXCEPTION
      WHEN duplicate_object OR unique_violation THEN
        NULL; -- outro processo criou o papel ao mesmo tempo (o papel é global no servidor)
      WHEN insufficient_privilege THEN
        RAISE NOTICE 'Sem permissão para criar o papel volante_app: RLS será forçado para o dono das tabelas.';
        RETURN;
    END;
  END IF;
  BEGIN
    EXECUTE format('GRANT volante_app TO %I', current_user);
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'Sem permissão para assumir o papel volante_app: RLS será forçado para o dono das tabelas.';
  END;
END $$;

-- Permissões do papel (aplicadas no fim do arquivo, depois que todos os objetos existem).

-- ---------- Contexto da requisição ----------
-- Definido com set_config(..., true) no início de cada transação (ver src/contexto.ts).
CREATE OR REPLACE FUNCTION app_ctx(nome text) RETURNS text
  LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.' || nome, true), '') $$;

CREATE OR REPLACE FUNCTION app_ctx_uuid(nome text) RETURNS uuid
  LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.' || nome, true), '')::uuid $$;

CREATE OR REPLACE FUNCTION app_e_plataforma() RETURNS boolean
  LANGUAGE sql STABLE AS $$ SELECT coalesce(app_ctx('ator_tipo') IN ('admin', 'sistema'), false) $$;

CREATE OR REPLACE FUNCTION app_e_autoescola(p_autoescola uuid) RETURNS boolean
  LANGUAGE sql STABLE AS $$
    SELECT coalesce(app_ctx('ator_tipo') = 'autoescola' AND p_autoescola = app_ctx_uuid('autoescola_id'), false)
  $$;

CREATE OR REPLACE FUNCTION app_e_aluno(p_aluno uuid) RETURNS boolean
  LANGUAGE sql STABLE AS $$
    SELECT coalesce(app_ctx('ator_tipo') = 'aluno' AND p_aluno = app_ctx_uuid('aluno_id'), false)
  $$;

CREATE OR REPLACE FUNCTION app_e_instrutor(p_instrutor uuid) RETURNS boolean
  LANGUAGE sql STABLE AS $$
    SELECT coalesce(app_ctx('ator_tipo') = 'instrutor' AND p_instrutor = app_ctx_uuid('instrutor_id'), false)
  $$;

-- ---------- RLS: tabelas exclusivas de uma autoescola ----------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'autoescola_membros', 'autoescola_documentos', 'integracoes_autoescola',
    'vinculos_externos', 'operacoes_integracao', 'matriculas'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING (app_e_plataforma() OR app_e_autoescola(autoescola_id)) '
      'WITH CHECK (app_e_plataforma() OR app_e_autoescola(autoescola_id))',
      t || '_isolamento', t);
  END LOOP;
END $$;

-- O usuário enxerga os próprios vínculos (para listar "minhas autoescolas").
CREATE POLICY autoescola_membros_proprios ON autoescola_membros FOR SELECT
  USING (usuario_id = app_ctx_uuid('usuario_id'));

-- matrícula também é visível ao próprio aluno
CREATE POLICY matriculas_aluno ON matriculas FOR SELECT USING (app_e_aluno(aluno_id));

-- ---------- RLS: autoescolas ----------
ALTER TABLE autoescolas ENABLE ROW LEVEL SECURITY;
CREATE POLICY autoescolas_isolamento ON autoescolas
  USING (app_e_plataforma() OR app_e_autoescola(id))
  WITH CHECK (app_e_plataforma() OR app_e_autoescola(id));
CREATE POLICY autoescolas_vitrine ON autoescolas FOR SELECT USING (status = 'aprovada');
CREATE POLICY autoescolas_minhas ON autoescolas FOR SELECT USING (
  id IN (SELECT m.autoescola_id FROM autoescola_membros m
         WHERE m.usuario_id = app_ctx_uuid('usuario_id') AND m.status = 'ativo')
);

-- ---------- RLS: tabelas compartilhadas entre aluno, instrutor e autoescola ----------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'pedidos', 'pedido_historico', 'creditos_aula', 'cobrancas', 'estornos',
    'aulas', 'aula_historico', 'registros_evolucao', 'aula_anotacoes', 'recibos'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING ('
      '  app_e_plataforma() OR app_e_aluno(aluno_id) OR app_e_instrutor(instrutor_id) OR app_e_autoescola(autoescola_id)'
      ') WITH CHECK ('
      '  app_e_plataforma() OR app_e_aluno(aluno_id) OR app_e_instrutor(instrutor_id) OR app_e_autoescola(autoescola_id)'
      ')',
      t || '_isolamento', t);
  END LOOP;
END $$;

-- creditos_movimentos não tem as colunas de dono: herda o acesso do crédito.
ALTER TABLE creditos_movimentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY creditos_movimentos_isolamento ON creditos_movimentos
  USING (EXISTS (SELECT 1 FROM creditos_aula c WHERE c.id = credito_id))
  WITH CHECK (EXISTS (SELECT 1 FROM creditos_aula c WHERE c.id = credito_id));

-- ---------- RLS: financeiro (sem visão do aluno) ----------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['contas_financeiras', 'lancamentos', 'repasses'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING ('
      '  app_e_plataforma() OR app_e_instrutor(instrutor_id) OR app_e_autoescola(autoescola_id)'
      ') WITH CHECK (app_e_plataforma())',
      t || '_isolamento', t);
  END LOOP;
END $$;

-- ---------- RLS: pacotes e avaliações (com leitura pública) ----------
ALTER TABLE pacotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY pacotes_dono ON pacotes
  USING (app_e_plataforma() OR app_e_instrutor(instrutor_id) OR app_e_autoescola(autoescola_id))
  WITH CHECK (app_e_plataforma() OR app_e_instrutor(instrutor_id) OR app_e_autoescola(autoescola_id));
CREATE POLICY pacotes_vitrine ON pacotes FOR SELECT USING (publicado AND arquivado_em IS NULL);

ALTER TABLE avaliacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY avaliacoes_envolvidos ON avaliacoes
  USING (app_e_plataforma() OR app_e_aluno(autor_aluno_id) OR app_e_instrutor(instrutor_id) OR app_e_autoescola(autoescola_id))
  WITH CHECK (app_e_plataforma() OR app_e_aluno(autor_aluno_id) OR app_e_instrutor(instrutor_id) OR app_e_autoescola(autoescola_id));
CREATE POLICY avaliacoes_publicas ON avaliacoes FOR SELECT USING (status = 'publicada');

-- ---------- Agenda: impossível ter duas aulas no mesmo horário ----------
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE aulas ADD CONSTRAINT aulas_sem_conflito_instrutor
  EXCLUDE USING gist (instrutor_id WITH =, periodo WITH &&)
  WHERE (status IN ('aguardando_pagamento', 'solicitada', 'confirmada', 'a_caminho', 'em_andamento'));

ALTER TABLE aulas ADD CONSTRAINT aulas_sem_conflito_aluno
  EXCLUDE USING gist (aluno_id WITH =, periodo WITH &&)
  WHERE (status IN ('aguardando_pagamento', 'solicitada', 'confirmada', 'a_caminho', 'em_andamento'));

-- Horários ocupados de um instrutor, sem expor dados das aulas de outros alunos.
-- SECURITY DEFINER: executa como dono da tabela (fora do RLS) e devolve só intervalos.
CREATE OR REPLACE FUNCTION horarios_ocupados_instrutor(p_instrutor uuid, p_de timestamptz, p_ate timestamptz)
  RETURNS TABLE (inicio timestamptz, fim timestamptz)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ator_anterior text := current_setting('app.ator_tipo', true);
BEGIN
  -- Com RLS forçado (sem o papel volante_app), o dono também passa pelas políticas:
  -- assume "sistema" só durante esta consulta e restaura o contexto anterior.
  PERFORM set_config('app.ator_tipo', 'sistema', true);
  RETURN QUERY
    SELECT a.inicio, a.fim FROM aulas a
    WHERE a.instrutor_id = p_instrutor
      AND a.status IN ('aguardando_pagamento', 'solicitada', 'confirmada', 'a_caminho', 'em_andamento')
      AND a.periodo && tstzrange(p_de, p_ate, '[)');
  PERFORM set_config('app.ator_tipo', coalesce(ator_anterior, ''), true);
END $$;
REVOKE ALL ON FUNCTION horarios_ocupados_instrutor(uuid, timestamptz, timestamptz) FROM PUBLIC;

-- ---------- Tabelas append-only ----------
CREATE OR REPLACE FUNCTION impedir_alteracao() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'A tabela %.% é somente inclusão (append-only)', TG_TABLE_SCHEMA, TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'lancamentos', 'consentimentos', 'pedido_historico', 'aula_historico', 'creditos_movimentos'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION impedir_alteracao()',
      t || '_append_only', t);
  END LOOP;
END $$;

-- ---------- Auditoria imutável com cadeia de hashes ----------
CREATE SEQUENCE IF NOT EXISTS auditoria.registros_seq;

CREATE OR REPLACE FUNCTION auditoria.encadear() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = auditoria, public AS $$
DECLARE
  anterior bytea;
BEGIN
  -- Serializa inserções para que a ordem da cadeia seja a ordem de gravação.
  PERFORM pg_advisory_xact_lock(hashtext('auditoria.registros'));
  SELECT r.hash INTO anterior FROM auditoria.registros r ORDER BY r.seq DESC LIMIT 1;
  NEW.seq := nextval('auditoria.registros_seq');
  NEW.hash_anterior := anterior;
  NEW.hash := sha256(
    coalesce(anterior, '\x'::bytea) || convert_to(auditoria.conteudo_canonico(NEW), 'UTF8')
  );
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION auditoria.conteudo_canonico(r auditoria.registros) RETURNS text
  LANGUAGE sql IMMUTABLE AS $$
    SELECT concat_ws('|', r.id::text, to_char(r.ocorrido_em AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
      coalesce(r.ator_usuario_id::text, ''), r.ator_tipo, coalesce(r.autoescola_id::text, ''),
      r.entidade_tipo, r.entidade_id::text, r.acao,
      coalesce(r.antes::text, ''), coalesce(r.depois::text, ''), coalesce(r.motivo, ''))
  $$;

CREATE TRIGGER registros_encadear BEFORE INSERT ON auditoria.registros
  FOR EACH ROW EXECUTE FUNCTION auditoria.encadear();
CREATE TRIGGER registros_imutavel BEFORE UPDATE OR DELETE ON auditoria.registros
  FOR EACH ROW EXECUTE FUNCTION impedir_alteracao();
CREATE TRIGGER registros_sem_truncate BEFORE TRUNCATE ON auditoria.registros
  FOR EACH STATEMENT EXECUTE FUNCTION impedir_alteracao();

-- Retorna o seq do primeiro registro cuja cadeia não confere (NULL = íntegra).
CREATE OR REPLACE FUNCTION auditoria.verificar_cadeia() RETURNS bigint
  LANGUAGE plpgsql STABLE AS $$
DECLARE
  r auditoria.registros;
  anterior bytea := NULL;
BEGIN
  FOR r IN SELECT * FROM auditoria.registros ORDER BY seq LOOP
    IF r.hash_anterior IS DISTINCT FROM anterior
       OR r.hash IS DISTINCT FROM sha256(coalesce(anterior, '\x'::bytea) || convert_to(auditoria.conteudo_canonico(r), 'UTF8')) THEN
      RETURN r.seq;
    END IF;
    anterior := r.hash;
  END LOOP;
  RETURN NULL;
END $$;

-- ---------- Outbox: acorda o worker ----------
CREATE OR REPLACE FUNCTION outbox_notificar() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('outbox', NEW.tipo);
  RETURN NULL;
END $$;

CREATE TRIGGER outbox_eventos_notificar AFTER INSERT ON outbox_eventos
  FOR EACH ROW EXECUTE FUNCTION outbox_notificar();

-- ---------- Permissões do papel da aplicação, ou RLS forçado sem ele ----------
DO $$
DECLARE t text;
BEGIN
  IF app_papel_disponivel() THEN
    GRANT USAGE ON SCHEMA public TO volante_app;
    GRANT USAGE ON SCHEMA auditoria TO volante_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO volante_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO volante_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO volante_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO volante_app;
    GRANT SELECT, INSERT ON auditoria.registros TO volante_app;
    GRANT EXECUTE ON FUNCTION horarios_ocupados_instrutor(uuid, timestamptz, timestamptz) TO volante_app;
    GRANT EXECUTE ON FUNCTION auditoria.verificar_cadeia() TO volante_app;
    REVOKE UPDATE, DELETE, TRUNCATE ON auditoria.registros FROM volante_app;
    FOREACH t IN ARRAY ARRAY['lancamentos', 'consentimentos', 'pedido_historico', 'aula_historico', 'creditos_movimentos'] LOOP
      EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON %I FROM volante_app', t);
    END LOOP;
  ELSE
    FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity LOOP
      EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    END LOOP;
  END IF;
END $$;
