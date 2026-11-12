import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { Procesador, Resultado } from '../consumidor-kafka';
import type { EventoDto } from '../evento.dto';
import { ventanaDe5MinutosDe } from '../ventanas';

// La regla: mas del 20% de las partidas terminadas de un juego en error, en una ventana fija de 5 minutos.
export const UMBRAL_ERROR = 0.2;
// Y al menos 3 terminadas en la ventana. Con menos, una sola en error ya pasa el 20% (1 de 1 es 100%): en el
// dataset eso dispara cuatro ventanas de 1 o 2 terminadas que no son una racha. Con minimo 3 solo dispara el
// juego 1328670, de 21:30 a 21:35 (68 de 69). Justificado en vidalstore-plataforma/docs/consumer-groups.md.
export const MINIMO_TERMINADAS = 3;

const GRUPO = 'vidalstore-alertas';

/**
 * Lo que hace vidalstore-alertas con un evento valido. Solo le sirven las partidas terminadas. Suma en
 * ventanas_partida y deja (o retira) la alerta de esa ventana, todo en UNA transaccion con el registro en
 * eventos_procesados: si el evento ya estaba, no suma nada.
 */
@Injectable()
export class AlertasNegocio implements Procesador<EventoDto> {
  constructor(private readonly base: DataSource) {}

  async procesar(e: EventoDto): Promise<Resultado> {
    if (e.tipo !== 'partida.terminada') return 'ignorado';
    const enError = (e.datos as { resultado: string }).resultado === 'error' ? 1 : 0;
    const ventana = ventanaDe5MinutosDe(e.emitidoEn);

    return this.base.transaction(async (tx): Promise<Resultado> => {
      const nuevo: unknown[] = await tx.query(
        `INSERT INTO eventos.eventos_procesados (grupo, evento_id) VALUES ($1, $2)
         ON CONFLICT DO NOTHING RETURNING evento_id`,
        [GRUPO, e.eventoId],
      );
      if (nuevo.length === 0) return 'duplicado';

      const [v] = await tx.query<{ terminadas: number; en_error: number }[]>(
        `INSERT INTO eventos.ventanas_partida (juego_id, ventana, terminadas, en_error) VALUES ($1, $2, 1, $3)
         ON CONFLICT (juego_id, ventana) DO UPDATE
           SET terminadas = ventanas_partida.terminadas + 1, en_error = ventanas_partida.en_error + EXCLUDED.en_error
         RETURNING terminadas, en_error`,
        [e.juegoId, ventana, enError],
      );
      // Con cada terminada se vuelve a evaluar la ventana: una ventana que paso el 20% con pocas terminadas
      // puede bajar despues. Las partidas de un juego llegan en orden (key juegoId), asi que al terminar de
      // leer queda exactamente la alerta de las ventanas que cumplen la regla con sus cifras finales.
      if (v.terminadas >= MINIMO_TERMINADAS && v.en_error > UMBRAL_ERROR * v.terminadas) {
        await tx.query(
          `INSERT INTO eventos.alertas (juego_id, ventana, terminadas, en_error) VALUES ($1, $2, $3, $4)
           ON CONFLICT (juego_id, ventana) DO UPDATE
             SET terminadas = EXCLUDED.terminadas, en_error = EXCLUDED.en_error, actualizada_en = now()`,
          [e.juegoId, ventana, v.terminadas, v.en_error],
        );
      } else {
        await tx.query(`DELETE FROM eventos.alertas WHERE juego_id = $1 AND ventana = $2`, [e.juegoId, ventana]);
      }
      return 'nuevo';
    });
  }
}
