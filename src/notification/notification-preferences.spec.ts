import { resolveNotificationPreference } from './notification-preferences.js';

const cameraId = '11111111-1111-4111-8111-111111111111';

describe('resolveNotificationPreference', () => {
  it('usa o catálogo quando não há configuração', () => {
    const resolved = resolveNotificationPreference('movement.registered', null, null);

    expect(resolved.enabled).toBe(true);
    expect(resolved.filters).toEqual({ statuses: ['pending_review'] });
    expect(resolved.source).toBe('catalog');
  });

  it('a configuração da empresa sobrescreve o catálogo', () => {
    const resolved = resolveNotificationPreference(
      'camera.error',
      { enabled: false, defaultFilters: { kinds: ['offline'] }, allowUserOverride: true },
      null,
    );

    expect(resolved.enabled).toBe(false);
    expect(resolved.filters).toEqual({ kinds: ['offline'] });
    expect(resolved.source).toBe('company');
  });

  it('a preferência do usuário sobrescreve a empresa', () => {
    const resolved = resolveNotificationPreference(
      'camera.error',
      { enabled: false, defaultFilters: { kinds: ['offline'] }, allowUserOverride: true },
      { enabled: true, filters: { cameraIds: [cameraId] } },
    );

    expect(resolved.enabled).toBe(true);
    expect(resolved.filters).toEqual({ cameraIds: [cameraId], kinds: ['offline'] });
    expect(resolved.source).toBe('user');
  });

  it('ignora a preferência do usuário quando a empresa não permite sobrescrita', () => {
    const resolved = resolveNotificationPreference(
      'camera.error',
      { enabled: true, defaultFilters: {}, allowUserOverride: false },
      { enabled: false, filters: { cameraIds: [cameraId] } },
    );

    expect(resolved.enabled).toBe(true);
    expect(resolved.filters).toEqual({});
    expect(resolved.source).toBe('company');
  });
});
