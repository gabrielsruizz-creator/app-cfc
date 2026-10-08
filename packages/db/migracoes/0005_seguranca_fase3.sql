-- Fase 3: FK do cupom no pedido e RLS das tabelas novas (mesmos padrões da 0001/0003).

ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_cupom_id_cupons_id_fk"
  FOREIGN KEY ("cupom_id") REFERENCES "public"."cupons"("id");
--> statement-breakpoint

-- Cupons: a plataforma vê tudo; instrutor e autoescola gerenciam os próprios (sempre bancados por eles).
ALTER TABLE cupons ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY cupons_isolamento ON cupons
  USING (app_e_plataforma() OR app_e_instrutor(instrutor_id) OR app_e_autoescola(autoescola_id))
  WITH CHECK (
    app_e_plataforma()
    OR ((app_e_instrutor(instrutor_id) OR app_e_autoescola(autoescola_id)) AND bancado_por = 'vendedor')
  );
--> statement-breakpoint

-- Usos de cupom: o aluno, o vendedor do pedido e a plataforma.
ALTER TABLE cupom_usos ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY cupom_usos_isolamento ON cupom_usos
  USING (app_e_plataforma() OR app_e_aluno(aluno_id) OR app_e_instrutor(instrutor_id) OR app_e_autoescola(autoescola_id))
  WITH CHECK (app_e_plataforma());
--> statement-breakpoint

-- Posições: só o instrutor grava; aluno e instrutor da aula leem.
ALTER TABLE aula_posicoes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY aula_posicoes_isolamento ON aula_posicoes
  USING (app_e_plataforma() OR app_e_aluno(aluno_id) OR app_e_instrutor(instrutor_id))
  WITH CHECK (app_e_plataforma() OR app_e_instrutor(instrutor_id));
--> statement-breakpoint

-- Compartilhamentos: só o aluno dono (a leitura pública pelo link passa pela API, que confere o token).
ALTER TABLE aula_compartilhamentos ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY aula_compartilhamentos_isolamento ON aula_compartilhamentos
  USING (app_e_plataforma() OR app_e_aluno(aluno_id))
  WITH CHECK (app_e_plataforma() OR app_e_aluno(aluno_id));
--> statement-breakpoint

DO $$
DECLARE t text;
BEGIN
  IF NOT app_papel_disponivel() THEN
    FOREACH t IN ARRAY ARRAY['cupons', 'cupom_usos', 'aula_posicoes', 'aula_compartilhamentos'] LOOP
      EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    END LOOP;
  END IF;
END $$;
