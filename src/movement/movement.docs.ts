export const MOVEMENT_DOCS = {
  create:
    'Registra a entrada ou saída de um veículo em uma unidade administrativa.',
  createFromCamera:
    'Busca a observação atual da câmera e registra o movimento em uma única chamada.\n\n' +
    '**Recomendação:** Prefira usar `GET /camera/:id/current-observation` + `POST /movement/from-observation` ' +
    'para ter controle visual do que está sendo confirmado pelo porteiro.\n\n' +
    'Equivalente a chamar `current-observation` + `from-observation` internamente.\n\n' +
    'O front envia apenas o `cameraId` (e dados operacionais opcionais) — nada sobre o veículo. ' +
    'O backend resolve o tipo do movimento (entrada/saída) a partir do ponto vinculado à câmera, ' +
    'busca/cria o veículo pela placa reconhecida e retorna o movimento com os dados do veículo.',
  createFromObservation:
    'Confirma a leitura de placa de uma câmera e registra a entrada/saída do veículo.\n\n' +
    '**Fluxo de uso:**\n' +
    '1. Front consulta `GET /camera/:id/current-observation` e obtém o `observationId` quando status = `"confirmed"`\n' +
    '2. Porteiro confirma o atendimento (ex: abre cancela)\n' +
    '3. Front envia este endpoint com o `observationId`\n' +
    '4. Backend valida se a observação ainda está fresca e consistente com o estado atual da câmera\n' +
    '5. Busca ou cria o veículo pela placa reconhecida\n' +
    '6. Registra o movimento (entrada/saída) vinculado ao ponto da câmera\n\n' +
    '**Idempotência:**\n' +
    'Duas confirmações da mesma observação retornam o mesmo movimento (protegido por lock pessimista no banco). ' +
    'Isso permite retry seguro caso a resposta HTTP original tenha sido perdida.\n\n' +
    '**Validações:**\n' +
    '- A observação deve estar com status `"confirmed"` e não expirada\n' +
    '- O `observationId` deve corresponder à observação atual da câmera no Python\n' +
    '- A câmera, ponto e unidade devem estar ativos e vinculados à empresa do usuário\n' +
    '- O tipo do movimento (entry/exit) é resolvido automaticamente pelo ponto da câmera\n\n' +
    '**Erros comuns:**\n' +
    '- 409: Observação expirou (o veículo saiu da câmera) → consultar nova observação\n' +
    '- 404: Observação não encontrada ou não pertence à empresa\n' +
    '- 400: Ponto inativo ou tipo incompatível',
  discard:
    'Marca como `discarded` uma lista de movimentos com status `pending_review`.\n\n' +
    '**Uso no frontend:**\n' +
    '1. Operador visualiza os pendentes via `GET /movement/pending-review`\n' +
    '2. Seleciona um ou vários movimentos (ex.: leituras incorretas do OCR)\n' +
    '3. Front envia `POST /movement/discard` com a lista de `ids` selecionados\n\n' +
    '**Importante:** o descarte é individual — apenas os IDs informados são ' +
    'alterados. Outros movimentos pendentes com a mesma placa **não** são afetados.\n\n' +
    '**Resposta:** lista dos movimentos atualizados com `status: "discarded"`.\n\n' +
    '**Erros comuns:**\n' +
    '- `404`: algum dos IDs informados não existe ou não pertence à empresa do usuário\n' +
    '- `409`: algum dos movimentos não está com status `pending_review`',
  reconcile:
    'Reprocessa o pareamento de entrada/saída de um período e recalcula o status dos movimentos confirmados.\n\n' +
    '**Quando usar:** após descartar ou ajustar movimentos, para reavaliar quais visitas devem ficar `closed`.\n\n' +
    '**Como funciona:**\n' +
    '1. Carrega os movimentos `open`/`closed` (com veículo) do período\n' +
    '2. Agrupa por veículo + unidade administrativa e ordena por data\n' +
    '3. Uma saída fecha a entrada mais recente ainda em aberto (o par fica `closed`)\n' +
    '4. Entradas que ficaram sem saída voltam para `open`\n' +
    '5. Saídas sem entrada correspondente **não** têm o status alterado\n\n' +
    '`pending_review` e `discarded` não participam do pareamento.\n\n' +
    '**Limite:** período máximo de 31 dias. Empresa é inferida do usuário; admin global deve informar `companyId`.',
  findAll:
    'Retorna uma lista paginada de movimentos com dados do ponto, veículo e câmera vinculados.\n\n' +
    '**Filtros disponíveis:** tipo, status, ponto, veículo, placa, motorista, motivo, auto-registrado, período.\n' +
    '**Busca livre:** campo `search` pesquisa por placa, motorista, motivo e notas.',
  findPendingReview:
    'Retorna movimentos criados automaticamente onde a placa não foi encontrada na base de dados.\n\n' +
    '**Cada item do array contém:**\n' +
    '- `id`: UUID do movimento (usar no endpoint de recálculo)\n' +
    '- `recognizedPlate`: Placa que o OCR leu (pode conter erros de leitura)\n' +
    '- `photoPath`: Chave da foto de evidência no storage (null se não salva). ' +
    'Para exibir, use `GET /movement/:id/evidence`\n' +
    '- `dateTime`: Data/hora ISO 8601 em que o veículo passou na câmera\n' +
    '- `type`: `entry` (entrada) ou `exit` (saída)\n' +
    '- `pointId`: UUID do ponto/portão da câmera\n' +
    '- `observationId`: UUID da observação ANPR vinculada\n\n' +
    '**Foto de evidência:** para exibir a imagem ao operador, use `GET /movement/:id/evidence` ' +
    '(o `photoPath` é apenas a chave interna no storage).\n\n' +
    '**Importante:** esta rota é estática e precisa ser declarada antes de `GET /movement/:id` ' +
    'para não ser capturada pelo parâmetro dinâmico.',
  evidence:
    'Retorna a foto de evidência (JPEG) de um movimento a partir do seu ID.\n\n' +
    '**Quando usar:** movimentos automáticos com placa não reconhecida aguardando revisão (`pending_review`). ' +
    'A imagem só existe quando `anprSaveUnrecognizedPhotos=true` na config da empresa/ponto e a placa não foi encontrada no cadastro de veículos.\n\n' +
    '**Ciclo de vida:** a foto é mantida apenas enquanto a ocorrência aguarda revisão. Ao confirmar ' +
    '(`POST /movement/:id/recalculate`) ou descartar (`POST /movement/discard`), o objeto é removido do ' +
    'storage e o `photoPath` da observação é limpo; chamadas posteriores retornam `404`.\n\n' +
    '**Resolução:** o backend localiza a observação vinculada ao movimento e busca o arquivo no storage ' +
    '(MinIO ou disco local).\n\n' +
    '**Uso no frontend:** como a rota exige o token JWT no header `Authorization`, faça o download via `fetch` ' +
    'e monte um `blob:` URL para exibir no `<img>`:\n' +
    '```js\n' +
    'const res = await fetch(`/movement/${id}/evidence`, { headers: { Authorization: `Bearer ${token}` } });\n' +
    'const url = URL.createObjectURL(await res.blob());\n' +
    '```\n\n' +
    '**Erros comuns:**\n' +
    '- `404`: movimento inexistente/fora da empresa, sem observação vinculada, sem foto salva ou objeto ausente no storage',
  findOne: 'Retorna os dados de um movimento específico pelo seu UUID.',
  update:
    'Atualiza parcialmente os dados de um movimento existente. Todos os campos são opcionais.',
  remove: 'Remove permanentemente um movimento do sistema.',
} as const;
