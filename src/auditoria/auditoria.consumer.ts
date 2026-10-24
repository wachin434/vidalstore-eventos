import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Mensaje } from '../mensajeria/mensaje';
import { MensajeriaService } from '../mensajeria/mensajeria.service';
import { COLA_AUDITORIA, RK_COMPRA_REALIZADA, RK_JUEGO_PUBLICADO, RK_LICENCIA_REVOCADA } from '../mensajeria/topologia';
import { EventoAuditoria } from './evento-auditoria.entity';

/** Quién actuó: compra → usuarioSub, revocación → revocadaPor, publicación → editorSub, otras → null. */
export function extraerUsuarioSub(routingKey: string, payload: Record<string, unknown>): string | null {
  const campo =
    routingKey === RK_COMPRA_REALIZADA ? 'usuarioSub'
    : routingKey === RK_LICENCIA_REVOCADA ? 'revocadaPor'
    : routingKey === RK_JUEGO_PUBLICADO ? 'editorSub'
    : null;
  const valor = campo ? payload[campo] : null;
  return typeof valor === 'string' ? valor : null;
}

/** Consumidor de auditoría (cola.auditoria, binding #): guarda cada evento una sola vez. */
@Injectable()
export class AuditoriaConsumer implements OnModuleInit {
  constructor(
    private readonly mensajeria: MensajeriaService,
    @InjectRepository(EventoAuditoria)
    private readonly repo: Repository<EventoAuditoria>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.mensajeria.consumir({
      cola: COLA_AUDITORIA,
      prefetch: 10,
      manejador: (m) => this.manejar(m),
    });
  }

  async manejar(mensaje: Mensaje): Promise<void> {
    // Si evento_id ya existe, Postgres responde 23505 y el consumidor lo trata como duplicado.
    await this.repo.insert({
      routingKey: mensaje.routingKey,
      eventoId: mensaje.eventoId,
      usuarioSub: extraerUsuarioSub(mensaje.routingKey, mensaje.payload),
      payload: mensaje.payload,
      emitidoEn: mensaje.emitidoEn ?? new Date(),
    });
  }
}
