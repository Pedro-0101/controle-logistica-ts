import { BadRequestException } from '@nestjs/common';

/**
 * Resolve o sentido (entrada/saída) de um movimento a partir do tipo do ponto.
 *
 * - Ponto `entry`/`exit`: define o sentido; um `type` divergente é rejeitado.
 * - Ponto `both`: exige que o `type` seja informado no payload.
 */
export function resolveMovementType(
  pointType: string,
  type?: 'entry' | 'exit',
): 'entry' | 'exit' {
  if (pointType === 'entry' || pointType === 'exit') {
    if (type && type !== pointType) throw new BadRequestException('Tipo incompatível com o sentido do ponto');
    return pointType;
  }
  if (type) {
    return type;
  }
  throw new BadRequestException(
    'O ponto vinculado à câmera aceita entrada e saída; informe o tipo (entry/exit) no payload',
  );
}
