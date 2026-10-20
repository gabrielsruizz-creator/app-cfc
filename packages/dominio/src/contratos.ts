import { createHash } from 'node:crypto';
import { formatarCentavos, type AceiteContrato, type TextoContrato } from '@volante/contracts';
import {
  alunos,
  and,
  aulas,
  autoescolaMembros,
  autoescolas,
  cobrancas,
  comoSistema,
  consentimentos,
  contratoAceites,
  contratos,
  desc,
  documentosLegais,
  eq,
  inArray,
  instrutores,
  lerConfiguracoes,
  MODELO_CONTRATO_PRESTACAO,
  pacotes,
  pedidos,
  usuarios,
  type Tx,
} from '@volante/db';
import { ErroDominio, naoEncontrado } from './erros';

type Valor = string | number | boolean | null | undefined;
type Variaveis = { [chave: string]: Valor | Variaveis };

const ler = (v: Variaveis, caminho: string): Valor =>
  caminho
    .split('.')
    .reduce<Valor | Variaveis>(
      (o, k) => (o && typeof o === 'object' ? o[k] : undefined),
      v,
    ) as Valor;
const presente = (x: Valor) => x !== undefined && x !== null && x !== false && x !== '' && x !== 0;

/**
 * Preenche o modelo: {{campo}} vira o valor; {{#campo}}…{{/campo}} só fica se o campo existir;
 * {{^campo}}…{{/campo}} só se não existir. Campo ausente vira "—" (nunca some em silêncio).
 */
