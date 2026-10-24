import type { ConsumeMessage } from 'amqplib';
import { esUuid } from '../mensajeria/errores';

export interface DatosMuerte {
  colaOrigen: string;
  exchangeOrigen: string | null;
  routingKey: string;
  motivo: string;
  intentos: number;
  eventoId: string | null;
}

const texto = (v: unknown): string | undefined =>
  typeof v === 'string' ? v : Buffer.isBuffer(v) ? v.toString('utf8') : undefined;

/**
 * Lee x-death[0] (la primera muerte del mensaje): queue, exchange,
 * routing-keys[0], reason y count. Si el mensaje llegó a la DLQ sin pasar
 * por un dead-lettering (publicado a mano), se informan valores "desconocida".
 */
export function leerMuerte(msg: ConsumeMessage): DatosMuerte {
  const headers = msg.properties.headers ?? {};
  const muertes = Array.isArray(headers['x-death']) ? headers['x-death'] : [];
  const primera = (muertes[0] ?? {}) as Record<string, unknown>;
  const claves = Array.isArray(primera['routing-keys']) ? (primera['routing-keys'] as unknown[]) : [];
  const idHeader = texto(headers['x-evento-id']);
  return {
    colaOrigen: texto(primera['queue']) ?? texto(headers['x-first-death-queue']) ?? 'desconocida',
    exchangeOrigen: texto(primera['exchange']) ?? texto(headers['x-first-death-exchange']) ?? null,
    routingKey: texto(claves[0]) ?? msg.fields.routingKey ?? 'desconocida',
    motivo: texto(primera['reason']) ?? texto(headers['x-first-death-reason']) ?? 'desconocido',
    intentos: Number(primera['count'] ?? 0) || 0,
    eventoId: esUuid(idHeader) ? idHeader : null,
  };
}
