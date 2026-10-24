import { Global, Module } from '@nestjs/common';
import { MensajeriaService } from './mensajeria.service';

@Global()
@Module({
  providers: [MensajeriaService],
  exports: [MensajeriaService],
})
export class MensajeriaModule {}
