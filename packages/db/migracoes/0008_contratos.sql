CREATE TABLE "contrato_aceites" (
	"id" uuid PRIMARY KEY NOT NULL,
	"contrato_id" uuid NOT NULL,
	"parte" text NOT NULL,
	"forma" text NOT NULL,
	"usuario_id" uuid,
	"nome" text NOT NULL,
	"documento" text,
	"hash_aceito" char(64) NOT NULL,
	"ip" text,
	"user_agent" text,
	"detalhe" text,
	"aceito_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contrato_aceites_parte_ck" CHECK ("contrato_aceites"."parte" in ('contratante', 'contratado')),
	CONSTRAINT "contrato_aceites_forma_ck" CHECK ("contrato_aceites"."forma" in ('clique', 'oferta'))
);
--> statement-breakpoint
CREATE TABLE "contrato_envios" (
	"id" uuid PRIMARY KEY NOT NULL,
	"contrato_id" uuid NOT NULL,
	"parte" text NOT NULL,
	"para" text NOT NULL,
	"status" text NOT NULL,
	"erro" text,
	"evento_origem_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contrato_envios_parte_ck" CHECK ("contrato_envios"."parte" in ('contratante', 'contratado')),
	CONSTRAINT "contrato_envios_status_ck" CHECK ("contrato_envios"."status" in ('enviado', 'pendente_configuracao', 'erro'))
);
--> statement-breakpoint
CREATE TABLE "contratos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"pedido_id" uuid NOT NULL,
	"aluno_id" uuid NOT NULL,
	"instrutor_id" uuid,
	"autoescola_id" uuid,
	"documento_legal_id" uuid,
	"versao" text NOT NULL,
	"corpo_md" text NOT NULL,
	"hash_corpo" char(64) NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "documentos_legais" DROP CONSTRAINT "documentos_legais_tipo_ck";--> statement-breakpoint
ALTER TABLE "contrato_aceites" ADD CONSTRAINT "contrato_aceites_contrato_id_contratos_id_fk" FOREIGN KEY ("contrato_id") REFERENCES "public"."contratos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contrato_aceites" ADD CONSTRAINT "contrato_aceites_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contrato_envios" ADD CONSTRAINT "contrato_envios_contrato_id_contratos_id_fk" FOREIGN KEY ("contrato_id") REFERENCES "public"."contratos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contratos" ADD CONSTRAINT "contratos_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contratos" ADD CONSTRAINT "contratos_aluno_id_alunos_id_fk" FOREIGN KEY ("aluno_id") REFERENCES "public"."alunos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contratos" ADD CONSTRAINT "contratos_instrutor_id_instrutores_id_fk" FOREIGN KEY ("instrutor_id") REFERENCES "public"."instrutores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contratos" ADD CONSTRAINT "contratos_autoescola_id_autoescolas_id_fk" FOREIGN KEY ("autoescola_id") REFERENCES "public"."autoescolas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contratos" ADD CONSTRAINT "contratos_documento_legal_id_documentos_legais_id_fk" FOREIGN KEY ("documento_legal_id") REFERENCES "public"."documentos_legais"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contrato_aceites_parte_uk" ON "contrato_aceites" USING btree ("contrato_id","parte");--> statement-breakpoint
CREATE INDEX "contrato_envios_contrato_idx" ON "contrato_envios" USING btree ("contrato_id","parte");--> statement-breakpoint
CREATE UNIQUE INDEX "contratos_pedido_uk" ON "contratos" USING btree ("pedido_id");--> statement-breakpoint
CREATE INDEX "contratos_aluno_idx" ON "contratos" USING btree ("aluno_id");--> statement-breakpoint
ALTER TABLE "documentos_legais" ADD CONSTRAINT "documentos_legais_tipo_ck" CHECK ("documentos_legais"."tipo" in ('termos_uso', 'politica_privacidade', 'termo_instrutor', 'termo_autoescola', 'contrato_prestacao'));--> statement-breakpoint
-- RLS (mesmos padrões da 0001/0005): aluno, vendedor do pedido e plataforma.
ALTER TABLE contratos ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY contratos_isolamento ON contratos
  USING (app_e_plataforma() OR app_e_aluno(aluno_id) OR app_e_instrutor(instrutor_id) OR app_e_autoescola(autoescola_id))
  WITH CHECK (app_e_plataforma() OR app_e_aluno(aluno_id));--> statement-breakpoint
ALTER TABLE contrato_aceites ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY contrato_aceites_isolamento ON contrato_aceites
  USING (EXISTS (SELECT 1 FROM contratos c WHERE c.id = contrato_id))
  WITH CHECK (EXISTS (SELECT 1 FROM contratos c WHERE c.id = contrato_id));--> statement-breakpoint
ALTER TABLE contrato_envios ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY contrato_envios_isolamento ON contrato_envios
  USING (EXISTS (SELECT 1 FROM contratos c WHERE c.id = contrato_id))
  WITH CHECK (app_e_plataforma());--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  IF NOT app_papel_disponivel() THEN
    FOREACH t IN ARRAY ARRAY['contratos', 'contrato_aceites', 'contrato_envios'] LOOP
      EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    END LOOP;
  END IF;
END $$;--> statement-breakpoint
-- Contrato e aceites nunca mudam depois de gravados (o texto aceito é prova).
CREATE TRIGGER contratos_append_only BEFORE UPDATE OR DELETE ON contratos
  FOR EACH ROW EXECUTE FUNCTION impedir_alteracao();--> statement-breakpoint
CREATE TRIGGER contrato_aceites_append_only BEFORE UPDATE OR DELETE ON contrato_aceites
  FOR EACH ROW EXECUTE FUNCTION impedir_alteracao();--> statement-breakpoint
CREATE TRIGGER contrato_envios_append_only BEFORE UPDATE OR DELETE ON contrato_envios
  FOR EACH ROW EXECUTE FUNCTION impedir_alteracao();
--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  IF app_papel_disponivel() THEN
    FOREACH t IN ARRAY ARRAY['contratos', 'contrato_aceites', 'contrato_envios'] LOOP
      EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON %I FROM volante_app', t);
    END LOOP;
  END IF;
END $$;
