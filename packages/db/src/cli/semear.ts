import { carregarEnv } from './carregar-env';
carregarEnv();

/**
 * Semeia dados de referência e, com --demo, dados de demonstração para testar no celular.
 *   pnpm db:semear            -> habilidades, comissões, termos, contas da plataforma, admin
 *   pnpm db:semear -- --demo  -> também cria instrutores, aluno e autoescola de exemplo
 */
import { hash } from '@node-rs/argon2';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { and, eq } from 'drizzle-orm';
import { conectar } from '../cliente';
import { ATOR_SISTEMA, comAtor } from '../contexto';
import { cnpjAleatorio } from '../fabricas';
import {
  adminsPlataforma,
  alunos,
  arquivos,
  autoescolaMembros,
  autoescolas,
  disponibilidadesSemanais,
  instrutorDocumentos,
  instrutores,
  usuarios,
  veiculos,
} from '../schema';
import { semearBase } from '../semente';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Defina DATABASE_URL');
  process.exit(1);
}

const demo = process.argv.includes('--demo');
// Mesma pasta usada pela API em desenvolvimento (apps/api/.armazenamento).
const pastaArquivos = path.resolve(
  process.env.ARMAZENAMENTO_DIR ?? path.join(__dirname, '../../../../apps/api/.armazenamento'),
);

