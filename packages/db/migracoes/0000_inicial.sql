CREATE SCHEMA "auditoria";
--> statement-breakpoint
CREATE TABLE "admins_plataforma" (
	"usuario_id" uuid PRIMARY KEY NOT NULL,
	"nivel" text DEFAULT 'total' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admins_nivel_ck" CHECK ("admins_plataforma"."nivel" in ('total', 'analista', 'financeiro', 'suporte'))
);
--> statement-breakpoint
CREATE TABLE "alunos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"usuario_id" uuid NOT NULL,
	"categoria_desejada" text NOT NULL,
	"renach" text,
	"selfie_arquivo_id" uuid NOT NULL,
	"municipio" text,
	"uf" char(2),
	"horas_acumuladas_min" integer DEFAULT 0 NOT NULL,
	"aulas_concluidas" integer DEFAULT 0 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alunos_categoria_ck" CHECK ("alunos"."categoria_desejada" in ('A', 'B', 'AB', 'C', 'D', 'E', 'AC', 'AD', 'AE', 'ACC'))
);
--> statement-breakpoint
CREATE TABLE "arquivos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"dono_usuario_id" uuid NOT NULL,
	"chave_storage" text NOT NULL,
	"nome_original" text,
	"mime" text NOT NULL,
	"tamanho_bytes" bigint NOT NULL,
	"sha256" text NOT NULL,
	"visibilidade" text DEFAULT 'privado' NOT NULL,
	"finalidade" text NOT NULL,
	"excluido_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "arquivos_visibilidade_ck" CHECK ("arquivos"."visibilidade" in ('privado', 'publico')),
	CONSTRAINT "arquivos_finalidade_ck" CHECK ("arquivos"."finalidade" in ('selfie', 'documento', 'foto_perfil', 'foto_veiculo', 'foto_autoescola', 'logo', 'recibo'))
);
--> statement-breakpoint
CREATE TABLE "codigos_verificacao" (
	"id" uuid PRIMARY KEY NOT NULL,
	"usuario_id" uuid,
	"finalidade" text NOT NULL,
	"canal" text NOT NULL,
	"destino" text NOT NULL,
	"codigo_hash" text NOT NULL,
	"tentativas" smallint DEFAULT 0 NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"usado_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "codigos_finalidade_ck" CHECK ("codigos_verificacao"."finalidade" in ('verificar_telefone', 'verificar_email', 'redefinir_senha')),
	CONSTRAINT "codigos_canal_ck" CHECK ("codigos_verificacao"."canal" in ('sms', 'email'))
);
--> statement-breakpoint
CREATE TABLE "consentimentos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"usuario_id" uuid NOT NULL,
	"documento_legal_id" uuid,
	"finalidade" text NOT NULL,
	"aceito" boolean NOT NULL,
	"ip" text,
	"user_agent" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consentimentos_finalidade_ck" CHECK ("consentimentos"."finalidade" in ('termos_uso', 'politica_privacidade', 'termo_instrutor', 'termo_autoescola', 'marketing', 'compartilhar_localizacao'))
);
--> statement-breakpoint
CREATE TABLE "dispositivos_push" (
	"id" uuid PRIMARY KEY NOT NULL,
	"usuario_id" uuid NOT NULL,
	"expo_push_token" text NOT NULL,
	"plataforma" text NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"ultimo_uso_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documentos_legais" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tipo" text NOT NULL,
	"versao" text NOT NULL,
	"conteudo_md" text NOT NULL,
	"publicado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"vigente" boolean DEFAULT true NOT NULL,
	CONSTRAINT "documentos_legais_tipo_ck" CHECK ("documentos_legais"."tipo" in ('termos_uso', 'politica_privacidade', 'termo_instrutor', 'termo_autoescola'))
);
--> statement-breakpoint
CREATE TABLE "sessoes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"usuario_id" uuid NOT NULL,
	"familia" uuid NOT NULL,
	"refresh_token_hash" text NOT NULL,
	"dispositivo" text,
	"ip" text,
	"user_agent" text,
	"expira_em" timestamp with time zone NOT NULL,
	"revogada_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "solicitacoes_exclusao" (
	"id" uuid PRIMARY KEY NOT NULL,
	"usuario_id" uuid NOT NULL,
	"status" text DEFAULT 'solicitada' NOT NULL,
	"motivo" text,
	"pendencias" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"solicitada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"concluida_em" timestamp with time zone,
	CONSTRAINT "exclusao_status_ck" CHECK ("solicitacoes_exclusao"."status" in ('solicitada', 'em_processamento', 'concluida', 'bloqueada_pendencia'))
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" uuid PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"nome_social" text,
	"cpf" char(11),
	"email" text NOT NULL,
	"email_verificado_em" timestamp with time zone,
	"telefone" text NOT NULL,
	"telefone_verificado_em" timestamp with time zone,
	"senha_hash" text NOT NULL,
	"data_nascimento" date,
	"genero" text,
	"foto_arquivo_id" uuid,
	"status" text DEFAULT 'ativo' NOT NULL,
	"ultimo_acesso_em" timestamp with time zone,
	"excluido_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuarios_status_ck" CHECK ("usuarios"."status" in ('ativo', 'bloqueado', 'excluido')),
	CONSTRAINT "usuarios_genero_ck" CHECK ("usuarios"."genero" in ('feminino', 'masculino', 'outro', 'prefiro_nao_informar'))
);
--> statement-breakpoint
CREATE TABLE "autoescola_documentos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"autoescola_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"arquivo_id" uuid NOT NULL,
	"numero" text,
	"validade" date,
	"status" text DEFAULT 'pendente' NOT NULL,
	"analisado_por" uuid,
	"analisado_em" timestamp with time zone,
	"motivo_reprovacao" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "autoescola_doc_tipo_ck" CHECK ("autoescola_documentos"."tipo" in ('contrato_social', 'cartao_cnpj', 'credenciamento_detran', 'alvara')),
	CONSTRAINT "autoescola_doc_status_ck" CHECK ("autoescola_documentos"."status" in ('pendente', 'aprovado', 'reprovado', 'vencido', 'substituido'))
);
--> statement-breakpoint
CREATE TABLE "autoescola_membros" (
	"id" uuid PRIMARY KEY NOT NULL,
	"autoescola_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"papel" text NOT NULL,
	"status" text DEFAULT 'ativo' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membros_papel_ck" CHECK ("autoescola_membros"."papel" in ('dono', 'gerente', 'atendente', 'financeiro')),
	CONSTRAINT "membros_status_ck" CHECK ("autoescola_membros"."status" in ('convidado', 'ativo', 'removido'))
);
--> statement-breakpoint
CREATE TABLE "autoescolas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"razao_social" text NOT NULL,
	"nome_fantasia" text NOT NULL,
	"cnpj" char(14) NOT NULL,
	"slug" text NOT NULL,
	"status" text DEFAULT 'rascunho' NOT NULL,
	"motivo_status" text,
	"descricao" text,
	"telefone" text NOT NULL,
	"whatsapp" text NOT NULL,
	"email" text NOT NULL,
	"cep" text NOT NULL,
	"logradouro" text NOT NULL,
	"numero" text NOT NULL,
	"complemento" text,
	"bairro" text NOT NULL,
	"municipio" text NOT NULL,
	"uf" char(2) NOT NULL,
	"localizacao" geography(Point,4326) NOT NULL,
	"logo_arquivo_id" uuid,
	"credenciamento_detran" text NOT NULL,
	"mensagem_whatsapp_padrao" text DEFAULT 'Olá, {aluno}! Aqui é da {autoescola}. Recebemos sua compra de {pacote} pelo app e vamos combinar os próximos passos.' NOT NULL,
	"fuso_horario" text DEFAULT 'America/Sao_Paulo' NOT NULL,
	"nota_media" numeric(2, 1),
	"total_avaliacoes" integer DEFAULT 0 NOT NULL,
	"enviada_analise_em" timestamp with time zone,
	"aprovada_em" timestamp with time zone,
	"aprovada_por" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "autoescolas_status_ck" CHECK ("autoescolas"."status" in ('rascunho', 'em_analise', 'aprovada', 'reprovada', 'suspensa'))
);
--> statement-breakpoint
CREATE TABLE "bloqueios_agenda" (
	"id" uuid PRIMARY KEY NOT NULL,
	"instrutor_id" uuid NOT NULL,
	"inicio" timestamp with time zone NOT NULL,
	"fim" timestamp with time zone NOT NULL,
	"tipo" text DEFAULT 'bloqueio' NOT NULL,
	"motivo" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bloqueio_periodo_ck" CHECK ("bloqueios_agenda"."fim" > "bloqueios_agenda"."inicio"),
	CONSTRAINT "bloqueio_tipo_ck" CHECK ("bloqueios_agenda"."tipo" in ('bloqueio', 'ferias'))
);
--> statement-breakpoint
CREATE TABLE "disponibilidades_semanais" (
	"id" uuid PRIMARY KEY NOT NULL,
	"instrutor_id" uuid NOT NULL,
	"dia_semana" smallint NOT NULL,
	"hora_inicio" time NOT NULL,
	"hora_fim" time NOT NULL,
	CONSTRAINT "disp_dia_ck" CHECK ("disponibilidades_semanais"."dia_semana" between 0 and 6),
	CONSTRAINT "disp_horas_ck" CHECK ("disponibilidades_semanais"."hora_fim" > "disponibilidades_semanais"."hora_inicio")
);
--> statement-breakpoint
CREATE TABLE "habilidades" (
	"id" uuid PRIMARY KEY NOT NULL,
	"codigo" text NOT NULL,
	"nome" text NOT NULL,
	"categorias" text[] NOT NULL,
	"ordem" smallint DEFAULT 0 NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instrutor_documentos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"instrutor_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"arquivo_id" uuid NOT NULL,
	"numero" text,
	"uf_emissor" char(2),
	"validade" date,
	"status" text DEFAULT 'pendente' NOT NULL,
	"analisado_por" uuid,
	"analisado_em" timestamp with time zone,
	"motivo_reprovacao" text,
	"alertas_enviados" smallint[] DEFAULT '{}'::smallint[] NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "instrutor_doc_tipo_ck" CHECK ("instrutor_documentos"."tipo" in ('cnh', 'credencial_detran', 'documento_veiculo', 'comprovante_residencia', 'selfie')),
	CONSTRAINT "instrutor_doc_status_ck" CHECK ("instrutor_documentos"."status" in ('pendente', 'aprovado', 'reprovado', 'vencido', 'substituido'))
);
--> statement-breakpoint
CREATE TABLE "instrutores" (
	"id" uuid PRIMARY KEY NOT NULL,
	"usuario_id" uuid NOT NULL,
	"status" text DEFAULT 'rascunho' NOT NULL,
	"motivo_status" text,
	"enviado_analise_em" timestamp with time zone,
	"aprovado_em" timestamp with time zone,
	"aprovado_por" uuid,
	"bio" text,
	"atua_desde" smallint,
	"categorias" text[] DEFAULT '{}'::text[] NOT NULL,
	"preco_aula_centavos" bigint,
	"duracao_aula_min" smallint DEFAULT 50 NOT NULL,
	"raio_atendimento_km" smallint,
	"base_localizacao" geography(Point,4326),
	"fornece_veiculo" boolean DEFAULT true NOT NULL,
	"aceita_veiculo_aluno" boolean DEFAULT false NOT NULL,
	"disponivel" boolean DEFAULT false NOT NULL,
	"fuso_horario" text DEFAULT 'America/Sao_Paulo' NOT NULL,
	"antecedencia_minima_h" smallint,
	"nota_media" numeric(2, 1),
	"total_avaliacoes" integer DEFAULT 0 NOT NULL,
	"soma_notas" integer DEFAULT 0 NOT NULL,
	"total_aulas" integer DEFAULT 0 NOT NULL,
	"modo_atuacao" text DEFAULT 'autonomo' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "instrutores_status_ck" CHECK ("instrutores"."status" in ('rascunho', 'em_analise', 'aprovado', 'reprovado', 'suspenso_documento', 'bloqueado')),
	CONSTRAINT "instrutores_modo_ck" CHECK ("instrutores"."modo_atuacao" in ('autonomo', 'vinculado', 'ambos')),
	CONSTRAINT "instrutores_preco_ck" CHECK ("instrutores"."preco_aula_centavos" is null or "instrutores"."preco_aula_centavos" > 0)
);
--> statement-breakpoint
CREATE TABLE "veiculos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"instrutor_id" uuid,
	"autoescola_id" uuid,
	"placa" text NOT NULL,
	"marca" text NOT NULL,
	"modelo" text NOT NULL,
	"ano" smallint NOT NULL,
	"cor" text,
	"cambio" text NOT NULL,
	"adaptado_pcd" boolean DEFAULT false NOT NULL,
	"adaptacoes" text,
	"categoria" text NOT NULL,
	"documento_id" uuid,
	"foto_arquivo_id" uuid,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "veiculos_cambio_ck" CHECK ("veiculos"."cambio" in ('manual', 'automatico')),
	CONSTRAINT "veiculos_categoria_ck" CHECK ("veiculos"."categoria" in ('A', 'B', 'AB', 'C', 'D', 'E', 'AC', 'AD', 'AE', 'ACC')),
	CONSTRAINT "veiculos_dono_ck" CHECK (num_nonnulls("veiculos"."instrutor_id", "veiculos"."autoescola_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "cobrancas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"pedido_id" uuid NOT NULL,
	"aluno_id" uuid NOT NULL,
	"instrutor_id" uuid,
	"autoescola_id" uuid,
	"gateway" text NOT NULL,
	"gateway_cobranca_id" text,
	"metodo" text DEFAULT 'pix' NOT NULL,
	"parcelas" smallint DEFAULT 1 NOT NULL,
	"valor_centavos" bigint NOT NULL,
	"status" text DEFAULT 'pendente_envio' NOT NULL,
	"pix_copia_cola" text,
	"pix_qrcode_base64" text,
	"pix_expira_em" timestamp with time zone,
	"pago_em" timestamp with time zone,
	"valor_estornado_centavos" bigint DEFAULT 0 NOT NULL,
	"chave_idempotencia" text NOT NULL,
	"dados_gateway" jsonb,
	"ultimo_erro" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cobrancas_status_ck" CHECK ("cobrancas"."status" in ('pendente_envio', 'aguardando_pagamento', 'paga', 'expirada', 'falhou', 'estornada', 'estornada_parcial', 'pendente_configuracao')),
	CONSTRAINT "cobrancas_gateway_ck" CHECK ("cobrancas"."gateway" in ('asaas', 'pagarme', 'mercadopago', 'simulado', 'nao_configurado')),
	CONSTRAINT "cobrancas_metodo_ck" CHECK ("cobrancas"."metodo" in ('pix', 'cartao'))
);
--> statement-breakpoint
CREATE TABLE "contas_financeiras" (
	"id" uuid PRIMARY KEY NOT NULL,
	"titular_tipo" text NOT NULL,
	"instrutor_id" uuid,
	"autoescola_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contas_titular_ck" CHECK ("contas_financeiras"."titular_tipo" in ('plataforma', 'externa', 'instrutor', 'autoescola'))
);
--> statement-breakpoint
CREATE TABLE "creditos_aula" (
	"id" uuid PRIMARY KEY NOT NULL,
	"pedido_id" uuid NOT NULL,
	"aluno_id" uuid NOT NULL,
	"instrutor_id" uuid,
	"autoescola_id" uuid,
	"categorias" text[] NOT NULL,
	"duracao_aula_min" smallint NOT NULL,
	"quantidade_total" smallint NOT NULL,
	"quantidade_reservada" smallint DEFAULT 0 NOT NULL,
	"quantidade_consumida" smallint DEFAULT 0 NOT NULL,
	"status" text NOT NULL,
	"valido_ate" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "creditos_status_ck" CHECK ("creditos_aula"."status" in ('aguardando_pagamento', 'bloqueado', 'ativo', 'esgotado', 'expirado', 'estornado', 'cancelado')),
	CONSTRAINT "creditos_saldo_ck" CHECK ("creditos_aula"."quantidade_reservada" >= 0 and "creditos_aula"."quantidade_consumida" >= 0 and "creditos_aula"."quantidade_reservada" + "creditos_aula"."quantidade_consumida" <= "creditos_aula"."quantidade_total")
);
--> statement-breakpoint
CREATE TABLE "creditos_movimentos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"credito_id" uuid NOT NULL,
	"aula_id" uuid,
	"tipo" text NOT NULL,
	"quantidade" smallint NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "creditos_mov_tipo_ck" CHECK ("creditos_movimentos"."tipo" in ('reserva', 'consumo', 'devolucao', 'estorno', 'expiracao'))
);
--> statement-breakpoint
CREATE TABLE "estornos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"cobranca_id" uuid NOT NULL,
	"pedido_id" uuid NOT NULL,
	"aluno_id" uuid NOT NULL,
	"instrutor_id" uuid,
	"autoescola_id" uuid,
	"aula_id" uuid,
	"valor_centavos" bigint NOT NULL,
	"motivo" text NOT NULL,
	"status" text DEFAULT 'solicitado' NOT NULL,
	"solicitado_por" uuid,
	"gateway_estorno_id" text,
	"ultimo_erro" text,
	"concluido_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "estornos_valor_ck" CHECK ("estornos"."valor_centavos" > 0),
	CONSTRAINT "estornos_motivo_ck" CHECK ("estornos"."motivo" in ('aula_recusada', 'aula_expirada', 'cancelamento', 'pedido_recusado', 'pedido_expirado', 'disputa', 'admin')),
	CONSTRAINT "estornos_status_ck" CHECK ("estornos"."status" in ('solicitado', 'pendente_configuracao', 'processando', 'concluido', 'falhou'))
);
--> statement-breakpoint
CREATE TABLE "lancamentos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"operacao_id" uuid NOT NULL,
	"conta_id" uuid NOT NULL,
	"instrutor_id" uuid,
	"autoescola_id" uuid,
	"pedido_id" uuid,
	"aula_id" uuid,
	"estorno_id" uuid,
	"tipo" text NOT NULL,
	"bucket" text NOT NULL,
	"valor_centavos" bigint NOT NULL,
	"descricao" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lancamentos_tipo_ck" CHECK ("lancamentos"."tipo" in ('retencao', 'liberacao', 'comissao', 'estorno', 'saque', 'ajuste')),
	CONSTRAINT "lancamentos_bucket_ck" CHECK ("lancamentos"."bucket" in ('retido', 'disponivel', 'movimento'))
);
--> statement-breakpoint
CREATE TABLE "matriculas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"autoescola_id" uuid NOT NULL,
	"aluno_id" uuid NOT NULL,
	"pedido_id" uuid NOT NULL,
	"categorias" text[] NOT NULL,
	"status" text DEFAULT 'ativa' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "matriculas_status_ck" CHECK ("matriculas"."status" in ('ativa', 'concluida', 'cancelada'))
);
--> statement-breakpoint
CREATE TABLE "notas_fiscais" (
	"id" uuid PRIMARY KEY NOT NULL,
	"recibo_id" uuid NOT NULL,
	"emissor_tipo" text NOT NULL,
	"emissor_id" uuid,
	"status" text DEFAULT 'pendente_configuracao' NOT NULL,
	"numero" text,
	"serie" text,
	"chave_acesso" text,
	"xml_arquivo_id" uuid,
	"pdf_arquivo_id" uuid,
	"ultimo_erro" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nf_status_ck" CHECK ("notas_fiscais"."status" in ('nao_aplicavel', 'pendente_configuracao', 'emitida', 'cancelada', 'erro'))
);
--> statement-breakpoint
CREATE TABLE "pacotes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"vendedor_tipo" text NOT NULL,
	"instrutor_id" uuid,
	"autoescola_id" uuid,
	"nome" text NOT NULL,
	"descricao" text,
	"categorias" text[] NOT NULL,
	"quantidade_aulas" smallint NOT NULL,
	"duracao_aula_min" smallint NOT NULL,
	"preco_centavos" bigint NOT NULL,
	"parcelas_max" smallint DEFAULT 1 NOT NULL,
	"validade_dias" smallint,
	"publicado" boolean DEFAULT false NOT NULL,
	"arquivado_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pacotes_vendedor_ck" CHECK ("pacotes"."vendedor_tipo" in ('instrutor', 'autoescola')),
	CONSTRAINT "pacotes_dono_ck" CHECK (num_nonnulls("pacotes"."instrutor_id", "pacotes"."autoescola_id") = 1),
	CONSTRAINT "pacotes_qtd_ck" CHECK ("pacotes"."quantidade_aulas" > 0)
);
--> statement-breakpoint
CREATE TABLE "pedido_historico" (
	"id" uuid PRIMARY KEY NOT NULL,
	"pedido_id" uuid NOT NULL,
	"aluno_id" uuid NOT NULL,
	"instrutor_id" uuid,
	"autoescola_id" uuid,
	"de_status" text,
	"para_status" text NOT NULL,
	"ator_usuario_id" uuid,
	"motivo" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pedidos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"codigo" text NOT NULL,
	"aluno_id" uuid NOT NULL,
	"vendedor_tipo" text NOT NULL,
	"instrutor_id" uuid,
	"autoescola_id" uuid,
	"tipo" text NOT NULL,
	"pacote_id" uuid,
	"snapshot" jsonb NOT NULL,
	"quantidade_aulas" smallint NOT NULL,
	"valor_bruto_centavos" bigint NOT NULL,
	"desconto_centavos" bigint DEFAULT 0 NOT NULL,
	"valor_total_centavos" bigint NOT NULL,
	"comissao_bp" integer NOT NULL,
	"comissao_centavos" bigint NOT NULL,
	"regra_comissao_id" uuid NOT NULL,
	"valor_liquido_vendedor_centavos" bigint NOT NULL,
	"status" text DEFAULT 'aguardando_pagamento' NOT NULL,
	"status_atendimento" text,
	"motivo_recusa" text,
	"pago_em" timestamp with time zone,
	"primeiro_contato_em" timestamp with time zone,
	"confirmado_em" timestamp with time zone,
	"recusado_em" timestamp with time zone,
	"expirado_em" timestamp with time zone,
	"lembrete_enviado_em" timestamp with time zone,
	"prazo_resposta_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pedidos_vendedor_ck" CHECK ("pedidos"."vendedor_tipo" in ('instrutor', 'autoescola')),
	CONSTRAINT "pedidos_tipo_ck" CHECK ("pedidos"."tipo" in ('aula_avulsa', 'pacote')),
	CONSTRAINT "pedidos_status_ck" CHECK ("pedidos"."status" in ('aguardando_pagamento', 'pago', 'cancelado', 'estornado', 'encerrado')),
	CONSTRAINT "pedidos_atendimento_ck" CHECK ("pedidos"."status_atendimento" in ('novo', 'em_contato', 'confirmado', 'recusado', 'expirado')),
	CONSTRAINT "pedidos_vendedor_dono_ck" CHECK (("pedidos"."vendedor_tipo" = 'instrutor' and "pedidos"."instrutor_id" is not null) or ("pedidos"."vendedor_tipo" = 'autoescola' and "pedidos"."autoescola_id" is not null)),
	CONSTRAINT "pedidos_valores_ck" CHECK ("pedidos"."valor_total_centavos" = "pedidos"."valor_bruto_centavos" - "pedidos"."desconto_centavos" and "pedidos"."valor_liquido_vendedor_centavos" + "pedidos"."comissao_centavos" = "pedidos"."valor_total_centavos"),
	CONSTRAINT "pedidos_recusa_motivo_ck" CHECK ("pedidos"."status_atendimento" is distinct from 'recusado' or coalesce(length(trim("pedidos"."motivo_recusa")), 0) > 0)
);
--> statement-breakpoint
CREATE TABLE "recibos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"numero" integer GENERATED ALWAYS AS IDENTITY (sequence name "recibos_numero_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"pedido_id" uuid NOT NULL,
	"aluno_id" uuid NOT NULL,
	"instrutor_id" uuid,
	"autoescola_id" uuid,
	"emissor_tipo" text NOT NULL,
	"emissor_nome" text NOT NULL,
	"valor_centavos" bigint NOT NULL,
	"itens" jsonb NOT NULL,
	"arquivo_id" uuid,
	"emitido_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "regras_comissao" (
	"id" uuid PRIMARY KEY NOT NULL,
	"vendedor_tipo" text NOT NULL,
	"produto_tipo" text NOT NULL,
	"instrutor_id" uuid,
	"autoescola_id" uuid,
	"percentual_bp" integer NOT NULL,
	"valor_fixo_centavos" bigint DEFAULT 0 NOT NULL,
	"vigente_desde" timestamp with time zone DEFAULT now() NOT NULL,
	"vigente_ate" timestamp with time zone,
	"criado_por" uuid,
	"motivo" text,
	CONSTRAINT "regras_vendedor_ck" CHECK ("regras_comissao"."vendedor_tipo" in ('instrutor', 'autoescola')),
	CONSTRAINT "regras_produto_ck" CHECK ("regras_comissao"."produto_tipo" in ('aula_avulsa', 'pacote')),
	CONSTRAINT "regras_percentual_ck" CHECK ("regras_comissao"."percentual_bp" between 0 and 10000)
);
--> statement-breakpoint
CREATE TABLE "repasses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"conta_id" uuid NOT NULL,
	"instrutor_id" uuid,
	"autoescola_id" uuid,
	"pedido_id" uuid,
	"aula_id" uuid,
	"valor_centavos" bigint NOT NULL,
	"status" text DEFAULT 'pendente' NOT NULL,
	"gateway_transferencia_id" text,
	"ultimo_erro" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "repasses_status_ck" CHECK ("repasses"."status" in ('pendente', 'pendente_configuracao', 'enviado', 'concluido', 'falhou'))
);
--> statement-breakpoint
CREATE TABLE "webhooks_recebidos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"gateway" text NOT NULL,
	"evento_externo_id" text NOT NULL,
	"tipo" text,
	"cabecalhos" jsonb NOT NULL,
	"payload" jsonb NOT NULL,
	"recebido_em" timestamp with time zone DEFAULT now() NOT NULL,
	"processado_em" timestamp with time zone,
	"erro" text
);
--> statement-breakpoint
CREATE TABLE "aula_anotacoes" (
	"aula_id" uuid PRIMARY KEY NOT NULL,
	"aluno_id" uuid NOT NULL,
	"instrutor_id" uuid NOT NULL,
	"autoescola_id" uuid,
	"texto" text NOT NULL,
	"visivel_aluno" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "aula_historico" (
	"id" uuid PRIMARY KEY NOT NULL,
	"aula_id" uuid NOT NULL,
	"aluno_id" uuid NOT NULL,
	"instrutor_id" uuid NOT NULL,
	"autoescola_id" uuid,
	"de_status" text,
	"para_status" text NOT NULL,
	"ator_usuario_id" uuid,
	"local" geography(Point,4326),
	"motivo" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "aulas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"aluno_id" uuid NOT NULL,
	"instrutor_id" uuid NOT NULL,
	"autoescola_id" uuid,
	"pedido_id" uuid NOT NULL,
	"credito_id" uuid NOT NULL,
	"veiculo_id" uuid,
	"categoria" text NOT NULL,
	"inicio" timestamp with time zone NOT NULL,
	"fim" timestamp with time zone NOT NULL,
	"periodo" "tstzrange" GENERATED ALWAYS AS (tstzrange(inicio, fim, '[)')) STORED,
	"valor_centavos" bigint NOT NULL,
	"ponto_encontro" geography(Point,4326) NOT NULL,
	"ponto_encontro_endereco" text NOT NULL,
	"ponto_encontro_referencia" text,
	"status" text NOT NULL,
	"aceite_ate" timestamp with time zone,
	"codigo_checkin" char(4) NOT NULL,
	"tentativas_checkin" smallint DEFAULT 0 NOT NULL,
	"checkin_em" timestamp with time zone,
	"checkin_local" geography(Point,4326),
	"checkin_distancia_m" integer,
	"checkout_em" timestamp with time zone,
	"checkout_local" geography(Point,4326),
	"checkout_confirmado_em" timestamp with time zone,
	"checkout_confirmado_por" text,
	"cancelada_em" timestamp with time zone,
	"cancelada_por" text,
	"motivo_cancelamento" text,
	"multa_cancelamento_centavos" bigint DEFAULT 0 NOT NULL,
	"politica_cancelamento" jsonb NOT NULL,
	"remarcada_de_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "aulas_status_ck" CHECK ("aulas"."status" in ('aguardando_pagamento', 'solicitada', 'confirmada', 'a_caminho', 'em_andamento', 'aguardando_confirmacao', 'concluida', 'recusada', 'expirada', 'cancelada', 'nao_compareceu_aluno', 'nao_compareceu_instrutor')),
	CONSTRAINT "aulas_categoria_ck" CHECK ("aulas"."categoria" in ('A', 'B', 'AB', 'C', 'D', 'E', 'AC', 'AD', 'AE', 'ACC')),
	CONSTRAINT "aulas_periodo_ck" CHECK ("aulas"."fim" > "aulas"."inicio")
);
--> statement-breakpoint
CREATE TABLE "avaliacoes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"aula_id" uuid,
	"pedido_id" uuid,
	"autor_aluno_id" uuid NOT NULL,
	"alvo_tipo" text NOT NULL,
	"instrutor_id" uuid,
	"autoescola_id" uuid,
	"nota" smallint NOT NULL,
	"comentario" text,
	"status" text DEFAULT 'publicada' NOT NULL,
	"moderada_por" uuid,
	"resposta" text,
	"respondida_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "avaliacoes_alvo_ck" CHECK ("avaliacoes"."alvo_tipo" in ('instrutor', 'autoescola')),
	CONSTRAINT "avaliacoes_status_ck" CHECK ("avaliacoes"."status" in ('publicada', 'oculta')),
	CONSTRAINT "avaliacoes_nota_ck" CHECK ("avaliacoes"."nota" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "registros_evolucao" (
	"id" uuid PRIMARY KEY NOT NULL,
	"aula_id" uuid NOT NULL,
	"aluno_id" uuid NOT NULL,
	"instrutor_id" uuid NOT NULL,
	"autoescola_id" uuid,
	"habilidade_id" uuid NOT NULL,
	"nivel" smallint NOT NULL,
	"observacao" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evolucao_nivel_ck" CHECK ("registros_evolucao"."nivel" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "configuracoes" (
	"chave" text PRIMARY KEY NOT NULL,
	"valor" jsonb NOT NULL,
	"atualizado_por" uuid,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entregas_notificacao" (
	"id" uuid PRIMARY KEY NOT NULL,
	"notificacao_id" uuid NOT NULL,
	"canal" text NOT NULL,
	"status" text DEFAULT 'pendente' NOT NULL,
	"tentativas" smallint DEFAULT 0 NOT NULL,
	"erro" text,
	"enviada_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entregas_canal_ck" CHECK ("entregas_notificacao"."canal" in ('push', 'email', 'sms')),
	CONSTRAINT "entregas_status_ck" CHECK ("entregas_notificacao"."status" in ('pendente', 'enviada', 'falhou', 'pendente_configuracao', 'sem_destino'))
);
--> statement-breakpoint
CREATE TABLE "eventos_consumidos" (
	"evento_id" uuid NOT NULL,
	"consumidor" text NOT NULL,
	"processado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "eventos_consumidos_evento_id_consumidor_pk" PRIMARY KEY("evento_id","consumidor")
);
--> statement-breakpoint
CREATE TABLE "integracoes_autoescola" (
	"id" uuid PRIMARY KEY NOT NULL,
	"autoescola_id" uuid NOT NULL,
	"sistema" text NOT NULL,
	"status" text DEFAULT 'nao_conectada' NOT NULL,
	"configuracao_cifrada" "bytea",
	"conectada_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "integracoes_sistema_ck" CHECK ("integracoes_autoescola"."sistema" in ('cfc_plus')),
	CONSTRAINT "integracoes_status_ck" CHECK ("integracoes_autoescola"."status" in ('nao_conectada', 'conectada', 'erro', 'desativada'))
);
--> statement-breakpoint
CREATE TABLE "notificacoes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"usuario_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"titulo" text NOT NULL,
	"corpo" text NOT NULL,
	"dados" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"canais" text[] DEFAULT '{push}'::text[] NOT NULL,
	"lida_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operacoes_integracao" (
	"id" uuid PRIMARY KEY NOT NULL,
	"autoescola_id" uuid NOT NULL,
	"sistema" text NOT NULL,
	"operacao" text NOT NULL,
	"evento_origem_id" uuid,
	"tipo_registro" text NOT NULL,
	"id_interno" uuid NOT NULL,
	"requisicao" jsonb NOT NULL,
	"resposta" jsonb,
	"http_status" smallint,
	"status" text DEFAULT 'pendente' NOT NULL,
	"tentativas" integer DEFAULT 0 NOT NULL,
	"proxima_tentativa_em" timestamp with time zone,
	"ultimo_erro" text,
	"concluida_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "operacoes_status_ck" CHECK ("operacoes_integracao"."status" in ('pendente', 'pendente_configuracao', 'sucesso', 'erro', 'aguardando_reprocessamento', 'descartada')),
	CONSTRAINT "operacoes_sistema_ck" CHECK ("operacoes_integracao"."sistema" in ('cfc_plus')),
	CONSTRAINT "operacoes_tipo_ck" CHECK ("operacoes_integracao"."tipo_registro" in ('aluno', 'pedido', 'matricula', 'instrutor', 'aula'))
);
--> statement-breakpoint
CREATE TABLE "outbox_eventos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tipo" text NOT NULL,
	"versao" smallint DEFAULT 1 NOT NULL,
	"agregado_tipo" text NOT NULL,
	"agregado_id" uuid NOT NULL,
	"autoescola_id" uuid,
	"payload" jsonb NOT NULL,
	"ocorrido_em" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'pendente' NOT NULL,
	"tentativas" integer DEFAULT 0 NOT NULL,
	"proxima_tentativa_em" timestamp with time zone DEFAULT now() NOT NULL,
	"ultimo_erro" text,
	"processado_em" timestamp with time zone,
	CONSTRAINT "outbox_status_ck" CHECK ("outbox_eventos"."status" in ('pendente', 'processado', 'falhou', 'morto'))
);
--> statement-breakpoint
CREATE TABLE "auditoria"."registros" (
	"id" uuid PRIMARY KEY NOT NULL,
	"seq" bigint,
	"ocorrido_em" timestamp with time zone DEFAULT now() NOT NULL,
	"ator_usuario_id" uuid,
	"ator_tipo" text NOT NULL,
	"autoescola_id" uuid,
	"entidade_tipo" text NOT NULL,
	"entidade_id" uuid NOT NULL,
	"acao" text NOT NULL,
	"antes" jsonb,
	"depois" jsonb,
	"motivo" text,
	"ip" text,
	"user_agent" text,
	"request_id" text,
	"hash_anterior" "bytea",
	"hash" "bytea"
);
--> statement-breakpoint
CREATE TABLE "requisicoes_idempotentes" (
	"chave" text NOT NULL,
	"usuario_id" uuid NOT NULL,
	"rota" text NOT NULL,
	"hash_corpo" text NOT NULL,
	"status_http" smallint NOT NULL,
	"resposta" jsonb NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "requisicoes_idempotentes_usuario_id_chave_pk" PRIMARY KEY("usuario_id","chave")
);
--> statement-breakpoint
CREATE TABLE "vinculos_externos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tipo_registro" text NOT NULL,
	"id_interno" uuid NOT NULL,
	"sistema_externo" text NOT NULL,
	"autoescola_id" uuid NOT NULL,
	"id_externo" text NOT NULL,
	"metadados" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vinculos_tipo_ck" CHECK ("vinculos_externos"."tipo_registro" in ('aluno', 'pedido', 'matricula', 'instrutor', 'aula')),
	CONSTRAINT "vinculos_sistema_ck" CHECK ("vinculos_externos"."sistema_externo" in ('cfc_plus'))
);
--> statement-breakpoint
ALTER TABLE "admins_plataforma" ADD CONSTRAINT "admins_plataforma_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alunos" ADD CONSTRAINT "alunos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alunos" ADD CONSTRAINT "alunos_selfie_arquivo_id_arquivos_id_fk" FOREIGN KEY ("selfie_arquivo_id") REFERENCES "public"."arquivos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arquivos" ADD CONSTRAINT "arquivos_dono_usuario_id_usuarios_id_fk" FOREIGN KEY ("dono_usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "codigos_verificacao" ADD CONSTRAINT "codigos_verificacao_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consentimentos" ADD CONSTRAINT "consentimentos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consentimentos" ADD CONSTRAINT "consentimentos_documento_legal_id_documentos_legais_id_fk" FOREIGN KEY ("documento_legal_id") REFERENCES "public"."documentos_legais"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispositivos_push" ADD CONSTRAINT "dispositivos_push_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessoes" ADD CONSTRAINT "sessoes_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solicitacoes_exclusao" ADD CONSTRAINT "solicitacoes_exclusao_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autoescola_documentos" ADD CONSTRAINT "autoescola_documentos_autoescola_id_autoescolas_id_fk" FOREIGN KEY ("autoescola_id") REFERENCES "public"."autoescolas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autoescola_documentos" ADD CONSTRAINT "autoescola_documentos_arquivo_id_arquivos_id_fk" FOREIGN KEY ("arquivo_id") REFERENCES "public"."arquivos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autoescola_documentos" ADD CONSTRAINT "autoescola_documentos_analisado_por_usuarios_id_fk" FOREIGN KEY ("analisado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autoescola_membros" ADD CONSTRAINT "autoescola_membros_autoescola_id_autoescolas_id_fk" FOREIGN KEY ("autoescola_id") REFERENCES "public"."autoescolas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autoescola_membros" ADD CONSTRAINT "autoescola_membros_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autoescolas" ADD CONSTRAINT "autoescolas_logo_arquivo_id_arquivos_id_fk" FOREIGN KEY ("logo_arquivo_id") REFERENCES "public"."arquivos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autoescolas" ADD CONSTRAINT "autoescolas_aprovada_por_usuarios_id_fk" FOREIGN KEY ("aprovada_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bloqueios_agenda" ADD CONSTRAINT "bloqueios_agenda_instrutor_id_instrutores_id_fk" FOREIGN KEY ("instrutor_id") REFERENCES "public"."instrutores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disponibilidades_semanais" ADD CONSTRAINT "disponibilidades_semanais_instrutor_id_instrutores_id_fk" FOREIGN KEY ("instrutor_id") REFERENCES "public"."instrutores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instrutor_documentos" ADD CONSTRAINT "instrutor_documentos_instrutor_id_instrutores_id_fk" FOREIGN KEY ("instrutor_id") REFERENCES "public"."instrutores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instrutor_documentos" ADD CONSTRAINT "instrutor_documentos_arquivo_id_arquivos_id_fk" FOREIGN KEY ("arquivo_id") REFERENCES "public"."arquivos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instrutor_documentos" ADD CONSTRAINT "instrutor_documentos_analisado_por_usuarios_id_fk" FOREIGN KEY ("analisado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instrutores" ADD CONSTRAINT "instrutores_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instrutores" ADD CONSTRAINT "instrutores_aprovado_por_usuarios_id_fk" FOREIGN KEY ("aprovado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "veiculos" ADD CONSTRAINT "veiculos_instrutor_id_instrutores_id_fk" FOREIGN KEY ("instrutor_id") REFERENCES "public"."instrutores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "veiculos" ADD CONSTRAINT "veiculos_autoescola_id_autoescolas_id_fk" FOREIGN KEY ("autoescola_id") REFERENCES "public"."autoescolas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "veiculos" ADD CONSTRAINT "veiculos_documento_id_instrutor_documentos_id_fk" FOREIGN KEY ("documento_id") REFERENCES "public"."instrutor_documentos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "veiculos" ADD CONSTRAINT "veiculos_foto_arquivo_id_arquivos_id_fk" FOREIGN KEY ("foto_arquivo_id") REFERENCES "public"."arquivos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cobrancas" ADD CONSTRAINT "cobrancas_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contas_financeiras" ADD CONSTRAINT "contas_financeiras_instrutor_id_instrutores_id_fk" FOREIGN KEY ("instrutor_id") REFERENCES "public"."instrutores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contas_financeiras" ADD CONSTRAINT "contas_financeiras_autoescola_id_autoescolas_id_fk" FOREIGN KEY ("autoescola_id") REFERENCES "public"."autoescolas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creditos_aula" ADD CONSTRAINT "creditos_aula_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creditos_aula" ADD CONSTRAINT "creditos_aula_aluno_id_alunos_id_fk" FOREIGN KEY ("aluno_id") REFERENCES "public"."alunos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creditos_aula" ADD CONSTRAINT "creditos_aula_instrutor_id_instrutores_id_fk" FOREIGN KEY ("instrutor_id") REFERENCES "public"."instrutores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creditos_aula" ADD CONSTRAINT "creditos_aula_autoescola_id_autoescolas_id_fk" FOREIGN KEY ("autoescola_id") REFERENCES "public"."autoescolas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creditos_movimentos" ADD CONSTRAINT "creditos_movimentos_credito_id_creditos_aula_id_fk" FOREIGN KEY ("credito_id") REFERENCES "public"."creditos_aula"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estornos" ADD CONSTRAINT "estornos_cobranca_id_cobrancas_id_fk" FOREIGN KEY ("cobranca_id") REFERENCES "public"."cobrancas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estornos" ADD CONSTRAINT "estornos_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_conta_id_contas_financeiras_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas_financeiras"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matriculas" ADD CONSTRAINT "matriculas_autoescola_id_autoescolas_id_fk" FOREIGN KEY ("autoescola_id") REFERENCES "public"."autoescolas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matriculas" ADD CONSTRAINT "matriculas_aluno_id_alunos_id_fk" FOREIGN KEY ("aluno_id") REFERENCES "public"."alunos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matriculas" ADD CONSTRAINT "matriculas_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notas_fiscais" ADD CONSTRAINT "notas_fiscais_recibo_id_recibos_id_fk" FOREIGN KEY ("recibo_id") REFERENCES "public"."recibos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notas_fiscais" ADD CONSTRAINT "notas_fiscais_xml_arquivo_id_arquivos_id_fk" FOREIGN KEY ("xml_arquivo_id") REFERENCES "public"."arquivos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notas_fiscais" ADD CONSTRAINT "notas_fiscais_pdf_arquivo_id_arquivos_id_fk" FOREIGN KEY ("pdf_arquivo_id") REFERENCES "public"."arquivos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pacotes" ADD CONSTRAINT "pacotes_instrutor_id_instrutores_id_fk" FOREIGN KEY ("instrutor_id") REFERENCES "public"."instrutores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pacotes" ADD CONSTRAINT "pacotes_autoescola_id_autoescolas_id_fk" FOREIGN KEY ("autoescola_id") REFERENCES "public"."autoescolas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido_historico" ADD CONSTRAINT "pedido_historico_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_aluno_id_alunos_id_fk" FOREIGN KEY ("aluno_id") REFERENCES "public"."alunos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_instrutor_id_instrutores_id_fk" FOREIGN KEY ("instrutor_id") REFERENCES "public"."instrutores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_autoescola_id_autoescolas_id_fk" FOREIGN KEY ("autoescola_id") REFERENCES "public"."autoescolas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_pacote_id_pacotes_id_fk" FOREIGN KEY ("pacote_id") REFERENCES "public"."pacotes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_regra_comissao_id_regras_comissao_id_fk" FOREIGN KEY ("regra_comissao_id") REFERENCES "public"."regras_comissao"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recibos" ADD CONSTRAINT "recibos_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recibos" ADD CONSTRAINT "recibos_arquivo_id_arquivos_id_fk" FOREIGN KEY ("arquivo_id") REFERENCES "public"."arquivos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regras_comissao" ADD CONSTRAINT "regras_comissao_instrutor_id_instrutores_id_fk" FOREIGN KEY ("instrutor_id") REFERENCES "public"."instrutores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regras_comissao" ADD CONSTRAINT "regras_comissao_autoescola_id_autoescolas_id_fk" FOREIGN KEY ("autoescola_id") REFERENCES "public"."autoescolas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regras_comissao" ADD CONSTRAINT "regras_comissao_criado_por_usuarios_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repasses" ADD CONSTRAINT "repasses_conta_id_contas_financeiras_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas_financeiras"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repasses" ADD CONSTRAINT "repasses_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aula_anotacoes" ADD CONSTRAINT "aula_anotacoes_aula_id_aulas_id_fk" FOREIGN KEY ("aula_id") REFERENCES "public"."aulas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aula_historico" ADD CONSTRAINT "aula_historico_aula_id_aulas_id_fk" FOREIGN KEY ("aula_id") REFERENCES "public"."aulas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aulas" ADD CONSTRAINT "aulas_aluno_id_alunos_id_fk" FOREIGN KEY ("aluno_id") REFERENCES "public"."alunos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aulas" ADD CONSTRAINT "aulas_instrutor_id_instrutores_id_fk" FOREIGN KEY ("instrutor_id") REFERENCES "public"."instrutores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aulas" ADD CONSTRAINT "aulas_autoescola_id_autoescolas_id_fk" FOREIGN KEY ("autoescola_id") REFERENCES "public"."autoescolas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aulas" ADD CONSTRAINT "aulas_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aulas" ADD CONSTRAINT "aulas_credito_id_creditos_aula_id_fk" FOREIGN KEY ("credito_id") REFERENCES "public"."creditos_aula"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aulas" ADD CONSTRAINT "aulas_veiculo_id_veiculos_id_fk" FOREIGN KEY ("veiculo_id") REFERENCES "public"."veiculos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "avaliacoes" ADD CONSTRAINT "avaliacoes_aula_id_aulas_id_fk" FOREIGN KEY ("aula_id") REFERENCES "public"."aulas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "avaliacoes" ADD CONSTRAINT "avaliacoes_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "avaliacoes" ADD CONSTRAINT "avaliacoes_autor_aluno_id_alunos_id_fk" FOREIGN KEY ("autor_aluno_id") REFERENCES "public"."alunos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "avaliacoes" ADD CONSTRAINT "avaliacoes_instrutor_id_instrutores_id_fk" FOREIGN KEY ("instrutor_id") REFERENCES "public"."instrutores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "avaliacoes" ADD CONSTRAINT "avaliacoes_autoescola_id_autoescolas_id_fk" FOREIGN KEY ("autoescola_id") REFERENCES "public"."autoescolas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "avaliacoes" ADD CONSTRAINT "avaliacoes_moderada_por_usuarios_id_fk" FOREIGN KEY ("moderada_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registros_evolucao" ADD CONSTRAINT "registros_evolucao_aula_id_aulas_id_fk" FOREIGN KEY ("aula_id") REFERENCES "public"."aulas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registros_evolucao" ADD CONSTRAINT "registros_evolucao_aluno_id_alunos_id_fk" FOREIGN KEY ("aluno_id") REFERENCES "public"."alunos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registros_evolucao" ADD CONSTRAINT "registros_evolucao_instrutor_id_instrutores_id_fk" FOREIGN KEY ("instrutor_id") REFERENCES "public"."instrutores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registros_evolucao" ADD CONSTRAINT "registros_evolucao_habilidade_id_habilidades_id_fk" FOREIGN KEY ("habilidade_id") REFERENCES "public"."habilidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "configuracoes" ADD CONSTRAINT "configuracoes_atualizado_por_usuarios_id_fk" FOREIGN KEY ("atualizado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entregas_notificacao" ADD CONSTRAINT "entregas_notificacao_notificacao_id_notificacoes_id_fk" FOREIGN KEY ("notificacao_id") REFERENCES "public"."notificacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos_consumidos" ADD CONSTRAINT "eventos_consumidos_evento_id_outbox_eventos_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."outbox_eventos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integracoes_autoescola" ADD CONSTRAINT "integracoes_autoescola_autoescola_id_autoescolas_id_fk" FOREIGN KEY ("autoescola_id") REFERENCES "public"."autoescolas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notificacoes" ADD CONSTRAINT "notificacoes_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operacoes_integracao" ADD CONSTRAINT "operacoes_integracao_autoescola_id_autoescolas_id_fk" FOREIGN KEY ("autoescola_id") REFERENCES "public"."autoescolas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operacoes_integracao" ADD CONSTRAINT "operacoes_integracao_evento_origem_id_outbox_eventos_id_fk" FOREIGN KEY ("evento_origem_id") REFERENCES "public"."outbox_eventos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vinculos_externos" ADD CONSTRAINT "vinculos_externos_autoescola_id_autoescolas_id_fk" FOREIGN KEY ("autoescola_id") REFERENCES "public"."autoescolas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "alunos_usuario_uk" ON "alunos" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX "arquivos_dono_idx" ON "arquivos" USING btree ("dono_usuario_id");--> statement-breakpoint
CREATE INDEX "codigos_destino_idx" ON "codigos_verificacao" USING btree ("destino","finalidade");--> statement-breakpoint
CREATE INDEX "consentimentos_usuario_idx" ON "consentimentos" USING btree ("usuario_id","finalidade");--> statement-breakpoint
CREATE UNIQUE INDEX "dispositivos_token_uk" ON "dispositivos_push" USING btree ("expo_push_token");--> statement-breakpoint
CREATE UNIQUE INDEX "documentos_legais_versao_uk" ON "documentos_legais" USING btree ("tipo","versao");--> statement-breakpoint
CREATE UNIQUE INDEX "documentos_legais_vigente_uk" ON "documentos_legais" USING btree ("tipo") WHERE "documentos_legais"."vigente";--> statement-breakpoint
CREATE UNIQUE INDEX "sessoes_token_uk" ON "sessoes" USING btree ("refresh_token_hash");--> statement-breakpoint
CREATE INDEX "sessoes_usuario_idx" ON "sessoes" USING btree ("usuario_id");--> statement-breakpoint
CREATE UNIQUE INDEX "usuarios_cpf_uk" ON "usuarios" USING btree ("cpf");--> statement-breakpoint
CREATE UNIQUE INDEX "usuarios_email_uk" ON "usuarios" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "usuarios_telefone_uk" ON "usuarios" USING btree ("telefone");--> statement-breakpoint
CREATE UNIQUE INDEX "autoescola_doc_atual_uk" ON "autoescola_documentos" USING btree ("autoescola_id","tipo") WHERE "autoescola_documentos"."status" <> 'substituido';--> statement-breakpoint
CREATE UNIQUE INDEX "membros_uk" ON "autoescola_membros" USING btree ("autoescola_id","usuario_id");--> statement-breakpoint
CREATE INDEX "membros_usuario_idx" ON "autoescola_membros" USING btree ("usuario_id");--> statement-breakpoint
CREATE UNIQUE INDEX "autoescolas_cnpj_uk" ON "autoescolas" USING btree ("cnpj");--> statement-breakpoint
CREATE UNIQUE INDEX "autoescolas_slug_uk" ON "autoescolas" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "autoescolas_localizacao_gix" ON "autoescolas" USING gist ("localizacao");--> statement-breakpoint
CREATE INDEX "bloqueio_instrutor_idx" ON "bloqueios_agenda" USING btree ("instrutor_id","inicio");--> statement-breakpoint
CREATE INDEX "disp_instrutor_idx" ON "disponibilidades_semanais" USING btree ("instrutor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "habilidades_codigo_uk" ON "habilidades" USING btree ("codigo");--> statement-breakpoint
CREATE UNIQUE INDEX "instrutor_doc_atual_uk" ON "instrutor_documentos" USING btree ("instrutor_id","tipo") WHERE "instrutor_documentos"."status" <> 'substituido';--> statement-breakpoint
CREATE INDEX "instrutor_doc_validade_idx" ON "instrutor_documentos" USING btree ("validade") WHERE "instrutor_documentos"."status" = 'aprovado';--> statement-breakpoint
CREATE UNIQUE INDEX "instrutores_usuario_uk" ON "instrutores" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX "instrutores_base_gix" ON "instrutores" USING gist ("base_localizacao");--> statement-breakpoint
CREATE INDEX "instrutores_categorias_gin" ON "instrutores" USING gin ("categorias");--> statement-breakpoint
CREATE INDEX "instrutores_busca_idx" ON "instrutores" USING btree ("status","disponivel") WHERE "instrutores"."status" = 'aprovado' and "instrutores"."disponivel";--> statement-breakpoint
CREATE UNIQUE INDEX "veiculos_placa_uk" ON "veiculos" USING btree ("placa") WHERE "veiculos"."ativo";--> statement-breakpoint
CREATE INDEX "veiculos_instrutor_idx" ON "veiculos" USING btree ("instrutor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cobrancas_gateway_uk" ON "cobrancas" USING btree ("gateway","gateway_cobranca_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cobrancas_idempotencia_uk" ON "cobrancas" USING btree ("chave_idempotencia");--> statement-breakpoint
CREATE INDEX "cobrancas_pedido_idx" ON "cobrancas" USING btree ("pedido_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contas_instrutor_uk" ON "contas_financeiras" USING btree ("instrutor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contas_autoescola_uk" ON "contas_financeiras" USING btree ("autoescola_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contas_sistema_uk" ON "contas_financeiras" USING btree ("titular_tipo") WHERE "contas_financeiras"."titular_tipo" in ('plataforma', 'externa');--> statement-breakpoint
CREATE UNIQUE INDEX "creditos_pedido_uk" ON "creditos_aula" USING btree ("pedido_id");--> statement-breakpoint
CREATE INDEX "creditos_aluno_idx" ON "creditos_aula" USING btree ("aluno_id");--> statement-breakpoint
CREATE INDEX "creditos_mov_credito_idx" ON "creditos_movimentos" USING btree ("credito_id");--> statement-breakpoint
CREATE INDEX "lancamentos_conta_idx" ON "lancamentos" USING btree ("conta_id","criado_em");--> statement-breakpoint
CREATE INDEX "lancamentos_operacao_idx" ON "lancamentos" USING btree ("operacao_id");--> statement-breakpoint
CREATE INDEX "lancamentos_pedido_idx" ON "lancamentos" USING btree ("pedido_id");--> statement-breakpoint
CREATE UNIQUE INDEX "matriculas_pedido_uk" ON "matriculas" USING btree ("pedido_id");--> statement-breakpoint
CREATE INDEX "pacotes_autoescola_idx" ON "pacotes" USING btree ("autoescola_id");--> statement-breakpoint
CREATE INDEX "pedido_historico_pedido_idx" ON "pedido_historico" USING btree ("pedido_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pedidos_codigo_uk" ON "pedidos" USING btree ("codigo");--> statement-breakpoint
CREATE INDEX "pedidos_aluno_idx" ON "pedidos" USING btree ("aluno_id");--> statement-breakpoint
CREATE INDEX "pedidos_instrutor_idx" ON "pedidos" USING btree ("instrutor_id");--> statement-breakpoint
CREATE INDEX "pedidos_fila_idx" ON "pedidos" USING btree ("autoescola_id","status_atendimento","pago_em") WHERE "pedidos"."status" = 'pago';--> statement-breakpoint
CREATE UNIQUE INDEX "recibos_pedido_uk" ON "recibos" USING btree ("pedido_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recibos_numero_uk" ON "recibos" USING btree ("numero");--> statement-breakpoint
CREATE INDEX "regras_vigentes_idx" ON "regras_comissao" USING btree ("vendedor_tipo","produto_tipo","vigente_ate");--> statement-breakpoint
CREATE UNIQUE INDEX "webhooks_evento_uk" ON "webhooks_recebidos" USING btree ("gateway","evento_externo_id");--> statement-breakpoint
CREATE INDEX "aula_historico_aula_idx" ON "aula_historico" USING btree ("aula_id");--> statement-breakpoint
CREATE INDEX "aulas_instrutor_idx" ON "aulas" USING btree ("instrutor_id","inicio");--> statement-breakpoint
CREATE INDEX "aulas_aluno_idx" ON "aulas" USING btree ("aluno_id","inicio");--> statement-breakpoint
CREATE INDEX "aulas_status_idx" ON "aulas" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "avaliacoes_aula_alvo_uk" ON "avaliacoes" USING btree ("aula_id","alvo_tipo");--> statement-breakpoint
CREATE INDEX "avaliacoes_instrutor_idx" ON "avaliacoes" USING btree ("instrutor_id","criado_em");--> statement-breakpoint
CREATE UNIQUE INDEX "evolucao_aula_habilidade_uk" ON "registros_evolucao" USING btree ("aula_id","habilidade_id");--> statement-breakpoint
CREATE INDEX "evolucao_aluno_idx" ON "registros_evolucao" USING btree ("aluno_id");--> statement-breakpoint
CREATE UNIQUE INDEX "integracoes_autoescola_uk" ON "integracoes_autoescola" USING btree ("autoescola_id","sistema");--> statement-breakpoint
CREATE INDEX "notificacoes_usuario_idx" ON "notificacoes" USING btree ("usuario_id","criado_em");--> statement-breakpoint
CREATE INDEX "operacoes_status_idx" ON "operacoes_integracao" USING btree ("status","proxima_tentativa_em");--> statement-breakpoint
CREATE INDEX "outbox_pendentes_idx" ON "outbox_eventos" USING btree ("proxima_tentativa_em","id") WHERE "outbox_eventos"."status" in ('pendente', 'falhou');--> statement-breakpoint
CREATE INDEX "outbox_agregado_idx" ON "outbox_eventos" USING btree ("agregado_tipo","agregado_id");--> statement-breakpoint
CREATE UNIQUE INDEX "auditoria_seq_uk" ON "auditoria"."registros" USING btree ("seq");--> statement-breakpoint
CREATE INDEX "auditoria_entidade_idx" ON "auditoria"."registros" USING btree ("entidade_tipo","entidade_id");--> statement-breakpoint
CREATE INDEX "auditoria_ator_idx" ON "auditoria"."registros" USING btree ("ator_usuario_id");--> statement-breakpoint
CREATE INDEX "auditoria_autoescola_idx" ON "auditoria"."registros" USING btree ("autoescola_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vinculos_interno_uk" ON "vinculos_externos" USING btree ("sistema_externo","autoescola_id","tipo_registro","id_interno");--> statement-breakpoint
CREATE UNIQUE INDEX "vinculos_externo_uk" ON "vinculos_externos" USING btree ("sistema_externo","autoescola_id","tipo_registro","id_externo");