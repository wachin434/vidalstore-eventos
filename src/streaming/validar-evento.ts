import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync, ValidationError } from 'class-validator';
import { DTO_DE_DATOS, EventoDto } from './evento.dto';

export interface Resultado {
  ok: boolean;
  evento?: EventoDto;
  motivo?: string;
  // Valor corto y fijo para el header x-motivo del .dlt (asi se puede contar por motivo): json-invalido,
  // falta-<campo>, version-desconocida o dto-invalido.
  codigo?: string;
}

function describir(errores: ValidationError[]): string {
  return errores
    .map((e) => `${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`)
    .join('; ');
}

// Un campo que no vino es "falta-<campo>"; una version distinta de 1 es "version-desconocida"; el resto,
// "dto-invalido". En el sobre se revisan los tres; en los datos, solo los dos ultimos.
function codigoDe(errores: ValidationError[], enElSobre: boolean): string {
  const falta = errores.find((e) => e.value === undefined);
  if (falta) return `falta-${falta.property}`;
  if (enElSobre && errores.some((e) => e.property === 'version')) return 'version-desconocida';
  return 'dto-invalido';
}

// Valida el value de un mensaje de Kafka (texto JSON) contra el sobre y el DTO de su tipo.
// No lanza: devuelve el motivo para que el consumidor lo registre y siga.
export function validarEvento(texto: string | undefined | null): Resultado {
  if (!texto) return { ok: false, motivo: 'value vacio', codigo: 'json-invalido' };

  let crudo: unknown;
  try {
    crudo = JSON.parse(texto);
  } catch {
    return { ok: false, motivo: 'JSON invalido', codigo: 'json-invalido' };
  }
  if (typeof crudo !== 'object' || crudo === null || Array.isArray(crudo)) {
    return { ok: false, motivo: 'el value no es un objeto JSON', codigo: 'json-invalido' };
  }

  const evento = plainToInstance(EventoDto, crudo);
  const erroresSobre = validateSync(evento);
  if (erroresSobre.length > 0) return { ok: false, motivo: describir(erroresSobre), codigo: codigoDe(erroresSobre, true) };

  const datos = plainToInstance(DTO_DE_DATOS[evento.tipo], evento.datos);
  const erroresDatos = validateSync(datos);
  if (erroresDatos.length > 0) {
    return { ok: false, motivo: `datos: ${describir(erroresDatos)}`, codigo: codigoDe(erroresDatos, false) };
  }

  return { ok: true, evento };
}
