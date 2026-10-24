import { Module } from '@nestjs/common';
import { MensajeriaModule } from '../mensajeria/mensajeria.module';
import { PersistenciaModule } from '../persistencia/persistencia.module';
import { DlqConsumer } from './dlq.consumer';

@Module({ imports: [MensajeriaModule, PersistenciaModule], providers: [DlqConsumer] })
export class DlqModule {}
