import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { MensajeriaService } from '../mensajeria/mensajeria.service';

type Estado = 'ok' | 'caido';

/** Única ruta HTTP del servicio: 200 si RabbitMQ y Postgres responden, 503 si no. */
@Controller('salud')
export class SaludController {
  constructor(
    private readonly mensajeria: MensajeriaService,
    private readonly dataSource: DataSource,
  ) {}

  @Get()
  async estado(): Promise<{ rabbitmq: Estado; postgres: Estado }> {
    const rabbitmq: Estado = this.mensajeria.estaListo() ? 'ok' : 'caido';
    let postgres: Estado = 'ok';
    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      postgres = 'caido';
    }
    const cuerpo = { rabbitmq, postgres };
    if (rabbitmq !== 'ok' || postgres !== 'ok') {
      throw new HttpException(cuerpo, HttpStatus.SERVICE_UNAVAILABLE);
    }
    return cuerpo;
  }
}
