// Pure bill logic. No React Native imports, so it can be unit tested with Vitest.

export type SurchargeStep = {
  deadline: string;
  percentage: number;
  surchargeAmount: number;
  totalPayable: number;
};

export type BillDetail = {
  id: string;
  billNumber: string;
  status: string;
  issueDate: string | null;
  dueDate: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  previousReading: number | null;
  currentReading: number | null;
  consumption: number | null;
  isMinimumBilled: boolean;
  meterNo: string | null;
  holderName: string | null;
  address: string | null;
  wardNo: string | null;
  contactNo: string | null;
  additionalCharge: number;
  ratePerM3: number | null;
  waterCharge: number;
  vatPercentage: number | null;
  vatAmount: number;
  arrears: number;
  adjustments: number;
  netPayable: number;
  surcharges: SurchargeStep[];
};

export function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function pickString(source: unknown, keys: readonly string[]): string | null {
  const record = asRecord(source);
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value) return value;
  }
  return null;
}

// Decimal columns can arrive as numbers or strings, depending on how the API serialises them.
export function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function firstNumber(source: Record<string, unknown> | null, keys: readonly string[]): number | null {
  if (!source) return null;
  for (const key of keys) {
    const parsed = toNumber(source[key]);
    if (parsed !== null) return parsed;
  }
  return null;
}

export function pickText(source: unknown, keys: readonly string[]): string | null {
  const record = asRecord(source);
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return null;
}

export function monthRange(month: number | null, year: number | null): { start: string | null; end: string | null } {
  if (month === null || year === null || month < 1 || month > 12) return { start: null, end: null };
  const pad = (value: number) => String(value).padStart(2, '0');
  const lastDay = new Date(year, month, 0).getDate();
  return { start: `${year}-${pad(month)}-01`, end: `${year}-${pad(month)}-${pad(lastDay)}` };
}

