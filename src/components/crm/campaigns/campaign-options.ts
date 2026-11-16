import type { CampaignStatus, RecipientStatus } from "@/types/crm";

/**
 * Campaign vocabulary lives in `src/types/crm.ts` (unions, value arrays,
 * labels) so services and screens share one set of words. This file keeps
 * only the presentational part — the `CrmChip` tone per stored value — and
 * re-exports the vocabulary so campaign imports stay one line.
 */

export {
  CAMPAIGN_CHANNELS,
  CAMPAIGN_CHANNEL_LABELS,
  CAMPAIGN_STATUSES,
  CAMPAIGN_STATUS_LABELS,
  CAMPAIGN_TYPES,
  CAMPAIGN_TYPE_LABELS,
  RECIPIENT_STATUSES,
  RECIPIENT_STATUS_LABELS,
} from "@/types/crm";

/** CrmChip tone per campaign status — colour follows the stored value. */
export const CAMPAIGN_STATUS_TONES: Record<
  CampaignStatus,
  "neutral" | "positive" | "warning" | "danger"
> = {
  draft: "neutral",
  scheduled: "warning",
  active: "positive",
  completed: "neutral",
  cancelled: "danger",
};

export const RECIPIENT_STATUS_TONES: Record<
  RecipientStatus,
  "neutral" | "positive" | "warning" | "danger"
> = {
  selected: "neutral",
  marked_sent: "warning",
  responded: "positive",
  redeemed: "positive",
  opted_out: "danger",
};
