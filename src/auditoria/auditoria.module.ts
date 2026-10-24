import { Module } from '@nestjs/common';
import { MensajeriaModule } from '../mensajeria/mensajeria.module';
import { PersistenciaModule } from '../persistencia/persistencia.module';
import { AuditoriaConsumer } from './auditoria.consumer';

@Module({ imports: [MensajeriaModule, PersistenciaModule], providers: [AuditoriaConsumer] })
export class AuditoriaModule {}
