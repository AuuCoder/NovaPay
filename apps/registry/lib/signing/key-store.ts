/**
 * Self-contained in-memory signing-key store for the Registry phase 1.
 *
 * The persistence layer (Prisma `SigningKey` model from task 1.2) is wired
 * later. This module exposes a pure-TypeScript store + adapter contract so
 * other phase 1 modules (bundle pipeline, trust.json route, public API) can
 * consume signing keys without depending on a database during tests.
 *
 * Status semantics follow design.md "Signing Key 管理与轮换":
 *   - exactly one ACTIVE key at a time
 *   - rotated keys move to RETIRED with notAfter >= now + 30d (Req 19.3)
 *   - listTrustAnchors() drops expired RETIRED keys
 */

export type SigningKeyAlgorithm = "Ed25519";
export type SigningKeyStatus = "ACTIVE" | "RETIRED";

export interface SigningKeyRecord {
  keyId: string;
  alg: SigningKeyAlgorithm;
  /** base64url-encoded raw 32-byte Ed25519 public key */
  publicKey: string;
  kmsKeyArn: string | null;
  status: SigningKeyStatus;
  notBefore: Date;
  notAfter: Date;
  createdAt: Date;
}

export interface NewSigningKeyInput {
  keyId: string;
  alg: SigningKeyAlgorithm;
  publicKey: string;
  kmsKeyArn: string | null;
  notBefore: Date;
  notAfter: Date;
}

export interface RotationResult {
  newActive: SigningKeyRecord;
  retired: SigningKeyRecord | null;
}

export interface SigningKeyStore {
  /** Returns the single ACTIVE key. Throws if no key has been provisioned. */
  getActive(): Promise<SigningKeyRecord>;
  getByKeyId(keyId: string): Promise<SigningKeyRecord | null>;
  /**
   * ACTIVE + RETIRED keys whose notAfter is still in the future, sorted by
   * createdAt ascending. Used to populate `/.well-known/trust.json`.
   */
  listTrustAnchors(now?: Date): Promise<SigningKeyRecord[]>;
  /**
   * Provision a new ACTIVE key and demote the current ACTIVE key (if any) to
   * RETIRED with notAfter pushed to at least `now + minRetiredGraceMs` (Req
   * 19.3). Throws when `newKey.keyId` collides with an existing record.
   */
  rotate(input: {
    newKey: NewSigningKeyInput;
    minRetiredGraceMs?: number;
  }): Promise<RotationResult>;
}

/** 30 days expressed in milliseconds. Required by Req 19.3 for trust.json. */
export const DEFAULT_RETIRED_KEY_GRACE_MS = 30 * 24 * 60 * 60 * 1000;

const NO_ACTIVE_KEY_ERROR = "No active signing key configured.";

function clone(record: SigningKeyRecord): SigningKeyRecord {
  return {
    ...record,
    notBefore: new Date(record.notBefore.getTime()),
    notAfter: new Date(record.notAfter.getTime()),
    createdAt: new Date(record.createdAt.getTime()),
  };
}

export function createInMemorySigningKeyStore(
  initial: SigningKeyRecord[] = [],
): SigningKeyStore {
  const records = new Map<string, SigningKeyRecord>();

  for (const record of initial) {
    if (records.has(record.keyId)) {
      throw new Error(`Signing key already exists: ${record.keyId}`);
    }
    records.set(record.keyId, clone(record));
  }

  function getCurrentActive(): SigningKeyRecord | null {
    for (const record of records.values()) {
      if (record.status === "ACTIVE") {
        return record;
      }
    }
    return null;
  }

  return {
    async getActive(): Promise<SigningKeyRecord> {
      const active = getCurrentActive();
      if (!active) {
        throw new Error(NO_ACTIVE_KEY_ERROR);
      }
      return clone(active);
    },

    async getByKeyId(keyId: string): Promise<SigningKeyRecord | null> {
      const record = records.get(keyId);
      return record ? clone(record) : null;
    },

    async listTrustAnchors(now: Date = new Date()): Promise<SigningKeyRecord[]> {
      const cutoff = now.getTime();
      return [...records.values()]
        .filter((record) => record.notAfter.getTime() > cutoff)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map(clone);
    },

    async rotate(input: {
      newKey: NewSigningKeyInput;
      minRetiredGraceMs?: number;
    }): Promise<RotationResult> {
      const { newKey } = input;

      if (records.has(newKey.keyId)) {
        throw new Error(`Signing key already exists: ${newKey.keyId}`);
      }

      const now = new Date();
      const grace = input.minRetiredGraceMs ?? DEFAULT_RETIRED_KEY_GRACE_MS;
      const minRetiredNotAfter = now.getTime() + grace;

      let retired: SigningKeyRecord | null = null;
      const currentActive = getCurrentActive();

      if (currentActive) {
        const updatedNotAfter = Math.max(
          currentActive.notAfter.getTime(),
          minRetiredNotAfter,
        );
        const retiredRecord: SigningKeyRecord = {
          ...currentActive,
          status: "RETIRED",
          notAfter: new Date(updatedNotAfter),
        };
        records.set(retiredRecord.keyId, retiredRecord);
        retired = clone(retiredRecord);
      }

      const newRecord: SigningKeyRecord = {
        keyId: newKey.keyId,
        alg: newKey.alg,
        publicKey: newKey.publicKey,
        kmsKeyArn: newKey.kmsKeyArn,
        status: "ACTIVE",
        notBefore: new Date(newKey.notBefore.getTime()),
        notAfter: new Date(newKey.notAfter.getTime()),
        createdAt: now,
      };
      records.set(newRecord.keyId, newRecord);

      return {
        newActive: clone(newRecord),
        retired,
      };
    },
  };
}
