import { createCameraSchema } from './create-camera.schema.js';

describe('createCameraSchema', () => {
  const base = {
    adminUnityId: 'unity-1',
    pointId: 'point-1',
    name: 'Portaria 1',
    ip: '192.168.11.241',
  };

  it('deve aceitar um payload válido com pointId', () => {
    const result = createCameraSchema.safeParse(base);

    expect(result.success).toBe(true);
    expect(result.data?.pointId).toBe('point-1');
  });

  it('deve exigir pointId', () => {
    const result = createCameraSchema.safeParse({ ...base, pointId: undefined });

    expect(result.success).toBe(false);
  });
});
