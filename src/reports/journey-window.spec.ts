import {
  getLocalParts,
  intervalWithinJourneyWindow,
  isWithinJourneyWindow,
  parseHHMM,
  sameLocalDay,
  toJourneyWindow,
} from './journey-window.js';

describe('journey-window', () => {
  describe('parseHHMM', () => {
    it('converte HH:MM em minutos', () => {
      expect(parseHHMM('00:00')).toBe(0);
      expect(parseHHMM('06:30')).toBe(390);
      expect(parseHHMM('23:59')).toBe(1439);
    });

    it('retorna 0 para valores inválidos', () => {
      expect(parseHHMM('24:00')).toBe(0);
      expect(parseHHMM('abc')).toBe(0);
      expect(parseHHMM(undefined)).toBe(0);
    });
  });

  describe('toJourneyWindow', () => {
    it('usa padrões quando não configurado', () => {
      const window = toJourneyWindow({});
      expect(window.startMinutes).toBe(0);
      expect(window.endMinutes).toBe(1439);
      expect(window.weekdays.size).toBe(7);
      expect(window.timeZone).toBe('America/Sao_Paulo');
    });

    it('interpreta dias em CSV', () => {
      const window = toJourneyWindow({ journeyWindowDays: '1,3,5' });
      expect([...window.weekdays].sort()).toEqual([1, 3, 5]);
    });
  });

  describe('getLocalParts', () => {
    it('converte para hora local do fuso', () => {
      const parts = getLocalParts(new Date('2026-09-01T12:00:00.000Z'), 'America/Sao_Paulo');
      expect(parts.minutes).toBe(9 * 60);
      expect(parts.weekday).toBe(2);
      expect(parts.dayKey).toBe('2026-09-01');
    });
  });

  describe('isWithinJourneyWindow', () => {
    const window = toJourneyWindow({
      journeyWindowStart: '06:00',
      journeyWindowEnd: '22:00',
      timezone: 'America/Sao_Paulo',
    });

    it('aceita instante dentro da janela', () => {
      expect(isWithinJourneyWindow(new Date('2026-09-01T12:00:00.000Z'), window)).toBe(true);
    });

    it('rejeita instante antes da janela', () => {
      expect(isWithinJourneyWindow(new Date('2026-09-01T08:00:00.000Z'), window)).toBe(false);
    });

    it('rejeita dia da semana não configurado', () => {
      const weekdays = toJourneyWindow({
        journeyWindowStart: '00:00',
        journeyWindowEnd: '23:59',
        journeyWindowDays: '1,3,5',
        timezone: 'America/Sao_Paulo',
      });
      expect(isWithinJourneyWindow(new Date('2026-09-01T12:00:00.000Z'), weekdays)).toBe(false);
    });
  });

  describe('sameLocalDay', () => {
    it('detecta virada de dia no fuso local', () => {
      const late = new Date('2026-09-01T02:00:00.000Z');
      const noon = new Date('2026-09-01T12:00:00.000Z');
      expect(sameLocalDay(late, noon, 'America/Sao_Paulo')).toBe(false);
    });
  });

  describe('intervalWithinJourneyWindow', () => {
    const window = toJourneyWindow({
      journeyWindowStart: '06:00',
      journeyWindowEnd: '22:00',
      timezone: 'America/Sao_Paulo',
    });

    it('aceita intervalo no mesmo dia dentro da janela', () => {
      expect(
        intervalWithinJourneyWindow(
          new Date('2026-09-01T20:00:00.000Z'),
          new Date('2026-09-01T21:00:00.000Z'),
          window,
        ),
      ).toBe(true);
    });

    it('rejeita intervalo que cruza a meia-noite', () => {
      expect(
        intervalWithinJourneyWindow(
          new Date('2026-09-01T23:30:00.000Z'),
          new Date('2026-09-02T09:30:00.000Z'),
          window,
        ),
      ).toBe(false);
    });
  });
});
