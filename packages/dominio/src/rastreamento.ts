import type { AcompanhamentoPublico, RastreamentoAula } from '@volante/contracts';
import {
  alunos,
  and,
  aulaCompartilhamentos,
  aulaPosicoes,
  aulas,
  desc,
  eq,
  gt,
  instrutores,
  isNull,
  lt,
  publicarEvento,
  usuarios,
  veiculos,
  type Ponto,
  type Tx,
} from '@volante/db';
import { createHash, randomBytes } from 'node:crypto';
import { distanciaMetros } from './agenda';
import { carregarAulaParaAlterar, mudarStatusAula } from './aulas';
import { ErroDominio, naoEncontrado } from './erros';

type Aula = typeof aulas.$inferSelect;

/** "Estou a caminho" fica disponível a partir de 3 h antes do início. */
export const ANTECEDENCIA_A_CAMINHO_MIN = 180;
/** Posições mais próximas que isso são ignoradas (o app envia a cada poucos segundos). */
export const INTERVALO_MINIMO_POSICAO_S = 5;
/** Velocidade média urbana para a estimativa de chegada. */
const VELOCIDADE_MEDIA_KMH = 25;
/** Status em que a posição do instrutor é registrada e mostrada. */
export const STATUS_RASTREADOS = ['a_caminho', 'em_andamento'] as const;
/** O link do contato de confiança vale até 2 h depois do fim da aula. */
const VALIDADE_LINK_APOS_FIM_MIN = 120;

export async function iniciarACaminho(
  tx: Tx,
  d: {
    aulaId: string;
    instrutorId: string;
    usuarioId: string;
    posicao?: Ponto | null;
    agora?: Date;
  },
) {
  const agora = d.agora ?? new Date();
  const aula = await carregarAulaParaAlterar(tx, d.aulaId);
  if (aula.instrutorId !== d.instrutorId) throw naoEncontrado('aula');
  if (aula.status !== 'confirmada')
    throw new ErroDominio('status_invalido', 'Só aulas confirmadas podem ficar "a caminho"');
  if (aula.inicio.getTime() - agora.getTime() > ANTECEDENCIA_A_CAMINHO_MIN * 60_000)
    throw new ErroDominio(
      'cedo_demais',
      'Você pode avisar que está a caminho a partir de 3 horas antes da aula',
    );
  const atualizada = await mudarStatusAula(tx, aula, 'a_caminho', {
    atorUsuarioId: d.usuarioId,
    local: d.posicao ?? null,
    motivo: 'Instrutor a caminho',
  });
  if (d.posicao) await gravarPosicao(tx, atualizada, d.posicao, undefined, agora);
  await publicarEvento(tx, {
    tipo: 'aula.a_caminho',
    agregadoTipo: 'aula',
    agregadoId: aula.id,
    autoescolaId: aula.autoescolaId,
    payload: { aulaId: aula.id, alunoId: aula.alunoId, instrutorId: aula.instrutorId },
  });
  return atualizada;
}

async function gravarPosicao(
  tx: Tx,
  aula: Aula,
  p: Ponto,
  precisaoM: number | undefined,
  agora: Date,
) {
  await tx.insert(aulaPosicoes).values({
    aulaId: aula.id,
    alunoId: aula.alunoId,
    instrutorId: aula.instrutorId,
    posicao: p,
    precisaoM: precisaoM !== undefined ? Math.round(precisaoM) : null,
    registradoEm: agora,
  });
}

/** Registra a posição do instrutor (só de "a caminho" até o check-out). */
export async function registrarPosicao(
  tx: Tx,
  d: { aulaId: string; instrutorId: string; posicao: Ponto; precisaoM?: number; agora?: Date },
): Promise<{ registrada: boolean }> {
  const agora = d.agora ?? new Date();
  const [aula] = await tx.select().from(aulas).where(eq(aulas.id, d.aulaId));
  if (!aula || aula.instrutorId !== d.instrutorId) throw naoEncontrado('aula');
  if (!(STATUS_RASTREADOS as readonly string[]).includes(aula.status))
    throw new ErroDominio('status_invalido', 'A localização só é compartilhada durante a aula');
  const [recente] = await tx
    .select({ id: aulaPosicoes.id })
    .from(aulaPosicoes)
    .where(
      and(
        eq(aulaPosicoes.aulaId, aula.id),
        gt(
          aulaPosicoes.registradoEm,
          new Date(agora.getTime() - INTERVALO_MINIMO_POSICAO_S * 1000),
        ),
      ),
    )
    .limit(1);
  if (recente) return { registrada: false };
  await gravarPosicao(tx, aula, d.posicao, d.precisaoM, agora);
  return { registrada: true };
}

