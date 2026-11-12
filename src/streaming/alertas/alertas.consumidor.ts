import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { validarSobre } from '../contrato';
import { ConsumidorKafka } from '../consumidor-kafka';
import type { EventoDto } from '../evento.dto';
import { TOPICS } from '../topics';
import { AlertasNegocio } from './alertas.negocio';

/** Consumer group vidalstore-alertas: solo actividad, hacia ventanas_partida y alertas. */
@Injectable()
export class AlertasConsumidor extends ConsumidorKafka<EventoDto> {
  constructor(config: ConfigService, alertas: AlertasNegocio) {
    super(config, { grupo: 'vidalstore-alertas', topics: [TOPICS.actividad], validar: validarSobre }, alertas);
  }
}
