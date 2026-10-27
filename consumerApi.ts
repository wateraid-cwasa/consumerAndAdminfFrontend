import axios, { AxiosError, type AxiosRequestConfig } from 'axios';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  'http://localhost:3000/api/v1';

const ACCESS_TOKEN_KEY = 'cwasa-customer-access-token';
const CUSTOMER_KEY = 'cwasa-customer-session';

export type CustomerSession = {
  accountNo: string;
  name: string;
};

export type CustomerProfile = {
  accountNo: string | null;
  customerName: string | null;
  address: string | null;
  mobileNo: string | null;
  meterNo: string | null;
  wardNo: string | null;
  propertyType: string | null;
  connectionSize: string | null;
};

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

// Where tokens live:
// - Android and iOS: expo-secure-store (Keychain / Keystore), mirrored in memory for fast reads.
// - Web: browser localStorage (the browser has no secure store), with an in-memory fallback.
const memoryStorage = new Map<string, string>();
const isWeb = Platform.OS === 'web';

function canUseStorage(): boolean {
  return isWeb && typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function setItem(key: string, value: string): void {
  memoryStorage.set(key, value);
  if (!isWeb) {
    SecureStore.setItemAsync(key, value).catch(() => {
      // Keep the in-memory copy if the secure store is unavailable.
    });
    return;
  }
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Keep the in-memory copy.
  }
}

function getItem(key: string): string | null {
  const cached = memoryStorage.get(key);
  if (cached !== undefined) return cached;
  if (!canUseStorage()) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function removeItems(keys: readonly string[]): void {
  for (const key of keys) {
    memoryStorage.delete(key);
    if (!isWeb) {
      SecureStore.deleteItemAsync(key).catch(() => {
        // ignore
      });
    } else if (canUseStorage()) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // ignore
      }
    }
  }
}

// Call once at start-up on Android and iOS. It loads the saved token and session from the
// secure store so the customer stays signed in. On web the values are read synchronously already.
export async function restoreCustomerSession(): Promise<CustomerSession | null> {
  if (!isWeb) {
    for (const key of [ACCESS_TOKEN_KEY, CUSTOMER_KEY]) {
      try {
        const value = await SecureStore.getItemAsync(key);
        if (value !== null) memoryStorage.set(key, value);
      } catch {
        // Treat an unreadable secure store as signed out.
      }
    }
  }
  return getItem(ACCESS_TOKEN_KEY) ? getStoredCustomerSession() : null;
}

export class ApiRequestError extends Error {
  constructor(public readonly status: number, message?: string) {
    super(message ?? `API request failed with status ${status}.`);
    this.name = 'ApiRequestError';
  }
}

export class ApiConnectionError extends Error {
  constructor() {
    super('Could not connect to the CWASA customer API.');
    this.name = 'ApiConnectionError';
  }
}

export function getStoredCustomerSession(): CustomerSession | null {
  const raw = getItem(CUSTOMER_KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'accountNo' in parsed &&
      typeof (parsed as { accountNo: unknown }).accountNo === 'string' &&
      'name' in parsed &&
      typeof (parsed as { name: unknown }).name === 'string'
    ) {
      return parsed as CustomerSession;
    }
    return null;
  } catch {
    return null;
  }
}

export function hasStoredAccessToken(): boolean {
  return getItem(ACCESS_TOKEN_KEY) !== null;
}

export function clearCustomerSession(): void {
  removeItems([ACCESS_TOKEN_KEY, CUSTOMER_KEY]);
}

const http = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20000,
  headers: {
    'Content-Type': 'application/json',
    // Lets requests through ngrok's free-tier browser warning page during testing.
    'ngrok-skip-browser-warning': '1',
  },
});

async function rawRequest<T>(
  path: string,
  options: { method?: string; body?: unknown; authorized?: boolean } = {},
): Promise<T> {
  const config: AxiosRequestConfig = {
    url: path,
    method: options.method ?? 'GET',
    data: options.body,
    headers: {},
  };
  if (options.authorized) {
    const accessToken = getItem(ACCESS_TOKEN_KEY);
    if (!accessToken) throw new ApiRequestError(401, 'Not signed in.');
    config.headers = { Authorization: `Bearer ${accessToken}` };
  }

  try {
    const response = await http.request<T>(config);
    if (response.status === 204) return undefined as T;
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const failure = error as AxiosError;
      if (!failure.response) throw new ApiConnectionError();
      const data = failure.response.data;
      const raw =
        typeof data === 'object' && data !== null && 'message' in data
          ? (data as { message: unknown }).message
          : undefined;
      const message = Array.isArray(raw) ? raw.join(', ') : raw !== undefined ? String(raw) : undefined;
      throw new ApiRequestError(failure.response.status, message);
    }
    throw error;
  }
}

