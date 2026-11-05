import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync, ValidationError } from 'class-validator';
import { DTO_DE_DATOS, EventoDto } from './evento.dto';

export interface Resultado {
  ok: boolean;
  evento?: EventoDto;
  motivo?: string;
}

function describir(errores: ValidationError[]): string {
  return errores
    .map((e) => `${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`)
    .join('; ');
}

// Valida el value de un mensaje de Kafka (texto JSON) contra el sobre y el DTO de su tipo.
// No lanza: devuelve el motivo para que el consumidor lo registre y siga.
export function validarEvento(texto: string | undefined | null): Resultado {
  if (!texto) return { ok: false, motivo: 'value vacio' };

  let crudo: unknown;
  try {
    crudo = JSON.parse(texto);
  } catch {
    return { ok: false, motivo: 'JSON invalido' };
  }
  if (typeof crudo !== 'object' || crudo === null || Array.isArray(crudo)) {
    return { ok: false, motivo: 'el value no es un objeto JSON' };
  }

  const evento = plainToInstance(EventoDto, crudo);
  const erroresSobre = validateSync(evento);
  if (erroresSobre.length > 0) return { ok: false, motivo: describir(erroresSobre) };

  const datos = plainToInstance(DTO_DE_DATOS[evento.tipo], evento.datos);
  const erroresDatos = validateSync(datos);
  if (erroresDatos.length > 0) return { ok: false, motivo: `datos: ${describir(erroresDatos)}` };

  return { ok: true, evento };
}
