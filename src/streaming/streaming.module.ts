import { Module } from '@nestjs/common';
import { AlertasModule } from './alertas/alertas.module';
import { HistorialModule } from './historial/historial.module';
import { PanelModule } from './panel/panel.module';

// Un modulo por consumer group (E2): cada uno con su clase de Kafka y su clase de negocio.
@Module({
  imports: [PanelModule, AlertasModule, HistorialModule],
})
export class StreamingModule {}
