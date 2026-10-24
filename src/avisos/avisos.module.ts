import { Module } from '@nestjs/common';
import { MensajeriaModule } from '../mensajeria/mensajeria.module';
import { AvisosConsumer } from './avisos.consumer';

@Module({ imports: [MensajeriaModule], providers: [AvisosConsumer] })
export class AvisosModule {}
