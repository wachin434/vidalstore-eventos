import {
  argumentosColaTrabajo,
  COLAS,
  declararTopologia,
  EXCHANGE_DLX,
  TODAS_LAS_DLQ,
} from './topologia';

function canalFalso() {
  const llamadas: string[] = [];
  const colas: Record<string, Record<string, unknown>> = {};
  const enlaces: string[][] = [];
  return {
    llamadas, colas, enlaces,
    canal: {
      assertExchange: async (n: string, t: string) => void llamadas.push(`ex:${n}:${t}`),
      assertQueue: async (n: string, o: { arguments: Record<string, unknown> }) => {
        llamadas.push(`q:${n}`);
        colas[n] = o.arguments;
      },
      bindQueue: async (q: string, e: string, rk: string) => void enlaces.push([q, e, rk]),
    } as never,
  };
}

describe('declararTopologia', () => {
  it('declara los 3 exchanges con su tipo y las DLQ antes que las colas de trabajo', async () => {
    const f = canalFalso();
    await declararTopologia(f.canal);
    expect(f.llamadas.slice(0, 3)).toEqual([
      'ex:vidalstore.eventos:topic', 'ex:vidalstore.comandos:direct', 'ex:vidalstore.dlx:direct',
    ]);
    const orden = f.llamadas.filter((l) => l.startsWith('q:')).map((l) => l.slice(2));
    expect(orden.slice(0, 4)).toEqual(TODAS_LAS_DLQ);
    expect(orden.slice(4)).toEqual(COLAS.map((c) => c.nombre));
  });

  it('todas son quorum; las de trabajo tienen DLX y clave propia; las DLQ no tienen DLX', async () => {
    const f = canalFalso();
    await declararTopologia(f.canal);
    for (const [nombre, args] of Object.entries(f.colas)) {
      expect(args['x-queue-type']).toBe('quorum');
      expect(args['x-overflow']).toBe('reject-publish');
      if (nombre.endsWith('.dlq')) {
        expect(args['x-dead-letter-exchange']).toBeUndefined();
        expect(args['x-message-ttl']).toBe(7 * 24 * 3600 * 1000);
      } else {
        expect(args['x-dead-letter-exchange']).toBe(EXCHANGE_DLX);
        expect(args['x-dead-letter-routing-key']).toBe(nombre);
      }
    }
  });

  it('enlaza cada DLQ al dlx con el nombre de su cola de trabajo y aplica los bindings del contrato', async () => {
    const f = canalFalso();
    await declararTopologia(f.canal);
    expect(f.enlaces).toContainEqual(['cola.avisos.dlq', EXCHANGE_DLX, 'cola.avisos']);
    expect(f.enlaces).toContainEqual(['cola.avisos', 'vidalstore.eventos', 'licencia.revocada']);
    expect(f.enlaces).toContainEqual(['cola.avisos', 'vidalstore.eventos', 'compra.realizada']);
    expect(f.enlaces).toContainEqual(['cola.auditoria', 'vidalstore.eventos', '#']);
    expect(f.enlaces).toContainEqual(['cola.correos', 'vidalstore.comandos', 'correo.enviar']);
    expect(f.enlaces).toContainEqual(['cola.reproceso', 'vidalstore.comandos', 'dlq.reprocesar']);
  });

  it('retención por cola según la política documentada', () => {
    const a = (n: string) => argumentosColaTrabajo(COLAS.find((c) => c.nombre === n)!);
    expect(a('cola.avisos')).toMatchObject({ 'x-max-length': 10000, 'x-message-ttl': 86400000 });
    expect(a('cola.auditoria')).toMatchObject({ 'x-max-length': 50000, 'x-message-ttl': 604800000 });
    expect(a('cola.correos')).toMatchObject({ 'x-max-length': 20000, 'x-message-ttl': 43200000 });
    expect(a('cola.reproceso')).toMatchObject({ 'x-max-length': 1000, 'x-message-ttl': 86400000 });
  });
});
