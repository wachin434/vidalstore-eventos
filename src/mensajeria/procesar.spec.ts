import { ErrorMensajeInvalido } from './errores';
import { decidir } from './procesar';
import { bitacoraMuda, COMPRA, crearMsg } from './ayudas-prueba';

function opciones() {
  const esperas: number[] = [];
  return { esperas, op: { intentos: 3, baseMs: 500, esperar: async (ms: number) => void esperas.push(ms) } };
}

describe('decidir (ack / nack hacia la DLQ)', () => {
  it('ack cuando el manejador termina bien', async () => {
    const { op } = opciones();
    const m = jest.fn().mockResolvedValue(undefined);
    expect(await decidir(crearMsg(COMPRA), m, bitacoraMuda, op)).toBe('ack');
    expect(m).toHaveBeenCalledTimes(1);
  });

  it('cuerpo que no es JSON: nack directo, sin llamar al manejador', async () => {
    const m = jest.fn();
    expect(await decidir(crearMsg('esto no es json'), m, bitacoraMuda, opciones().op)).toBe('nack-dlq');
    expect(m).not.toHaveBeenCalled();
  });

  it('x-evento-id ausente o que no es UUID: nack directo', async () => {
    const m = jest.fn();
    expect(await decidir(crearMsg(COMPRA, {}), m, bitacoraMuda, opciones().op)).toBe('nack-dlq');
    expect(await decidir(crearMsg(COMPRA, { 'x-evento-id': 'abc' }), m, bitacoraMuda, opciones().op)).toBe('nack-dlq');
    expect(m).not.toHaveBeenCalled();
  });

  it('falta un campo obligatorio de la routing key: nack directo', async () => {
    const { usuarioSub, ...incompleto } = COMPRA;
    void usuarioSub;
    const m = jest.fn();
    expect(await decidir(crearMsg(incompleto), m, bitacoraMuda, opciones().op)).toBe('nack-dlq');
    expect(m).not.toHaveBeenCalled();
  });

  it('el manejador lanza ErrorMensajeInvalido: nack sin reintentos', async () => {
    const { op, esperas } = opciones();
    const m = jest.fn().mockRejectedValue(new ErrorMensajeInvalido('x'));
    expect(await decidir(crearMsg(COMPRA), m, bitacoraMuda, op)).toBe('nack-dlq');
    expect(m).toHaveBeenCalledTimes(1);
    expect(esperas).toEqual([]);
  });

  it('fallo transitorio que se recupera: espera 500 ms y termina en ack', async () => {
    const { op, esperas } = opciones();
    const m = jest.fn().mockRejectedValueOnce(new Error('postgres caído')).mockResolvedValue(undefined);
    expect(await decidir(crearMsg(COMPRA), m, bitacoraMuda, op)).toBe('ack');
    expect(m).toHaveBeenCalledTimes(2);
    expect(esperas).toEqual([500]);
  });

  it('fallo transitorio permanente: 3 intentos, esperas 500 y 1000 ms, luego nack', async () => {
    const { op, esperas } = opciones();
    const m = jest.fn().mockRejectedValue(new Error('postgres caído'));
    expect(await decidir(crearMsg(COMPRA), m, bitacoraMuda, op)).toBe('nack-dlq');
    expect(m).toHaveBeenCalledTimes(3);
    expect(esperas).toEqual([500, 1000]);
  });

  it('duplicado (23505 sobre evento_id): ack sin reintentar', async () => {
    const { op, esperas } = opciones();
    const dup = Object.assign(new Error('duplicate key'), {
      driverError: { code: '23505', constraint: 'eventos_auditoria_evento_id_key' },
    });
    const m = jest.fn().mockRejectedValue(dup);
    expect(await decidir(crearMsg(COMPRA), m, bitacoraMuda, op)).toBe('ack');
    expect(m).toHaveBeenCalledTimes(1);
    expect(esperas).toEqual([]);
  });

  it('un 23505 sobre otra restricción NO es duplicado de evento: se trata como fallo', async () => {
    const { op } = opciones();
    const otro = Object.assign(new Error('x'), { code: '23505', constraint: 'otra_clave', detail: 'Key (id)=(1)' });
    const m = jest.fn().mockRejectedValue(otro);
    expect(await decidir(crearMsg(COMPRA), m, bitacoraMuda, op)).toBe('nack-dlq');
    expect(m).toHaveBeenCalledTimes(3);
  });
});
