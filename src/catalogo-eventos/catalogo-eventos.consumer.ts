import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MensajeriaService } from '../mensajeria/mensajeria.service';
import {
  COLA_CATALOGO_EVENTOS,
  EXCHANGE_COMANDOS,
  RK_CORREO_ENVIAR,
  RK_JUEGO_PUBLICADO,
} from '../mensajeria/topologia';
import { EventoAuditoria } from '../licencias/licencia.entity';

interface PayloadJuegoPublicado {
  eventoId: string;
  tipo: typeof RK_JUEGO_PUBLICADO;
  juegoId: string;
  titulo: string;
  autorEmail: string;
}

@Injectable()
export class CatalogoEventosConsumer implements OnModuleInit {
  private readonly logger = new Logger(CatalogoEventosConsumer.name);

  constructor(
    private readonly mensajeria: MensajeriaService,
    @InjectRepository(EventoAuditoria)
    private readonly auditoriaRepo: Repository<EventoAuditoria>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.mensajeria.consumir(COLA_CATALOGO_EVENTOS, (payload) =>
      this.manejar(payload as PayloadJuegoPublicado),
    );
  }

  private async manejar(payload: PayloadJuegoPublicado): Promise<void> {
    try {
      await this.auditoriaRepo.insert({
        eventoId: payload.eventoId,
        tipo: payload.tipo,
        payload: payload as unknown as Record<string, unknown>,
      });
    } catch (err: any) {
      if (err?.code === '23505') {
        this.logger.warn(`Evento duplicado ignorado: ${payload.eventoId}`);
        return;
      }
      throw err;
    }

    await this.mensajeria.publicar(EXCHANGE_COMANDOS, RK_CORREO_ENVIAR, {
      eventoId: `${payload.eventoId}-correo`,
      tipo: RK_CORREO_ENVIAR,
      destinatario: payload.autorEmail,
      asunto: `Tu juego "${payload.titulo}" ya está publicado`,
      cuerpo: `Hola, tu juego "${payload.titulo}" (id ${payload.juegoId}) ya está visible en el catálogo de VidalStore.`,
    });
  }
}