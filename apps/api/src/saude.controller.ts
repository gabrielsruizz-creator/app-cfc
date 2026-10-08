import { Controller, Get } from '@nestjs/common';
import { sql } from '@volante/db';
import { Publico } from './nucleo/auth/sessao';
import { BancoService } from './nucleo/banco.service';

@Publico()
@Controller('saude')
export class SaudeController {
  constructor(private readonly banco: BancoService) {}

  @Get()
  async verificar() {
    await this.banco.db.execute(sql`select 1`);
    return { ok: true };
  }
}
