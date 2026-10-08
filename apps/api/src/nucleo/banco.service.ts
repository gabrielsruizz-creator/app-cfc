import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { comAtor, definirContexto, ATOR_SISTEMA, type Ator, type ConexaoBanco, type Db, type Tx } from '@volante/db';
import { BANCO } from './tokens';

@Injectable()
export class BancoService implements OnModuleDestroy {
  constructor(@Inject(BANCO) private readonly conexao: ConexaoBanco) {}

  get db(): Db {
    return this.conexao.db;
  }

  /** Transação com o contexto de RLS do ator. */
  comAtor<T>(ator: Ator, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return comAtor(this.conexao.db, ator, fn);
  }

  /**
   * Eleva a transação atual para o contexto "sistema". Use somente depois de verificar,
   * no contexto do usuário, que ele tem direito à operação (ex.: o aluno confirma o fim da
   * própria aula e o sistema grava os lançamentos financeiros).
   */
  elevarParaSistema(tx: Tx): Promise<void> {
    return definirContexto(tx, ATOR_SISTEMA);
  }

  async onModuleDestroy() {
    await this.conexao.encerrar();
  }
}
