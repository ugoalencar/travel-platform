import { ValidationError } from './errors';

export interface BackupScheduleInput {
  enabled: boolean;
  dailyTime: string;
  timezone: string;
}

export interface NextBackupRun {
  nextRunAt: Date;
  nextLocalDate: string;
}

const invalid = (message: string): never => { throw new ValidationError(message); };
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function parseBackupScheduleInput(value: unknown): BackupScheduleInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid('Request body must be an object.');
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some(key => !['enabled', 'dailyTime', 'timezone'].includes(key))) return invalid('Request contains an unsupported field.');
  if (typeof body.enabled !== 'boolean') return invalid('Field "enabled" must be a boolean.');
  if (typeof body.dailyTime !== 'string' || !TIME_PATTERN.test(body.dailyTime)) return invalid('Field "dailyTime" must use HH:mm.');
  if (typeof body.timezone !== 'string' || body.timezone.length > 100 || !body.timezone.trim()) return invalid('Field "timezone" is required.');
  const timezone = body.timezone.trim();
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date(0));
  } catch {
    return invalid('Field "timezone" must be a valid IANA timezone.');
  }
  return { enabled: body.enabled, dailyTime: body.dailyTime, timezone };
}

function dateTimeParts(value: Date, formatter: Intl.DateTimeFormat): Record<string, string> {
  return Object.fromEntries(formatter.formatToParts(value)
    .filter(part => part.type !== 'literal')
    .map(part => [part.type, part.value]));
}

export function calculateNextBackupRun(now: Date, dailyTime: string, timezone: string): NextBackupRun {
  if (!TIME_PATTERN.test(dailyTime)) throw new ValidationError('Backup time must use HH:mm.');
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const [wantedHour, wantedMinute] = dailyTime.split(':').map(Number);
  const firstMinute = Math.floor(now.getTime() / 60_000) * 60_000 + 60_000;
  const searchLimit = firstMinute + 3 * 24 * 60 * 60_000;
  for (let timestamp = firstMinute; timestamp <= searchLimit; timestamp += 60_000) {
    const instant = new Date(timestamp);
    const parts = dateTimeParts(instant, formatter);
    if (Number(parts.hour) === wantedHour && Number(parts.minute) === wantedMinute) {
      return {
        nextRunAt: instant,
        nextLocalDate: `${parts.year}-${parts.month}-${parts.day}`,
      };
    }
  }
  throw new ValidationError('Unable to calculate the next daily backup time for this timezone.');
}
