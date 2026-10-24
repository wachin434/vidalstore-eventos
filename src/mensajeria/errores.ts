/**
 * Clasificación de errores de los consumidores.
 *
 *  - ErrorMensajeInvalido: el mensaje está mal formado. Reintentar no lo
 *    arregla, así que va directo a la DLQ (nack sin requeue).
 *  - Duplicado (23505 sobre evento_id): ya se procesó. Se registra y se hace ack.
 *  - Cualquier otro error se considera transitorio (Postgres caído, broker
 *    lento...) y se reintenta de forma acotada.
 */
export class ErrorMensajeInvalido extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = 'ErrorMensajeInvalido';
  }
}

export function esDuplicado(error: unknown): boolean {
  const e = error as {
    code?: string;
    constraint?: string;
    detail?: string;
    driverError?: { code?: string; constraint?: string; detail?: string };
  } | null;
  if (!e) return false;
  const fuente = e.driverError ?? e;
  const code = fuente.code ?? e.code;
  if (code !== '23505') return false;
  const texto = `${fuente.constraint ?? e.constraint ?? ''} ${fuente.detail ?? e.detail ?? ''}`;
  return /evento_id/.test(texto);
}

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const esUuid = (valor: unknown): valor is string =>
  typeof valor === 'string' && UUID_RE.test(valor);
