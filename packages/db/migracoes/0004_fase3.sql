CREATE TABLE "aula_compartilhamentos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"aula_id" uuid NOT NULL,
	"aluno_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"contato_nome" text,
	"expira_em" timestamp with time zone NOT NULL,
	"revogado_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "aula_posicoes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"aula_id" uuid NOT NULL,
	"aluno_id" uuid NOT NULL,
	"instrutor_id" uuid NOT NULL,
	"posicao" geography(Point,4326) NOT NULL,
	"precisao_m" integer,
	"registrado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cupom_usos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"cupom_id" uuid NOT NULL,
	"pedido_id" uuid NOT NULL,
	"aluno_id" uuid NOT NULL,
	"instrutor_id" uuid,
	"autoescola_id" uuid,
	"desconto_centavos" bigint NOT NULL,
	"bancado_por" text NOT NULL,
	"status" text DEFAULT 'reservado' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cupom_usos_status_ck" CHECK ("cupom_usos"."status" in ('reservado', 'confirmado', 'cancelado')),
	CONSTRAINT "cupom_usos_desconto_ck" CHECK ("cupom_usos"."desconto_centavos" > 0)
);
--> statement-breakpoint
CREATE TABLE "cupons" (
	"id" uuid PRIMARY KEY NOT NULL,
	"codigo" text NOT NULL,
	"campanha" text,
	"descricao" text,
	"tipo" text NOT NULL,
	"valor" bigint NOT NULL,
	"desconto_maximo_centavos" bigint,
	"valor_minimo_centavos" bigint DEFAULT 0 NOT NULL,
	"produto_tipo" text,
	"instrutor_id" uuid,
	"autoescola_id" uuid,
	"bancado_por" text NOT NULL,
	"limite_total" integer,
	"limite_por_aluno" integer DEFAULT 1 NOT NULL,
	"apenas_primeira_compra" boolean DEFAULT false NOT NULL,
	"inicio_em" timestamp with time zone DEFAULT now() NOT NULL,
	"fim_em" timestamp with time zone,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_por" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cupons_tipo_ck" CHECK ("cupons"."tipo" in ('percentual', 'valor_fixo')),
	CONSTRAINT "cupons_bancado_ck" CHECK ("cupons"."bancado_por" in ('plataforma', 'vendedor')),
	CONSTRAINT "cupons_produto_ck" CHECK ("cupons"."produto_tipo" in ('aula_avulsa', 'pacote')),
	CONSTRAINT "cupons_valor_ck" CHECK ("cupons"."valor" > 0 and ("cupons"."tipo" <> 'percentual' or "cupons"."valor" <= 10000)),
	CONSTRAINT "cupons_codigo_ck" CHECK ("cupons"."codigo" = upper("cupons"."codigo") and length("cupons"."codigo") between 3 and 30),
	CONSTRAINT "cupons_vendedor_ck" CHECK ("cupons"."bancado_por" <> 'vendedor' or "cupons"."instrutor_id" is not null or "cupons"."autoescola_id" is not null),
	CONSTRAINT "cupons_um_vendedor_ck" CHECK ("cupons"."instrutor_id" is null or "cupons"."autoescola_id" is null),
	CONSTRAINT "cupons_limites_ck" CHECK ("cupons"."limite_por_aluno" > 0 and ("cupons"."limite_total" is null or "cupons"."limite_total" > 0))
);
--> statement-breakpoint
ALTER TABLE "cobrancas" ADD COLUMN "url_pagamento" text;--> statement-breakpoint
ALTER TABLE "pedidos" ADD COLUMN "cupom_id" uuid;--> statement-breakpoint
ALTER TABLE "aula_compartilhamentos" ADD CONSTRAINT "aula_compartilhamentos_aula_id_aulas_id_fk" FOREIGN KEY ("aula_id") REFERENCES "public"."aulas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aula_compartilhamentos" ADD CONSTRAINT "aula_compartilhamentos_aluno_id_alunos_id_fk" FOREIGN KEY ("aluno_id") REFERENCES "public"."alunos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aula_posicoes" ADD CONSTRAINT "aula_posicoes_aula_id_aulas_id_fk" FOREIGN KEY ("aula_id") REFERENCES "public"."aulas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aula_posicoes" ADD CONSTRAINT "aula_posicoes_aluno_id_alunos_id_fk" FOREIGN KEY ("aluno_id") REFERENCES "public"."alunos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aula_posicoes" ADD CONSTRAINT "aula_posicoes_instrutor_id_instrutores_id_fk" FOREIGN KEY ("instrutor_id") REFERENCES "public"."instrutores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cupom_usos" ADD CONSTRAINT "cupom_usos_cupom_id_cupons_id_fk" FOREIGN KEY ("cupom_id") REFERENCES "public"."cupons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cupom_usos" ADD CONSTRAINT "cupom_usos_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cupom_usos" ADD CONSTRAINT "cupom_usos_aluno_id_alunos_id_fk" FOREIGN KEY ("aluno_id") REFERENCES "public"."alunos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cupom_usos" ADD CONSTRAINT "cupom_usos_instrutor_id_instrutores_id_fk" FOREIGN KEY ("instrutor_id") REFERENCES "public"."instrutores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cupom_usos" ADD CONSTRAINT "cupom_usos_autoescola_id_autoescolas_id_fk" FOREIGN KEY ("autoescola_id") REFERENCES "public"."autoescolas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cupons" ADD CONSTRAINT "cupons_instrutor_id_instrutores_id_fk" FOREIGN KEY ("instrutor_id") REFERENCES "public"."instrutores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cupons" ADD CONSTRAINT "cupons_autoescola_id_autoescolas_id_fk" FOREIGN KEY ("autoescola_id") REFERENCES "public"."autoescolas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cupons" ADD CONSTRAINT "cupons_criado_por_usuarios_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "aula_compartilhamentos_token_uk" ON "aula_compartilhamentos" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "aula_compartilhamentos_aula_idx" ON "aula_compartilhamentos" USING btree ("aula_id");--> statement-breakpoint
CREATE INDEX "aula_posicoes_aula_idx" ON "aula_posicoes" USING btree ("aula_id","registrado_em");--> statement-breakpoint
CREATE UNIQUE INDEX "cupom_usos_pedido_uk" ON "cupom_usos" USING btree ("pedido_id");--> statement-breakpoint
CREATE INDEX "cupom_usos_cupom_idx" ON "cupom_usos" USING btree ("cupom_id");--> statement-breakpoint
CREATE INDEX "cupom_usos_aluno_idx" ON "cupom_usos" USING btree ("aluno_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cupons_codigo_uk" ON "cupons" USING btree ("codigo");--> statement-breakpoint
CREATE INDEX "cupons_autoescola_idx" ON "cupons" USING btree ("autoescola_id");--> statement-breakpoint
ALTER TABLE "cobrancas" ADD CONSTRAINT "cobrancas_parcelas_ck" CHECK ("cobrancas"."parcelas" between 1 and 12 and ("cobrancas"."metodo" = 'cartao' or "cobrancas"."parcelas" = 1));