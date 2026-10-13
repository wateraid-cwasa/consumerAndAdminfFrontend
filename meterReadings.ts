export type MeterReadingStatus = 'pending' | 'approved' | 'rejected';

export type MeterReading = {
  id: string;
  customerName: string;
  accountNumber: string;
  location: string;
  meterNumber: string;
  previousReading: number;
  currentReading: number;
  readingDate: string;
  submittedAt: string;
  readerName: string;
  status: MeterReadingStatus;
  notes: string;
};

const STORAGE_KEY = 'cwasa-meter-readings-v1';
const CHANGE_EVENT = 'cwasa-meter-readings-change';

const seedReadings: MeterReading[] = [
  {
    id: 'MR-2026-0514-1021',
    customerName: 'Anika Rahman',
    accountNumber: 'CW-2026-0488',
    location: 'Halishahar Block C, Lane 4',
    meterNumber: '443920',
    previousReading: 14980,
    currentReading: 16022,
    readingDate: '2026-05-14',
    submittedAt: '2026-05-14T09:42:00',
    readerName: 'Md. Karim',
    status: 'pending',
    notes: 'Customer unavailable; reading captured from meter display.',
  },
  {
    id: 'MR-2026-0514-1022',
    customerName: 'Rahim Uddin',
    accountNumber: 'CW-2026-0721',
    location: 'Agrabad, Road 12',
    meterNumber: '209314',
    previousReading: 8250,
    currentReading: 8714,
    readingDate: '2026-05-14',
    submittedAt: '2026-05-14T10:18:00',
    readerName: 'S. Das',
    status: 'pending',
    notes: 'Meter glass is clear; access was available.',
  },
  {
    id: 'MR-2026-0514-1023',
    customerName: 'Nusrat Jahan',
    accountNumber: 'CW-2026-1056',
    location: 'Panchlaish, Block B',
    meterNumber: '778102',
    previousReading: 12004,
    currentReading: 11996,
    readingDate: '2026-05-14',
    submittedAt: '2026-05-14T10:36:00',
    readerName: 'Md. Karim',
    status: 'pending',
    notes: 'Reading is lower than previous month. Please verify before approval.',
  },
  {
    id: 'MR-2026-0513-0941',
    customerName: 'Anika Rahman',
    accountNumber: 'CW-2026-0488',
    location: 'Halishahar Block C, Lane 4',
    meterNumber: '443920',
    previousReading: 13980,
    currentReading: 14980,
    readingDate: '2026-04-14',
    submittedAt: '2026-04-14T11:12:00',
    readerName: 'S. Das',
    status: 'approved',
    notes: 'Previous verified reading.',
  },
];

function isMeterReading(value: unknown): value is MeterReading {
  if (!value || typeof value !== 'object') return false;
  const reading = value as Record<string, unknown>;
  return typeof reading.id === 'string'
    && typeof reading.customerName === 'string'
    && typeof reading.accountNumber === 'string'
    && typeof reading.location === 'string'
    && typeof reading.meterNumber === 'string'
    && typeof reading.previousReading === 'number'
    && typeof reading.currentReading === 'number'
    && typeof reading.readingDate === 'string'
    && typeof reading.submittedAt === 'string'
    && typeof reading.readerName === 'string'
    && typeof reading.notes === 'string'
    && (reading.status === 'pending' || reading.status === 'approved' || reading.status === 'rejected');
}

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function getMeterReadings(): MeterReading[] {
  if (!canUseStorage()) return seedReadings;
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return seedReadings;
    const readings: unknown = JSON.parse(saved);
    if (!Array.isArray(readings) || !readings.every(isMeterReading)) {
      throw new Error('Stored meter readings are invalid.');
    }
    return readings;
  } catch (error) {
    console.error('Could not load saved meter readings.', error);
    return seedReadings;
  }
}

export function getLatestApprovedReading(accountNumber: string): MeterReading | undefined {
  return getMeterReadings()
    .filter((reading) => reading.accountNumber === accountNumber && reading.status === 'approved')
    .sort((left, right) => right.readingDate.localeCompare(left.readingDate))[0];
}

export function updateMeterReading(id: string, update: Partial<Pick<MeterReading, 'previousReading' | 'currentReading' | 'notes' | 'status'>>): MeterReading {
  const readings = getMeterReadings();
  const index = readings.findIndex((reading) => reading.id === id);
  if (index === -1) throw new Error(`Meter reading ${id} was not found.`);

  const updated: MeterReading = { ...readings[index], ...update };
  if (!Number.isFinite(updated.previousReading) || !Number.isFinite(updated.currentReading) || updated.previousReading < 0 || updated.currentReading < 0) {
    throw new Error('Meter readings must be valid non-negative numbers.');
  }
  if (updated.status === 'approved' && updated.currentReading < updated.previousReading) {
    throw new Error('Current reading cannot be lower than the previous reading.');
  }

  readings[index] = updated;
  if (canUseStorage()) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(readings));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }
  return updated;
}

export function subscribeToMeterReadings(onChange: () => void): () => void {
  if (!canUseStorage()) return () => undefined;
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) onChange();
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
}
