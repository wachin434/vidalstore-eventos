import type { Message } from '@platformatic/kafka';
import type { EventoDto } from './evento.dto';
import { validarEvento } from './validar-evento';

export type Mensaje = Message<string, string, string, string>;

/** Un mensaje que no cumple el contrato: no se reintenta, se desvia al .dlt con su codigo y se confirma. */
export class EventoInvalido extends Error {
  constructor(
    message: string,
    readonly codigo: string = 'dto-invalido',
  ) {
    super(message);
  }
}

/**
 * El contrato de vidalstore.actividad y vidalstore.compras: convierte el value del mensaje en el evento
 * validado (sobre y DTO de su tipo), o lanza EventoInvalido con el motivo. No sabe nada de Kafka mas alla del
 * value, ni de Postgres.
 */
export function validarSobre(m: Mensaje): EventoDto {
  const resultado = validarEvento(m.value);
  if (!resultado.ok || !resultado.evento) {
    throw new EventoInvalido(resultado.motivo ?? 'el evento no cumple el contrato', resultado.codigo);
  }
  return resultado.evento;
}
