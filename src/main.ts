import { NestFactory } from '@nestjs/core';
import { AppModule, ObserveInstrument } from './app.module.js';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { applyZodNest } from 'zod-nest';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    instrument: ObserveInstrument,
  });

  const config = new DocumentBuilder()
    .setTitle('Controle Logística API')
    .setDescription('API para gestão de usuários, empresas e unidades administrativas')
    .setVersion('1.0')
    .addTag('Users', 'Operações de gestão de usuários')
    .build();

  const rawDocument = SwaggerModule.createDocument(app, config);
  const document = applyZodNest(rawDocument);
  SwaggerModule.setup('docs', app, document);

  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
