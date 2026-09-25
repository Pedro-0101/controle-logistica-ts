/**
 * Resolução da configuração ANPR considerando a herança ponto → empresa.
 *
 * Um ponto com `inheritCompanyConfig = true` usa sempre os valores da empresa.
 * Caso contrário, cada campo usa o valor do ponto e, quando nulo, cai de volta
 * para o valor da empresa. Fonte única de verdade usada pelo auto-registro e
 * pelo monitoramento.
 */
export interface ResolvedAnprConfig {
  anprAutoRegister: boolean;
  anprSaveUnrecognizedPhotos: boolean;
  anprAutoRegisterCooldownSeconds: number;
  anprConfidenceThreshold: number;
  anprMatchTimeoutSeconds: number;
  anprConfirmationReads: number;
  anprStaleAfterSeconds: number;
  anprRecognitionMode: string;
  anprExternalProvider: string;
  anprExternalMinConfidence: number;
  anprExternalTimeoutMs: number;
  anprExternalFallbackToLocal: boolean;
  anprExternalTrigger: string;
  anprTrustRegisteredVehicle: boolean;
  anprRegisterOnFirstRead: boolean;
  anprFirstReadMinConfidence: number;
}

/**
 * Extrai um campo aplicando a herança configurada no ponto.
 * `point` ausente equivale a herdar da empresa.
 */
export function resolveInherited<T>(
  company: object | null | undefined,
  point: object | null | undefined,
  field: string,
): T | undefined {
  const companyRecord = company as Record<string, unknown> | null | undefined;
  const pointRecord = point as Record<string, unknown> | null | undefined;
  if (pointRecord?.inheritCompanyConfig === true || !pointRecord) {
    return (companyRecord?.[field] as T | undefined) ?? undefined;
  }
  return ((pointRecord[field] ?? companyRecord?.[field]) as T | undefined) ?? undefined;
}

export function resolveAnprConfig(
  companyConfig: object | null | undefined,
  point: object | null | undefined,
): ResolvedAnprConfig {
  const source = <T>(field: string): T | undefined => resolveInherited<T>(companyConfig, point, field);
  return {
    anprAutoRegister: source<boolean>('anprAutoRegister') ?? true,
    anprSaveUnrecognizedPhotos: source<boolean>('anprSaveUnrecognizedPhotos') ?? true,
    anprAutoRegisterCooldownSeconds: source<number>('anprAutoRegisterCooldownSeconds') ?? 30,
    anprConfidenceThreshold: source<number>('anprConfidenceThreshold') ?? 0.85,
    anprMatchTimeoutSeconds: source<number>('anprMatchTimeoutSeconds') ?? 5,
    anprConfirmationReads: source<number>('anprConfirmationReads') ?? 2,
    anprStaleAfterSeconds: source<number>('anprStaleAfterSeconds') ?? 5,
    anprRecognitionMode: source<string>('anprRecognitionMode') ?? 'local',
    anprExternalProvider: source<string>('anprExternalProvider') ?? 'google_vision',
    anprExternalMinConfidence: Number(source('anprExternalMinConfidence') ?? 0.7),
    anprExternalTimeoutMs: Number(source('anprExternalTimeoutMs') ?? 8000),
    anprExternalFallbackToLocal: source<boolean>('anprExternalFallbackToLocal') ?? true,
    anprExternalTrigger: source<string>('anprExternalTrigger') ?? 'after_confirmation',
    anprTrustRegisteredVehicle: source<boolean>('anprTrustRegisteredVehicle') ?? false,
    anprRegisterOnFirstRead: source<boolean>('anprRegisterOnFirstRead') ?? false,
    anprFirstReadMinConfidence: Number(source('anprFirstReadMinConfidence') ?? 0.85),
  };
}
