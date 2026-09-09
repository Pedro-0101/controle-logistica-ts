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
    .setDescription('API para gestão de usuários, empresas, unidades administrativas e movimentação de veículos')
    .setVersion('1.0')
    .addTag('Users', 'Operações de gestão de usuários')
    .addTag('Auth', 'Autenticação e tokens JWT')
    .addTag('Companies', 'Gestão de empresas')
    .addTag('Admin Units', 'Unidades administrativas')
    .addTag('Vehicles', 'Veículos')
    .addTag('Cameras', 'Câmeras IP para reconhecimento de placas')
    .addTag('Movements', 'Entrada e saída de veículos')
    .addTag('ANPR', 'Reconhecimento de placas (ANPR)')
    .addBearerAuth()
    .build();

  const rawDocument = SwaggerModule.createDocument(app, config);
  const document = applyZodNest(rawDocument);
  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'docs-json',
  });

  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
