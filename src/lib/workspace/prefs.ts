import { cookies } from "next/headers";
import {
  parseHiddenManagerModules,
  type ManagerModuleKey,
} from "@/lib/workspace/manager-modules";
import {
  parseWorkingHours,
  type WorkingHours,
} from "@/lib/hours/working-hours";

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
    hiddenManagerModules?: string[];
    workingHours?: WorkingHours;
    ordersPaused?: boolean;
    blockOversell?: boolean;
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

export async function readManagerModulesPref(
  brandCode: string,
): Promise<ManagerModuleKey[] | undefined> {
  const cookieStore = await cookies();
  const store = parseStore(cookieStore.get(WORKSPACE_PREFS_COOKIE)?.value);
  const raw = store[brandCode.toUpperCase()]?.hiddenManagerModules;
  return raw === undefined ? undefined : parseHiddenManagerModules(raw);
}

export async function writeManagerModulesPref(
  brandCode: string,
  hidden: ManagerModuleKey[],
): Promise<void> {
  const cookieStore = await cookies();
  const store = parseStore(cookieStore.get(WORKSPACE_PREFS_COOKIE)?.value);
  store[brandCode.toUpperCase()] = {
    ...store[brandCode.toUpperCase()],
    hiddenManagerModules: hidden,
  };
  cookieStore.set(WORKSPACE_PREFS_COOKIE, JSON.stringify(store), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

/**
 * A browser's edited opening hours. `undefined` = this browser has never
 * saved a week (so the CSV pack decides); `null` = it saved something that no
 * longer reads as a schedule, which is also treated as "not set".
 */
export async function readWorkingHoursPref(
  brandCode: string,
): Promise<WorkingHours | null | undefined> {
  const cookieStore = await cookies();
  const store = parseStore(cookieStore.get(WORKSPACE_PREFS_COOKIE)?.value);
  const raw = store[brandCode.toUpperCase()]?.workingHours;
  return raw === undefined ? undefined : parseWorkingHours(raw);
}

export async function writeWorkingHoursPref(
  brandCode: string,
  hours: WorkingHours,
): Promise<void> {
  const cookieStore = await cookies();
  const store = parseStore(cookieStore.get(WORKSPACE_PREFS_COOKIE)?.value);
  store[brandCode.toUpperCase()] = {
    ...store[brandCode.toUpperCase()],
    workingHours: hours,
  };
  cookieStore.set(WORKSPACE_PREFS_COOKIE, JSON.stringify(store), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

/** The manual "not taking orders right now" switch, per brand. */
export async function readOrdersPausedPref(
  brandCode: string,
): Promise<boolean | undefined> {
  const cookieStore = await cookies();
  const store = parseStore(cookieStore.get(WORKSPACE_PREFS_COOKIE)?.value);
  const raw = store[brandCode.toUpperCase()]?.ordersPaused;
  return typeof raw === "boolean" ? raw : undefined;
}

export async function writeOrdersPausedPref(
  brandCode: string,
  paused: boolean,
): Promise<void> {
  const cookieStore = await cookies();
  const store = parseStore(cookieStore.get(WORKSPACE_PREFS_COOKIE)?.value);
  store[brandCode.toUpperCase()] = {
    ...store[brandCode.toUpperCase()],
    ordersPaused: paused,
  };
  cookieStore.set(WORKSPACE_PREFS_COOKIE, JSON.stringify(store), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

/**
 * Whether the counter refuses a sale the shelf cannot cover. The shipped pack
 * leaves this unset; a merchant's own choice is remembered per brand.
 */
export async function readBlockOversellPref(
  brandCode: string,
): Promise<boolean | undefined> {
  const cookieStore = await cookies();
  const store = parseStore(cookieStore.get(WORKSPACE_PREFS_COOKIE)?.value);
  const raw = store[brandCode.toUpperCase()]?.blockOversell;
  return typeof raw === "boolean" ? raw : undefined;
}

export async function writeBlockOversellPref(
  brandCode: string,
  enabled: boolean,
): Promise<void> {
  const cookieStore = await cookies();
  const store = parseStore(cookieStore.get(WORKSPACE_PREFS_COOKIE)?.value);
  store[brandCode.toUpperCase()] = {
    ...store[brandCode.toUpperCase()],
    blockOversell: enabled,
  };
  cookieStore.set(WORKSPACE_PREFS_COOKIE, JSON.stringify(store), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}
