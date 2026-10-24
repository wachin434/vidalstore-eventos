# vidalstore-eventos

Servicio NestJS que **consume** la mensajería de VidalStore (RabbitMQ) y guarda
sus efectos en el esquema `eventos` de Postgres. Su única ruta HTTP es
`GET /salud`. Declara la topología completa de RabbitMQ al arrancar.

## Consumidores (un archivo y un módulo Nest por dominio)

| Dominio | Cola (de `topologia.ts`) | Prefetch | Qué hace |
|---|---|---|---|
| `avisos/` | `cola.avisos` (`licencia.revocada`, `compra.realizada`) | 10 | Publica el comando `correo.enviar` con el `eventoId` del evento origen |
| `auditoria/` | `cola.auditoria` (`#`) | 10 | Inserta cada evento en `eventos.eventos_auditoria` |
| `correos/` | `cola.correos` (`correo.enviar`) | 10 | Registra la notificación en `eventos.notificaciones` (envío simulado) |
| `dlq/` | las 4 `*.dlq` | 1 | Loguea una línea y archiva en `eventos.mensajes_muertos` |
| `reproceso/` | `cola.reproceso` (`dlq.reprocesar`) | 1 | Republica un mensaje muerto en su exchange de origen (lo pide `vidalstore-admin`) |

Ningún consumidor escribe el nombre de su cola ni llama a `assertQueue`: todo
sale de `src/mensajeria/topologia.ts`.

## Reglas de confirmación (ack / nack)

- `noAck: false` y `prefetch` explícito. El `ack` se hace **después** de terminar el trabajo.
- Mensaje mal formado (no es JSON objeto, falta un campo obligatorio, `x-evento-id` ausente o no UUID):
  `nack(msg, false, false)` directo a la DLQ, sin reintento.
- Fallo transitorio (p. ej. Postgres no responde): 3 intentos dentro del consumidor,
  esperando 500 ms y 1000 ms entre ellos; si se agotan, `nack(msg, false, false)`.
- Duplicado (error `23505` sobre `evento_id`): se registra y se hace `ack`.
- `requeue: true` solo en el consumidor de DLQ y solo si Postgres no responde (espera 5 s y devuelve el mensaje a la misma DLQ).
- Entrega **al menos una vez**; la idempotencia sale de `UNIQUE(evento_id)`.

## Topología

Exchanges: `vidalstore.eventos` (topic), `vidalstore.comandos` (direct), `vidalstore.dlx` (direct).
Colas quorum durables; cada cola de trabajo tiene `x-dead-letter-exchange = vidalstore.dlx` y
`x-dead-letter-routing-key = <su nombre>`, y su DLQ se declara **antes**. Retención por cola
(overflow `reject-publish`, porque las quorum no admiten `reject-publish-dlx`) en `docs/politicas.md`
de `vidalstore-plataforma`. Con 2 nodos las quorum queues no toleran la caída de ninguno.

## Base de datos

Esquema `eventos`, rol `eventos_app`: `eventos_auditoria`, `notificaciones`, `mensajes_muertos`
(SQL en `src/persistencia/esquema.ts`, se aplica al arrancar y es idempotente). Este servicio
nunca consulta el esquema `licencias`. `synchronize` de TypeORM solo se activa con
`DB_SYNCHRONIZE=true` y fuera de producción; las credenciales salen de `DATABASE_URL` (variables de entorno).

## Variables de entorno

Ver `.env.example`: `RABBITMQ_URL`, `DATABASE_URL`, `AVISOS_DOMINIO`, `DB_SYNCHRONIZE`, `PORT`.

## Comandos

```bash
npm install
npm run build
npm test                 # pruebas unitarias (jest)
npm run start:dev
```

## Probar un mensaje envenenado

Con el sistema levantado (`docker compose up -d --build --wait` en `vidalstore-plataforma`):

```bash
docker compose exec eventos node scripts/publicar-envenenado.mjs
```

Publica un cuerpo que no es JSON en `vidalstore.eventos` (`compra.realizada`). Debe quedar
una fila por cada cola afectada (`cola.avisos.dlq` y `cola.auditoria.dlq`) en `eventos.mensajes_muertos`,
con la cola de origen, la routing key original, el motivo `rejected` y los intentos leídos de `x-death`.

## `GET /salud`

`{ "rabbitmq": "ok", "postgres": "ok" }` con 200; si alguno está caído, 503.
