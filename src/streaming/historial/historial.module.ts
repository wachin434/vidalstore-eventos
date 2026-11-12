import { Module } from '@nestjs/common';
import { PersistenciaModule } from '../../persistencia/persistencia.module';
import { HistorialConsumidor } from './historial.consumidor';
import { HistorialNegocio } from './historial.negocio';

@Module({
  imports: [PersistenciaModule],
  providers: [HistorialNegocio, HistorialConsumidor],
})
export class HistorialModule {}
