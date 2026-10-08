import { conectar } from '@volante/db';
import { Client } from 'pg';
import { lerConfigWorker, montarDependencias } from './config';
import { CONSUMIDORES } from './consumidores';
import { processarTudo } from './outbox';
import { executarRotinas } from './rotinas';

/**
 * Worker: consome a outbox (acordado por LISTEN/NOTIFY, com varredura periódica de segurança)
 * e executa as rotinas de prazo. É o único processo que chama serviços externos.
 */
async function iniciar() {
  const config = lerConfigWorker();
  const { db, encerrar } = conectar(config.DATABASE_URL, { max: 5 });
  const deps = montarDependencias(db, config);

  let processando = false;
  let pedidoNovo = false;
  const drenar = async () => {
    if (processando) {
      pedidoNovo = true;
      return;
    }
    processando = true;
    try {
      do {
        pedidoNovo = false;
        await processarTudo(deps, CONSUMIDORES);
      } while (pedidoNovo);
    } catch (erro) {
      deps.log.erro('Erro ao drenar a outbox', erro);
    } finally {
      processando = false;
    }
  };

  const ouvinte = new Client({ connectionString: config.DATABASE_URL });
  await ouvinte.connect();
  ouvinte.on('notification', () => void drenar());
  await ouvinte.query('LISTEN outbox');

  const varredura = setInterval(() => void drenar(), 5_000);
  const rotinas = setInterval(async () => {
    // Lock consultivo: só um worker executa as rotinas por vez.
    const r = await ouvinte.query('select pg_try_advisory_lock(424242) as ok');
    if (!r.rows[0]?.ok) return;
    try {
      const resultado = await executarRotinas(deps);
      deps.log.info('Rotinas executadas', resultado);
    } catch (erro) {
      deps.log.erro('Erro nas rotinas', erro);
    } finally {
      await ouvinte.query('select pg_advisory_unlock(424242)');
    }
  }, config.INTERVALO_ROTINAS_SEG * 1000);

  deps.log.info(`Worker iniciado. Gateways: ${Object.keys(deps.gateways).join(', ')}; push: ${config.PUSH_PROVEDOR}`);
  void drenar();

  const parar = async () => {
    clearInterval(varredura);
    clearInterval(rotinas);
    await ouvinte.end();
    await encerrar();
    process.exit(0);
  };
  process.on('SIGINT', parar);
  process.on('SIGTERM', parar);
}

void iniciar();
