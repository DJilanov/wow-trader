import { guideDiscordId } from "./guide-auth";
import { readGuideAccessSettings } from "./guide-access-config";
import { checkKfcCertifiedRole } from "./guide-access-policy";
import { guideRevolutSettings } from "./guide-revolut";
import { guideSupportStatus, type GuidePaymentStatus } from "./guide-support";

export interface GuideDownloadAccess {
  readonly state: "unavailable" | "signed_out" | "certified" | "supporter" | "restricted";
  readonly downloadsEnabled: boolean;
  readonly paymentsEnabled: boolean;
  readonly payment: GuidePaymentStatus;
}

export async function getGuideDownloadAccess(): Promise<GuideDownloadAccess> {
  const settings = readGuideAccessSettings();
  const base = {
    downloadsEnabled: settings.downloadsEnabled,
    paymentsEnabled: settings.paymentsEnabled && Boolean(guideRevolutSettings()),
    payment: "none" as GuidePaymentStatus,
  };
  if (!settings.ready) return { ...base, state: "unavailable" };
  try {
    const id = await guideDiscordId();
    if (!id) return { ...base, state: "signed_out" };
    const downloadsEnabled =
      settings.downloadsEnabled || Boolean(settings.previewIds?.includes(id));
    const role = await checkKfcCertifiedRole(id, settings.botToken);
    if (role === "certified")
      return { ...base, downloadsEnabled, state: "certified", paymentsEnabled: false };
    const payment = await guideSupportStatus(id);
    if (payment === "approved")
      return { ...base, downloadsEnabled, state: "supporter", payment, paymentsEnabled: false };
    return { ...base, state: role === "unavailable" ? "unavailable" : "restricted", payment };
  } catch {
    return { ...base, state: "unavailable", paymentsEnabled: false, payment: "unavailable" };
  }
}
