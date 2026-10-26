import type { Channel } from 'amqplib';

/**
 * Única fuente de nombres y argumentos de la topología de RabbitMQ.
 * Los consumidores NO nombran sus colas: las importan de aquí, y el único
 * lugar con assertQueue/assertExchange/bindQueue es declararTopologia().
 */

// ── Exchanges ────────────────────────────────────────────────────────────
export const EXCHANGE_EVENTOS = 'vidalstore.eventos'; // topic
export const EXCHANGE_COMANDOS = 'vidalstore.comandos'; // direct
export const EXCHANGE_DLX = 'vidalstore.dlx'; // direct

// ── Routing keys ─────────────────────────────────────────────────────────
export const RK_COMPRA_REALIZADA = 'compra.realizada';
export const RK_LICENCIA_REVOCADA = 'licencia.revocada';
export const RK_JUEGO_PUBLICADO = 'juego.publicado';
export const RK_CORREO_ENVIAR = 'correo.enviar';
export const RK_DLQ_REPROCESAR = 'dlq.reprocesar';

// Patrones de binding (topic): avisos escucha todo lo que empiece con licencia. o compra.
export const PATRON_LICENCIA = 'licencia.*';
export const PATRON_COMPRA = 'compra.*';

// ── Colas de trabajo y sus DLQ ───────────────────────────────────────────
export const COLA_AVISOS = 'cola.avisos';
export const COLA_AUDITORIA = 'cola.auditoria';
export const COLA_CORREOS = 'cola.correos';
export const COLA_REPROCESO = 'cola.reproceso';

export const dlqDe = (cola: string): string => `${cola}.dlq`;

export const COLA_AVISOS_DLQ = dlqDe(COLA_AVISOS);
export const COLA_AUDITORIA_DLQ = dlqDe(COLA_AUDITORIA);
export const COLA_CORREOS_DLQ = dlqDe(COLA_CORREOS);
export const COLA_REPROCESO_DLQ = dlqDe(COLA_REPROCESO);

/** Las 4 DLQ, en el orden en que se declaran (siempre ANTES que las colas de trabajo). */
export const TODAS_LAS_DLQ = [
  COLA_AVISOS_DLQ,
  COLA_AUDITORIA_DLQ,
  COLA_CORREOS_DLQ,
  COLA_REPROCESO_DLQ,
];

const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;

export interface DefinicionCola {
  nombre: string;
  exchange: string;
  routingKeys: string[];
  maxLength: number;
  ttlMs: number;
}

/**
 * Políticas de retención (ver docs/politicas.md). Overflow = reject-publish:
 * las quorum queues NO admiten reject-publish-dlx, así que cuando la cola se
 * llena se rechazan las publicaciones nuevas y el productor se entera por el
 * nack de su confirm (no se borran mensajes antiguos en silencio).
 */
export const COLAS: DefinicionCola[] = [
  {
    nombre: COLA_AVISOS,
    exchange: EXCHANGE_EVENTOS,
    routingKeys: [PATRON_LICENCIA, PATRON_COMPRA],
    maxLength: 10_000,
    ttlMs: 24 * HORA, // un aviso viejo ya no sirve
  },
  {
    nombre: COLA_AUDITORIA,
    exchange: EXCHANGE_EVENTOS,
    routingKeys: ['#'],
    maxLength: 50_000,
    ttlMs: 7 * DIA, // la auditoría es la evidencia: techo alto
  },
  {
    nombre: COLA_CORREOS,
    exchange: EXCHANGE_COMANDOS,
    routingKeys: [RK_CORREO_ENVIAR],
    maxLength: 20_000,
    ttlMs: 12 * HORA, // un correo tardío pierde sentido
  },
  {
    nombre: COLA_REPROCESO,
    exchange: EXCHANGE_COMANDOS,
    routingKeys: [RK_DLQ_REPROCESAR],
    maxLength: 1_000,
    ttlMs: 24 * HORA, // órdenes puntuales
  },
];

/** Retención de las DLQ: conservar la evidencia, nunca un TTL corto. */
export const DLQ_MAX_LENGTH = 50_000;
export const DLQ_TTL_MS = 7 * DIA;

export function argumentosColaTrabajo(def: DefinicionCola): Record<string, unknown> {
  return {
    'x-queue-type': 'quorum',
    'x-dead-letter-exchange': EXCHANGE_DLX,
    'x-dead-letter-routing-key': def.nombre,
    'x-max-length': def.maxLength,
    'x-message-ttl': def.ttlMs,
    'x-overflow': 'reject-publish',
  };
}

export function argumentosDlq(): Record<string, unknown> {
  // Las DLQ no tienen DLX propio: un mensaje que llega aquí queda a salvo.
  return {
    'x-queue-type': 'quorum',
    'x-max-length': DLQ_MAX_LENGTH,
    'x-message-ttl': DLQ_TTL_MS,
    'x-overflow': 'reject-publish',
  };
}

/** Declara exchanges, DLQ (primero), colas de trabajo y bindings. Idempotente. */
export async function declararTopologia(canal: Channel): Promise<void> {
  await canal.assertExchange(EXCHANGE_EVENTOS, 'topic', { durable: true });
  await canal.assertExchange(EXCHANGE_COMANDOS, 'direct', { durable: true });
  await canal.assertExchange(EXCHANGE_DLX, 'direct', { durable: true });

  // 1) DLQ primero: así el destino del dead-lettering ya existe.
  for (const def of COLAS) {
    const dlq = dlqDe(def.nombre);
    await canal.assertQueue(dlq, { durable: true, arguments: argumentosDlq() });
    await canal.bindQueue(dlq, EXCHANGE_DLX, def.nombre);
  }

  // 2) Colas de trabajo con su DLX/DLQ y sus políticas de retención.
  for (const def of COLAS) {
    await canal.assertQueue(def.nombre, {
      durable: true,
      arguments: argumentosColaTrabajo(def),
    });
    for (const rk of def.routingKeys) {
      await canal.bindQueue(def.nombre, def.exchange, rk);
    }
  }
}
