import { validarEvento } from './validar-evento';

const base = {
  eventoId: '0f8c2a4e-1b2c-4d3e-8f90-123456789abc',
  tipo: 'partida.terminada',
  version: 1,
  emitidoEn: '2026-11-07T00:30:40.512Z',
  juegoId: '292030',
  usuarioSub: 'a1b2c3d4-0000-0000-0000-000000000001',
  datos: { partidaId: 'p-1', duracionSeg: 1840, resultado: 'completada' },
};
const texto = (o: unknown) => JSON.stringify(o);

describe('validarEvento', () => {
  it('acepta una partida terminada valida', () => {
    expect(validarEvento(texto(base)).ok).toBe(true);
  });

  it('acepta una compra con el detalle de pago del simulador', () => {
    const compra = {
      ...base,
      tipo: 'compra.realizada',
      datos: {
        licenciaId: 'l-1',
        adquiridaEn: '2026-11-07T00:30:40.512Z',
        precioBaseClp: 19990,
        descuentoPct: 25,
        precioPagadoClp: 14993,
      },
    };
    expect(validarEvento(texto(compra)).ok).toBe(true);
  });

  it('acepta una compra como la que publica el microservicio de licencias', () => {
    const compra = {
      ...base,
      tipo: 'compra.realizada',
      datos: { licenciaId: '80b9f9f4-e69a-4364-9cdb-e9e45641931f', adquiridaEn: '2026-11-04T23:25:53.753Z' },
    };
    expect(validarEvento(texto(compra)).ok).toBe(true);
  });

  it('acepta una revocacion valida', () => {
    const r = { ...base, tipo: 'licencia.revocada', datos: { licenciaId: 'l-1', revocadaPor: 'admin-1', motivo: 'fraude' } };
    expect(validarEvento(texto(r)).ok).toBe(true);
  });

  it('rechaza JSON cortado', () => {
    const r = validarEvento(texto(base).slice(0, 60));
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe('JSON invalido');
  });

  it('rechaza un campo obligatorio faltante', () => {
    const { usuarioSub, ...sinSub } = base;
    const r = validarEvento(texto(sinSub));
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain('usuarioSub');
  });

  it('rechaza version 99', () => {
    const r = validarEvento(texto({ ...base, version: 99 }));
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain('version');
  });

  it('rechaza datos que no corresponden al tipo', () => {
    const r = validarEvento(texto({ ...base, datos: { partidaId: 'p-1' } }));
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain('datos');
  });

  it('rechaza un value vacio', () => {
    expect(validarEvento('').ok).toBe(false);
    expect(validarEvento(undefined).ok).toBe(false);
  });

  it('acepta un juego publicado y un precio cambiado del catalogo', () => {
    const juego = { ...base, tipo: 'juego.publicado', datos: { titulo: 'Hades', precioClp: 14990, activo: true } };
    expect(validarEvento(texto(juego)).ok).toBe(true);
    expect(validarEvento(texto({ ...juego, tipo: 'precio.cambiado' })).ok).toBe(true);
  });

  it('rechaza un juego del catalogo sin titulo o con precio negativo', () => {
    const juego = { ...base, tipo: 'juego.publicado', datos: { titulo: '', precioClp: -1, activo: true } };
    expect(validarEvento(texto(juego)).ok).toBe(false);
  });

  describe('codigo (x-motivo del .dlt)', () => {
    it('JSON cortado o vacio: json-invalido', () => {
      expect(validarEvento(texto(base).slice(0, 60)).codigo).toBe('json-invalido');
      expect(validarEvento('').codigo).toBe('json-invalido');
      expect(validarEvento('[1,2]').codigo).toBe('json-invalido');
    });

    it('un campo del sobre que no vino: falta-<campo>', () => {
      const { eventoId, ...sinId } = base;
      expect(validarEvento(texto(sinId)).codigo).toBe('falta-eventoId');
    });

    it('un campo de datos que no vino: falta-<campo>', () => {
      const r = validarEvento(texto({ ...base, datos: { partidaId: 'p-1', duracionSeg: 10 } }));
      expect(r.codigo).toBe('falta-resultado');
    });

    it('version distinta de 1: version-desconocida', () => {
      expect(validarEvento(texto({ ...base, version: 99 })).codigo).toBe('version-desconocida');
    });

    it('un valor que no cumple el DTO: dto-invalido', () => {
      expect(validarEvento(texto({ ...base, eventoId: 'no-es-uuid' })).codigo).toBe('dto-invalido');
      expect(validarEvento(texto({ ...base, datos: { partidaId: 'p-1', duracionSeg: -5, resultado: 'completada' } })).codigo).toBe('dto-invalido');
    });

    it('un evento valido no trae codigo', () => {
      expect(validarEvento(texto(base)).codigo).toBeUndefined();
    });
  });
});
