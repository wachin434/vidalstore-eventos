/**
 * Esquema `eventos` (dueño: vidalstore-eventos, rol eventos_app). Todo es
 * idempotente y se aplica al arrancar. El esquema `licencias` pertenece al
 * microservicio de licencias: aquí nunca se consulta.
 */
export const ESQUEMA_SQL = `
CREATE SCHEMA IF NOT EXISTS eventos;

CREATE TABLE IF NOT EXISTS eventos.eventos_auditoria (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  routing_key  text        NOT NULL,
  evento_id    uuid        NOT NULL UNIQUE,
  usuario_sub  text,
  payload      jsonb       NOT NULL,
  emitido_en   timestamptz NOT NULL,
  recibido_en  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_auditoria_routing_key ON eventos.eventos_auditoria (routing_key);
CREATE INDEX IF NOT EXISTS ix_auditoria_recibido_en ON eventos.eventos_auditoria (recibido_en);

CREATE TABLE IF NOT EXISTS eventos.notificaciones (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_id uuid NOT NULL UNIQUE,
  para      text NOT NULL,
  asunto    text NOT NULL,
  cuerpo    text NOT NULL,
  estado    text NOT NULL CHECK (estado IN ('enviada', 'fallida')),
  creada_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS eventos.mensajes_muertos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cola_origen      text        NOT NULL,
  routing_key      text        NOT NULL,
  motivo           text        NOT NULL,
  intentos         integer     NOT NULL DEFAULT 0,
  payload          text        NOT NULL,
  recibido_en      timestamptz NOT NULL DEFAULT now(),
  exchange_origen  text,
  evento_id        uuid,
  reprocesado_en   timestamptz,
  reprocesado_por  text
);
CREATE INDEX IF NOT EXISTS ix_muertos_recibido_en ON eventos.mensajes_muertos (recibido_en);
`;
