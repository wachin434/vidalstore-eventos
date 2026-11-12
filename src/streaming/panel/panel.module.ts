import { Module } from '@nestjs/common';
import { PersistenciaModule } from '../../persistencia/persistencia.module';
import { PanelConsumidor } from './panel.consumidor';
import { PanelNegocio } from './panel.negocio';

@Module({
  imports: [PersistenciaModule],
  providers: [PanelNegocio, PanelConsumidor],
})
export class PanelModule {}
