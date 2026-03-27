import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { config } from './config';
import { IoAdapter } from '@nestjs/platform-socket.io';
import * as path from 'node:path';
import * as express from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    cors: {
      origin: config.corsOrigin || '*',
      credentials: true,
    },
  });

  app.useWebSocketAdapter(new IoAdapter(app));

  const uploadsDir = path.join(process.cwd(), 'uploads');
  app.use('/uploads', express.static(uploadsDir));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  const port = Number(process.env.PORT) || 3000;
  await app.listen(port, '0.0.0.0');

  console.log(`✅ API running on port ${port}`);
  console.log('📦 Static uploads served at /uploads');
}

bootstrap();
