import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { Procesador, Resultado } from '../consumidor-kafka';
import type { EventoDto } from '../evento.dto';

const GRUPO = 'vidalstore-historial';

/**
 * Lo que hace vidalstore-historial con un evento valido, en UNA transaccion con eventos_procesados:
 * - compra.realizada: guarda la venta (semana, juego y precio) y suma una unidad y su monto.
 * - licencia.revocada: busca la compra por licenciaId, la marca revocada y, en la semana y el juego DE LA
 *   COMPRA, suma una revocada y le descuenta el precio de esa compra (la revocacion no trae precio). La
 *   semana es el lunes, en hora de Chile, de emitidoEn.
 * Funciona sin esperas porque la key de vidalstore.compras es usuarioSub: la compra y su revocacion caen en
 * la misma particion, y dentro de una particion el orden se respeta.
 */
@Injectable()
export class HistorialNegocio implements Procesador<EventoDto> {
  private readonly log = new Logger(GRUPO);

  constructor(private readonly base: DataSource) {}

  async procesar(e: EventoDto): Promise<Resultado> {
    if (e.tipo !== 'compra.realizada' && e.tipo !== 'licencia.revocada') return 'ignorado';
    const datos = e.datos as { licenciaId: string; precioPagadoClp?: number };

    return this.base.transaction(async (tx): Promise<Resultado> => {
      const nuevo: unknown[] = await tx.query(
        `INSERT INTO eventos.eventos_procesados (grupo, evento_id) VALUES ($1, $2)
         ON CONFLICT DO NOTHING RETURNING evento_id`,
        [GRUPO, e.eventoId],
      );
      if (nuevo.length === 0) return 'duplicado';

      if (e.tipo === 'compra.realizada') {
        const monto = Number(datos.precioPagadoClp ?? 0);
        const [v] = await tx.query<{ semana: string }[]>(
          `INSERT INTO eventos.ventas_vistas (licencia_id, semana, juego_id, monto_clp, revocada)
           VALUES ($1, date_trunc('week', $2::timestamptz AT TIME ZONE 'America/Santiago')::date, $3, $4, false)
           ON CONFLICT (licencia_id) DO NOTHING RETURNING semana::text AS semana`,
          [datos.licenciaId, e.emitidoEn, e.juegoId, monto],
        );
        if (!v) {
          this.log.warn(`licencia ${datos.licenciaId} ya registrada con otro evento: no suma`);
          return 'nuevo';
        }
        await tx.query(
          `INSERT INTO eventos.ventas_semana (semana, juego_id, unidades, monto_clp, revocadas, monto_revocado_clp)
           VALUES ($1, $2, 1, $3, 0, 0)
           ON CONFLICT (semana, juego_id) DO UPDATE
             SET unidades = ventas_semana.unidades + 1, monto_clp = ventas_semana.monto_clp + EXCLUDED.monto_clp`,
          [v.semana, e.juegoId, monto],
        );
        return 'nuevo';
      }

      // licencia.revocada. Envuelto en un WITH ... SELECT: con un UPDATE ... RETURNING a secas, TypeORM
      // devuelve [filas, cantidad] en vez de las filas, y [v] seria el arreglo, no la venta.
      const [v] = await tx.query<{ semana: string; juego_id: string; monto_clp: number }[]>(
        `WITH revocada AS (
           UPDATE eventos.ventas_vistas SET revocada = true WHERE licencia_id = $1 AND NOT revocada
           RETURNING semana::text AS semana, juego_id, monto_clp)
         SELECT semana, juego_id, monto_clp FROM revocada`,
        [datos.licenciaId],
      );
      if (!v) {
        this.log.warn(`revocacion de la licencia ${datos.licenciaId} sin compra pendiente: no descuenta`);
        return 'nuevo';
      }
      await tx.query(
        `UPDATE eventos.ventas_semana
            SET revocadas = revocadas + 1, monto_revocado_clp = monto_revocado_clp + $3
          WHERE semana = $1 AND juego_id = $2`,
        [v.semana, v.juego_id, v.monto_clp],
      );
      return 'nuevo';
    });
  }
}
