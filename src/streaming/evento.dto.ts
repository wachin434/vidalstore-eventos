import 'reflect-metadata';
import {
  Equals,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

// Sobre comun de todos los eventos (punto 7 de la Guia de la EP3).
export const TIPOS_ACTIVIDAD = ['partida.iniciada', 'partida.terminada', 'logro.desbloqueado'] as const;
export const TIPOS_COMPRAS = ['compra.realizada', 'licencia.revocada'] as const;
export const TIPOS = [...TIPOS_ACTIVIDAD, ...TIPOS_COMPRAS] as const;
export type Tipo = (typeof TIPOS)[number];

export class EventoDto {
  @IsUUID() eventoId!: string;
  @IsIn(TIPOS as unknown as string[]) tipo!: Tipo;
  @Equals(1) version!: number;
  @IsISO8601() emitidoEn!: string;
  @IsString() @IsNotEmpty() juegoId!: string;
  @IsString() @IsNotEmpty() usuarioSub!: string;
  @IsObject() datos!: Record<string, unknown>;
}

// Un DTO por tipo de evento para el campo "datos".
export class DatosPartidaIniciadaDto {
  @IsString() @IsNotEmpty() partidaId!: string;
  @IsString() @IsNotEmpty() plataforma!: string;
}

export class DatosPartidaTerminadaDto {
  @IsString() @IsNotEmpty() partidaId!: string;
  @IsInt() @Min(0) duracionSeg!: number;
  @IsIn(['completada', 'abandonada', 'error']) resultado!: string;
}

export class DatosLogroDesbloqueadoDto {
  @IsString() @IsNotEmpty() partidaId!: string;
  @IsString() @IsNotEmpty() logroId!: string;
}

export class DatosCompraRealizadaDto {
  @IsString() @IsNotEmpty() licenciaId!: string;
  @IsISO8601() adquiridaEn!: string;
  // El simulador agrega el detalle del pago; el microservicio de licencias no lo envia todavia.
  @IsOptional() @IsNumber() precioBaseClp?: number;
  @IsOptional() @IsNumber() descuentoPct?: number;
  @IsOptional() @IsNumber() precioPagadoClp?: number;
}

export class DatosLicenciaRevocadaDto {
  @IsString() @IsNotEmpty() licenciaId!: string;
  @IsString() @IsNotEmpty() revocadaPor!: string;
  @IsString() @MaxLength(500) motivo!: string;
}

export const DTO_DE_DATOS: Record<Tipo, new () => object> = {
  'partida.iniciada': DatosPartidaIniciadaDto,
  'partida.terminada': DatosPartidaTerminadaDto,
  'logro.desbloqueado': DatosLogroDesbloqueadoDto,
  'compra.realizada': DatosCompraRealizadaDto,
  'licencia.revocada': DatosLicenciaRevocadaDto,
};
