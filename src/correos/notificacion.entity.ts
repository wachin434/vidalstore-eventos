import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type EstadoNotificacion = 'enviada' | 'fallida';

@Entity({ schema: 'eventos', name: 'notificaciones' })
export class Notificacion {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // UNIQUE: reprocesar dos veces el mismo evento no duplica el aviso.
  @Column({ name: 'evento_id', type: 'uuid', unique: true })
  eventoId!: string;

  @Column({ type: 'text' })
  para!: string;

  @Column({ type: 'text' })
  asunto!: string;

  @Column({ type: 'text' })
  cuerpo!: string;

  @Column({ type: 'text' })
  estado!: EstadoNotificacion;

  @CreateDateColumn({ name: 'creada_en', type: 'timestamptz' })
  creadaEn!: Date;
}
