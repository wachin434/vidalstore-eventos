import type { Channel } from 'amqplib';

export const EXCHANGE_EVENTOS = 'vidalstore.eventos';
export const EXCHANGE_COMANDOS = 'vidalstore.comandos';
export const EXCHANGE_DLX = 'vidalstore.dlx';

export const RK_COMPRA_REALIZADA = 'compra.realizada';
export const RK_LICENCIA_REVOCADA = 'licencia.revocada';
export const RK_JUEGO_PUBLICADO = 'juego.publicado';
export const RK_CORREO_ENVIAR = 'correo.enviar';

export const COLA_LICENCIAS = 'cola.licencias';
export const COLA_CATALOGO_EVENTOS = 'cola.catalogo-eventos';
export const COLA_CORREOS = 'cola.correos';

export const COLA_LICENCIAS_DLQ = 'cola.licencias.dlq';
export const COLA_CATALOGO_EVENTOS_DLQ = 'cola.catalogo-eventos.dlq';
export const COLA_CORREOS_DLQ = 'cola.correos.dlq';

interface DefinicionCola {
  nombre: string;
  exchange: string;
  routingKeys: string[];
  dlq: string;
}

export const COLAS: DefinicionCola[] = [
  {
    nombre: COLA_LICENCIAS,
    exchange: EXCHANGE_EVENTOS,
    routingKeys: [RK_COMPRA_REALIZADA, RK_LICENCIA_REVOCADA],
    dlq: COLA_LICENCIAS_DLQ,
  },
  {
    nombre: COLA_CATALOGO_EVENTOS,
    exchange: EXCHANGE_EVENTOS,
    routingKeys: [RK_JUEGO_PUBLICADO],
    dlq: COLA_CATALOGO_EVENTOS_DLQ,
  },
  {
    nombre: COLA_CORREOS,
    exchange: EXCHANGE_COMANDOS,
    routingKeys: [RK_CORREO_ENVIAR],
    dlq: COLA_CORREOS_DLQ,
  },
];

const ARGUMENTOS_RETENCION = {
  'x-max-length': 10_000,
  'x-overflow': 'reject-publish-dlx',
  'x-message-ttl': 86_400_000,
};

export async function declararTopologia(channel: Channel): Promise<void> {
  await channel.assertExchange(EXCHANGE_EVENTOS, 'topic', { durable: true });
  await channel.assertExchange(EXCHANGE_COMANDOS, 'direct', { durable: true });
  await channel.assertExchange(EXCHANGE_DLX, 'direct', { durable: true });

  for (const cola of COLAS) {
    await channel.assertQueue(cola.dlq, {
      durable: true,
      arguments: { 'x-queue-type': 'quorum' },
    });
    await channel.bindQueue(cola.dlq, EXCHANGE_DLX, cola.nombre);

    await channel.assertQueue(cola.nombre, {
      durable: true,
      arguments: {
        'x-queue-type': 'quorum',
        'x-dead-letter-exchange': EXCHANGE_DLX,
        'x-dead-letter-routing-key': cola.nombre,
        ...ARGUMENTOS_RETENCION,
      },
    });

    for (const rk of cola.routingKeys) {
      await channel.bindQueue(cola.nombre, cola.exchange, rk);
    }
  }
}
