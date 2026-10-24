import { COMPRA, ID } from '../mensajeria/ayudas-prueba';
import { Mensaje } from '../mensajeria/mensaje';
import { construirCorreo } from './avisos.consumer';

const evento = (rk: string, p: object): Mensaje => ({ routingKey: rk, eventoId: ID, emitidoEn: null, texto: '', payload: p as never });

describe('construirCorreo', () => {
  it('compra: lleva el eventoId del evento origen', () => {
    const c = construirCorreo(evento('compra.realizada', COMPRA), 'x.local');
    expect(c).toMatchObject({ para: 'u1@x.local', asunto: 'Compra confirmada', eventoId: ID });
  });
  it('revocación: incluye el motivo', () => {
    const c = construirCorreo(evento('licencia.revocada', { ...COMPRA, revocadaPor: 'adm', motivo: 'fraude' }), 'x.local');
    expect(c.asunto).toBe('Licencia revocada');
    expect(c.cuerpo).toContain('fraude');
  });
});
