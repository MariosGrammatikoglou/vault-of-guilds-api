import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { config } from './config';
import { IoAdapter } from '@nestjs/platform-socket.io';
import * as path from 'node:path';
import * as express from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    cors: { origin: config.corsOrigin || '*' },
  });

  // WebSocket driver
  app.useWebSocketAdapter(new IoAdapter(app));

  // Serve uploaded files
  const uploadsDir = path.join(process.cwd(), 'uploads');
  app.use('/uploads', express.static(uploadsDir));

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(3000);
  console.log('✅ API running at http://localhost:3000');
  console.log('📦 Static uploads served at /uploads');
}
bootstrap();
