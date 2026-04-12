import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('quill');

  app.enableCors({
    origin: ['http://localhost:1420', 'tauri://localhost'],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  });

  const port = 3001;
  await app.listen(port);
  console.log(`[Quill API] Sidecar running on http://localhost:${port}`);
}

bootstrap();
