import { createMovementFromCameraSchema } from './create-movement-from-camera.schema.js';

describe('createMovementFromCameraSchema', () => {
  it('deve aceitar payload com apenas cameraId', () => {
    const result = createMovementFromCameraSchema.safeParse({ cameraId: 'camera-1' });

    expect(result.success).toBe(true);
  });

  it('deve exigir cameraId', () => {
    const result = createMovementFromCameraSchema.safeParse({});

    expect(result.success).toBe(false);
  });

  it('type e companyId devem ser opcionais', () => {
    const result = createMovementFromCameraSchema.safeParse({
      cameraId: 'camera-1',
      type: 'exit',
      companyId: 'company-1',
    });

    expect(result.success).toBe(true);
    expect(result.data?.type).toBe('exit');
    expect(result.data?.companyId).toBe('company-1');
  });

  it('não deve aceitar pointId nem vehicleId no payload', () => {
    const result = createMovementFromCameraSchema.safeParse({
      cameraId: 'camera-1',
      pointId: 'point-1',
      vehicleId: 'vehicle-1',
    });

    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty('pointId');
    expect(result.data).not.toHaveProperty('vehicleId');
  });
});
