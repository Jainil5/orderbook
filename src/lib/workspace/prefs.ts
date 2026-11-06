import { cookies } from "next/headers";

export const WORKSPACE_PREFS_COOKIE = "ob_workspace_prefs";

type PrefsStore = Record<
  string,
  {
    quotationBuilderEnabled?: boolean;
    brandWebsiteUrl?: string | null;
    receiptHeader?: string;
    receiptFooter?: string | null;
    contactEmail?: string | null;
    contactPhone?: string | null;
  }
>;

function parseStore(raw: string | undefined): PrefsStore {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as PrefsStore;
  } catch {
    return {};
  }
}

export async function readQuotationBuilderPref(
  brandCode: string,
): Promise<boolean | undefined> {
  const cookieStore = await cookies();
  const store = parseStore(cookieStore.get(WORKSPACE_PREFS_COOKIE)?.value);
  return store[brandCode.toUpperCase()]?.quotationBuilderEnabled;
}

export async function writeQuotationBuilderPref(
  brandCode: string,
  enabled: boolean,
): Promise<void> {
  const cookieStore = await cookies();
  const store = parseStore(cookieStore.get(WORKSPACE_PREFS_COOKIE)?.value);
  store[brandCode.toUpperCase()] = {
    ...store[brandCode.toUpperCase()],
    quotationBuilderEnabled: enabled,
  };
  cookieStore.set(WORKSPACE_PREFS_COOKIE, JSON.stringify(store), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function readBrandWebsitePref(
  brandCode: string,
): Promise<string | null | undefined> {
  const cookieStore = await cookies();
  const store = parseStore(cookieStore.get(WORKSPACE_PREFS_COOKIE)?.value);
  return store[brandCode.toUpperCase()]?.brandWebsiteUrl;
}

export async function writeBrandWebsitePref(
  brandCode: string,
  url: string | null,
): Promise<void> {
  const cookieStore = await cookies();
  const store = parseStore(cookieStore.get(WORKSPACE_PREFS_COOKIE)?.value);
  store[brandCode.toUpperCase()] = {
    ...store[brandCode.toUpperCase()],
    brandWebsiteUrl: url,
  };
  cookieStore.set(WORKSPACE_PREFS_COOKIE, JSON.stringify(store), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function readReceiptSettingsPref(
  brandCode: string,
): Promise<
  | {
      receiptHeader?: string;
      receiptFooter?: string | null;
      contactEmail?: string | null;
      contactPhone?: string | null;
    }
  | undefined
> {
  const cookieStore = await cookies();
  const store = parseStore(cookieStore.get(WORKSPACE_PREFS_COOKIE)?.value);
  const entry = store[brandCode.toUpperCase()];
  if (!entry) return undefined;
  return {
    receiptHeader: entry.receiptHeader,
    receiptFooter: entry.receiptFooter,
    contactEmail: entry.contactEmail,
    contactPhone: entry.contactPhone,
  };
}

export async function writeReceiptSettingsPref(
  brandCode: string,
  values: {
    receiptHeader: string;
    receiptFooter: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
  },
): Promise<void> {
  const cookieStore = await cookies();
  const store = parseStore(cookieStore.get(WORKSPACE_PREFS_COOKIE)?.value);
  store[brandCode.toUpperCase()] = {
    ...store[brandCode.toUpperCase()],
    receiptHeader: values.receiptHeader,
    receiptFooter: values.receiptFooter,
    contactEmail: values.contactEmail,
    contactPhone: values.contactPhone,
  };
  cookieStore.set(WORKSPACE_PREFS_COOKIE, JSON.stringify(store), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}
