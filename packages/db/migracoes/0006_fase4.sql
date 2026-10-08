ALTER TABLE "integracoes_autoescola" DROP CONSTRAINT "integracoes_status_ck";--> statement-breakpoint
ALTER TABLE "integracoes_autoescola" ADD COLUMN "url" text;--> statement-breakpoint
ALTER TABLE "integracoes_autoescola" ADD COLUMN "chave_mascarada" text;--> statement-breakpoint
ALTER TABLE "integracoes_autoescola" ADD COLUMN "nome_no_sistema" text;--> statement-breakpoint
ALTER TABLE "integracoes_autoescola" ADD COLUMN "testada_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "integracoes_autoescola" ADD COLUMN "ultimo_erro" text;--> statement-breakpoint
ALTER TABLE "integracoes_autoescola" ADD CONSTRAINT "integracoes_status_ck" CHECK ("integracoes_autoescola"."status" in ('nao_conectada', 'testando', 'conectada', 'erro', 'desativada'));