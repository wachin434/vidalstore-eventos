import type { ConsumeMessage } from 'amqplib';

export const ID = '3f2b8c1e-5d7a-4e0b-9c41-2a6d8e9f0b11';

/** Fabrica un mensaje de amqplib para las pruebas unitarias. */
export function crearMsg(
  contenido: unknown,
  headers: Record<string, unknown> = { 'x-evento-id': ID },
  routingKey = 'compra.realizada',
): ConsumeMessage {
  const texto = typeof contenido === 'string' ? contenido : JSON.stringify(contenido);
  return {
    content: Buffer.from(texto),
    fields: { routingKey, exchange: 'vidalstore.eventos', deliveryTag: 1, redelivered: false, consumerTag: 'x' },
    properties: { headers },
  } as unknown as ConsumeMessage;
}

export const COMPRA = {
  licenciaId: 'l1',
  juegoId: 'j1',
  usuarioSub: 'u1',
  adquiridaEn: '2026-10-01T10:00:00Z',
};

export const bitacoraMuda = { log: () => undefined, warn: () => undefined, error: () => undefined };
