import { Module } from '@nestjs/common';
import { PersistenciaModule } from '../../persistencia/persistencia.module';
import { AlertasConsumidor } from './alertas.consumidor';
import { AlertasNegocio } from './alertas.negocio';

@Module({
  imports: [PersistenciaModule],
  providers: [AlertasNegocio, AlertasConsumidor],
})
export class AlertasModule {}
