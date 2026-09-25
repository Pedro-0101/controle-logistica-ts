import { ConfigService } from '@nestjs/config';
import { MediaMTXService } from './mediamtx.service.js';
import type { Camera } from './entities/camera.entity.js';

const config = { get: () => undefined } as unknown as ConfigService;

function makeCamera(overrides: Partial<Camera> = {}): Camera {
  return {
    id: 'camera-1',
    ip: '192.168.61.162',
    port: 80,
    username: 'admin',
    password: 'secret',
    snapshotUrl: null,
    ...overrides,
  } as Camera;
}

type RouteResult = { status: number; body?: string };
type Router = (url: string) => RouteResult;

function stubFetch(router: Router) {
  const fetchMock = vi.fn(async (url: string) => {
    const result = router(url);
    return {
      ok: result.status >= 200 && result.status < 300,
      status: result.status,
      text: async () => result.body ?? '',
      json: async () => JSON.parse(result.body ?? '{}'),
    } as unknown as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function bodyOf(fetchMock: ReturnType<typeof vi.fn>): { source: string } {
  const call = fetchMock.mock.calls.find(([url]) =>
    String(url).includes('/v3/config/paths/add/'),
  );
  return JSON.parse(call?.[1].body as string);
}

describe('MediaMTXService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('detecta Dahua/Intelbras e usa o substream realmonitor', async () => {
    const fetchMock = stubFetch((url) => {
      if (url.endsWith('/ISAPI/System/deviceInfo')) return { status: 404 };
      if (url.endsWith('/cgi-bin/snapshot.cgi')) return { status: 401 };
      return { status: 200 };
    });

    const service = new MediaMTXService(config);
    await service.addPath(makeCamera());

    expect(bodyOf(fetchMock).source).toBe(
      'rtsp://admin:secret@192.168.61.162:554/cam/realmonitor?channel=1&subtype=1',
    );
  });

  it('detecta Hikvision e usa o substream 102', async () => {
    const fetchMock = stubFetch((url) => {
      if (url.endsWith('/ISAPI/System/deviceInfo')) return { status: 401 };
      return { status: 200 };
    });

    const service = new MediaMTXService(config);
    await service.addPath(makeCamera({ ip: '192.168.11.241' }));

    expect(bodyOf(fetchMock).source).toBe(
      'rtsp://admin:secret@192.168.11.241:554/Streaming/Channels/102',
    );
  });

  it('cai no padrão Hikvision quando a câmera está inacessível', async () => {
    const fetchMock = stubFetch((url) => {
      if (url.startsWith('http://localhost:9997')) return { status: 200 };
      throw new Error('offline');
    });

    const service = new MediaMTXService(config);
    await service.addPath(makeCamera());

    expect(bodyOf(fetchMock).source).toContain('/Streaming/Channels/102');
  });

  it('infere o path pelo snapshotUrl quando informado (Dahua)', async () => {
    const fetchMock = stubFetch(() => ({ status: 200 }));

    const service = new MediaMTXService(config);
    await service.addPath(
      makeCamera({ snapshotUrl: 'http://192.168.61.162/cgi-bin/snapshot.cgi' }),
    );

    expect(bodyOf(fetchMock).source).toContain('/cam/realmonitor?channel=1&subtype=1');
  });

  it('infere o path pelo snapshotUrl quando informado (Hikvision)', async () => {
    const fetchMock = stubFetch(() => ({ status: 200 }));

    const service = new MediaMTXService(config);
    await service.addPath(
      makeCamera({ snapshotUrl: 'http://192.168.11.241/ISAPI/Streaming/channels/102/picture' }),
    );

    expect(bodyOf(fetchMock).source).toContain('/Streaming/Channels/102');
  });

  it('usa canal 101 quando o snapshot aponta canal principal', async () => {
    const fetchMock = stubFetch(() => ({ status: 200 }));

    const service = new MediaMTXService(config);
    await service.addPath(
      makeCamera({ snapshotUrl: 'http://192.168.11.241/Streaming/Channels/101' }),
    );

    expect(bodyOf(fetchMock).source).toContain('/Streaming/Channels/101');
  });

  it('recria o path quando já existe', async () => {
    let addCalls = 0;
    const fetchMock = stubFetch((url) => {
      if (url.endsWith('/ISAPI/System/deviceInfo')) return { status: 404 };
      if (url.endsWith('/cgi-bin/snapshot.cgi')) return { status: 401 };
      if (url.includes('/v3/config/paths/add/')) {
        addCalls += 1;
        return addCalls === 1
          ? { status: 400, body: 'path already exists' }
          : { status: 200 };
      }
      return { status: 200 };
    });

    const service = new MediaMTXService(config);
    await service.addPath(makeCamera());

    const deleteCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes('/v3/config/paths/delete/'),
    );
    expect(deleteCall).toBeDefined();
    expect(addCalls).toBe(2);
  });

  it('remove path ignorando 404', async () => {
    const fetchMock = stubFetch(() => ({ status: 404 }));

    const service = new MediaMTXService(config);
    await service.removePath('camera-1');

    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes('/v3/config/paths/delete/')),
    ).toBe(true);
  });

  it('lista paths existentes', async () => {
    stubFetch(() => ({
      status: 200,
      body: JSON.stringify({
        itemCount: 2,
        pageCount: 1,
        items: [{ name: 'camera-1' }, {}],
      }),
    }));

    const service = new MediaMTXService(config);
    await expect(service.pathExists('1')).resolves.toBe(true);
    await expect(service.pathExists('2')).resolves.toBe(false);
    await expect(service.listPaths()).resolves.toEqual(['camera-1']);
  });

  it('retorna vazio quando a API do MediaMTX falha', async () => {
    stubFetch(() => ({ status: 500 }));

    const service = new MediaMTXService(config);
    await expect(service.listPaths()).resolves.toEqual([]);
    await expect(service.pathExists('camera-1')).resolves.toBe(false);
  });

  it('monta as URLs de streaming', () => {
    const service = new MediaMTXService(config);

    expect(service.getStreamUrls('camera-1')).toEqual({
      hlsUrl: 'http://localhost:8888/camera-camera-1/index.m3u8',
      webrtcUrl: 'http://localhost:8889/camera-camera-1',
      rtspUrl: 'rtsp://localhost:8554/camera-camera-1',
    });
  });
});
