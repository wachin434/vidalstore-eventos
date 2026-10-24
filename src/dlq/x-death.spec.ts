import { crearMsg, ID } from '../mensajeria/ayudas-prueba';
import { leerMuerte } from './x-death';

describe('leerMuerte (x-death[0])', () => {
  it('lee cola, exchange, routing key, motivo e intentos de la primera muerte', () => {
    const msg = crearMsg('{}', {
      'x-evento-id': ID,
      'x-death': [
        { queue: 'cola.avisos', exchange: 'vidalstore.eventos', 'routing-keys': ['licencia.revocada'], reason: 'rejected', count: 3 },
        { queue: 'otra', reason: 'expired', count: 1, 'routing-keys': ['x'] },
      ],
    }, 'cola.avisos');
    expect(leerMuerte(msg)).toEqual({
      colaOrigen: 'cola.avisos',
      exchangeOrigen: 'vidalstore.eventos',
      routingKey: 'licencia.revocada',
      motivo: 'rejected',
      intentos: 3,
      eventoId: ID,
    });
  });

  it('sin x-death usa valores por defecto y no inventa un evento_id inválido', () => {
    const msg = crearMsg('basura', { 'x-evento-id': 'no-uuid' }, 'cola.avisos');
    const m = leerMuerte(msg);
    expect(m.colaOrigen).toBe('desconocida');
    expect(m.motivo).toBe('desconocido');
    expect(m.intentos).toBe(0);
    expect(m.eventoId).toBeNull();
    expect(m.exchangeOrigen).toBeNull();
  });
});
