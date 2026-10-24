// Publica un mensaje "envenenado" (cuerpo que no es JSON) en vidalstore.eventos
// con routing key compra.realizada. Debe terminar en cola.avisos.dlq y
// cola.auditoria.dlq, sin reintentos, y quedar archivado en eventos.mensajes_muertos.
//
// Uso (desde el host):   RABBITMQ_URL=amqp://usuario:clave@localhost:5672 node scripts/publicar-envenenado.mjs
// Dentro del contenedor: docker compose exec eventos node scripts/publicar-envenenado.mjs
import { randomUUID } from 'node:crypto';
import amqp from 'amqplib';

const url = process.env.RABBITMQ_URL;
if (!url) {
  console.error('Falta RABBITMQ_URL (amqp://usuario:clave@host:5672).');
  process.exit(1);
}

const conexion = await amqp.connect(url);
const canal = await conexion.createConfirmChannel();
const eventoId = randomUUID();

canal.publish(
  'vidalstore.eventos',
  'compra.realizada',
  Buffer.from('{esto no es json'),
  {
    contentType: 'application/json',
    persistent: true,
    headers: { 'x-evento-id': eventoId, 'x-emitido-en': new Date().toISOString() },
  },
  async (error) => {
    if (error) console.error('RabbitMQ no confirmó el mensaje:', error.message);
    else console.log(`Mensaje envenenado publicado (x-evento-id ${eventoId}).`);
    await conexion.close();
    process.exit(error ? 1 : 0);
  },
);
