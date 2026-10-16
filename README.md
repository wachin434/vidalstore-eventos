# vidalstore-eventos

Microservicio NestJS que consume la mensajería de VidalStore (RabbitMQ) y
persiste sus efectos en Postgres. No expone rutas de negocio propias — solo
escucha colas y escribe en la base.

## Qué hace

- Consume `cola.licencias` → crea/revoca licencias según `compra.realizada` /
  `licencia.revocada`.
- Consume `cola.catalogo-eventos` → registra `juego.publicado` y encadena un
  comando `correo.enviar`.
- Consume `cola.correos` → "envía" (simula) la notificación y la guarda en
  `notificaciones`.
- Consume las 3 DLQ → archiva en `mensajes_muertos` cualquier mensaje que
  haya fallado tras reintentar o que llegara corrupto.

Cada evento se registra primero en `eventos_auditoria` (UNIQUE sobre
`evento_id`) para no procesar dos veces el mismo mensaje, dado que RabbitMQ
garantiza entrega "al menos una vez".

## Estructura

```
src/
├── mensajeria/        topología (exchanges/colas) + conexión a RabbitMQ
├── licencias/          consumidor + entidades Licencia / EventoAuditoria
├── catalogo-eventos/    consumidor de publicación de juegos
├── correos/            consumidor de notificaciones
├── dlq/                consumidor de las 3 colas muertas
└── persistencia/        configuración de TypeORM
```

## Puerto

`3010` (fijo, ver `src/main.ts`).

## Cómo correrlo

Este servicio no se levanta solo — depende del clúster RabbitMQ y Postgres
definidos en `vidalstore-plataforma`. Ver el `README.md` de ese repo para el
procedimiento completo de arranque (`docker compose up --build --wait`).

Variables de entorno esperadas: `RABBITMQ_URL`, `DATABASE_URL` (las define el
`compose.yml` de `vidalstore-plataforma`).