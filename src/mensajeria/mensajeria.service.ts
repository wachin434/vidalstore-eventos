import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as amqp from 'amqplib';
import { declararTopologia } from './topologia';

@Injectable()
export class MensajeriaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MensajeriaService.name);
  private conexion!: amqp.ChannelModel;
  private canalPublicacion!: amqp.ConfirmChannel;
  private readonly listo: Promise<void>;

  constructor() {
    this.listo = this.conectar();
  }

  private async conectar(): Promise<void> {
    const url = process.env.RABBITMQ_URL ?? 'amqp://localhost:5672';
    this.conexion = await amqp.connect(url);

    this.conexion.on('error', (err) =>
      this.logger.error(`Conexión RabbitMQ perdida: ${err.message}`),
    );

    this.canalPublicacion = await this.conexion.createConfirmChannel();
    await declararTopologia(this.canalPublicacion);

    this.logger.log('Topología de mensajería declarada correctamente');
  }

  async onModuleInit(): Promise<void> {
    await this.listo;
  }

  async onModuleDestroy(): Promise<void> {
    await this.canalPublicacion?.close();
    await this.conexion?.close();
  }

  async publicar(
    exchange: string,
    routingKey: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await this.listo;
    const buffer = Buffer.from(JSON.stringify(payload));
    await new Promise<void>((resolve, reject) => {
      this.canalPublicacion.publish(
        exchange,
        routingKey,
        buffer,
        { contentType: 'application/json', persistent: true },
        (err) => (err ? reject(err) : resolve()),
      );
    });
  }

  async consumir(
    cola: string,
    manejador: (payload: any) => Promise<void>,
  ): Promise<void> {
    await this.listo;
    const canal = await this.conexion.createChannel();
    await canal.prefetch(10);

    await canal.consume(cola, async (msg) => {
      if (!msg) return;

      let payload: any;
      try {
        payload = JSON.parse(msg.content.toString());
      } catch {
        this.logger.warn(`Mensaje malformado en ${cola}, va directo a DLQ`);
        canal.nack(msg, false, false);
        return;
      }

      const esReintento = msg.properties.headers?.['x-reintento'] === true;

      try {
        await manejador(payload);
        canal.ack(msg);
      } catch (err) {
        this.logger.error(
          `Falló el manejo de mensaje en ${cola} (reintento=${esReintento}): ${(err as Error).message}`,
        );

        if (esReintento) {
          // Ya se reintentó una vez y volvió a fallar: recién ahora cae a la DLQ.
          canal.nack(msg, false, false);
          return;
        }

        // Primer fallo: saca el original de la cola SIN mandarlo a la DLQ
        // (nack con requeue=false dispararía el dead-letter-exchange de la cola,
        // dejando un registro falso en mensajes_muertos aunque el reintento funcione)
        // y encola una copia marcada para reintento.
        canal.ack(msg);
        await this.publicarConHeaderReintento(cola, msg);
      }
    });
  }

  async consumirSinReintento(
    cola: string,
    manejador: (msg: amqp.ConsumeMessage) => Promise<void>,
  ): Promise<void> {
    await this.listo;
    const canal = await this.conexion.createChannel();
    await canal.prefetch(10);

    await canal.consume(cola, async (msg) => {
      if (!msg) return;
      try {
        await manejador(msg);
        canal.ack(msg);
      } catch (err) {
        this.logger.error(
          `Falló el archivado de mensaje muerto en ${cola}: ${(err as Error).message}`,
        );
        canal.nack(msg, false, true);
      }
    });
  }

  private async publicarConHeaderReintento(
    cola: string,
    msg: amqp.ConsumeMessage,
  ): Promise<void> {
    const canal = this.canalPublicacion;
    canal.sendToQueue(cola, msg.content, {
      ...msg.properties,
      headers: { ...msg.properties.headers, 'x-reintento': true },
    });
  }

  get canal(): amqp.ConfirmChannel {
    return this.canalPublicacion;
  }
}
