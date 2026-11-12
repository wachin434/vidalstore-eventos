import { Controller, Get } from '@nestjs/common';
import { PanelEnVivoService } from './panel-en-vivo.service';

/**
 * GET /panel/en-vivo: solo lo llama el gateway, por la red interna. No pide token: el gateway ya reviso que
 * quien pregunta es administrador, y este puerto no se publica fuera de la red de los servicios.
 */
@Controller('panel')
export class PanelEnVivoController {
  constructor(private readonly panel: PanelEnVivoService) {}

  @Get('en-vivo')
  enVivo() {
    return this.panel.enVivo();
  }
}
