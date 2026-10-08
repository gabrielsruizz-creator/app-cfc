/**
 * Fábricas de dados para testes. Inserem direto no banco com o ator "sistema".
 * Não use em código de produção.
 */
import type { Db } from './cliente';
import { ATOR_SISTEMA, comAtor } from './contexto';
import {
  alunos,
  arquivos,
  autoescolaMembros,
  autoescolas,
  disponibilidadesSemanais,
  instrutores,
  usuarios,
  veiculos,
} from './schema';
import type { Ponto } from './schema/tipos';

let sequencia = 0;
const proximo = () => ++sequencia + Math.floor(Math.random() * 1_000_000);

function cpfAleatorio(): string {
  const base = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  const dv = (nums: number[], peso: number) => {
    const soma = nums.reduce((acc, n, i) => acc + n * (peso - i), 0);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const d1 = dv(base, 10);
  const d2 = dv([...base, d1], 11);
  return [...base, d1, d2].join('');
}

export function cnpjAleatorio(): string {
  const base = Array.from({ length: 12 }, () => Math.floor(Math.random() * 10));
  const dv = (nums: number[]) => {
    const pesos =
      nums.length === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const r = nums.reduce((acc, n, i) => acc + n * pesos[i]!, 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = dv(base);
  return [...base, d1, dv([...base, d1])].join('');
}

function placaAleatoria(): string {
  const letra = () => String.fromCharCode(65 + Math.floor(Math.random() * 26));
  const digito = () => Math.floor(Math.random() * 10);
  return `${letra()}${letra()}${letra()}${digito()}${letra()}${digito()}${digito()}`;
}

export const SENHA_HASH_FALSA = '$argon2id$v=19$m=19456,t=2,p=1$ZmFrZXNhbHQ$ZmFrZWhhc2g';

export async function fabricarUsuario(db: Db, dados: Partial<typeof usuarios.$inferInsert> = {}) {
  const n = proximo();
  return comAtor(db, ATOR_SISTEMA, async (tx) => {
    const [u] = await tx
      .insert(usuarios)
      .values({
        nome: `Pessoa Teste ${n}`,
        cpf: cpfAleatorio(),
        email: `pessoa${n}@teste.com`,
        telefone: `+55119${String(n).padStart(8, '0').slice(-8)}`,
        senhaHash: SENHA_HASH_FALSA,
        ...dados,
      })
      .returning();
    return u!;
  });
}

export async function fabricarArquivo(db: Db, donoUsuarioId: string, finalidade = 'selfie') {
  return comAtor(db, ATOR_SISTEMA, async (tx) => {
    const [a] = await tx
      .insert(arquivos)
      .values({
        donoUsuarioId,
        chaveStorage: `teste/${proximo()}.jpg`,
        mime: 'image/jpeg',
        tamanhoBytes: 1000,
        sha256: 'x',
        finalidade,
      })
      .returning();
    return a!;
  });
}

export async function fabricarAluno(db: Db) {
  const usuario = await fabricarUsuario(db);
  const selfie = await fabricarArquivo(db, usuario.id);
  const aluno = await comAtor(db, ATOR_SISTEMA, async (tx) => {
    const [a] = await tx
      .insert(alunos)
      .values({ usuarioId: usuario.id, categoriaDesejada: 'B', selfieArquivoId: selfie.id })
      .returning();
    return a!;
  });
  return { usuario, aluno };
}

export const PONTO_PADRAO: Ponto = { lat: -23.5505, lng: -46.6333 };

export async function fabricarInstrutorAprovado(
  db: Db,
  dados: Partial<typeof instrutores.$inferInsert> = {},
  opcoes: { jornadaTodosOsDias?: boolean } = { jornadaTodosOsDias: true },
) {
  const usuario = await fabricarUsuario(db, { genero: 'feminino' });
  const instrutor = await comAtor(db, ATOR_SISTEMA, async (tx) => {
    const [i] = await tx
      .insert(instrutores)
      .values({
        usuarioId: usuario.id,
        status: 'aprovado',
        aprovadoEm: new Date(),
        bio: 'Instrutora paciente, especialista em alunos com medo de dirigir.',
        atuaDesde: 2015,
        categorias: ['B'],
        precoAulaCentavos: 10000,
        duracaoAulaMin: 50,
        raioAtendimentoKm: 15,
        baseLocalizacao: PONTO_PADRAO,
        disponivel: true,
        forneceVeiculo: true,
        ...dados,
      })
      .returning();
    await tx.insert(veiculos).values({
      instrutorId: i!.id,
      placa: placaAleatoria(),
      marca: 'Fiat',
      modelo: 'Argo',
      ano: 2022,
      cambio: 'manual',
      categoria: 'B',
    });
    if (opcoes.jornadaTodosOsDias) {
      for (let dia = 0; dia < 7; dia++) {
        await tx
          .insert(disponibilidadesSemanais)
          .values({ instrutorId: i!.id, diaSemana: dia, horaInicio: '07:00', horaFim: '21:00' });
      }
    }
    return i!;
  });
  return { usuario, instrutor };
}

export async function fabricarAutoescola(
  db: Db,
  dados: Partial<typeof autoescolas.$inferInsert> = {},
) {
  const dono = await fabricarUsuario(db);
  const n = proximo();
  const autoescola = await comAtor(db, ATOR_SISTEMA, async (tx) => {
    const [a] = await tx
      .insert(autoescolas)
      .values({
        razaoSocial: `Autoescola Teste ${n} LTDA`,
        nomeFantasia: `Autoescola Teste ${n}`,
        cnpj: cnpjAleatorio(),
        slug: `autoescola-teste-${n}`,
        telefone: '+5511999990000',
        whatsapp: '+5511999990000',
        email: `contato${n}@autoescola.com`,
        cep: '01001-000',
        logradouro: 'Praça da Sé',
        numero: '1',
        bairro: 'Sé',
        municipio: 'São Paulo',
        uf: 'SP',
        localizacao: PONTO_PADRAO,
        credenciamentoDetran: `CFC-${n}`,
        status: 'aprovada',
        ...dados,
      })
      .returning();
    await tx
      .insert(autoescolaMembros)
      .values({ autoescolaId: a!.id, usuarioId: dono.id, papel: 'dono' });
    return a!;
  });
  return { dono, autoescola };
}
