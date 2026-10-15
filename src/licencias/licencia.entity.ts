import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  Unique,
} from 'typeorm';

export type EstadoLicencia = 'activa' | 'revocada';

@Entity('licencias')
@Index('ux_licencias_activa_por_usuario_juego', ['usuarioSub', 'juegoId'], {
  unique: true,
  where: `"estado" = 'activa'`,
})
export class Licencia {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'usuario_sub' })
  usuarioSub!: string;

  @Column({ name: 'juego_id' })
  juegoId!: string;

  @Column({ type: 'varchar', default: 'activa' })
  estado!: EstadoLicencia;

  @CreateDateColumn({ name: 'creado_en' })
  creadoEn!: Date;

  @Column({ name: 'revocado_en', type: 'timestamp', nullable: true })
  revocadoEn!: Date | null;
}

@Entity('eventos_auditoria')
@Unique('ux_eventos_auditoria_evento_id', ['eventoId'])
export class EventoAuditoria {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'evento_id' })
  eventoId!: string;

  @Column()
  tipo!: string;

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @CreateDateColumn({ name: 'recibido_en' })
  recibidoEn!: Date;
}