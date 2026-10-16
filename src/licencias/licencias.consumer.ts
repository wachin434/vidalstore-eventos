import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MensajeriaService } from '../mensajeria/mensajeria.service';
import {
  COLA_LICENCIAS,
  RK_COMPRA_REALIZADA,
  RK_LICENCIA_REVOCADA,
} from '../mensajeria/topologia';
import { EventoAuditoria, Licencia } from './licencia.entity';

interface PayloadCompraRealizada {
  eventoId: string;
  tipo: typeof RK_COMPRA_REALIZADA;
  usuarioSub: string;
  juegoId: string;
}

interface PayloadLicenciaRevocada {
  eventoId: string;
  tipo: typeof RK_LICENCIA_REVOCADA;
  usuarioSub: string;
  juegoId: string;
}

type PayloadEntrante = PayloadCompraRealizada | PayloadLicenciaRevocada;

@Injectable()
export class LicenciasConsumer implements OnModuleInit {
  private readonly logger = new Logger(LicenciasConsumer.name);

  constructor(
    private readonly mensajeria: MensajeriaService,
    @InjectRepository(Licencia)
    private readonly licenciasRepo: Repository<Licencia>,
    @InjectRepository(EventoAuditoria)
    private readonly auditoriaRepo: Repository<EventoAuditoria>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.mensajeria.consumir(COLA_LICENCIAS, (payload) =>
      this.manejar(payload as PayloadEntrante),
    );
  }

  private async manejar(payload: PayloadEntrante): Promise<void> {

    try {
      await this.auditoriaRepo.insert({
        eventoId: payload.eventoId,
        tipo: payload.tipo,
        payload: payload as unknown as Record<string, unknown>,
      });
    } catch (err: any) {
      if (err?.code === '23505') {
        this.logger.warn(`Evento duplicado ignorado: ${payload.eventoId}`);
        return;
      }
      throw err;
    }

    if (payload.tipo === RK_COMPRA_REALIZADA) {
      await this.licenciasRepo.insert({
        usuarioSub: payload.usuarioSub,
        juegoId: payload.juegoId,
        estado: 'activa',
      });

      return;
    }

    await this.licenciasRepo.update(
      { usuarioSub: payload.usuarioSub, juegoId: payload.juegoId, estado: 'activa' },
      { estado: 'revocada', revocadoEn: new Date() },
    );
  }
}