/** Situação atual da aula para o mapa do aluno (e, com menos dados, do contato de confiança). */
export async function rastreamentoDaAula(tx: Tx, aulaId: string): Promise<RastreamentoAula> {
  const [linha] = await tx
    .select({
      aula: aulas,
      instrutorNome: usuarios.nome,
      instrutorFoto: usuarios.fotoArquivoId,
      veiculo: {
        modelo: veiculos.modelo,
        marca: veiculos.marca,
        cor: veiculos.cor,
        placa: veiculos.placa,
      },
    })
    .from(aulas)
    .innerJoin(instrutores, eq(instrutores.id, aulas.instrutorId))
    .innerJoin(usuarios, eq(usuarios.id, instrutores.usuarioId))
    .leftJoin(veiculos, eq(veiculos.id, aulas.veiculoId))
    .where(eq(aulas.id, aulaId));
  if (!linha) throw naoEncontrado('aula');
  const { aula } = linha;
  const rastreada = (STATUS_RASTREADOS as readonly string[]).includes(aula.status);
  const [ultima] = rastreada
    ? await tx
        .select({ posicao: aulaPosicoes.posicao, registradoEm: aulaPosicoes.registradoEm })
        .from(aulaPosicoes)
        .where(eq(aulaPosicoes.aulaId, aula.id))
        .orderBy(desc(aulaPosicoes.registradoEm))
        .limit(1)
    : [];
  const distancia = ultima ? Math.round(distanciaMetros(ultima.posicao, aula.pontoEncontro)) : null;
  return {
    aulaId: aula.id,
    status: aula.status,
    posicao: ultima ? { ...ultima.posicao, registradoEm: ultima.registradoEm.toISOString() } : null,
    pontoEncontro: aula.pontoEncontro,
    pontoEncontroEndereco: aula.pontoEncontroEndereco,
    distanciaMetros: distancia,
    chegadaEstimadaMin:
      distancia !== null && aula.status === 'a_caminho'
        ? Math.max(1, Math.ceil((distancia / 1000 / VELOCIDADE_MEDIA_KMH) * 60))
        : null,
    instrutor: { nome: linha.instrutorNome, fotoArquivoId: linha.instrutorFoto },
    veiculo: linha.veiculo?.placa
      ? {
          modelo: `${linha.veiculo.marca} ${linha.veiculo.modelo}`,
          cor: linha.veiculo.cor,
          placa: linha.veiculo.placa,
        }
      : null,
    inicio: aula.inicio.toISOString(),
    fim: aula.fim.toISOString(),
  };
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/** Cria um link temporário para um contato de confiança acompanhar a aula. */
export async function criarCompartilhamento(
  tx: Tx,
  d: { aulaId: string; alunoId: string; contatoNome?: string | null; agora?: Date },
) {
  const agora = d.agora ?? new Date();
  const [aula] = await tx.select().from(aulas).where(eq(aulas.id, d.aulaId));
  if (!aula || aula.alunoId !== d.alunoId) throw naoEncontrado('aula');
  if (!['solicitada', 'confirmada', 'a_caminho', 'em_andamento'].includes(aula.status))
    throw new ErroDominio(
      'status_invalido',
      'Só é possível compartilhar aulas que ainda vão acontecer',
    );
  const token = randomBytes(24).toString('base64url');
  const expiraEm = new Date(aula.fim.getTime() + VALIDADE_LINK_APOS_FIM_MIN * 60_000);
  const [c] = await tx
    .insert(aulaCompartilhamentos)
    .values({
      aulaId: aula.id,
      alunoId: d.alunoId,
      tokenHash: hashToken(token),
      contatoNome: d.contatoNome?.trim() || null,
      expiraEm: expiraEm > agora ? expiraEm : new Date(agora.getTime() + 3600_000),
    })
    .returning();
  return { compartilhamento: c!, token };
}

export async function revogarCompartilhamento(
  tx: Tx,
  d: { compartilhamentoId: string; alunoId: string },
) {
  const r = await tx
    .update(aulaCompartilhamentos)
    .set({ revogadoEm: new Date() })
    .where(
      and(
        eq(aulaCompartilhamentos.id, d.compartilhamentoId),
        eq(aulaCompartilhamentos.alunoId, d.alunoId),
        isNull(aulaCompartilhamentos.revogadoEm),
      ),
    )
    .returning();
  if (!r.length) throw naoEncontrado('compartilhamento');
}

/** O que o contato de confiança vê pelo link (null se o link é inválido, revogado ou expirou). */
export async function acompanharPorToken(
  tx: Tx,
  token: string,
  agora = new Date(),
): Promise<AcompanhamentoPublico | null> {
  const [c] = await tx
    .select()
    .from(aulaCompartilhamentos)
    .where(
      and(
        eq(aulaCompartilhamentos.tokenHash, hashToken(token)),
        isNull(aulaCompartilhamentos.revogadoEm),
        gt(aulaCompartilhamentos.expiraEm, agora),
      ),
    );
  if (!c) return null;
  const r = await rastreamentoDaAula(tx, c.aulaId);
  const [aluno] = await tx
    .select({ nome: usuarios.nome })
    .from(alunos)
    .innerJoin(usuarios, eq(usuarios.id, alunos.usuarioId))
    .where(eq(alunos.id, c.alunoId));
  const { aulaId: _aulaId, instrutor, ...resto } = r;
  return {
    ...resto,
    alunoPrimeiroNome: (aluno?.nome ?? '').split(' ')[0] ?? '',
    instrutorNome: instrutor.nome,
    expiraEm: c.expiraEm.toISOString(),
  };
}

/** Posições antigas são apagadas (privacidade): só servem durante a aula. */
export async function expurgarPosicoes(tx: Tx, antesDe: Date) {
  const r = await tx
    .delete(aulaPosicoes)
    .where(lt(aulaPosicoes.registradoEm, antesDe))
    .returning({ id: aulaPosicoes.id });
  return r.length;
}
