import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { MINIMO_TERMINADAS, UMBRAL_ERROR } from '../alertas/alertas.negocio';

const ZONA = 'America/Santiago';

type FilaMinuto = { minuto: Date; hora: string; iniciadas: number; terminadas: number; compras: number; monto_clp: number; en_curso: number };
type FilaJuego = { juego_id: string; en_curso: number; compras: number };
type FilaAlerta = { juego_id: string; desde: string; hasta: string; terminadas: number; en_error: number };
type FilaVentas = { juego_id: string; unidades: number; monto_clp: number; revocadas: number; monto_revocado_clp: number };

/**
 * Lo que lee el panel en vivo. vidalstore-eventos es el dueno de kpi_minuto, alertas y ventas_semana: el
 * gateway pide esto por HTTP y nunca se conecta a Postgres. Las horas salen en hora de Chile; lo guardado esta
 * en UTC. Todo sale de lo que escriben los tres consumer groups: panel (kpi_minuto), alertas y historial.
 */
@Injectable()
export class PanelEnVivoService {
  constructor(private readonly base: DataSource) {}

  async enVivo() {
    const [minutos, juegos, alertas, ventas] = await Promise.all([
      // Serie por minuto. Por dentro se cuenta cada tipo en su columna; por fuera, sum(...) OVER es una suma
      // acumulada: en cada minuto, todas las iniciadas menos todas las terminadas hasta ese minuto.
      this.base.query<FilaMinuto[]>(
        `SELECT minuto, to_char(minuto AT TIME ZONE '${ZONA}', 'HH24:MI') AS hora,
                iniciadas, terminadas, compras, monto_clp,
                sum(iniciadas - terminadas) OVER (ORDER BY minuto)::int AS en_curso
           FROM (SELECT minuto,
                        count(*) FILTER (WHERE tipo = 'partida.iniciada')::int  AS iniciadas,
                        count(*) FILTER (WHERE tipo = 'partida.terminada')::int AS terminadas,
                        count(*) FILTER (WHERE tipo = 'compra.realizada')::int  AS compras,
                        coalesce(sum(monto_clp) FILTER (WHERE tipo = 'compra.realizada'), 0)::bigint AS monto_clp
                   FROM eventos.kpi_minuto GROUP BY minuto) AS m
          ORDER BY minuto`,
      ),
      this.base.query<FilaJuego[]>(
        `SELECT juego_id,
                (count(*) FILTER (WHERE tipo = 'partida.iniciada') - count(*) FILTER (WHERE tipo = 'partida.terminada'))::int AS en_curso,
                count(*) FILTER (WHERE tipo = 'compra.realizada')::int AS compras
           FROM eventos.kpi_minuto
          GROUP BY juego_id
          ORDER BY en_curso DESC, compras DESC, juego_id`,
      ),
      this.base.query<FilaAlerta[]>(
        `SELECT juego_id, terminadas, en_error,
                to_char(ventana AT TIME ZONE '${ZONA}', 'HH24:MI') AS desde,
                to_char((ventana + interval '5 minutes') AT TIME ZONE '${ZONA}', 'HH24:MI') AS hasta
           FROM eventos.alertas
          ORDER BY ventana, juego_id`,
      ),
      // Ventas de la semana, de vidalstore-historial: ya traen las revocaciones descontadas.
      this.base.query<FilaVentas[]>(
        `SELECT juego_id, sum(unidades)::int AS unidades, sum(monto_clp)::bigint AS monto_clp,
                sum(revocadas)::int AS revocadas, sum(monto_revocado_clp)::bigint AS monto_revocado_clp
           FROM eventos.ventas_semana GROUP BY juego_id`,
      ),
    ]);

    const n = (v: unknown) => Number(v ?? 0);
    const ultimo = minutos.at(-1);
    const maximo = minutos.reduce<FilaMinuto | undefined>((max, m) => (!max || m.en_curso > max.en_curso ? m : max), undefined);
    const unidades = ventas.reduce((s, v) => s + n(v.unidades), 0);
    const bruto = ventas.reduce((s, v) => s + n(v.monto_clp), 0);
    const revocado = ventas.reduce((s, v) => s + n(v.monto_revocado_clp), 0);
    const masVendido = [...ventas].sort((a, b) => n(b.unidades) - n(a.unidades) || a.juego_id.localeCompare(b.juego_id))[0];
    const masRecaudo = [...ventas].sort((a, b) => n(b.monto_clp) - n(a.monto_clp) || a.juego_id.localeCompare(b.juego_id))[0];

    return {
      zonaHoraria: ZONA,
      generadoEn: new Date().toISOString(),
      hasta: ultimo ? ultimo.hora : null,
      totales: {
        partidasIniciadas: minutos.reduce((s, m) => s + m.iniciadas, 0),
        partidasTerminadas: minutos.reduce((s, m) => s + m.terminadas, 0),
        partidasEnCurso: ultimo?.en_curso ?? 0,
        compras: minutos.reduce((s, m) => s + m.compras, 0),
        montoComprasClp: minutos.reduce((s, m) => s + n(m.monto_clp), 0),
      },
      maximoEnCurso: maximo ? { hora: maximo.hora, partidas: maximo.en_curso } : null,
      porMinuto: minutos.map((m) => ({
        minuto: m.minuto,
        hora: m.hora,
        iniciadas: m.iniciadas,
        terminadas: m.terminadas,
        enCurso: m.en_curso,
        compras: m.compras,
        montoClp: n(m.monto_clp),
      })),
      porJuego: juegos.map((j) => ({ juegoId: j.juego_id, enCurso: j.en_curso, compras: j.compras })),
      regla: { umbralError: UMBRAL_ERROR, minimoTerminadas: MINIMO_TERMINADAS, ventanaMinutos: 5 },
      alertas: alertas.map((a) => ({
        juegoId: a.juego_id,
        desde: a.desde,
        hasta: a.hasta,
        terminadas: a.terminadas,
        enError: a.en_error,
        porcentaje: Math.round((1000 * a.en_error) / a.terminadas) / 10,
      })),
      ventasSemana: {
        unidades,
        brutoClp: bruto,
        revocaciones: ventas.reduce((s, v) => s + n(v.revocadas), 0),
        revocadoClp: revocado,
        netoClp: bruto - revocado,
        masVendido: masVendido ? { juegoId: masVendido.juego_id, unidades: n(masVendido.unidades) } : null,
        mayorRecaudo: masRecaudo ? { juegoId: masRecaudo.juego_id, montoClp: n(masRecaudo.monto_clp) } : null,
      },
    };
  }
}
