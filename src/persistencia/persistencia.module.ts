import { Global, Injectable, Logger, Module, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { EventoAuditoria } from '../auditoria/evento-auditoria.entity';
import { Notificacion } from '../correos/notificacion.entity';
import { MensajeMuerto } from '../dlq/mensaje-muerto.entity';
import { ESQUEMA_SQL } from './esquema';

/** Aplica el esquema `eventos` (idempotente) antes de que arranquen los consumidores. */
@Injectable()
export class InicializadorEsquema implements OnModuleInit {
  private readonly logger = new Logger(InicializadorEsquema.name);
  constructor(private readonly dataSource: DataSource) {}

  async onModuleInit(): Promise<void> {
    await this.dataSource.query(ESQUEMA_SQL);
    this.logger.log('Esquema "eventos" verificado');
  }
}

@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const produccion = config.get<string>('NODE_ENV') === 'production';
        return {
          type: 'postgres' as const,
          // Las credenciales vienen de DATABASE_URL (.env), nunca del código.
          url: config.getOrThrow<string>('DATABASE_URL'),
          entities: [EventoAuditoria, Notificacion, MensajeMuerto],
          // synchronize SOLO en desarrollo: en producción el esquema lo
          // aplica InicializadorEsquema con SQL explícito.
          synchronize: !produccion && config.get<string>('DB_SYNCHRONIZE') === 'true',
        };
      },
    }),
    TypeOrmModule.forFeature([EventoAuditoria, Notificacion, MensajeMuerto]),
  ],
  providers: [InicializadorEsquema],
  exports: [TypeOrmModule],
})
export class PersistenciaModule {}
