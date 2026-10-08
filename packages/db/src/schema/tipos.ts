import { customType, timestamp, uuid } from 'drizzle-orm/pg-core';
import { uuidv7 } from 'uuidv7';

export type Ponto = { lat: number; lng: number };

/**
 * Lê um ponto vindo do Postgres em EWKB hexadecimal (formato padrão de saída do PostGIS).
 */
export function lerPontoEwkb(hex: string): Ponto {
  const buf = Buffer.from(hex, 'hex');
  const le = buf.readUInt8(0) === 1;
  const tipo = le ? buf.readUInt32LE(1) : buf.readUInt32BE(1);
  const temSrid = (tipo & 0x20000000) !== 0;
  let offset = 5 + (temSrid ? 4 : 0);
  const x = le ? buf.readDoubleLE(offset) : buf.readDoubleBE(offset);
  offset += 8;
  const y = le ? buf.readDoubleLE(offset) : buf.readDoubleBE(offset);
  return { lng: x, lat: y };
}

export function pontoParaEwkt(p: Ponto): string {
  return `SRID=4326;POINT(${p.lng} ${p.lat})`;
}

/** geography(Point, 4326) do PostGIS, exposto como { lat, lng }. */
export const geografiaPonto = customType<{ data: Ponto; driverData: string }>({
  dataType() {
    return 'geography(Point,4326)';
  },
  toDriver(valor) {
    return pontoParaEwkt(valor);
  },
  fromDriver(valor) {
    return lerPontoEwkb(valor);
  },
});

/** tstzrange — usado em coluna gerada para as restrições de conflito de agenda. */
export const intervaloTempo = customType<{ data: string }>({
  dataType() {
    return 'tstzrange';
  },
});

export const bytea = customType<{ data: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

export const idPk = () =>
  uuid()
    .primaryKey()
    .$defaultFn(() => uuidv7());

export const instanteTz = () => timestamp({ withTimezone: true, mode: 'date' });

export const carimbos = {
  criadoEm: instanteTz().defaultNow().notNull(),
  atualizadoEm: instanteTz()
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
};

export const criadoEm = () => instanteTz().defaultNow().notNull();
