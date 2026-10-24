import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ schema: 'eventos', name: 'eventos_auditoria' })
export class EventoAuditoria {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'routing_key', type: 'text' })
  routingKey!: string;

  // UNIQUE en la base: es la clave de idempotencia (error 23505 = duplicado).
  @Column({ name: 'evento_id', type: 'uuid', unique: true })
  eventoId!: string;

  @Column({ name: 'usuario_sub', type: 'text', nullable: true })
  usuarioSub!: string | null;

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @Column({ name: 'emitido_en', type: 'timestamptz' })
  emitidoEn!: Date;

  @CreateDateColumn({ name: 'recibido_en', type: 'timestamptz' })
  recibidoEn!: Date;
}
