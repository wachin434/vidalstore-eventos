import { Module } from '@nestjs/common';
import { MensajeriaService } from './mensajeria/mensajeria.service';
import { PersistenciaModule } from './persistencia/persistencia.module';
import { LicenciasConsumer } from './licencias/licencias.consumer';
import { CatalogoEventosConsumer } from './catalogo-eventos/catalogo-eventos.consumer';
import { CorreosConsumer } from './correos/correos.consumer';
import { DlqConsumer } from './dlq/dlq.consumer';

@Module({
  imports: [PersistenciaModule],
  providers: [
    MensajeriaService,
    LicenciasConsumer,
    CatalogoEventosConsumer,
    CorreosConsumer,
    DlqConsumer,
  ],
})
export class AppModule {}