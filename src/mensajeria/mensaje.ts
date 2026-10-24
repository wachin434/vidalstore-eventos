import type { ConsumeMessage } from 'amqplib';
import { ErrorMensajeInvalido, esUuid } from './errores';
import {
  RK_COMPRA_REALIZADA,
  RK_CORREO_ENVIAR,
  RK_DLQ_REPROCESAR,
  RK_JUEGO_PUBLICADO,
  RK_LICENCIA_REVOCADA,
} from './topologia';

/** Mensaje ya leído y con lo mínimo validado (JSON objeto + x-evento-id UUID). */
export interface Mensaje {
  routingKey: string;
  eventoId: string;
  emitidoEn: Date | null;
  payload: Record<string, unknown>;
  texto: string;
}

/** Campos obligatorios por routing key (contrato común del grupo). */
export const CAMPOS_OBLIGATORIOS: Record<string, string[]> = {
  [RK_COMPRA_REALIZADA]: ['licenciaId', 'juegoId', 'usuarioSub', 'adquiridaEn'],
  [RK_LICENCIA_REVOCADA]: ['licenciaId', 'juegoId', 'usuarioSub', 'revocadaPor', 'motivo'],
  [RK_JUEGO_PUBLICADO]: ['juegoId', 'titulo', 'editorSub'],
  [RK_CORREO_ENVIAR]: ['para', 'asunto', 'cuerpo', 'eventoId'],
  [RK_DLQ_REPROCESAR]: ['mensajeMuertoId', 'solicitadoPor'],
};

/** Campos que, siendo obligatorios, pueden venir como cadena vacía. */
const PUEDEN_ESTAR_VACIOS = new Set(['motivo']);

function textoDeHeader(valor: unknown): string | undefined {
  if (typeof valor === 'string') return valor;
  if (Buffer.isBuffer(valor)) return valor.toString('utf8');
  return undefined;
}

export function validarCampos(
  payload: Record<string, unknown>,
  campos: string[],
): void {
  for (const campo of campos) {
    const valor = payload[campo];
    if (typeof valor !== 'string') {
      throw new ErrorMensajeInvalido(`falta el campo obligatorio "${campo}" (cadena)`);
    }
    if (valor.trim() === '' && !PUEDEN_ESTAR_VACIOS.has(campo)) {
      throw new ErrorMensajeInvalido(`el campo "${campo}" está vacío`);
    }
  }
}

/**
 * Lee un mensaje entrante. Lanza ErrorMensajeInvalido si no es JSON objeto,
 * si x-evento-id falta o no es un UUID, o si falta un campo obligatorio de
 * su routing key (cuando el contrato define alguno).
 */
export function leerMensaje(msg: ConsumeMessage): Mensaje {
  const texto = msg.content.toString('utf8');
  let parseado: unknown;
  try {
    parseado = JSON.parse(texto);
  } catch {
    throw new ErrorMensajeInvalido('el cuerpo no es JSON válido');
  }
  if (parseado === null || typeof parseado !== 'object' || Array.isArray(parseado)) {
    throw new ErrorMensajeInvalido('el cuerpo JSON debe ser un objeto');
  }

  const eventoId = textoDeHeader(msg.properties.headers?.['x-evento-id']);
  if (!eventoId) {
    throw new ErrorMensajeInvalido('falta el header x-evento-id');
  }
  if (!esUuid(eventoId)) {
    throw new ErrorMensajeInvalido('el header x-evento-id no es un UUID');
  }

  const payload = parseado as Record<string, unknown>;
  const routingKey = msg.fields.routingKey;
  const campos = CAMPOS_OBLIGATORIOS[routingKey];
  if (campos) validarCampos(payload, campos);

  const emitido = textoDeHeader(msg.properties.headers?.['x-emitido-en']);
  const fecha = emitido ? new Date(emitido) : null;
  return {
    routingKey,
    eventoId,
    emitidoEn: fecha && !Number.isNaN(fecha.getTime()) ? fecha : null,
    payload,
    texto,
  };
}
