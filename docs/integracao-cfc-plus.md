# Integração Volante → CFC Plus (versão 1)

A integração é **por autoescola e opcional**: sem ela, o app funciona completo. Ela leva as vendas do app
para o ERP CFC Plus, onde a secretaria cadastra o aluno (casado pelo CPF) e faz a matrícula como de costume.

## Como conectar

1. No **CFC Plus**: Administração › Integrações › **Gerar chave para o app Volante**. A chave aparece uma
   única vez (o CFC Plus guarda só o hash SHA-256).
2. No **painel do Volante** (dono ou gerente da autoescola): Integrações › CFC Plus › informe o endereço do
   CFC Plus e a chave › **Conectar e testar**. A chave é guardada cifrada (AES-256-GCM).
3. O worker do Volante chama `GET /status`; se der certo, a integração fica **Conectada** e mostra o nome do CFC.
4. Opcional: **Reenviar vendas e aulas** reenvia o estado atual de todas as vendas pagas e das aulas concluídas.

## API do CFC Plus usada pelo Volante

Base: `{endereço do CFC Plus}/api/integracoes/volante/v1` · Autenticação: `Authorization: Bearer cfcp_<prefixo>_<segredo>`.
Chamadas servidor a servidor (sem cookie e sem cabeçalho `Origin`).

| Método e caminho | Resposta                                                                               |
| ---------------- | -------------------------------------------------------------------------------------- |
| `GET /status`    | `200 { "ok": true, "versao": 1, "cfc": { "nome": "Auto Escola Albatroz" } }`           |
| `POST /eventos`  | `200 { "recebido": true, "vendaId": "…", "duplicado": false }` (idempotente pelo `id`) |
| `POST /aulas`    | `200 { "recebido": true, "aulaAppId": "…", "situacao": "lancada" \| "pendente", … }`   |

Erros: `401` chave inválida ou revogada · `404` em `/aulas` = CFC Plus ainda sem esta rota (o Volante tenta de novo, sem derrubar a conexão) · `400` corpo inválido · `5xx` falha passageira (o Volante tenta de
novo com espera exponencial, até 10 vezes). `409` é tratado como "já recebido".

## Evento (corpo do `POST /eventos`)

```json
{
  "versao": 1,
  "id": "0199…", // único por envio; repetições são ignoradas
  "tipo": "pedido.pago", // pedido.pago | pedido.confirmado | pedido.recusado | pedido.expirado | matricula.criada | pedido.sincronizado
  "ocorridoEm": "2026-10-08T19:05:00.000Z",
  "pedido": {
    "id": "…",
    "codigo": "PD-KPTFL5",
    "status": "pago",
    "statusAtendimento": "novo",
    "motivoRecusa": null,
    "descricao": "Primeira habilitação B — 20 aulas",
    "categorias": ["B"],
    "quantidadeAulas": 20,
    "duracaoAulaMin": 50,
    "valorBrutoCentavos": 180000,
    "descontoCentavos": 10000,
    "valorPagoCentavos": 170000,
    "valorLiquidoCentavos": 153000,
    "cupom": "MATRICULA100",
    "metodoPagamento": "cartao",
    "parcelas": 10,
    "pagoEm": "2026-10-08T19:05:00.000Z",
    "matriculaId": null
  },
  "aluno": {
    "id": "…",
    "nome": "Lucas Pereira",
    "nomeSocial": null,
    "cpf": "52998224725",
    "email": "aluno@exemplo.com",
    "telefone": "+5511911110000",
    "dataNascimento": "2004-05-10",
    "categoriaDesejada": "B",
    "renach": null
  }
}
```

- O CFC Plus guarda **o estado mais recente** de cada pedido (pelo `pedido.id`), ignorando eventos mais antigos
  que o último recebido (`ocorridoEm`).
- `valorPagoCentavos` foi pago **pelo app** (Pix ou cartão); o app repassa à autoescola o `valorLiquidoCentavos`
  quando ela confirma a matrícula. No CFC Plus, a tela da venda mostra os dois valores e lembra a secretaria de
  registrar as parcelas da matrícula como já recebidas (não há lançamento automático no financeiro do CFC Plus).

## Aula concluída (corpo do `POST /aulas`)

Enviada quando uma aula de autoescola conectada é concluída (`aula.concluida`) e de novo quando o instrutor registra
evolução depois disso (`aula.atualizada`). O CFC Plus lança a aula na agenda como realizada (casando aluno,
matrícula, instrutor pelo CPF e veículo pela placa) ou a deixa pendente em **Aulas do app**.

```json
{
  "versao": 1,
  "id": "0199…",
  "tipo": "aula.concluida", // aula.concluida | aula.atualizada
  "ocorridoEm": "2026-10-09T12:52:00.000Z",
  "aula": {
    "id": "…",
    "pedidoId": "…",
    "pedidoCodigo": "PD-KPTFL5",
    "categoria": "B",
    "inicio": "2026-10-09T12:00:00.000Z", // horário agendado
    "fim": "2026-10-09T12:50:00.000Z",
    "checkinEm": "2026-10-09T12:02:00.000Z", // horários reais
    "checkoutEm": "2026-10-09T12:49:00.000Z",
    "minutosAgendados": 50,
    "minutosRealizados": 47,
    "minutosContados": 47, // realizado, limitado ao agendado
    "instrutor": { "nome": "Rafael Souza", "cpf": "83993418433" },
    "veiculo": { "placa": "ABC1D23", "descricao": "Fiat Argo branco" },
    "pontoEncontro": "Av. Paulista, 1000",
    "habilidades": [{ "nome": "Baliza", "nivel": 3 }],
    "anotacao": "Melhorou a baliza."
  },
  "aluno": { "id": "…", "nome": "Lucas Pereira", "cpf": "52998224725" }
}
```

## Onde está no código

- Volante: `apps/worker/src/consumidores/cfc-plus.ts` (envio e registro em `operacoes_integracao`),
  `apps/worker/src/adaptadores/cfc-plus-http.ts`, `apps/api/src/modulos/integracoes/`, tela Integrações do painel.
- CFC Plus: `apps/api/src/integracoes/` (API), migration `0023_integracao_volante.sql`, telas
  Administração › Integrações e Secretaria › Vendas do app; contrato do lado de lá em `docs/INTEGRACAO-VOLANTE.md`.
