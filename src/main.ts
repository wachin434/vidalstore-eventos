import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
  app.enableShutdownHooks();
  // Expone GET /salud y GET /panel/en-vivo (lo llama el gateway); todo lo demás es mensajería.
  await app.listen(Number(process.env.PORT ?? 3010));
}
bootstrap();
