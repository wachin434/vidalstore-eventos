import { Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Consumer, MessagesStream, stringDeserializers } from '@platformatic/kafka';
import { setTimeout as esperar } from 'node:timers/promises';
import { EventoInvalido, type Mensaje } from './contrato';
import { DesvioDlt } from './desvio-dlt';
import { TOPICS_CON_DLT } from './topics';

/** Lo que devuelve la clase de negocio: si el evento cambio algo, si ya estaba, o si a este grupo no le sirve. */
export type Resultado = 'nuevo' | 'duplicado' | 'ignorado';

/** La clase de negocio de un grupo: recibe el evento ya validado y decide que hacer con el. No conoce Kafka. */
export interface Procesador<T> {
  procesar(evento: T): Promise<Resultado>;
}

export type OpcionesGrupo<T> = {
  grupo: string;
  topics: string[];
  // Convierte el mensaje en el evento validado, o lanza EventoInvalido.
  validar: (m: Mensaje) => T;
  // true: lee siempre desde el offset 0 (el catalogo se reconstruye entero en cada arranque).
  desdeElPrincipio?: boolean;
};

// Tres reintentos, cada uno esperando el doble. El largo del arreglo es el tope de reintentos y su suma (7 s),
// lo maximo que un evento frena su particion.
export const ESPERAS_MS = [1000, 2000, 4000];
const CADA_RESUMEN_MS = 10_000;

/**
 * La parte de Kafka de un consumer group: conexion, suscripcion y commit. Cada grupo es una subclase de una
 * linea con su nombre, sus topics y su clase de negocio.
 *
 * El orden que no pierde ni duplica: leer, validar, procesar (escribir en Postgres) y RECIEN despues confirmar
 * el offset, y el commit va al final de TODOS los caminos:
 *  - dato roto (JSON, campo que falta, version distinta de 1, DTO): al .dlt al tiro, sin reintentar, y commit;
 *  - falla del entorno (Postgres no responde): 3 reintentos de 1, 2 y 4 s; si sigue fallando, al .dlt con
 *    x-motivo postgres-no-responde y commit, para que la particion siga avanzando;
 *  - duplicado: commit sin escribir.
 * Si Kafka no confirma la publicacion en el .dlt, no hay commit: el evento se vuelve a leer.
 */
export abstract class ConsumidorKafka<T> implements OnApplicationBootstrap, OnModuleDestroy {
  protected readonly log: Logger;
  private consumidor?: Consumer<string, string, string, string>;
  private flujo?: MessagesStream<string, string, string, string>;
  private reloj?: NodeJS.Timeout;
  private cerrando = false;
  private readonly cuenta = { nuevos: 0, duplicados: 0, ignorados: 0, invalidos: 0, desviados: 0 };
  private ultimoResumen = '';
  private readonly desvio: DesvioDlt;

  protected constructor(
    private readonly config: ConfigService,
    private readonly opciones: OpcionesGrupo<T>,
    private readonly negocio: Procesador<T>,
  ) {
    this.log = new Logger(opciones.grupo);
    this.desvio = new DesvioDlt(config);
  }

  // OnApplicationBootstrap y no OnModuleInit: asi el esquema de Postgres ya esta aplicado cuando se empieza a leer.
  async onApplicationBootstrap(): Promise<void> {
    const brokers = this.config.get<string>('KAFKA_BROKERS');
    if (!brokers) {
      this.log.error('KAFKA_BROKERS no esta definida: el consumidor de Kafka no arranca');
      return;
    }

    try {
      this.consumidor = new Consumer({
        groupId: this.opciones.grupo,
        clientId: 'vidalstore-eventos',
        bootstrapBrokers: brokers.split(',').map((b) => b.trim()),
        deserializers: stringDeserializers,
      });
      this.flujo = await this.consumidor.consume({
        topics: this.opciones.topics,
        autocommit: false, // el offset se confirma a mano, despues de escribir
        mode: this.opciones.desdeElPrincipio ? 'earliest' : 'committed',
        fallbackMode: 'earliest', // grupo nuevo: parte desde el inicio del topic
      });
    } catch (error) {
      this.log.error(`no se pudo iniciar el consumidor de Kafka: ${(error as Error).message}`);
      return;
    }

    this.log.log(`grupo ${this.opciones.grupo} leyendo ${this.opciones.topics.join(' y ')}`);
    this.reloj = setInterval(() => this.resumir(), CADA_RESUMEN_MS);
    void this.leer(); // sin await: si no, Nest no termina de arrancar
  }

