/**
 * Plugin take-down appeal handling (Req 1.6, 3.3).
 *
 * When a plugin has been taken down, the developer can submit an appeal note.
 * This module provides the logic; the actual persistence is handled by the
 * caller (route handler → Prisma).
 */

export interface AppealInput {
  pluginSlug: string;
  developerId: string;
  appealNote: string;
}

export type AppealErrorCode =
  | "PLUGIN_NOT_TAKEN_DOWN"
  | "NOT_PLUGIN_OWNER"
  | "APPEAL_NOTE_EMPTY";

export interface AppealResult {
  success: boolean;
  errorCode?: AppealErrorCode;
}

export interface AppealContext {
  pluginTakenDown: boolean;
  pluginOwnerId: string;
}

export function validateAppeal(
  input: AppealInput,
  context: AppealContext,
): AppealResult {
  if (!input.appealNote.trim()) {
    return { success: false, errorCode: "APPEAL_NOTE_EMPTY" };
  }
  if (!context.pluginTakenDown) {
    return { success: false, errorCode: "PLUGIN_NOT_TAKEN_DOWN" };
  }
  if (context.pluginOwnerId !== input.developerId) {
    return { success: false, errorCode: "NOT_PLUGIN_OWNER" };
  }
  return { success: true };
}
