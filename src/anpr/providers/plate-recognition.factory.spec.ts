import { ConfigService } from '@nestjs/config';
import { GoogleVisionProvider } from './google-vision.provider.js';
import { PlateRecognitionProviderFactory } from './plate-recognition.factory.js';

const config = { get: () => undefined } as unknown as ConfigService;

describe('PlateRecognitionProviderFactory', () => {
  it('resolve o provider google_vision', () => {
    const google = new GoogleVisionProvider(config);
    const factory = new PlateRecognitionProviderFactory(google);
    expect(factory.get('google_vision')).toBe(google);
  });

  it('retorna null para provider desconhecido', () => {
    const factory = new PlateRecognitionProviderFactory(new GoogleVisionProvider(config));
    expect(factory.get('outro')).toBeNull();
  });
});
