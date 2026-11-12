import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { validarSobre } from '../contrato';
import { ConsumidorKafka } from '../consumidor-kafka';
import type { EventoDto } from '../evento.dto';
import { TOPICS } from '../topics';
import { HistorialNegocio } from './historial.negocio';

/** Consumer group vidalstore-historial: solo compras, hacia ventas_semana. Es el que se rebobina. */
@Injectable()
export class HistorialConsumidor extends ConsumidorKafka<EventoDto> {
  constructor(config: ConfigService, historial: HistorialNegocio) {
    super(config, { grupo: 'vidalstore-historial', topics: [TOPICS.compras], validar: validarSobre }, historial);
  }
}
