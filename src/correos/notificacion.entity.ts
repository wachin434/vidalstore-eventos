import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('notificaciones')
export class Notificacion {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  destinatario!: string;

  @Column()
  asunto!: string;

  @Column({ type: 'text' })
  cuerpo!: string;

  @Column({ default: false })
  enviado!: boolean;

  @CreateDateColumn({ name: 'creado_en' })
  creadoEn!: Date;
}