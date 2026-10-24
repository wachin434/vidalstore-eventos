import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ErrorMensajeInvalido, esUuid } from '../mensajeria/errores';
import { Mensaje } from '../mensajeria/mensaje';
import { MensajeriaService } from '../mensajeria/mensajeria.service';
import { COLA_CORREOS } from '../mensajeria/topologia';
import { Notificacion } from './notificacion.entity';

/**
 * Consumidor de correos (cola.correos): registra la notificación. No hay
 * servidor SMTP real; el envío se simula con una línea de log y estado
 * 'enviada'. Idempotente por UNIQUE(evento_id).
 */
@Injectable()
export class CorreosConsumer implements OnModuleInit {
  private readonly logger = new Logger(CorreosConsumer.name);

  constructor(
    private readonly mensajeria: MensajeriaService,
    @InjectRepository(Notificacion)
    private readonly repo: Repository<Notificacion>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.mensajeria.consumir({
      cola: COLA_CORREOS,
      prefetch: 10,
      manejador: (m) => this.manejar(m),
    });
  }

  async manejar(mensaje: Mensaje): Promise<void> {
    const p = mensaje.payload as Record<string, string>;
    if (!esUuid(p.eventoId)) {
      throw new ErrorMensajeInvalido('el campo "eventoId" no es un UUID');
    }
    await this.repo.insert({
      eventoId: p.eventoId,
      para: p.para,
      asunto: p.asunto,
      cuerpo: p.cuerpo,
      estado: 'enviada',
    });
    this.logger.log(`Correo (simulado) a ${p.para}: ${p.asunto}`);
  }
}
