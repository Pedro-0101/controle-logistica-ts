import { resolveAnprConfig, resolveInherited } from './anpr-config.js';

const company = {
  anprAutoRegister: true,
  anprAutoRegisterCooldownSeconds: 30,
  anprConfidenceThreshold: 0.9,
  anprRecognitionMode: 'verified',
  anprExternalMinConfidence: 0.8,
};

describe('resolveInherited', () => {
  it('ponto que herda ignora valores próprios', () => {
    expect(
      resolveInherited<string>(
        company,
        { inheritCompanyConfig: true, anprRecognitionMode: 'local' },
        'anprRecognitionMode',
      ),
    ).toBe('verified');
  });

  it('ponto sem herança prioriza o próprio valor', () => {
    expect(
      resolveInherited<string>(
        company,
        { inheritCompanyConfig: false, anprRecognitionMode: 'local' },
        'anprRecognitionMode',
      ),
    ).toBe('local');
  });

  it('ponto sem herança cai para a empresa quando o próprio valor é nulo', () => {
    expect(
      resolveInherited<string>(
        company,
        { inheritCompanyConfig: false, anprRecognitionMode: null },
        'anprRecognitionMode',
      ),
    ).toBe('verified');
  });

  it('ponto ausente usa a empresa', () => {
    expect(resolveInherited<string>(company, null, 'anprRecognitionMode')).toBe('verified');
  });
});

describe('resolveAnprConfig', () => {
  it('aplica defaults quando empresa e ponto não têm valores', () => {
    const resolved = resolveAnprConfig(null, { inheritCompanyConfig: false });
    expect(resolved).toEqual({
      anprAutoRegister: true,
      anprSaveUnrecognizedPhotos: true,
      anprAutoRegisterCooldownSeconds: 30,
      anprConfidenceThreshold: 0.85,
      anprMatchTimeoutSeconds: 5,
      anprConfirmationReads: 2,
      anprStaleAfterSeconds: 5,
      anprRecognitionMode: 'local',
      anprExternalProvider: 'google_vision',
      anprExternalMinConfidence: 0.7,
      anprExternalTimeoutMs: 8000,
      anprExternalFallbackToLocal: true,
      anprExternalTrigger: 'after_confirmation',
      anprTrustRegisteredVehicle: false,
      anprRegisterOnFirstRead: false,
      anprFirstReadMinConfidence: 0.85,
    });
  });

  it('herda da empresa quando o ponto herda, ignorando overrides', () => {
    const resolved = resolveAnprConfig(company, {
      inheritCompanyConfig: true,
      anprAutoRegister: false,
      anprConfidenceThreshold: 0.1,
    });
    expect(resolved.anprAutoRegister).toBe(true);
    expect(resolved.anprConfidenceThreshold).toBe(0.9);
    expect(resolved.anprRecognitionMode).toBe('verified');
  });

  it('ponto sobrescreve e completa o restante com a empresa', () => {
    const resolved = resolveAnprConfig(company, {
      inheritCompanyConfig: false,
      anprConfidenceThreshold: 0.5,
      anprRecognitionMode: 'external',
    });
    expect(resolved.anprConfidenceThreshold).toBe(0.5);
    expect(resolved.anprRecognitionMode).toBe('external');
    expect(resolved.anprAutoRegister).toBe(true);
    expect(resolved.anprExternalMinConfidence).toBe(0.8);
  });

  it('converte valores numéricos textuais', () => {
    const resolved = resolveAnprConfig(
      {
        anprExternalMinConfidence: '0.6',
        anprExternalTimeoutMs: '5000',
        anprFirstReadMinConfidence: '0.95',
      },
      null,
    );
    expect(resolved.anprExternalMinConfidence).toBe(0.6);
    expect(resolved.anprExternalTimeoutMs).toBe(5000);
    expect(resolved.anprFirstReadMinConfidence).toBe(0.95);
  });
});
