import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('mensajes_muertos')
export class MensajeMuerto {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  cola!: string;

  @Column({ type: 'jsonb', nullable: true })
  payload!: Record<string, unknown> | null;

  @Column({ type: 'text' })
  contenidoCrudo!: string;

  @Column({ type: 'text' })
  motivo!: string;

  @CreateDateColumn({ name: 'recibido_en' })
  recibidoEn!: Date;
}