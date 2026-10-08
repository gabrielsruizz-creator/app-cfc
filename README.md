# Volante (nome provisório)

Marketplace que conecta alunos a **instrutores de trânsito autônomos credenciados pelo DETRAN** e a **autoescolas (CFCs)**.
Funciona sozinho; a integração com o ERP CFC Plus é opcional e virá na Fase 4.

> O nome "Volante" e a paleta verde-petróleo + amarelo são **provisórios** — ficam em
> `apps/mobile/src/tema/cores.ts` e `apps/web/src/estilos.css`.

## O que tem aqui

| Pasta                | O que é                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------- |
| `apps/mobile`        | App **React Native (Expo)** — modo Aluno e modo Instrutor. Testável no celular com o **Expo Go**. |
| `apps/web`           | Painel **web** (React + Vite) — administração e autoescola.                                       |
| `apps/api`           | API **NestJS**. Nunca chama serviços externos.                                                    |
| `apps/worker`        | Consome os eventos (outbox) e faz toda chamada externa: pagamento, push, CFC Plus.                |
| `packages/db`        | Banco PostgreSQL + PostGIS com Drizzle, migrações, RLS e sementes.                                |
| `packages/dominio`   | Regras de negócio compartilhadas (agenda, pagamento retido, estornos, cancelamento).              |
| `packages/contracts` | Schemas Zod compartilhados entre app, painel e API.                                               |
| `docs/`              | [Modelagem do banco](docs/01-modelagem-banco.md) e [mapa de telas](docs/02-mapa-de-telas.md).     |

## Testar sem instalar banco: Render (nuvem)

O arquivo `render.yaml` cria no [Render](https://render.com) um **ambiente de testes gratuito**: banco PostgreSQL + PostGIS
e um serviço que roda a API, o worker e o painel web (em `/painel`).

1. Crie uma conta no Render e conecte sua conta do GitHub.
2. No painel do Render: **New → Blueprint** → escolha o repositório `app-cfc` e o branch deste projeto → **Apply**.
3. Espere o deploy terminar (≈ 5–10 min na primeira vez). O endereço aparece em **volante-api**, algo como
   `https://volante-api.onrender.com`.
4. Painel web: abra `https://SEU-ENDERECO.onrender.com/painel`. A senha do admin (`admin@volante.dev`) foi gerada
   automaticamente: veja em **volante-api → Environment → ADMIN_SENHA**.
5. App no celular: no seu computador (sem precisar de Docker), crie o arquivo `apps/mobile/.env` com
   ```
   EXPO_PUBLIC_API_URL=https://SEU-ENDERECO.onrender.com
   ```
   e rode `pnpm install` e `pnpm dev:mobile`. Leia o QR Code com o Expo Go (celular e computador no mesmo Wi-Fi).

Limitações do plano gratuito: a API "dorme" após 15 min sem uso (o primeiro acesso demora ~1 min), o banco
gratuito expira em 30 dias e fotos/documentos enviados somem quando o serviço reinicia.

## Atalho no Windows

Com o Docker Desktop aberto, dê dois cliques em:

- **`preparar.bat`**: na primeira vez e sempre que houver atualizações (baixa, instala, atualiza o banco e os dados de demonstração);
- **`iniciar.bat`**: liga o banco e abre as 4 janelas (API, worker, painel web e app com o QR Code).

## Como rodar no seu computador

Pré-requisitos: **Node 22**, **pnpm 10** (`npm i -g pnpm`), **Docker** e o app **Expo Go** no celular.

```bash
pnpm install
cp .env.exemplo .env                 # no Windows: copy .env.exemplo .env
docker compose up -d                 # Postgres + PostGIS
pnpm build:pacotes                   # compila contracts, db e dominio
pnpm db:migrar
pnpm db:semear -- --demo             # dados de referência + contas de demonstração
```

Depois, em terminais separados:

```bash
pnpm dev:api                              # API em http://localhost:3000
pnpm dev:worker                           # processa Pix, notificações e prazos
pnpm dev:web                              # painel em http://localhost:5173
pnpm dev:mobile                           # mostra um QR Code
```

**No celular:** conecte-se ao **mesmo Wi-Fi** do computador, abra o **Expo Go** e leia o QR Code.
O app encontra a API sozinho pelo IP do computador (porta 3000). Se não conectar, defina
`EXPO_PUBLIC_API_URL=http://IP-DO-COMPUTADOR:3000` antes do `pnpm dev:mobile`.

### Contas de demonstração (senha `demo1234`)

| Conta                              | Para quê                                                                             |
| ---------------------------------- | ------------------------------------------------------------------------------------ |
| `aluno@demo.com`                   | Buscar instrutores, agendar, pagar (Pix simulado), acompanhar a aula                 |
| `instrutor@demo.com`               | Aceitar a aula, fazer check-in com o código do aluno, check-out e registrar evolução |
| `autoescola@demo.com`              | Painel web da autoescola                                                             |
| `admin@volante.dev` / `admin12345` | Painel web de administração                                                          |

Os instrutores de demonstração ficam perto da Av. Paulista (São Paulo). Para criá-los em outra cidade:
coloque `DEMO_LAT=-22.9068` e `DEMO_LNG=-43.1729` (exemplo: Rio de Janeiro) no `.env` antes do `pnpm db:semear -- --demo`.

### Pagamento em modo de teste

Com `PAGAMENTO_GATEWAY=simulado` (já é o valor do `.env.exemplo`), o Pix gerado é fictício. Na tela de pagamento do app aparece
o botão **"Simular pagamento"**, que percorre o mesmo caminho de um pagamento real
(webhook → worker → confirmação). Esse modo é **bloqueado em produção**.
Sem gateway configurado (`nao_configurado`), a cobrança fica "pendente de configuração" e o
app avisa que o pagamento está indisponível — nada finge sucesso.
Para usar o **Asaas** (sandbox): `PAGAMENTO_GATEWAY=asaas` na API e `ASAAS_API_KEY` + `ASAAS_WEBHOOK_TOKEN` no worker,
com o webhook do Asaas apontando para `POST /webhooks/pagamentos/asaas`.

### Para testar o check-in

O check-in exige estar a até 300 m do ponto de encontro e só abre 30 min antes da aula
(ambos configuráveis no painel admin → Configurações). Para testar sentado no sofá, marque o
ponto de encontro onde você está.

## Testes

```bash
pnpm typecheck
pnpm test        # usa um Postgres real (TEST_DATABASE_URL; padrão: postgres://postgres:postgres@localhost:5432/postgres)
```

Cobrem: isolamento entre autoescolas (RLS), agenda sem conflito mesmo com reservas simultâneas,
fluxo do dinheiro (retenção, liberação com comissão, estornos, multa), auditoria imutável,
worker (Pix simulado, gateway não configurado, novas tentativas, prazos, documentos vencidos),
adaptador Asaas e o fluxo completo da Fase 1 pela API.

## Fases

- **Fase 1 (esta entrega):** monorepo, cadastro/login dos perfis, aprovação de instrutor e autoescola, busca no mapa,
  agendamento com instrutor autônomo, Pix, check-in/check-out, avaliação e evolução.
- **Fase 2:** vitrine e painel de autoescolas, pacotes, fila "Novos alunos do app", chat, financeiro do instrutor e painel admin completo.
- **Fase 3:** rastreamento em tempo real, cupons, relatórios e cartão parcelado.
- **Fase 4:** integração com o CFC Plus.
