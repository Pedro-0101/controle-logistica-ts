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
    .addTag('Cameras', 'Câmeras IP, monitoramento contínuo de placas e streaming ao vivo. ' +
      'Endpoints disponíveis:\n' +
      '- CRUD de câmeras (POST, GET, PATCH, DELETE)\n' +
      '- GET /camera/:id/current-observation: Monitoramento contínuo OCR (polling a cada 2s)\n' +
      '- GET /camera/:id/snapshot: Captura sob demanda de imagem JPEG da câmera\n' +
      '- GET /camera/:id/stream: URLs de streaming HLS/WebRTC/RTSP via MediaMTX\n\n' +
      'O monitoramento contínuo é feito em background: a cada ~1s, o Python captura a imagem, executa OCR ' +
      'e mantém o estado mais recente. O front consulta periodicamente para exibir ao porteiro.\n\n' +
      'O streaming é sob demanda: o MediaMTX só conecta à câmera quando há espectadores ativos.')
    .addTag('Movements', 'Entrada e saída de veículos. CRUD manual e registro automático via ANPR. ' +
      'Endpoints de revisão automática:\n' +
      '- GET /movement/pending-review: movimentos aguardando validação do operador\n' +
      '- GET /movement/:id/evidence: foto de evidência (JPEG) do movimento\n' +
      '- POST /movement/:id/recalculate: confirmar/corrigir placa após cadastro\n' +
      '- POST /movement/discard: descartar leituras incorretas')
    .addTag(
      'ANPR',
      'Reconhecimento de placas (ANPR). O OCR é delegado a um microserviço Python (PaddleOCR) que captura o snapshot da câmera IP ou recebe a imagem em base64 e devolve a placa normalizada (Mercosul ou formato antigo).',
    )
    .addTag('Points', 'Pontos de entrada/saída (portões, cancelheiras). Cada ponto possui um campo `inheritCompanyConfig`: quando `true` (default), herda todas as configurações ANPR da empresa; quando `false`, usa os valores próprios do ponto. O campo `anprAutoRegister` ativa/desativa o registro automático de viagens (usado apenas quando inheritCompanyConfig = false).')
    .addTag('Company Config', 'Configurações globais da empresa: parâmetros ANPR (confiança, timeout, cooldown), defaults de câmeras, e comportamento de movimentação. Estes valores são usados quando o ponto tem `inheritCompanyConfig = true` (default) ou quando um campo específico do ponto está null.')
    .addTag('Auto Registration', 'Revisão de movimentações registradas automaticamente por ANPR. Quando uma placa não é encontrada na base de dados, o sistema cria um movimento pendente de revisão. O operador corrige a placa ou cadastra o veículo e aciona o recálculo.')
    .addTag('Monitoring', 'Monitoramento em tempo real de câmeras IP: leitura contínua de placas (polling), captura de snapshots sob demanda, e streaming ao vivo (HLS/WebRTC/RTSP) via MediaMTX.')
    .addTag('Stats', 'Estatísticas de monitoramento ANPR: monitores ativos, observações confirmadas e dados de leitura de placas')
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
