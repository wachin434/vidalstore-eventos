import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { validarSobre } from '../contrato';
import { ConsumidorKafka } from '../consumidor-kafka';
import type { EventoDto } from '../evento.dto';
import { TOPICS } from '../topics';
import { PanelNegocio } from './panel.negocio';

/** Consumer group vidalstore-panel: actividad y compras, hacia kpi_minuto. */
@Injectable()
export class PanelConsumidor extends ConsumidorKafka<EventoDto> {
  constructor(config: ConfigService, panel: PanelNegocio) {
    super(
      config,
      { grupo: 'vidalstore-panel', topics: [TOPICS.actividad, TOPICS.compras], validar: validarSobre },
      panel,
    );
  }
}
