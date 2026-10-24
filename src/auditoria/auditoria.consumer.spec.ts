import { extraerUsuarioSub } from './auditoria.consumer';

describe('extraerUsuarioSub', () => {
  it('toma el sub según la routing key', () => {
    expect(extraerUsuarioSub('compra.realizada', { usuarioSub: 'u1' })).toBe('u1');
    expect(extraerUsuarioSub('licencia.revocada', { usuarioSub: 'u1', revocadaPor: 'adm' })).toBe('adm');
    expect(extraerUsuarioSub('juego.publicado', { editorSub: 'ed' })).toBe('ed');
    expect(extraerUsuarioSub('otra.cosa', { usuarioSub: 'u1' })).toBeNull();
  });
});
