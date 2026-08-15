import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: true });
  const port = Number.parseInt(process.env['PORT'] ?? '3000', 10);

  await app.listen(port, '0.0.0.0');
}

void bootstrap();
