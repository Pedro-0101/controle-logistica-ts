# Futuras Alterações - Arquitetura Multi-Empresa (Edge Device)

## Objetivo

Escalar o sistema para múltiplas empresas rodando edge devices locais que se conectam a um backend centralizado na nuvem.

---

## Crítico (Sem isso não funciona)

### 1. Criar Dockerfiles

**Arquivos necessários:**
- `Dockerfile` (raiz) - para o NestJS + ANPR Python
- `anpr-service/Dockerfile` - para o microserviço Python
- `.dockerignore`

**O que o Dockerfile deve fazer:**
- Node.js 20+ para o NestJS
- Python 3.11+ para o ANPR Service
- Copiar pesos YOLO (`weights/brod.pt`) para dentro da imagem
- Instalar dependências do Python (PaddleOCR, PaddlePaddle, ultralytics, etc.)
- Build do NestJS (`npm run build`)
- Expor porta 3000 (API) e 8000 (ANPR)

**Referência:** O projeto atual roda via `concurrently`:
```json
"start": "concurrently -k -n api,anpr \"nest start\" \"npm run anpr:start\""
```

---

### 2. Corrigir RTSP Hardcoded

**Arquivo:** `src/camera/mediamtx.service.ts:174`

**Problema:**
```typescript
// Atual - sempre localhost
rtspUrl: `rtsp://localhost:8554/${pathName}`,
```

**Solução:**
```typescript
// Usar variável de ambiente
private rtspBase: string;

constructor(config: ConfigService) {
  // ... existente
  this.rtspBase = (config.get<string>('MEDIAMTX_RTSP_URL') ?? 'rtsp://localhost:8554').replace(/\/+$/, '');
}

getStreamUrls(cameraId: string): StreamUrls {
  const pathName = this.buildPathName(cameraId);
  return {
    hlsUrl: `${this.hlsBase}/${pathName}/index.m3u8`,
    webrtcUrl: `${this.webrtcBase}/${pathName}`,
    rtspUrl: `${this.rtspBase}/${pathName}`,
  };
}
```

**Variável de ambiente adicionar ao `.env`:**
```
MEDIAMTX_RTSP_URL=rtsp://localhost:8554
```

---

### 3. Criar Docker Compose para Edge

**Arquivo:** `docker-compose.edge.yml`

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: controle_logistica
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5

  mediamtx:
    image: bluenviron/mediamtx:latest
    ports:
      - "8554:8554"
      - "8888:8888"
      - "8889:8889"
      - "9997:9997"
    volumes:
      - ./mediamtx.yml:/mediamtx.yml
    depends_on:
      - postgres

  api:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DB_HOST=postgres
      - DB_PORT=5432
      - ANPR_SERVICE_URL=http://anpr:8000
      - MEDIAMTX_API_URL=http://mediamtx:9997
      - MEDIAMTX_HLS_URL=http://mediamtx:8888
      - MEDIAMTX_WEBRTC_URL=http://mediamtx:8889
      - MEDIAMTX_RTSP_URL=rtsp://mediamtx:8554
      - MONITORING_ENABLED=true
      - JWT_SECRET=${JWT_SECRET}
      - CENTRAL_API_URL=${CENTRAL_API_URL}
    depends_on:
      postgres:
        condition: service_healthy
      mediamtx:
        condition: service_started

  anpr:
    build:
      context: ./anpr-service
      dockerfile: Dockerfile
    environment:
      - ANPR_LANG=en
    # GPU (opcional para YOLO/PaddleOCR)
    # deploy:
    #   resources:
    #     reservations:
    #       devices:
    #         - capabilities: [gpu]

volumes:
  pgdata:
```

---

### 4. Variáveis de Ambiente para Edge

**Arquivo:** `.env.edge`

```env
# Banco de dados (Docker network interna)
DB_HOST=postgres
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_DATABASE=controle_logistica

# MediaMTX (Docker network interna)
MEDIAMTX_API_URL=http://mediamtx:9997
MEDIAMTX_HLS_URL=http://mediamtx:8888
MEDIAMTX_WEBRTC_URL=http://mediamtx:8889
MEDIAMTX_RTSP_URL=rtsp://mediamtx:8554

# ANPR Service
ANPR_SERVICE_URL=http://anpr:8000

# Monitoring
MONITORING_ENABLED=true

# Auth (deve ser igual ao backend central)
JWT_SECRET=sua_chave_secreta_aqui

# Conexão com backend central (para sync)
CENTRAL_API_URL=https://api.seudominio.com
EDGE_ID=empresa-a-sao-paulo
```

---

## Importante (Funciona mas não é production-ready)

### 5. Criar API de Sincronização Edge↔Central

**Objetivo:** Sincronizar dados entre edge devices e o backend central.

