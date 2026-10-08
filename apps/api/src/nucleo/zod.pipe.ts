import { BadRequestException, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

/** Valida e transforma o corpo/query com um schema Zod de @volante/contracts. */
export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(valor: unknown): T {
    const r = this.schema.safeParse(valor);
    if (!r.success) {
      const primeiro = r.error.issues[0];
      throw new BadRequestException({
        codigo: 'dados_invalidos',
        mensagem: primeiro?.message ?? 'Dados inválidos',
        detalhes: r.error.issues.map((i) => ({ campo: i.path.join('.'), mensagem: i.message })),
      });
    }
    return r.data;
  }
}
