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

-- E2: tablas de lectura de los consumer groups de Kafka (todas idempotentes).
-- vidalstore-panel: una fila por evento; evento_id es la clave, asi que un duplicado no entra.
CREATE TABLE IF NOT EXISTS eventos.kpi_minuto (
  evento_id uuid        PRIMARY KEY,
  minuto    timestamptz NOT NULL,
  juego_id  text        NOT NULL,
  tipo      text        NOT NULL,
  monto_clp integer     NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_kpi_minuto_minuto ON eventos.kpi_minuto (minuto);

-- alertas e historial suman: el evento se registra aqui EN LA MISMA transaccion que suma.
CREATE TABLE IF NOT EXISTS eventos.eventos_procesados (
  grupo        text        NOT NULL,
  evento_id    uuid        NOT NULL,
  procesado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (grupo, evento_id)
);

-- vidalstore-alertas: partidas terminadas y en error por juego y ventana fija de 5 minutos (UTC).
CREATE TABLE IF NOT EXISTS eventos.ventanas_partida (
  juego_id   text        NOT NULL,
  ventana    timestamptz NOT NULL,
  terminadas integer     NOT NULL,
  en_error   integer     NOT NULL,
  PRIMARY KEY (juego_id, ventana)
);
CREATE TABLE IF NOT EXISTS eventos.alertas (
  juego_id       text        NOT NULL,
  ventana        timestamptz NOT NULL,
  terminadas     integer     NOT NULL,
  en_error       integer     NOT NULL,
  actualizada_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (juego_id, ventana)
);

-- vidalstore-historial: cada compra (para descontar su precio al revocarla) y el total por semana y juego.
CREATE TABLE IF NOT EXISTS eventos.ventas_vistas (
  licencia_id text    PRIMARY KEY,
  semana      date    NOT NULL,
  juego_id    text    NOT NULL,
  monto_clp   integer NOT NULL,
  revocada    boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS eventos.ventas_semana (
  semana             date    NOT NULL,
  juego_id           text    NOT NULL,
  unidades           integer NOT NULL,
  monto_clp          bigint  NOT NULL,
  revocadas          integer NOT NULL,
  monto_revocado_clp bigint  NOT NULL,
  PRIMARY KEY (semana, juego_id)
);

-- vidalstore-panel tambien lee vidalstore.catalogo (compactado): una fila por juego con su ultimo estado.
-- Se puede borrar y reconstruir entera releyendo el topic desde el offset 0 (ver docs/consumer-groups.md).
CREATE TABLE IF NOT EXISTS eventos.catalogo_vista (
  juego_id    text        PRIMARY KEY,
  titulo      text        NOT NULL,
  precio_clp  integer     NOT NULL,
  activo      boolean     NOT NULL,
  ultimo_tipo text        NOT NULL,
  evento_id   uuid        NOT NULL,
  emitido_en  timestamptz NOT NULL
);
`;
