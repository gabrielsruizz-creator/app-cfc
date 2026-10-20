import {
  ATOR_SISTEMA,
  comAtor,
  contratoEnvios,
  criarBancoTeste,
  eq,
  fabricarAluno,
  fabricarAutoescola,
  pacotes,
  publicarEvento,
  semearBase,
  usuarios,
  alunos,
  contratos,
  type BancoTeste,
} from '@volante/db';
import { comprarPacote, confirmarPagamento, previaDoContrato } from '@volante/dominio';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EmailNaoConfigurado } from '../src/adaptadores/email';
import { GatewayNaoConfigurado } from '../src/adaptadores/gateway-nao-configurado';
import { GatewaySimulado } from '../src/adaptadores/gateway-simulado';
import { CfcPlusNaoConfigurado } from '../src/adaptadores/cfc-plus-nao-configurado';
import { PushNaoConfigurado } from '../src/adaptadores/push';
import { CONSUMIDORES } from '../src/consumidores';
import { logSilencioso, type Dependencias } from '../src/dependencias';
import { processarTudo } from '../src/outbox';
import type { EmailPort, MensagemEmail, ResultadoEmail } from '../src/portas/email';

class EmailFalso implements EmailPort {
  enviados: MensagemEmail[] = [];
  resposta: ResultadoEmail = { status: 'enviado', id: 'msg-1' };
  async enviar(m: MensagemEmail) {
    this.enviados.push(m);
    return this.resposta;
  }
}

let banco: BancoTeste;
let email: EmailFalso;
const deps = (e: EmailPort): Dependencias => ({
  db: banco.db,
  gateways: { simulado: new GatewaySimulado(), nao_configurado: new GatewayNaoConfigurado() },
  push: new PushNaoConfigurado(),
  cfcPlus: new CfcPlusNaoConfigurado(),
  email: e,
  log: logSilencioso,
});
const sistema = <T>(fn: Parameters<typeof comAtor<T>>[2]) => comAtor(banco.db, ATOR_SISTEMA, fn);

beforeAll(async () => {
  banco = await criarBancoTeste();
  await semearBase(banco.db);
});
afterAll(async () => banco?.destruir());

/** Compra paga de um pacote de autoescola, com o aceite do contrato como o app faz. */
async function compraPaga() {
  const { autoescola } = await fabricarAutoescola(banco.db);
  const { aluno } = await fabricarAluno(banco.db);
  const [p] = await sistema((tx) =>
    tx
      .insert(pacotes)
      .values({
        vendedorTipo: 'autoescola',
        autoescolaId: autoescola.id,
        nome: 'Pacote 20 aulas',
        categorias: ['B'],
        quantidadeAulas: 20,
        duracaoAulaMin: 50,
        precoCentavos: 180000,
        publicado: true,
      })
      .returning(),
  );
  const ator = { tipo: 'aluno' as const, alunoId: aluno.id };
  const dados = { alunoId: aluno.id, pacoteId: p!.id, gateway: 'simulado' as const };
  const previa = await comAtor(banco.db, ator, (tx) =>
    previaDoContrato(tx, async (sp) => ({
      pedidoId: (await comprarPacote(sp, { ...dados, chaveIdempotencia: crypto.randomUUID() }))
        .pedido.id,
    })),
  );
  const r = await comAtor(banco.db, ator, (tx) =>
    comprarPacote(tx, {
      ...dados,
      chaveIdempotencia: crypto.randomUUID(),
      aceiteContrato: { hash: previa.hash, ip: '189.45.10.200', userAgent: 'Volante/1 (Android)' },
    }),
  );
  await sistema((tx) => confirmarPagamento(tx, r.cobranca.id));
  const [emailAluno] = await sistema((tx) =>
    tx
      .select({ email: usuarios.email })
      .from(alunos)
      .innerJoin(usuarios, eq(usuarios.id, alunos.usuarioId))
      .where(eq(alunos.id, aluno.id)),
  );
  const [c] = await sistema((tx) =>
    tx.select().from(contratos).where(eq(contratos.pedidoId, r.pedido.id)),
  );
  return { r, autoescola, emailAluno: emailAluno!.email, contrato: c!, previa };
}

const envios = (contratoId: string) =>
  sistema((tx) =>
    tx.select().from(contratoEnvios).where(eq(contratoEnvios.contratoId, contratoId)),
  );

describe('cópia do contrato por e-mail', () => {
  it('com o pagamento confirmado, cada parte recebe o contrato em PDF uma única vez', async () => {
    email = new EmailFalso();
    const { autoescola, emailAluno, contrato, previa, r } = await compraPaga();
    await processarTudo(deps(email), CONSUMIDORES);
    expect(email.enviados.map((m) => m.para).sort()).toEqual([autoescola.email, emailAluno].sort());
    const m = email.enviados.find((x) => x.para === emailAluno)!;
    expect(m.assunto).toContain(r.pedido.codigo);
    expect(m.texto).toContain(previa.hash);
    expect(m.html).toContain('Contrato de prestação de serviços');
    expect(m.anexos?.[0]?.nome).toBe(`contrato-${r.pedido.codigo}.pdf`);
    expect(m.anexos![0]!.conteudo.subarray(0, 5).toString()).toBe('%PDF-');
    expect((await envios(contrato.id)).map((e) => [e.parte, e.status]).sort()).toEqual([
      ['contratado', 'enviado'],
      ['contratante', 'enviado'],
    ]);

    // nova rodada do worker não duplica; reenvio pedido pelo aluno manda só para ele
    await processarTudo(deps(email), CONSUMIDORES);
    expect(email.enviados).toHaveLength(2);
    await sistema((tx) =>
      publicarEvento(tx, {
        tipo: 'contrato.reenviar',
        agregadoTipo: 'contrato',
        agregadoId: contrato.id,
        payload: { contratoId: contrato.id, parte: 'contratante' },
      }),
    );
    await processarTudo(deps(email), CONSUMIDORES);
    expect(email.enviados.map((x) => x.para)).toEqual([
      ...email.enviados.slice(0, 2).map((x) => x.para),
      emailAluno,
    ]);
  });

  it('sem SMTP configurado fica registrado como pendente (nada finge que foi enviado)', async () => {
    const { contrato } = await compraPaga();
    await processarTudo(deps(new EmailNaoConfigurado()), CONSUMIDORES);
    const e = await envios(contrato.id);
    expect(e.map((x) => x.status)).toEqual(['pendente_configuracao', 'pendente_configuracao']);
    expect(e[0]!.erro).toContain('EMAIL_SMTP_URL');
  });

  it('falha passageira registra o erro e tenta de novo depois', async () => {
    email = new EmailFalso();
    email.resposta = { status: 'erro', motivo: 'Conexão recusada', reprocessar: true };
    const { contrato } = await compraPaga();
    await processarTudo(deps(email), CONSUMIDORES);
    const e = await envios(contrato.id);
    expect(e.map((x) => x.status)).toEqual(['erro', 'erro']);
    expect(e[0]!.erro).toBe('Conexão recusada');
  });
});
