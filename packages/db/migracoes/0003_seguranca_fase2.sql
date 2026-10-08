-- RLS das tabelas da Fase 2 (mesmos padrões da 0001_seguranca).

-- Recriada aqui para bancos migrados com versões antigas da 0001.
CREATE OR REPLACE FUNCTION app_papel_disponivel() RETURNS boolean
  LANGUAGE sql STABLE AS $$
    SELECT CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'volante_app')
                THEN pg_has_role(current_user, 'volante_app', 'MEMBER') ELSE false END
  $$;

-- Vitrine: leitura pública, escrita só pela própria autoescola.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['autoescola_horarios', 'autoescola_fotos'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING (app_e_plataforma() OR app_e_autoescola(autoescola_id)) '
      'WITH CHECK (app_e_plataforma() OR app_e_autoescola(autoescola_id))',
      t || '_isolamento', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (true)', t || '_vitrine', t);
  END LOOP;
END $$;

-- Vínculos, recebimento e saques: a autoescola ou o instrutor dono.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['instrutor_vinculos', 'contas_recebimento', 'saques'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING ('
      '  app_e_plataforma() OR app_e_instrutor(instrutor_id) OR app_e_autoescola(autoescola_id)'
      ') WITH CHECK ('
      '  app_e_plataforma() OR app_e_instrutor(instrutor_id) OR app_e_autoescola(autoescola_id)'
      ')',
      t || '_isolamento', t);
  END LOOP;
END $$;

-- Vínculos ativos são públicos (a vitrine mostra os instrutores de cada autoescola).
CREATE POLICY instrutor_vinculos_publicos ON instrutor_vinculos FOR SELECT USING (status = 'ativo');

-- Chat: só os participantes da conversa.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['conversas', 'mensagens'] LOOP
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

-- Sem o papel da aplicação, o RLS também vale para o dono das tabelas (ver 0001).
DO $$
DECLARE t text;
BEGIN
  IF NOT app_papel_disponivel() THEN
    FOREACH t IN ARRAY ARRAY[
      'autoescola_horarios', 'autoescola_fotos', 'instrutor_vinculos', 'contas_recebimento',
      'saques', 'conversas', 'mensagens'
    ] LOOP
      EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    END LOOP;
  END IF;
END $$;
