import { describe, expect, it } from 'vitest';
import {
  amountPayableToday,
  billMonthLabel,
  billSortTime,
  formatBillDate,
  formatTaka,
  isPastDue,
  normaliseBill,
  unwrapList,
  type BillDetail,
} from '../../billLogic';

// A bill copied from the real /bill/customer response (test account).
const apiBill = {
  id: 'cmvot6ef2000ey8uu0t6e9eqa',
  billNo: 'AA26261051554',
  accountNo: '070043SD',
  accountHolderName: 'KAMAL MOLLAH (TEST)',
  accountAddressLine1: 'HOUSE 42, ROAD 22 (TEST ADDRESS)',
  accountAddressLine2: 'WARD 21, CHATTOGRAM',
  accountWardNo: '21',
  accountContactNo: '01006560785',
  meterNo: '171288041',
  previousMeterReadingValue: '0',
  currentMeterReadingValue: '31',
  consumptionM3: '31',
  billableConsumptionM3: '31',
  isMinimumBilled: false,
  tariffRatePerM3: '18',
  vatRatePercentage: '15',
  baseWaterCharge: '558',
  additionalWaterCharge: '0',
  vatAmount: '83.7',
  totalAmountDue: '641.7',
  billStatus: 'APPROVED',
  paymentStatus: 'PENDING',
  issueDate: '2026-10-26T00:00:00.000Z',
  dueDate: '2026-11-25T00:00:00.000Z',
  billingMonth: 10,
  billingYear: 2026,
  surcharges: [
    { daysAfterDue: 30, surchargePercentage: '5', surchargeAmount: '27.9', totalPayable: '669.6' },
    { daysAfterDue: 60, surchargePercentage: '10', surchargeAmount: '55.8', totalPayable: '697.5' },
    { daysAfterDue: 90, surchargePercentage: '15', surchargeAmount: '83.7', totalPayable: '725.4' },
  ],
};

function bill(overrides: Partial<BillDetail> = {}): BillDetail {
  const parsed = normaliseBill(apiBill);
  if (!parsed) throw new Error('fixture bill did not parse');
  return { ...parsed, ...overrides };
}

// Local noon, so the tests do not depend on the machine time zone.
const day = (year: number, month: number, date: number) => new Date(year, month - 1, date, 12, 0, 0);

describe('normaliseBill', () => {
  it('reads the amounts from a real API bill (decimals arrive as strings)', () => {
    const parsed = bill();
    expect(parsed.billNumber).toBe('AA26261051554');
    expect(parsed.waterCharge).toBe(558);
    expect(parsed.vatAmount).toBe(83.7);
    expect(parsed.vatPercentage).toBe(15);
    expect(parsed.ratePerM3).toBe(18);
    expect(parsed.netPayable).toBe(641.7);
    expect(parsed.consumption).toBe(31);
    expect(parsed.previousReading).toBe(0);
    expect(parsed.currentReading).toBe(31);
  });

  it('joins the two address lines and keeps account details', () => {
    const parsed = bill();
    expect(parsed.address).toBe('HOUSE 42, ROAD 22 (TEST ADDRESS), WARD 21, CHATTOGRAM');
    expect(parsed.wardNo).toBe('21');
    expect(parsed.meterNo).toBe('171288041');
  });

  it('builds the billing period from the billing month and year', () => {
    const parsed = bill();
    expect(parsed.periodStart).toBe('2026-10-01');
    expect(parsed.periodEnd).toBe('2026-10-31');
  });

  it('shows PAID when the payment status is PAID, otherwise the bill status', () => {
    expect(normaliseBill({ ...apiBill, paymentStatus: 'PAID' })?.status).toBe('PAID');
    expect(normaliseBill(apiBill)?.status).toBe('APPROVED');
  });

  it('turns the API surcharges into dated steps (due date plus days after due)', () => {
    const steps = bill().surcharges;
    expect(steps).toHaveLength(3);
    expect(steps.map((step) => step.percentage)).toEqual([5, 10, 15]);
    expect(steps.map((step) => step.totalPayable)).toEqual([669.6, 697.5, 725.4]);
    expect(steps[0].deadline.slice(0, 10)).toBe('2026-12-25');
    expect(steps[1].deadline.slice(0, 10)).toBe('2027-01-24');
    expect(steps[2].deadline.slice(0, 10)).toBe('2027-02-23');
  });

  it('handles a bill with no surcharge steps', () => {
    expect(normaliseBill({ ...apiBill, surcharges: [] })?.surcharges).toEqual([]);
  });

  it('still reads the older surchargeTiers shape', () => {
    const parsed = normaliseBill({
      ...apiBill,
      surcharges: undefined,
      surchargeTiers: [{ deadline: '2026-12-25', percentage: 5, surchargeAmount: 27.9, totalPayable: 669.6 }],
    });
    expect(parsed?.surcharges).toHaveLength(1);
  });

  it('accepts real numbers as well as strings', () => {
    const parsed = normaliseBill({ ...apiBill, totalAmountDue: 641.7, baseWaterCharge: 558, vatAmount: 83.7 });
    expect(parsed?.netPayable).toBe(641.7);
  });

  it('returns null when no total can be worked out', () => {
    expect(normaliseBill({ billNo: 'X' })).toBeNull();
    expect(normaliseBill(null)).toBeNull();
    expect(normaliseBill('text')).toBeNull();
  });

  it('works out the total when only the parts are sent', () => {
    const parsed = normaliseBill({ billNo: 'X', baseWaterCharge: '100', additionalWaterCharge: '10', vatAmount: '15' });
    expect(parsed?.netPayable).toBe(125);
  });

  it('flags a minimum-billed bill', () => {
    expect(normaliseBill({ ...apiBill, isMinimumBilled: true })?.isMinimumBilled).toBe(true);
  });
});