export function normaliseBill(raw: unknown): BillDetail | null {
  const bill = asRecord(raw);
  if (!bill) return null;
  const reading = asRecord(bill.meterReading);
  const tariff = asRecord(bill.tariff);
  const vatRate = asRecord(bill.vatRate);

  const baseCharge = firstNumber(bill, ['baseWaterCharge', 'waterCharge', 'amount']);
  const additionalCharge = firstNumber(bill, ['additionalWaterCharge']) ?? 0;
  const vatRaw = firstNumber(bill, ['vatAmount', 'vat']) ?? 0;
  const netPayable =
    firstNumber(bill, ['totalAmountDue', 'netPayable', 'totalPayable', 'totalAmount', 'billTotal', 'payable']) ??
    (baseCharge !== null ? baseCharge + additionalCharge + vatRaw : null);
  if (netPayable === null) return null;
  const waterCharge = baseCharge ?? netPayable - additionalCharge - vatRaw;
  // Anything in the total that is not water charge or VAT (arrears, adjustments) is shown as one line.
  const explicitExtras = (firstNumber(bill, ['previousArrears', 'arrears']) ?? 0) + (firstNumber(bill, ['adjustments']) ?? 0);
  const otherCharges = explicitExtras !== 0 ? explicitExtras : Math.round((netPayable - (waterCharge + additionalCharge + vatRaw)) * 100) / 100;

  const surcharges: SurchargeStep[] = [];
  const rawSteps = Array.isArray(bill.surchargeTiers) ? bill.surchargeTiers : [];
  for (const step of rawSteps) {
    const record = asRecord(step);
    if (!record) continue;
    const deadline = pickString(record, ['deadline']);
    const percentage = firstNumber(record, ['percentage']);
    const surchargeAmount = firstNumber(record, ['surchargeAmount']);
    const totalPayable = firstNumber(record, ['totalPayable']);
    if (deadline && percentage !== null && surchargeAmount !== null && totalPayable !== null) {
      surcharges.push({ deadline, percentage, surchargeAmount, totalPayable });
    }
  }
  // The live API sends the steps as `surcharges`, each with `daysAfterDue`. The deadline is the due date plus those days.
  const dueDateText = pickString(bill, ['dueDate']);
  const dueTime = dueDateText ? new Date(dueDateText).getTime() : Number.NaN;
  if (surcharges.length === 0 && Array.isArray(bill.surcharges) && !Number.isNaN(dueTime)) {
    for (const step of bill.surcharges) {
      const record = asRecord(step);
      if (!record) continue;
      const days = firstNumber(record, ['daysAfterDue']);
      const percentage = firstNumber(record, ['surchargePercentage']);
      const surchargeAmount = firstNumber(record, ['surchargeAmount']);
      const totalPayable = firstNumber(record, ['totalPayable']);
      if (days !== null && percentage !== null && surchargeAmount !== null && totalPayable !== null) {
        const deadline = new Date(dueTime);
        deadline.setUTCDate(deadline.getUTCDate() + days);
        surcharges.push({ deadline: deadline.toISOString(), percentage, surchargeAmount, totalPayable });
      }
    }
  }
  surcharges.sort((a, b) => a.deadline.localeCompare(b.deadline));

  const period = monthRange(firstNumber(bill, ['billingMonth']), firstNumber(bill, ['billingYear']));
  const paymentStatus = (pickString(bill, ['paymentStatus']) ?? '').toUpperCase();
  const billStatus = pickString(bill, ['billStatus', 'status']) ?? 'ISSUED';
  const line1 = pickString(bill, ['accountAddressLine1']);
  const line2 = pickString(bill, ['accountAddressLine2']);

  return {
    id: pickString(bill, ['id']) ?? pickString(bill, ['billNo', 'billNumber']) ?? String(Math.random()),
    billNumber: pickString(bill, ['billNo', 'billNumber']) ?? '',
    status: paymentStatus === 'PAID' ? 'PAID' : billStatus.toUpperCase(),
    issueDate: pickString(bill, ['issueDate']),
    dueDate: pickString(bill, ['dueDate']),
    periodStart: pickString(bill, ['billingPeriodStart']) ?? period.start,
    periodEnd: pickString(bill, ['billingPeriodEnd']) ?? period.end,
    previousReading: firstNumber(bill, ['previousMeterReadingValue', 'previousReading']) ?? firstNumber(reading, ['previousReading']),
    currentReading: firstNumber(bill, ['currentMeterReadingValue', 'currentReading']) ?? firstNumber(reading, ['currentReading']),
    consumption: firstNumber(bill, ['billableConsumptionM3', 'consumptionM3', 'consumption']),
    isMinimumBilled: bill.isMinimumBilled === true,
    meterNo: pickString(bill, ['meterNo']) ?? pickString(reading, ['meterNo']),
    holderName: pickString(bill, ['accountHolderName']),
    address: [line1, line2].filter(Boolean).join(', ') || null,
    wardNo: pickText(bill, ['accountWardNo']),
    contactNo: pickText(bill, ['accountContactNo']),
    additionalCharge,
    ratePerM3: firstNumber(bill, ['tariffRatePerM3']) ?? firstNumber(tariff, ['ratePerM3']),
    waterCharge,
    vatPercentage: firstNumber(bill, ['vatRatePercentage']) ?? firstNumber(vatRate, ['percentage']),
    vatAmount: vatRaw,
    arrears: otherCharges,
    adjustments: 0,
    netPayable,
    surcharges,
  };
}

// Response shapes are not documented in Swagger yet, so accept the common layouts.
export function unwrapList(data: unknown, depth = 0): unknown[] {
  if (Array.isArray(data)) return data;
  const record = asRecord(data);
  if (record && depth < 3) {
    for (const key of ['data', 'items', 'bills', 'results', 'records']) {
      if (record[key] !== undefined) {
        const found = unwrapList(record[key], depth + 1);
        if (found.length > 0) return found;
      }
    }
  }
  return [];
}

export function formatBillDate(value: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

export function billMonthLabel(bill: BillDetail): string {
  const source = bill.periodEnd ?? bill.issueDate;
  if (!source) return 'Water bill';
  const date = new Date(source);
  if (Number.isNaN(date.getTime())) return 'Water bill';
  return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(date);
}

export function billSortTime(bill: BillDetail): number {
  const time = bill.issueDate ? new Date(bill.issueDate).getTime() : 0;
  return Number.isNaN(time) ? 0 : time;
}

export function formatTaka(value: number): string {
  return `৳${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function startOfDay(value: Date): number {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
}

export function isPastDue(bill: BillDetail, now = new Date()): boolean {
  if (!bill.dueDate || bill.status === 'PAID') return false;
  const due = new Date(bill.dueDate);
  return !Number.isNaN(due.getTime()) && startOfDay(now) > startOfDay(due);
}

// The amount to pay today: net payable up to the due date, then the matching late-payment step.
export function amountPayableToday(bill: BillDetail, now = new Date()): number {
  if (!isPastDue(bill, now) || bill.surcharges.length === 0) return bill.netPayable;
  const today = startOfDay(now);
  const step = bill.surcharges.find((item) => startOfDay(new Date(item.deadline)) >= today)
    ?? bill.surcharges[bill.surcharges.length - 1];
  return step.totalPayable;
}
