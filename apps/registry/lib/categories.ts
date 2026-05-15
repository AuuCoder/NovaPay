/**
 * Plugin category management (Req 2.1–2.5).
 *
 * Categories are simple records with a unique `code`, localized display names,
 * and an optional `featured` flag. Plugins can be linked to 0–N categories.
 */

export interface CategoryRecord {
  code: string;
  displayName: { zh: string; en: string };
  description?: { zh: string; en: string } | null;
  featured: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CategoryStore {
  list(): Promise<CategoryRecord[]>;
  getByCode(code: string): Promise<CategoryRecord | null>;
  create(input: CreateCategoryInput): Promise<CategoryRecord>;
  update(code: string, input: UpdateCategoryInput): Promise<CategoryRecord>;
}

export interface CreateCategoryInput {
  code: string;
  displayName: { zh: string; en: string };
  description?: { zh: string; en: string } | null;
  featured?: boolean;
  sortOrder?: number;
}

export interface UpdateCategoryInput {
  displayName?: { zh: string; en: string };
  description?: { zh: string; en: string } | null;
  featured?: boolean;
  sortOrder?: number;
}

export type CategoryErrorCode =
  | "CODE_ALREADY_EXISTS"
  | "CATEGORY_NOT_FOUND"
  | "INVALID_CODE";

export function validateCategoryCode(code: string): boolean {
  return /^[a-z0-9][a-z0-9_-]{1,48}[a-z0-9]$/.test(code);
}

export function createInMemoryCategoryStore(): CategoryStore {
  const records = new Map<string, CategoryRecord>();

  return {
    async list() {
      return [...records.values()].sort((a, b) => a.sortOrder - b.sortOrder);
    },
    async getByCode(code) {
      return records.get(code) ?? null;
    },
    async create(input) {
      if (records.has(input.code)) {
        throw new Error(`Category code already exists: ${input.code}`);
      }
      if (!validateCategoryCode(input.code)) {
        throw new Error(`Invalid category code: ${input.code}`);
      }
      const now = new Date();
      const record: CategoryRecord = {
        code: input.code,
        displayName: input.displayName,
        description: input.description ?? null,
        featured: input.featured ?? false,
        sortOrder: input.sortOrder ?? 0,
        createdAt: now,
        updatedAt: now,
      };
      records.set(record.code, record);
      return { ...record };
    },
    async update(code, input) {
      const existing = records.get(code);
      if (!existing) {
        throw new Error(`Category not found: ${code}`);
      }
      const updated: CategoryRecord = {
        ...existing,
        ...(input.displayName ? { displayName: input.displayName } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.featured !== undefined ? { featured: input.featured } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        updatedAt: new Date(),
      };
      records.set(code, updated);
      return { ...updated };
    },
  };
}
