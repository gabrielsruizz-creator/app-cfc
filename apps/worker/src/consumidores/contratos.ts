import type { ParteContrato } from '@volante/contracts';
import {
  alunos,
  and,
  asc,
  ATOR_SISTEMA,
  autoescolas,
  comAtor,
  contratoAceites,
  contratoEnvios,
  contratos,
  eq,
  instrutores,
  pedidos,
  usuarios,
} from '@volante/db';
import { gerarPdfContrato } from '../contrato-pdf';
import type { Dependencias } from '../dependencias';
import type { Consumidor, Evento } from '../outbox';

class ErroReprocessavel extends Error {}

const esc = (v: string) =>
  v.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

/** Markdown simples do contrato → HTML do e-mail. */
function htmlDoContrato(md: string) {
  return md
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const negrito = (t: string) => esc(t).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      if (p.startsWith('# ')) return `<h1 style="font-size:20px">${esc(p.slice(2))}</h1>`;
      if (p.startsWith('## '))
        return `<h2 style="font-size:16px;margin-top:20px">${esc(p.slice(3))}</h2>`;
      if (p.startsWith('> '))
        return `<p style="color:#5b6470;font-style:italic">${esc(p.replace(/^> ?/gm, ''))}</p>`;
      return `<p>${negrito(p.replace(/\n/g, ' '))}</p>`;
    })
    .join('\n');
}

/** Contrato, partes e destinatários (lidos como sistema). */
async function carregar(deps: Dependencias, filtro: { contratoId?: string; pedidoId?: string }) {
  return comAtor(deps.db, ATOR_SISTEMA, async (tx) => {
    const [linha] = await tx
      .select({ c: contratos, codigo: pedidos.codigo })
      .from(contratos)
      .innerJoin(pedidos, eq(pedidos.id, contratos.pedidoId))
      .where(
        filtro.contratoId
          ? eq(contratos.id, filtro.contratoId)
          : eq(contratos.pedidoId, filtro.pedidoId!),
      );
    if (!linha) return null;
    const c = linha.c;
    const aceites = await tx
      .select()
      .from(contratoAceites)
      .where(eq(contratoAceites.contratoId, c.id))
      .orderBy(asc(contratoAceites.aceitoEm));
    const enviados = await tx
      .select({ parte: contratoEnvios.parte })
      .from(contratoEnvios)
      .where(and(eq(contratoEnvios.contratoId, c.id), eq(contratoEnvios.status, 'enviado')));
    const [aluno] = await tx
      .select({ nome: usuarios.nome, email: usuarios.email })
      .from(alunos)
      .innerJoin(usuarios, eq(usuarios.id, alunos.usuarioId))
      .where(eq(alunos.id, c.alunoId));
    let contratado: { nome: string; email: string; fuso: string };
    if (c.autoescolaId) {
      const [a] = await tx.select().from(autoescolas).where(eq(autoescolas.id, c.autoescolaId));
      contratado = { nome: a!.nomeFantasia, email: a!.email, fuso: a!.fusoHorario };
    } else {
      const [i] = await tx
        .select({ nome: usuarios.nome, email: usuarios.email, fuso: instrutores.fusoHorario })
        .from(instrutores)
        .innerJoin(usuarios, eq(usuarios.id, instrutores.usuarioId))
        .where(eq(instrutores.id, c.instrutorId!));
      contratado = { nome: i!.nome, email: i!.email, fuso: i!.fuso };
    }
    return {
      c,
      codigo: linha.codigo,
      aceites,
      jaEnviadas: new Set(enviados.map((e) => e.parte)),
      destinatarios: {
        contratante: { nome: aluno!.nome, email: aluno!.email },
        contratado: { nome: contratado.nome, email: contratado.email },
      } satisfies Record<ParteContrato, { nome: string; email: string }>,
      fuso: contratado.fuso,
    };
  });
}

async function enviarCopias(
  deps: Dependencias,
  evento: Evento,
  alvo: { contratoId?: string; pedidoId?: string },
  partes: ParteContrato[],
  reenvio: boolean,
) {
  const dados = await carregar(deps, alvo);
  if (!dados) return; // pedido anterior aos contratos
  const pendentes = reenvio ? partes : partes.filter((p) => !dados.jaEnviadas.has(p));
  if (!pendentes.length) return;
  const pdf = await gerarPdfContrato({
    pedidoCodigo: dados.codigo,
    corpoMd: dados.c.corpoMd,
    hash: dados.c.hashCorpo,
    versao: dados.c.versao,
    criadoEm: dados.c.criadoEm,
    aceites: dados.aceites,
    fuso: dados.fuso,
  });
  let passageira: string | null = null;
  for (const parte of pendentes) {
    const quem = dados.destinatarios[parte];
    const papel = parte === 'contratante' ? 'contratante (aluno)' : 'contratado';
    const r = await deps.email.enviar({
      para: quem.email,
      assunto: `Contrato de prestação de serviços — pedido ${dados.codigo}`,
      texto:
        `Olá, ${quem.nome}!\n\nSegue a sua cópia, como ${papel}, do contrato do pedido ${dados.codigo} no app Volante (PDF em anexo).\n` +
        `Impressão digital do texto (SHA-256): ${dados.c.hashCorpo}\n\n${dados.c.corpoMd}`,
      html:
        `<div style="font-family:Arial,sans-serif;max-width:680px;color:#1a1d21;line-height:1.5">` +
        `<p>Olá, ${esc(quem.nome)}!</p><p>Segue a sua cópia, como ${papel}, do contrato do pedido <strong>${esc(dados.codigo)}</strong> no app Volante. O PDF, com o registro dos aceites, está em anexo.</p>` +
        `<hr>${htmlDoContrato(dados.c.corpoMd)}<hr>` +
        `<p style="font-size:12px;color:#5b6470">Impressão digital do texto (SHA-256): <code>${dados.c.hashCorpo}</code>. Se o texto for alterado, a impressão digital muda.</p></div>`,
      anexos: [{ nome: `contrato-${dados.codigo}.pdf`, conteudo: pdf, tipo: 'application/pdf' }],
    });
    await comAtor(deps.db, ATOR_SISTEMA, (tx) =>
      tx.insert(contratoEnvios).values({
        contratoId: dados.c.id,
        parte,
        para: quem.email,
        status: r.status,
        erro: r.status === 'enviado' ? null : r.motivo,
        eventoOrigemId: evento.id,
      }),
    );
    if (r.status === 'erro' && r.reprocessar) passageira = r.motivo;
  }
  if (passageira) throw new ErroReprocessavel(passageira);
}

/** Pagamento confirmado: cada parte recebe sua cópia do contrato (PDF) por e-mail. */
export const enviarContrato: Consumidor = {
  nome: 'contrato.email',
  eventos: ['pedido.pago', 'contrato.reenviar'],
  async executar(deps, evento) {
    if (evento.tipo === 'contrato.reenviar') {
      const { contratoId, parte } = evento.payload as { contratoId: string; parte: ParteContrato };
      return enviarCopias(deps, evento, { contratoId }, [parte], true);
    }
    const { pedidoId } = evento.payload as { pedidoId: string };
    return enviarCopias(deps, evento, { pedidoId }, ['contratante', 'contratado'], false);
  },
};
