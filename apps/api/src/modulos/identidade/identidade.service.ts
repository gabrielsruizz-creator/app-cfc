import { Injectable, UnauthorizedException } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';
import type { CadastroUsuario, Entrar, Eu, RespostaSessao } from '@volante/contracts';
import {
  adminsPlataforma,
  alunos,
  and,
  autoescolaMembros,
  autoescolas,
  consentimentos,
  dispositivosPush,
  documentosLegais,
  eq,
  instrutores,
  or,
  publicarEvento,
  sessoes,
  usuarios,
  type Executor,
} from '@volante/db';
import { ErroDominio } from '@volante/dominio';
import { uuidv7 } from 'uuidv7';
import { DURACAO_REFRESH_DIAS, TokensService } from '../../nucleo/auth/tokens.service';
import { BancoService } from '../../nucleo/banco.service';

type Origem = { ip?: string | null; userAgent?: string | null; dispositivo?: string | null };

// Hash usado quando o login não existe, para o tempo de resposta não revelar se a conta existe.
let hashFicticio: Promise<string> | null = null;
const HASH_FICTICIO = () => (hashFicticio ??= hash('senha-ficticia-para-tempo-constante'));

@Injectable()
export class IdentidadeService {
  constructor(
    private readonly banco: BancoService,
    private readonly tokens: TokensService,
  ) {}

  async cadastrar(dados: CadastroUsuario, origem: Origem): Promise<RespostaSessao> {
    const senhaHash = await hash(dados.senha);
    const usuarioId = await this.banco.comAtor({ tipo: 'sistema' }, async (tx) => {
      const conflitos = await tx
        .select({ email: usuarios.email, cpf: usuarios.cpf, telefone: usuarios.telefone })
        .from(usuarios)
        .where(
          or(
            eq(usuarios.email, dados.email),
            eq(usuarios.cpf, dados.cpf),
            eq(usuarios.telefone, dados.telefone),
          ),
        );
      if (conflitos.some((c) => c.cpf === dados.cpf)) {
        throw new ErroDominio(
          'cpf_em_uso',
          'Já existe uma conta com este CPF. Tente entrar.',
          'conflito',
        );
      }
      if (conflitos.some((c) => c.email === dados.email)) {
        throw new ErroDominio(
          'email_em_uso',
          'Já existe uma conta com este e-mail. Tente entrar.',
          'conflito',
        );
      }
      if (conflitos.length) {
        throw new ErroDominio(
          'telefone_em_uso',
          'Este telefone já está em uso em outra conta.',
          'conflito',
        );
      }
      const [u] = await tx
        .insert(usuarios)
        .values({
          nome: dados.nome,
          cpf: dados.cpf,
          email: dados.email,
          telefone: dados.telefone,
          senhaHash,
          dataNascimento: dados.dataNascimento ?? null,
          genero: dados.genero ?? null,
        })
        .returning({ id: usuarios.id });
      await this.registrarConsentimentosIniciais(tx, u!.id, dados.aceitaMarketing, origem);
      await publicarEvento(tx, {
        tipo: 'usuario.cadastrado',
        agregadoTipo: 'usuario',
        agregadoId: u!.id,
        payload: { usuarioId: u!.id },
      });
      return u!.id;
    });
    return this.abrirSessao(usuarioId, origem);
  }

  private async registrarConsentimentosIniciais(
    tx: Executor,
    usuarioId: string,
    marketing: boolean,
    origem: Origem,
  ) {
    const vigentes = await tx
      .select()
      .from(documentosLegais)
      .where(eq(documentosLegais.vigente, true));
    for (const tipo of ['termos_uso', 'politica_privacidade'] as const) {
      const doc = vigentes.find((d) => d.tipo === tipo);
      await tx.insert(consentimentos).values({
        usuarioId,
        documentoLegalId: doc?.id ?? null,
        finalidade: tipo,
        aceito: true,
        ip: origem.ip ?? null,
        userAgent: origem.userAgent ?? null,
      });
    }
    await tx.insert(consentimentos).values({
      usuarioId,
      finalidade: 'marketing',
      aceito: marketing,
      ip: origem.ip ?? null,
      userAgent: origem.userAgent ?? null,
    });
  }

  async entrar(dados: Entrar, origem: Origem): Promise<RespostaSessao> {
    const login = dados.login.trim().toLowerCase();
    const cpf = login.replace(/\D/g, '');
    const filtro = login.includes('@') ? eq(usuarios.email, login) : eq(usuarios.cpf, cpf);
    const [usuario] = await this.banco.db.select().from(usuarios).where(filtro);
    const senhaOk = await verify(usuario?.senhaHash ?? (await HASH_FICTICIO()), dados.senha).catch(
      () => false,
    );
    if (!usuario || !senhaOk) {
      throw new UnauthorizedException({
        codigo: 'credenciais_invalidas',
        mensagem: 'E-mail/CPF ou senha incorretos',
      });
    }
    if (usuario.status !== 'ativo') {
      throw new UnauthorizedException({
        codigo: 'conta_indisponivel',
        mensagem: 'Sua conta está bloqueada ou foi excluída. Fale com o suporte.',
      });
    }
    await this.banco.db
      .update(usuarios)
      .set({ ultimoAcessoEm: new Date() })
      .where(eq(usuarios.id, usuario.id));
    return this.abrirSessao(usuario.id, { ...origem, dispositivo: dados.dispositivo });
  }

