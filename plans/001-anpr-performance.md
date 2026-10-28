# Plano de execução: latência e tráfego ANPR

Data: 2026-10-27. Bases: backend f791561; frontend 9d511a2.
Solicitação: implementar métricas claras, navegador apenas vídeo e melhorias 1–4 da análise. Não trocar modelos nem distribuir processamento entre unidades.

## Situação e limites
Python captura snapshots continuamente e usa InferenceScheduler com um worker. O navegador faz OCR adicional. AutoRegistrationService consulta observações a cada 3 segundos, sequencialmente. PaddleOCR.predict executa pipeline completo em recortes YOLO.
Preservar autenticação, escopo empresa/ponto, cooldown, identidade de observação e idempotência. Não alterar src/environments/environment.ts no frontend (alteração preexistente). Não publicar, alterar banco de produção nem acessar câmeras reais para testes.

## Execução
1. Python: estatísticas limitadas em memória de todas as inferências (sucesso/sem placa/erro), espera em fila, captura, idade do frame, substituição/expiração, profundidade/capacidade e métricas por câmera. Documentar unidades e janela; preservar campos legados com semântica explícita. Relógio monotônico para durações. Sem imagens, URLs ou credenciais nas métricas.
2. Frontend: remover captura canvas, uploads OCR, timers e overlay do player e seus inputs consumidores. Preservar vídeo HLS, erros e ciclo de destruição. Navegador só exibe vídeo.
3. Eventos: Python oferece feed limitado de mudanças de observação com cursor, espera longa limitada e recuperação de cursor perdido/reinício. Backend consome, busca estado atual e valida frescor antes do registro. Concorrência limitada entre câmeras, serialização por câmera, sem ciclos simultâneos da mesma observação. Recuperação de conexão e parada limpa. Preservar regras de registro e fallback externo existentes.
4. Captura: limitar trabalho pendente/em execução por câmera; garantir liberação mesmo com expiração, erro e remoção. Detecção barata de mudança visual para poupar inferência em cena estática, com atualização periódica forçada e parâmetros conservadores. Adaptar intervalo de captura de forma limitada, preservando observações em confirmação. Registrar skips e bytes. Evitar recompressão JPEG desnecessária. Manter precisão subsegundo na configuração existente.
5. OCR: usar TextRecognition com modelo de leitura correspondente ao idioma/configuração atual nos recortes YOLO, suportando resultados do módulo. Manter fallback completo apenas quando explicitamente habilitado. Cobrir recortes de placas de duas linhas/angulados ou fornecer fallback documentado/configurável. Sem baixar modelos durante testes, sem mudar pesos YOLO.

## Escopo
Backend: anpr-service/app e testes relacionados; src/anpr, src/monitoring, src/auto-registration e testes relacionados; src/app.service.ts e src/app.controller.ts para integrar métricas ao /stats da API principal; README e configuração de exemplo sem segredos. Frontend: camera-stream, consumidores diretos e testes. Expandir escopo apenas para integração diretamente necessária e documentar.

Contrato de eventos acordado: GET /monitor-events?cursor=<epoch:sequence>&wait_seconds=20 retorna {cursor, reset, events:[{cameraId}]}. Reset recupera câmeras atuais; estados são consultados novamente antes de processar. Registro terá telemetria de fila, processamento e tempo captura→registro, com concorrência entre pontos e serialização por ponto para preservar cooldown.

## Verificação
Backend: npm run typecheck; npm run lint; npm test. Python: npm run test:python (explicitar eventuais falhas de cobertura preexistentes); testes focados sem download. Frontend: npx tsc --noEmit -p tsconfig.app.json e npm run build; testes do player se infraestrutura permitir.
Testar: métricas com relógio determinístico para todos outcomes; filas expiradas; captura estática com probe forçado; mudança de cena; eventos/cursor/reconexão/parada; dois pontos sem bloqueio mútuo; deduplicação; OCR TextRecognition com mocks realistas; player sem chamadas OCR. Inspecionar diff e repetir gates após integração.

## Critérios de conclusão
Nenhum upload OCR originado pelo player; registro normal acionado por eventos; recuperação de eventos sem perda silenciosa; métricas descritas e testadas; captura sem fila infinita ou espera permanente; módulo de leitura usado nos recortes; gates aprovados ou limitações explicitamente identificadas. Medições em câmeras reais e benchmark comparativo ficam para homologação.
