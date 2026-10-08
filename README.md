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

| Conta                              | Para quê                                                                                               |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `aluno@demo.com`                   | Buscar instrutores e autoescolas, agendar, comprar pacotes (Pix simulado), conversar                   |
| `instrutor@demo.com`               | Aceitar aulas, check-in/out, evolução, pacotes, ganhos e saque; faz parte da equipe da Autoescola Demo |
| `autoescola@demo.com`              | Painel web da autoescola (fila de novos alunos, pacotes, vitrine, financeiro)                          |
| `admin@volante.dev` / `admin12345` | Painel web de administração                                                                            |

Os instrutores e a autoescola de demonstração ficam perto da Av. Paulista (São Paulo). Para levá-los para outra cidade:
coloque `DEMO_LAT=-22.9068` e `DEMO_LNG=-43.1729` (exemplo: Rio de Janeiro) no `.env` antes do `pnpm db:semear -- --demo`
(rodar de novo move os que já existem).

### Roteiro de teste da Fase 2

1. **App, como aluno:** aba **Autoescolas** → Autoescola Demo → **Comprar com Pix** um pacote → **Simular pagamento**.
   O pedido fica "Aguardando contato da autoescola" (Perfil › Meus pacotes).
2. **Painel web, como autoescola** (`autoescola@demo.com`): **Novos alunos do app** mostra o pedido com o tempo de espera
   (verde até 24 h, amarelo até 48 h, vermelho depois), o botão **Chamar no WhatsApp** e as ações
   _Em contato_, _Confirmar matrícula_ e _Recusar_ (com motivo; o aluno é reembolsado).
3. Depois de confirmar: no app, **Perfil › Saldo de aulas** → Agendar → escolha o instrutor da equipe. A aula entra
   sem novo pagamento; o instrutor aceita como de costume.
4. **Pacote de instrutor:** no perfil do instrutor demo há "5 aulas com desconto"; o valor é liberado a cada aula realizada
   (veja em **Painel › Ganhos e saques** no modo instrutor, onde também se cadastra a chave Pix e se pede o saque).
5. **Conversas:** "Tirar dúvidas pelo chat" no perfil da autoescola; ela responde em **Conversas** no painel.
6. **Problema numa aula:** depois do check-out, "Relatar problema nesta aula" abre uma disputa; o admin decide em
   **Disputas** (negar, estorno parcial ou total). Enquanto isso a aula não é confirmada automaticamente.
7. **Admin:** Início com indicadores do mês e gráfico de aulas por dia, **Usuários** (bloquear/desbloquear),
   **Denúncias** e **Disputas**.

Prazos da fila (lembrete em 48 h e expiração em 5 dias) e demais regras ficam em **Admin › Configurações**.

### Roteiro de teste da Fase 3

1. **Cupom e cartão parcelado:** no app (aluno), Autoescola Demo → **Comprar** um pacote. No resumo, aplique o cupom
   `MATRICULA100` (R$ 100 de desconto, pago pela autoescola), escolha **Cartão de crédito** e o número de parcelas
   (até 10x) → **Simular pagamento**. Em produção, o botão "Pagar com cartão" abre a página segura do Asaas.
   O cupom `BEMVINDO` (10% na primeira compra, pago pela plataforma) também vale para aulas avulsas.
2. **Cupons no painel:** **Admin › Cupons** cria cupons para todos ou para um parceiro, escolhendo quem paga o desconto
   (plataforma: o vendedor recebe o valor cheio; vendedor: a comissão é sobre o valor com desconto).
   A autoescola cria os próprios cupons em **Cupons**.
3. **Instrutor a caminho:** com uma aula confirmada para as próximas 3 horas, o instrutor toca **Estou a caminho** na
   tela da aula. Enquanto essa tela estiver aberta, a posição dele é enviada a cada ~10 s.
4. **Mapa do aluno:** a tela da aula mostra o instrutor no mapa e a estimativa de chegada.
5. **Contato de confiança:** **Compartilhar aula** gera um link (sem login) que mostra o mapa e os dados da aula até
   2 horas depois do fim; dá para desativar a qualquer momento. No computador, o link usa o IP da sua rede
   (porta 5173), então abre em outro celular conectado ao mesmo Wi-Fi. Para outro endereço, defina `URL_PAINEL`.
6. **Relatórios:** **Relatórios** no painel da autoescola (vendas, conversão da fila, tempo até o primeiro contato,
   aulas por instrutor, cupons) e do admin (vendas por dia, formas de pagamento, maiores vendedores), com
   **Exportar vendas (CSV)**, que abre direto no Excel.

As posições do instrutor só são gravadas entre "a caminho" e o check-out e são apagadas depois de 30 dias.

### Roteiro de teste da Fase 4 (integração com o CFC Plus)

Precisa do CFC Plus rodando (repositório `CFC-Plus`, branch com a integração; API em `:3333`). Os dois painéis
usam a porta 5173: o que subir depois vai sozinho para a 5174.

1. **CFC Plus:** Administração › **Integrações** › **Gerar chave para o app Volante**. Copie a chave (aparece uma vez)
   e o endereço mostrado.
2. **Volante:** painel da autoescola (dono ou gerente) › **Integrações** › cole o endereço (no computador, use
   `http://localhost:3333`, a API do CFC Plus) e a chave › **Conectar e testar**. Em segundos fica **Conectada** com o nome do CFC. Chave errada mostra "Com problema" e o motivo.
3. **Venda:** no app, um aluno compra um pacote da autoescola e paga (Simular pagamento). Em **Últimos envios** aparece
   "Venda paga · Recebido"; no CFC Plus, **Secretaria › Vendas do app** mostra a venda com os dados do aluno.
4. **CFC Plus:** **Cadastrar aluno** cria a ficha (origem "App Volante"); **Fazer matrícula** segue o fluxo normal e,
   depois, **Vincular** marca a venda como matriculada.
5. **Enviar pedidos já recebidos** reenvia as vendas pagas antes da conexão (sem duplicar do outro lado).

Se o CFC Plus estiver fora do ar, o envio fica "Tentando de novo" e o worker repete com espera crescente.
Contrato da API em [docs/integracao-cfc-plus.md](docs/integracao-cfc-plus.md).

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
adaptador Asaas (Pix e cartão parcelado), adaptador e envios ao CFC Plus, os fluxos completos das Fases 1 a 4 pela API (fila da autoescola,
pacotes, saldo de aulas, chat, financeiro, disputas, moderação, cupons, cartão, rastreamento, link do contato de
confiança, relatórios e CSV) e as rotinas do worker (lembrete/expiração de pedidos, validade de pacotes, saque via Pix
com devolução em caso de falha, expurgo de posições).

## Fases

- **Fase 1 (entregue):** monorepo, cadastro/login dos perfis, aprovação de instrutor e autoescola, busca no mapa,
  agendamento com instrutor autônomo, Pix, check-in/check-out, avaliação e evolução.
- **Fase 2 (entregue):** vitrine e painel de autoescolas, pacotes (autoescola e instrutor), fila "Novos alunos do app",
  saldo de aulas, chat, financeiro e saque do instrutor/autoescola, disputas, denúncias e painel admin completo.
- **Fase 3 (entregue):** instrutor a caminho com mapa ao vivo, link para contato de confiança, cupons (pagos pela
  plataforma ou pelo parceiro), relatórios com exportação CSV e cartão de crédito parcelado.
- **Fase 4 (entregue):** integração opcional, por autoescola, com o ERP CFC Plus: chave gerada no CFC Plus, teste de
  conexão, envio das vendas (pagas, confirmadas, recusadas, expiradas) com novas tentativas e histórico de envios.
