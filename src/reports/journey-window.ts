/**
 * Janela de jornada usada nos relatórios de tempo.
 *
 * Os movimentos são gravados em timestamptz (instantes absolutos), mas a
 * jornada é expressa em hora local da empresa. Este módulo traduz um instante
 * para a hora/dia local do fuso configurado, sem dependências externas.
 */

export interface JourneyWindowConfig {
  timezone?: string;
  journeyWindowStart?: string;
  journeyWindowEnd?: string;
  journeyWindowDays?: string;
}

export interface JourneyWindow {
  startMinutes: number;
  endMinutes: number;
  weekdays: Set<number>;
  timeZone: string;
}

export interface LocalParts {
  weekday: number;
  minutes: number;
  dayKey: string;
}

const DEFAULT_DAYS = [1, 2, 3, 4, 5, 6, 7];
const WEEKDAY_INDEX: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
}

/** Converte "HH:MM" em minutos desde a meia-noite. Retorna 0 quando inválido. */
export function parseHHMM(value: string | undefined): number {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value ?? '');
  if (!match) return 0;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Normaliza a configuração de jornada em uma estrutura de consulta. */
export function toJourneyWindow(config: JourneyWindowConfig): JourneyWindow {
  const timeZone = config.timezone?.trim() || 'America/Sao_Paulo';
  const parsed = (config.journeyWindowDays ?? '')
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7);
  const days = parsed.length > 0 ? parsed : DEFAULT_DAYS;

  return {
    startMinutes: parseHHMM(config.journeyWindowStart),
    endMinutes: parseHHMM(config.journeyWindowEnd ?? '23:59'),
    weekdays: new Set(days),
    timeZone,
  };
}

/** Extrai hora local (minutos), dia da semana ISO (1=segunda) e chave do dia. */
export function getLocalParts(date: Date, timeZone: string): LocalParts {
  const parts = getFormatter(timeZone).formatToParts(date);
  const valueOf = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';

  const weekday = WEEKDAY_INDEX[valueOf('weekday')] ?? 1;
  const minutes = Number(valueOf('hour')) * 60 + Number(valueOf('minute'));
  const dayKey = `${valueOf('year')}-${valueOf('month')}-${valueOf('day')}`;

  return { weekday, minutes, dayKey };
}

/** Verifica se um instante cai dentro da janela de jornada. */
export function isWithinJourneyWindow(date: Date, window: JourneyWindow): boolean {
  const { weekday, minutes } = getLocalParts(date, window.timeZone);
  if (!window.weekdays.has(weekday)) return false;
  if (window.startMinutes <= window.endMinutes) {
    return minutes >= window.startMinutes && minutes <= window.endMinutes;
  }
  // Janela que cruza a meia-noite (ex.: 22:00 → 06:00).
  return minutes >= window.startMinutes || minutes <= window.endMinutes;
}

/** Indica se dois instantes caem no mesmo dia local. */
export function sameLocalDay(a: Date, b: Date, timeZone: string): boolean {
  return getLocalParts(a, timeZone).dayKey === getLocalParts(b, timeZone).dayKey;
}

/**
 * Um intervalo é "dentro da jornada" quando início e fim estão na janela e no
 * mesmo dia local. Caso contrário (pernoite, fim de semana) é tratado como
 * atípico e excluído das estatísticas de tempo.
 */
export function intervalWithinJourneyWindow(
  from: Date,
  to: Date,
  window: JourneyWindow,
): boolean {
  return (
    isWithinJourneyWindow(from, window) &&
    isWithinJourneyWindow(to, window) &&
    sameLocalDay(from, to, window.timeZone)
  );
}
