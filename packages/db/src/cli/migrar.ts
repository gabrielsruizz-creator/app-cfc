import { migrar } from '../migrar';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Defina DATABASE_URL (ex.: postgres://postgres:postgres@localhost:5432/volante)');
  process.exit(1);
}

migrar(url)
  .then(() => console.log('Migrações aplicadas.'))
  .catch((erro) => {
    console.error(erro);
    process.exit(1);
  });