**Endpoints necessários no backend central:**

```
POST   /sync/push          - Edge envia dados para o central
POST   /sync/pull          - Edge recebe dados do central
GET    /sync/status        - Status da última sincronização
POST   /sync/provision     - Provisionar edge com config inicial
```

**Dados que o edge ENVIA para o central:**
- Movimentações criadas localmente
- Veículos novos detectados via ANPR
- Camera observations
- Logs de erro

**Dados que o central ENVIA para o edge:**
- Configuração de câmeras (IP, credenciais)
- Configuração de pontos e admin units
- Configuração da empresa
- Atualizações de veículos

**Sugestão de implementação:**
- Usar fila de mensagens (RabbitMQ, Redis Streams) para comunicação assíncrona
- Ou HTTP polling periódico (mais simples, menos eficiente)
- Cada registro deve ter `syncedAt` timestamp para evitar duplicação

---

### 6. Adicionar Multi-Tenant Completo

**Situação atual:** `companyId` já existe na maioria das entidades, mas não está 100% isolado.

**O que falta:**
- Garantir que TODAS as queries façam scope por `companyId`
- Adicionar `companyId` em tabelas que não têm (se houver)
- Row-Level Security no PostgreSQL (RLS policies)
- Middleware que injeta `companyId` automaticamente

**Entidades que JÁ têm `companyId`:**
- ✅ Camera
- ✅ Movement
- ✅ CameraObservation
- ✅ Vehicle
- ✅ Point
- ✅ AdminUnity
- ✅ CompanyConfig
- ✅ User

---

### 7. Criar API de Provisionamento

**Objetivo:** Permitir que o backend central configure remotamente um edge device.

**Fluxo:**
1. Instalar edge device na empresa
2. Edge inicia e registra-se no central com `EDGE_ID`
3. Central retorna configuração (câmeras, pontos, etc.)
4. Edge configura MediaMTX e ANPR automaticamente

**Endpoints:**

```
POST   /edge/register      - Edge se registra no central
GET    /edge/config        - Edge busca configuração completa
PUT    /edge/config        - Central atualiza config do edge
POST   /edge/heartbeat     - Edge mantém conexão viva
```

---

### 8. Health Checks e Monitoramento

**Endpoints a adicionar no NestJS:**

```
GET    /health              - Status geral
GET    /health/database     - Conexão com PostgreSQL
GET    /health/mediamtx     - Status do MediaMTX
GET    /health/anpr         - Status do ANPR Service
GET    /health/cameras      - Status de cada câmera
```

**Para o central monitorar edges:**
- Cada edge envia heartbeat a cada 30s
- Central registra status e alerta se edge ficar offline
- Dashboard para ver status de todos os edges

---

### 9. Empacotar Pesos YOLO na Imagem Docker

**Problema atual:** O modelo YOLO é baixado do HuggingFace em runtime (`detector.py:37`).

**Solução:**
- Criar script para baixar pesos antes do build
- Copiar `weights/brod.pt` para dentro da imagem Docker
- Configurar variável de ambiente para path local

**Arquivo:** `anpr-service/app/config.py` ou `detector.py`
```python
# Usar caminho local em vez de download
WEIGHTS_PATH = os.getenv("WEIGHTS_PATH", "./weights/brod.pt")
```

---

## Nice to Have

### 10. Logging Centralizado

- Cada edge envia logs para o central via API ou fila
- Dashboard unificado para ver logs de todos os edges
- Alertas automáticos (edge offline, ANPR com erro, etc.)

### 11. Atualização Remota de Configuração

- Central pode atualizar config de ANPR (confiança, intervalo) remotamente
- Edge recebe atualização e aplica sem reiniciar

### 12. Backup e Restore

- Script para backup do banco local do edge
- Restore automático em caso de falha
- Sincronização incremental pós-restore

---

## Ordem de Implementação Sugerida

| Fase | Itens | Esforço |
|------|-------|---------|
| **1** | Dockerfiles + docker-compose.edge.yml | 1-2 dias |
| **2** | Corrigir RTSP hardcoded | 30 min |
| **3** | API básica de sync (HTTP polling) | 3-5 dias |
| **4** | API de provisionamento | 2-3 dias |
| **5** | Health checks | 1 dia |
| **6** | Multi-tenant completo (RLS) | 2-3 dias |
| **7** | Empacotar pesos YOLO | 30 min |

**Total estimado:** 10-15 dias para ter um edge funcional

---

## Referências

- MediaMTX API: https://bluenviron.github.io/mediamtx/
- PaddleOCR: https://paddleocr.bj.bcebos.com/
- YOLOv8: https://docs.ultralytics.com/
- NestJS Deployment: https://docs.nestjs.com/deployment
