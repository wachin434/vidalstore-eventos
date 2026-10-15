import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventoAuditoria, Licencia } from '../licencias/licencia.entity';
import { Notificacion } from '../correos/notificacion.entity';
import { MensajeMuerto } from '../dlq/mensaje-muerto.entity';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      entities: [Licencia, EventoAuditoria, Notificacion, MensajeMuerto],
      synchronize: true,
    }),
    TypeOrmModule.forFeature([Licencia, EventoAuditoria, Notificacion, MensajeMuerto]),
  ],
  exports: [TypeOrmModule],
})
export class PersistenciaModule {}