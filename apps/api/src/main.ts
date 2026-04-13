import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('quill/api');

  app.enableCors({
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  });

  const port = 3001;
  await app.listen(port);
  console.log(`[Quill API] Sidecar running on http://localhost:${port}`);
}

bootstrap();
