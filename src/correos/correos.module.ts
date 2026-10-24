import { Module } from '@nestjs/common';
import { MensajeriaModule } from '../mensajeria/mensajeria.module';
import { PersistenciaModule } from '../persistencia/persistencia.module';
import { CorreosConsumer } from './correos.consumer';

@Module({ imports: [MensajeriaModule, PersistenciaModule], providers: [CorreosConsumer] })
export class CorreosModule {}
