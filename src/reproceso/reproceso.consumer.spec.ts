import { ErrorMensajeInvalido } from '../mensajeria/errores';
import { ID } from '../mensajeria/ayudas-prueba';
import { Mensaje } from '../mensajeria/mensaje';
import { ReprocesoConsumer } from './reproceso.consumer';

const MUERTO = '11111111-2222-4333-8444-555555555555';
const orden = (p: object): Mensaje => ({
  routingKey: 'dlq.reprocesar', eventoId: ID, emitidoEn: null, texto: '', payload: p as never,
});

function armar(fila: object | null) {
  const registro: string[] = [];
  const repo = {
    findOneBy: jest.fn().mockResolvedValue(fila),
    update: jest.fn(async (_c: object, v: object) => void registro.push(`update:${Object.keys(v).join(',')}`)),
  };
  const mensajeria = { publicarTexto: jest.fn(async () => void registro.push('publicar')) };
  return { registro, repo, mensajeria, c: new ReprocesoConsumer(mensajeria as never, repo as never) };
}

describe('ReprocesoConsumer', () => {
  it('sin x-evento-id: genera uno, lo guarda ANTES de republicar y marca el reproceso', async () => {
    const a = armar({ id: MUERTO, eventoId: null, exchangeOrigen: 'vidalstore.eventos', routingKey: 'compra.realizada', payload: '{"a":1}' });
    await a.c.manejar(orden({ mensajeMuertoId: MUERTO, solicitadoPor: 'adm' }));
    expect(a.registro).toEqual(['update:eventoId', 'publicar', 'update:reprocesadoEn,reprocesadoPor']);
    const [exchange, rk, texto, eventoId] = a.mensajeria.publicarTexto.mock.calls[0] as unknown as string[];
    expect([exchange, rk, texto]).toEqual(['vidalstore.eventos', 'compra.realizada', '{"a":1}']);
    expect(eventoId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('con payloadCorregido republica el corregido y reutiliza el evento_id guardado', async () => {
    const a = armar({ id: MUERTO, eventoId: ID, exchangeOrigen: 'vidalstore.comandos', routingKey: 'correo.enviar', payload: 'roto' });
    await a.c.manejar(orden({ mensajeMuertoId: MUERTO, solicitadoPor: 'adm', payloadCorregido: { ok: true } }));
    expect(a.mensajeria.publicarTexto).toHaveBeenCalledWith('vidalstore.comandos', 'correo.enviar', '{"ok":true}', ID);
    expect(a.registro).toEqual(['publicar', 'update:reprocesadoEn,reprocesadoPor']);
  });

  it('mensaje muerto inexistente: ErrorMensajeInvalido (va a cola.reproceso.dlq)', async () => {
    const a = armar(null);
    await expect(a.c.manejar(orden({ mensajeMuertoId: MUERTO, solicitadoPor: 'adm' }))).rejects.toBeInstanceOf(ErrorMensajeInvalido);
    expect(a.mensajeria.publicarTexto).not.toHaveBeenCalled();
  });
});
