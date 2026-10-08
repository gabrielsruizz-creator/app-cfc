# Integração Volante → CFC Plus (versão 1)

A integração é **por autoescola e opcional**: sem ela, o app funciona completo. Ela leva as vendas do app
para o ERP CFC Plus, onde a secretaria cadastra o aluno (casado pelo CPF) e faz a matrícula como de costume.

## Como conectar

1. No **CFC Plus**: Administração › Integrações › **Gerar chave para o app Volante**. A chave aparece uma
   única vez (o CFC Plus guarda só o hash SHA-256).
2. No **painel do Volante** (dono ou gerente da autoescola): Integrações › CFC Plus › informe o endereço do
   CFC Plus e a chave › **Conectar e testar**. A chave é guardada cifrada (AES-256-GCM).
3. O worker do Volante chama `GET /status`; se der certo, a integração fica **Conectada** e mostra o nome do CFC.
4. Opcional: **Enviar pedidos já recebidos** reenvia o estado atual de todas as vendas pagas.

## API do CFC Plus usada pelo Volante

Base: `{endereço do CFC Plus}/api/integracoes/volante/v1` · Autenticação: `Authorization: Bearer cfcp_<prefixo>_<segredo>`.
Chamadas servidor a servidor (sem cookie e sem cabeçalho `Origin`).

| Método e caminho | Resposta                                                                               |
| ---------------- | -------------------------------------------------------------------------------------- |
| `GET /status`    | `200 { "ok": true, "cfc": { "nome": "Auto Escola Albatroz" } }`                        |
| `POST /eventos`  | `200 { "recebido": true, "vendaId": "…", "duplicado": false }` (idempotente pelo `id`) |

Erros: `401` chave inválida ou revogada · `400` corpo inválido · `5xx` falha passageira (o Volante tenta de
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
  quando ela confirma a matrícula. No CFC Plus, a matrícula registra essa entrada como "Pago pelo app Volante".

## Onde está no código

- Volante: `apps/worker/src/consumidores/cfc-plus.ts` (envio e registro em `operacoes_integracao`),
  `apps/worker/src/adaptadores/cfc-plus-http.ts`, `apps/api/src/modulos/integracoes/`, tela Integrações do painel.
- CFC Plus: módulo `integracoes/volante` (API), migration `0023_integracao_volante.sql`, telas
  Administração › Integrações e Secretaria › Vendas do app.
