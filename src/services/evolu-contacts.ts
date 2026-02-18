import * as Evolu from "@evolu/common";
import { createEvolu, SimpleName } from "@evolu/common";
import { evoluReactWebDeps } from "@evolu/react-web";
import { hmac } from "@noble/hashes/hmac.js";
import { sha512 } from "@noble/hashes/sha2.js";
import { HDKey } from "@scure/bip32";
import { entropyToMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { recoverMasterSecret, validateMnemonic } from "../utils/slip39-full";

const NOSTR_DERIVATION_PATH = "m/44'/1237'/0'/0/0";
const LINKY_EVOLU_PREFIX = "linky-evolu-v1:";
const META_OWNER_DERIVATION_PATH = "m/83696968'/39'/0'/24'/1'/0'";
const CONTACT_OWNER_DERIVATION_BASE_PATH = "m/83696968'/39'/0'/24'/2'";
const OWNER_META_POINTER_ROW_ID = Evolu.createIdFromString<"OwnerMeta">(
  "contacts-owner-active",
);
const OWNER_META_SCOPE_CONTACTS = "contacts";
const BIP85_HMAC_KEY = "bip-entropy-from-k";
const LINKY_DB_NAME = "linky";
const CONTACTS_DEBUG_PREFIX = "[inheritance][contacts-debug]";
const QUERY_TIMEOUT_MS = 20000;
const INSTANCE_READY_TIMEOUT_MS = 15000;

const ContactId = Evolu.id("Contact");
const MetaId = Evolu.id("Meta");
const OwnerMetaId = Evolu.id("OwnerMeta");

const Schema = {
  meta: {
    id: MetaId,
    key: Evolu.nullOr(Evolu.NonEmptyString1000),
    value: Evolu.nullOr(Evolu.NonEmptyString1000),
  },
  ownerMeta: {
    id: OwnerMetaId,
    scope: Evolu.NonEmptyString100,
    value: Evolu.NonEmptyString1000,
  },
  contact: {
    id: ContactId,
    name: Evolu.nullOr(Evolu.NonEmptyString1000),
    npub: Evolu.nullOr(Evolu.NonEmptyString1000),
  },
};

type EvoluInstance = ReturnType<typeof createLaneInstance>;
type EvoluQueryRow = Record<string, unknown>;
const laneInstanceCache = new Map<string, EvoluInstance>();

interface EvoluSelectBuilder {
  selectAll: () => EvoluSelectBuilder;
  where: (
    column: string,
    operator: string,
    value: unknown,
  ) => EvoluSelectBuilder;
  orderBy: (column: string, order: "asc" | "desc") => EvoluSelectBuilder;
  limit: (count: number) => EvoluSelectBuilder;
}

interface EvoluQueryBuilder {
  selectFrom: (table: string) => EvoluSelectBuilder;
}

export interface EvoluContactSummary {
  name: string;
  npub: string;
}

export interface EvoluContactsOwnerInfo {
  source: "direct-linky" | "owner-lane" | "owner-lane-fallback" | "none";
  pointer: string | null;
  index: number | null;
  previousPointer: string | null;
}

export interface EvoluContactsLoadResult {
  contacts: EvoluContactSummary[];
  ownerInfo: EvoluContactsOwnerInfo;
}

interface ContactOwnerPointerResolution {
  index: number;
  pointer: string;
}

function createLaneInstance(ownerMnemonic: string, dbName?: string) {
  const mnemonicResult = Evolu.Mnemonic.fromUnknown(ownerMnemonic);
  if (!mnemonicResult.ok) {
    throw new Error("Nepodařilo se vytvořit Evolu owner mnemonic");
  }

  const ownerSecret = Evolu.mnemonicToOwnerSecret(mnemonicResult.value);
  const appOwner = Evolu.createAppOwner(ownerSecret);

  const instance = createEvolu(evoluReactWebDeps)(Schema, {
    name: buildLaneDatabaseName(ownerMnemonic, dbName),
    externalAppOwner: appOwner,
  });

  const ensureSchemaFn = Reflect.get(Object(instance), "ensureSchema");
  if (typeof ensureSchemaFn === "function") {
    ensureSchemaFn.call(instance, Schema);
  }

  return instance;
}

function getCachedLaneInstance(
  ownerMnemonic: string,
  dbName: string,
): EvoluInstance {
  const cacheKey = `${ownerMnemonic}::${dbName}`;
  const cached = laneInstanceCache.get(cacheKey);
  if (cached) return cached;
  const created = createLaneInstance(ownerMnemonic, dbName);
  laneInstanceCache.set(cacheKey, created);
  return created;
}

function buildLaneDatabaseName(ownerMnemonic: string, dbName?: string) {
  if (dbName) return SimpleName.orThrow(dbName);
  return SimpleName.orThrow(generateDbNameFromMnemonic(ownerMnemonic));
}

function generateDbNameFromMnemonic(mnemonic: string): string {
  let hash = 0;
  for (let index = 0; index < mnemonic.length; index += 1) {
    const char = mnemonic.charCodeAt(index);
    hash = ((hash << 5) - hash + char) | 0;
  }
  const hashHex = Math.abs(hash).toString(16).padStart(8, "0").slice(0, 8);
  return `linky-${hashHex}`;
}

function createUntypedQuery(
  instance: EvoluInstance,
  callback: (db: EvoluQueryBuilder) => EvoluSelectBuilder,
): unknown {
  const createQueryFn = Reflect.get(Object(instance), "createQuery");
  if (typeof createQueryFn !== "function") return null;
  return createQueryFn.call(instance, callback);
}

async function waitForInstanceReady(instance: EvoluInstance, dbName: string) {
  const appOwnerPromise = Reflect.get(Object(instance), "appOwner");
  if (!(appOwnerPromise instanceof Promise)) return;

  await Promise.race([
    appOwnerPromise,
    new Promise<never>((_, reject) => {
      globalThis.setTimeout(() => {
        reject(
          new Error(
            `Instance readiness timeout after ${INSTANCE_READY_TIMEOUT_MS} ms`,
          ),
        );
      }, INSTANCE_READY_TIMEOUT_MS);
    }),
  ]);

  console.info(`${CONTACTS_DEBUG_PREFIX} instance-ready`, {
    dbName,
  });
}

async function withLaneDbFallbackRows(
  ownerMnemonic: string,
  execute: (
    instance: EvoluInstance,
    dbName: string,
  ) => Promise<EvoluQueryRow[]>,
): Promise<EvoluQueryRow[]> {
  const names = Array.from(
    new Set([LINKY_DB_NAME, generateDbNameFromMnemonic(ownerMnemonic)]),
  );

  let lastRows: EvoluQueryRow[] = [];

  for (const candidateName of names) {
    try {
      const instance = getCachedLaneInstance(ownerMnemonic, candidateName);
      await waitForInstanceReady(instance, candidateName);
      const result = await execute(instance, candidateName);
      console.info(`${CONTACTS_DEBUG_PREFIX} db-success`, {
        dbName: candidateName,
        rows: result.length,
      });
      if (result.length > 0) {
        return result;
      }
      lastRows = result;
    } catch (error) {
      console.warn(`${CONTACTS_DEBUG_PREFIX} db-failed`, {
        dbName: candidateName,
        error: String(error ?? "unknown"),
      });
    }
  }

  console.warn(`${CONTACTS_DEBUG_PREFIX} db-fallback-exhausted`, {
    triedDbNames: names,
  });
  return lastRows;
}

async function loadUntypedQueryRows(
  instance: EvoluInstance,
  query: unknown,
  queryLabel = "unknown",
): Promise<ReadonlyArray<EvoluQueryRow>> {
  const loadQueryFn = Reflect.get(Object(instance), "loadQuery");
  if (typeof loadQueryFn !== "function") return [];

  try {
    console.info(`${CONTACTS_DEBUG_PREFIX} query-start`, {
      queryLabel,
      timeoutMs: QUERY_TIMEOUT_MS,
    });

    const rows = await Promise.race([
      loadQueryFn.call(instance, query) as Promise<unknown>,
      new Promise<unknown>((_, reject) => {
        globalThis.setTimeout(() => {
          reject(new Error(`Query timeout after ${QUERY_TIMEOUT_MS} ms`));
        }, QUERY_TIMEOUT_MS);
      }),
    ]);

    console.info(`${CONTACTS_DEBUG_PREFIX} query-finished`, {
      queryLabel,
      isArray: Array.isArray(rows),
    });

    if (!Array.isArray(rows)) return [];
    return rows.filter((row): row is EvoluQueryRow => isRecord(row));
  } catch (error) {
    console.warn(`${CONTACTS_DEBUG_PREFIX} query-failed`, {
      queryLabel,
      error: String(error ?? "unknown"),
    });
    return [];
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toTrimmedText(value: unknown): string {
  return String(value ?? "").trim();
}

function isDeletedRow(row: EvoluQueryRow): boolean {
  const value = row.isDeleted;
  if (value === true) return true;
  if (value === 1 || value === "1") return true;
  return false;
}

function normalizeSlip39Mnemonic(value: string): string {
  return String(value ?? "")
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
}

async function recoverMasterSecretFromSlip39(
  sourceMnemonic: string,
): Promise<Uint8Array> {
  const normalized = normalizeSlip39Mnemonic(sourceMnemonic);
  if (!normalized) {
    throw new Error("Prázdný SLIP-39 seed");
  }
  if (!validateMnemonic(normalized)) {
    throw new Error("Neplatný SLIP-39 seed");
  }
  return recoverMasterSecret(normalized);
}

function deriveOwnerMnemonicFromPath(
  masterSecret: Uint8Array,
  derivationPath: string,
): string {
  const root = HDKey.fromMasterSeed(masterSecret);
  const child = root.derive(derivationPath);

  if (!child.privateKey) {
    throw new Error(`Nepodařilo se odvodit klíč pro cestu ${derivationPath}`);
  }

  const hmacKeyBytes = new TextEncoder().encode(BIP85_HMAC_KEY);
  const digest = hmac(sha512, hmacKeyBytes, child.privateKey);
  const entropy = digest.slice(0, 16);
  return entropyToMnemonic(entropy, wordlist);
}

async function deriveLinkyEvoluMnemonicFromSourceMnemonic(
  sourceMnemonic: string,
): Promise<string> {
  const masterSecret = await recoverMasterSecretFromSlip39(sourceMnemonic);
  const nostrMasterKey = HDKey.fromMasterSeed(masterSecret);
  const child = nostrMasterKey.derive(NOSTR_DERIVATION_PATH);

  if (!child.privateKey) {
    throw new Error("Nepodařilo se odvodit Nostr privátní klíč");
  }

  const prefix = new TextEncoder().encode(LINKY_EVOLU_PREFIX);
  const privateKey = new Uint8Array(child.privateKey);
  const data = new Uint8Array(prefix.length + privateKey.length);
  data.set(prefix, 0);
  data.set(privateKey, prefix.length);

  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const entropy = new Uint8Array(hashBuffer).slice(0, 16);
  return entropyToMnemonic(entropy, wordlist);
}

function toNonNegativeInt(value: unknown): number | null {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

function buildContactOwnerPointer(index: number): string {
  return `contacts-${index}`;
}

function inferContactOwnerPointer(
  metaRows: ReadonlyArray<EvoluQueryRow>,
): ContactOwnerPointerResolution {
  const pointerRowId = toTrimmedText(OWNER_META_POINTER_ROW_ID);

  for (const row of metaRows) {
    const scope = toTrimmedText(row.scope);
    if (scope && scope !== OWNER_META_SCOPE_CONTACTS) continue;

    const rowId = toTrimmedText(row.id);
    if (rowId && rowId !== pointerRowId) {
      const pointerCandidate = /^contacts-(\d+)$/.exec(
        toTrimmedText(row.value),
      );
      if (!pointerCandidate) continue;
    }

    const valueText = toTrimmedText(row.value);
    const pointerMatch = /^contacts-(\d+)$/.exec(valueText);
    if (pointerMatch) {
      const parsedPointer = toNonNegativeInt(pointerMatch[1]);
      if (parsedPointer !== null) {
        console.info(`${CONTACTS_DEBUG_PREFIX} owner-pointer`, {
          source: "ownerMeta.value",
          pointer: valueText,
          index: parsedPointer,
          rowId,
          scope,
        });
        return {
          index: parsedPointer,
          pointer: buildContactOwnerPointer(parsedPointer),
        };
      }
    }

    const directCandidates = [
      row.contactOwnerIndex,
      row.contactsOwnerIndex,
      row.ownerIndex,
      row.index,
      row.value,
    ];

    for (const candidate of directCandidates) {
      const asInt = toNonNegativeInt(candidate);
      if (asInt !== null) {
        console.info(`${CONTACTS_DEBUG_PREFIX} owner-pointer`, {
          source: "legacy-direct",
          index: asInt,
          rowId,
          scope,
        });
        return {
          index: asInt,
          pointer: buildContactOwnerPointer(asInt),
        };
      }

      const candidateText = toTrimmedText(candidate);
      if (!candidateText.startsWith("{")) continue;
      try {
        const parsed = JSON.parse(candidateText) as unknown;
        if (!isRecord(parsed)) continue;
        const nestedCandidates = [
          parsed.contactOwnerIndex,
          parsed.contactsOwnerIndex,
          parsed.ownerIndex,
          parsed.index,
          parsed.value,
        ];
        for (const nested of nestedCandidates) {
          const nestedInt = toNonNegativeInt(nested);
          if (nestedInt !== null) {
            console.info(`${CONTACTS_DEBUG_PREFIX} owner-pointer`, {
              source: "legacy-json",
              index: nestedInt,
              rowId,
              scope,
            });
            return {
              index: nestedInt,
              pointer: buildContactOwnerPointer(nestedInt),
            };
          }
        }
      } catch {
        // ignore malformed JSON
      }
    }
  }

  console.info(`${CONTACTS_DEBUG_PREFIX} owner-pointer-default`, {
    index: 0,
    metaRowsCount: metaRows.length,
  });
  return {
    index: 0,
    pointer: buildContactOwnerPointer(0),
  };
}

async function readMetaRows(ownerMnemonic: string): Promise<EvoluQueryRow[]> {
  const rows = await withLaneDbFallbackRows(ownerMnemonic, async (instance) => {
    const ownerMetaQuery = createUntypedQuery(instance, (db) =>
      db.selectFrom("ownerMeta").selectAll().limit(200),
    );

    const ownerMetaRows = await loadUntypedQueryRows(
      instance,
      ownerMetaQuery,
      "ownerMeta-primary",
    );
    const ownerMetaRowsActive = ownerMetaRows.filter(
      (row) => !isDeletedRow(row),
    );
    if (ownerMetaRowsActive.length > 0) {
      console.info(`${CONTACTS_DEBUG_PREFIX} ownerMeta-rows`, {
        count: ownerMetaRowsActive.length,
      });
      return [...ownerMetaRowsActive];
    }

    const legacyMetaQuery = createUntypedQuery(instance, (db) =>
      db.selectFrom("meta").selectAll().limit(200),
    );

    const legacyRows = await loadUntypedQueryRows(
      instance,
      legacyMetaQuery,
      "meta-legacy",
    );
    const legacyRowsActive = legacyRows.filter((row) => !isDeletedRow(row));
    console.info(`${CONTACTS_DEBUG_PREFIX} legacy-meta-rows`, {
      count: legacyRowsActive.length,
    });
    return [...legacyRowsActive];
  });

  return rows;
}

async function readContactRows(
  ownerMnemonic: string,
): Promise<ReadonlyArray<EvoluQueryRow>> {
  const rows = await withLaneDbFallbackRows(ownerMnemonic, async (instance) => {
    const primaryQuery = createUntypedQuery(instance, (db) =>
      db.selectFrom("contact").selectAll().limit(600),
    );

    const primaryRows = await loadUntypedQueryRows(
      instance,
      primaryQuery,
      "contact-primary",
    );
    const activeRows = primaryRows.filter((row) => !isDeletedRow(row));
    if (activeRows.length > 0) {
      console.info(`${CONTACTS_DEBUG_PREFIX} contact-rows-primary`, {
        count: activeRows.length,
      });
      return activeRows;
    }

    const fallbackQuery = createUntypedQuery(instance, (db) =>
      db.selectFrom("contact").selectAll().limit(600),
    );

    const fallbackRowsRaw = await loadUntypedQueryRows(
      instance,
      fallbackQuery,
      "contact-fallback",
    );
    const fallbackRows = fallbackRowsRaw.filter((row) => !isDeletedRow(row));
    console.info(`${CONTACTS_DEBUG_PREFIX} contact-rows-fallback`, {
      count: fallbackRows.length,
    });
    return fallbackRows;
  });

  return rows;
}

async function readLinkyPrimaryContactRows(
  ownerMnemonic: string,
): Promise<ReadonlyArray<EvoluQueryRow>> {
  const rows = await withLaneDbFallbackRows(ownerMnemonic, async (instance) => {
    const query = createUntypedQuery(instance, (db) =>
      db.selectFrom("contact").selectAll().limit(600),
    );

    const directRows = await loadUntypedQueryRows(
      instance,
      query,
      "contact-direct-linky",
    );
    const activeRows = directRows.filter((row) => !isDeletedRow(row));
    console.info(`${CONTACTS_DEBUG_PREFIX} direct-linky-contact-rows`, {
      count: activeRows.length,
    });
    return activeRows;
  });

  return rows;
}

function normalizeContacts(
  rows: ReadonlyArray<EvoluQueryRow>,
): EvoluContactSummary[] {
  const dedupedByNpub = new Map<string, EvoluContactSummary>();

  for (const row of rows) {
    const npub = toTrimmedText(row.npub);
    if (!npub) continue;

    const name = toTrimmedText(row.name) || "Bez jména";
    if (!dedupedByNpub.has(npub)) {
      dedupedByNpub.set(npub, { name, npub });
    }
  }

  return Array.from(dedupedByNpub.values());
}

export async function loadEvoluContactsWithOwnerInfoFromMnemonic(
  sourceMnemonic: string,
): Promise<EvoluContactsLoadResult> {
  console.info(`${CONTACTS_DEBUG_PREFIX} load-start`);

  try {
    const linkyEvoluMnemonic =
      await deriveLinkyEvoluMnemonicFromSourceMnemonic(sourceMnemonic);
    const linkyContactRows =
      await readLinkyPrimaryContactRows(linkyEvoluMnemonic);
    if (linkyContactRows.length > 0) {
      const normalized = normalizeContacts(linkyContactRows);
      console.info(`${CONTACTS_DEBUG_PREFIX} load-success-direct`, {
        rawCount: linkyContactRows.length,
        normalizedCount: normalized.length,
      });
      return {
        contacts: normalized,
        ownerInfo: {
          source: "direct-linky",
          pointer: null,
          index: null,
          previousPointer: null,
        },
      };
    }
    console.info(`${CONTACTS_DEBUG_PREFIX} load-direct-empty`);
  } catch (error) {
    console.warn("Nepodařilo se načíst Linky Evolu owner kontakty:", error);
  }

  try {
    const masterSecret = await recoverMasterSecretFromSlip39(sourceMnemonic);

    const metaOwnerMnemonic = deriveOwnerMnemonicFromPath(
      masterSecret,
      META_OWNER_DERIVATION_PATH,
    );
    const metaRows = await readMetaRows(metaOwnerMnemonic);

    const ownerPointer = inferContactOwnerPointer(metaRows);
    const contactOwnerIndex = ownerPointer.index;
    console.info(`${CONTACTS_DEBUG_PREFIX} selected-contact-owner-index`, {
      index: contactOwnerIndex,
      pointer: ownerPointer.pointer,
      metaRowsCount: metaRows.length,
    });

    const contactOwnerPath = `${CONTACT_OWNER_DERIVATION_BASE_PATH}/${contactOwnerIndex}'`;
    const contactsOwnerMnemonic = deriveOwnerMnemonicFromPath(
      masterSecret,
      contactOwnerPath,
    );

    let contactRows = await readContactRows(contactsOwnerMnemonic);
    let selectedSource: EvoluContactsOwnerInfo["source"] = "owner-lane";
    let previousPointer: string | null = null;

    if (contactRows.length === 0 && contactOwnerIndex > 0) {
      const previousIndex = contactOwnerIndex - 1;
      const previousOwnerPath = `${CONTACT_OWNER_DERIVATION_BASE_PATH}/${previousIndex}'`;
      const previousOwnerMnemonic = deriveOwnerMnemonicFromPath(
        masterSecret,
        previousOwnerPath,
      );
      const previousRows = await readContactRows(previousOwnerMnemonic);
      if (previousRows.length > 0) {
        contactRows = previousRows;
        selectedSource = "owner-lane-fallback";
        previousPointer = buildContactOwnerPointer(previousIndex);
      }
    }

    const normalized = normalizeContacts(contactRows);
    console.info(`${CONTACTS_DEBUG_PREFIX} load-success-lane`, {
      rawCount: contactRows.length,
      normalizedCount: normalized.length,
      source: selectedSource,
      pointer: ownerPointer.pointer,
      previousPointer,
    });
    return {
      contacts: normalized,
      ownerInfo: {
        source: selectedSource,
        pointer: ownerPointer.pointer,
        index: contactOwnerIndex,
        previousPointer,
      },
    };
  } catch (error) {
    console.warn("Nepodařilo se načíst Evolu kontakty:", error);
    return {
      contacts: [],
      ownerInfo: {
        source: "none",
        pointer: null,
        index: null,
        previousPointer: null,
      },
    };
  }
}

export async function loadEvoluContactsFromMnemonic(
  sourceMnemonic: string,
): Promise<EvoluContactSummary[]> {
  const result =
    await loadEvoluContactsWithOwnerInfoFromMnemonic(sourceMnemonic);
  return result.contacts;
}