describe('unwrapList', () => {
  it('returns a plain array as it is', () => {
    expect(unwrapList([1, 2])).toEqual([1, 2]);
  });

  it('finds the list under the bills key (current API)', () => {
    expect(unwrapList({ bills: [apiBill], hasNextPage: false })).toHaveLength(1);
  });

  it('finds the list inside data.items', () => {
    expect(unwrapList({ data: { items: [1, 2, 3] } })).toHaveLength(3);
  });

  it('returns an empty list for empty or unknown shapes', () => {
    expect(unwrapList({ bills: [] })).toEqual([]);
    expect(unwrapList(null)).toEqual([]);
    expect(unwrapList({ something: 1 })).toEqual([]);
  });
});

describe('isPastDue', () => {
  it('is false on and before the due date', () => {
    expect(isPastDue(bill(), day(2026, 11, 24))).toBe(false);
    expect(isPastDue(bill(), day(2026, 11, 25))).toBe(false);
  });

  it('is true the day after the due date', () => {
    expect(isPastDue(bill(), day(2026, 11, 26))).toBe(true);
  });

  it('is never true for a paid bill', () => {
    expect(isPastDue(bill({ status: 'PAID' }), day(2027, 6, 1))).toBe(false);
  });

  it('is false when there is no due date or the date is invalid', () => {
    expect(isPastDue(bill({ dueDate: null }), day(2027, 6, 1))).toBe(false);
    expect(isPastDue(bill({ dueDate: 'not a date' }), day(2027, 6, 1))).toBe(false);
  });
});

describe('amountPayableToday', () => {
  it('is the net payable before the bill is overdue', () => {
    expect(amountPayableToday(bill(), day(2026, 11, 20))).toBe(641.7);
  });

  it('adds 5% in the first 30 days after the due date', () => {
    expect(amountPayableToday(bill(), day(2026, 11, 30))).toBe(669.6);
    expect(amountPayableToday(bill(), day(2026, 12, 25))).toBe(669.6);
  });

  it('adds 10% from day 31 to day 60', () => {
    expect(amountPayableToday(bill(), day(2026, 12, 26))).toBe(697.5);
  });

  it('adds 15% from day 61 to day 90, and stays at 15% after that', () => {
    expect(amountPayableToday(bill(), day(2027, 1, 25))).toBe(725.4);
    expect(amountPayableToday(bill(), day(2027, 8, 1))).toBe(725.4);
  });

  it('stays at the net payable when overdue but no steps exist', () => {
    expect(amountPayableToday(bill({ surcharges: [] }), day(2027, 1, 1))).toBe(641.7);
  });

  it('never adds a surcharge to a paid bill', () => {
    expect(amountPayableToday(bill({ status: 'PAID' }), day(2027, 1, 1))).toBe(641.7);
  });
});

describe('formatting', () => {
  it('formats taka with 2 decimals and thousands separators', () => {
    expect(formatTaka(641.7)).toBe('৳641.70');
    expect(formatTaka(1053)).toBe('৳1,053.00');
    expect(formatTaka(0)).toBe('৳0.00');
  });

  it('formats dates as day, short month, year', () => {
    expect(formatBillDate('2026-11-25T12:00:00.000Z')).toBe('25 Nov 2026');
  });

  it('shows a dash for missing or invalid dates', () => {
    expect(formatBillDate(null)).toBe('-');
    expect(formatBillDate('nonsense')).toBe('-');
  });

  it('labels a bill with its month and year', () => {
    expect(billMonthLabel(bill())).toBe('October 2026');
  });

  it('falls back to "Water bill" when there is no date', () => {
    expect(billMonthLabel(bill({ periodEnd: null, issueDate: null }))).toBe('Water bill');
  });
});

describe('billSortTime', () => {
  it('sorts the newest bill first and puts undated bills last', () => {
    const older = bill({ id: 'a', issueDate: '2026-09-01T00:00:00.000Z' });
    const newer = bill({ id: 'b', issueDate: '2026-10-26T00:00:00.000Z' });
    const undated = bill({ id: 'c', issueDate: null });
    const sorted = [older, undated, newer].sort((x, y) => billSortTime(y) - billSortTime(x));
    expect(sorted.map((item) => item.id)).toEqual(['b', 'a', 'c']);
  });

  it('copes with several bills issued on the same day', () => {
    const same = ['a', 'b', 'c', 'd'].map((id) => bill({ id }));
    expect(() => [...same].sort((x, y) => billSortTime(y) - billSortTime(x))).not.toThrow();
  });
});