  private async abrirSessao(usuarioId: string, origem: Origem, familia: string = uuidv7()) {
    const refresh = this.tokens.novoRefresh();
    const [sessao] = await this.banco.db
      .insert(sessoes)
      .values({
        usuarioId,
        familia,
        refreshTokenHash: refresh.hash,
        dispositivo: origem.dispositivo ?? null,
        ip: origem.ip ?? null,
        userAgent: origem.userAgent ?? null,
        expiraEm: new Date(Date.now() + DURACAO_REFRESH_DIAS * 86400_000),
      })
      .returning();
    const acesso = await this.tokens.emitirAcesso(usuarioId, sessao!.id);
    return {
      tokens: {
        accessToken: acesso.token,
        refreshToken: refresh.token,
        expiraEm: acesso.expiraEm.toISOString(),
      },
      eu: await this.eu(usuarioId),
    };
  }

  /** Troca o refresh token por um novo par. Reuso de token já trocado revoga todas as sessões da família. */
  async renovar(refreshToken: string, origem: Origem): Promise<RespostaSessao> {
    const hashToken = TokensService.hash(refreshToken);
    const [sessao] = await this.banco.db
      .select()
      .from(sessoes)
      .where(eq(sessoes.refreshTokenHash, hashToken));
    const invalido = new UnauthorizedException({
      codigo: 'sessao_expirada',
      mensagem: 'Sua sessão expirou. Entre novamente.',
    });
    if (!sessao) throw invalido;
    if (sessao.revogadaEm) {
      await this.banco.db
        .update(sessoes)
        .set({ revogadaEm: new Date() })
        .where(eq(sessoes.familia, sessao.familia));
      throw invalido;
    }
    if (sessao.expiraEm < new Date()) throw invalido;
    const [usuario] = await this.banco.db
      .select()
      .from(usuarios)
      .where(eq(usuarios.id, sessao.usuarioId));
    if (!usuario || usuario.status !== 'ativo') throw invalido;
    await this.banco.db
      .update(sessoes)
      .set({ revogadaEm: new Date() })
      .where(eq(sessoes.id, sessao.id));
    return this.abrirSessao(
      sessao.usuarioId,
      { ...origem, dispositivo: sessao.dispositivo },
      sessao.familia,
    );
  }

  async sair(sessaoId: string) {
    const [s] = await this.banco.db.select().from(sessoes).where(eq(sessoes.id, sessaoId));
    if (s)
      await this.banco.db
        .update(sessoes)
        .set({ revogadaEm: new Date() })
        .where(eq(sessoes.familia, s.familia));
  }

  async eu(usuarioId: string): Promise<Eu> {
    const db = this.banco.db;
    const [u] = await db.select().from(usuarios).where(eq(usuarios.id, usuarioId));
    if (!u) throw new UnauthorizedException();
    const [aluno] = await db.select().from(alunos).where(eq(alunos.usuarioId, usuarioId));
    const [instrutor] = await db
      .select({ id: instrutores.id, status: instrutores.status })
      .from(instrutores)
      .where(eq(instrutores.usuarioId, usuarioId));
    const [admin] = await db
      .select()
      .from(adminsPlataforma)
      .where(eq(adminsPlataforma.usuarioId, usuarioId));
    const vinculos = await this.banco.comAtor({ tipo: 'anonimo', usuarioId }, (tx) =>
      tx
        .select({
          autoescolaId: autoescolas.id,
          nomeFantasia: autoescolas.nomeFantasia,
          papel: autoescolaMembros.papel,
          status: autoescolas.status,
        })
        .from(autoescolaMembros)
        .innerJoin(autoescolas, eq(autoescolas.id, autoescolaMembros.autoescolaId))
        .where(
          and(eq(autoescolaMembros.usuarioId, usuarioId), eq(autoescolaMembros.status, 'ativo')),
        ),
    );
    return {
      id: u.id,
      nome: u.nome,
      email: u.email,
      telefone: u.telefone,
      cpf: u.cpf,
      genero: (u.genero as Eu['genero']) ?? null,
      fotoArquivoId: u.fotoArquivoId,
      aluno: aluno
        ? {
            id: aluno.id,
            categoriaDesejada: aluno.categoriaDesejada as never,
            renach: aluno.renach,
          }
        : null,
      instrutor: instrutor ? { id: instrutor.id, status: instrutor.status as never } : null,
      autoescolas: vinculos as Eu['autoescolas'],
      admin: admin ? { nivel: admin.nivel } : null,
    };
  }

  async registrarDispositivo(usuarioId: string, expoPushToken: string, plataforma: string) {
    await this.banco.db
      .insert(dispositivosPush)
      .values({ usuarioId, expoPushToken, plataforma })
      .onConflictDoUpdate({
        target: dispositivosPush.expoPushToken,
        set: { usuarioId, ativo: true, ultimoUsoEm: new Date() },
      });
  }
}
