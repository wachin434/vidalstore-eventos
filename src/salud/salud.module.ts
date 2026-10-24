import { Module } from '@nestjs/common';
import { MensajeriaModule } from '../mensajeria/mensajeria.module';
import { PersistenciaModule } from '../persistencia/persistencia.module';
import { SaludController } from './salud.controller';

@Module({ imports: [MensajeriaModule, PersistenciaModule], controllers: [SaludController] })
export class SaludModule {}
