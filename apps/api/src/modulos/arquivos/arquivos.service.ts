import { Inject, Injectable } from '@nestjs/common';
import { FINALIDADES_PUBLICAS, type FinalidadeArquivo } from '@volante/contracts';
import {
  alunos,
  and,
  arquivos,
  auditar,
  aulas,
  autoescolaDocumentos,
  eq,
  inArray,
  sql,
} from '@volante/db';
import { ErroDominio, naoEncontrado } from '@volante/dominio';
import { createHash } from 'node:crypto';
import { uuidv7 } from 'uuidv7';
import type { Armazenamento } from '../../nucleo/armazenamento';
import { atorAdmin, type Sessao } from '../../nucleo/auth/sessao';
import { BancoService } from '../../nucleo/banco.service';
import { ARMAZENAMENTO } from '../../nucleo/tokens';

export const MIMES_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];
export const TAMANHO_MAXIMO = 10 * 1024 * 1024;

@Injectable()
export class ArquivosService {
  constructor(
    private readonly banco: BancoService,
    @Inject(ARMAZENAMENTO) private readonly armazenamento: Armazenamento,
  ) {}

  async enviar(
    sessao: Sessao,
    finalidade: FinalidadeArquivo,
    arquivo: { buffer: Buffer; mimetype: string; originalname?: string; size: number },
  ) {
    if (!MIMES_PERMITIDOS.includes(arquivo.mimetype)) {
      throw new ErroDominio('tipo_arquivo_invalido', 'Envie uma foto (JPG, PNG, WEBP) ou um PDF', 'validacao');
    }
    if (arquivo.size > TAMANHO_MAXIMO) {
      throw new ErroDominio('arquivo_grande', 'O arquivo deve ter no máximo 10 MB', 'validacao');
    }
    const id = uuidv7();
    const publico = FINALIDADES_PUBLICAS.includes(finalidade);
    const chave = `${publico ? 'publico' : 'privado'}/${new Date().toISOString().slice(0, 7)}/${id}`;
    await this.armazenamento.salvar(chave, arquivo.buffer, arquivo.mimetype);
    const [linha] = await this.banco.db
      .insert(arquivos)
      .values({
        id,
        donoUsuarioId: sessao.usuarioId,
        chaveStorage: chave,
        nomeOriginal: arquivo.originalname ?? null,
        mime: arquivo.mimetype,
        tamanhoBytes: arquivo.size,
        sha256: createHash('sha256').update(arquivo.buffer).digest('hex'),
        visibilidade: publico ? 'publico' : 'privado',
        finalidade,
      })
      .returning({ id: arquivos.id, finalidade: arquivos.finalidade });
    return linha!;
  }

  private async buscar(id: string) {
    const [a] = await this.banco.db.select().from(arquivos).where(eq(arquivos.id, id));
    if (!a || a.excluidoEm) throw naoEncontrado('arquivo');
    return a;
  }

  async abrirPublico(id: string) {
    const a = await this.buscar(id);
    if (a.visibilidade !== 'publico') throw naoEncontrado('arquivo');
    return this.abrir(a);
  }

  async abrirComPermissao(id: string, sessao: Sessao) {
    const a = await this.buscar(id);
    const permitido =
      a.visibilidade === 'publico' ||
      a.donoUsuarioId === sessao.usuarioId ||
      (await this.instrutorVeSelfieDoAluno(a.id, sessao)) ||
      (await this.membroVeDocumentoDaAutoescola(a.id, sessao));

    if (!permitido && sessao.adminNivel) {
      const ator = atorAdmin(sessao);
      await this.banco.comAtor(ator, (tx) =>
        auditar(tx, {
          ator,
          entidadeTipo: 'arquivo',
          entidadeId: a.id,
          acao: 'documento.visualizado',
          depois: { finalidade: a.finalidade, dono: a.donoUsuarioId },
          ip: sessao.ip,
          userAgent: sessao.userAgent,
        }),
      );
      return this.abrir(a);
    }
    if (!permitido) throw naoEncontrado('arquivo');
    return this.abrir(a);
  }

  /** O instrutor pode ver a selfie do aluno para identificá-lo no encontro. */
  private async instrutorVeSelfieDoAluno(arquivoId: string, sessao: Sessao) {
    if (!sessao.instrutorId) return false;
    const r = await this.banco.comAtor(
      { tipo: 'instrutor', instrutorId: sessao.instrutorId, usuarioId: sessao.usuarioId },
      (tx) =>
        tx
          .select({ id: aulas.id })
          .from(aulas)
          .innerJoin(alunos, eq(alunos.id, aulas.alunoId))
          .where(
            and(
              eq(alunos.selfieArquivoId, arquivoId),
              inArray(aulas.status, ['solicitada', 'confirmada', 'a_caminho', 'em_andamento', 'aguardando_confirmacao', 'concluida']),
            ),
          )
          .limit(1),
    );
    return r.length > 0;
  }

  private async membroVeDocumentoDaAutoescola(arquivoId: string, sessao: Sessao) {
    for (const v of sessao.autoescolas) {
      const r = await this.banco.comAtor(
        { tipo: 'autoescola', autoescolaId: v.autoescolaId, usuarioId: sessao.usuarioId },
        (tx) =>
          tx
            .select({ id: autoescolaDocumentos.id })
            .from(autoescolaDocumentos)
            .where(eq(autoescolaDocumentos.arquivoId, arquivoId))
            .limit(1),
      );
      if (r.length) return true;
    }
    return false;
  }

  private async abrir(a: typeof arquivos.$inferSelect) {
    const fluxo = await this.armazenamento.ler(a.chaveStorage);
    if (!fluxo) throw naoEncontrado('arquivo');
    return { fluxo, mime: a.mime, nome: a.nomeOriginal };
  }

  /** Garante que um arquivo pertence ao usuário (antes de vinculá-lo a um cadastro). */
  async exigirDono(arquivoId: string, usuarioId: string) {
    const [a] = await this.banco.db
      .select({ id: arquivos.id })
      .from(arquivos)
      .where(and(eq(arquivos.id, arquivoId), eq(arquivos.donoUsuarioId, usuarioId), sql`${arquivos.excluidoEm} is null`));
    if (!a) throw new ErroDominio('arquivo_invalido', 'Arquivo não encontrado. Envie novamente.', 'validacao');
  }
}