  private async leer(): Promise<void> {
    try {
      for await (const m of this.flujo!) {
        const donde = `${m.topic}[${m.partition}]@${m.offset}`;
        let evento: T;
        try {
          evento = this.opciones.validar(m);
        } catch (error) {
          if (!(error instanceof EventoInvalido)) throw error;
          this.cuenta.invalidos++;
          this.log.warn(`${donde} INVALIDO (${error.codigo}): ${error.message}`);
          await this.desviar(m, error.codigo, error.message); // sin reintentar: el value es el mismo en cada intento
          await m.commit();
          continue;
        }
        const resultado = await this.procesarConTope(evento, donde);
        if (resultado === undefined) return; // se esta cerrando: sin commit, otro lo relee
        if (resultado instanceof Error) {
          // Se agotaron los reintentos: no se pierde, queda en el .dlt, y la particion sigue.
          await this.desviar(m, 'postgres-no-responde', resultado.message);
          await m.commit();
          continue;
        }
        if (resultado === 'nuevo') this.cuenta.nuevos++;
        if (resultado === 'ignorado') this.cuenta.ignorados++;
        if (resultado === 'duplicado') {
          this.cuenta.duplicados++;
          this.log.warn(`${donde} DUPLICADO: ya estaba procesado, no suma`);
        }
        await m.commit(); // recien ahora: lo escrito ya esta en Postgres
      }
    } catch (error) {
      if (!this.cerrando) this.log.error(`el consumidor se detuvo: ${(error as Error).message}`);
    }
  }

  // Reintenta lo que puede arreglarse solo (Postgres caido), con tope. Devuelve el error, no lo lanza: quien llama
  // decide desviarlo al .dlt. Si se lanzara, el consumidor completo se caeria por un Postgres caido.
  private async procesarConTope(evento: T, donde: string): Promise<Resultado | Error | undefined> {
    for (let intento = 0; !this.cerrando; intento++) {
      try {
        return await this.negocio.procesar(evento);
      } catch (error) {
        if (intento === ESPERAS_MS.length) return error as Error;
        this.log.error(
          `${donde} reintento ${intento + 1} de ${ESPERAS_MS.length} en ${ESPERAS_MS[intento] / 1000} s: ${(error as Error).message}`,
        );
        await esperar(ESPERAS_MS[intento]);
      }
    }
    return undefined;
  }

  // Publica en el .dlt si el topic lo tiene (el catalogo no). Si Kafka no confirma, lanza y no hay commit.
  private async desviar(m: Mensaje, motivo: string, detalle: string): Promise<void> {
    if (!TOPICS_CON_DLT.includes(m.topic)) return;
    await this.desvio.desviar(m, this.opciones.grupo, motivo, detalle);
    this.cuenta.desviados++;
  }

  // Una linea cada 10 s, solo si cambio algo: lo que se ve en `docker compose logs vidalstore-eventos`.
  private resumir(): void {
    const { nuevos, duplicados, ignorados, invalidos, desviados } = this.cuenta;
    const texto = `desde el arranque: ${nuevos} nuevos, ${duplicados} duplicados, ${ignorados} ignorados, ${invalidos} invalidos, ${desviados} al .dlt`;
    if (texto === this.ultimoResumen || nuevos + duplicados + ignorados + invalidos + desviados === 0) return;
    this.ultimoResumen = texto;
    this.log.log(texto);
  }

  // Con app.enableShutdownHooks() en main.ts. close() deja el grupo al tiro: el siguiente arranque, o el
  // reset de offsets, no espera a que venza la sesion del consumidor.
  async onModuleDestroy(): Promise<void> {
    this.cerrando = true;
    if (this.reloj) clearInterval(this.reloj);
    this.resumir();
    try {
      await this.flujo?.close();
      await this.consumidor?.close();
      await this.desvio.cerrar();
    } catch (error) {
      this.log.warn(`error al cerrar el consumidor de Kafka: ${(error as Error).message}`);
    }
  }
}
