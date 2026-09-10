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
| `ANPR_SERVICE_URL` | URL do microserviço Python | `http://localhost:8000` |
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
     "snapshotUrl": null,            // opcional: se omitido, o ANPR tenta auto-descobrir
     "companyId": "..."
   }
   ```

   > O `pointId` identifica o ponto (portão) e seu `type` (`entry` | `exit` | `both`)
   > define o tipo da movimentação. Cadastre o ponto antes via `POST /point`.

2. **Registrar a passagem** do veículo — o front envia **apenas o `cameraId`**
   (nada sobre o veículo); o backend captura a imagem, reconhece a placa e registra:

   ```
   POST /movement/from-camera
   {
     "cameraId": "...",              // câmera cadastrada no passo 1
     "type": "entry",                // opcional; OBRIGATÓRIO se o ponto for "both"
     "companyId": "...",             // opcional; OBRIGATÓRIO para admin (sem empresa no token)
     "dateTime": "2026-08-29T12:00:00.000Z",  // opcional (default: agora)
     "purpose": "Entrega de mercadoria",       // opcional
     "driverName": "João Silva",               // opcional
     "notes": "..."                             // opcional
   }
   → 201 { "movement": { id, pointId, vehicleId, type, dateTime, status, ... },
           "vehicle":  { id, plate, code, type, ... } }
   ```

   Internamente o backend: captura o snapshot da câmera → chama o ANPR → normaliza a
   placa → **cria o veículo se não existir** (com `code` = placa e `type` = `visitor`)
   → registra a movimentação e devolve o movimento **com** os dados do veículo.

   O tipo (`entry`/`exit`) é resolvido a partir do `type` do ponto vinculado à câmera;
   se o ponto for `both`, o `type` deve ser informado no payload (senão retorna 400).

3. **Rotas auxiliares de ANPR** (para testar/integrar sem criar movimento):

   ```
   POST /anpr/reconhecer-camera/:id   → { placa, formato, confianca, raw, ... }
   POST /anpr/reconhecer-imagem   { "imagemBase64": "..." }   → { placa, formato, confianca, raw }
   ```

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
| GET | `/movement` | Listar movimentos |
| POST | `/anpr/reconhecer-camera/:id` | Reconhecer placa pela câmera |
| POST | `/anpr/reconhecer-imagem` | Reconhecer placa em imagem base64 |

Todas as entidades (`company`, `admin-unity`, `point`, `vehicle`, `camera`, `movement`)
possuem CRUD completo (GET, GET/:id, POST, PATCH/:id, DELETE/:id).

## Códigos de erro

| Código | Significado |
|---|---|
| `400` | Dados de entrada inválidos |
| `401` | Não autenticado / credenciais inválidas |
| `404` | Registro não encontrado |
| `422` | Placa não reconhecida na imagem |
| `502` | Falha na câmera ou microserviço ANPR indisponível |

## Testes e lint

```bash
npm run test     # vitest
npm run lint     # oxlint
npm run build    # nest build
```
