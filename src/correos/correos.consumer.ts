import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MensajeriaService } from '../mensajeria/mensajeria.service';
import { COLA_CORREOS, RK_CORREO_ENVIAR } from '../mensajeria/topologia';
import { Notificacion } from './notificacion.entity';

interface PayloadCorreoEnviar {
  eventoId: string;
  tipo: typeof RK_CORREO_ENVIAR;
  destinatario: string;
  asunto: string;
  cuerpo: string;
}

@Injectable()
export class CorreosConsumer implements OnModuleInit {
  private readonly logger = new Logger(CorreosConsumer.name);

  constructor(
    private readonly mensajeria: MensajeriaService,
    @InjectRepository(Notificacion)
    private readonly notificacionesRepo: Repository<Notificacion>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.mensajeria.consumir(COLA_CORREOS, (payload) =>
      this.manejar(payload as PayloadCorreoEnviar),
    );
  }

  private async manejar(payload: PayloadCorreoEnviar): Promise<void> {
    const notificacion = this.notificacionesRepo.create({
      destinatario: payload.destinatario,
      asunto: payload.asunto,
      cuerpo: payload.cuerpo,
      enviado: false,
    });
    await this.notificacionesRepo.save(notificacion);

    this.logger.log(
      `Correo "enviado" a ${payload.destinatario}: ${payload.asunto}`,
    );
    notificacion.enviado = true;
    await this.notificacionesRepo.save(notificacion);
  }
}