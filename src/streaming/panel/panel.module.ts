import { Module } from '@nestjs/common';
import { PersistenciaModule } from '../../persistencia/persistencia.module';
import { PanelEnVivoController } from './panel-en-vivo.controller';
import { PanelEnVivoService } from './panel-en-vivo.service';
import { PanelConsumidor } from './panel.consumidor';
import { PanelNegocio } from './panel.negocio';

@Module({
  imports: [PersistenciaModule],
  controllers: [PanelEnVivoController],
  providers: [PanelNegocio, PanelConsumidor, PanelEnVivoService],
})
export class PanelModule {}
