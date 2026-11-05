import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Consumer, MessagesStream, stringDeserializers } from '@platformatic/kafka';
import { TOPICS } from './topics';
import { validarEvento } from './validar-evento';

export const GRUPO = 'vidalstore-panel';

export interface Contadores {
  validos: number;
  invalidos: number;
}

@Injectable()
export class StreamingConsumer implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger(StreamingConsumer.name);
  private consumer?: Consumer<string, string, string, string>;
  private stream?: MessagesStream<string, string, string, string>;
  private cerrando = false;
  readonly contadores: Record<string, Contadores> = {
    [TOPICS.compras]: { validos: 0, invalidos: 0 },
    [TOPICS.actividad]: { validos: 0, invalidos: 0 },
  };

  constructor(private readonly config: ConfigService) {}

  async onApplicationBootstrap(): Promise<void> {
    const brokers = this.config.get<string>('KAFKA_BROKERS');
    if (!brokers) {
      this.log.error('KAFKA_BROKERS no esta definida: el consumidor de Kafka no arranca');
      return;
    }

    try {
      this.consumer = new Consumer({
        clientId: 'vidalstore-eventos',
        groupId: GRUPO,
        bootstrapBrokers: brokers.split(',').map((b) => b.trim()),
        deserializers: stringDeserializers,
      });

      this.stream = await this.consumer.consume({
        topics: [TOPICS.compras, TOPICS.actividad],
        autocommit: false, // el offset se confirma a mano, despues de procesar
        mode: 'committed',
        fallbackMode: 'earliest', // grupo nuevo: parte desde el inicio del topic
      });
    } catch (error) {
      this.log.error(`no se pudo iniciar el consumidor de Kafka: ${(error as Error).message}`);
      return;
    }

    this.log.log(`consumidor ${GRUPO} leyendo ${TOPICS.compras} y ${TOPICS.actividad}`);
    void this.leer();
  }

  private async leer(): Promise<void> {
    try {
      for await (const mensaje of this.stream!) {
        const topic = mensaje.topic;
        const resultado = validarEvento(mensaje.value);

        if (resultado.ok) {
          this.contadores[topic].validos++;
        } else {
          this.contadores[topic].invalidos++;
          this.log.warn(
            `mensaje invalido en ${topic}[${mensaje.partition}] offset ${mensaje.offset}: ${resultado.motivo}`,
          );
        }

        // Se confirma despues de procesar (valido o no): un invalido no debe bloquear el topic.
        await mensaje.commit();

        const total = this.contadores[topic].validos + this.contadores[topic].invalidos;
        if (total % 500 === 0) {
          const c = this.contadores[topic];
          this.log.log(`${topic}: ${c.validos} validos, ${c.invalidos} invalidos`);
        }
      }
    } catch (error) {
      if (!this.cerrando) {
        this.log.error(`el consumidor de Kafka se detuvo: ${(error as Error).message}`);
      }
    }
  }

  async onApplicationShutdown(): Promise<void> {
    this.cerrando = true;
    try {
      await this.stream?.close();
      await this.consumer?.close();
    } catch (error) {
      this.log.warn(`error al cerrar el consumidor de Kafka: ${(error as Error).message}`);
    }
  }
}
