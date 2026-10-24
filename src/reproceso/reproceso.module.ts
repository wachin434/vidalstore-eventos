import { Module } from '@nestjs/common';
import { MensajeriaModule } from '../mensajeria/mensajeria.module';
import { PersistenciaModule } from '../persistencia/persistencia.module';
import { ReprocesoConsumer } from './reproceso.consumer';

@Module({ imports: [MensajeriaModule, PersistenciaModule], providers: [ReprocesoConsumer] })
export class ReprocesoModule {}
