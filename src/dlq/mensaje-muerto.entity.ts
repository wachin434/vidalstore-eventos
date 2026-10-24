import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ schema: 'eventos', name: 'mensajes_muertos' })
export class MensajeMuerto {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'cola_origen', type: 'text' })
  colaOrigen!: string;

  @Column({ name: 'routing_key', type: 'text' })
  routingKey!: string;

  @Column({ type: 'text' })
  motivo!: string;

  @Column({ type: 'int', default: 0 })
  intentos!: number;

  // Payload crudo como texto: un mensaje mal formado no siempre es JSON.
  @Column({ type: 'text' })
  payload!: string;

  @CreateDateColumn({ name: 'recibido_en', type: 'timestamptz' })
  recibidoEn!: Date;

  @Column({ name: 'exchange_origen', type: 'text', nullable: true })
  exchangeOrigen!: string | null;

  @Column({ name: 'evento_id', type: 'uuid', nullable: true })
  eventoId!: string | null;

  @Column({ name: 'reprocesado_en', type: 'timestamptz', nullable: true })
  reprocesadoEn!: Date | null;

  @Column({ name: 'reprocesado_por', type: 'text', nullable: true })
  reprocesadoPor!: string | null;
}
