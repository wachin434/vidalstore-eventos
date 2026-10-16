import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as amqp from 'amqplib';
import { MensajeriaService } from '../mensajeria/mensajeria.service';
import {
  COLA_CATALOGO_EVENTOS_DLQ,
  COLA_CORREOS_DLQ,
  COLA_LICENCIAS_DLQ,
} from '../mensajeria/topologia';
import { MensajeMuerto } from './mensaje-muerto.entity';

@Injectable()
export class DlqConsumer implements OnModuleInit {
  private readonly logger = new Logger(DlqConsumer.name);

  constructor(
    private readonly mensajeria: MensajeriaService,
    @InjectRepository(MensajeMuerto)
    private readonly mensajesMuertosRepo: Repository<MensajeMuerto>,
  ) {}

  async onModuleInit(): Promise<void> {
    for (const cola of [
      COLA_LICENCIAS_DLQ,
      COLA_CATALOGO_EVENTOS_DLQ,
      COLA_CORREOS_DLQ,
    ]) {
      await this.consumirDlq(cola);
    }
  }

  private async consumirDlq(cola: string): Promise<void> {
    await this.mensajeria.consumirSinReintento(cola, async (msg: amqp.ConsumeMessage) => {
      const contenidoCrudo = msg.content.toString();
      let payload: Record<string, unknown> | null = null;
      try {
        payload = JSON.parse(contenidoCrudo);
      } catch {
        payload = null;
      }

      await this.mensajesMuertosRepo.save(
        this.mensajesMuertosRepo.create({
          cola,
          payload,
          contenidoCrudo,
          motivo: 'Mensaje cayó a la DLQ tras agotar reintentos o por payload inválido',
        }),
      );

      this.logger.warn(`Mensaje muerto archivado desde ${cola}`);
    });
  }
}