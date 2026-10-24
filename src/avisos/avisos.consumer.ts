import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Mensaje } from '../mensajeria/mensaje';
import { MensajeriaService } from '../mensajeria/mensajeria.service';
import { COLA_AVISOS, EXCHANGE_COMANDOS, RK_COMPRA_REALIZADA, RK_CORREO_ENVIAR, RK_LICENCIA_REVOCADA } from '../mensajeria/topologia';

export interface CorreoPorEnviar {
  para: string;
  asunto: string;
  cuerpo: string;
  eventoId: string;
}

/** Arma el comando correo.enviar a partir de un evento. El eventoId es el del evento origen. */
export function construirCorreo(mensaje: Mensaje, dominio: string): CorreoPorEnviar {
  const p = mensaje.payload as Record<string, string>;
  const para = `${p.usuarioSub}@${dominio}`;
  if (mensaje.routingKey === RK_COMPRA_REALIZADA) {
    return {
      para,
      asunto: 'Compra confirmada',
      cuerpo: `Tu licencia ${p.licenciaId} del juego ${p.juegoId} quedó activa desde ${p.adquiridaEn}.`,
      eventoId: mensaje.eventoId,
    };
  }
  return {
    para,
    asunto: 'Licencia revocada',
    cuerpo: `Se revocó tu licencia ${p.licenciaId} del juego ${p.juegoId}. Motivo: ${p.motivo || 'sin motivo informado'}.`,
    eventoId: mensaje.eventoId,
  };
}

/**
 * Consumidor de avisos (cola.avisos): convierte compra.realizada y
 * licencia.revocada en un comando correo.enviar. No toca la base de datos:
 * la idempotencia la da UNIQUE(evento_id) en notificaciones, porque el
 * comando conserva el eventoId del evento origen.
 */
@Injectable()
export class AvisosConsumer implements OnModuleInit {
  private readonly dominio: string;

  constructor(
    private readonly mensajeria: MensajeriaService,
    config: ConfigService,
  ) {
    this.dominio = config.get<string>('AVISOS_DOMINIO') ?? 'avisos.vidalstore.local';
  }

  async onModuleInit(): Promise<void> {
    await this.mensajeria.consumir({
      cola: COLA_AVISOS,
      prefetch: 10,
      manejador: (m) => this.manejar(m),
    });
  }

  async manejar(mensaje: Mensaje): Promise<void> {
    if (mensaje.routingKey !== RK_COMPRA_REALIZADA && mensaje.routingKey !== RK_LICENCIA_REVOCADA) {
      return; // el binding solo trae estas dos; cualquier otra se confirma sin hacer nada
    }
    const correo = construirCorreo(mensaje, this.dominio);
    // El comando tiene su propio x-evento-id; el eventoId del evento origen va en el cuerpo.
    await this.mensajeria.publicar(EXCHANGE_COMANDOS, RK_CORREO_ENVIAR, correo);
  }
}
