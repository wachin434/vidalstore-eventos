import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Producer, ProduceAcks, compatibilityPartitioner, stringSerializers } from '@platformatic/kafka';
import type { Mensaje } from './contrato';

/**
 * Publica en el .dlt (el topic del original con ".dlt" al final) el mensaje que no se pudo procesar.
 *
 * - key y value quedan IGUALES al original: cae en la misma particion del .dlt y se puede reprocesar.
 * - Se copian los headers del original (x-evento-id, x-correlation-id, content-type).
 * - Se agregan x-motivo (valor corto y fijo) y x-grupo (el consumer group que lo desvio). Para ir a buscar el
 *   original tambien van x-topic-origen, x-particion y x-offset, y x-detalle con el error.
 *
 * send() espera la confirmacion de todo el ISR (acks=all): si Kafka no confirma, lanza, y el consumidor NO
 * confirma el offset: el evento no se pierde, se vuelve a leer.
 */
export class DesvioDlt {
  private readonly log = new Logger(DesvioDlt.name);
  private productor?: Producer<string, string, string, string>;

  constructor(private readonly config: ConfigService) {}

  async desviar(m: Mensaje, grupo: string, motivo: string, detalle?: string): Promise<void> {
    const headers = new Map<string, string>(m.headers ?? []);
    headers.set('x-motivo', motivo);
    headers.set('x-grupo', grupo);
    headers.set('x-topic-origen', m.topic);
    headers.set('x-particion', String(m.partition));
    headers.set('x-offset', String(m.offset));
    if (detalle) headers.set('x-detalle', detalle.slice(0, 300));

    const topic = `${m.topic}.dlt`;
    await this.obtener().send({ messages: [{ topic, key: m.key, value: m.value, headers }] });
    this.log.warn(`${m.topic}[${m.partition}]@${m.offset} AL .DLT (${motivo}) por ${grupo}`);
  }

  async cerrar(): Promise<void> {
    await this.productor?.close();
  }

  private obtener(): Producer<string, string, string, string> {
    if (!this.productor) {
      const brokers = this.config.get<string>('KAFKA_BROKERS');
      if (!brokers) throw new Error('KAFKA_BROKERS no esta definida: no se puede publicar en el .dlt');
      this.productor = new Producer({
        clientId: 'vidalstore-eventos-dlt',
        bootstrapBrokers: brokers.split(',').map((b) => b.trim()),
        serializers: stringSerializers,
        idempotent: true,
        acks: ProduceAcks.ALL,
        retries: 10,
        partitioner: compatibilityPartitioner, // la misma particion que el original, con su key
        autocreateTopics: false,
      });
    }
    return this.productor;
  }
}
