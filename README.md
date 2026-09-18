# Controle Logística — API

API de controle de **entrada e saída de veículos** em unidades administrativas.

Backend **NestJS + PostgreSQL**, com reconhecimento automático de placas (ANPR)
delegado a um **microserviço Python** (PaddleOCR) que acessa câmeras IP.

## Arquitetura

```
Frontend ──HTTP──> NestJS (esta API) ──HTTP──> Microserviço ANPR (Python/PaddleOCR)
                        │                              │
                        └──────── PostgreSQL ──────────┘  (captura snapshot da câmera IP
                                                           e devolve a placa)
```

- **NestJS**: autenticação JWT, CRUD (empresas, unidades, pontos, veículos, câmeras,
  usuários) e registro das movimentações de entrada/saída.
- **anpr-service/**: recebe dados da câmera (ou uma imagem) e retorna a placa
  normalizada (formato Mercosul `ABC1D23` ou antigo `ABC-1234`).
- **PostgreSQL**: persistência.

## Como subir

```bash
# 1. Banco de dados + MediaMTX (transmissão das câmeras)
docker compose up -d

# 2. Microserviço ANPR (Python)
cd anpr-service
pip install -r requirements.txt
uvicorn app.main:app --port 8000

# 3. API NestJS
npm install
npm run start:dev

# 4. Usuário admin inicial (uma única vez)
npm run seed:admin
```

Documentação interativa (Swagger): http://localhost:3000/docs

## Transmissão ao vivo das câmeras (MediaMTX)

As câmeras IP (Hikvision) falam RTSP com autenticação **digest**, que o navegador
não consome diretamente. O **MediaMTX** (`docker compose up -d mediamtx`) puxa o
RTSP de cada câmera e reexpõe em **HLS** (e WebRTC) para o frontend. A fonte usada
é o substream (canal 102, H.264 640x360), único compatível com navegadores sem
transcodificar.

| Recurso | URL |
|---|---|
| HLS câmera entrada | `http://localhost:8888/camera-entrada/index.m3u8` |
| HLS câmera saída | `http://localhost:8888/camera-saida/index.m3u8` |

A configuração dos streams fica em `mediamtx.yml` (fontes RTSP de cada câmera,
com `sourceOnDemand` para só conectar quando houver espectador).

## Variáveis de ambiente (`.env`)

| Variável | Descrição | Padrão |
|---|---|---|
| `DB_HOST` / `DB_PORT` / `DB_USERNAME` / `DB_PASSWORD` / `DB_DATABASE` | Conexão com o PostgreSQL | `localhost` / `5434` / `postgres` / `postgres` / `controle_logistica` |
| `JWT_SECRET` | Chave de assinatura dos tokens | — |
| `JWT_EXPIRATION` | Validade do token JWT | `1d` |
| `ADMIN_NAME` / `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Admin criado pelo seed | `admin@sistema.com` / `admin123` |
| `ANPR_SERVICE_URL` | URL do microserviço Python (uvicorn binda em `127.0.0.1`; evite `localhost`, que pode resolver para IPv6 `::1` e falhar) | `http://127.0.0.1:8000` |
| `GOOGLE_VISION_API_KEY` | Chave da API do Google Vision (obrigatória quando o modo de reconhecimento usa API externa). Alias aceito: `GOOGLE_API_KEY` | — |
| `GOOGLE_VISION_ENDPOINT` | Base URL do Google Vision | `https://vision.googleapis.com` |
| `GOOGLE_VISION_PRICE_PER_1000` | Preço por 1000 chamadas, para estimar custo no log de interações | — |
| `ANPR_EXTERNAL_COST_CURRENCY` | Moeda usada no custo estimado | `USD` |
| `PORT` | Porta da API NestJS | `3000` |
| `OBS_KEY` / `OBS_SECRET` | Observabilidade (NestJS Observe) | — |

> Atenção: o `docker-compose.yml` expõe o Postgres na porta **5434** no host,
> por isso o `.env` usa `DB_PORT=5434`.

## Autenticação

Todas as rotas (exceto `/auth/login` e o healthcheck) exigem o header
`Authorization: Bearer <token>`.

```
POST /auth/login   { "email": "...", "password": "..." }
→ 200 { "access_token": "...", "user": { "id", "name", "email", "role", "companyId" },
        "company": { "id", "name", "companyName", "cnpj", "stateRegistration",
                     "address", "email", "active" } | null }

GET /auth/me      → 200 { "userId", "email", "role", "companyId",
                          "company": { ... } | null }
```

> As respostas de `/auth/login` e `/auth/me` incluem também os dados da empresa
> vinculada ao usuário (`company`), ou `null` quando o usuário não possui empresa.

O escopo dos dados é por empresa (`companyId` do token): usuários com `companyId`
definido só enxergam/alteram registros da própria empresa; o `admin` (sem empresa)
enxerga tudo.

> **`companyId` é sempre extraído do token JWT**, nunca do corpo da requisição.
> Entidades operacionais (ponto, câmera, veículo, movimento, unidade administrativa)
> exigem que o usuário autenticado tenha empresa vinculada — caso contrário, retorna 403.

## Fluxo de reconhecimento de placa (ANPR)

O front não acessa a câmera nem roda OCR — isso fica no microserviço Python. O fluxo:

1. **Cadastrar a câmera IP** (uma vez por unidade, vinculada a um ponto):

   ```
   POST /camera
   {
     "adminUnityId": "...", "pointId": "...", "name": "Portaria 1",
     "ip": "192.168.11.241",
     "port": 80, "username": "admin", "password": "...",
     "authType": "digest",           // "digest" ou "basic"
     "snapshotUrl": null             // opcional: se omitido, o ANPR tenta auto-descobrir
   }
   ```

   > O `companyId` é derivado automaticamente do token JWT (não envie no body).

   > O `pointId` identifica o ponto (portão) e seu `type` (`entry` | `exit` | `both`)
   > define o tipo da movimentação. Cadastre o ponto antes via `POST /point`.

2. **Registrar a passagem** do veículo — o front envia **apenas o `cameraId`**
   (nada sobre o veículo); o backend captura a imagem, reconhece a placa e registra:

   ```
   POST /movement/from-camera
   {
     "cameraId": "...",              // câmera cadastrada no passo 1
     "type": "entry",                // opcional; OBRIGATÓRIO se o ponto for "both"
     "dateTime": "2026-08-29T12:00:00.000Z",  // opcional (default: agora)
     "purpose": "Entrega de mercadoria",       // opcional
     "driverName": "João Silva",               // opcional
     "notes": "..."                             // opcional
   }
   → 201 { "movement": { id, pointId, vehicleId, type, dateTime, status, ... },
           "vehicle":  { id, plate, code, type, ... } }
   ```

   > O `companyId` é derivado automaticamente do token JWT (não envie no body).

   Internamente o backend: captura o snapshot da câmera → chama o ANPR → normaliza a
   placa → **cria o veículo se não existir** (com `type` = `visitor` e `code` sequencial
   gerado pelo backend no formato `VIS00N`)
   → registra a movimentação e devolve o movimento **com** os dados do veículo.

   O tipo (`entry`/`exit`) é resolvido a partir do `type` do ponto vinculado à câmera;
   se o ponto for `both`, o `type` deve ser informado no payload (senão retorna 400).

3. **Rotas auxiliares de ANPR** (para testar/integrar sem criar movimento):

   ```
   POST /anpr/reconhecer-camera/:id   → { placa, formato, confianca, raw, ... }
   POST /anpr/reconhecer-imagem   { "imagemBase64": "..." }   → { placa, formato, confianca, raw }
   ```

### Reconhecimento via API externa (opcional)

Além do OCR local (Python/PaddleOCR), o registro automático pode consultar uma API
externa (hoje Google Vision) para uma segunda leitura — considerada mais confiável.
O modo é configurável por empresa e por ponto:

| `anprRecognitionMode` | Comportamento |
|---|---|
| `local` (padrão) | Usa apenas o OCR local. Nenhuma chamada externa. |
| `verified` | O OCR local confirma a placa e a imagem é enviada à API externa; a placa externa **vence** quando aceita, senão a local é usada. |
| `external` | A API externa é autoritativa. Se não retornar placa válida, usa a local **apenas** se `anprExternalFallbackToLocal = true`; caso contrário, nenhum movimento é criado. |

Campos relacionados: `anprExternalProvider`, `anprExternalMinConfidence`,
`anprExternalTimeoutMs`, `anprExternalFallbackToLocal`, `anprExternalTrigger`.

**Quando acionar a API externa** (`anprExternalTrigger`):

| Valor | Comportamento |
|---|---|
| `after_confirmation` (padrão) | A externa só é chamada depois que o OCR local confirma a placa (N leituras). |
| `after_single_read` | A externa é chamada já na primeira leitura; se voltar com confiança ≥ `anprExternalMinConfidence`, o movimento é registrado na hora. Se não voltar placa confiável, **nenhum movimento é criado**. Ignorado no modo `local`. |

**Atalhos de placa cadastrada** (evitam a API externa):

| Campo | Efeito |
|---|---|
| `anprTrustRegisteredVehicle` | Placa que corresponde a um veículo já cadastrado é confirmada sem consultar a API externa (ainda aguarda as N leituras). |
| `anprRegisterOnFirstRead` | Se a **primeira leitura** identificar placa de veículo cadastrado com confiança ≥ `anprFirstReadMinConfidence`, registra o movimento imediatamente — sem N leituras e sem API externa. |
| `anprFirstReadMinConfidence` | Confiança mínima (0-1) para o atalho acima (padrão `0.85`). |

A origem do registro fica gravada no movimento (`recognitionProvider`):
`local`, `registered`, `external_fast` ou o nome do provider externo.

Para configurar (empresa ou ponto):

```
PATCH /company-config/:companyId
{
  "anprRecognitionMode": "verified",
  "anprExternalProvider": "google_vision",
  "anprExternalMinConfidence": 0.7,
  "anprExternalFallbackToLocal": true,
  "anprExternalTrigger": "after_single_read",
  "anprTrustRegisteredVehicle": true,
  "anprRegisterOnFirstRead": true,
  "anprFirstReadMinConfidence": 0.85
}
```

As credenciais **não** ficam no banco — são lidas de `GOOGLE_VISION_API_KEY`.
Cada chamada (incluindo falhas/timeout) é auditada com latência, status HTTP,
unidades cobráveis e custo estimado, consultável em:

```
GET /anpr/external-interactions?dateFrom=2026-08-01T00:00:00.000Z
→ { data, meta, summary }   // summary: calls, success, noPlate, failures,
                            //           avgLatencyMs, p95LatencyMs, totalCost, costCurrency
```

Para o **admin global** (`companyId = null`), há uma visão consolidada de todas as
empresas, com breakdown por empresa — restrita a ele (usuários de empresa recebem `403`):

```
GET /anpr/external-interactions/usage?dateFrom=2026-08-01T00:00:00.000Z
→ { data, meta, summary, byCompany }
  // byCompany: [{ companyId, companyName, calls, success, noPlate, failures,
  //               avgLatencyMs, totalCost }]
```

### Recorte de bordas da imagem (OCR)

Câmeras costumam sobrepor nas bordas o nome do canal e a data/hora, que o OCR
pode confundir com uma placa. Antes da detecção, o microserviço recorta uma
fração de cada lado (topo/base/laterais), focando no centro. O padrão é **10%**
por lado e pode ser ajustado em `anpr-service/.env`:

```
ANPR_CROP_BORDAS_PERCENT=0.10
```

O recorte é feito antes do YOLO e do fallback PaddleOCR; os bounding boxes
retornados são remapeados para as coordenadas da imagem original.

## Endpoints principais

| Método | Rota | Descrição |
|---|---|---|
| POST | `/auth/login` | Autenticação (retorna JWT) |
| GET | `/auth/me` | Usuário autenticado |
| POST | `/company` | Criar empresa |
| GET | `/admin-unity` | Listar unidades administrativas |
| POST | `/vehicle` | Criar veículo |
| POST | `/point` | Criar ponto (portão; entrada/saída/both) |
| POST | `/camera` | Cadastrar câmera IP |
| POST | `/movement` | Criar movimento (entrada/saída) com veículo já existente |
| POST | `/movement/from-camera` | Criar movimento a partir da câmera (ANPR) |
| POST | `/movement/from-observation` | Confirmar observação ANPR e registrar movimento |
| GET | `/movement` | Listar movimentos |
| GET | `/movement/pending-review` | Listar movimentos pendentes de revisão |
| POST | `/movement/:id/recalculate` | Recalcular movimento `pending_review` após correção/cadastro |
| POST | `/movement/discard` | Descartar movimentos `pending_review` em lote |
| POST | `/movement/reconcile` | Reprocessar pareamento entrada/saída de um período (máx. 31 dias) |
| POST | `/anpr/reconhecer-camera/:id` | Reconhecer placa pela câmera |
| POST | `/anpr/reconhecer-imagem` | Reconhecer placa em imagem base64 |
| GET | `/anpr/external-interactions` | Auditar chamadas às APIs externas (latência/custo) |
| GET | `/anpr/external-interactions/usage` | Uso global por empresa (somente admin raiz `companyId = null`) |
| GET/PATCH | `/company-config/:companyId` | Configurações da empresa (inclui modo de reconhecimento) |

Todas as entidades (`company`, `admin-unity`, `point`, `vehicle`, `camera`, `movement`)
possuem CRUD completo (GET, GET/:id, POST, PATCH/:id, DELETE/:id).

## Status dos movimentos

| Status | Significado |
|---|---|
| `open` | Movimento confirmado e ativo (veículo dentro da unidade / visita em andamento) |
| `closed` | Visita finalizada: a saída foi confirmada e fechou a entrada correspondente |
| `pending_review` | Placa não reconhecida no cadastro; aguardando correção ou cadastro do veículo |
| `discarded` | Descartado pelo operador (falso positivo do OCR); não conta como movimentação |

**Fechamento (`open` → `closed`):** quando uma saída confirmada é registrada, o sistema
fecha a entrada mais recente ainda em aberto do mesmo veículo na mesma unidade. Se um
movimento for descartado ou ajustado depois, use `POST /movement/reconcile` para
reprocessar o pareamento do período — entradas que ficaram sem saída voltam para
`open`, e saídas sem entrada correspondente não têm o status alterado.

## Códigos de erro

| Código | Significado |
|---|---|
| `400` | Dados de entrada inválidos |
| `401` | Não autenticado / credenciais inválidas |
| `403` | Acesso negado (ex.: tentar criar entidade sem empresa vinculada) |
| `404` | Registro não encontrado |
| `422` | Placa não reconhecida na imagem |
| `502` | Falha na câmera ou microserviço ANPR indisponível |

## Testes e lint

```bash
npm run test     # vitest
npm run lint     # oxlint
npm run build    # nest build
```
