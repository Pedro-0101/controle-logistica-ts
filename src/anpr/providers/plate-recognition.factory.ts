import { Injectable } from '@nestjs/common';
import { GoogleVisionProvider } from './google-vision.provider.js';
import type { PlateRecognitionProvider } from './plate-recognition.types.js';

/** Resolve o provider externo configurado por empresa/ponto. */
@Injectable()
export class PlateRecognitionProviderFactory {
  constructor(private readonly googleVision: GoogleVisionProvider) {}

  get(name: string): PlateRecognitionProvider | null {
    switch (name) {
      case 'google_vision':
        return this.googleVision;
      default:
        return null;
    }
  }
}
