CREATE TABLE "autoescola_fotos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"autoescola_id" uuid NOT NULL,
	"arquivo_id" uuid NOT NULL,
	"ordem" smallint DEFAULT 0 NOT NULL,
	"legenda" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "autoescola_horarios" (
	"id" uuid PRIMARY KEY NOT NULL,
	"autoescola_id" uuid NOT NULL,
	"dia_semana" smallint NOT NULL,
	"abre" time NOT NULL,
	"fecha" time NOT NULL,
	CONSTRAINT "autoescola_horarios_dia_ck" CHECK ("autoescola_horarios"."dia_semana" between 0 and 6),
	CONSTRAINT "autoescola_horarios_ck" CHECK ("autoescola_horarios"."fecha" > "autoescola_horarios"."abre")
);
--> statement-breakpoint
CREATE TABLE "instrutor_vinculos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"instrutor_id" uuid NOT NULL,
	"autoescola_id" uuid NOT NULL,
	"status" text DEFAULT 'convidado' NOT NULL,
	"convidado_por" uuid,
	"inicio_em" timestamp with time zone,
	"fim_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vinculos_status_ck" CHECK ("instrutor_vinculos"."status" in ('convidado', 'ativo', 'recusado', 'encerrado'))
);
--> statement-breakpoint
CREATE TABLE "contas_recebimento" (
	"id" uuid PRIMARY KEY NOT NULL,
	"titular_tipo" text NOT NULL,
	"instrutor_id" uuid,
	"autoescola_id" uuid,
	"tipo_chave_pix" text NOT NULL,
	"chave_pix_cifrada" text NOT NULL,
	"chave_pix_mascarada" text NOT NULL,
	"titular_nome" text NOT NULL,
	"titular_documento" text NOT NULL,
	"gateway_subconta_id" text,
	"ativa" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contas_rec_titular_ck" CHECK ("contas_recebimento"."titular_tipo" in ('instrutor', 'autoescola')),
	CONSTRAINT "contas_rec_chave_ck" CHECK ("contas_recebimento"."tipo_chave_pix" in ('cpf', 'cnpj', 'email', 'telefone', 'aleatoria')),
	CONSTRAINT "contas_rec_dono_ck" CHECK (num_nonnulls("contas_recebimento"."instrutor_id", "contas_recebimento"."autoescola_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "saques" (
	"id" uuid PRIMARY KEY NOT NULL,
	"conta_id" uuid NOT NULL,
	"instrutor_id" uuid,
	"autoescola_id" uuid,
	"conta_recebimento_id" uuid NOT NULL,
	"gateway" text NOT NULL,
	"valor_centavos" bigint NOT NULL,
	"status" text DEFAULT 'solicitado' NOT NULL,
	"gateway_ref" text,
	"ultimo_erro" text,
	"solicitado_por" uuid,
	"concluido_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saques_valor_ck" CHECK ("saques"."valor_centavos" > 0),
	CONSTRAINT "saques_status_ck" CHECK ("saques"."status" in ('solicitado', 'pendente_configuracao', 'processando', 'concluido', 'falhou'))
);
--> statement-breakpoint
CREATE TABLE "conversas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tipo" text NOT NULL,
	"aluno_id" uuid NOT NULL,
	"instrutor_id" uuid,
	"autoescola_id" uuid,
	"ultima_mensagem_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversas_tipo_ck" CHECK ("conversas"."tipo" in ('aluno_instrutor', 'aluno_autoescola'))
);
--> statement-breakpoint
CREATE TABLE "mensagens" (
	"id" uuid PRIMARY KEY NOT NULL,
	"conversa_id" uuid NOT NULL,
	"aluno_id" uuid NOT NULL,
	"instrutor_id" uuid,
	"autoescola_id" uuid,
	"autor_usuario_id" uuid NOT NULL,
	"autor_papel" text NOT NULL,
	"texto" text NOT NULL,
	"lida_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mensagens_papel_ck" CHECK ("mensagens"."autor_papel" in ('aluno', 'instrutor', 'autoescola'))
);
--> statement-breakpoint
CREATE TABLE "denuncias" (
	"id" uuid PRIMARY KEY NOT NULL,
	"denunciante_usuario_id" uuid NOT NULL,
	"alvo_tipo" text NOT NULL,
	"alvo_id" uuid NOT NULL,
	"aula_id" uuid,
	"motivo" text NOT NULL,
	"descricao" text,
	"status" text DEFAULT 'aberta' NOT NULL,
	"resolucao" text,
	"resolvida_por" uuid,
	"resolvida_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "denuncias_alvo_ck" CHECK ("denuncias"."alvo_tipo" in ('instrutor', 'autoescola', 'aluno', 'avaliacao')),
	CONSTRAINT "denuncias_status_ck" CHECK ("denuncias"."status" in ('aberta', 'em_analise', 'resolvida', 'descartada'))
);
--> statement-breakpoint
CREATE TABLE "disputas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"aula_id" uuid NOT NULL,
	"pedido_id" uuid NOT NULL,
	"aberta_por_usuario_id" uuid NOT NULL,
	"aberta_por_papel" text NOT NULL,
	"motivo" text NOT NULL,
	"descricao" text NOT NULL,
	"status" text DEFAULT 'aberta' NOT NULL,
	"decisao" text,
	"valor_estorno_centavos" bigint,
	"resolucao" text,
	"resolvida_por" uuid,
	"resolvida_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "disputas_status_ck" CHECK ("disputas"."status" in ('aberta', 'resolvida')),
	CONSTRAINT "disputas_decisao_ck" CHECK ("disputas"."decisao" in ('estorno_total', 'estorno_parcial', 'negada')),
	CONSTRAINT "disputas_papel_ck" CHECK ("disputas"."aberta_por_papel" in ('aluno', 'instrutor', 'autoescola', 'admin'))
);
--> statement-breakpoint
ALTER TABLE "autoescola_fotos" ADD CONSTRAINT "autoescola_fotos_autoescola_id_autoescolas_id_fk" FOREIGN KEY ("autoescola_id") REFERENCES "public"."autoescolas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autoescola_fotos" ADD CONSTRAINT "autoescola_fotos_arquivo_id_arquivos_id_fk" FOREIGN KEY ("arquivo_id") REFERENCES "public"."arquivos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autoescola_horarios" ADD CONSTRAINT "autoescola_horarios_autoescola_id_autoescolas_id_fk" FOREIGN KEY ("autoescola_id") REFERENCES "public"."autoescolas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instrutor_vinculos" ADD CONSTRAINT "instrutor_vinculos_instrutor_id_instrutores_id_fk" FOREIGN KEY ("instrutor_id") REFERENCES "public"."instrutores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instrutor_vinculos" ADD CONSTRAINT "instrutor_vinculos_autoescola_id_autoescolas_id_fk" FOREIGN KEY ("autoescola_id") REFERENCES "public"."autoescolas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instrutor_vinculos" ADD CONSTRAINT "instrutor_vinculos_convidado_por_usuarios_id_fk" FOREIGN KEY ("convidado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contas_recebimento" ADD CONSTRAINT "contas_recebimento_instrutor_id_instrutores_id_fk" FOREIGN KEY ("instrutor_id") REFERENCES "public"."instrutores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contas_recebimento" ADD CONSTRAINT "contas_recebimento_autoescola_id_autoescolas_id_fk" FOREIGN KEY ("autoescola_id") REFERENCES "public"."autoescolas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saques" ADD CONSTRAINT "saques_conta_id_contas_financeiras_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas_financeiras"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saques" ADD CONSTRAINT "saques_conta_recebimento_id_contas_recebimento_id_fk" FOREIGN KEY ("conta_recebimento_id") REFERENCES "public"."contas_recebimento"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversas" ADD CONSTRAINT "conversas_aluno_id_alunos_id_fk" FOREIGN KEY ("aluno_id") REFERENCES "public"."alunos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversas" ADD CONSTRAINT "conversas_instrutor_id_instrutores_id_fk" FOREIGN KEY ("instrutor_id") REFERENCES "public"."instrutores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversas" ADD CONSTRAINT "conversas_autoescola_id_autoescolas_id_fk" FOREIGN KEY ("autoescola_id") REFERENCES "public"."autoescolas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_conversa_id_conversas_id_fk" FOREIGN KEY ("conversa_id") REFERENCES "public"."conversas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_autor_usuario_id_usuarios_id_fk" FOREIGN KEY ("autor_usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "denuncias" ADD CONSTRAINT "denuncias_denunciante_usuario_id_usuarios_id_fk" FOREIGN KEY ("denunciante_usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "denuncias" ADD CONSTRAINT "denuncias_aula_id_aulas_id_fk" FOREIGN KEY ("aula_id") REFERENCES "public"."aulas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "denuncias" ADD CONSTRAINT "denuncias_resolvida_por_usuarios_id_fk" FOREIGN KEY ("resolvida_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputas" ADD CONSTRAINT "disputas_aula_id_aulas_id_fk" FOREIGN KEY ("aula_id") REFERENCES "public"."aulas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputas" ADD CONSTRAINT "disputas_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputas" ADD CONSTRAINT "disputas_aberta_por_usuario_id_usuarios_id_fk" FOREIGN KEY ("aberta_por_usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputas" ADD CONSTRAINT "disputas_resolvida_por_usuarios_id_fk" FOREIGN KEY ("resolvida_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "autoescola_fotos_idx" ON "autoescola_fotos" USING btree ("autoescola_id","ordem");--> statement-breakpoint
CREATE INDEX "autoescola_horarios_idx" ON "autoescola_horarios" USING btree ("autoescola_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vinculos_ativos_uk" ON "instrutor_vinculos" USING btree ("instrutor_id","autoescola_id") WHERE "instrutor_vinculos"."status" in ('convidado', 'ativo');--> statement-breakpoint
CREATE INDEX "vinculos_autoescola_idx" ON "instrutor_vinculos" USING btree ("autoescola_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "contas_rec_instrutor_uk" ON "contas_recebimento" USING btree ("instrutor_id") WHERE "contas_recebimento"."ativa" and "contas_recebimento"."instrutor_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "contas_rec_autoescola_uk" ON "contas_recebimento" USING btree ("autoescola_id") WHERE "contas_recebimento"."ativa" and "contas_recebimento"."autoescola_id" is not null;--> statement-breakpoint
CREATE INDEX "saques_conta_idx" ON "saques" USING btree ("conta_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversas_instrutor_uk" ON "conversas" USING btree ("aluno_id","instrutor_id") WHERE "conversas"."tipo" = 'aluno_instrutor';--> statement-breakpoint
CREATE UNIQUE INDEX "conversas_autoescola_uk" ON "conversas" USING btree ("aluno_id","autoescola_id") WHERE "conversas"."tipo" = 'aluno_autoescola';--> statement-breakpoint
CREATE INDEX "mensagens_conversa_idx" ON "mensagens" USING btree ("conversa_id","criado_em");--> statement-breakpoint
CREATE INDEX "denuncias_status_idx" ON "denuncias" USING btree ("status");--> statement-breakpoint
CREATE INDEX "disputas_aula_idx" ON "disputas" USING btree ("aula_id");