import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { Procesador, Resultado } from '../consumidor-kafka';
import type { EventoDto } from '../evento.dto';
import { minutoDe } from '../ventanas';

// El panel cuenta las partidas iniciadas y terminadas (las que estan en curso) y las compras (unidades y CLP).
// logro.desbloqueado y licencia.revocada no le sirven.
const CUENTAN = ['partida.iniciada', 'partida.terminada', 'compra.realizada'];
const DEL_CATALOGO = ['juego.publicado', 'precio.cambiado'];

/**
 * Lo que hace vidalstore-panel con un evento valido: una fila en kpi_minuto. Si el evento_id ya estaba, el
 * INSERT no hace nada y se informa como duplicado. No sabe nada de Kafka.
 */
@Injectable()
export class PanelNegocio implements Procesador<EventoDto> {
  constructor(private readonly base: DataSource) {}

  async procesar(e: EventoDto): Promise<Resultado> {
    if (DEL_CATALOGO.includes(e.tipo)) return this.catalogo(e);
    if (!CUENTAN.includes(e.tipo)) return 'ignorado';
    // Solo la compra trae monto. El microservicio de licencias aun no manda el precio: cuenta como 0 CLP.
    const monto = e.tipo === 'compra.realizada' ? Number((e.datos as { precioPagadoClp?: number }).precioPagadoClp ?? 0) : 0;
    const filas: unknown[] = await this.base.query(
      `INSERT INTO eventos.kpi_minuto (evento_id, minuto, juego_id, tipo, monto_clp) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (evento_id) DO NOTHING RETURNING evento_id`,
      [e.eventoId, minutoDe(e.emitidoEn), e.juegoId, e.tipo, monto],
    );
    return filas.length === 1 ? 'nuevo' : 'duplicado';
  }

  // El catalogo no suma: guarda el ULTIMO estado de cada juego. Un mensaje mas viejo que el guardado, o el mismo
  // evento leido otra vez (el topic se relee desde el offset 0 para reconstruir), no cambia nada: 'duplicado'.
  private async catalogo(e: EventoDto): Promise<Resultado> {
    const d = e.datos as { titulo: string; precioClp: number; activo: boolean };
    const filas: unknown[] = await this.base.query(
      `INSERT INTO eventos.catalogo_vista (juego_id, titulo, precio_clp, activo, ultimo_tipo, evento_id, emitido_en)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (juego_id) DO UPDATE
         SET titulo = EXCLUDED.titulo, precio_clp = EXCLUDED.precio_clp, activo = EXCLUDED.activo,
             ultimo_tipo = EXCLUDED.ultimo_tipo, evento_id = EXCLUDED.evento_id, emitido_en = EXCLUDED.emitido_en
         WHERE eventos.catalogo_vista.emitido_en < EXCLUDED.emitido_en
       RETURNING juego_id`,
      [e.juegoId, d.titulo, d.precioClp, d.activo, e.tipo, e.eventoId, e.emitidoEn],
    );
    return filas.length === 1 ? 'nuevo' : 'duplicado';
  }
}
