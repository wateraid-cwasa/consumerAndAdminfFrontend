import { Platform } from 'react-native';

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  'http://localhost:3000/api/v1';

const ACCESS_TOKEN_KEY = 'cwasa-customer-access-token';
const REFRESH_TOKEN_KEY = 'cwasa-customer-refresh-token';
const CUSTOMER_KEY = 'cwasa-customer-session';

export type CustomerSession = {
  accountNo: string;
  name: string;
};

export type CustomerProfile = {
  accountNo: string;
  customerName: string;
  address: string;
  mobileNo: string | null;
  meterNo: string | null;
  wardNo: string | null;
  propertyType: string | null;
  connectionSize: string | null;
  lastMeterReading: string | null;
  lastReadingDate: string | null;
};

export type BillHistoryEntry = {
  billDate: string;
  billTotal: string | null;
  paidAmount: string | null;
  paymentStatus: string | null;
};

export type MeterReadingHistoryEntry = {
  readingId: string;
  currentBill: string;
  createdAt: string;
  hasPhoto: boolean;
};

const webMemoryStorage = new Map<string, string>();

function canUseStorage(): boolean {
  return Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function setItem(key: string, value: string): void {
  if (!canUseStorage()) {
    webMemoryStorage.set(key, value);
    return;
  }
  try {
    window.localStorage.setItem(key, value);
  } catch {
    webMemoryStorage.set(key, value);
  }
}

function getItem(key: string): string | null {
  if (!canUseStorage()) return webMemoryStorage.get(key) ?? null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return webMemoryStorage.get(key) ?? null;
  }
}

function removeItems(keys: readonly string[]): void {
  for (const key of keys) {
    if (canUseStorage()) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // ignore
      }
    }
    webMemoryStorage.delete(key);
  }
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

type TokenPair = { accessToken: string; refreshToken: string };

function persistSession(tokens: TokenPair, customer: CustomerSession): void {
  setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
  setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
  setItem(CUSTOMER_KEY, JSON.stringify(customer));
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
  removeItems([ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY, CUSTOMER_KEY]);
}

async function rawRequest<T>(
  path: string,
  options: { method?: string; body?: unknown; authorized?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.authorized) {
    const accessToken = getItem(ACCESS_TOKEN_KEY);
    if (!accessToken) throw new ApiRequestError(401, 'Not signed in.');
    headers.Authorization = `Bearer ${accessToken}`;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiConnectionError();
  }

  if (response.status === 204) return undefined as T;

  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    // no body
  }

  if (!response.ok) {
    const message =
      typeof data === 'object' && data !== null && 'message' in data
        ? String((data as { message: unknown }).message)
        : undefined;
    throw new ApiRequestError(response.status, message);
  }

  return data as T;
}

async function authorizedRequest<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  try {
    return await rawRequest<T>(path, { ...options, authorized: true });
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 401) {
      const refreshed = await tryRefresh();
      if (refreshed) {
        return rawRequest<T>(path, { ...options, authorized: true });
      }
      clearCustomerSession();
    }
    throw error;
  }
}

async function tryRefresh(): Promise<boolean> {
  const refreshToken = getItem(REFRESH_TOKEN_KEY);
  if (!refreshToken) return false;
  try {
    const tokens = await rawRequest<TokenPair>('/customer/token/refresh', {
      method: 'POST',
      body: { refreshToken },
    });
    setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
    setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
    return true;
  } catch {
    return false;
  }
}

export async function requestCustomerOtp(
  accountNo: string,
  mobileNo: string,
): Promise<{ sent: true; devOtp?: string }> {
  return rawRequest('/customer/otp/request', {
    method: 'POST',
    body: { accountNo, mobileNo },
  });
}

export async function verifyCustomerOtp(accountNo: string, otp: string): Promise<CustomerSession> {
  const response = await rawRequest<{ tokens: TokenPair; customer: { accountNo: string; customerName: string } }>(
    '/customer/otp/verify',
    { method: 'POST', body: { accountNo, otp } },
  );
  const customer: CustomerSession = {
    accountNo: response.customer.accountNo,
    name: response.customer.customerName,
  };
  persistSession(response.tokens, customer);
  return customer;
}

export function signOutCustomer(): void {
  clearCustomerSession();
}

export async function getCustomerProfile(): Promise<CustomerProfile> {
  return authorizedRequest<CustomerProfile>('/customer/profile');
}

export async function getCustomerBills(): Promise<BillHistoryEntry[]> {
  return authorizedRequest<BillHistoryEntry[]>('/customer/bills');
}

export async function getCustomerMeterReadings(): Promise<MeterReadingHistoryEntry[]> {
  return authorizedRequest<MeterReadingHistoryEntry[]>('/customer/meter-readings');
}
