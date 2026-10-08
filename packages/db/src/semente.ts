import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Db } from './cliente';
import { ATOR_SISTEMA, comAtor } from './contexto';
import { contasFinanceiras, documentosLegais, habilidades, regrasComissao } from './schema';

export const HABILIDADES_PADRAO = [
  { codigo: 'controle_veiculo', nome: 'Controle do veículo', categorias: ['A', 'B'], ordem: 1 },
  { codigo: 'troca_marchas', nome: 'Troca de marchas', categorias: ['A', 'B'], ordem: 2 },
  { codigo: 'equilibrio', nome: 'Equilíbrio e baixa velocidade', categorias: ['A'], ordem: 3 },
  { codigo: 'baliza', nome: 'Baliza', categorias: ['B'], ordem: 4 },
  { codigo: 'rampa', nome: 'Arrancada em rampa', categorias: ['B'], ordem: 5 },
  { codigo: 'conversao', nome: 'Conversões e retornos', categorias: ['A', 'B'], ordem: 6 },
  { codigo: 'transito', nome: 'Direção no trânsito', categorias: ['A', 'B'], ordem: 7 },
  { codigo: 'sinalizacao', nome: 'Leitura de sinalização', categorias: ['A', 'B'], ordem: 8 },
  { codigo: 'direcao_defensiva', nome: 'Direção defensiva', categorias: ['A', 'B'], ordem: 9 },
  { codigo: 'estacionamento', nome: 'Estacionamento', categorias: ['B'], ordem: 10 },
];

export const REGRAS_COMISSAO_PADRAO = [
  { vendedorTipo: 'instrutor', produtoTipo: 'aula_avulsa', percentualBp: 1500 },
  { vendedorTipo: 'instrutor', produtoTipo: 'pacote', percentualBp: 1200 },
  { vendedorTipo: 'autoescola', produtoTipo: 'aula_avulsa', percentualBp: 1000 },
  { vendedorTipo: 'autoescola', produtoTipo: 'pacote', percentualBp: 1000 },
] as const;

const TEXTO_PROVISORIO = (titulo: string) =>
  `# ${titulo}\n\n**Versão provisória para testes.** O texto definitivo deve ser redigido e revisado juridicamente antes do lançamento.\n\nAo usar o app você concorda com o tratamento dos seus dados pessoais para as finalidades de cadastro, agendamento, pagamento e segurança das aulas, conforme a LGPD (Lei 13.709/2018).`;

export const DOCUMENTOS_LEGAIS_PADRAO = [
  { tipo: 'termos_uso', versao: '0.1', titulo: 'Termos de uso' },
  { tipo: 'politica_privacidade', versao: '0.1', titulo: 'Política de privacidade' },
  { tipo: 'termo_instrutor', versao: '0.1', titulo: 'Termo do instrutor parceiro' },
  { tipo: 'termo_autoescola', versao: '0.1', titulo: 'Termo da autoescola parceira' },
] as const;

/**
 * Dados de referência necessários para o sistema funcionar. Idempotente: pode rodar várias vezes.
 */
export async function semearBase(db: Db): Promise<void> {
  await comAtor(db, ATOR_SISTEMA, async (tx) => {
    for (const h of HABILIDADES_PADRAO) {
      await tx.insert(habilidades).values(h).onConflictDoNothing();
    }

    for (const r of REGRAS_COMISSAO_PADRAO) {
      const existente = await tx
        .select({ id: regrasComissao.id })
        .from(regrasComissao)
        .where(
          and(
            eq(regrasComissao.vendedorTipo, r.vendedorTipo),
            eq(regrasComissao.produtoTipo, r.produtoTipo),
            isNull(regrasComissao.vigenteAte),
            isNull(regrasComissao.instrutorId),
            isNull(regrasComissao.autoescolaId),
          ),
        );
      if (existente.length === 0) {
        await tx.insert(regrasComissao).values({ ...r, motivo: 'Regra inicial' });
      }
    }

    for (const d of DOCUMENTOS_LEGAIS_PADRAO) {
      await tx
        .insert(documentosLegais)
        .values({ tipo: d.tipo, versao: d.versao, conteudoMd: TEXTO_PROVISORIO(d.titulo) })
        .onConflictDoNothing();
    }

    for (const titularTipo of ['plataforma', 'externa'] as const) {
      await tx
        .insert(contasFinanceiras)
        .values({ titularTipo })
        .onConflictDoNothing({
          target: contasFinanceiras.titularTipo,
          where: sql`${contasFinanceiras.titularTipo} in ('plataforma', 'externa')`,
        });
    }
  });
}
