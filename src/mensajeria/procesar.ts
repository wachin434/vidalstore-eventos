import type { ConsumeMessage } from 'amqplib';
import { ErrorMensajeInvalido, esDuplicado } from './errores';
import { leerMensaje, Mensaje } from './mensaje';

export type Decision = 'ack' | 'nack-dlq';

export interface OpcionesReintento {
  intentos: number; // intentos totales (3)
  baseMs: number; // espera inicial (500 ms); la n-ésima espera es base * 2^(n-1)
  esperar: (ms: number) => Promise<void>;
}

export interface Bitacora {
  log(mensaje: string): void;
  warn(mensaje: string): void;
  error(mensaje: string): void;
}

export const REINTENTO_POR_DEFECTO: OpcionesReintento = {
  intentos: 3,
  baseMs: 500,
  esperar: (ms) => new Promise((r) => setTimeout(r, ms)),
};

/**
 * Decide qué hacer con un mensaje y devuelve 'ack' o 'nack-dlq'; quien llama
 * ejecuta canal.ack(msg) o canal.nack(msg, false, false).
 *
 *  - mal formado (o el manejador lanza ErrorMensajeInvalido): nack-dlq sin reintentos
 *  - duplicado (23505 sobre evento_id): ack (ya estaba procesado)
 *  - error transitorio: hasta 3 intentos con espera 500 * 2^(n-1) ms; si se
 *    agotan, nack-dlq
 *  - todo bien: ack, y solo DESPUÉS de terminar el trabajo
 */
export async function decidir(
  msg: ConsumeMessage,
  manejador: (m: Mensaje) => Promise<void>,
  bitacora: Bitacora,
  opciones: OpcionesReintento = REINTENTO_POR_DEFECTO,
): Promise<Decision> {
  let mensaje: Mensaje;
  try {
    mensaje = leerMensaje(msg);
  } catch (error) {
    bitacora.warn(`Mensaje mal formado, va a la DLQ sin reintento: ${(error as Error).message}`);
    return 'nack-dlq';
  }

  for (let intento = 1; intento <= opciones.intentos; intento++) {
    try {
      await manejador(mensaje);
      return 'ack';
    } catch (error) {
      if (error instanceof ErrorMensajeInvalido) {
        bitacora.warn(`Mensaje ${mensaje.eventoId} inválido, va a la DLQ sin reintento: ${error.message}`);
        return 'nack-dlq';
      }
      if (esDuplicado(error)) {
        bitacora.log(`Evento ${mensaje.eventoId} duplicado: ya estaba procesado, se confirma sin repetir`);
        return 'ack';
      }
      const detalle = (error as Error)?.message ?? String(error);
      if (intento >= opciones.intentos) {
        bitacora.error(
          `Mensaje ${mensaje.eventoId} agotó ${opciones.intentos} intentos (${detalle}), va a la DLQ`,
        );
        return 'nack-dlq';
      }
      const espera = opciones.baseMs * 2 ** (intento - 1);
      bitacora.warn(
        `Fallo transitorio en intento ${intento}/${opciones.intentos} del mensaje ${mensaje.eventoId} (${detalle}); reintento en ${espera} ms`,
      );
      await opciones.esperar(espera);
    }
  }
  return 'nack-dlq'; // inalcanzable; satisface al compilador
}
