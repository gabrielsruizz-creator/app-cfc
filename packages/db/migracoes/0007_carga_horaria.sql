ALTER TABLE "aulas" ADD COLUMN "minutos_realizados" integer;--> statement-breakpoint
ALTER TABLE "aulas" ADD CONSTRAINT "aulas_minutos_realizados_ck" CHECK ("aulas"."minutos_realizados" >= 0);--> statement-breakpoint
-- Aulas já concluídas: tempo real a partir do check-in e do check-out.
UPDATE "aulas"
   SET "minutos_realizados" = greatest(0, round(extract(epoch FROM ("checkout_em" - "checkin_em")) / 60))::int
 WHERE "status" = 'concluida' AND "checkin_em" IS NOT NULL AND "checkout_em" IS NOT NULL;--> statement-breakpoint
-- Carga horária do aluno: soma do tempo realizado, limitado à duração agendada de cada aula
-- (sem check-in/check-out, vale a duração agendada).
UPDATE "alunos" a
   SET "horas_acumuladas_min" = coalesce((
     SELECT sum(least(coalesce(au."minutos_realizados", d.agendado), d.agendado))
       FROM "aulas" au
      CROSS JOIN LATERAL (SELECT round(extract(epoch FROM (au."fim" - au."inicio")) / 60)::int AS agendado) d
      WHERE au."aluno_id" = a."id" AND au."status" = 'concluida'
   ), 0);
