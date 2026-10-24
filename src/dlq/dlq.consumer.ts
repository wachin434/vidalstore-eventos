import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { ConsumeMessage } from 'amqplib';
import { Repository } from 'typeorm';
import { MensajeriaService } from '../mensajeria/mensajeria.service';
import {
  COLA_AUDITORIA_DLQ,
  COLA_AVISOS_DLQ,
  COLA_CORREOS_DLQ,
  COLA_REPROCESO_DLQ,
} from '../mensajeria/topologia';
import { MensajeMuerto } from './mensaje-muerto.entity';
import { leerMuerte } from './x-death';

/**
 * Consumidor de las DLQ: por cada mensaje muerto escribe UNA línea de log
 * (cola de origen, routing key original, motivo e intentos, de x-death[0]),
 * lo archiva en eventos.mensajes_muertos con el payload crudo y confirma.
 * Si Postgres no responde, espera y lo devuelve a la DLQ (requeue).
 */
@Injectable()
export class DlqConsumer implements OnModuleInit {
  private readonly logger = new Logger(DlqConsumer.name);

  constructor(
    private readonly mensajeria: MensajeriaService,
    @InjectRepository(MensajeMuerto)
    private readonly repo: Repository<MensajeMuerto>,
  ) {}

  async onModuleInit(): Promise<void> {
    for (const cola of [COLA_AVISOS_DLQ, COLA_AUDITORIA_DLQ, COLA_CORREOS_DLQ, COLA_REPROCESO_DLQ]) {
      await this.mensajeria.consumirDlq({
        cola,
        prefetch: 1,
        manejador: (msg) => this.archivar(msg),
      });
    }
  }

  async archivar(msg: ConsumeMessage): Promise<void> {
    const muerte = leerMuerte(msg);
    if (!msg.fields.redelivered) this.logger.warn(
      `Mensaje muerto: cola=${muerte.colaOrigen} routingKey=${muerte.routingKey} motivo=${muerte.motivo} intentos=${muerte.intentos}`,
    );
    await this.repo.insert({
      colaOrigen: muerte.colaOrigen,
      routingKey: muerte.routingKey,
      motivo: muerte.motivo,
      intentos: muerte.intentos,
      payload: msg.content.toString('utf8'),
      exchangeOrigen: muerte.exchangeOrigen,
      eventoId: muerte.eventoId,
    });
  }
}
