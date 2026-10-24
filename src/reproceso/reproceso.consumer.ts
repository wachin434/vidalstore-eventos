import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { MensajeMuerto } from '../dlq/mensaje-muerto.entity';
import { ErrorMensajeInvalido, esUuid } from '../mensajeria/errores';
import { Mensaje } from '../mensajeria/mensaje';
import { MensajeriaService } from '../mensajeria/mensajeria.service';
import { COLA_REPROCESO } from '../mensajeria/topologia';

/**
 * Reproceso (solo grupos de 3): atiende dlq.reprocesar {mensajeMuertoId,
 * payloadCorregido?, solicitadoPor}. Republica el mensaje muerto en su
 * exchange de origen con la routing key original. Si no tenía un
 * x-evento-id válido se genera uno y se guarda en la fila ANTES de
 * republicar, de modo que todos los reprocesos reutilizan el mismo id y la
 * idempotencia (UNIQUE evento_id) evita duplicados.
 */
@Injectable()
export class ReprocesoConsumer implements OnModuleInit {
  private readonly logger = new Logger(ReprocesoConsumer.name);

  constructor(
    private readonly mensajeria: MensajeriaService,
    @InjectRepository(MensajeMuerto)
    private readonly repo: Repository<MensajeMuerto>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.mensajeria.consumir({
      cola: COLA_REPROCESO,
      prefetch: 1,
      manejador: (m) => this.manejar(m),
    });
  }

  async manejar(mensaje: Mensaje): Promise<void> {
    const { mensajeMuertoId, solicitadoPor, payloadCorregido } = mensaje.payload as {
      mensajeMuertoId: string;
      solicitadoPor: string;
      payloadCorregido?: unknown;
    };
    if (!esUuid(mensajeMuertoId)) {
      throw new ErrorMensajeInvalido('"mensajeMuertoId" no es un UUID');
    }
    const fila = await this.repo.findOneBy({ id: mensajeMuertoId });
    if (!fila) {
      throw new ErrorMensajeInvalido(`no existe el mensaje muerto ${mensajeMuertoId}`);
    }
    if (!fila.exchangeOrigen) {
      throw new ErrorMensajeInvalido('el mensaje muerto no registra su exchange de origen');
    }

    let eventoId = fila.eventoId;
    if (!esUuid(eventoId)) {
      eventoId = randomUUID();
      await this.repo.update({ id: fila.id }, { eventoId }); // se guarda antes de republicar
    }

    const texto =
      payloadCorregido !== undefined && payloadCorregido !== null
        ? JSON.stringify(payloadCorregido)
        : fila.payload;

    await this.mensajeria.publicarTexto(fila.exchangeOrigen, fila.routingKey, texto, eventoId);
    await this.repo.update(
      { id: fila.id },
      { reprocesadoEn: new Date(), reprocesadoPor: solicitadoPor },
    );
    this.logger.log(
      `Mensaje muerto ${fila.id} republicado en ${fila.exchangeOrigen} (${fila.routingKey}) por ${solicitadoPor}`,
    );
  }
}
