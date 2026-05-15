/**
 * Developer sales & install statistics (Req 8.1, 8.3, 8.4).
 *
 * Phase 2 provides install count aggregation only (no revenue data until
 * Phase 3 introduces paid licensing). Access is scoped to the plugin owner;
 * attempts to query other developers' plugins return FORBIDDEN_PLUGIN.
 */

export interface DailyInstallStat {
  date: string; // YYYY-MM-DD
  distinctInstances: number;
  enabledMerchants: number;
}

export interface SalesQueryInput {
  pluginSlug: string;
  developerId: string;
  startDate?: string;
  endDate?: string;
}

export type SalesErrorCode = "PLUGIN_NOT_FOUND" | "FORBIDDEN_PLUGIN";

export interface SalesResult {
  success: boolean;
  errorCode?: SalesErrorCode;
  stats?: DailyInstallStat[];
}

export interface SalesStore {
  getPluginOwner(pluginSlug: string): Promise<string | null>;
  getDailyInstallStats(pluginSlug: string, startDate?: string, endDate?: string): Promise<DailyInstallStat[]>;
}

export async function queryPluginSales(
  input: SalesQueryInput,
  store: SalesStore,
): Promise<SalesResult> {
  const ownerId = await store.getPluginOwner(input.pluginSlug);

  if (ownerId === null) {
    return { success: false, errorCode: "PLUGIN_NOT_FOUND" };
  }

  if (ownerId !== input.developerId) {
    return { success: false, errorCode: "FORBIDDEN_PLUGIN" };
  }

  const stats = await store.getDailyInstallStats(
    input.pluginSlug,
    input.startDate,
    input.endDate,
  );

  return { success: true, stats };
}