/** Imagem ilustrativa para os documentos de demonstração. */
function imagemDemo(titulo: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400">
  <rect width="640" height="400" rx="24" fill="#E3F2F0"/>
  <rect x="24" y="24" width="592" height="352" rx="16" fill="none" stroke="#0B6E69" stroke-width="4" stroke-dasharray="12 8"/>
  <text x="320" y="180" font-family="sans-serif" font-size="34" font-weight="700" fill="#0B6E69" text-anchor="middle">${titulo}</text>
  <text x="320" y="230" font-family="sans-serif" font-size="22" fill="#56676A" text-anchor="middle">Documento de demonstração</text>
</svg>`;
}
const centro = {
  lat: Number(process.env.DEMO_LAT ?? -23.5614),
  lng: Number(process.env.DEMO_LNG ?? -46.6559),
};

const INSTRUTORES_DEMO = [
  {
    nome: 'Ana Paula Ribeiro',
    genero: 'feminino',
    preco: 9000,
    cambio: 'manual',
    pcd: false,
    dLat: 0.008,
    dLng: 0.004,
    cpf: '39053344705',
  },
  {
    nome: 'Carlos Henrique Souza',
    genero: 'masculino',
    preco: 8000,
    cambio: 'manual',
    pcd: false,
    dLat: -0.01,
    dLng: 0.012,
    cpf: '82178537464',
  },
  {
    nome: 'Juliana Martins',
    genero: 'feminino',
    preco: 11000,
    cambio: 'automatico',
    pcd: true,
    dLat: 0.015,
    dLng: -0.009,
    cpf: '44867291030',
  },
  {
    nome: 'Roberto Lima',
    genero: 'masculino',
    preco: 7500,
    cambio: 'manual',
    pcd: false,
    dLat: -0.004,
    dLng: -0.016,
    cpf: '73694813012',
  },
  {
    nome: 'Fernanda Alves',
    genero: 'feminino',
    preco: 12000,
    cambio: 'automatico',
    pcd: false,
    dLat: 0.02,
    dLng: 0.018,
    cpf: '15350946056',
  },
] as const;

async function main() {
  const { db, encerrar } = conectar(url!);
  try {
    await semearBase(db);
    console.log('Dados de referência ok.');

    const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@volante.dev';
    const adminSenha = process.env.ADMIN_SENHA ?? 'admin12345';
    await comAtor(db, ATOR_SISTEMA, async (tx) => {
      let [admin] = await tx.select().from(usuarios).where(eq(usuarios.email, adminEmail));
      if (!admin) {
        [admin] = await tx
          .insert(usuarios)
          .values({
            nome: 'Administrador',
            email: adminEmail,
            telefone: '+5511900000000',
            senhaHash: await hash(adminSenha),
          })
          .returning();
        console.log(`Admin criado: ${adminEmail} / ${adminSenha} (troque a senha!)`);
      }
      await tx.insert(adminsPlataforma).values({ usuarioId: admin!.id }).onConflictDoNothing();
    });

    if (demo) await semearDemo(db);
  } finally {
    await encerrar();
  }
}

async function semearDemo(db: ReturnType<typeof conectar>['db']) {
  const senhaHash = await hash('demo1234');
  await comAtor(db, ATOR_SISTEMA, async (tx) => {
    const usuarioDemo = async (
      email: string,
      nome: string,
      cpf: string,
      telefone: string,
      genero?: string,
    ) => {
      const [existente] = await tx.select().from(usuarios).where(eq(usuarios.email, email));
      if (existente) return { usuario: existente, novo: false };
      const [u] = await tx
        .insert(usuarios)
        .values({ nome, email, cpf, telefone, senhaHash, genero })
        .returning();
      return { usuario: u!, novo: true };
    };
    const arquivoDemo = async (donoUsuarioId: string, finalidade: string, titulo = finalidade) => {
      const chave = `demo/${titulo
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\w]+/g, '-')
        .toLowerCase()}.svg`;
      const conteudo = imagemDemo(titulo);
      mkdirSync(path.join(pastaArquivos, 'demo'), { recursive: true });
      writeFileSync(path.join(pastaArquivos, chave), conteudo);
      const [a] = await tx
        .insert(arquivos)
        .values({
          donoUsuarioId,
          chaveStorage: chave,
          mime: 'image/svg+xml',
          tamanhoBytes: conteudo.length,
          sha256: 'demo',
          finalidade,
        })
        .returning();
      return a!;
    };

    // Aluno
    const { usuario: uAluno, novo: alunoNovo } = await usuarioDemo(
      'aluno@demo.com',
      'Lucas Pereira (demo)',
      '52998224725',
      '+5511911110000',
    );
    if (alunoNovo) {
      const selfie = await arquivoDemo(uAluno.id, 'selfie', 'Selfie do aluno');
      await tx
        .insert(alunos)
        .values({ usuarioId: uAluno.id, categoriaDesejada: 'B', selfieArquivoId: selfie.id });
    }

    // Instrutores aprovados ao redor do ponto central
    for (const [i, d] of INSTRUTORES_DEMO.entries()) {
      const email = i === 0 ? 'instrutor@demo.com' : `instrutor${i + 1}@demo.com`;
      const { usuario, novo } = await usuarioDemo(
        email,
        `${d.nome} (demo)`,
        d.cpf,
        `+551192222000${i}`,
        d.genero,
      );
      if (!novo) continue;
      const [instrutor] = await tx
        .insert(instrutores)
        .values({
          usuarioId: usuario.id,
          status: 'aprovado',
          aprovadoEm: new Date(),
          bio: 'Instrutor(a) de demonstração. Aulas com calma, foco em baliza, rampa e trânsito real.',
          atuaDesde: 2012 + i,
          categorias: i === 3 ? ['A', 'B'] : ['B'],
          precoAulaCentavos: d.preco,
          duracaoAulaMin: 50,
          raioAtendimentoKm: 20,
          baseLocalizacao: { lat: centro.lat + d.dLat, lng: centro.lng + d.dLng },
          disponivel: true,
          forneceVeiculo: true,
        })
        .returning();
      await tx.insert(veiculos).values({
        instrutorId: instrutor!.id,
        placa: `DEM${i}A${10 + i}`,
        marca: d.cambio === 'automatico' ? 'Hyundai' : 'Volkswagen',
        modelo: d.cambio === 'automatico' ? 'HB20 Automático' : 'Polo',
        ano: 2023,
        cor: 'Branco',
        cambio: d.cambio,
        adaptadoPcd: d.pcd,
        adaptacoes: d.pcd ? 'Acelerador e freio manuais' : null,
        categoria: 'B',
      });
      for (const tipo of [
        'cnh',
        'credencial_detran',
        'documento_veiculo',
        'comprovante_residencia',
        'selfie',
      ]) {
        const titulos: Record<string, string> = {
          cnh: 'CNH',
          credencial_detran: 'Credencial DETRAN',
          documento_veiculo: 'CRLV do veículo',
          comprovante_residencia: 'Comprovante de residência',
          selfie: 'Selfie',
        };
        const arq = await arquivoDemo(
          usuario.id,
          tipo === 'selfie' ? 'selfie' : 'documento',
          titulos[tipo],
        );
        await tx.insert(instrutorDocumentos).values({
          instrutorId: instrutor!.id,
          tipo,
          arquivoId: arq.id,
          validade: ['cnh', 'credencial_detran', 'documento_veiculo'].includes(tipo)
            ? '2030-12-31'
            : null,
          status: 'aprovado',
          analisadoEm: new Date(),
        });
      }
      for (let dia = 1; dia <= 6; dia++) {
        await tx.insert(disponibilidadesSemanais).values({
          instrutorId: instrutor!.id,
          diaSemana: dia,
          horaInicio: '07:00',
          horaFim: dia === 6 ? '13:00' : '20:00',
        });
      }
    }

    // Autoescola aprovada
    const { usuario: uAuto, novo: autoNova } = await usuarioDemo(
      'autoescola@demo.com',
      'Marina Costa (demo)',
      '24843803483',
      '+5511933330000',
    );
    if (autoNova) {
      const [a] = await tx
        .insert(autoescolas)
        .values({
          razaoSocial: 'Autoescola Demonstração LTDA',
          nomeFantasia: 'Autoescola Demo',
          cnpj: cnpjAleatorio(),
          slug: 'autoescola-demo',
          status: 'aprovada',
          aprovadaEm: new Date(),
          telefone: '+5511933330000',
          whatsapp: '+5511933330000',
          email: 'autoescola@demo.com',
          cep: '01310-100',
          logradouro: 'Avenida Paulista',
          numero: '1000',
          bairro: 'Bela Vista',
          municipio: 'São Paulo',
          uf: 'SP',
          localizacao: centro,
          credenciamentoDetran: 'CFC-DEMO-001',
        })
        .returning();
      const [membro] = await tx
        .select()
        .from(autoescolaMembros)
        .where(
          and(eq(autoescolaMembros.usuarioId, uAuto.id), eq(autoescolaMembros.autoescolaId, a!.id)),
        );
      if (!membro)
        await tx
          .insert(autoescolaMembros)
          .values({ autoescolaId: a!.id, usuarioId: uAuto.id, papel: 'dono' });
    }
  });
  console.log(
    'Dados de demonstração ok. Logins (senha demo1234): aluno@demo.com, instrutor@demo.com, autoescola@demo.com',
  );
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
