import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuditoriaModule } from './auditoria/auditoria.module';
import { AvisosModule } from './avisos/avisos.module';
import { CorreosModule } from './correos/correos.module';
import { DlqModule } from './dlq/dlq.module';
import { MensajeriaModule } from './mensajeria/mensajeria.module';
import { PersistenciaModule } from './persistencia/persistencia.module';
import { ReprocesoModule } from './reproceso/reproceso.module';
import { SaludModule } from './salud/salud.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PersistenciaModule,
    MensajeriaModule,
    AvisosModule,
    AuditoriaModule,
    CorreosModule,
    DlqModule,
    ReprocesoModule,
    SaludModule,
  ],
})
export class AppModule {}
