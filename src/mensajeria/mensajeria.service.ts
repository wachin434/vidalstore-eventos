import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import * as amqp from 'amqplib';
import { Mensaje } from './mensaje';
import { decidir, REINTENTO_POR_DEFECTO } from './procesar';
import { declararTopologia } from './topologia';

export interface OpcionesConsumo {
  cola: string; // viene de topologia.ts, nunca escrita en el consumidor
  prefetch: number; // explícito en cada consumidor
  manejador: (mensaje: Mensaje) => Promise<void>;
}

export interface OpcionesConsumoDlq {
  cola: string;
  prefetch: number;
  manejador: (msg: amqp.ConsumeMessage) => Promise<void>;
  esperaSiFallaMs?: number;
}

@Injectable()
export class MensajeriaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MensajeriaService.name);
  private conexion!: amqp.ChannelModel;
  private canalPublicacion!: amqp.ConfirmChannel;
  private listo = false;
  private cerrando = false;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const url = this.config.getOrThrow<string>('RABBITMQ_URL');
    this.conexion = await this.conectarConReintentos(url);
    this.conexion.on('error', (e) => this.logger.error(`Conexión RabbitMQ: ${e.message}`));
    this.conexion.on('close', () => this.alPerderConexion('se cerró la conexión con RabbitMQ'));

    // Canal de publicación con publisher confirms.
    this.canalPublicacion = await this.conexion.createConfirmChannel();
    this.canalPublicacion.on('error', (e) => this.logger.error(`Canal de publicación: ${e.message}`));
    await declararTopologia(this.canalPublicacion);
    this.listo = true;
    this.logger.log('RabbitMQ conectado y topología declarada');
  }

  async onModuleDestroy(): Promise<void> {
    this.cerrando = true;
    this.listo = false;
    try {
      await this.conexion?.close();
    } catch {
      // la conexión ya estaba cerrada
    }
  }

  estaListo(): boolean {
    return this.listo;
  }

  private async conectarConReintentos(url: string): Promise<amqp.ChannelModel> {
    const maximo = 30;
    for (let intento = 1; ; intento++) {
      try {
        return await amqp.connect(url);
      } catch (error) {
        if (intento >= maximo) throw error;
        this.logger.warn(`RabbitMQ no responde (intento ${intento}/${maximo}); reintento en 2 s`);
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }

  /**
   * Si se pierde la conexión, un canal o un consumidor, el proceso termina:
   * el orquestador (restart: unless-stopped) lo levanta de nuevo y vuelve a
   * declarar la topología y a consumir. Es más simple y más seguro que
   * reconstruir canales a mano.
   */
  private alPerderConexion(motivo: string): void {
    this.listo = false;
    if (this.cerrando) return;
    this.logger.error(`${motivo}; el servicio se reinicia`);
    process.exit(1);
  }

  /** Publica un objeto JSON y espera el confirm del broker. */
  publicar(
    exchange: string,
    routingKey: string,
    payload: unknown,
    eventoId: string = randomUUID(),
  ): Promise<string> {
    return this.publicarTexto(exchange, routingKey, JSON.stringify(payload), eventoId);
  }

  /** Publica texto tal cual (lo usa el reproceso con el payload original). */
  publicarTexto(
    exchange: string,
    routingKey: string,
    texto: string,
    eventoId: string = randomUUID(),
  ): Promise<string> {
    return new Promise((resolver, rechazar) => {
      this.canalPublicacion.publish(
        exchange,
        routingKey,
        Buffer.from(texto, 'utf8'),
        {
          contentType: 'application/json',
          persistent: true,
          headers: {
            'x-evento-id': eventoId,
            'x-emitido-en': new Date().toISOString(),
          },
        },
        (error) => (error ? rechazar(error) : resolver(eventoId)),
      );
    });
  }

  /** Consumidor de una cola de trabajo: ack manual, prefetch explícito y DLQ. */
  async consumir(opciones: OpcionesConsumo): Promise<void> {
    const { cola, prefetch, manejador } = opciones;
    const canal = await this.crearCanalConsumidor(cola, prefetch);
    const bitacora = new Logger(`Consumidor ${cola}`);
    await canal.consume(
      cola,
      (msg) => {
        if (!msg) {
          this.alPerderConexion(`el broker canceló el consumidor de ${cola}`);
          return;
        }
        void decidir(msg, manejador, bitacora, REINTENTO_POR_DEFECTO).then(
          (decision) => {
            try {
              if (decision === 'ack') canal.ack(msg);
              else canal.nack(msg, false, false); // sin requeue: va a la DLQ
            } catch (error) {
              bitacora.error(`No se pudo confirmar el mensaje: ${(error as Error).message}`);
            }
          },
        );
      },
      { noAck: false },
    );
    this.logger.log(`Consumiendo ${cola} (prefetch ${prefetch})`);
  }

  /**
   * Consumidor de una DLQ. Aquí el único requeue permitido: si el trabajo
   * falla (Postgres caído) se espera unos segundos y el mensaje se devuelve
   * a la propia DLQ, para no perder la última copia.
   */
  async consumirDlq(opciones: OpcionesConsumoDlq): Promise<void> {
    const { cola, prefetch, manejador } = opciones;
    const espera = opciones.esperaSiFallaMs ?? 5000;
    const canal = await this.crearCanalConsumidor(cola, prefetch);
    const bitacora = new Logger(`Consumidor ${cola}`);
    await canal.consume(
      cola,
      (msg) => {
        if (!msg) {
          this.alPerderConexion(`el broker canceló el consumidor de ${cola}`);
          return;
        }
        void (async () => {
          try {
            await manejador(msg);
            canal.ack(msg);
          } catch (error) {
            bitacora.error(
              `No se pudo archivar el mensaje muerto (${(error as Error).message}); se devuelve a la DLQ en ${espera} ms`,
            );
            await new Promise((r) => setTimeout(r, espera));
            try {
              canal.nack(msg, false, true);
            } catch (e) {
              bitacora.error(`No se pudo devolver el mensaje: ${(e as Error).message}`);
            }
          }
        })();
      },
      { noAck: false },
    );
    this.logger.log(`Consumiendo ${cola} (prefetch ${prefetch})`);
  }

  private async crearCanalConsumidor(cola: string, prefetch: number): Promise<amqp.Channel> {
    const canal = await this.conexion.createChannel();
    canal.on('error', (e) => this.logger.error(`Canal de ${cola}: ${e.message}`));
    canal.on('close', () => this.alPerderConexion(`se cerró el canal de ${cola}`));
    await canal.prefetch(prefetch);
    return canal;
  }
}