// The server has no token refresh endpoint, so an expired token means signing in again.
async function authorizedRequest<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  try {
    return await rawRequest<T>(path, { ...options, authorized: true });
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 401) {
      clearCustomerSession();
    }
    throw error;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function pickString(source: unknown, keys: readonly string[]): string | null {
  const record = asRecord(source);
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value) return value;
  }
  return null;
}

// Decimal columns can arrive as numbers or strings, depending on how the API serialises them.
function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function firstNumber(source: Record<string, unknown> | null, keys: readonly string[]): number | null {
  if (!source) return null;
  for (const key of keys) {
    const parsed = toNumber(source[key]);
    if (parsed !== null) return parsed;
  }
  return null;
}

function pickText(source: unknown, keys: readonly string[]): string | null {
  const record = asRecord(source);
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return null;
}

function normaliseProfile(raw: unknown): CustomerProfile {
  const outer = asRecord(raw);
  const profile = asRecord(outer?.customer) ?? asRecord(outer?.data) ?? outer;
  return {
    accountNo: pickText(profile, ['accountNo', 'accountNumber']),
    customerName: pickText(profile, ['customerName', 'name', 'fullName']),
    address: pickText(profile, ['address', 'customerAddress', 'serviceAddress']),
    mobileNo: pickText(profile, ['mobileNo', 'mobile', 'phoneNo', 'phone']),
    meterNo: pickText(profile, ['meterNo', 'meterNumber']),
    wardNo: pickText(profile, ['wardNo', 'ward']),
    propertyType: pickText(profile, ['propertyType', 'category']),
    connectionSize: pickText(profile, ['connectionSize', 'connectionSizeInch']),
  };
}

function monthRange(month: number | null, year: number | null): { start: string | null; end: string | null } {
  if (month === null || year === null || month < 1 || month > 12) return { start: null, end: null };
  const pad = (value: number) => String(value).padStart(2, '0');
  const lastDay = new Date(year, month, 0).getDate();
  return { start: `${year}-${pad(month)}-01`, end: `${year}-${pad(month)}-${pad(lastDay)}` };
}

function normaliseBill(raw: unknown): BillDetail | null {
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
function unwrapList(data: unknown, depth = 0): unknown[] {
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

// Explains why no bill could be shown, so the app can tell the customer (and the developer) why.
export let lastBillsNote = '';

export async function loginCustomer(accountNo: string, password: string): Promise<CustomerSession> {
  const response = await rawRequest<unknown>('/customer/login', {
    method: 'POST',
    body: { accountNo, password },
  });
  const nested =
    typeof response === 'object' && response !== null && 'tokens' in response
      ? (response as { tokens: unknown }).tokens
      : response;
  const accessToken = pickString(nested, ['accessToken', 'access_token', 'token']);
  if (!accessToken) throw new ApiRequestError(500, 'The server did not return an access token.');
  setItem(ACCESS_TOKEN_KEY, accessToken);

  let name = accountNo;
  try {
    const profile = await getCustomerProfile();
    name = profile.customerName ?? accountNo;
  } catch {
    // Keep the account number as the display name if the profile cannot be loaded.
  }
  const customer: CustomerSession = { accountNo, name };
  setItem(CUSTOMER_KEY, JSON.stringify(customer));
  return customer;
}

// Creates the customer's password. The server checks that the account exists in the CWASA records.
export async function registerCustomer(
  accountNo: string,
  verificationContact: { email: string } | { phone: string },
  password: string,
): Promise<void> {
  await rawRequest<unknown>('/customer/set-password', {
    method: 'POST',
    body: { accountNo, ...verificationContact, password },
  });
}

export function signOutCustomer(): void {
  clearCustomerSession();
}

export async function getCustomerProfile(): Promise<CustomerProfile> {
  return normaliseProfile(await authorizedRequest<unknown>('/customer/me'));
}

export async function getCustomerBills(): Promise<BillDetail[]> {
  const data = await authorizedRequest<unknown>('/bill/customer?limit=24');
  const rows = unwrapList(data);
  const bills = rows
    .map(normaliseBill)
    .filter((bill): bill is BillDetail => bill !== null);
  if (rows.length === 0) {
    const top = asRecord(data);
    lastBillsNote = top
      ? `The server returned no bills for this account (response fields: ${Object.keys(top).join(', ') || 'none'}).`
      : 'The server returned no bills for this account yet.';
  } else if (bills.length === 0) {
    const first = asRecord(rows[0]);
    lastBillsNote = `Received ${rows.length} bill(s) but could not read the amounts (fields: ${first ? Object.keys(first).join(', ') : 'unknown'}).`;
  } else {
    lastBillsNote = '';
  }
  if (lastBillsNote) console.warn('[CWASA] /bill/customer', lastBillsNote, data);
  return bills;
}

export function getLastBillsNote(): string {
  return lastBillsNote;
}