export function preencherModelo(modelo: string, v: Variaveis): string {
  let texto = modelo;
  // seções (repetido para permitir seções dentro de seções)
  for (let i = 0; i < 5; i++) {
    const antes = texto;
    texto = texto.replace(
      /\{\{([#^])([\w.]+)\}\}([\s\S]*?)\{\{\/\2\}\}/g,
      (_m, tipo: string, campo: string, dentro: string) =>
        (tipo === '#') === presente(ler(v, campo)) ? dentro : '',
    );
    if (texto === antes) break;
  }
  return texto.replace(/\{\{([\w.]+)\}\}/g, (_m, campo: string) => {
    const x = ler(v, campo);
    return x === undefined || x === null || x === '' ? '—' : String(x);
  });
}

export const hashTexto = (texto: string) =>
  createHash('sha256').update(texto, 'utf8').digest('hex');

const cpfFormatado = (c: string | null) =>
  c && /^\d{11}$/.test(c) ? `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}` : c;
const cnpjFormatado = (c: string) =>
  `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;
const percentual = (bp: number) =>
  `${(bp / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;

/** Modelo vigente (ou o modelo-base, se o admin ainda não publicou nenhum). */
async function modeloVigente(tx: Tx) {
  const [m] = await tx
    .select()
    .from(documentosLegais)
    .where(
      and(eq(documentosLegais.tipo, 'contrato_prestacao'), eq(documentosLegais.vigente, true)),
    );
  return m
    ? { id: m.id, versao: m.versao, texto: m.conteudoMd }
    : { id: null, versao: 'base', texto: MODELO_CONTRATO_PRESTACAO };
}

/** Partes e condições do pedido, lidas como sistema (o aluno não enxerga o CPF do vendedor pela RLS). */
async function dadosDoPedido(tx: Tx, pedidoId: string) {
  return comoSistema(tx, async () => {
    const [p] = await tx.select().from(pedidos).where(eq(pedidos.id, pedidoId));
    if (!p) throw naoEncontrado('pedido');
    const [aluno] = await tx
      .select({
        usuarioId: usuarios.id,
        nome: usuarios.nome,
        cpf: usuarios.cpf,
        email: usuarios.email,
      })
      .from(alunos)
      .innerJoin(usuarios, eq(usuarios.id, alunos.usuarioId))
      .where(eq(alunos.id, p.alunoId));
    const [cobranca] = await tx
      .select()
      .from(cobrancas)
      .where(eq(cobrancas.pedidoId, p.id))
      .orderBy(desc(cobrancas.criadoEm))
      .limit(1);
    const [pacote] = p.pacoteId
      ? await tx.select().from(pacotes).where(eq(pacotes.id, p.pacoteId))
      : [];
    const [aula] =
      p.tipo === 'aula_avulsa' ? await tx.select().from(aulas).where(eq(aulas.pedidoId, p.id)) : [];

    let contratado: {
      usuarioId: string | null;
      nome: string;
      documento: string | null;
      documentoTipo: string;
      qualificacao: string;
      fuso: string;
    };
    let termo: { finalidade: 'termo_instrutor' | 'termo_autoescola'; usuarios: string[] };
    if (p.autoescolaId) {
      const [a] = await tx.select().from(autoescolas).where(eq(autoescolas.id, p.autoescolaId));
      const membros = await tx
        .select({ usuarioId: autoescolaMembros.usuarioId })
        .from(autoescolaMembros)
        .where(eq(autoescolaMembros.autoescolaId, p.autoescolaId));
      contratado = {
        usuarioId: null,
        nome: a!.razaoSocial,
        documento: cnpjFormatado(a!.cnpj),
        documentoTipo: 'CNPJ',
        qualificacao: `autoescola (CFC) "${a!.nomeFantasia}", credenciamento ${a!.credenciamentoDetran}, com sede em ${a!.logradouro}, ${a!.numero}, ${a!.municipio}/${a!.uf}`,
        fuso: a!.fusoHorario,
      };
      termo = { finalidade: 'termo_autoescola', usuarios: membros.map((x) => x.usuarioId) };
    } else {
      const [i] = await tx
        .select({
          usuarioId: usuarios.id,
          nome: usuarios.nome,
          cpf: usuarios.cpf,
          fuso: instrutores.fusoHorario,
        })
        .from(instrutores)
        .innerJoin(usuarios, eq(usuarios.id, instrutores.usuarioId))
        .where(eq(instrutores.id, p.instrutorId!));
      contratado = {
        usuarioId: i!.usuarioId,
        nome: i!.nome,
        documento: cpfFormatado(i!.cpf),
        documentoTipo: 'CPF',
        qualificacao: 'instrutor de trânsito',
        fuso: i!.fuso,
      };
      termo = { finalidade: 'termo_instrutor', usuarios: [i!.usuarioId] };
    }
    const [adesao] = termo.usuarios.length
      ? await tx
          .select({
            usuarioId: consentimentos.usuarioId,
            criadoEm: consentimentos.criadoEm,
            versao: documentosLegais.versao,
            nome: usuarios.nome,
          })
          .from(consentimentos)
          .innerJoin(usuarios, eq(usuarios.id, consentimentos.usuarioId))
          .leftJoin(documentosLegais, eq(documentosLegais.id, consentimentos.documentoLegalId))
          .where(
            and(
              eq(consentimentos.finalidade, termo.finalidade),
              eq(consentimentos.aceito, true),
              inArray(consentimentos.usuarioId, termo.usuarios),
            ),
          )
          .orderBy(desc(consentimentos.criadoEm))
          .limit(1)
      : [];
    return { p, aluno: aluno!, cobranca, pacote, aula, contratado, termo, adesao };
  });
}

/** Texto exato do contrato de um pedido (mesmos dados → mesmo texto → mesmo hash). */
export async function textoContratoDoPedido(tx: Tx, pedidoId: string) {
  const d = await dadosDoPedido(tx, pedidoId);
  const cfg = await lerConfiguracoes(tx);
  const modelo = await modeloVigente(tx);
  const fmtData = new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'full',
    timeZone: d.contratado.fuso,
  });
  const fmtHora = new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: d.contratado.fuso,
  });
  const { p, aula, cobranca } = d;
  const corpoMd = preencherModelo(modelo.texto, {
    pacote: p.tipo === 'pacote',
    avulsa: p.tipo === 'aula_avulsa',
    autoescola: p.autoescolaId ? { prazoResposta: cfg['pedido.expiracao_dias'] } : false,
    instrutor: !p.autoescolaId,
    desconto: p.descontoCentavos > 0,
    contratante: { nome: d.aluno.nome, cpf: cpfFormatado(d.aluno.cpf), email: d.aluno.email },
    contratado: {
      nome: d.contratado.nome,
      documento: d.contratado.documento,
      documentoTipo: d.contratado.documentoTipo,
      qualificacao: d.contratado.qualificacao,
    },
    servico: {
      descricao: p.snapshot.descricao,
      categorias: p.snapshot.categorias.join(', '),
      quantidade: p.quantidadeAulas,
      duracao: p.snapshot.duracaoAulaMin,
      validade: d.pacote?.validadeDias ?? null,
    },
    aula: aula
      ? {
          data: fmtData.format(aula.inicio),
          horario: `${fmtHora.format(aula.inicio)} às ${fmtHora.format(aula.fim)}`,
          local: aula.pontoEncontroEndereco,
        }
      : {},
    valor: {
      bruto: formatarCentavos(p.valorBrutoCentavos),
      desconto: formatarCentavos(p.descontoCentavos),
      total: formatarCentavos(p.valorTotalCentavos),
    },
    cupom: p.snapshot.cupomCodigo ?? null,
    pagamento: {
      forma:
        cobranca?.metodo === 'cartao'
          ? `cartão de crédito${(cobranca.parcelas ?? 1) > 1 ? ` em ${cobranca.parcelas} parcelas` : ' à vista'}`
          : 'Pix',
    },
    cancelamento: {
      gratisHoras: (
        aula?.politicaCancelamento ?? { gratisAteHoras: cfg['cancelamento.gratis_ate_horas'] }
      ).gratisAteHoras,
      multa: percentual(
        (aula?.politicaCancelamento ?? { multaBp: cfg['cancelamento.multa_bp'] }).multaBp,
      ),
    },
  }).replace(/\n{3,}/g, '\n\n');
  return {
    dados: d,
    modelo,
    texto: { versao: modelo.versao, corpoMd, hash: hashTexto(corpoMd) } satisfies TextoContrato,
  };
}

export type AceiteNaCompra = AceiteContrato & {
  usuarioId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
};

/**
 * Grava o contrato do pedido com o texto exato e os aceites. Com aceite do aluno, o hash precisa
 * ser idêntico ao do texto gerado agora; senão a compra é recusada (as condições mudaram).
 */
export async function registrarContrato(tx: Tx, pedidoId: string, aceite?: AceiteNaCompra) {
  const { dados: d, modelo, texto } = await textoContratoDoPedido(tx, pedidoId);
  if (aceite && aceite.hash !== texto.hash) {
    throw new ErroDominio(
      'contrato_alterado',
      'As condições mudaram desde que você leu o contrato. Abra o contrato de novo e confirme.',
      'conflito',
    );
  }
  const [c] = await tx
    .insert(contratos)
    .values({
      pedidoId,
      alunoId: d.p.alunoId,
      instrutorId: d.p.instrutorId,
      autoescolaId: d.p.autoescolaId,
      documentoLegalId: modelo.id,
      versao: texto.versao,
      corpoMd: texto.corpoMd,
      hashCorpo: texto.hash,
    })
    .returning();
  const dataTermo = d.adesao
    ? new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: d.contratado.fuso,
      }).format(d.adesao.criadoEm)
    : null;
  await tx.insert(contratoAceites).values({
    contratoId: c!.id,
    parte: 'contratado',
    forma: 'oferta',
    usuarioId: d.adesao?.usuarioId ?? d.contratado.usuarioId,
    nome: d.contratado.nome,
    documento: d.contratado.documento,
    hashAceito: texto.hash,
    detalhe: d.adesao
      ? `Oferta publicada no app; ${d.termo.finalidade === 'termo_autoescola' ? 'Termo da autoescola parceira' : 'Termo do instrutor parceiro'} v${d.adesao.versao ?? '—'} aceito por ${d.adesao.nome} em ${dataTermo}`
      : 'Oferta publicada no app',
  });
  if (aceite) {
    await tx.insert(contratoAceites).values({
      contratoId: c!.id,
      parte: 'contratante',
      forma: 'clique',
      usuarioId: aceite.usuarioId ?? null,
      nome: d.aluno.nome,
      documento: cpfFormatado(d.aluno.cpf),
      hashAceito: aceite.hash,
      ip: aceite.ip ?? null,
      userAgent: aceite.userAgent ?? null,
      detalhe: '"Li e aceito" marcado no app antes do pagamento',
    });
  }
  return c!;
}

class DesfazerPrevia extends Error {
  constructor(readonly texto: TextoContrato) {
    super('prévia do contrato');
  }
}

/**
 * Prévia idêntica à compra: roda a própria compra num ponto de restauração, lê o contrato gerado
 * e desfaz tudo (nenhum pedido, cobrança, reserva de horário ou evento sobrevive).
 */
export async function previaDoContrato(
  tx: Tx,
  comprar: (sp: Tx) => Promise<{ pedidoId: string }>,
): Promise<TextoContrato> {
  try {
    await tx.transaction(async (sp) => {
      const { pedidoId } = await comprar(sp as unknown as Tx);
      const [c] = await sp.select().from(contratos).where(eq(contratos.pedidoId, pedidoId));
      if (!c) throw new Error('Contrato não gerado na prévia');
      throw new DesfazerPrevia({ versao: c.versao, corpoMd: c.corpoMd, hash: c.hashCorpo });
    });
  } catch (e) {
    if (e instanceof DesfazerPrevia) return e.texto;
    throw e;
  }
  throw new Error('Prévia do contrato não concluída');
}
