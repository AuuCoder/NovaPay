import {
  getActivePaymentProvider,
  listInstalledPaymentChannels,
} from "@/lib/plugins/marketplace";
import { getPaymentPlugin, listPaymentPlugins } from "@/lib/payments/plugins";
import type { PaymentProvider } from "@/lib/payments/types";

export function getPaymentProvider(channelCode: string) {
  return getPaymentPlugin(channelCode)?.provider;
}

export async function getInstalledPaymentProvider(channelCode: string) {
  return getActivePaymentProvider(channelCode);
}

export function listPaymentChannels() {
  return listPaymentPlugins().map((plugin) => plugin.provider.getSummary());
}

export async function listAvailablePaymentChannels() {
  return listInstalledPaymentChannels();
}

export type { PaymentProvider };
