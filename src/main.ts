import { NestFactory } from '@nestjs/core';
import { AppModule, ObserveInstrument } from './app.module.js';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { applyZodNest } from 'zod-nest';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    instrument: ObserveInstrument,
  });

  app.enableCors({
    origin: true,
    credentials: false,
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
    .addTag('Cameras', 'Câmeras IP, monitoramento contínuo de placas e evidências fotográficas. ' +
      'O monitoramento é feito em background: a cada ~1s, o Python captura a imagem, executa OCR ' +
      'e mantém o estado mais recente. O front consulta periodicamente para exibir ao porteiro.')
    .addTag('Movements', 'Entrada e saída de veículos')
    .addTag(
      'ANPR',
      'Reconhecimento de placas (ANPR). O OCR é delegado a um microserviço Python (PaddleOCR) que captura o snapshot da câmera IP ou recebe a imagem em base64 e devolve a placa normalizada (Mercosul ou formato antigo).',
    )
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
