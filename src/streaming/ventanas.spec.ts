import { minutoDe, ventanaDe5MinutosDe } from './ventanas';

describe('ventanas', () => {
  it('trunca al minuto de emitidoEn', () => {
    expect(minutoDe('2026-11-07T00:46:41.512Z')).toBe('2026-11-07T00:46:00.000Z');
  });

  it('00:32:41Z cae en la ventana de 00:30:00Z (21:30 a 21:35 en Chile)', () => {
    expect(ventanaDe5MinutosDe('2026-11-07T00:32:41.000Z')).toBe('2026-11-07T00:30:00.000Z');
  });

  it('las ventanas son fijas y no se superponen', () => {
    expect(ventanaDe5MinutosDe('2026-11-07T00:34:59.999Z')).toBe('2026-11-07T00:30:00.000Z');
    expect(ventanaDe5MinutosDe('2026-11-07T00:35:00.000Z')).toBe('2026-11-07T00:35:00.000Z');
  });
});
