import { clsx as clsx$1 } from "clsx";
import { s as ssr_context, d as derived, c as attr_class, f as clsx, a as attr, e as ensure_array_like, h as hasContext, g as getContext, i as setContext, j as run, k as attr_style, l as spread_props, b as escape_html, m as stringify, n as attributes, A as ATTACHMENT_KEY, o as on, p as props_id, q as bind_props, t as getAllContexts, u as element } from "../../chunks/root.js";
import { g as getLocale, s as setLocale } from "../../chunks/runtime.js";
import "@sveltejs/kit/internal";
import "../../chunks/exports.js";
import "../../chunks/utils.js";
import { try_get_request_store } from "@sveltejs/kit/internal/server";
import { r as replaceState } from "../../chunks/client.js";
import { computePosition, offset, shift, limitShift, flip, size, arrow, hide } from "@floating-ui/dom";
import parse from "style-to-object";
import { l as lifecycle_function_unavailable } from "../../chunks/render-context.js";
import { tabbable, focusable, isFocusable, isTabbable } from "tabbable";
import * as d3 from "d3";
import { i as initial_base, b as base } from "../../chunks/server.js";
import { r as resolve_route } from "../../chunks/routing.js";
function html(value) {
  var html2 = String(value ?? "");
  var open = "<!---->";
  return open + html2 + "<!---->";
}
function onDestroy(fn) {
  /** @type {SSRContext} */
  ssr_context.r.on_destroy(fn);
}
function mount() {
  lifecycle_function_unavailable("mount");
}
function unmount() {
  lifecycle_function_unavailable("unmount");
}
async function tick() {
}
function resolve(id, params) {
  const resolved = resolve_route(
    id,
    /** @type {Record<string, string>} */
    params
  );
  {
    const store = try_get_request_store();
    if (store && !store.state.prerendering?.fallback) {
      const after_base = store.event.url.pathname.slice(initial_base.length);
      const segments = after_base.split("/").slice(2);
      const prefix = segments.map(() => "..").join("/") || ".";
      return prefix + resolved;
    }
  }
  return base + resolved;
}
class AppStore {
  theme = "light";
  isMobile = false;
  isReady = false;
}
const appStore = new AppStore();
function getConfigValue(path) {
  return void 0;
}
const MetadataParser = {
  phoneMetadata: null,
  targetMetadata: null,
  /** Initialize metadata parser and load data */
  async init() {
    if (!this.phoneMetadata) {
      this.phoneMetadata = await this._fetchBookObject();
    }
    if (!this.targetMetadata) {
      this.targetMetadata = this._fetchTargetObject();
    }
  },
  /** Check if Phone object is included in phoneMetadata (phone_book.json). */
  isPhoneAvailable(identifier) {
    if (!this.phoneMetadata) return false;
    return this.phoneMetadata.some(
      (brand) => brand.phones.some((phone) => phone.identifier === identifier)
    ) || // Try Full-Name search if it doesn't exist
    this.phoneMetadata.some(
      (brand) => brand.phones.some((phone) => {
        return phone.files.some((file) => {
          if (file.fullName) return file.fullName === identifier;
          const baseName = Array.isArray(phone.name) ? phone.name[0] : phone.name;
          const fullName = brand.brand + " " + baseName + " " + file.suffix;
          return fullName === identifier;
        });
      })
    );
  },
  /** Check if Target object is included in targetMetadata (config.js). */
  isTargetAvailable(identifier) {
    if (!this.targetMetadata) return false;
    return this.targetMetadata.some(
      (obj) => obj.files.some(
        (file) => (file.includes(" Target") ? file : `${file} Target`) === (identifier.includes(" Target") ? identifier : `${identifier} Target`)
      )
    );
  },
  /** Get Frequency Response Metadata from phone_book.json if available. */
  getFRMetadata(sourceType, identifier) {
    if (sourceType === "phone") {
      if (!this.phoneMetadata) {
        throw new Error("Phone metadata not loaded");
      }
      for (const brand of this.phoneMetadata) {
        const phone = brand.phones.find((p) => p.identifier === identifier);
        if (phone) {
          return phone;
        }
      }
      return this.searchFRInfoWithFullName(identifier);
    } else if (sourceType === "target") {
      return {
        identifier,
        files: [
          {
            files: `${identifier}.txt`
          }
        ]
      };
    } else {
      const fallback = {
        identifier,
        files: [{ files: `${identifier}.txt` }]
      };
      return fallback;
    }
  },
  /** Search Frequency Response Metadata from phone_book.json with fullName. */
  searchFRInfoWithFullName(inputStr) {
    if (!this.phoneMetadata) {
      throw new Error("Phone metadata not loaded");
    }
    for (const brand of this.phoneMetadata) {
      for (const phone of brand.phones) {
        for (const file of phone.files) {
          if (file.fullName.toLowerCase() === inputStr.toLowerCase() || file.fileName.toLowerCase() === inputStr.toLowerCase() || file.fileName.replace(" ", "_").toLowerCase() === inputStr.toLowerCase()) {
            return {
              ...phone,
              dispSuffix: file.suffix || ""
              // Return matching suffix as well
            };
          }
        }
        if (phone.identifier.toLowerCase() === inputStr.toLowerCase()) {
          return {
            ...phone,
            dispSuffix: phone.files[0].suffix
          };
        }
      }
    }
    throw new Error(`No such data found: ${inputStr}`);
  },
  /** Search Target data from config.js with fullName. */
  searchTargetInfoWithFullName(inputStr) {
    if (!this.targetMetadata) {
      throw new Error("Target metadata not loaded");
    }
    const normalizedInput = inputStr.includes(" Target") ? inputStr : `${inputStr} Target`;
    for (const obj of this.targetMetadata) {
      for (const file of obj.files) {
        const normalizedFile = file.includes(" Target") ? file : `${file} Target`;
        if (normalizedInput.includes(normalizedFile)) {
          return {
            identifier: normalizedFile,
            files: [{ files: `${normalizedFile}.txt` }]
          };
        }
      }
    }
    throw new Error(`No such target data found: ${inputStr}`);
  },
  /** Fetch phone_book metadata from (phone_book.json). */
  async _fetchBookObject() {
    const phonebookPath = getConfigValue() || "../../../data/phone_book.json";
    const rawData = await fetch(phonebookPath).then((r) => r.json());
    return rawData.map((brand) => {
      const brandName = [brand.name, brand.suffix].filter(Boolean).join(" ");
      return {
        brand: brandName,
        phones: brand.phones.map((phone) => {
          const basePhone = {
            brand: brandName,
            ...typeof phone === "object" && phone.reviewScore && { reviewScore: phone.reviewScore },
            ...typeof phone === "object" && phone.reviewLink && { reviewLink: phone.reviewLink },
            ...typeof phone === "object" && phone.shopLink && { shopLink: phone.shopLink },
            ...typeof phone === "object" && phone.price && { price: phone.price },
            ...typeof phone === "object" && phone.description && { description: phone.description }
          };
          if (typeof phone === "string") {
            return {
              ...basePhone,
              name: phone,
              identifier: brandName + " " + phone,
              files: [
                {
                  suffix: this._getSuffix(phone, 0),
                  fullName: (brandName + " " + phone + " " + this._getSuffix(phone, 0)).trim(),
                  files: { L: phone + " L.txt", R: phone + " R.txt" },
                  fileName: phone
                }
              ]
            };
          }
          const baseName = Array.isArray(phone.name) ? phone.name[0] : phone.name;
          const hptfFields = phone.hptf ? {
            hptfFiles: this._generateHpTFFiles(phone.hptf.files),
            hptfLabels: phone.hptf.labels ?? phone.hptf.files,
            hptfFillOnly: phone.hptf.fillOnly ?? true,
            hptfDescription: phone.hptf.description
          } : {};
          if (phone.hptf) {
            const placeholderFile = phone.hptf.files[0];
            return {
              ...basePhone,
              name: baseName,
              identifier: brandName + " " + baseName,
              files: [
                {
                  suffix: "",
                  fullName: (brandName + " " + baseName).trim(),
                  files: { L: `${placeholderFile} L.txt`, R: `${placeholderFile} R.txt` },
                  fileName: placeholderFile,
                  ...hptfFields,
                  hptfOnly: true
                }
              ]
            };
          }
          return {
            ...basePhone,
            name: baseName,
            identifier: brandName + " " + baseName,
            files: Array.isArray(phone.file) ? phone.file.map((file, index) => ({
              suffix: this._getSuffix(phone, index),
              fullName: (brandName + " " + baseName + " " + this._getSuffix(phone, index)).trim(),
              files: { L: `${file} L.txt`, R: `${file} R.txt` },
              fileName: file,
              ...phone.samples && {
                sampleFiles: this._generateSampleFiles(file, phone.samples),
                sampleCount: phone.samples
              },
              ...hptfFields
            })) : [
              {
                suffix: this._getSuffix(phone, 0),
                fullName: (brandName + " " + baseName + " " + this._getSuffix(phone, 0)).trim(),
                files: {
                  L: `${phone.file} L.txt`,
                  R: `${phone.file} R.txt`
                },
                fileName: phone.file || baseName,
                ...phone.samples && {
                  sampleFiles: this._generateSampleFiles(
                    phone.file || baseName,
                    phone.samples
                  ),
                  sampleCount: phone.samples
                },
                ...hptfFields
              }
            ]
          };
        })
      };
    });
  },
  /** Fetch target_manifest metadata from (config.js). */
  _fetchTargetObject() {
    const manifest = getConfigValue() || [];
    return manifest.filter((obj) => Array.isArray(obj.files)).map((obj) => {
      return {
        type: obj.type,
        files: obj.files.map((identifier) => {
          return identifier.includes(" Target") ? identifier : `${identifier} Target`;
        })
      };
    });
  },
  /** Generate HpTF sample file references */
  _generateHpTFFiles(fileNames) {
    return fileNames.map((f) => ({
      L: `${f} L.txt`,
      R: `${f} R.txt`
    }));
  },
  /** Generate sample file references for multi-sample measurements */
  _generateSampleFiles(fileName, sampleCount) {
    return Array.from({ length: sampleCount }, (_, i) => ({
      L: `${fileName} L${i + 1}.txt`,
      R: `${fileName} R${i + 1}.txt`
    }));
  },
  /** Get suffix for phone variants */
  _getSuffix(phone, index = null) {
    if (typeof phone === "string") {
      return "";
    }
    if (Array.isArray(phone.file)) {
      if (Array.isArray(phone.suffix) && index !== null) {
        return phone.suffix[index]?.trim() || String(index);
      } else if (typeof phone.suffix === "string") {
        return phone.suffix.trim() || String(index);
      } else if (Array.isArray(phone.prefix) && index !== null) {
        return phone.file[index]?.replace(new RegExp(phone.prefix[index], "i"), "").trim() || "";
      } else if (typeof phone.prefix === "string" && index !== null) {
        return phone.file[index]?.replace(new RegExp(phone.prefix, "i"), "").trim() || "";
      } else {
        return "";
      }
    } else {
      if (typeof phone.suffix === "string") {
        return phone.suffix.trim() || phone.file?.trim() || "";
      } else if (typeof phone.prefix === "string" && phone.file) {
        return phone.file.replace(new RegExp(phone.prefix, "i"), "").trim();
      } else {
        return "";
      }
    }
  }
};
const SvelteSet = globalThis.Set;
const SvelteMap = globalThis.Map;
function createSubscriber(_) {
  return () => {
  };
}
const SQUIGLINK_DOMAIN = "squig.link";
const OPT_OUT_SITES = /* @__PURE__ */ new Set([
  "64audio",
  "cammyfi",
  "crinacle",
  "eliseaudio",
  "hbb",
  "joycesreview",
  "kr0mka",
  "graph",
  "vsg"
]);
class SquiglinkStore {
  // ── Domain guard ─────────────────────────────────────────────────────────
  isSquiglinkHost;
  isEnabled;
  // ── State ────────────────────────────────────────────────────────────────
  sites = [];
  shopLinks = [];
  sponsorDetail = null;
  sponsorContent = null;
  isLoading = false;
  error = null;
  searchQuery = "";
  #phoneBooks = new SvelteMap();
  #sitesFetched = false;
  #shopLinksFetched = false;
  #sponsorDetailFetched = false;
  #sponsorFetched = false;
  constructor() {
    {
      this.isSquiglinkHost = false;
      this.isEnabled = false;
      return;
    }
  }
  // ── Computed ─────────────────────────────────────────────────────────────
  get currentSiteUsername() {
    return null;
  }
  get isCurrentSiteOptedOut() {
    const username = this.currentSiteUsername;
    return username !== null && OPT_OUT_SITES.has(username);
  }
  #searchResults = derived(() => {
    const q = this.searchQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    const results = [];
    const currentUser = this.currentSiteUsername;
    for (const [key, entry] of this.#phoneBooks) {
      const siteUsername = key.split("\0")[0];
      if (siteUsername === currentUser) continue;
      const site = this.sites.find((s) => s.username === siteUsername);
      if (!site) continue;
      const siteUrl = this.buildSiteUrl(site);
      const folderPath = entry.folder === "/" ? "" : entry.folder.replace(/\/$/, "");
      const resultSiteUrl = `${siteUrl}${folderPath}`;
      const { dbType, deltaReady } = entry;
      for (const brand of entry.brands) {
        if (brand.name.toLowerCase().includes(q)) {
          results.push(...brand.phones.map((phone) => ({
            siteName: site.name,
            siteUsername: site.username,
            siteUrl: resultSiteUrl,
            brand: brand.name,
            phoneName: typeof phone.name === "string" ? phone.name : String(phone.name),
            dbType,
            deltaReady
          })));
          continue;
        }
        for (const phone of brand.phones) {
          const name = typeof phone.name === "string" ? phone.name : String(phone.name);
          if (name.toLowerCase().includes(q)) {
            results.push({
              siteName: site.name,
              siteUsername: site.username,
              siteUrl: resultSiteUrl,
              brand: brand.name,
              phoneName: name,
              dbType,
              deltaReady
            });
          }
        }
      }
    }
    const DB_TYPE_ORDER = ["5128", "IEMs", "Headphones", "Earbuds"];
    results.sort((a, b) => {
      if (a.dbType !== b.dbType) {
        const aIdx = DB_TYPE_ORDER.indexOf(a.dbType);
        const bIdx = DB_TYPE_ORDER.indexOf(b.dbType);
        if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
        if (aIdx !== -1) return -1;
        if (bIdx !== -1) return 1;
        return a.dbType.localeCompare(b.dbType);
      }
      if (a.deltaReady !== b.deltaReady) return a.deltaReady ? -1 : 1;
      if (a.siteName !== b.siteName) {
        return a.siteName.localeCompare(b.siteName);
      }
      return a.phoneName.localeCompare(b.phoneName);
    });
    return results;
  });
  get searchResults() {
    return this.#searchResults();
  }
  set searchResults($$value) {
    return this.#searchResults($$value);
  }
  async fetchSiteRegistry() {
    if (this.#sitesFetched || !this.isEnabled) return;
    this.isLoading = true;
    this.error = null;
    try {
      const res = await fetch(`https://${SQUIGLINK_DOMAIN}/squigsites.json`);
      if (!res.ok) throw new Error(`Failed to fetch site registry: ${res.status}`);
      this.sites = await res.json();
      this.#sitesFetched = true;
    } catch (e) {
      this.error = e instanceof Error ? e.message : "Failed to fetch site registry";
    } finally {
      this.isLoading = false;
    }
  }
  async fetchPhoneBook(site) {
    const siteUrl = this.buildSiteUrl(site);
    const fetches = site.dbs.map(async (db) => {
      const folder = db.folder || "/";
      const key = site.username + "\0" + folder;
      if (this.#phoneBooks.has(key)) return;
      const folderPath = folder === "/" ? "" : folder.replace(/\/$/, "");
      const url = `${siteUrl}${folderPath}/data/phone_book.json`;
      try {
        const res = await fetch(url);
        if (!res.ok) return;
        const data = await res.json();
        const brands = Array.isArray(data) ? data : data.brandPhones ?? [];
        this.#phoneBooks.set(key, { brands, dbType: db.type, folder, deltaReady: !!db.deltaReady });
      } catch {
      }
    });
    await Promise.all(fetches);
  }
  async fetchShopLinks() {
    if (this.#shopLinksFetched || !this.isEnabled) return;
    try {
      const res = await fetch(`https://${SQUIGLINK_DOMAIN}/shoplinks.json`);
      if (!res.ok) return;
      this.shopLinks = await res.json();
      this.#shopLinksFetched = true;
    } catch {
    }
  }
  async fetchSponsorDetail() {
    if (this.#sponsorDetailFetched || !this.isEnabled) return;
    this.#sponsorDetailFetched = true;
    try {
      const res = await fetch(`https://${SQUIGLINK_DOMAIN}/shoplinks.js`);
      if (!res.ok) return;
      let text = await res.text();
      text = text.replace(/\blet\s+sponsorDetails\b/, "window.sponsorDetails");
      try {
        (0, eval)(text);
      } catch {
      }
      const data = window.sponsorDetails;
      if (data && typeof data === "object" && !Array.isArray(data)) {
        this.sponsorDetail = data;
      }
    } catch {
    }
  }
  async fetchSponsorContent() {
    if (this.#sponsorFetched || !this.isEnabled) return;
    this.#sponsorFetched = true;
    try {
      const res = await fetch(`https://${SQUIGLINK_DOMAIN}/squiglink-intro.js`);
      if (!res.ok) return;
      let text = await res.text();
      text = text.replace(/\blet\s+contentSponsor\b/, "window.contentSponsor");
      try {
        (0, eval)(text);
      } catch {
      }
      const data = window.contentSponsor;
      if (Array.isArray(data) && data.length > 0) {
        this.sponsorContent = data[0];
      }
    } catch {
    }
  }
  async fetchSponsorProductData(hfg_com) {
    if (!this.isEnabled) return null;
    try {
      const res = await fetch(`${hfg_com}.json`);
      if (!res.ok) return null;
      const data = await res.json();
      return {
        currentPrice: data.product.variants[0].price,
        originalPrice: data.product.variants[0].compare_at_price,
        onSale: data.product.variants[0].price < data.product.variants[0].compare_at_price
      };
    } catch {
      return null;
    }
  }
  getPhoneBook(siteUsername, folder = "/") {
    return this.#phoneBooks.get(siteUsername + "\0" + folder)?.brands;
  }
  getSponsorDetail() {
    return this.sponsorDetail;
  }
  findShopLink(modelName) {
    const lower = modelName.toLowerCase();
    return this.shopLinks.find((entry) => entry.model.toLowerCase() === lower);
  }
  // ── URL construction ─────────────────────────────────────────────────────
  buildSiteUrl(site) {
    const urlBuilders = {
      root: () => `https://${SQUIGLINK_DOMAIN}`,
      altDomain: () => site.altDomain ?? `https://${site.username}.${SQUIGLINK_DOMAIN}`,
      subdomain: () => `https://${site.username}.${SQUIGLINK_DOMAIN}`,
      labFolder: () => `https://${SQUIGLINK_DOMAIN}/lab/${site.username}`
    };
    return (urlBuilders[site.urlType] ?? urlBuilders.subdomain)();
  }
}
const squiglinkStore = new SquiglinkStore();
class AnalyticsService {
  #initialized = false;
  #siteName = "";
  #logEvents = true;
  #enabled = false;
  init() {
    return;
  }
  trackPhoneEvent(eventName, phoneData) {
    if (!this.#enabled) return;
    const params = {
      site: this.#siteName,
      phone_brand: phoneData.brand ?? "",
      phone_model: phoneData.model ?? "",
      phone_variant: phoneData.variant ?? "",
      value: 1
    };
    if (this.#logEvents) {
      console.log(`[Analytics] ${eventName}`, params);
    }
    window.gtag("event", eventName, params);
  }
  trackGeneralEvent(eventName, data) {
    if (!this.#enabled) return;
    const params = { site: this.#siteName, ...data, value: 1 };
    if (this.#logEvents) {
      console.log(`[Analytics] ${eventName}`, params);
    }
    window.gtag("event", eventName, params);
  }
}
const analyticsService = new AnalyticsService();
class FRDataStore {
  // SvelteMap tracks .get(), .set(), .delete(), .size, iteration automatically
  #map = new SvelteMap();
  // Read API — components access these reactively
  get(uuid) {
    return this.#map.get(uuid) ?? null;
  }
  has(uuid) {
    return this.#map.has(uuid);
  }
  get size() {
    return this.#map.size;
  }
  // Expose map for reactive {#each} iteration in templates
  get entries() {
    return this.#map;
  }
  // Write API — called only by commands/services
  set(uuid, obj) {
    this.#map.set(uuid, obj);
  }
  delete(uuid) {
    this.#map.delete(uuid);
  }
  clear() {
    this.#map.clear();
  }
  toJSON() {
    return [...this.#map.values()];
  }
}
const frStore = new FRDataStore();
class GraphStore {
  yScale = 50;
  baselineUUID = null;
  baselineMode = "off";
  normType = "Hz";
  normHzValue = 500;
  smoothValue = "1/48";
  /** Original (pre-adjustment) target channel data, keyed by target UUID */
  targetOriginalData = new SvelteMap();
  /** Bumped by reSmoothAll to signal TargetCustomizer to re-sync base data */
  targetOriginalVersion = 0;
}
const graphStore = new GraphStore();
class CommandHistory {
  #history = [];
  /** Index of the last executed command (-1 = empty) */
  #pointer = -1;
  /** Execute a command and push it onto the history stack. Discards redo branch. */
  execute(command, store) {
    this.#history = this.#history.slice(0, this.#pointer + 1);
    command.execute(store);
    this.#history.push(command);
    this.#pointer++;
    return command;
  }
  /** Undo the most recent command. */
  undo(store) {
    if (this.#pointer < 0) return null;
    const command = this.#history[this.#pointer--];
    command.undo(store);
    return command;
  }
  /** Redo the next command in the stack. */
  redo(store) {
    if (this.#pointer >= this.#history.length - 1) return null;
    const command = this.#history[++this.#pointer];
    command.execute(store);
    return command;
  }
  get canUndo() {
    return this.#pointer >= 0;
  }
  get canRedo() {
    return this.#pointer < this.#history.length - 1;
  }
  /**
   * Clear all history (called after bulk operations like re-normalization
   * that invalidate stored snapshots).
   */
  clear() {
    this.#history = [];
    this.#pointer = -1;
  }
}
const commandHistory = new CommandHistory();
class AddFRDataCommand {
  #frObject;
  constructor(frObject) {
    this.#frObject = structuredClone(frObject);
  }
  execute(store) {
    store.set(this.#frObject.uuid, this.#frObject);
  }
  undo(store) {
    store.delete(this.#frObject.uuid);
  }
  get uuid() {
    return this.#frObject.uuid;
  }
  get sourceType() {
    return this.#frObject.type;
  }
  get identifier() {
    return this.#frObject.identifier;
  }
}
class RemoveFRDataCommand {
  #uuid;
  #sourceType;
  #snapshot = null;
  constructor(uuid, sourceType) {
    this.#uuid = uuid;
    this.#sourceType = sourceType;
  }
  execute(store) {
    this.#snapshot = store.get(this.#uuid) ?? null;
    store.delete(this.#uuid);
  }
  undo(store) {
    if (this.#snapshot) store.set(this.#uuid, this.#snapshot);
  }
  get uuid() {
    return this.#uuid;
  }
  get sourceType() {
    return this.#sourceType;
  }
  get identifier() {
    return this.#snapshot?.identifier ?? "";
  }
}
class UpdateDisplayChannelCommand {
  #uuid;
  #newChannel;
  #oldChannel = null;
  constructor(uuid, newChannel) {
    this.#uuid = uuid;
    this.#newChannel = [...newChannel];
  }
  execute(store) {
    const data = store.get(this.#uuid);
    if (!data) return;
    this.#oldChannel = [...data.dispChannel];
    store.set(this.#uuid, { ...data, dispChannel: this.#newChannel });
  }
  undo(store) {
    const data = store.get(this.#uuid);
    if (!data || !this.#oldChannel) return;
    store.set(this.#uuid, { ...data, dispChannel: this.#oldChannel });
  }
  get uuid() {
    return this.#uuid;
  }
}
class UpdateColorsCommand {
  #uuid;
  #newColors;
  #oldColors = null;
  constructor(uuid, newColors) {
    this.#uuid = uuid;
    this.#newColors = structuredClone(newColors);
  }
  execute(store) {
    const data = store.get(this.#uuid);
    if (!data) return;
    this.#oldColors = structuredClone(data.colors);
    store.set(this.#uuid, { ...data, colors: { ...data.colors, ...this.#newColors } });
  }
  undo(store) {
    const data = store.get(this.#uuid);
    if (!data || !this.#oldColors) return;
    store.set(this.#uuid, { ...data, colors: this.#oldColors });
  }
  get uuid() {
    return this.#uuid;
  }
}
class UpdateDashPatternCommand {
  #uuid;
  #newDash;
  #oldDash = null;
  constructor(uuid, newDash) {
    this.#uuid = uuid;
    this.#newDash = newDash;
  }
  execute(store) {
    const data = store.get(this.#uuid);
    if (!data) return;
    this.#oldDash = data.dash;
    store.set(this.#uuid, { ...data, dash: this.#newDash });
  }
  undo(store) {
    const data = store.get(this.#uuid);
    if (!data || this.#oldDash === null) return;
    store.set(this.#uuid, { ...data, dash: this.#oldDash });
  }
  get uuid() {
    return this.#uuid;
  }
}
class UpdateVisibilityCommand {
  #uuid;
  #hidden;
  #oldHidden = null;
  constructor(uuid, hidden) {
    this.#uuid = uuid;
    this.#hidden = hidden;
  }
  execute(store) {
    const data = store.get(this.#uuid);
    if (!data) return;
    this.#oldHidden = data.hidden ?? false;
    store.set(this.#uuid, { ...data, hidden: this.#hidden });
  }
  undo(store) {
    const data = store.get(this.#uuid);
    if (!data || this.#oldHidden === null) return;
    store.set(this.#uuid, { ...data, hidden: this.#oldHidden });
  }
  get uuid() {
    return this.#uuid;
  }
  get hidden() {
    return this.#hidden;
  }
}
class UpdateVariantCommand {
  #uuid;
  #newChannels;
  #newDispSuffix;
  #newDispChannel;
  #snapshot = null;
  constructor(uuid, newChannels, newDispSuffix, newDispChannel) {
    this.#uuid = uuid;
    this.#newChannels = structuredClone(newChannels);
    this.#newDispSuffix = newDispSuffix;
    this.#newDispChannel = [...newDispChannel];
  }
  execute(store) {
    const data = store.get(this.#uuid);
    if (!data) return;
    this.#snapshot = structuredClone(data);
    store.set(this.#uuid, {
      ...data,
      channels: this.#newChannels,
      dispSuffix: this.#newDispSuffix,
      dispChannel: this.#newDispChannel
    });
  }
  undo(store) {
    if (this.#snapshot) store.set(this.#uuid, this.#snapshot);
  }
  get uuid() {
    return this.#uuid;
  }
}
class UpdateFRDataWithRawDataCommand {
  #uuid;
  #newData;
  #snapshot = null;
  constructor(uuid, newData) {
    this.#uuid = uuid;
    this.#newData = structuredClone(newData);
  }
  execute(store) {
    const data = store.get(this.#uuid);
    if (!data) return;
    this.#snapshot = structuredClone(data);
    store.set(this.#uuid, this.#newData);
  }
  undo(store) {
    if (this.#snapshot) store.set(this.#uuid, this.#snapshot);
  }
  get uuid() {
    return this.#uuid;
  }
}
class UpdateSampleDisplayCommand {
  #uuid;
  #newDispSamples;
  #oldDispSamples = null;
  constructor(uuid, newDispSamples) {
    this.#uuid = uuid;
    this.#newDispSamples = [...newDispSamples];
  }
  execute(store) {
    const data = store.get(this.#uuid);
    if (!data) return;
    this.#oldDispSamples = data.dispSamples ? [...data.dispSamples] : [];
    store.set(this.#uuid, { ...data, dispSamples: this.#newDispSamples });
  }
  undo(store) {
    const data = store.get(this.#uuid);
    if (!data || !this.#oldDispSamples) return;
    store.set(this.#uuid, { ...data, dispSamples: this.#oldDispSamples });
  }
  get uuid() {
    return this.#uuid;
  }
}
class UpdateHpTFDisplayCommand {
  #uuid;
  #newDispHptf;
  #newFillVisible;
  #newAvgVisible;
  #oldDispHptf = null;
  #oldFillVisible = null;
  #oldAvgVisible = null;
  constructor(uuid, dispHptf, fillVisible, avgVisible) {
    this.#uuid = uuid;
    this.#newDispHptf = [...dispHptf];
    this.#newFillVisible = fillVisible;
    this.#newAvgVisible = avgVisible;
  }
  execute(store) {
    const data = store.get(this.#uuid);
    if (!data) return;
    this.#oldDispHptf = data.dispHptf ? [...data.dispHptf] : [];
    this.#oldFillVisible = data.hptfFillVisible ?? false;
    this.#oldAvgVisible = data.hptfAvgVisible ?? false;
    store.set(this.#uuid, {
      ...data,
      dispHptf: this.#newDispHptf,
      hptfFillVisible: this.#newFillVisible,
      hptfAvgVisible: this.#newAvgVisible
    });
  }
  undo(store) {
    const data = store.get(this.#uuid);
    if (!data || this.#oldDispHptf === null) return;
    store.set(this.#uuid, {
      ...data,
      dispHptf: this.#oldDispHptf,
      hptfFillVisible: this.#oldFillVisible ?? false,
      hptfAvgVisible: this.#oldAvgVisible ?? false
    });
  }
  get uuid() {
    return this.#uuid;
  }
}
class UpdateYOffsetCommand {
  #uuid;
  #newOffset;
  #oldOffset = null;
  constructor(uuid, newOffset) {
    this.#uuid = uuid;
    this.#newOffset = newOffset;
  }
  execute(store) {
    const data = store.get(this.#uuid);
    if (!data) return;
    this.#oldOffset = data.yOffset ?? 0;
    store.set(this.#uuid, { ...data, yOffset: this.#newOffset });
  }
  undo(store) {
    const data = store.get(this.#uuid);
    if (!data || this.#oldOffset === null) return;
    store.set(this.#uuid, { ...data, yOffset: this.#oldOffset });
  }
  get uuid() {
    return this.#uuid;
  }
}
const FRParser = {
  _standardFrequencies: (function() {
    const frequencies = [20];
    const step = Math.pow(2, 1 / 48);
    while (frequencies[frequencies.length - 1] < 2e4) {
      const next2 = frequencies[frequencies.length - 1] * step;
      if (next2 > 2e4) break;
      frequencies.push(next2);
    }
    return frequencies;
  })(),
  /**
   * Get frequency response data in structured array format
   */
  async getFRDataFromFile(sourceType, files) {
    const isPhoneData = sourceType === "phone";
    const channels = isPhoneData ? ["L", "R"] : ["AVG"];
    const parsedChannels = {};
    await Promise.all(
      channels.map(async (channel) => {
        let filename;
        if (isPhoneData) {
          const phoneFiles = files;
          filename = channel === "L" ? phoneFiles.L : phoneFiles.R;
        } else {
          filename = files;
        }
        try {
          const rawData = await this._fetchFRTextData(
            isPhoneData ? "phone" : "target",
            filename
          );
          if (rawData) {
            parsedChannels[channel] = await this.parseFRData(rawData);
          }
        } catch (error) {
          console.error(`Failed to process ${filename} ${channel} channel:`, error);
        }
      })
    );
    if (isPhoneData && parsedChannels.L && parsedChannels.R) {
      const leftData = parsedChannels.L.data;
      const rightData = parsedChannels.R.data;
      parsedChannels.AVG = {
        data: leftData.map(([freq, lDb], index) => [
          freq,
          (lDb + rightData[index][1]) / 2
        ]),
        metadata: { ...parsedChannels.L.metadata }
      };
    }
    return parsedChannels;
  },
  /**
   * Get frequency response data from metadata
   */
  async getFRDataFromMetadata(sourceType, metaData, suffix = "") {
    try {
      const phoneMetaData = metaData;
      const variant = suffix === "" ? phoneMetaData.files[0] : phoneMetaData.files.find((file) => file.suffix === suffix);
      if (!variant) {
        throw new Error(`No file found with suffix: ${suffix}`);
      }
      if (variant.sampleFiles && variant.sampleCount) {
        const { samples, averaged } = await FRParser.getFRSampleData(variant.sampleFiles);
        return { ...averaged, _samples: samples, _sampleCount: variant.sampleCount };
      }
      if (variant.hptfFiles && variant.hptfLabels) {
        const hptfResult = await FRParser.getFRHpTFData(variant.hptfFiles, variant.hptfLabels);
        const fillOnly = variant.hptfFillOnly ?? true;
        const averaged = FRParser._averageSampleData(hptfResult._hptfSamples);
        return { ...averaged, ...hptfResult, _hptfOnly: true, _hptfFillOnly: fillOnly };
      }
      return await FRParser.getFRDataFromFile(sourceType, variant.files);
    } catch (e) {
      throw new Error(`Invalid FR file type: ${e instanceof Error ? e.message : String(e)}`);
    }
  },
  /**
   * Fetch and parse multi-sample measurement data, computing averaged channels
   */
  async getFRSampleData(sampleFiles) {
    const samples = await Promise.all(
      sampleFiles.map(async (fileRef) => {
        const sample = {};
        const [lRaw, rRaw] = await Promise.all([
          this._fetchFRTextData("phone", fileRef.L),
          this._fetchFRTextData("phone", fileRef.R)
        ]);
        if (lRaw) sample.L = await this.parseFRData(lRaw);
        if (rRaw) sample.R = await this.parseFRData(rRaw);
        return sample;
      })
    );
    const averaged = {};
    const lSamples = samples.filter((s) => s.L).map((s) => s.L);
    if (lSamples.length > 0) {
      averaged.L = this._averageChannelData(lSamples);
    }
    const rSamples = samples.filter((s) => s.R).map((s) => s.R);
    if (rSamples.length > 0) {
      averaged.R = this._averageChannelData(rSamples);
    }
    if (averaged.L && averaged.R) {
      averaged.AVG = {
        data: averaged.L.data.map(([freq, lDb], index) => [
          freq,
          (lDb + averaged.R.data[index][1]) / 2
        ]),
        metadata: { ...averaged.L.metadata }
      };
    }
    return { samples, averaged };
  },
  /**
   * Fetch and parse HpTF sample measurement data
   */
  async getFRHpTFData(hptfFiles, hptfLabels) {
    const samples = await Promise.all(
      hptfFiles.map(async (fileRef, index) => {
        const sample = {
          label: hptfLabels[index] ?? `Sample ${index + 1}`
        };
        const [lRaw, rRaw] = await Promise.all([
          this._fetchFRTextData("phone", fileRef.L),
          this._fetchFRTextData("phone", fileRef.R)
        ]);
        if (lRaw) sample.L = await this.parseFRData(lRaw);
        if (rRaw) sample.R = await this.parseFRData(rRaw);
        return sample;
      })
    );
    return { _hptfSamples: samples, _hptfLabels: hptfLabels };
  },
  /** Average channel data across all HpTF samples to produce main channels */
  _averageSampleData(samples) {
    const averaged = {};
    const lChannels = samples.filter((s) => s.L).map((s) => s.L);
    if (lChannels.length > 0) averaged.L = FRParser._averageChannelData(lChannels);
    const rChannels = samples.filter((s) => s.R).map((s) => s.R);
    if (rChannels.length > 0) averaged.R = FRParser._averageChannelData(rChannels);
    if (averaged.L && averaged.R) {
      averaged.AVG = {
        data: averaged.L.data.map(([freq, lDb], index) => [
          freq,
          (lDb + averaged.R.data[index][1]) / 2
        ]),
        metadata: { ...averaged.L.metadata }
      };
    }
    return averaged;
  },
  /** Average multiple ChannelData arrays point-by-point */
  _averageChannelData(channels) {
    const count = channels.length;
    const data = channels[0].data.map(([freq], index) => [
      freq,
      channels.reduce((sum, ch) => sum + ch.data[index][1], 0) / count
    ]);
    return {
      data,
      metadata: { ...channels[0].metadata }
    };
  },
  /**
   * Convert raw frequency response text data to structured format
   */
  async parseFRData(rawData) {
    const lines = rawData.split("\n").map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));
    const parsed = lines.reduce(
      (acc, line) => {
        const parts = line.split(/[\s,]+/).filter((p) => p !== "");
        if (parts.length < 2 || isNaN(Number(parts[0])) || isNaN(Number(parts[1]))) {
          return acc;
        }
        const freq = this._parseFrequency(parts[0]);
        const db = parseFloat(parts[1]);
        const weight = parts[2] ? parseFloat(parts[2]) : null;
        if (this._isValidDataPoint(freq, db)) {
          acc.data.push([freq, db]);
          if (weight !== null) acc.metadata.weights.push(weight);
        }
        return acc;
      },
      {
        data: [],
        metadata: {
          weights: [],
          minFreq: Infinity,
          maxFreq: -Infinity
        }
      }
    );
    if (parsed.data.length !== 0) {
      parsed.data.sort((a, b) => a[0] - b[0]);
      parsed.data = this._interpolateToStandard(parsed.data);
      parsed.metadata.minFreq = this._standardFrequencies[0];
      parsed.metadata.maxFreq = this._standardFrequencies[this._standardFrequencies.length - 1];
    }
    return parsed;
  },
  /**
   * Fetch raw frequency response text data from a file
   */
  async _fetchFRTextData(sourceType, fileName) {
    const phonePath = getConfigValue();
    const targetPath = getConfigValue();
    const base2 = sourceType === "phone" ? phonePath : targetPath;
    const basePath = base2 ? `${base2}${base2.endsWith("/") ? "" : "/"}${fileName}` : fileName;
    try {
      const response = await fetch(basePath);
      if (!response.ok) {
        return null;
      }
      return await response.text();
    } catch (error) {
      console.error(`Failed to load ${sourceType}: ${fileName}`, error);
      return null;
    }
  },
  /** Improved frequency parsing with unit detection */
  _parseFrequency(value) {
    const num = parseFloat(value);
    if (value.toLowerCase().includes("k")) return num * 1e3;
    return num;
  },
  /** Interpolate raw data to standard 1/48oct frequencies */
  _interpolateToStandard(rawData) {
    return this._standardFrequencies.map((targetFreq) => {
      const index = rawData.findIndex(([freq]) => freq > targetFreq);
      if (index === -1) {
        const lastPoint = rawData[rawData.length - 1];
        return [targetFreq, lastPoint[1]];
      } else if (index === 0) {
        const firstPoint = rawData[0];
        return [targetFreq, firstPoint[1]];
      } else {
        const [freq1, db1] = rawData[index - 1];
        const [freq2, db2] = rawData[index];
        const ratio = (targetFreq - freq1) / (freq2 - freq1);
        const interpolatedDb = db1 + (db2 - db1) * ratio;
        return [targetFreq, interpolatedDb];
      }
    });
  },
  /** Enhanced validation with frequency range checks */
  _isValidDataPoint(freq, db) {
    return Number.isFinite(freq) && Number.isFinite(db) && freq >= 20 && freq <= 2e4 && db >= -40 && db <= 120;
  }
};
const FRSmoother = {
  OCTAVE_BANDS: {
    "1/48": 1 / 48,
    "1/24": 1 / 24,
    "1/12": 1 / 12,
    "1/6": 1 / 6,
    "1/3": 1 / 3
  },
  /** Smooth a single data array using the given octave smoothing value. */
  smooth(data, smoothValue) {
    if (!this.OCTAVE_BANDS[smoothValue] || !data) return data;
    return this._smoothChannel(data, smoothValue);
  },
  /** Smooth all channels in a ParsedFRData using the given octave smoothing value. */
  smoothChannels(data, smoothValue) {
    if (!this.OCTAVE_BANDS[smoothValue]) return data;
    const smoothedData = {};
    for (const channel of ["L", "R", "AVG"]) {
      if (data[channel]) {
        smoothedData[channel] = {
          ...data[channel],
          data: this._smoothChannel(data[channel].data, smoothValue)
        };
      }
    }
    return smoothedData;
  },
  /** Smooth a single channel's data */
  _smoothChannel(dataPoints, octave) {
    const bands = this._createOctaveBands(octave);
    const binned = this._binData(dataPoints, bands);
    return binned.map((bin) => [
      bin.centerFreq,
      bin.values.reduce((a, b) => a + b, 0) / bin.values.length
    ]);
  },
  /** Create octave bands based on the specified octave division */
  _createOctaveBands(octave) {
    const bands = [];
    let f = 20;
    const fraction = this.OCTAVE_BANDS[octave];
    while (f < 2e4) {
      const upper = f * Math.pow(2, fraction);
      bands.push({
        lower: f,
        upper,
        centerFreq: Math.sqrt(f * upper)
      });
      f = upper;
    }
    return bands;
  },
  /** Bin data points into octave bands */
  _binData(points, bands) {
    return bands.map((band) => ({
      ...band,
      values: points.filter((p) => p && p[0] >= band.lower && p[0] <= band.upper).map((p) => p[1])
    })).filter((bin) => bin.values.length > 0);
  }
};
function normalize(channelData, type, hzValue) {
  if (!channelData?.data?.length) {
    throw new Error("Cannot normalize - invalid data structure");
  }
  const copy = structuredClone(channelData);
  return type === "Hz" ? _normalizeByHz(copy, hzValue) : _normalizeByAvg(copy, 0);
}
function normalizeChannels(rawData, type, hzValue) {
  const result = {};
  for (const channel of ["L", "R", "AVG"]) {
    const ch = rawData[channel];
    if (ch?.data?.length) {
      result[channel] = normalize(ch, type, hzValue);
    }
  }
  return result;
}
function _normalizeByHz(data, targetHz) {
  const targetFreq = Math.max(20, Math.min(2e4, Number(targetHz)));
  const reference = _findNearestFrequency(data.data, targetFreq);
  if (!reference) {
    throw new Error(`No data near ${targetHz}Hz`);
  }
  const delta = -reference[1];
  data.data.forEach((point) => {
    point[1] = _clampDB(point[1] + delta);
  });
  return data;
}
function _normalizeByAvg(data, targetDB) {
  const midLow = 300;
  const midHigh = 3e3;
  const midrange = data.data.filter((p) => p[0] >= midLow && p[0] <= midHigh);
  if (midrange.length < 3) {
    throw new Error("Insufficient midrange data for normalization");
  }
  const avg = midrange.reduce((sum, p) => sum + p[1], 0) / midrange.length;
  const delta = targetDB - avg;
  data.data.forEach((point) => {
    point[1] = _clampDB(point[1] + delta);
  });
  return data;
}
function _clampDB(value) {
  return Math.max(-40, Math.min(120, Number(value.toFixed(2))));
}
function _findNearestFrequency(points, targetHz) {
  const index = points.findIndex((p) => p[0] >= targetHz);
  if (index === -1) return points[points.length - 1];
  if (index === 0) return points[0];
  const [f0, db0] = points[index - 1];
  const [f1, db1] = points[index];
  const t = (Math.log(targetHz) - Math.log(f0)) / (Math.log(f1) - Math.log(f0));
  return [targetHz, db0 + t * (db1 - db0)];
}
const DataProcessor = {
  /** Smooth and normalize channel data. */
  processChannels(rawData, params) {
    return normalizeChannels(
      FRSmoother.smoothChannels(rawData, params.smoothValue),
      params.normType,
      params.normHz
    );
  },
  /** Smooth and normalize a single channel, returning just that channel's data. */
  processChannel(channelKey, data, params) {
    return normalizeChannels(
      FRSmoother.smoothChannels({ [channelKey]: data[channelKey] }, params.smoothValue),
      params.normType,
      params.normHz
    )[channelKey];
  },
  /** Smooth and normalize multi-sample data (L/R per sample). */
  processSamples(rawSamples, params) {
    return rawSamples.map((sample) => {
      const s = {};
      if (sample.L) s.L = DataProcessor.processChannel("L", sample, params);
      if (sample.R) s.R = DataProcessor.processChannel("R", sample, params);
      return s;
    });
  },
  /** Smooth and normalize HpTF sample data, computing AVG from L+R. */
  processHpTFSamples(rawSamples, labels, params) {
    return rawSamples.map((sample, i) => {
      const p = { label: labels[i] ?? `Sample ${i + 1}` };
      if (sample.L) p.L = DataProcessor.processChannel("L", sample, params);
      if (sample.R) p.R = DataProcessor.processChannel("R", sample, params);
      if (p.L && p.R) {
        p.AVG = {
          data: p.L.data.map(([freq, lDb], idx) => [
            freq,
            (lDb + p.R.data[idx][1]) / 2
          ]),
          metadata: { ...p.L.metadata }
        };
      }
      return p;
    });
  }
};
const bars = Array(12).fill(0);
function Loader($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { visible, class: className } = $$props;
    $$renderer2.push(`<div${attr_class(clsx(["sonner-loading-wrapper", className].filter(Boolean).join(" ")))}${attr("data-visible", visible)}><div class="sonner-spinner"><!--[-->`);
    const each_array = ensure_array_like(bars);
    for (let i = 0, $$length = each_array.length; i < $$length; i++) {
      each_array[i];
      $$renderer2.push(`<div class="sonner-loading-bar"></div>`);
    }
    $$renderer2.push(`<!--]--></div></div>`);
  });
}
function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}
const isBrowser$1 = typeof document !== "undefined";
const defaultWindow$1 = void 0;
function getActiveElement$2(document2) {
  let activeElement = document2.activeElement;
  while (activeElement?.shadowRoot) {
    const node = activeElement.shadowRoot.activeElement;
    if (node === activeElement)
      break;
    else
      activeElement = node;
  }
  return activeElement;
}
let ActiveElement$1 = class ActiveElement {
  #document;
  #subscribe;
  constructor(options = {}) {
    const { window: window2 = defaultWindow$1, document: document2 = window2?.document } = options;
    if (window2 === void 0) return;
    this.#document = document2;
    this.#subscribe = createSubscriber();
  }
  get current() {
    this.#subscribe?.();
    if (!this.#document) return null;
    return getActiveElement$2(this.#document);
  }
};
new ActiveElement$1();
let Context$1 = class Context {
  #name;
  #key;
  /**
   * @param name The name of the context.
   * This is used for generating the context key and error messages.
   */
  constructor(name) {
    this.#name = name;
    this.#key = Symbol(name);
  }
  /**
   * The key used to get and set the context.
   *
   * It is not recommended to use this value directly.
   * Instead, use the methods provided by this class.
   */
  get key() {
    return this.#key;
  }
  /**
   * Checks whether this has been set in the context of a parent component.
   *
   * Must be called during component initialisation.
   */
  exists() {
    return hasContext(this.#key);
  }
  /**
   * Retrieves the context that belongs to the closest parent component.
   *
   * Must be called during component initialisation.
   *
   * @throws An error if the context does not exist.
   */
  get() {
    const context = getContext(this.#key);
    if (context === void 0) {
      throw new Error(`Context "${this.#name}" not found`);
    }
    return context;
  }
  /**
   * Retrieves the context that belongs to the closest parent component,
   * or the given fallback value if the context does not exist.
   *
   * Must be called during component initialisation.
   */
  getOr(fallback) {
    const context = getContext(this.#key);
    if (context === void 0) {
      return fallback;
    }
    return context;
  }
  /**
   * Associates the given value with the current component and returns it.
   *
   * Must be called during component initialisation.
   */
  set(context) {
    return setContext(this.#key, context);
  }
};
const sonnerContext = new Context$1("<Toaster/>");
let toastsCounter = 0;
class ToastState {
  toasts = [];
  heights = [];
  #findToastIdx = (id) => {
    const idx = this.toasts.findIndex((toast2) => toast2.id === id);
    if (idx === -1) return null;
    return idx;
  };
  addToast = (data) => {
    if (!isBrowser$1) return;
    this.toasts.unshift(data);
  };
  updateToast = ({ id, data, type, message }) => {
    const toastIdx = this.toasts.findIndex((toast2) => toast2.id === id);
    const toastToUpdate = this.toasts[toastIdx];
    this.toasts[toastIdx] = {
      ...toastToUpdate,
      ...data,
      id,
      title: message,
      type,
      updated: true
    };
  };
  create = (data) => {
    const { message, ...rest } = data;
    const id = typeof data?.id === "number" || data.id && data.id?.length > 0 ? data.id : toastsCounter++;
    const dismissible = data.dismissible !== void 0 ? data.dismissible : data.dismissable !== void 0 ? data.dismissable : true;
    const type = data.type === void 0 ? "default" : data.type;
    run(() => {
      const alreadyExists = this.toasts.find((toast2) => toast2.id === id);
      if (alreadyExists) {
        this.updateToast({ id, data, type, message, dismissible });
      } else {
        this.addToast({ ...rest, id, title: message, dismissible, type });
      }
    });
    return id;
  };
  dismiss = (id) => {
    run(() => {
      if (id === void 0) {
        this.toasts = this.toasts.map((toast2) => ({ ...toast2, dismiss: true }));
        return;
      }
      const toastIdx = this.toasts.findIndex((toast2) => toast2.id === id);
      if (this.toasts[toastIdx]) {
        this.toasts[toastIdx] = { ...this.toasts[toastIdx], dismiss: true };
      }
    });
    return id;
  };
  remove = (id) => {
    if (id === void 0) {
      this.toasts = [];
      return;
    }
    const toastIdx = this.#findToastIdx(id);
    if (toastIdx === null) return;
    this.toasts.splice(toastIdx, 1);
    return id;
  };
  message = (message, data) => {
    return this.create({ ...data, type: "default", message });
  };
  error = (message, data) => {
    return this.create({ ...data, type: "error", message });
  };
  success = (message, data) => {
    return this.create({ ...data, type: "success", message });
  };
  info = (message, data) => {
    return this.create({ ...data, type: "info", message });
  };
  warning = (message, data) => {
    return this.create({ ...data, type: "warning", message });
  };
  loading = (message, data) => {
    return this.create({ ...data, type: "loading", message });
  };
  promise = (promise, data) => {
    if (!data) {
      return;
    }
    let id = void 0;
    if (data.loading !== void 0) {
      id = this.create({
        ...data,
        promise,
        type: "loading",
        message: typeof data.loading === "string" ? data.loading : data.loading()
      });
    }
    const p = promise instanceof Promise ? promise : promise();
    let shouldDismiss = id !== void 0;
    p.then((response) => {
      if (typeof response === "object" && response && "ok" in response && typeof response.ok === "boolean" && !response.ok) {
        shouldDismiss = false;
        const message = constructPromiseErrorMessage(response);
        this.create({ id, type: "error", message });
      } else if (data.success !== void 0) {
        shouldDismiss = false;
        const message = typeof data.success === "function" ? data.success(response) : data.success;
        this.create({ id, type: "success", message });
      }
    }).catch((error) => {
      if (data.error !== void 0) {
        shouldDismiss = false;
        const message = typeof data.error === "function" ? data.error(error) : data.error;
        this.create({ id, type: "error", message });
      }
    }).finally(() => {
      if (shouldDismiss) {
        this.dismiss(id);
        id = void 0;
      }
      data.finally?.();
    });
    return id;
  };
  custom = (component, data) => {
    const id = data?.id || toastsCounter++;
    this.create({ component, id, ...data });
    return id;
  };
  removeHeight = (id) => {
    this.heights = this.heights.filter((height) => height.toastId !== id);
  };
  setHeight = (data) => {
    const toastIdx = this.#findToastIdx(data.toastId);
    if (toastIdx === null) {
      this.heights.push(data);
      return;
    }
    this.heights[toastIdx] = data;
  };
  reset = () => {
    this.toasts = [];
    this.heights = [];
  };
}
function constructPromiseErrorMessage(response) {
  if (response && typeof response === "object" && "status" in response) {
    return `HTTP error! Status: ${response.status}`;
  }
  return `Error! ${response}`;
}
const toastState = new ToastState();
function toastFunction(message, data) {
  return toastState.create({ message, ...data });
}
class SonnerState {
  /**
   * A derived state of the toasts that are not dismissed.
   */
  #activeToasts = derived(() => toastState.toasts.filter((toast2) => !toast2.dismiss));
  get toasts() {
    return this.#activeToasts();
  }
}
const basicToast = toastFunction;
const toast = Object.assign(basicToast, {
  success: toastState.success,
  info: toastState.info,
  warning: toastState.warning,
  error: toastState.error,
  custom: toastState.custom,
  message: toastState.message,
  promise: toastState.promise,
  dismiss: toastState.dismiss,
  loading: toastState.loading,
  getActiveToasts: () => {
    return toastState.toasts.filter((toast2) => !toast2.dismiss);
  }
});
function isAction(action) {
  return action.label !== void 0;
}
const TOAST_LIFETIME$1 = 4e3;
const GAP$1 = 14;
const TIME_BEFORE_UNMOUNT = 200;
const DEFAULT_TOAST_CLASSES = {
  toast: "",
  title: "",
  description: "",
  loader: "",
  closeButton: "",
  cancelButton: "",
  actionButton: "",
  action: "",
  warning: "",
  error: "",
  success: "",
  default: "",
  info: "",
  loading: ""
};
function Toast($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let {
      toast: toast2,
      index,
      expanded,
      invert: invertFromToaster,
      position,
      visibleToasts,
      expandByDefault,
      closeButton: closeButtonFromToaster,
      interacting,
      cancelButtonStyle = "",
      actionButtonStyle = "",
      duration: durationFromToaster,
      descriptionClass = "",
      classes: classesProp,
      unstyled = false,
      loadingIcon,
      successIcon,
      errorIcon,
      warningIcon,
      closeIcon,
      infoIcon,
      defaultRichColors = false,
      swipeDirections: swipeDirectionsProp,
      closeButtonAriaLabel,
      pauseWhenPageIsHidden,
      $$slots,
      $$events,
      ...restProps
    } = $$props;
    const defaultClasses = { ...DEFAULT_TOAST_CLASSES };
    let mounted = false;
    let removed = false;
    let swiping = false;
    let swipeOut = false;
    let isSwiped = false;
    let offsetBeforeRemove = 0;
    let initialHeight = 0;
    toast2.duration || durationFromToaster || TOAST_LIFETIME$1;
    let swipeOutDirection = null;
    const isFront = derived(() => index === 0);
    const isVisible = derived(() => index + 1 <= visibleToasts);
    const toastType = derived(() => toast2.type);
    const dismissible = derived(() => toast2.dismissible !== void 0 ? toast2.dismissible !== false : toast2.dismissable !== false);
    const toastClass = derived(() => toast2.class || "");
    const toastDescriptionClass = derived(() => toast2.descriptionClass || "");
    const heightIndex = derived(() => toastState.heights.findIndex((height) => height.toastId === toast2.id) || 0);
    const closeButton = derived(() => toast2.closeButton ?? closeButtonFromToaster);
    const coords = derived(() => position.split("-"));
    const toastsHeightBefore = derived(() => toastState.heights.reduce(
      (prev2, curr, reducerIndex) => {
        if (reducerIndex >= heightIndex()) return prev2;
        return prev2 + curr.height;
      },
      0
    ));
    const invert = derived(() => toast2.invert || invertFromToaster);
    const disabled = derived(() => toastType() === "loading");
    const classes = derived(() => ({ ...defaultClasses, ...classesProp }));
    const offset2 = derived(() => Math.round(heightIndex() * GAP$1 + toastsHeightBefore()));
    function deleteToast() {
      removed = true;
      offsetBeforeRemove = offset2();
      toastState.removeHeight(toast2.id);
      setTimeout(
        () => {
          toastState.remove(toast2.id);
        },
        TIME_BEFORE_UNMOUNT
      );
    }
    const icon = derived(() => {
      if (toast2.icon) return toast2.icon;
      if (toastType() === "success") return successIcon;
      if (toastType() === "error") return errorIcon;
      if (toastType() === "warning") return warningIcon;
      if (toastType() === "info") return infoIcon;
      if (toastType() === "loading") return loadingIcon;
      return null;
    });
    function LoadingIcon($$renderer3) {
      if (loadingIcon) {
        $$renderer3.push("<!--[0-->");
        $$renderer3.push(`<div${attr_class(clsx(cn(classes()?.loader, toast2?.classes?.loader, "sonner-loader")))}${attr("data-visible", toastType() === "loading")}>`);
        loadingIcon($$renderer3);
        $$renderer3.push(`<!----></div>`);
      } else {
        $$renderer3.push("<!--[-1-->");
        Loader($$renderer3, {
          class: cn(classes()?.loader, toast2.classes?.loader),
          visible: toastType() === "loading"
        });
      }
      $$renderer3.push(`<!--]-->`);
    }
    $$renderer2.push(`<li${attr("tabindex", 0)}${attr_class(clsx(cn(restProps.class, toastClass(), classes()?.toast, toast2?.classes?.toast, classes()?.[toastType()], toast2?.classes?.[toastType()])))}${attr("aria-live", toast2.important ? "assertive" : "polite")} aria-atomic="true" data-sonner-toast=""${attr("data-rich-colors", toast2.richColors ?? defaultRichColors)}${attr("data-styled", !(toast2.component || toast2.unstyled || unstyled))}${attr("data-mounted", mounted)}${attr("data-promise", Boolean(toast2.promise))}${attr("data-swiped", isSwiped)}${attr("data-removed", removed)}${attr("data-visible", isVisible())}${attr("data-y-position", coords()[0])}${attr("data-x-position", coords()[1])}${attr("data-index", index)}${attr("data-front", isFront())}${attr("data-swiping", swiping)}${attr("data-dismissible", dismissible())}${attr("data-type", toastType())}${attr("data-invert", invert())}${attr("data-swipe-out", swipeOut)}${attr("data-swipe-direction", swipeOutDirection)}${attr("data-expanded", Boolean(expanded || expandByDefault && mounted))}${attr_style(`${restProps.style} ${toast2.style}`, {
      "--index": index,
      "--toasts-before": index,
      "--z-index": toastState.toasts.length - index,
      "--offset": `${removed ? offsetBeforeRemove : offset2()}px`,
      "--initial-height": expandByDefault ? "auto" : `${initialHeight}px`
    })}>`);
    if (closeButton() && !toast2.component && toastType() !== "loading" && closeIcon !== null) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<button${attr("aria-label", closeButtonAriaLabel)}${attr("data-disabled", disabled())} data-close-button=""${attr_class(clsx(cn(classes()?.closeButton, toast2?.classes?.closeButton)))}>`);
      closeIcon?.($$renderer2);
      $$renderer2.push(`<!----></button>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> `);
    if (toast2.component) {
      $$renderer2.push("<!--[0-->");
      const Component = toast2.component;
      if (Component) {
        $$renderer2.push("<!--[-->");
        Component($$renderer2, spread_props([toast2.componentProps, { closeToast: deleteToast }]));
        $$renderer2.push("<!--]-->");
      } else {
        $$renderer2.push("<!--[!-->");
        $$renderer2.push("<!--]-->");
      }
    } else {
      $$renderer2.push("<!--[-1-->");
      if ((toastType() || toast2.icon || toast2.promise) && toast2.icon !== null && (icon() !== null || toast2.icon)) {
        $$renderer2.push("<!--[0-->");
        $$renderer2.push(`<div data-icon=""${attr_class(clsx(cn(classes()?.icon, toast2?.classes?.icon)))}>`);
        if (toast2.promise || toastType() === "loading") {
          $$renderer2.push("<!--[0-->");
          if (toast2.icon) {
            $$renderer2.push("<!--[0-->");
            if (toast2.icon) {
              $$renderer2.push("<!--[-->");
              toast2.icon($$renderer2, {});
              $$renderer2.push("<!--]-->");
            } else {
              $$renderer2.push("<!--[!-->");
              $$renderer2.push("<!--]-->");
            }
          } else {
            $$renderer2.push("<!--[-1-->");
            LoadingIcon($$renderer2);
          }
          $$renderer2.push(`<!--]-->`);
        } else {
          $$renderer2.push("<!--[-1-->");
        }
        $$renderer2.push(`<!--]--> `);
        if (toast2.type !== "loading") {
          $$renderer2.push("<!--[0-->");
          if (toast2.icon) {
            $$renderer2.push("<!--[0-->");
            if (toast2.icon) {
              $$renderer2.push("<!--[-->");
              toast2.icon($$renderer2, {});
              $$renderer2.push("<!--]-->");
            } else {
              $$renderer2.push("<!--[!-->");
              $$renderer2.push("<!--]-->");
            }
          } else if (toastType() === "success") {
            $$renderer2.push("<!--[1-->");
            successIcon?.($$renderer2);
            $$renderer2.push(`<!---->`);
          } else if (toastType() === "error") {
            $$renderer2.push("<!--[2-->");
            errorIcon?.($$renderer2);
            $$renderer2.push(`<!---->`);
          } else if (toastType() === "warning") {
            $$renderer2.push("<!--[3-->");
            warningIcon?.($$renderer2);
            $$renderer2.push(`<!---->`);
          } else if (toastType() === "info") {
            $$renderer2.push("<!--[4-->");
            infoIcon?.($$renderer2);
            $$renderer2.push(`<!---->`);
          } else {
            $$renderer2.push("<!--[-1-->");
          }
          $$renderer2.push(`<!--]-->`);
        } else {
          $$renderer2.push("<!--[-1-->");
        }
        $$renderer2.push(`<!--]--></div>`);
      } else {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]--> <div data-content=""${attr_class(clsx(cn(classes()?.content, toast2?.classes?.content)))}><div data-title=""${attr_class(clsx(cn(classes()?.title, toast2?.classes?.title)))}>`);
      if (toast2.title) {
        $$renderer2.push("<!--[0-->");
        if (typeof toast2.title !== "string") {
          $$renderer2.push("<!--[0-->");
          const Title = toast2.title;
          if (Title) {
            $$renderer2.push("<!--[-->");
            Title($$renderer2, spread_props([toast2.componentProps]));
            $$renderer2.push("<!--]-->");
          } else {
            $$renderer2.push("<!--[!-->");
            $$renderer2.push("<!--]-->");
          }
        } else {
          $$renderer2.push("<!--[-1-->");
          $$renderer2.push(`${escape_html(toast2.title)}`);
        }
        $$renderer2.push(`<!--]-->`);
      } else {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]--></div> `);
      if (toast2.description) {
        $$renderer2.push("<!--[0-->");
        $$renderer2.push(`<div data-description=""${attr_class(clsx(cn(descriptionClass, toastDescriptionClass(), classes()?.description, toast2.classes?.description)))}>`);
        if (typeof toast2.description !== "string") {
          $$renderer2.push("<!--[0-->");
          const Description = toast2.description;
          if (Description) {
            $$renderer2.push("<!--[-->");
            Description($$renderer2, spread_props([toast2.componentProps]));
            $$renderer2.push("<!--]-->");
          } else {
            $$renderer2.push("<!--[!-->");
            $$renderer2.push("<!--]-->");
          }
        } else {
          $$renderer2.push("<!--[-1-->");
          $$renderer2.push(`${escape_html(toast2.description)}`);
        }
        $$renderer2.push(`<!--]--></div>`);
      } else {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]--></div> `);
      if (toast2.cancel) {
        $$renderer2.push("<!--[0-->");
        if (typeof toast2.cancel === "function") {
          $$renderer2.push("<!--[0-->");
          if (toast2.cancel) {
            $$renderer2.push("<!--[-->");
            toast2.cancel($$renderer2, {});
            $$renderer2.push("<!--]-->");
          } else {
            $$renderer2.push("<!--[!-->");
            $$renderer2.push("<!--]-->");
          }
        } else if (isAction(toast2.cancel)) {
          $$renderer2.push("<!--[1-->");
          $$renderer2.push(`<button data-button="" data-cancel=""${attr_style(toast2.cancelButtonStyle ?? cancelButtonStyle)}${attr_class(clsx(cn(classes()?.cancelButton, toast2?.classes?.cancelButton)))}>${escape_html(toast2.cancel.label)}</button>`);
        } else {
          $$renderer2.push("<!--[-1-->");
        }
        $$renderer2.push(`<!--]-->`);
      } else {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]--> `);
      if (toast2.action) {
        $$renderer2.push("<!--[0-->");
        if (typeof toast2.action === "function") {
          $$renderer2.push("<!--[0-->");
          if (toast2.action) {
            $$renderer2.push("<!--[-->");
            toast2.action($$renderer2, {});
            $$renderer2.push("<!--]-->");
          } else {
            $$renderer2.push("<!--[!-->");
            $$renderer2.push("<!--]-->");
          }
        } else if (isAction(toast2.action)) {
          $$renderer2.push("<!--[1-->");
          $$renderer2.push(`<button data-button=""${attr_style(toast2.actionButtonStyle ?? actionButtonStyle)}${attr_class(clsx(cn(classes()?.actionButton, toast2?.classes?.actionButton)))}>${escape_html(toast2.action.label)}</button>`);
        } else {
          $$renderer2.push("<!--[-1-->");
        }
        $$renderer2.push(`<!--]-->`);
      } else {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]-->`);
    }
    $$renderer2.push(`<!--]--></li>`);
  });
}
function SuccessIcon($$renderer) {
  $$renderer.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" height="20" width="20" data-sonner-success-icon=""><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clip-rule="evenodd"></path></svg>`);
}
function ErrorIcon($$renderer) {
  $$renderer.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" height="20" width="20" data-sonner-error-icon=""><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd"></path></svg>`);
}
function WarningIcon($$renderer) {
  $$renderer.push(`<svg viewBox="0 0 64 64" fill="currentColor" height="20" width="20" data-sonner-warning-icon="" xmlns="http://www.w3.org/2000/svg"><path d="M32.427,7.987c2.183,0.124 4,1.165 5.096,3.281l17.936,36.208c1.739,3.66 -0.954,8.585 -5.373,8.656l-36.119,0c-4.022,-0.064 -7.322,-4.631 -5.352,-8.696l18.271,-36.207c0.342,-0.65 0.498,-0.838 0.793,-1.179c1.186,-1.375 2.483,-2.111 4.748,-2.063Zm-0.295,3.997c-0.687,0.034 -1.316,0.419 -1.659,1.017c-6.312,11.979 -12.397,24.081 -18.301,36.267c-0.546,1.225 0.391,2.797 1.762,2.863c12.06,0.195 24.125,0.195 36.185,0c1.325,-0.064 2.321,-1.584 1.769,-2.85c-5.793,-12.184 -11.765,-24.286 -17.966,-36.267c-0.366,-0.651 -0.903,-1.042 -1.79,-1.03Z"></path><path d="M33.631,40.581l-3.348,0l-0.368,-16.449l4.1,0l-0.384,16.449Zm-3.828,5.03c0,-0.609 0.197,-1.113 0.592,-1.514c0.396,-0.4 0.935,-0.601 1.618,-0.601c0.684,0 1.223,0.201 1.618,0.601c0.395,0.401 0.593,0.905 0.593,1.514c0,0.587 -0.193,1.078 -0.577,1.473c-0.385,0.395 -0.929,0.593 -1.634,0.593c-0.705,0 -1.249,-0.198 -1.634,-0.593c-0.384,-0.395 -0.576,-0.886 -0.576,-1.473Z"></path></svg>`);
}
function InfoIcon($$renderer) {
  $$renderer.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" height="20" width="20" data-sonner-info-icon=""><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clip-rule="evenodd"></path></svg>`);
}
function CloseIcon($$renderer) {
  $$renderer.push(`<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" data-sonner-close-icon=""><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`);
}
const VISIBLE_TOASTS_AMOUNT = 3;
const VIEWPORT_OFFSET = "24px";
const MOBILE_VIEWPORT_OFFSET = "16px";
const TOAST_LIFETIME = 4e3;
const TOAST_WIDTH = 356;
const GAP = 14;
const DARK = "dark";
const LIGHT = "light";
function getOffsetObject(defaultOffset, mobileOffset) {
  const styles = {};
  [defaultOffset, mobileOffset].forEach((offset2, index) => {
    const isMobile = index === 1;
    const prefix = isMobile ? "--mobile-offset" : "--offset";
    const defaultValue = isMobile ? MOBILE_VIEWPORT_OFFSET : VIEWPORT_OFFSET;
    function assignAll(offset3) {
      ["top", "right", "bottom", "left"].forEach((key) => {
        styles[`${prefix}-${key}`] = typeof offset3 === "number" ? `${offset3}px` : offset3;
      });
    }
    if (typeof offset2 === "number" || typeof offset2 === "string") {
      assignAll(offset2);
    } else if (typeof offset2 === "object") {
      ["top", "right", "bottom", "left"].forEach((key) => {
        const value = offset2[key];
        if (value === void 0) {
          styles[`${prefix}-${key}`] = defaultValue;
        } else {
          styles[`${prefix}-${key}`] = typeof value === "number" ? `${value}px` : value;
        }
      });
    } else {
      assignAll(defaultValue);
    }
  });
  return styles;
}
function Toaster($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    function getInitialTheme(t) {
      if (t !== "system") return t;
      if (typeof window !== "undefined") {
        if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
          return DARK;
        }
        return LIGHT;
      }
      return LIGHT;
    }
    let {
      invert = false,
      position = "bottom-right",
      hotkey = ["altKey", "KeyT"],
      expand = false,
      closeButton = false,
      offset: offset2 = VIEWPORT_OFFSET,
      mobileOffset = MOBILE_VIEWPORT_OFFSET,
      theme = "light",
      richColors = false,
      duration = TOAST_LIFETIME,
      visibleToasts = VISIBLE_TOASTS_AMOUNT,
      toastOptions = {},
      dir = "auto",
      gap = GAP,
      pauseWhenPageIsHidden = false,
      loadingIcon: loadingIconProp,
      successIcon: successIconProp,
      errorIcon: errorIconProp,
      warningIcon: warningIconProp,
      closeIcon: closeIconProp,
      infoIcon: infoIconProp,
      containerAriaLabel = "Notifications",
      class: className,
      closeButtonAriaLabel = "Close toast",
      onblur,
      onfocus,
      onmouseenter,
      onmousemove,
      onmouseleave,
      ondragend,
      onpointerdown,
      onpointerup,
      $$slots,
      $$events,
      ...restProps
    } = $$props;
    function getDocumentDirection() {
      if (dir !== "auto") return dir;
      if (typeof window === "undefined") return "ltr";
      if (typeof document === "undefined") return "ltr";
      const dirAttribute = document.documentElement.getAttribute("dir");
      if (dirAttribute === "auto" || !dirAttribute) {
        run(() => dir = window.getComputedStyle(document.documentElement).direction ?? "ltr");
        return dir;
      }
      run(() => dir = dirAttribute);
      return dirAttribute;
    }
    const possiblePositions = derived(() => Array.from(new Set([
      position,
      ...toastState.toasts.filter((toast2) => toast2.position).map((toast2) => toast2.position)
    ].filter(Boolean))));
    let expanded = false;
    let interacting = false;
    let actualTheme = getInitialTheme(theme);
    const hotkeyLabel = derived(() => hotkey.join("+").replace(/Key/g, "").replace(/Digit/g, ""));
    sonnerContext.set(new SonnerState());
    $$renderer2.push(`<section${attr("aria-label", `${stringify(containerAriaLabel)} ${stringify(hotkeyLabel())}`)}${attr("tabindex", -1)} aria-live="polite" aria-relevant="additions text" aria-atomic="false" class="svelte-nbs0zk">`);
    if (toastState.toasts.length > 0) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<!--[-->`);
      const each_array = ensure_array_like(possiblePositions());
      for (let index = 0, $$length = each_array.length; index < $$length; index++) {
        let position2 = each_array[index];
        const [y, x] = position2.split("-");
        const offsetObject = getOffsetObject(offset2, mobileOffset);
        $$renderer2.push(`<ol${attributes(
          {
            tabindex: -1,
            dir: getDocumentDirection(),
            class: clsx(className),
            "data-sonner-toaster": true,
            "data-sonner-theme": actualTheme,
            "data-y-position": y,
            "data-x-position": x,
            style: restProps.style,
            ...restProps
          },
          "svelte-nbs0zk",
          void 0,
          {
            "--front-toast-height": `${toastState.heights[0]?.height}px`,
            "--width": `${TOAST_WIDTH}px`,
            "--gap": `${gap}px`,
            "--offset-top": offsetObject["--offset-top"],
            "--offset-right": offsetObject["--offset-right"],
            "--offset-bottom": offsetObject["--offset-bottom"],
            "--offset-left": offsetObject["--offset-left"],
            "--mobile-offset-top": offsetObject["--mobile-offset-top"],
            "--mobile-offset-right": offsetObject["--mobile-offset-right"],
            "--mobile-offset-bottom": offsetObject["--mobile-offset-bottom"],
            "--mobile-offset-left": offsetObject["--mobile-offset-left"]
          }
        )}><!--[-->`);
        const each_array_1 = ensure_array_like(toastState.toasts.filter((toast2) => !toast2.position && index === 0 || toast2.position === position2));
        for (let index2 = 0, $$length2 = each_array_1.length; index2 < $$length2; index2++) {
          let toast2 = each_array_1[index2];
          {
            let successIcon = function($$renderer3) {
              if (successIconProp) {
                $$renderer3.push("<!--[0-->");
                successIconProp?.($$renderer3);
                $$renderer3.push(`<!---->`);
              } else if (successIconProp !== null) {
                $$renderer3.push("<!--[1-->");
                SuccessIcon($$renderer3);
              } else {
                $$renderer3.push("<!--[-1-->");
              }
              $$renderer3.push(`<!--]-->`);
            }, errorIcon = function($$renderer3) {
              if (errorIconProp) {
                $$renderer3.push("<!--[0-->");
                errorIconProp?.($$renderer3);
                $$renderer3.push(`<!---->`);
              } else if (errorIconProp !== null) {
                $$renderer3.push("<!--[1-->");
                ErrorIcon($$renderer3);
              } else {
                $$renderer3.push("<!--[-1-->");
              }
              $$renderer3.push(`<!--]-->`);
            }, warningIcon = function($$renderer3) {
              if (warningIconProp) {
                $$renderer3.push("<!--[0-->");
                warningIconProp?.($$renderer3);
                $$renderer3.push(`<!---->`);
              } else if (warningIconProp !== null) {
                $$renderer3.push("<!--[1-->");
                WarningIcon($$renderer3);
              } else {
                $$renderer3.push("<!--[-1-->");
              }
              $$renderer3.push(`<!--]-->`);
            }, infoIcon = function($$renderer3) {
              if (infoIconProp) {
                $$renderer3.push("<!--[0-->");
                infoIconProp?.($$renderer3);
                $$renderer3.push(`<!---->`);
              } else if (infoIconProp !== null) {
                $$renderer3.push("<!--[1-->");
                InfoIcon($$renderer3);
              } else {
                $$renderer3.push("<!--[-1-->");
              }
              $$renderer3.push(`<!--]-->`);
            }, closeIcon = function($$renderer3) {
              if (closeIconProp) {
                $$renderer3.push("<!--[0-->");
                closeIconProp?.($$renderer3);
                $$renderer3.push(`<!---->`);
              } else if (closeIconProp !== null) {
                $$renderer3.push("<!--[1-->");
                CloseIcon($$renderer3);
              } else {
                $$renderer3.push("<!--[-1-->");
              }
              $$renderer3.push(`<!--]-->`);
            };
            Toast($$renderer2, {
              index: index2,
              toast: toast2,
              defaultRichColors: richColors,
              duration: toastOptions?.duration ?? duration,
              class: toastOptions?.class ?? "",
              descriptionClass: toastOptions?.descriptionClass || "",
              invert,
              visibleToasts,
              closeButton,
              interacting,
              position: position2,
              style: toastOptions?.style ?? "",
              classes: toastOptions.classes || {},
              unstyled: toastOptions.unstyled ?? false,
              cancelButtonStyle: toastOptions?.cancelButtonStyle ?? "",
              actionButtonStyle: toastOptions?.actionButtonStyle ?? "",
              closeButtonAriaLabel: toastOptions?.closeButtonAriaLabel ?? closeButtonAriaLabel,
              expandByDefault: expand,
              expanded,
              pauseWhenPageIsHidden,
              loadingIcon: loadingIconProp,
              successIcon,
              errorIcon,
              warningIcon,
              infoIcon,
              closeIcon,
              $$slots: {
                successIcon: true,
                errorIcon: true,
                warningIcon: true,
                infoIcon: true,
                closeIcon: true
              }
            });
          }
        }
        $$renderer2.push(`<!--]--></ol>`);
      }
      $$renderer2.push(`<!--]-->`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--></section>`);
  });
}
class DataProvider {
  #baseHue = null;
  /** Current processing params from graph store */
  get #processingParams() {
    return {
      smoothValue: graphStore.smoothValue,
      normType: graphStore.normType,
      normHz: graphStore.normHzValue
    };
  }
  // ─── Add ─────────────────────────────────────────────────────────────────────
  async addFRData(sourceType, identifier, inputMetadata = {}) {
    if (this.isFRDataLoaded(identifier, inputMetadata.dispSuffix)) return;
    let metaData;
    let rawData;
    try {
      metaData = MetadataParser.getFRMetadata(sourceType, identifier);
      rawData = await FRParser.getFRDataFromMetadata(sourceType, metaData, inputMetadata.dispSuffix ?? "");
    } catch (err) {
      const label = identifier.replace(/ Target$/, "");
      toast.error(`Failed to load ${sourceType === "target" ? "target" : "device"}: ${label}`);
      return;
    }
    const rawCache = {
      channels: {
        ...rawData.L && { L: rawData.L },
        ...rawData.R && { R: rawData.R },
        ...rawData.AVG && { AVG: rawData.AVG }
      }
    };
    if (rawData._samples && rawData._sampleCount) {
      rawCache.samples = rawData._samples;
      rawCache.sampleCount = rawData._sampleCount;
    }
    if (rawData._hptfSamples && rawData._hptfLabels) {
      rawCache.hptfSamples = rawData._hptfSamples;
      rawCache.hptfLabels = rawData._hptfLabels;
      rawCache.hptfOnly = rawData._hptfOnly;
      rawCache.hptfFillOnly = rawData._hptfFillOnly;
    }
    const processed = DataProcessor.processChannels(rawData, this.#processingParams);
    const channels = Object.keys(processed);
    const dispSuffix = inputMetadata.dispSuffix ?? (metaData.files?.[0]?.suffix ?? "");
    const colors = this.#getColorForType(sourceType);
    const frObject = {
      uuid: crypto.randomUUID(),
      type: sourceType,
      identifier: metaData.identifier,
      channels: {
        ...processed.L && { L: processed.L },
        ...processed.R && { R: processed.R },
        ...processed.AVG && { AVG: processed.AVG }
      },
      dispChannel: this.#getChannelValue(sourceType, channels),
      dispSuffix,
      colors,
      dash: this.#getDashForType(sourceType, metaData.identifier),
      meta: metaData,
      _rawData: rawCache
    };
    if (rawData._samples && rawData._sampleCount) {
      const processedSamples = DataProcessor.processSamples(rawData._samples, this.#processingParams);
      frObject.samples = processedSamples;
      frObject.sampleCount = rawData._sampleCount;
      frObject.colors = this.#addSampleColors(colors, rawData._sampleCount);
      const defaultDisplay = getConfigValue();
      if (defaultDisplay === "all") {
        frObject.dispSamples = this.#getAllSampleKeys(rawData._sampleCount);
      } else {
        frObject.dispSamples = [];
      }
    }
    if (rawData._hptfSamples && rawData._hptfLabels) {
      const processedSamples = DataProcessor.processHpTFSamples(rawData._hptfSamples, rawData._hptfLabels, this.#processingParams);
      const fillOnly = rawData._hptfFillOnly ?? true;
      const hptfDescription = metaData.files?.[0]?.hptfDescription;
      frObject.hptf = {
        samples: processedSamples,
        envelope: this.#computeAllHpTFEnvelopes(processedSamples),
        labels: rawData._hptfLabels,
        fillOnly,
        ...hptfDescription && { description: hptfDescription }
      };
      const defaultDisplay = getConfigValue() ?? "fill+curves";
      frObject.hptfFillVisible = defaultDisplay === "fill" || defaultDisplay === "fill+curves";
      frObject.hptfAvgVisible = defaultDisplay !== "none";
      frObject.dispHptf = fillOnly ? [] : defaultDisplay === "curves" || defaultDisplay === "fill+curves" ? this.#getAllHpTFKeys(processedSamples) : [];
      if (rawData._hptfOnly) {
        frObject.hptfOnly = true;
      }
    }
    commandHistory.execute(new AddFRDataCommand(frObject), frStore);
    this.#syncChannelsAfterAdd();
    if (sourceType === "phone") {
      const phoneMeta = metaData;
      analyticsService.trackPhoneEvent("phone_added", {
        brand: phoneMeta.brand,
        model: phoneMeta.name,
        variant: frObject.dispSuffix ?? ""
      });
    }
  }
  // ─── Remove ──────────────────────────────────────────────────────────────────
  removeFRData(sourceType, identifier) {
    for (const [uuid, data] of frStore.entries) {
      if (data.identifier === identifier) {
        commandHistory.execute(new RemoveFRDataCommand(uuid, sourceType), frStore);
        if (sourceType === "phone" && data.meta && "brand" in data.meta) {
          analyticsService.trackPhoneEvent("phone_removed", {
            brand: data.meta.brand,
            model: data.meta.name,
            variant: data.dispSuffix ?? ""
          });
        }
        return;
      }
    }
  }
  removeFRDataWithUUID(sourceType, uuid) {
    if (!frStore.has(uuid)) return;
    commandHistory.execute(new RemoveFRDataCommand(uuid, sourceType), frStore);
  }
  async toggleFRData(sourceType, identifier, enabled) {
    if (enabled) await this.addFRData(sourceType, identifier);
    else this.removeFRData(sourceType, identifier);
  }
  // ─── Insert raw ──────────────────────────────────────────────────────────────
  async insertRawFRData(sourceType, identifier, rawData, inputMetadata = {}) {
    const processed = DataProcessor.processChannels(rawData, this.#processingParams);
    const channels = Object.keys(processed);
    const frObject = {
      uuid: crypto.randomUUID(),
      type: `inserted-${sourceType}`,
      identifier,
      channels: {
        ...processed.L && { L: processed.L },
        ...processed.R && { R: processed.R },
        ...processed.AVG && { AVG: processed.AVG }
      },
      dispChannel: inputMetadata.dispChannel ?? this.#getChannelValue(sourceType, channels),
      dispSuffix: inputMetadata.dispSuffix ?? "(Inserted)",
      colors: this.#getColorForType(sourceType),
      dash: this.#getDashForType(sourceType, identifier),
      _rawData: { channels: rawData }
    };
    commandHistory.execute(new AddFRDataCommand(frObject), frStore);
  }
  // ─── Update raw data (EQ preview) ─────────────────────────────────────────
  updateFRDataWithRawData(uuid, rawData, opts = {}) {
    const existing = frStore.get(uuid);
    if (!existing) return;
    const processed = DataProcessor.processChannels(rawData, this.#processingParams);
    const updated = {
      ...existing,
      channels: {
        ...processed.L && { L: processed.L },
        ...processed.R && { R: processed.R },
        ...processed.AVG && { AVG: processed.AVG }
      },
      identifier: opts.identifier ?? existing.identifier,
      dispSuffix: opts.dispSuffix ?? existing.dispSuffix
    };
    commandHistory.execute(new UpdateFRDataWithRawDataCommand(uuid, updated), frStore);
  }
  // ─── Update variant ───────────────────────────────────────────────────────
  async updateVariant(uuid, dispSuffix) {
    const data = frStore.get(uuid);
    if (!data?.meta) throw new Error(`No data found for UUID: ${uuid}`);
    let rawData;
    try {
      rawData = await FRParser.getFRDataFromMetadata("phone", data.meta, dispSuffix);
    } catch {
      toast.error(`Failed to load variant: ${dispSuffix || data.identifier}`);
      return;
    }
    const variantRawCache = {
      channels: {
        ...rawData.L && { L: rawData.L },
        ...rawData.R && { R: rawData.R },
        ...rawData.AVG && { AVG: rawData.AVG }
      }
    };
    if (rawData._samples && rawData._sampleCount) {
      variantRawCache.samples = rawData._samples;
      variantRawCache.sampleCount = rawData._sampleCount;
    }
    if (rawData._hptfSamples && rawData._hptfLabels) {
      variantRawCache.hptfSamples = rawData._hptfSamples;
      variantRawCache.hptfLabels = rawData._hptfLabels;
      variantRawCache.hptfOnly = rawData._hptfOnly;
      variantRawCache.hptfFillOnly = rawData._hptfFillOnly;
    }
    const processed = DataProcessor.processChannels(rawData, this.#processingParams);
    const channels = Object.keys(processed);
    const dispChannel = data.dispChannel.every((ch) => channels.includes(ch)) ? [...data.dispChannel] : [channels[0]];
    commandHistory.execute(
      new UpdateVariantCommand(
        uuid,
        {
          ...processed.L && { L: processed.L },
          ...processed.R && { R: processed.R },
          ...processed.AVG && { AVG: processed.AVG }
        },
        dispSuffix,
        dispChannel
      ),
      frStore
    );
    if (rawData._samples && rawData._sampleCount) {
      const existingData = frStore.get(uuid);
      if (existingData) {
        const processedSamples = DataProcessor.processSamples(rawData._samples, this.#processingParams);
        frStore.set(uuid, {
          ...existingData,
          samples: processedSamples,
          sampleCount: rawData._sampleCount,
          colors: this.#addSampleColors(existingData.colors, rawData._sampleCount),
          dispSamples: existingData.dispSamples ?? []
        });
      }
    } else {
      const existingData = frStore.get(uuid);
      if (existingData && existingData.samples) {
        frStore.set(uuid, {
          ...existingData,
          samples: void 0,
          sampleCount: void 0,
          dispSamples: void 0
        });
      }
    }
    if (rawData._hptfSamples && rawData._hptfLabels) {
      const existingData = frStore.get(uuid);
      if (existingData) {
        const processedSamples = DataProcessor.processHpTFSamples(rawData._hptfSamples, rawData._hptfLabels, this.#processingParams);
        const variantFillOnly = rawData._hptfFillOnly ?? true;
        const phoneMeta = data.meta;
        const variantDescription = phoneMeta.files?.find((f) => f.suffix === dispSuffix)?.hptfDescription ?? phoneMeta.files?.[0]?.hptfDescription;
        frStore.set(uuid, {
          ...existingData,
          hptf: {
            samples: processedSamples,
            envelope: this.#computeAllHpTFEnvelopes(processedSamples),
            labels: rawData._hptfLabels,
            fillOnly: variantFillOnly,
            ...variantDescription && { description: variantDescription }
          },
          hptfOnly: rawData._hptfOnly ?? false,
          dispHptf: variantFillOnly ? [] : existingData.dispHptf ?? [],
          hptfFillVisible: existingData.hptfFillVisible ?? true
        });
      }
    } else {
      const existingData = frStore.get(uuid);
      if (existingData && existingData.hptf) {
        frStore.set(uuid, {
          ...existingData,
          hptf: void 0,
          dispHptf: void 0,
          hptfFillVisible: void 0,
          hptfOnly: void 0
        });
      }
    }
    const finalData = frStore.get(uuid);
    if (finalData) {
      frStore.set(uuid, { ...finalData, _rawData: variantRawCache });
    }
  }
  // ─── Update sample display ────────────────────────────────────────────────
  updateSampleDisplay(uuid, dispSamples) {
    if (!frStore.has(uuid)) return;
    commandHistory.execute(new UpdateSampleDisplayCommand(uuid, dispSamples), frStore);
  }
  // ─── Update HpTF display ─────────────────────────────────────────────────
  updateHpTFDisplay(uuid, dispHptf, hptfFillVisible, hptfAvgVisible) {
    if (!frStore.has(uuid)) return;
    commandHistory.execute(new UpdateHpTFDisplayCommand(uuid, dispHptf, hptfFillVisible, hptfAvgVisible), frStore);
  }
  // ─── Re-normalize all loaded data ─────────────────────────────────────────
  renormalizeAll() {
    for (const [uuid, data] of frStore.entries) {
      const processed = normalizeChannels(data.channels, graphStore.normType, graphStore.normHzValue);
      const updated = {
        ...data,
        channels: {
          ...processed.L && { L: processed.L },
          ...processed.R && { R: processed.R },
          ...processed.AVG && { AVG: processed.AVG }
        }
      };
      if (data.samples) {
        updated.samples = data.samples.map((sample) => {
          const s = {};
          if (sample.L) s.L = normalizeChannels({ L: sample.L }, graphStore.normType, graphStore.normHzValue).L;
          if (sample.R) s.R = normalizeChannels({ R: sample.R }, graphStore.normType, graphStore.normHzValue).R;
          return s;
        });
      }
      if (data.hptf) {
        const reNormedSamples = this.#reprocessHpTFSamples(data.hptf.samples, false);
        updated.hptf = {
          ...data.hptf,
          samples: reNormedSamples,
          envelope: this.#computeAllHpTFEnvelopes(reNormedSamples)
        };
      }
      frStore.set(uuid, updated);
    }
    commandHistory.clear();
  }
  // ─── Re-smooth all loaded data (called by SmoothingButton) ───────────────
  async reSmoothAll() {
    for (const [uuid, data] of frStore.entries) {
      const rawCache = data._rawData;
      if (rawCache) {
        const processed = DataProcessor.processChannels(rawCache.channels, this.#processingParams);
        const updated = {
          ...data,
          channels: {
            ...processed.L && { L: processed.L },
            ...processed.R && { R: processed.R },
            ...processed.AVG && { AVG: processed.AVG }
          }
        };
        if (rawCache.samples && rawCache.sampleCount) {
          updated.samples = DataProcessor.processSamples(rawCache.samples, this.#processingParams);
          updated.sampleCount = rawCache.sampleCount;
        }
        if (rawCache.hptfSamples && rawCache.hptfLabels) {
          const processedSamples = DataProcessor.processHpTFSamples(rawCache.hptfSamples, rawCache.hptfLabels, this.#processingParams);
          updated.hptf = {
            ...data.hptf,
            samples: processedSamples,
            envelope: this.#computeAllHpTFEnvelopes(processedSamples)
          };
        }
        frStore.set(uuid, updated);
        if (data.type === "target" && graphStore.targetOriginalData.has(uuid)) {
          graphStore.targetOriginalData.set(uuid, {
            ...processed.L && { L: processed.L },
            ...processed.R && { R: processed.R },
            ...processed.AVG && { AVG: processed.AVG }
          });
        }
      } else if (data.meta && (data.type === "phone" || data.type === "target")) {
        try {
          const rawData = await FRParser.getFRDataFromMetadata(data.type, data.meta, data.dispSuffix ?? "");
          const fallbackCache = {
            channels: {
              ...rawData.L && { L: rawData.L },
              ...rawData.R && { R: rawData.R },
              ...rawData.AVG && { AVG: rawData.AVG }
            }
          };
          if (rawData._samples && rawData._sampleCount) {
            fallbackCache.samples = rawData._samples;
            fallbackCache.sampleCount = rawData._sampleCount;
          }
          if (rawData._hptfSamples && rawData._hptfLabels) {
            fallbackCache.hptfSamples = rawData._hptfSamples;
            fallbackCache.hptfLabels = rawData._hptfLabels;
            fallbackCache.hptfOnly = rawData._hptfOnly;
            fallbackCache.hptfFillOnly = rawData._hptfFillOnly;
          }
          const processed = DataProcessor.processChannels(rawData, this.#processingParams);
          frStore.set(uuid, {
            ...data,
            channels: {
              ...processed.L && { L: processed.L },
              ...processed.R && { R: processed.R },
              ...processed.AVG && { AVG: processed.AVG }
            },
            _rawData: fallbackCache
          });
        } catch {
        }
      }
    }
    graphStore.targetOriginalVersion++;
    commandHistory.clear();
  }
  // ─── Field updates ────────────────────────────────────────────────────────
  updateDisplayChannel(uuid, channel) {
    if (!frStore.has(uuid)) return;
    commandHistory.execute(new UpdateDisplayChannelCommand(uuid, channel), frStore);
  }
  updateColors(uuid, colors) {
    if (!frStore.has(uuid)) return;
    commandHistory.execute(new UpdateColorsCommand(uuid, colors), frStore);
  }
  updateDashPattern(uuid, dash) {
    if (!frStore.has(uuid)) return;
    commandHistory.execute(new UpdateDashPatternCommand(uuid, dash), frStore);
  }
  updateVisibility(uuid, hidden) {
    if (!frStore.has(uuid)) return;
    commandHistory.execute(new UpdateVisibilityCommand(uuid, hidden), frStore);
  }
  updateYOffset(uuid, yOffset) {
    if (!frStore.has(uuid)) return;
    commandHistory.execute(new UpdateYOffsetCommand(uuid, yOffset), frStore);
  }
  // ─── Reads ────────────────────────────────────────────────────────────────
  getFRData(uuid) {
    return frStore.get(uuid);
  }
  isFRDataLoaded(identifier, suffix) {
    for (const data of frStore.entries.values()) {
      if (data.identifier === identifier) {
        if (!suffix || data.dispSuffix === suffix) return true;
      }
    }
    return false;
  }
  getUUIDbyIdentifier(identifier) {
    for (const [uuid, data] of frStore.entries) {
      if (data.identifier === identifier) return uuid;
    }
    return null;
  }
  // ─── Private helpers ──────────────────────────────────────────────────────
  /** After adding a phone, sync channel display across all phones */
  #syncChannelsAfterAdd() {
    const phones = [...frStore.entries.values()].filter((e) => e.type === "phone");
    if (phones.length > 1) {
      for (const phone of phones) {
        const dispChannel = Object.keys(phone.channels).includes("AVG") ? ["AVG"] : [Object.keys(phone.channels)[0]];
        frStore.set(phone.uuid, { ...phone, dispChannel: [...dispChannel] });
      }
    } else if (phones.length === 1) {
      const phone = phones[0];
      const keys = Object.keys(phone.channels);
      const dispChannel = keys.includes("L") && keys.includes("R") ? ["L", "R"] : keys.includes("AVG") ? ["AVG"] : [keys[0]];
      frStore.set(phone.uuid, { ...phone, dispChannel });
    }
  }
  #getChannelValue(sourceType, available) {
    const phoneCount = [...frStore.entries.values()].filter((e) => e.type === "phone").length;
    if (sourceType !== "phone") return ["AVG"];
    if (phoneCount < 1) return available.filter((ch) => ch !== "AVG");
    return available.includes("AVG") ? ["AVG"] : [available[0]];
  }
  #getColorForType(sourceType) {
    if (this.#baseHue === null) {
      this.#baseHue = Math.floor(Math.random() * 360);
    } else {
      this.#baseHue = (this.#baseHue + 100) % 360;
    }
    const s = Math.floor(Math.random() * 50);
    const l = Math.floor(Math.random() * 20);
    if (sourceType === "target") return { AVG: `hsl(${this.#baseHue}, 0%, 45%)` };
    return {
      L: `hsl(${(this.#baseHue - 10 + 360) % 360}, ${50 + s}%, ${30 + l}%)`,
      R: `hsl(${(this.#baseHue + 10) % 360}, ${50 + s}%, ${30 + l}%)`,
      AVG: `hsl(${this.#baseHue}, ${50 + s}%, ${30 + l}%)`
    };
  }
  #getDashForType(sourceType, identifier) {
    if (sourceType !== "target") return "1 0";
    const list = getConfigValue();
    const match = list?.find((o) => (o.name.endsWith(" Target") ? o.name : o.name + " Target") === identifier);
    return match?.dash ?? this.#randomDash();
  }
  #randomDash() {
    const numPairs = 1 + Math.floor(Math.random() * 3);
    const space = 5 + Math.floor(Math.random() * 3);
    return Array.from({ length: numPairs }, (_, i) => i % 2 === 0 ? `${5 + Math.floor(Math.random() * 5)} ${space}` : `2 ${space}`).join(" ");
  }
  /** Add sample colors to an existing FRColors object */
  #addSampleColors(baseColors, sampleCount) {
    const samples = {};
    for (let i = 1; i <= sampleCount; i++) {
      samples[`L${i}`] = baseColors.L ?? baseColors.AVG;
      samples[`R${i}`] = baseColors.R ?? baseColors.AVG;
    }
    return { ...baseColors, samples };
  }
  /** Generate all sample channel keys for a given sample count */
  #getAllSampleKeys(sampleCount) {
    const keys = [];
    for (let i = 1; i <= sampleCount; i++) {
      keys.push(`L${i}`, `R${i}`);
    }
    return keys;
  }
  // ─── HpTF helpers ────────────────────────────────────────────────────────
  /** Compute min/max envelope for a single channel across all HpTF samples */
  #computeHpTFEnvelope(samples, channel) {
    const sampleDataArrays = samples.map((s) => s[channel]?.data).filter((d) => !!d);
    if (sampleDataArrays.length < 2) return { upper: [], lower: [] };
    const upper = sampleDataArrays[0].map(([freq], idx) => {
      const max = Math.max(...sampleDataArrays.map((d) => d[idx][1]));
      return [freq, max];
    });
    const lower = sampleDataArrays[0].map(([freq], idx) => {
      const min = Math.min(...sampleDataArrays.map((d) => d[idx][1]));
      return [freq, min];
    });
    return { upper, lower };
  }
  /** Compute envelopes for all channels */
  #computeAllHpTFEnvelopes(samples) {
    return {
      L: this.#computeHpTFEnvelope(samples, "L"),
      R: this.#computeHpTFEnvelope(samples, "R"),
      AVG: this.#computeHpTFEnvelope(samples, "AVG")
    };
  }
  /** Generate all HpTF display keys (AVG per sample by default) */
  #getAllHpTFKeys(samples) {
    const keys = [];
    samples.forEach((sample, i) => {
      if (sample.AVG) keys.push(`sample${i}_AVG`);
      else {
        if (sample.L) keys.push(`sample${i}_L`);
        if (sample.R) keys.push(`sample${i}_R`);
      }
    });
    return keys;
  }
  /** Re-process HpTF samples (normalize only, not re-smooth) */
  #reprocessHpTFSamples(samples, smooth) {
    return samples.map((sample) => {
      const p = { label: sample.label };
      if (sample.L) {
        const src = smooth ? FRSmoother.smoothChannels({ L: sample.L }, graphStore.smoothValue) : { L: sample.L };
        p.L = normalizeChannels(src, graphStore.normType, graphStore.normHzValue).L;
      }
      if (sample.R) {
        const src = smooth ? FRSmoother.smoothChannels({ R: sample.R }, graphStore.smoothValue) : { R: sample.R };
        p.R = normalizeChannels(src, graphStore.normType, graphStore.normHzValue).R;
      }
      if (p.L && p.R) {
        p.AVG = {
          data: p.L.data.map(([freq, lDb], idx) => [freq, (lDb + p.R.data[idx][1]) / 2]),
          metadata: { ...p.L.metadata }
        };
      }
      return p;
    });
  }
}
const dataProvider = new DataProvider();
const Base62 = {
  charset: "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
  encode(str) {
    const bytes = new TextEncoder().encode(str);
    let value = BigInt(0);
    for (let i = 0; i < bytes.length; i++) {
      value = value * BigInt(256) + BigInt(bytes[i]);
    }
    let result = "";
    while (value > 0) {
      result = this.charset[Number(value % BigInt(62))] + result;
      value = value / BigInt(62);
    }
    return result || "0";
  },
  decode(str) {
    let value = BigInt(0);
    for (let i = 0; i < str.length; i++) {
      value = value * BigInt(62) + BigInt(this.charset.indexOf(str[i]));
    }
    const bytes = [];
    while (value > 0) {
      bytes.unshift(Number(value % BigInt(256)));
      value = value / BigInt(256);
    }
    return new TextDecoder().decode(new Uint8Array(bytes));
  }
};
class EQStore {
  filters = [];
  preamp = 0;
  isEnabled = false;
  /** UUID of the phone to apply EQ to (EQ preview) */
  sourcePhoneUUID = null;
  /** UUID of the target curve used for AutoEQ calculation */
  autoEqTargetUUID = null;
  /** UUID of the EQ-modified FRDataObject in frStore */
  eqCurveUUID = null;
  /** EQ-modified FR data (pre-normalization) — used for overlay node positioning */
  eqModifiedData = new SvelteMap();
  updateBandAt(index, partial) {
    if (index < 0 || index >= this.filters.length) return;
    const filters = [...this.filters];
    filters[index] = { ...filters[index], ...partial };
    this.filters = filters;
  }
  addBand(band) {
    this.filters = [...this.filters, band];
  }
  removeBandAt(index) {
    this.filters = this.filters.filter((_, i) => i !== index);
  }
}
const eqStore = new EQStore();
class URLProvider {
  #baseTitle = "";
  #baseDescription = "";
  #baseURL = "";
  #autoUpdateURL = true;
  #useBase62 = false;
  #phoneDataFromURL = [];
  #stateFromURL = null;
  /** Call once during app startup (in onMount). */
  init() {
    this.#baseTitle = document.querySelector("title")?.textContent || "modernGraphTool";
    this.#baseDescription = document.querySelector('meta[name="description"]')?.getAttribute("content") || "View and compare frequency response graphs";
    this.#baseURL = window.location.href.split("?")[0];
    this.#autoUpdateURL = getConfigValue() ?? true;
    this.#useBase62 = getConfigValue() ?? false;
    this.#loadFromURL();
  }
  // ── Public reads ─────────────────────────────────────────────────────────
  get phoneDataFromURL() {
    return this.#phoneDataFromURL;
  }
  get stateFromURL() {
    return this.#stateFromURL;
  }
  // ── URL update (called reactively from $effect or on demand) ─────────────
  updateURL(changeURL = true) {
    const { url, title, namesCombined } = this.#buildURL();
    if (changeURL) {
      const { pathname, search } = new URL(url);
      const newPath = pathname + search;
      const currentPath = window.location.pathname + window.location.search;
      if (newPath !== currentPath) {
        replaceState(resolve(newPath, {}));
      }
    }
    document.title = title;
    this.#updateMetaTags(namesCombined);
  }
  /** Auto-update URL if configured. Called from $effect. */
  autoUpdate() {
    if (this.#autoUpdateURL) this.updateURL(true);
  }
  /**
   * Returns a shareable URL that includes the current EQ filter state.
   */
  getCurrentURLWithEQ() {
    const { url } = this.#buildURL({
      filters: eqStore.filters,
      preamp: eqStore.preamp
    });
    return url;
  }
  /** Get the current share URL (without EQ state). */
  getCurrentURL() {
    const { url } = this.#buildURL();
    return url;
  }
  toggleBase62(enable) {
    this.#useBase62 = enable;
    this.updateURL();
  }
  // ── State restoration (called after initial data loads) ──────────────────
  applyStateFromURL() {
    if (!this.#stateFromURL) return;
    const { yScale, baselineUUID, yOffsets, eq, sampleDisplay, hptfDisplay } = this.#stateFromURL;
    if (yScale != null) graphStore.yScale = yScale;
    if (baselineUUID != null) graphStore.baselineUUID = baselineUUID;
    if (yOffsets) {
      for (const [uuid, data] of frStore.entries) {
        const key = (data.identifier + " " + (data.dispSuffix ?? "")).trim();
        if (key in yOffsets) {
          frStore.set(uuid, { ...data, yOffset: yOffsets[key] });
        }
      }
    }
    if (sampleDisplay) {
      for (const [uuid, data] of frStore.entries) {
        const key = (data.identifier + " " + (data.dispSuffix ?? "")).trim();
        if (key in sampleDisplay && data.samples) {
          frStore.set(uuid, { ...data, dispSamples: sampleDisplay[key] });
        }
      }
    }
    if (hptfDisplay) {
      for (const [uuid, data] of frStore.entries) {
        const key = (data.identifier + " " + (data.dispSuffix ?? "")).trim();
        if (key in hptfDisplay && data.hptf) {
          frStore.set(uuid, {
            ...data,
            dispHptf: hptfDisplay[key].keys,
            hptfFillVisible: hptfDisplay[key].fill
          });
        }
      }
    }
    if (eq && eq.filters.length > 0) {
      eqStore.filters = eq.filters;
      eqStore.preamp = eq.preamp;
      eqStore.isEnabled = true;
    }
  }
  // ── Private ──────────────────────────────────────────────────────────────
  #loadFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    const shareParam = urlParams.get("share");
    if (shareParam) {
      if (shareParam.startsWith("b62_")) {
        const encoded = shareParam.replace("b62_", "");
        this.#phoneDataFromURL = this.#smartSplit(Base62.decode(encoded));
      } else {
        const decodedParam = decodeURI(shareParam).replace(/_/g, " ");
        this.#phoneDataFromURL = this.#smartSplit(decodedParam);
      }
    }
    const stateParam = urlParams.get("state");
    if (stateParam) {
      try {
        const stateStr = Base62.decode(stateParam);
        this.#stateFromURL = JSON.parse(stateStr);
      } catch {
      }
    }
  }
  /** Split comma-separated string while respecting parentheses/brackets. */
  #smartSplit(input) {
    const result = [];
    let current = "";
    let parenDepth = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input[i];
      if (char === "(" || char === "[" || char === "{") {
        parenDepth++;
        current += char;
      } else if (char === ")" || char === "]" || char === "}") {
        parenDepth--;
        current += char;
      } else if (char === "," && parenDepth === 0) {
        if (current.trim()) result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    if (current.trim()) result.push(current.trim());
    return result;
  }
  #buildURL(eq) {
    const activeNames = [];
    for (const [, data] of frStore.entries) {
      const name = (data.identifier + " " + (data.dispSuffix ?? "")).trim();
      if (name) activeNames.push(name);
    }
    let title = this.#baseTitle;
    let url = this.#baseURL;
    const namesCombined = activeNames.join(", ");
    if (activeNames.length) {
      if (this.#useBase62) {
        const encoded = Base62.encode(activeNames.join(","));
        url += `?share=b62_${encoded}`;
      } else {
        url += `?share=${encodeURI(activeNames.join(","))}`;
      }
      title = title + " - " + namesCombined;
    }
    const stateData = { yScale: graphStore.yScale };
    let hasExtraState = graphStore.yScale !== 60;
    if (graphStore.baselineUUID) {
      stateData.baselineUUID = graphStore.baselineUUID;
      hasExtraState = true;
    }
    const yOffsets = {};
    for (const [, data] of frStore.entries) {
      if (data.yOffset) {
        yOffsets[(data.identifier + " " + (data.dispSuffix ?? "")).trim()] = data.yOffset;
        hasExtraState = true;
      }
    }
    if (Object.keys(yOffsets).length) stateData.yOffsets = yOffsets;
    const sampleDisplay = {};
    for (const [, data] of frStore.entries) {
      if (data.dispSamples && data.dispSamples.length > 0) {
        sampleDisplay[(data.identifier + " " + (data.dispSuffix ?? "")).trim()] = data.dispSamples;
        hasExtraState = true;
      }
    }
    if (Object.keys(sampleDisplay).length) stateData.sampleDisplay = sampleDisplay;
    const hptfDisplay = {};
    for (const [, data] of frStore.entries) {
      if (data.hptf) {
        const key = (data.identifier + " " + (data.dispSuffix ?? "")).trim();
        hptfDisplay[key] = {
          keys: data.dispHptf ?? [],
          fill: data.hptfFillVisible ?? false
        };
        hasExtraState = true;
      }
    }
    if (Object.keys(hptfDisplay).length) stateData.hptfDisplay = hptfDisplay;
    if (eq && eq.filters.length > 0) {
      stateData.eq = eq;
      hasExtraState = true;
    }
    if (hasExtraState) {
      const stateStr = JSON.stringify(stateData);
      const sep = url.includes("?") ? "&" : "?";
      url += `${sep}state=${Base62.encode(stateStr)}`;
    }
    return { url, title, namesCombined };
  }
  #updateMetaTags(namesCombined) {
    const canonicalLink = document.querySelector("link[rel='canonical']");
    if (canonicalLink) {
      canonicalLink.setAttribute("href", namesCombined ? window.location.href : this.#baseURL);
    }
    const metaDescription = document.querySelector("meta[name='description']");
    if (metaDescription && namesCombined) {
      metaDescription.setAttribute(
        "content",
        `View and compare frequency response graph of ${namesCombined}.`
      );
    }
  }
}
const urlProvider = new URLProvider();
const en_top_nav_bar_sidebar_link_title = (
  /** @type {(inputs: Top_Nav_Bar_Sidebar_Link_TitleInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `LINKS`
    );
  }
);
const ko_top_nav_bar_sidebar_link_title = (
  /** @type {(inputs: Top_Nav_Bar_Sidebar_Link_TitleInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `링크`
    );
  }
);
const top_nav_bar_sidebar_link_title = (
  /** @type {((inputs?: Top_Nav_Bar_Sidebar_Link_TitleInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Top_Nav_Bar_Sidebar_Link_TitleInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_top_nav_bar_sidebar_link_title();
    return ko_top_nav_bar_sidebar_link_title();
  })
);
const en_phone_selector_header_brand_btn = (
  /** @type {(inputs: Phone_Selector_Header_Brand_BtnInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Brands`
    );
  }
);
const ko_phone_selector_header_brand_btn = (
  /** @type {(inputs: Phone_Selector_Header_Brand_BtnInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `브랜드`
    );
  }
);
const phone_selector_header_brand_btn = (
  /** @type {((inputs?: Phone_Selector_Header_Brand_BtnInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Phone_Selector_Header_Brand_BtnInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_phone_selector_header_brand_btn();
    return ko_phone_selector_header_brand_btn();
  })
);
const en_phone_selector_header_device_btn = (
  /** @type {(inputs: Phone_Selector_Header_Device_BtnInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Devices`
    );
  }
);
const ko_phone_selector_header_device_btn = (
  /** @type {(inputs: Phone_Selector_Header_Device_BtnInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `기기`
    );
  }
);
const phone_selector_header_device_btn = (
  /** @type {((inputs?: Phone_Selector_Header_Device_BtnInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Phone_Selector_Header_Device_BtnInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_phone_selector_header_device_btn();
    return ko_phone_selector_header_device_btn();
  })
);
const en_phone_selector_header_search_bar_placeholder = (
  /** @type {(inputs: Phone_Selector_Header_Search_Bar_PlaceholderInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Search`
    );
  }
);
const ko_phone_selector_header_search_bar_placeholder = (
  /** @type {(inputs: Phone_Selector_Header_Search_Bar_PlaceholderInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `검색`
    );
  }
);
const phone_selector_header_search_bar_placeholder = (
  /** @type {((inputs?: Phone_Selector_Header_Search_Bar_PlaceholderInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Phone_Selector_Header_Search_Bar_PlaceholderInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_phone_selector_header_search_bar_placeholder();
    return ko_phone_selector_header_search_bar_placeholder();
  })
);
const en_phone_selector_item_review = (
  /** @type {(inputs: Phone_Selector_Item_ReviewInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Review`
    );
  }
);
const ko_phone_selector_item_review = (
  /** @type {(inputs: Phone_Selector_Item_ReviewInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `리뷰`
    );
  }
);
const phone_selector_item_review = (
  /** @type {((inputs?: Phone_Selector_Item_ReviewInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Phone_Selector_Item_ReviewInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_phone_selector_item_review();
    return ko_phone_selector_item_review();
  })
);
const en_phone_selector_item_shop = (
  /** @type {(inputs: Phone_Selector_Item_ShopInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Shop`
    );
  }
);
const ko_phone_selector_item_shop = (
  /** @type {(inputs: Phone_Selector_Item_ShopInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `구매`
    );
  }
);
const phone_selector_item_shop = (
  /** @type {((inputs?: Phone_Selector_Item_ShopInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Phone_Selector_Item_ShopInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_phone_selector_item_shop();
    return ko_phone_selector_item_shop();
  })
);
const en_phone_selector_clear_brands_btn = (
  /** @type {(inputs: Phone_Selector_Clear_Brands_BtnInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Unselect Brands`
    );
  }
);
const ko_phone_selector_clear_brands_btn = (
  /** @type {(inputs: Phone_Selector_Clear_Brands_BtnInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `브랜드 선택 해제`
    );
  }
);
const phone_selector_clear_brands_btn = (
  /** @type {((inputs?: Phone_Selector_Clear_Brands_BtnInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Phone_Selector_Clear_Brands_BtnInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_phone_selector_clear_brands_btn();
    return ko_phone_selector_clear_brands_btn();
  })
);
const en_selection_list_channel_left = (
  /** @type {(inputs: Selection_List_Channel_LeftInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `L`
    );
  }
);
const ko_selection_list_channel_left = (
  /** @type {(inputs: Selection_List_Channel_LeftInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `L`
    );
  }
);
const selection_list_channel_left = (
  /** @type {((inputs?: Selection_List_Channel_LeftInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Selection_List_Channel_LeftInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_selection_list_channel_left();
    return ko_selection_list_channel_left();
  })
);
const en_selection_list_channel_right = (
  /** @type {(inputs: Selection_List_Channel_RightInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `R`
    );
  }
);
const ko_selection_list_channel_right = (
  /** @type {(inputs: Selection_List_Channel_RightInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `R`
    );
  }
);
const selection_list_channel_right = (
  /** @type {((inputs?: Selection_List_Channel_RightInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Selection_List_Channel_RightInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_selection_list_channel_right();
    return ko_selection_list_channel_right();
  })
);
const en_selection_list_channel_left_and_right = (
  /** @type {(inputs: Selection_List_Channel_Left_And_RightInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `L + R`
    );
  }
);
const ko_selection_list_channel_left_and_right = (
  /** @type {(inputs: Selection_List_Channel_Left_And_RightInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `L + R`
    );
  }
);
const selection_list_channel_left_and_right = (
  /** @type {((inputs?: Selection_List_Channel_Left_And_RightInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Selection_List_Channel_Left_And_RightInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_selection_list_channel_left_and_right();
    return ko_selection_list_channel_left_and_right();
  })
);
const en_selection_list_channel_average = (
  /** @type {(inputs: Selection_List_Channel_AverageInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Average`
    );
  }
);
const ko_selection_list_channel_average = (
  /** @type {(inputs: Selection_List_Channel_AverageInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `평균`
    );
  }
);
const selection_list_channel_average = (
  /** @type {((inputs?: Selection_List_Channel_AverageInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Selection_List_Channel_AverageInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_selection_list_channel_average();
    return ko_selection_list_channel_average();
  })
);
const en_selection_list_samples_header = (
  /** @type {(inputs: Selection_List_Samples_HeaderInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Samples`
    );
  }
);
const ko_selection_list_samples_header = (
  /** @type {(inputs: Selection_List_Samples_HeaderInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `샘플`
    );
  }
);
const selection_list_samples_header = (
  /** @type {((inputs?: Selection_List_Samples_HeaderInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Selection_List_Samples_HeaderInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_selection_list_samples_header();
    return ko_selection_list_samples_header();
  })
);
const en_selection_list_samples_all_l = (
  /** @type {(inputs: Selection_List_Samples_All_LInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Select All L`
    );
  }
);
const ko_selection_list_samples_all_l = (
  /** @type {(inputs: Selection_List_Samples_All_LInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `L 전체`
    );
  }
);
const selection_list_samples_all_l = (
  /** @type {((inputs?: Selection_List_Samples_All_LInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Selection_List_Samples_All_LInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_selection_list_samples_all_l();
    return ko_selection_list_samples_all_l();
  })
);
const en_selection_list_samples_all_r = (
  /** @type {(inputs: Selection_List_Samples_All_RInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Select All R`
    );
  }
);
const ko_selection_list_samples_all_r = (
  /** @type {(inputs: Selection_List_Samples_All_RInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `R 전체`
    );
  }
);
const selection_list_samples_all_r = (
  /** @type {((inputs?: Selection_List_Samples_All_RInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Selection_List_Samples_All_RInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_selection_list_samples_all_r();
    return ko_selection_list_samples_all_r();
  })
);
const en_selection_list_samples_all = (
  /** @type {(inputs: Selection_List_Samples_AllInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Select All`
    );
  }
);
const ko_selection_list_samples_all = (
  /** @type {(inputs: Selection_List_Samples_AllInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `전체 선택`
    );
  }
);
const selection_list_samples_all = (
  /** @type {((inputs?: Selection_List_Samples_AllInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Selection_List_Samples_AllInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_selection_list_samples_all();
    return ko_selection_list_samples_all();
  })
);
const en_selection_list_samples_none = (
  /** @type {(inputs: Selection_List_Samples_NoneInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Deselect All`
    );
  }
);
const ko_selection_list_samples_none = (
  /** @type {(inputs: Selection_List_Samples_NoneInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `선택 해제`
    );
  }
);
const selection_list_samples_none = (
  /** @type {((inputs?: Selection_List_Samples_NoneInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Selection_List_Samples_NoneInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_selection_list_samples_none();
    return ko_selection_list_samples_none();
  })
);
const en_selection_list_hptf_header = (
  /** @type {(inputs: Selection_List_Hptf_HeaderInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `HpTF Samples`
    );
  }
);
const ko_selection_list_hptf_header = (
  /** @type {(inputs: Selection_List_Hptf_HeaderInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `HpTF 샘플`
    );
  }
);
const selection_list_hptf_header = (
  /** @type {((inputs?: Selection_List_Hptf_HeaderInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Selection_List_Hptf_HeaderInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_selection_list_hptf_header();
    return ko_selection_list_hptf_header();
  })
);
const en_selection_list_hptf_avg_toggle = (
  /** @type {(inputs: Selection_List_Hptf_Avg_ToggleInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Show Average`
    );
  }
);
const ko_selection_list_hptf_avg_toggle = (
  /** @type {(inputs: Selection_List_Hptf_Avg_ToggleInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `평균 표시`
    );
  }
);
const selection_list_hptf_avg_toggle = (
  /** @type {((inputs?: Selection_List_Hptf_Avg_ToggleInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Selection_List_Hptf_Avg_ToggleInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_selection_list_hptf_avg_toggle();
    return ko_selection_list_hptf_avg_toggle();
  })
);
const en_selection_list_hptf_fill_toggle = (
  /** @type {(inputs: Selection_List_Hptf_Fill_ToggleInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Show Deviation Fill`
    );
  }
);
const ko_selection_list_hptf_fill_toggle = (
  /** @type {(inputs: Selection_List_Hptf_Fill_ToggleInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `편차 범위 표시`
    );
  }
);
const selection_list_hptf_fill_toggle = (
  /** @type {((inputs?: Selection_List_Hptf_Fill_ToggleInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Selection_List_Hptf_Fill_ToggleInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_selection_list_hptf_fill_toggle();
    return ko_selection_list_hptf_fill_toggle();
  })
);
const en_selection_list_hptf_all = (
  /** @type {(inputs: Selection_List_Hptf_AllInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Select All`
    );
  }
);
const ko_selection_list_hptf_all = (
  /** @type {(inputs: Selection_List_Hptf_AllInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `전체 선택`
    );
  }
);
const selection_list_hptf_all = (
  /** @type {((inputs?: Selection_List_Hptf_AllInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Selection_List_Hptf_AllInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_selection_list_hptf_all();
    return ko_selection_list_hptf_all();
  })
);
const en_selection_list_hptf_none = (
  /** @type {(inputs: Selection_List_Hptf_NoneInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Deselect All`
    );
  }
);
const ko_selection_list_hptf_none = (
  /** @type {(inputs: Selection_List_Hptf_NoneInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `선택 해제`
    );
  }
);
const selection_list_hptf_none = (
  /** @type {((inputs?: Selection_List_Hptf_NoneInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Selection_List_Hptf_NoneInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_selection_list_hptf_none();
    return ko_selection_list_hptf_none();
  })
);
const en_menu_item_device_label = (
  /** @type {(inputs: Menu_Item_Device_LabelInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `DEVICES`
    );
  }
);
const ko_menu_item_device_label = (
  /** @type {(inputs: Menu_Item_Device_LabelInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `기기`
    );
  }
);
const menu_item_device_label = (
  /** @type {((inputs?: Menu_Item_Device_LabelInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Menu_Item_Device_LabelInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_menu_item_device_label();
    return ko_menu_item_device_label();
  })
);
const en_menu_item_graph_label = (
  /** @type {(inputs: Menu_Item_Graph_LabelInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `GRAPH`
    );
  }
);
const ko_menu_item_graph_label = (
  /** @type {(inputs: Menu_Item_Graph_LabelInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `그래프`
    );
  }
);
const menu_item_graph_label = (
  /** @type {((inputs?: Menu_Item_Graph_LabelInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Menu_Item_Graph_LabelInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_menu_item_graph_label();
    return ko_menu_item_graph_label();
  })
);
const en_menu_item_equalizer_label = (
  /** @type {(inputs: Menu_Item_Equalizer_LabelInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `EQUALIZER`
    );
  }
);
const ko_menu_item_equalizer_label = (
  /** @type {(inputs: Menu_Item_Equalizer_LabelInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `이퀄라이저`
    );
  }
);
const menu_item_equalizer_label = (
  /** @type {((inputs?: Menu_Item_Equalizer_LabelInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Menu_Item_Equalizer_LabelInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_menu_item_equalizer_label();
    return ko_menu_item_equalizer_label();
  })
);
const en_menu_item_misc_label = (
  /** @type {(inputs: Menu_Item_Misc_LabelInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `MISC`
    );
  }
);
const ko_menu_item_misc_label = (
  /** @type {(inputs: Menu_Item_Misc_LabelInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `기타`
    );
  }
);
const menu_item_misc_label = (
  /** @type {((inputs?: Menu_Item_Misc_LabelInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Menu_Item_Misc_LabelInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_menu_item_misc_label();
    return ko_menu_item_misc_label();
  })
);
const en_equalizer_phone_select_option_source = (
  /** @type {(inputs: Equalizer_Phone_Select_Option_SourceInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Select Device to EQ`
    );
  }
);
const ko_equalizer_phone_select_option_source = (
  /** @type {(inputs: Equalizer_Phone_Select_Option_SourceInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `EQ 적용 기기 선택`
    );
  }
);
const equalizer_phone_select_option_source = (
  /** @type {((inputs?: Equalizer_Phone_Select_Option_SourceInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Equalizer_Phone_Select_Option_SourceInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_equalizer_phone_select_option_source();
    return ko_equalizer_phone_select_option_source();
  })
);
const en_equalizer_phone_select_option_target = (
  /** @type {(inputs: Equalizer_Phone_Select_Option_TargetInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Select target for AutoEQ`
    );
  }
);
const ko_equalizer_phone_select_option_target = (
  /** @type {(inputs: Equalizer_Phone_Select_Option_TargetInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `AutoEQ 목표 선택`
    );
  }
);
const equalizer_phone_select_option_target = (
  /** @type {((inputs?: Equalizer_Phone_Select_Option_TargetInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Equalizer_Phone_Select_Option_TargetInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_equalizer_phone_select_option_target();
    return ko_equalizer_phone_select_option_target();
  })
);
const en_equalizer_filter_list_preamp = (
  /** @type {(inputs: Equalizer_Filter_List_PreampInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Preamp`
    );
  }
);
const ko_equalizer_filter_list_preamp = (
  /** @type {(inputs: Equalizer_Filter_List_PreampInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `프리앰프`
    );
  }
);
const equalizer_filter_list_preamp = (
  /** @type {((inputs?: Equalizer_Filter_List_PreampInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Equalizer_Filter_List_PreampInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_equalizer_filter_list_preamp();
    return ko_equalizer_filter_list_preamp();
  })
);
const en_equalizer_filter_list_import = (
  /** @type {(inputs: Equalizer_Filter_List_ImportInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Import EQ`
    );
  }
);
const ko_equalizer_filter_list_import = (
  /** @type {(inputs: Equalizer_Filter_List_ImportInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `EQ 불러오기`
    );
  }
);
const equalizer_filter_list_import = (
  /** @type {((inputs?: Equalizer_Filter_List_ImportInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Equalizer_Filter_List_ImportInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_equalizer_filter_list_import();
    return ko_equalizer_filter_list_import();
  })
);
const en_equalizer_filter_list_export = (
  /** @type {(inputs: Equalizer_Filter_List_ExportInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Export EQ`
    );
  }
);
const ko_equalizer_filter_list_export = (
  /** @type {(inputs: Equalizer_Filter_List_ExportInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `EQ 내보내기`
    );
  }
);
const equalizer_filter_list_export = (
  /** @type {((inputs?: Equalizer_Filter_List_ExportInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Equalizer_Filter_List_ExportInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_equalizer_filter_list_export();
    return ko_equalizer_filter_list_export();
  })
);
const en_equalizer_filter_list_export_graphic_eq = (
  /** @type {(inputs: Equalizer_Filter_List_Export_Graphic_EqInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Export as Graphic EQ (Wavelet)`
    );
  }
);
const ko_equalizer_filter_list_export_graphic_eq = (
  /** @type {(inputs: Equalizer_Filter_List_Export_Graphic_EqInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `그래픽 EQ로 내보내기 (Wavelet)`
    );
  }
);
const equalizer_filter_list_export_graphic_eq = (
  /** @type {((inputs?: Equalizer_Filter_List_Export_Graphic_EqInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Equalizer_Filter_List_Export_Graphic_EqInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_equalizer_filter_list_export_graphic_eq();
    return ko_equalizer_filter_list_export_graphic_eq();
  })
);
const en_equalizer_filter_list_peak = (
  /** @type {(inputs: Equalizer_Filter_List_PeakInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Peak`
    );
  }
);
const ko_equalizer_filter_list_peak = (
  /** @type {(inputs: Equalizer_Filter_List_PeakInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `피크`
    );
  }
);
const equalizer_filter_list_peak = (
  /** @type {((inputs?: Equalizer_Filter_List_PeakInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Equalizer_Filter_List_PeakInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_equalizer_filter_list_peak();
    return ko_equalizer_filter_list_peak();
  })
);
const en_equalizer_filter_list_lowshelf = (
  /** @type {(inputs: Equalizer_Filter_List_LowshelfInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Low Shelf`
    );
  }
);
const ko_equalizer_filter_list_lowshelf = (
  /** @type {(inputs: Equalizer_Filter_List_LowshelfInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `로우쉘프`
    );
  }
);
const equalizer_filter_list_lowshelf = (
  /** @type {((inputs?: Equalizer_Filter_List_LowshelfInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Equalizer_Filter_List_LowshelfInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_equalizer_filter_list_lowshelf();
    return ko_equalizer_filter_list_lowshelf();
  })
);
const en_equalizer_filter_list_highshelf = (
  /** @type {(inputs: Equalizer_Filter_List_HighshelfInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `High Shelf`
    );
  }
);
const ko_equalizer_filter_list_highshelf = (
  /** @type {(inputs: Equalizer_Filter_List_HighshelfInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `하이쉘프`
    );
  }
);
const equalizer_filter_list_highshelf = (
  /** @type {((inputs?: Equalizer_Filter_List_HighshelfInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Equalizer_Filter_List_HighshelfInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_equalizer_filter_list_highshelf();
    return ko_equalizer_filter_list_highshelf();
  })
);
const en_equalizer_filter_list_freq = (
  /** @type {(inputs: Equalizer_Filter_List_FreqInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Frequency (Hz)`
    );
  }
);
const ko_equalizer_filter_list_freq = (
  /** @type {(inputs: Equalizer_Filter_List_FreqInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `주파수 (Hz)`
    );
  }
);
const equalizer_filter_list_freq = (
  /** @type {((inputs?: Equalizer_Filter_List_FreqInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Equalizer_Filter_List_FreqInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_equalizer_filter_list_freq();
    return ko_equalizer_filter_list_freq();
  })
);
const en_equalizer_filter_list_q = (
  /** @type {(inputs: Equalizer_Filter_List_QInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Q`
    );
  }
);
const ko_equalizer_filter_list_q = (
  /** @type {(inputs: Equalizer_Filter_List_QInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Q`
    );
  }
);
const equalizer_filter_list_q = (
  /** @type {((inputs?: Equalizer_Filter_List_QInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Equalizer_Filter_List_QInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_equalizer_filter_list_q();
    return ko_equalizer_filter_list_q();
  })
);
const en_equalizer_filter_list_gain = (
  /** @type {(inputs: Equalizer_Filter_List_GainInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Gain (dB)`
    );
  }
);
const ko_equalizer_filter_list_gain = (
  /** @type {(inputs: Equalizer_Filter_List_GainInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `게인 (dB)`
    );
  }
);
const equalizer_filter_list_gain = (
  /** @type {((inputs?: Equalizer_Filter_List_GainInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Equalizer_Filter_List_GainInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_equalizer_filter_list_gain();
    return ko_equalizer_filter_list_gain();
  })
);
const en_equalizer_filter_list_no_filter_export_alert = (
  /** @type {(inputs: Equalizer_Filter_List_No_Filter_Export_AlertInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Please add at least one filter before exporting.`
    );
  }
);
const ko_equalizer_filter_list_no_filter_export_alert = (
  /** @type {(inputs: Equalizer_Filter_List_No_Filter_Export_AlertInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `내보내기 할 필터가 존재하지 않습니다.`
    );
  }
);
const equalizer_filter_list_no_filter_export_alert = (
  /** @type {((inputs?: Equalizer_Filter_List_No_Filter_Export_AlertInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Equalizer_Filter_List_No_Filter_Export_AlertInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_equalizer_filter_list_no_filter_export_alert();
    return ko_equalizer_filter_list_no_filter_export_alert();
  })
);
const en_equalizer_autoeq_freq_range = (
  /** @type {(inputs: Equalizer_Autoeq_Freq_RangeInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Frequency Range`
    );
  }
);
const ko_equalizer_autoeq_freq_range = (
  /** @type {(inputs: Equalizer_Autoeq_Freq_RangeInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `주파수 범위`
    );
  }
);
const equalizer_autoeq_freq_range = (
  /** @type {((inputs?: Equalizer_Autoeq_Freq_RangeInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Equalizer_Autoeq_Freq_RangeInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_equalizer_autoeq_freq_range();
    return ko_equalizer_autoeq_freq_range();
  })
);
const en_equalizer_autoeq_q_range = (
  /** @type {(inputs: Equalizer_Autoeq_Q_RangeInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Q Range`
    );
  }
);
const ko_equalizer_autoeq_q_range = (
  /** @type {(inputs: Equalizer_Autoeq_Q_RangeInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Q 범위`
    );
  }
);
const equalizer_autoeq_q_range = (
  /** @type {((inputs?: Equalizer_Autoeq_Q_RangeInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Equalizer_Autoeq_Q_RangeInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_equalizer_autoeq_q_range();
    return ko_equalizer_autoeq_q_range();
  })
);
const en_equalizer_autoeq_gain_range = (
  /** @type {(inputs: Equalizer_Autoeq_Gain_RangeInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Gain Range`
    );
  }
);
const ko_equalizer_autoeq_gain_range = (
  /** @type {(inputs: Equalizer_Autoeq_Gain_RangeInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `게인 범위`
    );
  }
);
const equalizer_autoeq_gain_range = (
  /** @type {((inputs?: Equalizer_Autoeq_Gain_RangeInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Equalizer_Autoeq_Gain_RangeInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_equalizer_autoeq_gain_range();
    return ko_equalizer_autoeq_gain_range();
  })
);
const en_equalizer_autoeq_filter_setting = (
  /** @type {(inputs: Equalizer_Autoeq_Filter_SettingInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Filter Settings`
    );
  }
);
const ko_equalizer_autoeq_filter_setting = (
  /** @type {(inputs: Equalizer_Autoeq_Filter_SettingInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `필터 설정`
    );
  }
);
const equalizer_autoeq_filter_setting = (
  /** @type {((inputs?: Equalizer_Autoeq_Filter_SettingInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Equalizer_Autoeq_Filter_SettingInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_equalizer_autoeq_filter_setting();
    return ko_equalizer_autoeq_filter_setting();
  })
);
const en_equalizer_autoeq_use_shelf_filter = (
  /** @type {(inputs: Equalizer_Autoeq_Use_Shelf_FilterInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Use LSF / HSF Filter`
    );
  }
);
const ko_equalizer_autoeq_use_shelf_filter = (
  /** @type {(inputs: Equalizer_Autoeq_Use_Shelf_FilterInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `LSF / HSF 필터 사용`
    );
  }
);
const equalizer_autoeq_use_shelf_filter = (
  /** @type {((inputs?: Equalizer_Autoeq_Use_Shelf_FilterInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Equalizer_Autoeq_Use_Shelf_FilterInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_equalizer_autoeq_use_shelf_filter();
    return ko_equalizer_autoeq_use_shelf_filter();
  })
);
const en_equalizer_autoeq_min = (
  /** @type {(inputs: Equalizer_Autoeq_MinInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Min`
    );
  }
);
const ko_equalizer_autoeq_min = (
  /** @type {(inputs: Equalizer_Autoeq_MinInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `최소`
    );
  }
);
const equalizer_autoeq_min = (
  /** @type {((inputs?: Equalizer_Autoeq_MinInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Equalizer_Autoeq_MinInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_equalizer_autoeq_min();
    return ko_equalizer_autoeq_min();
  })
);
const en_equalizer_autoeq_max = (
  /** @type {(inputs: Equalizer_Autoeq_MaxInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Max`
    );
  }
);
const ko_equalizer_autoeq_max = (
  /** @type {(inputs: Equalizer_Autoeq_MaxInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `최대`
    );
  }
);
const equalizer_autoeq_max = (
  /** @type {((inputs?: Equalizer_Autoeq_MaxInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Equalizer_Autoeq_MaxInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_equalizer_autoeq_max();
    return ko_equalizer_autoeq_max();
  })
);
const en_equalizer_autoeq_description = (
  /** @type {(inputs: Equalizer_Autoeq_DescriptionInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `AutoEQ will use as many filters as available.`
    );
  }
);
const ko_equalizer_autoeq_description = (
  /** @type {(inputs: Equalizer_Autoeq_DescriptionInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `AutoEQ는 현재 추가되어 있는 모든 필터를 활용합니다.`
    );
  }
);
const equalizer_autoeq_description = (
  /** @type {((inputs?: Equalizer_Autoeq_DescriptionInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Equalizer_Autoeq_DescriptionInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_equalizer_autoeq_description();
    return ko_equalizer_autoeq_description();
  })
);
const en_equalizer_autoeq_run_button = (
  /** @type {(inputs: Equalizer_Autoeq_Run_ButtonInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Run AutoEQ`
    );
  }
);
const ko_equalizer_autoeq_run_button = (
  /** @type {(inputs: Equalizer_Autoeq_Run_ButtonInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `AutoEQ 실행`
    );
  }
);
const equalizer_autoeq_run_button = (
  /** @type {((inputs?: Equalizer_Autoeq_Run_ButtonInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Equalizer_Autoeq_Run_ButtonInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_equalizer_autoeq_run_button();
    return ko_equalizer_autoeq_run_button();
  })
);
const en_equalizer_auto_eq_label = (
  /** @type {(inputs: Equalizer_Auto_Eq_LabelInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `AutoEQ`
    );
  }
);
const ko_equalizer_auto_eq_label = (
  /** @type {(inputs: Equalizer_Auto_Eq_LabelInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `AutoEQ`
    );
  }
);
const equalizer_auto_eq_label = (
  /** @type {((inputs?: Equalizer_Auto_Eq_LabelInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Equalizer_Auto_Eq_LabelInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_equalizer_auto_eq_label();
    return ko_equalizer_auto_eq_label();
  })
);
const en_equalizer_player_label = (
  /** @type {(inputs: Equalizer_Player_LabelInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Audio Player`
    );
  }
);
const ko_equalizer_player_label = (
  /** @type {(inputs: Equalizer_Player_LabelInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `오디오 플레이어`
    );
  }
);
const equalizer_player_label = (
  /** @type {((inputs?: Equalizer_Player_LabelInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Equalizer_Player_LabelInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_equalizer_player_label();
    return ko_equalizer_player_label();
  })
);
const en_equalizer_device_peq_label = (
  /** @type {(inputs: Equalizer_Device_Peq_LabelInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Device PEQ`
    );
  }
);
const ko_equalizer_device_peq_label = (
  /** @type {(inputs: Equalizer_Device_Peq_LabelInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Device PEQ`
    );
  }
);
const equalizer_device_peq_label = (
  /** @type {((inputs?: Equalizer_Device_Peq_LabelInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Equalizer_Device_Peq_LabelInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_equalizer_device_peq_label();
    return ko_equalizer_device_peq_label();
  })
);
const en_equalizer_player_option_init = (
  /** @type {(inputs: Equalizer_Player_Option_InitInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Select Audio Source`
    );
  }
);
const ko_equalizer_player_option_init = (
  /** @type {(inputs: Equalizer_Player_Option_InitInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `음원 선택`
    );
  }
);
const equalizer_player_option_init = (
  /** @type {((inputs?: Equalizer_Player_Option_InitInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Equalizer_Player_Option_InitInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_equalizer_player_option_init();
    return ko_equalizer_player_option_init();
  })
);
const en_equalizer_player_option_white = (
  /** @type {(inputs: Equalizer_Player_Option_WhiteInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `White Noise`
    );
  }
);
const ko_equalizer_player_option_white = (
  /** @type {(inputs: Equalizer_Player_Option_WhiteInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `화이트 노이즈`
    );
  }
);
const equalizer_player_option_white = (
  /** @type {((inputs?: Equalizer_Player_Option_WhiteInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Equalizer_Player_Option_WhiteInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_equalizer_player_option_white();
    return ko_equalizer_player_option_white();
  })
);
const en_equalizer_player_option_pink = (
  /** @type {(inputs: Equalizer_Player_Option_PinkInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Pink Noise`
    );
  }
);
const ko_equalizer_player_option_pink = (
  /** @type {(inputs: Equalizer_Player_Option_PinkInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `핑크 노이즈`
    );
  }
);
const equalizer_player_option_pink = (
  /** @type {((inputs?: Equalizer_Player_Option_PinkInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Equalizer_Player_Option_PinkInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_equalizer_player_option_pink();
    return ko_equalizer_player_option_pink();
  })
);
const en_equalizer_player_option_tone = (
  /** @type {(inputs: Equalizer_Player_Option_ToneInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Tone Generator`
    );
  }
);
const ko_equalizer_player_option_tone = (
  /** @type {(inputs: Equalizer_Player_Option_ToneInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `톤 제너레이터`
    );
  }
);
const equalizer_player_option_tone = (
  /** @type {((inputs?: Equalizer_Player_Option_ToneInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Equalizer_Player_Option_ToneInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_equalizer_player_option_tone();
    return ko_equalizer_player_option_tone();
  })
);
const en_equalizer_player_option_file = (
  /** @type {(inputs: Equalizer_Player_Option_FileInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Audio File`
    );
  }
);
const ko_equalizer_player_option_file = (
  /** @type {(inputs: Equalizer_Player_Option_FileInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `음악 파일`
    );
  }
);
const equalizer_player_option_file = (
  /** @type {((inputs?: Equalizer_Player_Option_FileInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Equalizer_Player_Option_FileInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_equalizer_player_option_file();
    return ko_equalizer_player_option_file();
  })
);
const en_equalizer_player_tone_freq_label = (
  /** @type {(inputs: Equalizer_Player_Tone_Freq_LabelInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Frequency: `
    );
  }
);
const ko_equalizer_player_tone_freq_label = (
  /** @type {(inputs: Equalizer_Player_Tone_Freq_LabelInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `주파수: `
    );
  }
);
const equalizer_player_tone_freq_label = (
  /** @type {((inputs?: Equalizer_Player_Tone_Freq_LabelInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Equalizer_Player_Tone_Freq_LabelInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_equalizer_player_tone_freq_label();
    return ko_equalizer_player_tone_freq_label();
  })
);
const en_equalizer_player_filter_toggle = (
  /** @type {(inputs: Equalizer_Player_Filter_ToggleInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `EQ Effect`
    );
  }
);
const ko_equalizer_player_filter_toggle = (
  /** @type {(inputs: Equalizer_Player_Filter_ToggleInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `EQ 효과`
    );
  }
);
const equalizer_player_filter_toggle = (
  /** @type {((inputs?: Equalizer_Player_Filter_ToggleInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Equalizer_Player_Filter_ToggleInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_equalizer_player_filter_toggle();
    return ko_equalizer_player_filter_toggle();
  })
);
const en_equalizer_player_spectrum_toggle = (
  /** @type {(inputs: Equalizer_Player_Spectrum_ToggleInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Spectrum`
    );
  }
);
const ko_equalizer_player_spectrum_toggle = (
  /** @type {(inputs: Equalizer_Player_Spectrum_ToggleInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `스펙트럼`
    );
  }
);
const equalizer_player_spectrum_toggle = (
  /** @type {((inputs?: Equalizer_Player_Spectrum_ToggleInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Equalizer_Player_Spectrum_ToggleInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_equalizer_player_spectrum_toggle();
    return ko_equalizer_player_spectrum_toggle();
  })
);
const en_equalizer_player_file_upload = (
  /** @type {(inputs: Equalizer_Player_File_UploadInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Upload Audio`
    );
  }
);
const ko_equalizer_player_file_upload = (
  /** @type {(inputs: Equalizer_Player_File_UploadInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `음악 파일 업로드`
    );
  }
);
const equalizer_player_file_upload = (
  /** @type {((inputs?: Equalizer_Player_File_UploadInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Equalizer_Player_File_UploadInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_equalizer_player_file_upload();
    return ko_equalizer_player_file_upload();
  })
);
const en_equalizer_device_peq_incompatible_browser_alert = (
  /** @type {(inputs: Equalizer_Device_Peq_Incompatible_Browser_AlertInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Your browser does not support the necessary APIs to connect to devices. Please use a compatible browser (e.g. Chrome or Edge) and ensure you have the required permissions enabled.`
    );
  }
);
const ko_equalizer_device_peq_incompatible_browser_alert = (
  /** @type {(inputs: Equalizer_Device_Peq_Incompatible_Browser_AlertInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `브라우저가 기기에 연결하는 데 필요한 API를 지원하지 않습니다. 호환 브라우저(예: Chrome 또는 Edge)를 사용하시고, 필요한 권한이 활성화되어 있는지 확인하세요.`
    );
  }
);
const equalizer_device_peq_incompatible_browser_alert = (
  /** @type {((inputs?: Equalizer_Device_Peq_Incompatible_Browser_AlertInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Equalizer_Device_Peq_Incompatible_Browser_AlertInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_equalizer_device_peq_incompatible_browser_alert();
    return ko_equalizer_device_peq_incompatible_browser_alert();
  })
);
const en_graph_uploader_upload_fr = (
  /** @type {(inputs: Graph_Uploader_Upload_FrInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Upload FR`
    );
  }
);
const ko_graph_uploader_upload_fr = (
  /** @type {(inputs: Graph_Uploader_Upload_FrInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `FR 업로드`
    );
  }
);
const graph_uploader_upload_fr = (
  /** @type {((inputs?: Graph_Uploader_Upload_FrInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Graph_Uploader_Upload_FrInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_graph_uploader_upload_fr();
    return ko_graph_uploader_upload_fr();
  })
);
const en_graph_uploader_upload_target = (
  /** @type {(inputs: Graph_Uploader_Upload_TargetInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Upload Target`
    );
  }
);
const ko_graph_uploader_upload_target = (
  /** @type {(inputs: Graph_Uploader_Upload_TargetInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `타겟 업로드`
    );
  }
);
const graph_uploader_upload_target = (
  /** @type {((inputs?: Graph_Uploader_Upload_TargetInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Graph_Uploader_Upload_TargetInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_graph_uploader_upload_target();
    return ko_graph_uploader_upload_target();
  })
);
const en_graph_controls_label = (
  /** @type {(inputs: Graph_Controls_LabelInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Graph Controls`
    );
  }
);
const ko_graph_controls_label = (
  /** @type {(inputs: Graph_Controls_LabelInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `그래프 도구`
    );
  }
);
const graph_controls_label = (
  /** @type {((inputs?: Graph_Controls_LabelInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Graph_Controls_LabelInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_graph_controls_label();
    return ko_graph_controls_label();
  })
);
const en_target_selector_label = (
  /** @type {(inputs: Target_Selector_LabelInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Target`
    );
  }
);
const ko_target_selector_label = (
  /** @type {(inputs: Target_Selector_LabelInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `타겟`
    );
  }
);
const target_selector_label = (
  /** @type {((inputs?: Target_Selector_LabelInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Target_Selector_LabelInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_target_selector_label();
    return ko_target_selector_label();
  })
);
const en_normalizer_input_hz_btn = (
  /** @type {(inputs: Normalizer_Input_Hz_BtnInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Hz`
    );
  }
);
const ko_normalizer_input_hz_btn = (
  /** @type {(inputs: Normalizer_Input_Hz_BtnInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Hz`
    );
  }
);
const normalizer_input_hz_btn = (
  /** @type {((inputs?: Normalizer_Input_Hz_BtnInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Normalizer_Input_Hz_BtnInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_normalizer_input_hz_btn();
    return ko_normalizer_input_hz_btn();
  })
);
const en_normalizer_input_avg_btn = (
  /** @type {(inputs: Normalizer_Input_Avg_BtnInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Avg.`
    );
  }
);
const ko_normalizer_input_avg_btn = (
  /** @type {(inputs: Normalizer_Input_Avg_BtnInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `평균`
    );
  }
);
const normalizer_input_avg_btn = (
  /** @type {((inputs?: Normalizer_Input_Avg_BtnInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Normalizer_Input_Avg_BtnInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_normalizer_input_avg_btn();
    return ko_normalizer_input_avg_btn();
  })
);
const en_smoothing_button_label = (
  /** @type {(inputs: Smoothing_Button_LabelInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Smoothing`
    );
  }
);
const ko_smoothing_button_label = (
  /** @type {(inputs: Smoothing_Button_LabelInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `스무딩`
    );
  }
);
const smoothing_button_label = (
  /** @type {((inputs?: Smoothing_Button_LabelInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Smoothing_Button_LabelInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_smoothing_button_label();
    return ko_smoothing_button_label();
  })
);
const en_screenshot_button_label = (
  /** @type {(inputs: Screenshot_Button_LabelInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Screenshot`
    );
  }
);
const ko_screenshot_button_label = (
  /** @type {(inputs: Screenshot_Button_LabelInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `스크린샷`
    );
  }
);
const screenshot_button_label = (
  /** @type {((inputs?: Screenshot_Button_LabelInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Screenshot_Button_LabelInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_screenshot_button_label();
    return ko_screenshot_button_label();
  })
);
const en_y_axis_scale_button_label = (
  /** @type {(inputs: Y_Axis_Scale_Button_LabelInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Y-Axis Scale`
    );
  }
);
const ko_y_axis_scale_button_label = (
  /** @type {(inputs: Y_Axis_Scale_Button_LabelInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Y축 스케일`
    );
  }
);
const y_axis_scale_button_label = (
  /** @type {((inputs?: Y_Axis_Scale_Button_LabelInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Y_Axis_Scale_Button_LabelInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_y_axis_scale_button_label();
    return ko_y_axis_scale_button_label();
  })
);
const en_inspection_toggle_label = (
  /** @type {(inputs: Inspection_Toggle_LabelInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Inspect`
    );
  }
);
const ko_inspection_toggle_label = (
  /** @type {(inputs: Inspection_Toggle_LabelInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `조사`
    );
  }
);
const inspection_toggle_label = (
  /** @type {((inputs?: Inspection_Toggle_LabelInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Inspection_Toggle_LabelInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_inspection_toggle_label();
    return ko_inspection_toggle_label();
  })
);
const en_share_button_label = (
  /** @type {(inputs: Share_Button_LabelInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Share`
    );
  }
);
const ko_share_button_label = (
  /** @type {(inputs: Share_Button_LabelInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `공유`
    );
  }
);
const share_button_label = (
  /** @type {((inputs?: Share_Button_LabelInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Share_Button_LabelInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_share_button_label();
    return ko_share_button_label();
  })
);
const en_share_button_on_click = (
  /** @type {(inputs: Share_Button_On_ClickInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Copied!`
    );
  }
);
const ko_share_button_on_click = (
  /** @type {(inputs: Share_Button_On_ClickInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `복사 완료!`
    );
  }
);
const share_button_on_click = (
  /** @type {((inputs?: Share_Button_On_ClickInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Share_Button_On_ClickInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_share_button_on_click();
    return ko_share_button_on_click();
  })
);
const en_tutorial_modal_btn_prev = (
  /** @type {(inputs: Tutorial_Modal_Btn_PrevInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Previous`
    );
  }
);
const ko_tutorial_modal_btn_prev = (
  /** @type {(inputs: Tutorial_Modal_Btn_PrevInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `이전`
    );
  }
);
const tutorial_modal_btn_prev = (
  /** @type {((inputs?: Tutorial_Modal_Btn_PrevInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Tutorial_Modal_Btn_PrevInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_tutorial_modal_btn_prev();
    return ko_tutorial_modal_btn_prev();
  })
);
const en_tutorial_modal_btn_next = (
  /** @type {(inputs: Tutorial_Modal_Btn_NextInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Next`
    );
  }
);
const ko_tutorial_modal_btn_next = (
  /** @type {(inputs: Tutorial_Modal_Btn_NextInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `다음`
    );
  }
);
const tutorial_modal_btn_next = (
  /** @type {((inputs?: Tutorial_Modal_Btn_NextInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Tutorial_Modal_Btn_NextInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_tutorial_modal_btn_next();
    return ko_tutorial_modal_btn_next();
  })
);
const en_tutorial_modal_btn_done = (
  /** @type {(inputs: Tutorial_Modal_Btn_DoneInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Done`
    );
  }
);
const ko_tutorial_modal_btn_done = (
  /** @type {(inputs: Tutorial_Modal_Btn_DoneInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `완료`
    );
  }
);
const tutorial_modal_btn_done = (
  /** @type {((inputs?: Tutorial_Modal_Btn_DoneInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Tutorial_Modal_Btn_DoneInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_tutorial_modal_btn_done();
    return ko_tutorial_modal_btn_done();
  })
);
const en_tutorial_modal_btn_skip = (
  /** @type {(inputs: Tutorial_Modal_Btn_SkipInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Skip`
    );
  }
);
const ko_tutorial_modal_btn_skip = (
  /** @type {(inputs: Tutorial_Modal_Btn_SkipInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `건너뛰기`
    );
  }
);
const tutorial_modal_btn_skip = (
  /** @type {((inputs?: Tutorial_Modal_Btn_SkipInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Tutorial_Modal_Btn_SkipInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_tutorial_modal_btn_skip();
    return ko_tutorial_modal_btn_skip();
  })
);
const en_tutorial_modal_intro_title = (
  /** @type {(inputs: Tutorial_Modal_Intro_TitleInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Welcome to modernGraphTool`
    );
  }
);
const ko_tutorial_modal_intro_title = (
  /** @type {(inputs: Tutorial_Modal_Intro_TitleInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Welcome to modernGraphTool`
    );
  }
);
const tutorial_modal_intro_title = (
  /** @type {((inputs?: Tutorial_Modal_Intro_TitleInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Tutorial_Modal_Intro_TitleInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_tutorial_modal_intro_title();
    return ko_tutorial_modal_intro_title();
  })
);
const en_tutorial_modal_intro_content = (
  /** @type {(inputs: Tutorial_Modal_Intro_ContentInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `A completely re-engineered, graph-sniffing experience.`
    );
  }
);
const ko_tutorial_modal_intro_content = (
  /** @type {(inputs: Tutorial_Modal_Intro_ContentInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `A completely re-engineered, graph-sniffing experience.`
    );
  }
);
const tutorial_modal_intro_content = (
  /** @type {((inputs?: Tutorial_Modal_Intro_ContentInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Tutorial_Modal_Intro_ContentInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_tutorial_modal_intro_content();
    return ko_tutorial_modal_intro_content();
  })
);
const en_tutorial_modal_menu_content = (
  /** @type {(inputs: Tutorial_Modal_Menu_ContentInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `You can slide the menu to the left or right to access the variety of tools.`
    );
  }
);
const ko_tutorial_modal_menu_content = (
  /** @type {(inputs: Tutorial_Modal_Menu_ContentInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `하단의 메뉴를 좌우로 움직여, 다양한 도구에 접근할 수 있습니다.`
    );
  }
);
const tutorial_modal_menu_content = (
  /** @type {((inputs?: Tutorial_Modal_Menu_ContentInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Tutorial_Modal_Menu_ContentInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_tutorial_modal_menu_content();
    return ko_tutorial_modal_menu_content();
  })
);
const en_tutorial_modal_graph_handle_content = (
  /** @type {(inputs: Tutorial_Modal_Graph_Handle_ContentInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `You can drag this handle to shift graph vertically. Double click to reset position.`
    );
  }
);
const ko_tutorial_modal_graph_handle_content = (
  /** @type {(inputs: Tutorial_Modal_Graph_Handle_ContentInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `원 모양의 핸들을 드래그하여 그래프를 수직으로 움직일 수 있습니다. 위치를 재설정하려면 두 번 클릭하세요.`
    );
  }
);
const tutorial_modal_graph_handle_content = (
  /** @type {((inputs?: Tutorial_Modal_Graph_Handle_ContentInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Tutorial_Modal_Graph_Handle_ContentInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_tutorial_modal_graph_handle_content();
    return ko_tutorial_modal_graph_handle_content();
  })
);
const en_tutorial_modal_divider_content = (
  /** @type {(inputs: Tutorial_Modal_Divider_ContentInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `You can drag this divider to change the size of the graph.`
    );
  }
);
const ko_tutorial_modal_divider_content = (
  /** @type {(inputs: Tutorial_Modal_Divider_ContentInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `구분선을 좌우로 움직여, 그래프 영역의 크기를 조절할 수 있습니다.`
    );
  }
);
const tutorial_modal_divider_content = (
  /** @type {((inputs?: Tutorial_Modal_Divider_ContentInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Tutorial_Modal_Divider_ContentInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_tutorial_modal_divider_content();
    return ko_tutorial_modal_divider_content();
  })
);
const en_tutorial_modal_shortcuts_content = (
  /** @type {(inputs: Tutorial_Modal_Shortcuts_ContentInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Use keyboard shortcuts to speed up your workflow. You can find the list of shortcuts at the bottom left corner.`
    );
  }
);
const ko_tutorial_modal_shortcuts_content = (
  /** @type {(inputs: Tutorial_Modal_Shortcuts_ContentInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `키보드 단축키를 사용하여 작업 속도를 높이세요. 단축키 목록은 좌측 하단에서 확인할 수 있습니다.`
    );
  }
);
const tutorial_modal_shortcuts_content = (
  /** @type {((inputs?: Tutorial_Modal_Shortcuts_ContentInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Tutorial_Modal_Shortcuts_ContentInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_tutorial_modal_shortcuts_content();
    return ko_tutorial_modal_shortcuts_content();
  })
);
const en_tutorial_modal_pwa_title = (
  /** @type {(inputs: Tutorial_Modal_Pwa_TitleInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Use as App (PWA)`
    );
  }
);
const ko_tutorial_modal_pwa_title = (
  /** @type {(inputs: Tutorial_Modal_Pwa_TitleInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `앱으로 사용하기 (PWA)`
    );
  }
);
const tutorial_modal_pwa_title = (
  /** @type {((inputs?: Tutorial_Modal_Pwa_TitleInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Tutorial_Modal_Pwa_TitleInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_tutorial_modal_pwa_title();
    return ko_tutorial_modal_pwa_title();
  })
);
const en_tutorial_modal_pwa_content = (
  /** @type {(inputs: Tutorial_Modal_Pwa_ContentInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `modernGraphTool is built as a progressive web app (PWA). You can install it to your device for full-app experience.`
    );
  }
);
const ko_tutorial_modal_pwa_content = (
  /** @type {(inputs: Tutorial_Modal_Pwa_ContentInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `modernGraphTool은 progressive web app (PWA)으로 설계되었습니다. 완전한 애플리케이션과 같은 경험을 위해 기기에 설치해서 사용하실 수 있습니다.`
    );
  }
);
const tutorial_modal_pwa_content = (
  /** @type {((inputs?: Tutorial_Modal_Pwa_ContentInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Tutorial_Modal_Pwa_ContentInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_tutorial_modal_pwa_content();
    return ko_tutorial_modal_pwa_content();
  })
);
const en_tutorial_modal_pwa_inst_ios = (
  /** @type {(inputs: Tutorial_Modal_Pwa_Inst_IosInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `On Safari: Tap the Share button, then select 'Add to Home Screen'.`
    );
  }
);
const ko_tutorial_modal_pwa_inst_ios = (
  /** @type {(inputs: Tutorial_Modal_Pwa_Inst_IosInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Safari에서 공유 버튼을 누른 뒤, '홈 화면에 추가' 항목을 선택하세요.`
    );
  }
);
const tutorial_modal_pwa_inst_ios = (
  /** @type {((inputs?: Tutorial_Modal_Pwa_Inst_IosInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Tutorial_Modal_Pwa_Inst_IosInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_tutorial_modal_pwa_inst_ios();
    return ko_tutorial_modal_pwa_inst_ios();
  })
);
const en_tutorial_modal_pwa_inst_android = (
  /** @type {(inputs: Tutorial_Modal_Pwa_Inst_AndroidInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `On Chrome: Tap the menu button (three dots), then select 'Install app' or 'Add to Home screen'.`
    );
  }
);
const ko_tutorial_modal_pwa_inst_android = (
  /** @type {(inputs: Tutorial_Modal_Pwa_Inst_AndroidInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Chrome에서 메뉴 버튼 (점 3개)를 선택한 뒤, '앱 설치' 또는 '홈 화면에 추가' 항목을 선택하세요.`
    );
  }
);
const tutorial_modal_pwa_inst_android = (
  /** @type {((inputs?: Tutorial_Modal_Pwa_Inst_AndroidInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Tutorial_Modal_Pwa_Inst_AndroidInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_tutorial_modal_pwa_inst_android();
    return ko_tutorial_modal_pwa_inst_android();
  })
);
const en_graph_color_wheel_label_hue = (
  /** @type {(inputs: Graph_Color_Wheel_Label_HueInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `H`
    );
  }
);
const ko_graph_color_wheel_label_hue = (
  /** @type {(inputs: Graph_Color_Wheel_Label_HueInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `색상`
    );
  }
);
const graph_color_wheel_label_hue = (
  /** @type {((inputs?: Graph_Color_Wheel_Label_HueInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Graph_Color_Wheel_Label_HueInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_graph_color_wheel_label_hue();
    return ko_graph_color_wheel_label_hue();
  })
);
const en_graph_color_wheel_label_saturation = (
  /** @type {(inputs: Graph_Color_Wheel_Label_SaturationInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `S`
    );
  }
);
const ko_graph_color_wheel_label_saturation = (
  /** @type {(inputs: Graph_Color_Wheel_Label_SaturationInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `채도`
    );
  }
);
const graph_color_wheel_label_saturation = (
  /** @type {((inputs?: Graph_Color_Wheel_Label_SaturationInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Graph_Color_Wheel_Label_SaturationInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_graph_color_wheel_label_saturation();
    return ko_graph_color_wheel_label_saturation();
  })
);
const en_graph_color_wheel_label_lightness = (
  /** @type {(inputs: Graph_Color_Wheel_Label_LightnessInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `L`
    );
  }
);
const ko_graph_color_wheel_label_lightness = (
  /** @type {(inputs: Graph_Color_Wheel_Label_LightnessInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `명도`
    );
  }
);
const graph_color_wheel_label_lightness = (
  /** @type {((inputs?: Graph_Color_Wheel_Label_LightnessInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Graph_Color_Wheel_Label_LightnessInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_graph_color_wheel_label_lightness();
    return ko_graph_color_wheel_label_lightness();
  })
);
const en_graph_color_wheel_label_tick = (
  /** @type {(inputs: Graph_Color_Wheel_Label_TickInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Tick`
    );
  }
);
const ko_graph_color_wheel_label_tick = (
  /** @type {(inputs: Graph_Color_Wheel_Label_TickInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `선 길이`
    );
  }
);
const graph_color_wheel_label_tick = (
  /** @type {((inputs?: Graph_Color_Wheel_Label_TickInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Graph_Color_Wheel_Label_TickInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_graph_color_wheel_label_tick();
    return ko_graph_color_wheel_label_tick();
  })
);
const en_graph_color_wheel_label_space = (
  /** @type {(inputs: Graph_Color_Wheel_Label_SpaceInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Space`
    );
  }
);
const ko_graph_color_wheel_label_space = (
  /** @type {(inputs: Graph_Color_Wheel_Label_SpaceInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `간격`
    );
  }
);
const graph_color_wheel_label_space = (
  /** @type {((inputs?: Graph_Color_Wheel_Label_SpaceInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Graph_Color_Wheel_Label_SpaceInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_graph_color_wheel_label_space();
    return ko_graph_color_wheel_label_space();
  })
);
const en_graph_color_wheel_btn_random = (
  /** @type {(inputs: Graph_Color_Wheel_Btn_RandomInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Random`
    );
  }
);
const ko_graph_color_wheel_btn_random = (
  /** @type {(inputs: Graph_Color_Wheel_Btn_RandomInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `랜덤`
    );
  }
);
const graph_color_wheel_btn_random = (
  /** @type {((inputs?: Graph_Color_Wheel_Btn_RandomInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Graph_Color_Wheel_Btn_RandomInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_graph_color_wheel_btn_random();
    return ko_graph_color_wheel_btn_random();
  })
);
const en_graph_color_wheel_btn_close = (
  /** @type {(inputs: Graph_Color_Wheel_Btn_CloseInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Close`
    );
  }
);
const ko_graph_color_wheel_btn_close = (
  /** @type {(inputs: Graph_Color_Wheel_Btn_CloseInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `닫기`
    );
  }
);
const graph_color_wheel_btn_close = (
  /** @type {((inputs?: Graph_Color_Wheel_Btn_CloseInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Graph_Color_Wheel_Btn_CloseInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_graph_color_wheel_btn_close();
    return ko_graph_color_wheel_btn_close();
  })
);
const en_tutorial_freq_sub_bass_name = (
  /** @type {(inputs: Tutorial_Freq_Sub_Bass_NameInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Sub Bass`
    );
  }
);
const ko_tutorial_freq_sub_bass_name = (
  /** @type {(inputs: Tutorial_Freq_Sub_Bass_NameInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `극저음`
    );
  }
);
const tutorial_freq_sub_bass_name = (
  /** @type {((inputs?: Tutorial_Freq_Sub_Bass_NameInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Tutorial_Freq_Sub_Bass_NameInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_tutorial_freq_sub_bass_name();
    return ko_tutorial_freq_sub_bass_name();
  })
);
const en_tutorial_freq_sub_bass_desc = (
  /** @type {(inputs: Tutorial_Freq_Sub_Bass_DescInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `The Rumble, usually out of human's hearing range and tend to be felt more than heard, providing a sense of power.`
    );
  }
);
const ko_tutorial_freq_sub_bass_desc = (
  /** @type {(inputs: Tutorial_Freq_Sub_Bass_DescInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `극저음은 '들을 수 있다'기보다는 '느낄 수 있는' 사운드에 가깝습니다. 주로 소리의 깊이감과 힘을 더해주며, 해당 음역이 과도하게 강조될 경우 소리가 지나치게 강해질 수 있습니다.`
    );
  }
);
const tutorial_freq_sub_bass_desc = (
  /** @type {((inputs?: Tutorial_Freq_Sub_Bass_DescInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Tutorial_Freq_Sub_Bass_DescInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_tutorial_freq_sub_bass_desc();
    return ko_tutorial_freq_sub_bass_desc();
  })
);
const en_tutorial_freq_bass_name = (
  /** @type {(inputs: Tutorial_Freq_Bass_NameInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Bass`
    );
  }
);
const ko_tutorial_freq_bass_name = (
  /** @type {(inputs: Tutorial_Freq_Bass_NameInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `저음`
    );
  }
);
const tutorial_freq_bass_name = (
  /** @type {((inputs?: Tutorial_Freq_Bass_NameInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Tutorial_Freq_Bass_NameInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_tutorial_freq_bass_name();
    return ko_tutorial_freq_bass_name();
  })
);
const en_tutorial_freq_bass_desc = (
  /** @type {(inputs: Tutorial_Freq_Bass_DescInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Determines how 'fat' or 'thin' the sound is. Boosting around 250 Hz tends to add warmth. If you're a bass head you most likely like this range.`
    );
  }
);
const ko_tutorial_freq_bass_desc = (
  /** @type {(inputs: Tutorial_Freq_Bass_DescInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `저음은 전반적인 리듬을 형성하는데 기본이 되는 음역대입니다. 주로 음악의 타격감과 따뜻한 느낌을 제공하며, 해당 음역이 과도하게 강조될 경우 저음이 벙벙거리며 소리가 지저분해질 수 있습니다.`
    );
  }
);
const tutorial_freq_bass_desc = (
  /** @type {((inputs?: Tutorial_Freq_Bass_DescInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Tutorial_Freq_Bass_DescInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_tutorial_freq_bass_desc();
    return ko_tutorial_freq_bass_desc();
  })
);
const en_tutorial_freq_lower_mids_name = (
  /** @type {(inputs: Tutorial_Freq_Lower_Mids_NameInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Lower Mids`
    );
  }
);
const ko_tutorial_freq_lower_mids_name = (
  /** @type {(inputs: Tutorial_Freq_Lower_Mids_NameInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `중저음`
    );
  }
);
const tutorial_freq_lower_mids_name = (
  /** @type {((inputs?: Tutorial_Freq_Lower_Mids_NameInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Tutorial_Freq_Lower_Mids_NameInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_tutorial_freq_lower_mids_name();
    return ko_tutorial_freq_lower_mids_name();
  })
);
const en_tutorial_freq_lower_mids_desc = (
  /** @type {(inputs: Tutorial_Freq_Lower_Mids_DescInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Low order harmonics of most instruments, generally viewed as the bass presence range. Boosting around 300 Hz adds clarity to the bass. Too much around 500 Hz can make higher-frequency instruments sound muffled.`
    );
  }
);
const ko_tutorial_freq_lower_mids_desc = (
  /** @type {(inputs: Tutorial_Freq_Lower_Mids_DescInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `중저음에는 대부분의 악기가 가진 기본음 성분이 포함되어 있습니다. 대체로 저음역대의 존재감을 가진 음역대로 인식되며, 과도하게 강조될 경우 소리가 탁하게 들릴 수 있습니다.`
    );
  }
);
const tutorial_freq_lower_mids_desc = (
  /** @type {((inputs?: Tutorial_Freq_Lower_Mids_DescInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Tutorial_Freq_Lower_Mids_DescInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_tutorial_freq_lower_mids_desc();
    return ko_tutorial_freq_lower_mids_desc();
  })
);
const en_tutorial_freq_upper_mids_name = (
  /** @type {(inputs: Tutorial_Freq_Upper_Mids_NameInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Upper Mids`
    );
  }
);
const ko_tutorial_freq_upper_mids_name = (
  /** @type {(inputs: Tutorial_Freq_Upper_Mids_NameInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `중고음`
    );
  }
);
const tutorial_freq_upper_mids_name = (
  /** @type {((inputs?: Tutorial_Freq_Upper_Mids_NameInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Tutorial_Freq_Upper_Mids_NameInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_tutorial_freq_upper_mids_name();
    return ko_tutorial_freq_upper_mids_name();
  })
);
const en_tutorial_freq_upper_mids_desc = (
  /** @type {(inputs: Tutorial_Freq_Upper_Mids_DescInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `The high midrange is responsible for the attack on percussive and rhythm instruments. Boosting this range can add presence. However, too much around 3 kHz can cause listening fatigue.`
    );
  }
);
const ko_tutorial_freq_upper_mids_desc = (
  /** @type {(inputs: Tutorial_Freq_Upper_Mids_DescInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `중고음은 주로 타악기 및 리듬 악기의 타격감과 연관되어 있습니다. 해당 음역대는 소리에 선명한 느낌을 더해주지만, 이것이 지나칠 경우 자극적인 소리가 될 수 있습니다.`
    );
  }
);
const tutorial_freq_upper_mids_desc = (
  /** @type {((inputs?: Tutorial_Freq_Upper_Mids_DescInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Tutorial_Freq_Upper_Mids_DescInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_tutorial_freq_upper_mids_desc();
    return ko_tutorial_freq_upper_mids_desc();
  })
);
const en_tutorial_freq_presence_name = (
  /** @type {(inputs: Tutorial_Freq_Presence_NameInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Presence`
    );
  }
);
const ko_tutorial_freq_presence_name = (
  /** @type {(inputs: Tutorial_Freq_Presence_NameInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `고음`
    );
  }
);
const tutorial_freq_presence_name = (
  /** @type {((inputs?: Tutorial_Freq_Presence_NameInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Tutorial_Freq_Presence_NameInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_tutorial_freq_presence_name();
    return ko_tutorial_freq_presence_name();
  })
);
const en_tutorial_freq_presence_desc = (
  /** @type {(inputs: Tutorial_Freq_Presence_DescInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `The presence range is responsible for the clarity and definition of a sound. Over-boosting can cause an irritating, harsh sound. Cutting here makes the sound more distant and transparent.`
    );
  }
);
const ko_tutorial_freq_presence_desc = (
  /** @type {(inputs: Tutorial_Freq_Presence_DescInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `고음은 소리의 디테일과 선명함을 결정짓습니다. 지나치게 강조될 경우 자극적인 소리가 될 수 있지만, 너무 약하게 하면 소리가 멀어진듯한 느낌을 받을 수 있습니다.`
    );
  }
);
const tutorial_freq_presence_desc = (
  /** @type {((inputs?: Tutorial_Freq_Presence_DescInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Tutorial_Freq_Presence_DescInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_tutorial_freq_presence_desc();
    return ko_tutorial_freq_presence_desc();
  })
);
const en_tutorial_freq_brilliance_name = (
  /** @type {(inputs: Tutorial_Freq_Brilliance_NameInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Brilliance`
    );
  }
);
const ko_tutorial_freq_brilliance_name = (
  /** @type {(inputs: Tutorial_Freq_Brilliance_NameInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `초고음`
    );
  }
);
const tutorial_freq_brilliance_name = (
  /** @type {((inputs?: Tutorial_Freq_Brilliance_NameInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Tutorial_Freq_Brilliance_NameInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_tutorial_freq_brilliance_name();
    return ko_tutorial_freq_brilliance_name();
  })
);
const en_tutorial_freq_brilliance_desc = (
  /** @type {(inputs: Tutorial_Freq_Brilliance_DescInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `The brilliance range is composed entirely of harmonics and is responsible for sparkle and air of a sound. Over-boosting can accentuate hiss and cause ear fatigue.`
    );
  }
);
const ko_tutorial_freq_brilliance_desc = (
  /** @type {(inputs: Tutorial_Freq_Brilliance_DescInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `초고음은 소리의 반짝임과 '에어리한' 느낌을 부여합니다. 지나친 초고역 강조는 쇳 소리를 강조하고 피로감을 유발할 수 있습니다.`
    );
  }
);
const tutorial_freq_brilliance_desc = (
  /** @type {((inputs?: Tutorial_Freq_Brilliance_DescInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Tutorial_Freq_Brilliance_DescInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_tutorial_freq_brilliance_desc();
    return ko_tutorial_freq_brilliance_desc();
  })
);
const en_pref_bound_btn_label = (
  /** @type {(inputs: Pref_Bound_Btn_LabelInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Pref. Bound`
    );
  }
);
const ko_pref_bound_btn_label = (
  /** @type {(inputs: Pref_Bound_Btn_LabelInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `선호도 범위`
    );
  }
);
const pref_bound_btn_label = (
  /** @type {((inputs?: Pref_Bound_Btn_LabelInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Pref_Bound_Btn_LabelInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_pref_bound_btn_label();
    return ko_pref_bound_btn_label();
  })
);
const en_pref_bound_description_label = (
  /** @type {(inputs: Pref_Bound_Description_LabelInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Preference Bound based on`
    );
  }
);
const ko_pref_bound_description_label = (
  /** @type {(inputs: Pref_Bound_Description_LabelInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `선호도 범위 기준`
    );
  }
);
const pref_bound_description_label = (
  /** @type {((inputs?: Pref_Bound_Description_LabelInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Pref_Bound_Description_LabelInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_pref_bound_description_label();
    return ko_pref_bound_description_label();
  })
);
const en_target_customizer_btn_view = (
  /** @type {(inputs: Target_Customizer_Btn_ViewInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Pref. Adjustment`
    );
  }
);
const ko_target_customizer_btn_view = (
  /** @type {(inputs: Target_Customizer_Btn_ViewInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `선호도 조정`
    );
  }
);
const target_customizer_btn_view = (
  /** @type {((inputs?: Target_Customizer_Btn_ViewInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Target_Customizer_Btn_ViewInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_target_customizer_btn_view();
    return ko_target_customizer_btn_view();
  })
);
const en_target_customizer_btn_reset = (
  /** @type {(inputs: Target_Customizer_Btn_ResetInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Reset`
    );
  }
);
const ko_target_customizer_btn_reset = (
  /** @type {(inputs: Target_Customizer_Btn_ResetInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `초기화`
    );
  }
);
const target_customizer_btn_reset = (
  /** @type {((inputs?: Target_Customizer_Btn_ResetInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Target_Customizer_Btn_ResetInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_target_customizer_btn_reset();
    return ko_target_customizer_btn_reset();
  })
);
const en_target_customizer_label_tilt = (
  /** @type {(inputs: Target_Customizer_Label_TiltInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Tilt (dB/oct)`
    );
  }
);
const ko_target_customizer_label_tilt = (
  /** @type {(inputs: Target_Customizer_Label_TiltInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `틸트 (dB/oct)`
    );
  }
);
const target_customizer_label_tilt = (
  /** @type {((inputs?: Target_Customizer_Label_TiltInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Target_Customizer_Label_TiltInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_target_customizer_label_tilt();
    return ko_target_customizer_label_tilt();
  })
);
const en_target_customizer_label_bass = (
  /** @type {(inputs: Target_Customizer_Label_BassInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Bass (dB)`
    );
  }
);
const ko_target_customizer_label_bass = (
  /** @type {(inputs: Target_Customizer_Label_BassInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `저음 (dB)`
    );
  }
);
const target_customizer_label_bass = (
  /** @type {((inputs?: Target_Customizer_Label_BassInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Target_Customizer_Label_BassInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_target_customizer_label_bass();
    return ko_target_customizer_label_bass();
  })
);
const en_target_customizer_label_treble = (
  /** @type {(inputs: Target_Customizer_Label_TrebleInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Treble (dB)`
    );
  }
);
const ko_target_customizer_label_treble = (
  /** @type {(inputs: Target_Customizer_Label_TrebleInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `고음 (dB)`
    );
  }
);
const target_customizer_label_treble = (
  /** @type {((inputs?: Target_Customizer_Label_TrebleInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Target_Customizer_Label_TrebleInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_target_customizer_label_treble();
    return ko_target_customizer_label_treble();
  })
);
const en_target_customizer_label_ear = (
  /** @type {(inputs: Target_Customizer_Label_EarInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Ear (dB)`
    );
  }
);
const ko_target_customizer_label_ear = (
  /** @type {(inputs: Target_Customizer_Label_EarInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `이어 (dB)`
    );
  }
);
const target_customizer_label_ear = (
  /** @type {((inputs?: Target_Customizer_Label_EarInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Target_Customizer_Label_EarInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_target_customizer_label_ear();
    return ko_target_customizer_label_ear();
  })
);
const en_target_customizer_label_pssr = (
  /** @type {(inputs: Target_Customizer_Label_PssrInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `PSSR (dB)`
    );
  }
);
const ko_target_customizer_label_pssr = (
  /** @type {(inputs: Target_Customizer_Label_PssrInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `PSSR (dB)`
    );
  }
);
const target_customizer_label_pssr = (
  /** @type {((inputs?: Target_Customizer_Label_PssrInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Target_Customizer_Label_PssrInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_target_customizer_label_pssr();
    return ko_target_customizer_label_pssr();
  })
);
const en_target_customizer_add_filter = (
  /** @type {(inputs: Target_Customizer_Add_FilterInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Add Filter`
    );
  }
);
const ko_target_customizer_add_filter = (
  /** @type {(inputs: Target_Customizer_Add_FilterInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `필터 추가`
    );
  }
);
const target_customizer_add_filter = (
  /** @type {((inputs?: Target_Customizer_Add_FilterInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Target_Customizer_Add_FilterInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_target_customizer_add_filter();
    return ko_target_customizer_add_filter();
  })
);
const en_target_customizer_preset = (
  /** @type {(inputs: Target_Customizer_PresetInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Preset`
    );
  }
);
const ko_target_customizer_preset = (
  /** @type {(inputs: Target_Customizer_PresetInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `프리셋`
    );
  }
);
const target_customizer_preset = (
  /** @type {((inputs?: Target_Customizer_PresetInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Target_Customizer_PresetInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_target_customizer_preset();
    return ko_target_customizer_preset();
  })
);
const en_target_customizer_no_filters = (
  /** @type {(inputs: Target_Customizer_No_FiltersInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `No filters active`
    );
  }
);
const ko_target_customizer_no_filters = (
  /** @type {(inputs: Target_Customizer_No_FiltersInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `활성화된 필터 없음`
    );
  }
);
const target_customizer_no_filters = (
  /** @type {((inputs?: Target_Customizer_No_FiltersInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Target_Customizer_No_FiltersInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_target_customizer_no_filters();
    return ko_target_customizer_no_filters();
  })
);
const en_sponsor_banner_dismiss = (
  /** @type {(inputs: Sponsor_Banner_DismissInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Close`
    );
  }
);
const ko_sponsor_banner_dismiss = (
  /** @type {(inputs: Sponsor_Banner_DismissInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `닫기`
    );
  }
);
const sponsor_banner_dismiss = (
  /** @type {((inputs?: Sponsor_Banner_DismissInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Sponsor_Banner_DismissInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_sponsor_banner_dismiss();
    return ko_sponsor_banner_dismiss();
  })
);
const en_shoplink_buy_now = (
  /** @type {(inputs: Shoplink_Buy_NowInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Buy Now`
    );
  }
);
const ko_shoplink_buy_now = (
  /** @type {(inputs: Shoplink_Buy_NowInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `구매하기`
    );
  }
);
const shoplink_buy_now = (
  /** @type {((inputs?: Shoplink_Buy_NowInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Shoplink_Buy_NowInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_shoplink_buy_now();
    return ko_shoplink_buy_now();
  })
);
const en_selection_list_baseline_off = (
  /** @type {(inputs: Selection_List_Baseline_OffInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Set as baseline`
    );
  }
);
const ko_selection_list_baseline_off = (
  /** @type {(inputs: Selection_List_Baseline_OffInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `기준선으로 설정`
    );
  }
);
const selection_list_baseline_off = (
  /** @type {((inputs?: Selection_List_Baseline_OffInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Selection_List_Baseline_OffInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_selection_list_baseline_off();
    return ko_selection_list_baseline_off();
  })
);
const en_selection_list_baseline_without_adjustment = (
  /** @type {(inputs: Selection_List_Baseline_Without_AdjustmentInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Compensated`
    );
  }
);
const ko_selection_list_baseline_without_adjustment = (
  /** @type {(inputs: Selection_List_Baseline_Without_AdjustmentInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `보정됨`
    );
  }
);
const selection_list_baseline_without_adjustment = (
  /** @type {((inputs?: Selection_List_Baseline_Without_AdjustmentInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Selection_List_Baseline_Without_AdjustmentInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_selection_list_baseline_without_adjustment();
    return ko_selection_list_baseline_without_adjustment();
  })
);
const en_selection_list_baseline_with_adjustment = (
  /** @type {(inputs: Selection_List_Baseline_With_AdjustmentInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Compensated (with adjustment)`
    );
  }
);
const ko_selection_list_baseline_with_adjustment = (
  /** @type {(inputs: Selection_List_Baseline_With_AdjustmentInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `보정됨 (조정 적용)`
    );
  }
);
const selection_list_baseline_with_adjustment = (
  /** @type {((inputs?: Selection_List_Baseline_With_AdjustmentInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Selection_List_Baseline_With_AdjustmentInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_selection_list_baseline_with_adjustment();
    return ko_selection_list_baseline_with_adjustment();
  })
);
const en_keyboard_shortcut_undo = (
  /** @type {(inputs: Keyboard_Shortcut_UndoInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Undo`
    );
  }
);
const ko_keyboard_shortcut_undo = (
  /** @type {(inputs: Keyboard_Shortcut_UndoInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `실행 취소`
    );
  }
);
const keyboard_shortcut_undo = (
  /** @type {((inputs?: Keyboard_Shortcut_UndoInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Keyboard_Shortcut_UndoInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_keyboard_shortcut_undo();
    return ko_keyboard_shortcut_undo();
  })
);
const en_keyboard_shortcut_redo = (
  /** @type {(inputs: Keyboard_Shortcut_RedoInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Redo`
    );
  }
);
const ko_keyboard_shortcut_redo = (
  /** @type {(inputs: Keyboard_Shortcut_RedoInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `다시 실행`
    );
  }
);
const keyboard_shortcut_redo = (
  /** @type {((inputs?: Keyboard_Shortcut_RedoInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Keyboard_Shortcut_RedoInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_keyboard_shortcut_redo();
    return ko_keyboard_shortcut_redo();
  })
);
const en_keyboard_shortcut_panels = (
  /** @type {(inputs: Keyboard_Shortcut_PanelsInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Switch Panels`
    );
  }
);
const ko_keyboard_shortcut_panels = (
  /** @type {(inputs: Keyboard_Shortcut_PanelsInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `패널 전환`
    );
  }
);
const keyboard_shortcut_panels = (
  /** @type {((inputs?: Keyboard_Shortcut_PanelsInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Keyboard_Shortcut_PanelsInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_keyboard_shortcut_panels();
    return ko_keyboard_shortcut_panels();
  })
);
const en_keyboard_shortcut_axis_lock = (
  /** @type {(inputs: Keyboard_Shortcut_Axis_LockInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `Lock Axis (EQ drag)`
    );
  }
);
const ko_keyboard_shortcut_axis_lock = (
  /** @type {(inputs: Keyboard_Shortcut_Axis_LockInputs) => LocalizedString} */
  () => {
    return (
      /** @type {LocalizedString} */
      `이동 방향 고정 (EQ 드래그)`
    );
  }
);
const keyboard_shortcut_axis_lock = (
  /** @type {((inputs?: Keyboard_Shortcut_Axis_LockInputs, options?: { locale?: "en" | "ko" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Keyboard_Shortcut_Axis_LockInputs, { locale?: "en" | "ko" }, {}>} */
  ((inputs = {}, options = {}) => {
    const locale = options.locale ?? getLocale();
    if (locale === "en") return en_keyboard_shortcut_axis_lock();
    return ko_keyboard_shortcut_axis_lock();
  })
);
function isFunction$1(value) {
  return typeof value === "function";
}
function isObject(value) {
  return value !== null && typeof value === "object";
}
const CLASS_VALUE_PRIMITIVE_TYPES = ["string", "number", "bigint", "boolean"];
function isClassValue(value) {
  if (value === null || value === void 0)
    return true;
  if (CLASS_VALUE_PRIMITIVE_TYPES.includes(typeof value))
    return true;
  if (Array.isArray(value))
    return value.every((item) => isClassValue(item));
  if (typeof value === "object") {
    if (Object.getPrototypeOf(value) !== Object.prototype)
      return false;
    return true;
  }
  return false;
}
const BoxSymbol = /* @__PURE__ */ Symbol("box");
const isWritableSymbol = /* @__PURE__ */ Symbol("is-writable");
function boxWith(getter, setter) {
  const derived$1 = derived(getter);
  if (setter) {
    return {
      [BoxSymbol]: true,
      [isWritableSymbol]: true,
      get current() {
        return derived$1();
      },
      set current(v) {
        setter(v);
      }
    };
  }
  return {
    [BoxSymbol]: true,
    get current() {
      return getter();
    }
  };
}
function isBox(value) {
  return isObject(value) && BoxSymbol in value;
}
function isWritableBox(value) {
  return isBox(value) && isWritableSymbol in value;
}
function boxFrom(value) {
  if (isBox(value)) return value;
  if (isFunction$1(value)) return boxWith(value);
  return simpleBox(value);
}
function boxFlatten(boxes) {
  return Object.entries(boxes).reduce(
    (acc, [key, b]) => {
      if (!isBox(b)) {
        return Object.assign(acc, { [key]: b });
      }
      if (isWritableBox(b)) {
        Object.defineProperty(acc, key, {
          get() {
            return b.current;
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          set(v) {
            b.current = v;
          }
        });
      } else {
        Object.defineProperty(acc, key, {
          get() {
            return b.current;
          }
        });
      }
      return acc;
    },
    {}
  );
}
function toReadonlyBox(b) {
  if (!isWritableBox(b)) return b;
  return {
    [BoxSymbol]: true,
    get current() {
      return b.current;
    }
  };
}
function simpleBox(initialValue) {
  let current = initialValue;
  return {
    [BoxSymbol]: true,
    [isWritableSymbol]: true,
    get current() {
      return current;
    },
    set current(v) {
      current = v;
    }
  };
}
function box(initialValue) {
  let current = initialValue;
  return {
    [BoxSymbol]: true,
    [isWritableSymbol]: true,
    get current() {
      return current;
    },
    set current(v) {
      current = v;
    }
  };
}
box.from = boxFrom;
box.with = boxWith;
box.flatten = boxFlatten;
box.readonly = toReadonlyBox;
box.isBox = isBox;
box.isWritableBox = isWritableBox;
function composeHandlers(...handlers) {
  return function(e) {
    for (const handler of handlers) {
      if (!handler)
        continue;
      if (e.defaultPrevented)
        return;
      if (typeof handler === "function") {
        handler.call(this, e);
      } else {
        handler.current?.call(this, e);
      }
    }
  };
}
const NUMBER_CHAR_RE = /\d/;
const STR_SPLITTERS = ["-", "_", "/", "."];
function isUppercase(char = "") {
  if (NUMBER_CHAR_RE.test(char))
    return void 0;
  return char !== char.toLowerCase();
}
function splitByCase(str) {
  const parts = [];
  let buff = "";
  let previousUpper;
  let previousSplitter;
  for (const char of str) {
    const isSplitter = STR_SPLITTERS.includes(char);
    if (isSplitter === true) {
      parts.push(buff);
      buff = "";
      previousUpper = void 0;
      continue;
    }
    const isUpper = isUppercase(char);
    if (previousSplitter === false) {
      if (previousUpper === false && isUpper === true) {
        parts.push(buff);
        buff = char;
        previousUpper = isUpper;
        continue;
      }
      if (previousUpper === true && isUpper === false && buff.length > 1) {
        const lastChar = buff.at(-1);
        parts.push(buff.slice(0, Math.max(0, buff.length - 1)));
        buff = lastChar + char;
        previousUpper = isUpper;
        continue;
      }
    }
    buff += char;
    previousUpper = isUpper;
    previousSplitter = isSplitter;
  }
  parts.push(buff);
  return parts;
}
function pascalCase(str) {
  if (!str)
    return "";
  return splitByCase(str).map((p) => upperFirst(p)).join("");
}
function camelCase(str) {
  return lowerFirst(pascalCase(str || ""));
}
function upperFirst(str) {
  return str ? str[0].toUpperCase() + str.slice(1) : "";
}
function lowerFirst(str) {
  return str ? str[0].toLowerCase() + str.slice(1) : "";
}
function cssToStyleObj(css) {
  if (!css)
    return {};
  const styleObj = {};
  function iterator(name, value) {
    if (name.startsWith("-moz-") || name.startsWith("-webkit-") || name.startsWith("-ms-") || name.startsWith("-o-")) {
      styleObj[pascalCase(name)] = value;
      return;
    }
    if (name.startsWith("--")) {
      styleObj[name] = value;
      return;
    }
    styleObj[camelCase(name)] = value;
  }
  parse(css, iterator);
  return styleObj;
}
function executeCallbacks(...callbacks) {
  return (...args) => {
    for (const callback of callbacks) {
      if (typeof callback === "function") {
        callback(...args);
      }
    }
  };
}
function createParser(matcher, replacer) {
  const regex = RegExp(matcher, "g");
  return (str) => {
    if (typeof str !== "string") {
      throw new TypeError(`expected an argument of type string, but got ${typeof str}`);
    }
    if (!str.match(regex))
      return str;
    return str.replace(regex, replacer);
  };
}
const camelToKebab = createParser(/[A-Z]/, (match) => `-${match.toLowerCase()}`);
function styleToCSS(styleObj) {
  if (!styleObj || typeof styleObj !== "object" || Array.isArray(styleObj)) {
    throw new TypeError(`expected an argument of type object, but got ${typeof styleObj}`);
  }
  return Object.keys(styleObj).map((property) => `${camelToKebab(property)}: ${styleObj[property]};`).join("\n");
}
function styleToString(style = {}) {
  return styleToCSS(style).replace("\n", " ");
}
const EVENT_LIST = [
  "onabort",
  "onanimationcancel",
  "onanimationend",
  "onanimationiteration",
  "onanimationstart",
  "onauxclick",
  "onbeforeinput",
  "onbeforetoggle",
  "onblur",
  "oncancel",
  "oncanplay",
  "oncanplaythrough",
  "onchange",
  "onclick",
  "onclose",
  "oncompositionend",
  "oncompositionstart",
  "oncompositionupdate",
  "oncontextlost",
  "oncontextmenu",
  "oncontextrestored",
  "oncopy",
  "oncuechange",
  "oncut",
  "ondblclick",
  "ondrag",
  "ondragend",
  "ondragenter",
  "ondragleave",
  "ondragover",
  "ondragstart",
  "ondrop",
  "ondurationchange",
  "onemptied",
  "onended",
  "onerror",
  "onfocus",
  "onfocusin",
  "onfocusout",
  "onformdata",
  "ongotpointercapture",
  "oninput",
  "oninvalid",
  "onkeydown",
  "onkeypress",
  "onkeyup",
  "onload",
  "onloadeddata",
  "onloadedmetadata",
  "onloadstart",
  "onlostpointercapture",
  "onmousedown",
  "onmouseenter",
  "onmouseleave",
  "onmousemove",
  "onmouseout",
  "onmouseover",
  "onmouseup",
  "onpaste",
  "onpause",
  "onplay",
  "onplaying",
  "onpointercancel",
  "onpointerdown",
  "onpointerenter",
  "onpointerleave",
  "onpointermove",
  "onpointerout",
  "onpointerover",
  "onpointerup",
  "onprogress",
  "onratechange",
  "onreset",
  "onresize",
  "onscroll",
  "onscrollend",
  "onsecuritypolicyviolation",
  "onseeked",
  "onseeking",
  "onselect",
  "onselectionchange",
  "onselectstart",
  "onslotchange",
  "onstalled",
  "onsubmit",
  "onsuspend",
  "ontimeupdate",
  "ontoggle",
  "ontouchcancel",
  "ontouchend",
  "ontouchmove",
  "ontouchstart",
  "ontransitioncancel",
  "ontransitionend",
  "ontransitionrun",
  "ontransitionstart",
  "onvolumechange",
  "onwaiting",
  "onwebkitanimationend",
  "onwebkitanimationiteration",
  "onwebkitanimationstart",
  "onwebkittransitionend",
  "onwheel"
];
const EVENT_LIST_SET = new Set(EVENT_LIST);
function isEventHandler(key) {
  return EVENT_LIST_SET.has(key);
}
function mergeProps(...args) {
  const result = { ...args[0] };
  for (let i = 1; i < args.length; i++) {
    const props = args[i];
    if (!props)
      continue;
    for (const key of Object.keys(props)) {
      const a = result[key];
      const b = props[key];
      const aIsFunction = typeof a === "function";
      const bIsFunction = typeof b === "function";
      if (aIsFunction && typeof bIsFunction && isEventHandler(key)) {
        const aHandler = a;
        const bHandler = b;
        result[key] = composeHandlers(aHandler, bHandler);
      } else if (aIsFunction && bIsFunction) {
        result[key] = executeCallbacks(a, b);
      } else if (key === "class") {
        const aIsClassValue = isClassValue(a);
        const bIsClassValue = isClassValue(b);
        if (aIsClassValue && bIsClassValue) {
          result[key] = clsx$1(a, b);
        } else if (aIsClassValue) {
          result[key] = clsx$1(a);
        } else if (bIsClassValue) {
          result[key] = clsx$1(b);
        }
      } else if (key === "style") {
        const aIsObject = typeof a === "object";
        const bIsObject = typeof b === "object";
        const aIsString = typeof a === "string";
        const bIsString = typeof b === "string";
        if (aIsObject && bIsObject) {
          result[key] = { ...a, ...b };
        } else if (aIsObject && bIsString) {
          const parsedStyle = cssToStyleObj(b);
          result[key] = { ...a, ...parsedStyle };
        } else if (aIsString && bIsObject) {
          const parsedStyle = cssToStyleObj(a);
          result[key] = { ...parsedStyle, ...b };
        } else if (aIsString && bIsString) {
          const parsedStyleA = cssToStyleObj(a);
          const parsedStyleB = cssToStyleObj(b);
          result[key] = { ...parsedStyleA, ...parsedStyleB };
        } else if (aIsObject) {
          result[key] = a;
        } else if (bIsObject) {
          result[key] = b;
        } else if (aIsString) {
          result[key] = a;
        } else if (bIsString) {
          result[key] = b;
        }
      } else {
        result[key] = b !== void 0 ? b : a;
      }
    }
    for (const key of Object.getOwnPropertySymbols(props)) {
      const a = result[key];
      const b = props[key];
      result[key] = b !== void 0 ? b : a;
    }
  }
  if (typeof result.style === "object") {
    result.style = styleToString(result.style).replaceAll("\n", " ");
  }
  if (result.hidden === false) {
    result.hidden = void 0;
    delete result.hidden;
  }
  if (result.disabled === false) {
    result.disabled = void 0;
    delete result.disabled;
  }
  return result;
}
const srOnlyStyles = {
  position: "absolute",
  width: "1px",
  height: "1px",
  padding: "0",
  margin: "-1px",
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  borderWidth: "0",
  transform: "translateX(-100%)"
};
styleToString(srOnlyStyles);
const defaultWindow = void 0;
function getActiveElement$1(document2) {
  let activeElement = document2.activeElement;
  while (activeElement?.shadowRoot) {
    const node = activeElement.shadowRoot.activeElement;
    if (node === activeElement)
      break;
    else
      activeElement = node;
  }
  return activeElement;
}
class ActiveElement2 {
  #document;
  #subscribe;
  constructor(options = {}) {
    const { window: window2 = defaultWindow, document: document2 = window2?.document } = options;
    if (window2 === void 0) return;
    this.#document = document2;
    this.#subscribe = createSubscriber();
  }
  get current() {
    this.#subscribe?.();
    if (!this.#document) return null;
    return getActiveElement$1(this.#document);
  }
}
new ActiveElement2();
function isFunction(value) {
  return typeof value === "function";
}
function extract(value, defaultValue) {
  if (isFunction(value)) {
    const getter = value;
    const gotten = getter();
    if (gotten === void 0) return defaultValue;
    return gotten;
  }
  if (value === void 0) return defaultValue;
  return value;
}
class Context2 {
  #name;
  #key;
  /**
   * @param name The name of the context.
   * This is used for generating the context key and error messages.
   */
  constructor(name) {
    this.#name = name;
    this.#key = Symbol(name);
  }
  /**
   * The key used to get and set the context.
   *
   * It is not recommended to use this value directly.
   * Instead, use the methods provided by this class.
   */
  get key() {
    return this.#key;
  }
  /**
   * Checks whether this has been set in the context of a parent component.
   *
   * Must be called during component initialisation.
   */
  exists() {
    return hasContext(this.#key);
  }
  /**
   * Retrieves the context that belongs to the closest parent component.
   *
   * Must be called during component initialisation.
   *
   * @throws An error if the context does not exist.
   */
  get() {
    const context = getContext(this.#key);
    if (context === void 0) {
      throw new Error(`Context "${this.#name}" not found`);
    }
    return context;
  }
  /**
   * Retrieves the context that belongs to the closest parent component,
   * or the given fallback value if the context does not exist.
   *
   * Must be called during component initialisation.
   */
  getOr(fallback) {
    const context = getContext(this.#key);
    if (context === void 0) {
      return fallback;
    }
    return context;
  }
  /**
   * Associates the given value with the current component and returns it.
   *
   * Must be called during component initialisation.
   */
  set(context) {
    return setContext(this.#key, context);
  }
}
function useDebounce(callback, wait) {
  let context = null;
  const wait$ = derived(() => extract(wait, 250));
  function debounced(...args) {
    if (context) {
      if (context.timeout) {
        clearTimeout(context.timeout);
      }
    } else {
      let resolve2;
      let reject;
      const promise = new Promise((res, rej) => {
        resolve2 = res;
        reject = rej;
      });
      context = { timeout: null, runner: null, promise, resolve: resolve2, reject };
    }
    context.runner = async () => {
      if (!context) return;
      const ctx = context;
      context = null;
      try {
        ctx.resolve(await callback.apply(this, args));
      } catch (error) {
        ctx.reject(error);
      }
    };
    context.timeout = setTimeout(context.runner, wait$());
    return context.promise;
  }
  debounced.cancel = async () => {
    if (!context || context.timeout === null) {
      await new Promise((resolve2) => setTimeout(resolve2, 0));
      if (!context || context.timeout === null) return;
    }
    clearTimeout(context.timeout);
    context.reject("Cancelled");
    context = null;
  };
  debounced.runScheduledNow = async () => {
    if (!context || !context.timeout) {
      await new Promise((resolve2) => setTimeout(resolve2, 0));
      if (!context || !context.timeout) return;
    }
    clearTimeout(context.timeout);
    context.timeout = null;
    await context.runner?.();
  };
  Object.defineProperty(debounced, "pending", {
    enumerable: true,
    get() {
      return !!context?.timeout;
    }
  });
  return debounced;
}
function runWatcher(sources, flush, effect, options = {}) {
  const { lazy = false } = options;
}
function watch(sources, effect, options) {
  runWatcher(sources, "post", effect, options);
}
function watchPre(sources, effect, options) {
  runWatcher(sources, "pre", effect, options);
}
watch.pre = watchPre;
function get$1(value) {
  if (isFunction(value)) {
    return value();
  }
  return value;
}
class ElementSize {
  // no need to use `$state` here since we are using createSubscriber
  #size = { width: 0, height: 0 };
  #observed = false;
  #options;
  #node;
  #window;
  // we use a derived here to extract the width so that if the width doesn't change we don't get a state update
  // which we would get if we would just use a getter since the version of the subscriber will be changing
  #width = derived(() => {
    this.#subscribe()?.();
    return this.getSize().width;
  });
  // we use a derived here to extract the height so that if the height doesn't change we don't get a state update
  // which we would get if we would just use a getter since the version of the subscriber will be changing
  #height = derived(() => {
    this.#subscribe()?.();
    return this.getSize().height;
  });
  // we need to use a derived here because the class will be created before the node is bound to the ref
  #subscribe = derived(() => {
    const node$ = get$1(this.#node);
    if (!node$) return;
    return createSubscriber();
  });
  constructor(node, options = { box: "border-box" }) {
    this.#window = options.window ?? defaultWindow;
    this.#options = options;
    this.#node = node;
    this.#size = { width: 0, height: 0 };
  }
  calculateSize() {
    const element2 = get$1(this.#node);
    if (!element2 || !this.#window) {
      return;
    }
    const offsetWidth = element2.offsetWidth;
    const offsetHeight = element2.offsetHeight;
    if (this.#options.box === "border-box") {
      return { width: offsetWidth, height: offsetHeight };
    }
    const style = this.#window.getComputedStyle(element2);
    const paddingWidth = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    const paddingHeight = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    const borderWidth = parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth);
    const borderHeight = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
    const contentWidth = offsetWidth - paddingWidth - borderWidth;
    const contentHeight = offsetHeight - paddingHeight - borderHeight;
    return { width: contentWidth, height: contentHeight };
  }
  getSize() {
    return this.#observed ? this.#size : this.calculateSize() ?? this.#size;
  }
  get current() {
    this.#subscribe()?.();
    return this.getSize();
  }
  get width() {
    return this.#width();
  }
  get height() {
    return this.#height();
  }
}
class IsMounted {
  #isMounted = false;
  constructor() {
  }
  get current() {
    return this.#isMounted;
  }
}
class Previous {
  #previousCallback = () => void 0;
  #previous = derived(() => this.#previousCallback());
  constructor(getter, initialValue) {
    let actualPrevious = void 0;
    if (initialValue !== void 0) actualPrevious = initialValue;
    this.#previousCallback = () => {
      try {
        return actualPrevious;
      } finally {
        actualPrevious = getter();
      }
    };
  }
  get current() {
    return this.#previous();
  }
}
function afterSleep(ms, cb) {
  return setTimeout(cb, ms);
}
function afterTick(fn) {
  tick().then(fn);
}
const ELEMENT_NODE = 1;
const DOCUMENT_NODE = 9;
const DOCUMENT_FRAGMENT_NODE = 11;
function isHTMLElement$1(node) {
  return isObject(node) && node.nodeType === ELEMENT_NODE && typeof node.nodeName === "string";
}
function isDocument(node) {
  return isObject(node) && node.nodeType === DOCUMENT_NODE;
}
function isWindow(node) {
  return isObject(node) && node.constructor?.name === "VisualViewport";
}
function isNode(node) {
  return isObject(node) && node.nodeType !== void 0;
}
function isShadowRoot(node) {
  return isNode(node) && node.nodeType === DOCUMENT_FRAGMENT_NODE && "host" in node;
}
function contains(parent, child) {
  if (!parent || !child)
    return false;
  if (!isHTMLElement$1(parent) || !isHTMLElement$1(child))
    return false;
  const rootNode = child.getRootNode?.();
  if (parent === child)
    return true;
  if (parent.contains(child))
    return true;
  if (rootNode && isShadowRoot(rootNode)) {
    let next2 = child;
    while (next2) {
      if (parent === next2)
        return true;
      next2 = next2.parentNode || next2.host;
    }
  }
  return false;
}
function getDocument(node) {
  if (isDocument(node))
    return node;
  if (isWindow(node))
    return node.document;
  return node?.ownerDocument ?? document;
}
function getWindow(node) {
  if (isShadowRoot(node))
    return getWindow(node.host);
  if (isDocument(node))
    return node.defaultView ?? window;
  if (isHTMLElement$1(node))
    return node.ownerDocument?.defaultView ?? window;
  return window;
}
function getActiveElement(rootNode) {
  let activeElement = rootNode.activeElement;
  while (activeElement?.shadowRoot) {
    const el = activeElement.shadowRoot.activeElement;
    if (el === activeElement)
      break;
    else
      activeElement = el;
  }
  return activeElement;
}
class DOMContext {
  element;
  #root = derived(() => {
    if (!this.element.current) return document;
    const rootNode = this.element.current.getRootNode() ?? document;
    return rootNode;
  });
  get root() {
    return this.#root();
  }
  set root($$value) {
    return this.#root($$value);
  }
  constructor(element2) {
    if (typeof element2 === "function") {
      this.element = boxWith(element2);
    } else {
      this.element = element2;
    }
  }
  getDocument = () => {
    return getDocument(this.root);
  };
  getWindow = () => {
    return this.getDocument().defaultView ?? window;
  };
  getActiveElement = () => {
    return getActiveElement(this.root);
  };
  isActiveElement = (node) => {
    return node === this.getActiveElement();
  };
  getElementById(id) {
    return this.root.getElementById(id);
  }
  querySelector = (selector) => {
    if (!this.root) return null;
    return this.root.querySelector(selector);
  };
  querySelectorAll = (selector) => {
    if (!this.root) return [];
    return this.root.querySelectorAll(selector);
  };
  setTimeout = (callback, delay) => {
    return this.getWindow().setTimeout(callback, delay);
  };
  clearTimeout = (timeoutId) => {
    return this.getWindow().clearTimeout(timeoutId);
  };
}
function createAttachmentKey() {
  return Symbol(ATTACHMENT_KEY);
}
function attachRef(ref, onChange) {
  return {
    [createAttachmentKey()]: (node) => {
      if (isBox(ref)) {
        ref.current = node;
        run(() => onChange?.(node));
        return () => {
          if ("isConnected" in node && node.isConnected)
            return;
          ref.current = null;
          onChange?.(null);
        };
      }
      ref(node);
      run(() => onChange?.(node));
      return () => {
        if ("isConnected" in node && node.isConnected)
          return;
        ref(null);
        onChange?.(null);
      };
    }
  };
}
function boolToStr(condition) {
  return condition ? "true" : "false";
}
function boolToEmptyStrOrUndef(condition) {
  return condition ? "" : void 0;
}
function boolToTrueOrUndef(condition) {
  return condition ? true : void 0;
}
function getDataOpenClosed(condition) {
  return condition ? "open" : "closed";
}
function getDataChecked(condition) {
  return condition ? "checked" : "unchecked";
}
function getDataTransitionAttrs(state) {
  if (state === "starting")
    return { "data-starting-style": "" };
  if (state === "ending")
    return { "data-ending-style": "" };
  return {};
}
function getAriaChecked(checked, indeterminate) {
  return checked ? "true" : "false";
}
class BitsAttrs {
  #variant;
  #prefix;
  attrs;
  constructor(config) {
    this.#variant = config.getVariant ? config.getVariant() : null;
    this.#prefix = this.#variant ? `data-${this.#variant}-` : `data-${config.component}-`;
    this.getAttr = this.getAttr.bind(this);
    this.selector = this.selector.bind(this);
    this.attrs = Object.fromEntries(config.parts.map((part) => [part, this.getAttr(part)]));
  }
  getAttr(part, variantOverride) {
    if (variantOverride)
      return `data-${variantOverride}-${part}`;
    return `${this.#prefix}${part}`;
  }
  selector(part, variantOverride) {
    return `[${this.getAttr(part, variantOverride)}]`;
  }
}
function createBitsAttrs(config) {
  const bitsAttrs = new BitsAttrs(config);
  return {
    ...bitsAttrs.attrs,
    selector: bitsAttrs.selector,
    getAttr: bitsAttrs.getAttr
  };
}
const ARROW_DOWN = "ArrowDown";
const ARROW_LEFT = "ArrowLeft";
const ARROW_RIGHT = "ArrowRight";
const ARROW_UP = "ArrowUp";
const END = "End";
const ENTER = "Enter";
const ESCAPE = "Escape";
const HOME = "Home";
const PAGE_DOWN = "PageDown";
const PAGE_UP = "PageUp";
const SPACE = " ";
const TAB = "Tab";
function getElemDirection(elem) {
  const style = window.getComputedStyle(elem);
  const direction = style.getPropertyValue("direction");
  return direction;
}
function getNextKey(dir = "ltr", orientation = "horizontal") {
  return {
    horizontal: dir === "rtl" ? ARROW_LEFT : ARROW_RIGHT,
    vertical: ARROW_DOWN
  }[orientation];
}
function getPrevKey(dir = "ltr", orientation = "horizontal") {
  return {
    horizontal: dir === "rtl" ? ARROW_RIGHT : ARROW_LEFT,
    vertical: ARROW_UP
  }[orientation];
}
function getDirectionalKeys(dir = "ltr", orientation = "horizontal") {
  if (!["ltr", "rtl"].includes(dir))
    dir = "ltr";
  if (!["horizontal", "vertical"].includes(orientation))
    orientation = "horizontal";
  return {
    nextKey: getNextKey(dir, orientation),
    prevKey: getPrevKey(dir, orientation)
  };
}
const isBrowser = typeof document !== "undefined";
const isIOS = getIsIOS();
function getIsIOS() {
  return isBrowser && window?.navigator?.userAgent && (/iP(ad|hone|od)/.test(window.navigator.userAgent) || // The new iPad Pro Gen3 does not identify itself as iPad, but as Macintosh.
  window?.navigator?.maxTouchPoints > 2 && /iPad|Macintosh/.test(window?.navigator.userAgent));
}
function isHTMLElement(element2) {
  return element2 instanceof HTMLElement;
}
function isElement(element2) {
  return element2 instanceof Element;
}
function isElementOrSVGElement(element2) {
  return element2 instanceof Element || element2 instanceof SVGElement;
}
function isTouch(e) {
  return e.pointerType === "touch";
}
function isNotNull(value) {
  return value !== null;
}
class RovingFocusGroup {
  #opts;
  #currentTabStopId = box(null);
  constructor(opts) {
    this.#opts = opts;
  }
  getCandidateNodes() {
    return [];
  }
  focusFirstCandidate() {
    const items = this.getCandidateNodes();
    if (!items.length)
      return;
    items[0]?.focus();
  }
  handleKeydown(node, e, both = false) {
    const rootNode = this.#opts.rootNode.current;
    if (!rootNode || !node)
      return;
    const items = this.getCandidateNodes();
    if (!items.length)
      return;
    const currentIndex = items.indexOf(node);
    const dir = getElemDirection(rootNode);
    const { nextKey, prevKey } = getDirectionalKeys(dir, this.#opts.orientation.current);
    const loop = this.#opts.loop.current;
    const keyToIndex = {
      [nextKey]: currentIndex + 1,
      [prevKey]: currentIndex - 1,
      [HOME]: 0,
      [END]: items.length - 1
    };
    if (both) {
      const altNextKey = nextKey === ARROW_DOWN ? ARROW_RIGHT : ARROW_DOWN;
      const altPrevKey = prevKey === ARROW_UP ? ARROW_LEFT : ARROW_UP;
      keyToIndex[altNextKey] = currentIndex + 1;
      keyToIndex[altPrevKey] = currentIndex - 1;
    }
    let itemIndex = keyToIndex[e.key];
    if (itemIndex === void 0)
      return;
    e.preventDefault();
    if (itemIndex < 0 && loop) {
      itemIndex = items.length - 1;
    } else if (itemIndex === items.length && loop) {
      itemIndex = 0;
    }
    const itemToFocus = items[itemIndex];
    if (!itemToFocus)
      return;
    itemToFocus.focus();
    this.#currentTabStopId.current = itemToFocus.id;
    this.#opts.onCandidateFocus?.(itemToFocus);
    return itemToFocus;
  }
  getTabIndex(node) {
    const items = this.getCandidateNodes();
    const anyActive = this.#currentTabStopId.current !== null;
    if (node && !anyActive && items[0] === node) {
      this.#currentTabStopId.current = node.id;
      return 0;
    } else if (node?.id === this.#currentTabStopId.current) {
      return 0;
    }
    return -1;
  }
  setCurrentTabStopId(id) {
    this.#currentTabStopId.current = id;
  }
  focusCurrentTabStop() {
    const currentTabStopId = this.#currentTabStopId.current;
    if (!currentTabStopId)
      return;
    const currentTabStop = this.#opts.rootNode.current?.querySelector(`#${currentTabStopId}`);
    if (!currentTabStop || !isHTMLElement(currentTabStop))
      return;
    currentTabStop.focus();
  }
}
class AnimationsComplete {
  #opts;
  #currentFrame = null;
  #observer = null;
  #runId = 0;
  constructor(opts) {
    this.#opts = opts;
  }
  #cleanup() {
    if (this.#currentFrame !== null) {
      window.cancelAnimationFrame(this.#currentFrame);
      this.#currentFrame = null;
    }
    this.#observer?.disconnect();
    this.#observer = null;
    this.#runId++;
  }
  run(fn) {
    this.#cleanup();
    const node = this.#opts.ref.current;
    if (!node)
      return;
    if (typeof node.getAnimations !== "function") {
      this.#executeCallback(fn);
      return;
    }
    const runId = this.#runId;
    const executeIfCurrent = () => {
      if (runId !== this.#runId)
        return;
      this.#executeCallback(fn);
    };
    const waitForAnimations = () => {
      if (runId !== this.#runId)
        return;
      const animations = node.getAnimations();
      if (animations.length === 0) {
        executeIfCurrent();
        return;
      }
      Promise.all(animations.map((animation) => animation.finished)).then(() => {
        executeIfCurrent();
      }).catch(() => {
        if (runId !== this.#runId)
          return;
        const currentAnimations = node.getAnimations();
        const hasRunningAnimations = currentAnimations.some((animation) => animation.pending || animation.playState !== "finished");
        if (hasRunningAnimations) {
          waitForAnimations();
          return;
        }
        executeIfCurrent();
      });
    };
    const requestWaitForAnimations = () => {
      this.#currentFrame = window.requestAnimationFrame(() => {
        this.#currentFrame = null;
        waitForAnimations();
      });
    };
    if (!this.#opts.afterTick.current) {
      requestWaitForAnimations();
      return;
    }
    this.#currentFrame = window.requestAnimationFrame(() => {
      this.#currentFrame = null;
      const startingStyleAttr = "data-starting-style";
      if (!node.hasAttribute(startingStyleAttr)) {
        requestWaitForAnimations();
        return;
      }
      this.#observer = new MutationObserver(() => {
        if (runId !== this.#runId)
          return;
        if (node.hasAttribute(startingStyleAttr))
          return;
        this.#observer?.disconnect();
        this.#observer = null;
        requestWaitForAnimations();
      });
      this.#observer.observe(node, {
        attributes: true,
        attributeFilter: [startingStyleAttr]
      });
    });
  }
  #executeCallback(fn) {
    const execute = () => {
      fn();
    };
    if (this.#opts.afterTick) {
      afterTick(execute);
    } else {
      execute();
    }
  }
}
class PresenceManager {
  #opts;
  #enabled;
  #afterAnimations;
  #shouldRender = false;
  #transitionStatus = void 0;
  #hasMounted = false;
  #transitionFrame = null;
  constructor(opts) {
    this.#opts = opts;
    this.#shouldRender = opts.open.current;
    this.#enabled = opts.enabled ?? true;
    this.#afterAnimations = new AnimationsComplete({ ref: this.#opts.ref, afterTick: this.#opts.open });
    watch(() => this.#opts.open.current, (isOpen) => {
      if (!this.#hasMounted) {
        this.#hasMounted = true;
        return;
      }
      this.#clearTransitionFrame();
      if (!isOpen && this.#opts.shouldSkipExitAnimation?.()) {
        this.#shouldRender = false;
        this.#transitionStatus = void 0;
        this.#opts.onComplete?.();
        return;
      }
      if (isOpen) this.#shouldRender = true;
      this.#transitionStatus = isOpen ? "starting" : "ending";
      if (isOpen) {
        this.#transitionFrame = window.requestAnimationFrame(() => {
          this.#transitionFrame = null;
          if (this.#opts.open.current) {
            this.#transitionStatus = void 0;
          }
        });
      }
      if (!this.#enabled) {
        if (!isOpen) {
          this.#shouldRender = false;
        }
        this.#transitionStatus = void 0;
        this.#opts.onComplete?.();
        return;
      }
      this.#afterAnimations.run(() => {
        if (isOpen === this.#opts.open.current) {
          if (!this.#opts.open.current) {
            this.#shouldRender = false;
          }
          this.#transitionStatus = void 0;
          this.#opts.onComplete?.();
        }
      });
    });
  }
  get shouldRender() {
    return this.#shouldRender;
  }
  get transitionStatus() {
    return this.#transitionStatus;
  }
  #clearTransitionFrame() {
    if (this.#transitionFrame === null) return;
    window.cancelAnimationFrame(this.#transitionFrame);
    this.#transitionFrame = null;
  }
}
const accordionAttrs = createBitsAttrs({
  component: "accordion",
  parts: ["root", "trigger", "content", "item", "header"]
});
const AccordionRootContext = new Context2("Accordion.Root");
const AccordionItemContext = new Context2("Accordion.Item");
class AccordionBaseState {
  opts;
  rovingFocusGroup;
  attachment;
  constructor(opts) {
    this.opts = opts;
    this.rovingFocusGroup = new RovingFocusGroup({
      rootNode: this.opts.ref,
      candidateAttr: accordionAttrs.trigger,
      loop: this.opts.loop,
      orientation: this.opts.orientation
    });
    this.attachment = attachRef(this.opts.ref);
  }
  #props = derived(() => ({
    id: this.opts.id.current,
    "data-orientation": this.opts.orientation.current,
    "data-disabled": boolToEmptyStrOrUndef(this.opts.disabled.current),
    [accordionAttrs.root]: "",
    ...this.attachment
  }));
  get props() {
    return this.#props();
  }
  set props($$value) {
    return this.#props($$value);
  }
}
class AccordionSingleState extends AccordionBaseState {
  opts;
  isMulti = false;
  constructor(opts) {
    super(opts);
    this.opts = opts;
    this.includesItem = this.includesItem.bind(this);
    this.toggleItem = this.toggleItem.bind(this);
  }
  includesItem(item) {
    return this.opts.value.current === item;
  }
  toggleItem(item) {
    this.opts.value.current = this.includesItem(item) ? "" : item;
  }
}
class AccordionMultiState extends AccordionBaseState {
  #value;
  isMulti = true;
  constructor(props) {
    super(props);
    this.#value = props.value;
    this.includesItem = this.includesItem.bind(this);
    this.toggleItem = this.toggleItem.bind(this);
  }
  includesItem(item) {
    return this.#value.current.includes(item);
  }
  toggleItem(item) {
    this.#value.current = this.includesItem(item) ? this.#value.current.filter((v) => v !== item) : [...this.#value.current, item];
  }
}
class AccordionRootState {
  static create(props) {
    const { type, ...rest } = props;
    const rootState = type === "single" ? new AccordionSingleState(rest) : new AccordionMultiState(rest);
    return AccordionRootContext.set(rootState);
  }
}
class AccordionItemState {
  static create(props) {
    return AccordionItemContext.set(new AccordionItemState({ ...props, rootState: AccordionRootContext.get() }));
  }
  opts;
  root;
  #isActive = derived(() => this.root.includesItem(this.opts.value.current));
  get isActive() {
    return this.#isActive();
  }
  set isActive($$value) {
    return this.#isActive($$value);
  }
  #isDisabled = derived(() => this.opts.disabled.current || this.root.opts.disabled.current);
  get isDisabled() {
    return this.#isDisabled();
  }
  set isDisabled($$value) {
    return this.#isDisabled($$value);
  }
  attachment;
  contentNode = null;
  contentPresence;
  constructor(opts) {
    this.opts = opts;
    this.root = opts.rootState;
    this.updateValue = this.updateValue.bind(this);
    this.attachment = attachRef(this.opts.ref);
    this.contentPresence = new PresenceManager({
      ref: boxWith(() => this.contentNode),
      open: boxWith(() => this.isActive)
    });
  }
  updateValue() {
    this.root.toggleItem(this.opts.value.current);
  }
  #props = derived(() => ({
    id: this.opts.id.current,
    "data-state": getDataOpenClosed(this.isActive),
    "data-disabled": boolToEmptyStrOrUndef(this.isDisabled),
    "data-orientation": this.root.opts.orientation.current,
    [accordionAttrs.item]: "",
    ...this.attachment
  }));
  get props() {
    return this.#props();
  }
  set props($$value) {
    return this.#props($$value);
  }
}
class AccordionTriggerState {
  opts;
  itemState;
  #root;
  #isDisabled = derived(() => this.opts.disabled.current || this.itemState.opts.disabled.current || this.#root.opts.disabled.current);
  attachment;
  constructor(opts, itemState) {
    this.opts = opts;
    this.itemState = itemState;
    this.#root = itemState.root;
    this.onclick = this.onclick.bind(this);
    this.onkeydown = this.onkeydown.bind(this);
    this.attachment = attachRef(this.opts.ref);
  }
  static create(props) {
    return new AccordionTriggerState(props, AccordionItemContext.get());
  }
  onclick(e) {
    if (this.#isDisabled() || e.button !== 0) {
      e.preventDefault();
      return;
    }
    this.itemState.updateValue();
  }
  onkeydown(e) {
    if (this.#isDisabled()) return;
    if (e.key === SPACE || e.key === ENTER) {
      e.preventDefault();
      this.itemState.updateValue();
      return;
    }
    this.#root.rovingFocusGroup.handleKeydown(this.opts.ref.current, e);
  }
  #props = derived(() => ({
    id: this.opts.id.current,
    disabled: this.#isDisabled(),
    "aria-expanded": boolToStr(this.itemState.isActive),
    "aria-disabled": boolToStr(this.#isDisabled()),
    "data-disabled": boolToEmptyStrOrUndef(this.#isDisabled()),
    "data-state": getDataOpenClosed(this.itemState.isActive),
    "data-orientation": this.#root.opts.orientation.current,
    [accordionAttrs.trigger]: "",
    tabindex: this.opts.tabindex.current,
    onclick: this.onclick,
    onkeydown: this.onkeydown,
    ...this.attachment
  }));
  get props() {
    return this.#props();
  }
  set props($$value) {
    return this.#props($$value);
  }
}
class AccordionContentState {
  opts;
  item;
  attachment;
  #originalStyles = void 0;
  #isMountAnimationPrevented = false;
  #dimensions = { width: 0, height: 0 };
  #open = derived(() => {
    if (this.opts.hiddenUntilFound.current) return this.item.isActive;
    return this.opts.forceMount.current || this.item.isActive;
  });
  get open() {
    return this.#open();
  }
  set open($$value) {
    return this.#open($$value);
  }
  constructor(opts, item) {
    this.opts = opts;
    this.item = item;
    this.#isMountAnimationPrevented = this.item.isActive;
    this.attachment = attachRef(this.opts.ref, (v) => this.item.contentNode = v);
    watch.pre(
      [
        () => this.opts.ref.current,
        () => this.opts.hiddenUntilFound.current
      ],
      ([node, hiddenUntilFound]) => {
        if (!node || !hiddenUntilFound) return;
        const handleBeforeMatch = () => {
          if (this.item.isActive) return;
          requestAnimationFrame(() => {
            this.item.updateValue();
          });
        };
        return on(node, "beforematch", handleBeforeMatch);
      }
    );
    watch([() => this.open, () => this.opts.ref.current], this.#updateDimensions);
  }
  static create(props) {
    return new AccordionContentState(props, AccordionItemContext.get());
  }
  #updateDimensions = ([_, node]) => {
    if (!node) return;
    afterTick(() => {
      const element2 = this.opts.ref.current;
      if (!element2) return;
      this.#originalStyles ??= {
        transitionDuration: element2.style.transitionDuration,
        animationName: element2.style.animationName
      };
      element2.style.transitionDuration = "0s";
      element2.style.animationName = "none";
      const rect = element2.getBoundingClientRect();
      this.#dimensions = { width: rect.width, height: rect.height };
      if (!this.#isMountAnimationPrevented && this.#originalStyles) {
        element2.style.transitionDuration = this.#originalStyles.transitionDuration;
        element2.style.animationName = this.#originalStyles.animationName;
      }
    });
  };
  get shouldRender() {
    return this.item.contentPresence.shouldRender;
  }
  #snippetProps = derived(() => ({ open: this.item.isActive }));
  get snippetProps() {
    return this.#snippetProps();
  }
  set snippetProps($$value) {
    return this.#snippetProps($$value);
  }
  #props = derived(() => ({
    id: this.opts.id.current,
    "data-state": getDataOpenClosed(this.item.isActive),
    ...getDataTransitionAttrs(this.item.contentPresence.transitionStatus),
    "data-disabled": boolToEmptyStrOrUndef(this.item.isDisabled),
    "data-orientation": this.item.root.opts.orientation.current,
    [accordionAttrs.content]: "",
    style: {
      "--bits-accordion-content-height": `${this.#dimensions.height}px`,
      "--bits-accordion-content-width": `${this.#dimensions.width}px`
    },
    hidden: this.opts.hiddenUntilFound.current && !this.item.isActive ? "until-found" : void 0,
    ...this.opts.hiddenUntilFound.current && !this.shouldRender ? {} : {
      hidden: this.opts.hiddenUntilFound.current ? !this.shouldRender : this.opts.forceMount.current ? void 0 : !this.shouldRender
    },
    ...this.attachment
  }));
  get props() {
    return this.#props();
  }
  set props($$value) {
    return this.#props($$value);
  }
}
class AccordionHeaderState {
  opts;
  item;
  attachment;
  constructor(opts, item) {
    this.opts = opts;
    this.item = item;
    this.attachment = attachRef(this.opts.ref);
  }
  static create(props) {
    return new AccordionHeaderState(props, AccordionItemContext.get());
  }
  #props = derived(() => ({
    id: this.opts.id.current,
    role: "heading",
    "aria-level": this.opts.level.current,
    "data-heading-level": this.opts.level.current,
    "data-state": getDataOpenClosed(this.item.isActive),
    "data-orientation": this.item.root.opts.orientation.current,
    [accordionAttrs.header]: "",
    ...this.attachment
  }));
  get props() {
    return this.#props();
  }
  set props($$value) {
    return this.#props($$value);
  }
}
function noop() {
}
function createId(prefixOrUid, uid) {
  return `bits-${prefixOrUid}`;
}
function Accordion($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const uid = props_id($$renderer2);
    let {
      disabled = false,
      children,
      child,
      type,
      value = void 0,
      ref = null,
      id = createId(uid),
      onValueChange = noop,
      loop = true,
      orientation = "vertical",
      $$slots,
      $$events,
      ...restProps
    } = $$props;
    function handleDefaultValue() {
      if (value !== void 0) return;
      value = type === "single" ? "" : [];
    }
    handleDefaultValue();
    watch.pre(() => value, () => {
      handleDefaultValue();
    });
    const rootState = AccordionRootState.create({
      type,
      value: boxWith(() => value, (v) => {
        value = v;
        onValueChange(v);
      }),
      id: boxWith(() => id),
      disabled: boxWith(() => disabled),
      loop: boxWith(() => loop),
      orientation: boxWith(() => orientation),
      ref: boxWith(() => ref, (v) => ref = v)
    });
    const mergedProps = derived(() => mergeProps(restProps, rootState.props));
    if (child) {
      $$renderer2.push("<!--[0-->");
      child($$renderer2, { props: mergedProps() });
      $$renderer2.push(`<!---->`);
    } else {
      $$renderer2.push("<!--[-1-->");
      $$renderer2.push(`<div${attributes({ ...mergedProps() })}>`);
      children?.($$renderer2);
      $$renderer2.push(`<!----></div>`);
    }
    $$renderer2.push(`<!--]-->`);
    bind_props($$props, { value, ref });
  });
}
function Accordion_item($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const uid = props_id($$renderer2);
    const defaultId = createId(uid);
    let {
      id = defaultId,
      disabled = false,
      value = defaultId,
      children,
      child,
      ref = null,
      $$slots,
      $$events,
      ...restProps
    } = $$props;
    const itemState = AccordionItemState.create({
      value: boxWith(() => value),
      disabled: boxWith(() => disabled),
      id: boxWith(() => id),
      ref: boxWith(() => ref, (v) => ref = v)
    });
    const mergedProps = derived(() => mergeProps(restProps, itemState.props));
    if (child) {
      $$renderer2.push("<!--[0-->");
      child($$renderer2, { props: mergedProps() });
      $$renderer2.push(`<!---->`);
    } else {
      $$renderer2.push("<!--[-1-->");
      $$renderer2.push(`<div${attributes({ ...mergedProps() })}>`);
      children?.($$renderer2);
      $$renderer2.push(`<!----></div>`);
    }
    $$renderer2.push(`<!--]-->`);
    bind_props($$props, { ref });
  });
}
function Accordion_header($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const uid = props_id($$renderer2);
    let {
      id = createId(uid),
      level = 2,
      children,
      child,
      ref = null,
      $$slots,
      $$events,
      ...restProps
    } = $$props;
    const headerState = AccordionHeaderState.create({
      id: boxWith(() => id),
      level: boxWith(() => level),
      ref: boxWith(() => ref, (v) => ref = v)
    });
    const mergedProps = derived(() => mergeProps(restProps, headerState.props));
    if (child) {
      $$renderer2.push("<!--[0-->");
      child($$renderer2, { props: mergedProps() });
      $$renderer2.push(`<!---->`);
    } else {
      $$renderer2.push("<!--[-1-->");
      $$renderer2.push(`<div${attributes({ ...mergedProps() })}>`);
      children?.($$renderer2);
      $$renderer2.push(`<!----></div>`);
    }
    $$renderer2.push(`<!--]-->`);
    bind_props($$props, { ref });
  });
}
function Accordion_trigger($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const uid = props_id($$renderer2);
    let {
      disabled = false,
      ref = null,
      id = createId(uid),
      tabindex = 0,
      children,
      child,
      $$slots,
      $$events,
      ...restProps
    } = $$props;
    const triggerState = AccordionTriggerState.create({
      disabled: boxWith(() => disabled),
      id: boxWith(() => id),
      tabindex: boxWith(() => tabindex ?? 0),
      ref: boxWith(() => ref, (v) => ref = v)
    });
    const mergedProps = derived(() => mergeProps(restProps, triggerState.props));
    if (child) {
      $$renderer2.push("<!--[0-->");
      child($$renderer2, { props: mergedProps() });
      $$renderer2.push(`<!---->`);
    } else {
      $$renderer2.push("<!--[-1-->");
      $$renderer2.push(`<button${attributes({ type: "button", ...mergedProps() })}>`);
      children?.($$renderer2);
      $$renderer2.push(`<!----></button>`);
    }
    $$renderer2.push(`<!--]-->`);
    bind_props($$props, { ref });
  });
}
function Accordion_content($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const uid = props_id($$renderer2);
    let {
      child,
      ref = null,
      id = createId(uid),
      forceMount = false,
      children,
      hiddenUntilFound = false,
      $$slots,
      $$events,
      ...restProps
    } = $$props;
    const contentState = AccordionContentState.create({
      forceMount: boxWith(() => forceMount),
      id: boxWith(() => id),
      ref: boxWith(() => ref, (v) => ref = v),
      hiddenUntilFound: boxWith(() => hiddenUntilFound)
    });
    const mergedProps = derived(() => mergeProps(restProps, contentState.props));
    if (child) {
      $$renderer2.push("<!--[0-->");
      child($$renderer2, { props: mergedProps(), ...contentState.snippetProps });
      $$renderer2.push(`<!---->`);
    } else {
      $$renderer2.push("<!--[-1-->");
      $$renderer2.push(`<div${attributes({ ...mergedProps() })}>`);
      children?.($$renderer2);
      $$renderer2.push(`<!----></div>`);
    }
    $$renderer2.push(`<!--]-->`);
    bind_props($$props, { ref });
  });
}
const dialogAttrs = createBitsAttrs({
  component: "dialog",
  parts: [
    "content",
    "trigger",
    "overlay",
    "title",
    "description",
    "close",
    "cancel",
    "action"
  ]
});
const DialogRootContext = new Context2("Dialog.Root | AlertDialog.Root");
class DialogRootState {
  static create(opts) {
    const parent = DialogRootContext.getOr(null);
    return DialogRootContext.set(new DialogRootState(opts, parent));
  }
  opts;
  triggerNode = null;
  contentNode = null;
  overlayNode = null;
  descriptionNode = null;
  contentId = void 0;
  titleId = void 0;
  triggerId = void 0;
  descriptionId = void 0;
  cancelNode = null;
  nestedOpenCount = 0;
  depth;
  parent;
  contentPresence;
  overlayPresence;
  constructor(opts, parent) {
    this.opts = opts;
    this.parent = parent;
    this.depth = parent ? parent.depth + 1 : 0;
    this.handleOpen = this.handleOpen.bind(this);
    this.handleClose = this.handleClose.bind(this);
    this.contentPresence = new PresenceManager({
      ref: boxWith(() => this.contentNode),
      open: this.opts.open,
      enabled: true,
      onComplete: () => {
        this.opts.onOpenChangeComplete.current(this.opts.open.current);
      }
    });
    this.overlayPresence = new PresenceManager({
      ref: boxWith(() => this.overlayNode),
      open: this.opts.open,
      enabled: true
    });
    watch(
      () => this.opts.open.current,
      (isOpen) => {
        if (!this.parent) return;
        if (isOpen) {
          this.parent.incrementNested();
        } else {
          this.parent.decrementNested();
        }
      },
      { lazy: true }
    );
  }
  handleOpen() {
    if (this.opts.open.current) return;
    this.opts.open.current = true;
  }
  handleClose() {
    if (!this.opts.open.current) return;
    this.opts.open.current = false;
  }
  getBitsAttr = (part) => {
    return dialogAttrs.getAttr(part, this.opts.variant.current);
  };
  incrementNested() {
    this.nestedOpenCount++;
    this.parent?.incrementNested();
  }
  decrementNested() {
    if (this.nestedOpenCount === 0) return;
    this.nestedOpenCount--;
    this.parent?.decrementNested();
  }
  #sharedProps = derived(() => ({ "data-state": getDataOpenClosed(this.opts.open.current) }));
  get sharedProps() {
    return this.#sharedProps();
  }
  set sharedProps($$value) {
    return this.#sharedProps($$value);
  }
}
class DialogCloseState {
  static create(opts) {
    return new DialogCloseState(opts, DialogRootContext.get());
  }
  opts;
  root;
  attachment;
  constructor(opts, root) {
    this.opts = opts;
    this.root = root;
    this.attachment = attachRef(this.opts.ref);
    this.onclick = this.onclick.bind(this);
    this.onkeydown = this.onkeydown.bind(this);
  }
  onclick(e) {
    if (this.opts.disabled.current) return;
    if (e.button > 0) return;
    this.root.handleClose();
  }
  onkeydown(e) {
    if (this.opts.disabled.current) return;
    if (e.key === SPACE || e.key === ENTER) {
      e.preventDefault();
      this.root.handleClose();
    }
  }
  #props = derived(() => ({
    id: this.opts.id.current,
    [this.root.getBitsAttr(this.opts.variant.current)]: "",
    onclick: this.onclick,
    onkeydown: this.onkeydown,
    disabled: this.opts.disabled.current ? true : void 0,
    tabindex: 0,
    ...this.root.sharedProps,
    ...this.attachment
  }));
  get props() {
    return this.#props();
  }
  set props($$value) {
    return this.#props($$value);
  }
}
class DialogTitleState {
  static create(opts) {
    return new DialogTitleState(opts, DialogRootContext.get());
  }
  opts;
  root;
  attachment;
  constructor(opts, root) {
    this.opts = opts;
    this.root = root;
    this.root.titleId = this.opts.id.current;
    this.attachment = attachRef(this.opts.ref);
    watch.pre(() => this.opts.id.current, (id) => {
      this.root.titleId = id;
    });
  }
  #props = derived(() => ({
    id: this.opts.id.current,
    role: "heading",
    "aria-level": this.opts.level.current,
    [this.root.getBitsAttr("title")]: "",
    ...this.root.sharedProps,
    ...this.attachment
  }));
  get props() {
    return this.#props();
  }
  set props($$value) {
    return this.#props($$value);
  }
}
class DialogDescriptionState {
  static create(opts) {
    return new DialogDescriptionState(opts, DialogRootContext.get());
  }
  opts;
  root;
  attachment;
  constructor(opts, root) {
    this.opts = opts;
    this.root = root;
    this.root.descriptionId = this.opts.id.current;
    this.attachment = attachRef(this.opts.ref, (v) => {
      this.root.descriptionNode = v;
    });
    watch.pre(() => this.opts.id.current, (id) => {
      this.root.descriptionId = id;
    });
  }
  #props = derived(() => ({
    id: this.opts.id.current,
    [this.root.getBitsAttr("description")]: "",
    ...this.root.sharedProps,
    ...this.attachment
  }));
  get props() {
    return this.#props();
  }
  set props($$value) {
    return this.#props($$value);
  }
}
class DialogContentState {
  static create(opts) {
    return new DialogContentState(opts, DialogRootContext.get());
  }
  opts;
  root;
  attachment;
  constructor(opts, root) {
    this.opts = opts;
    this.root = root;
    this.attachment = attachRef(this.opts.ref, (v) => {
      this.root.contentNode = v;
      this.root.contentId = v?.id;
    });
  }
  #snippetProps = derived(() => ({ open: this.root.opts.open.current }));
  get snippetProps() {
    return this.#snippetProps();
  }
  set snippetProps($$value) {
    return this.#snippetProps($$value);
  }
  #props = derived(() => ({
    id: this.opts.id.current,
    role: this.root.opts.variant.current === "alert-dialog" ? "alertdialog" : "dialog",
    "aria-modal": "true",
    "aria-describedby": this.root.descriptionId,
    "aria-labelledby": this.root.titleId,
    [this.root.getBitsAttr("content")]: "",
    style: {
      pointerEvents: "auto",
      outline: this.root.opts.variant.current === "alert-dialog" ? "none" : void 0,
      "--bits-dialog-depth": this.root.depth,
      "--bits-dialog-nested-count": this.root.nestedOpenCount,
      contain: "layout style"
    },
    tabindex: this.root.opts.variant.current === "alert-dialog" ? -1 : void 0,
    "data-nested-open": boolToEmptyStrOrUndef(this.root.nestedOpenCount > 0),
    "data-nested": boolToEmptyStrOrUndef(this.root.parent !== null),
    ...getDataTransitionAttrs(this.root.contentPresence.transitionStatus),
    ...this.root.sharedProps,
    ...this.attachment
  }));
  get props() {
    return this.#props();
  }
  set props($$value) {
    return this.#props($$value);
  }
  get shouldRender() {
    return this.root.contentPresence.shouldRender;
  }
}
class DialogOverlayState {
  static create(opts) {
    return new DialogOverlayState(opts, DialogRootContext.get());
  }
  opts;
  root;
  attachment;
  constructor(opts, root) {
    this.opts = opts;
    this.root = root;
    this.attachment = attachRef(this.opts.ref, (v) => this.root.overlayNode = v);
  }
  #snippetProps = derived(() => ({ open: this.root.opts.open.current }));
  get snippetProps() {
    return this.#snippetProps();
  }
  set snippetProps($$value) {
    return this.#snippetProps($$value);
  }
  #props = derived(() => ({
    id: this.opts.id.current,
    [this.root.getBitsAttr("overlay")]: "",
    style: {
      pointerEvents: "auto",
      "--bits-dialog-depth": this.root.depth,
      "--bits-dialog-nested-count": this.root.nestedOpenCount
    },
    "data-nested-open": boolToEmptyStrOrUndef(this.root.nestedOpenCount > 0),
    "data-nested": boolToEmptyStrOrUndef(this.root.parent !== null),
    ...getDataTransitionAttrs(this.root.overlayPresence.transitionStatus),
    ...this.root.sharedProps,
    ...this.attachment
  }));
  get props() {
    return this.#props();
  }
  set props($$value) {
    return this.#props($$value);
  }
  get shouldRender() {
    return this.root.overlayPresence.shouldRender;
  }
}
function Dialog_title($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const uid = props_id($$renderer2);
    let {
      id = createId(uid),
      ref = null,
      child,
      children,
      level = 2,
      $$slots,
      $$events,
      ...restProps
    } = $$props;
    const titleState = DialogTitleState.create({
      id: boxWith(() => id),
      level: boxWith(() => level),
      ref: boxWith(() => ref, (v) => ref = v)
    });
    const mergedProps = derived(() => mergeProps(restProps, titleState.props));
    if (child) {
      $$renderer2.push("<!--[0-->");
      child($$renderer2, { props: mergedProps() });
      $$renderer2.push(`<!---->`);
    } else {
      $$renderer2.push("<!--[-1-->");
      $$renderer2.push(`<div${attributes({ ...mergedProps() })}>`);
      children?.($$renderer2);
      $$renderer2.push(`<!----></div>`);
    }
    $$renderer2.push(`<!--]-->`);
    bind_props($$props, { ref });
  });
}
const BitsConfigContext = new Context2("BitsConfig");
function getBitsConfig() {
  const fallback = new BitsConfigState(null, {});
  return BitsConfigContext.getOr(fallback).opts;
}
class BitsConfigState {
  opts;
  constructor(parent, opts) {
    const resolveConfigOption = createConfigResolver(parent, opts);
    this.opts = {
      defaultPortalTo: resolveConfigOption((config) => config.defaultPortalTo),
      defaultLocale: resolveConfigOption((config) => config.defaultLocale)
    };
  }
}
function createConfigResolver(parent, currentOpts) {
  return (getter) => {
    const configOption = boxWith(() => {
      const value = getter(currentOpts)?.current;
      if (value !== void 0)
        return value;
      if (parent === null)
        return void 0;
      return getter(parent.opts)?.current;
    });
    return configOption;
  };
}
function createPropResolver(configOption, fallback) {
  return (getProp) => {
    const config = getBitsConfig();
    return boxWith(() => {
      const propValue = getProp();
      if (propValue !== void 0)
        return propValue;
      const option = configOption(config).current;
      if (option !== void 0)
        return option;
      return fallback;
    });
  };
}
const resolvePortalToProp = createPropResolver((config) => config.defaultPortalTo, "body");
function Portal($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { to: toProp, children, disabled } = $$props;
    const to = resolvePortalToProp(() => toProp);
    getAllContexts();
    let target = derived(getTarget);
    function getTarget() {
      if (!isBrowser || disabled) return null;
      let localTarget = null;
      if (typeof to.current === "string") {
        const target2 = document.querySelector(to.current);
        localTarget = target2;
      } else {
        localTarget = to.current;
      }
      return localTarget;
    }
    let instance;
    function unmountInstance() {
      if (instance) {
        unmount();
        instance = null;
      }
    }
    watch([() => target(), () => disabled], ([target2, disabled2]) => {
      if (!target2 || disabled2) {
        unmountInstance();
        return;
      }
      instance = mount();
      return () => {
        unmountInstance();
      };
    });
    if (disabled) {
      $$renderer2.push("<!--[0-->");
      children?.($$renderer2);
      $$renderer2.push(`<!---->`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]-->`);
  });
}
function debounce(fn, wait = 500) {
  let timeout = null;
  const debounced = (...args) => {
    if (timeout !== null) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => {
      fn(...args);
    }, wait);
  };
  debounced.destroy = () => {
    if (timeout !== null) {
      clearTimeout(timeout);
      timeout = null;
    }
  };
  return debounced;
}
function isOrContainsTarget(node, target) {
  return node === target || node.contains(target);
}
function getOwnerDocument(el) {
  return el?.ownerDocument ?? document;
}
function isClickTrulyOutside(event, contentNode) {
  const { clientX, clientY } = event;
  const rect = contentNode.getBoundingClientRect();
  return clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom;
}
function next(array, index, loop = true) {
  if (array.length === 0 || index < 0 || index >= array.length)
    return;
  if (array.length === 1 && index === 0)
    return array[0];
  if (index === array.length - 1)
    return loop ? array[0] : void 0;
  return array[index + 1];
}
function prev(array, index, loop = true) {
  if (array.length === 0 || index < 0 || index >= array.length)
    return;
  if (array.length === 1 && index === 0)
    return array[0];
  if (index === 0)
    return loop ? array[array.length - 1] : void 0;
  return array[index - 1];
}
function forward(array, index, increment, loop = true) {
  if (array.length === 0 || index < 0 || index >= array.length)
    return;
  let targetIndex = index + increment;
  if (loop) {
    targetIndex = (targetIndex % array.length + array.length) % array.length;
  } else {
    targetIndex = Math.max(0, Math.min(targetIndex, array.length - 1));
  }
  return array[targetIndex];
}
function backward(array, index, decrement, loop = true) {
  if (array.length === 0 || index < 0 || index >= array.length)
    return;
  let targetIndex = index - decrement;
  if (loop) {
    targetIndex = (targetIndex % array.length + array.length) % array.length;
  } else {
    targetIndex = Math.max(0, Math.min(targetIndex, array.length - 1));
  }
  return array[targetIndex];
}
function getNextMatch(values, search, currentMatch) {
  const lowerSearch = search.toLowerCase();
  if (lowerSearch.endsWith(" ")) {
    const searchWithoutSpace = lowerSearch.slice(0, -1);
    const matchesWithoutSpace = values.filter((value) => value.toLowerCase().startsWith(searchWithoutSpace));
    if (matchesWithoutSpace.length <= 1) {
      return getNextMatch(values, searchWithoutSpace, currentMatch);
    }
    const currentMatchLowercase = currentMatch?.toLowerCase();
    if (currentMatchLowercase && currentMatchLowercase.startsWith(searchWithoutSpace) && currentMatchLowercase.charAt(searchWithoutSpace.length) === " " && search.trim() === searchWithoutSpace) {
      return currentMatch;
    }
    const spacedMatches = values.filter((value) => value.toLowerCase().startsWith(lowerSearch));
    if (spacedMatches.length > 0) {
      const currentMatchIndex2 = currentMatch ? values.indexOf(currentMatch) : -1;
      let wrappedMatches = wrapArray(spacedMatches, Math.max(currentMatchIndex2, 0));
      const nextMatch2 = wrappedMatches.find((match) => match !== currentMatch);
      return nextMatch2 || currentMatch;
    }
  }
  const isRepeated = search.length > 1 && Array.from(search).every((char) => char === search[0]);
  const normalizedSearch = isRepeated ? search[0] : search;
  const normalizedLowerSearch = normalizedSearch.toLowerCase();
  const currentMatchIndex = currentMatch ? values.indexOf(currentMatch) : -1;
  let wrappedValues = wrapArray(values, Math.max(currentMatchIndex, 0));
  const excludeCurrentMatch = normalizedSearch.length === 1;
  if (excludeCurrentMatch)
    wrappedValues = wrappedValues.filter((v) => v !== currentMatch);
  const nextMatch = wrappedValues.find((value) => value?.toLowerCase().startsWith(normalizedLowerSearch));
  return nextMatch !== currentMatch ? nextMatch : void 0;
}
function wrapArray(array, startIndex) {
  return array.map((_, index) => array[(startIndex + index) % array.length]);
}
const defaultOptions = { afterMs: 1e4, onChange: noop };
function boxAutoReset(defaultValue, options) {
  const { afterMs, onChange, getWindow: getWindow2 } = { ...defaultOptions, ...options };
  let timeout = null;
  let value = defaultValue;
  function resetAfter() {
    return getWindow2().setTimeout(
      () => {
        value = defaultValue;
        onChange?.(defaultValue);
      },
      afterMs
    );
  }
  return boxWith(() => value, (v) => {
    value = v;
    onChange?.(v);
    if (timeout) getWindow2().clearTimeout(timeout);
    timeout = resetAfter();
  });
}
class DOMTypeahead {
  #opts;
  #search;
  #onMatch = derived(() => {
    if (this.#opts.onMatch) return this.#opts.onMatch;
    return (node) => node.focus();
  });
  #getCurrentItem = derived(() => {
    if (this.#opts.getCurrentItem) return this.#opts.getCurrentItem;
    return this.#opts.getActiveElement;
  });
  constructor(opts) {
    this.#opts = opts;
    this.#search = boxAutoReset("", { afterMs: 1e3, getWindow: opts.getWindow });
    this.handleTypeaheadSearch = this.handleTypeaheadSearch.bind(this);
    this.resetTypeahead = this.resetTypeahead.bind(this);
  }
  handleTypeaheadSearch(key, candidates) {
    if (!candidates.length) return;
    this.#search.current = this.#search.current + key;
    const currentItem = this.#getCurrentItem()();
    const currentMatch = candidates.find((item) => item === currentItem)?.textContent?.trim() ?? "";
    const values = candidates.map((item) => item.textContent?.trim() ?? "");
    const nextMatch = getNextMatch(values, this.#search.current, currentMatch);
    const newItem = candidates.find((item) => item.textContent?.trim() === nextMatch);
    if (newItem) this.#onMatch()(newItem);
    return newItem;
  }
  resetTypeahead() {
    this.#search.current = "";
  }
  get search() {
    return this.#search.current;
  }
}
const CONTEXT_MENU_TRIGGER_ATTR = "data-context-menu-trigger";
const CONTEXT_MENU_CONTENT_ATTR = "data-context-menu-content";
createBitsAttrs({
  component: "menu",
  parts: [
    "trigger",
    "content",
    "sub-trigger",
    "item",
    "group",
    "group-heading",
    "checkbox-group",
    "checkbox-item",
    "radio-group",
    "radio-item",
    "separator",
    "sub-content",
    "arrow"
  ]
});
globalThis.bitsDismissableLayers ??= /* @__PURE__ */ new Map();
class DismissibleLayerState {
  static create(opts) {
    return new DismissibleLayerState(opts);
  }
  opts;
  #interactOutsideProp;
  #behaviorType;
  #interceptedEvents = { pointerdown: false };
  #isResponsibleLayer = false;
  #isFocusInsideDOMTree = false;
  #documentObj = void 0;
  #onFocusOutside;
  #unsubClickListener = noop;
  constructor(opts) {
    this.opts = opts;
    this.#behaviorType = opts.interactOutsideBehavior;
    this.#interactOutsideProp = opts.onInteractOutside;
    this.#onFocusOutside = opts.onFocusOutside;
    let unsubEvents = noop;
    const cleanup = () => {
      this.#resetState();
      globalThis.bitsDismissableLayers.delete(this);
      this.#handleInteractOutside.destroy();
      unsubEvents();
    };
    watch([() => this.opts.enabled.current, () => this.opts.ref.current], () => {
      if (!this.opts.enabled.current || !this.opts.ref.current) return;
      afterSleep(1, () => {
        if (!this.opts.ref.current) return;
        globalThis.bitsDismissableLayers.set(this, this.#behaviorType);
        unsubEvents();
        unsubEvents = this.#addEventListeners();
      });
      return cleanup;
    });
  }
  #handleFocus = (event) => {
    if (event.defaultPrevented) return;
    if (!this.opts.ref.current) return;
    afterTick(() => {
      if (!this.opts.ref.current || this.#isTargetWithinLayer(event.target)) return;
      if (event.target && !this.#isFocusInsideDOMTree) {
        this.#onFocusOutside.current?.(event);
      }
    });
  };
  #addEventListeners() {
    return executeCallbacks(
      /**
       * CAPTURE INTERACTION START
       * mark interaction-start event as intercepted.
       * mark responsible layer during interaction start
       * to avoid checking if is responsible layer during interaction end
       * when a new floating element may have been opened.
       */
      on(this.#documentObj, "pointerdown", executeCallbacks(this.#markInterceptedEvent, this.#markResponsibleLayer), { capture: true }),
      /**
       * BUBBLE INTERACTION START
       * Mark interaction-start event as non-intercepted. Debounce `onInteractOutsideStart`
       * to avoid prematurely checking if other events were intercepted.
       */
      on(this.#documentObj, "pointerdown", executeCallbacks(this.#markNonInterceptedEvent, this.#handleInteractOutside)),
      /**
       * HANDLE FOCUS OUTSIDE
       */
      on(this.#documentObj, "focusin", this.#handleFocus)
    );
  }
  #handleDismiss = (e) => {
    let event = e;
    if (event.defaultPrevented) {
      event = createWrappedEvent(e);
    }
    this.#interactOutsideProp.current(e);
  };
  #handleInteractOutside = debounce(
    (e) => {
      if (!this.opts.ref.current) {
        this.#unsubClickListener();
        return;
      }
      const isEventValid = this.opts.isValidEvent.current(e, this.opts.ref.current) || isValidEvent(e, this.opts.ref.current);
      if (!this.#isResponsibleLayer || this.#isAnyEventIntercepted() || !isEventValid) {
        this.#unsubClickListener();
        return;
      }
      let event = e;
      if (event.defaultPrevented) {
        event = createWrappedEvent(event);
      }
      if (this.#behaviorType.current !== "close" && this.#behaviorType.current !== "defer-otherwise-close") {
        this.#unsubClickListener();
        return;
      }
      if (e.pointerType === "touch") {
        this.#unsubClickListener();
        this.#unsubClickListener = on(this.#documentObj, "click", this.#handleDismiss, { once: true });
      } else {
        this.#interactOutsideProp.current(event);
      }
    },
    10
  );
  #markInterceptedEvent = (e) => {
    this.#interceptedEvents[e.type] = true;
  };
  #markNonInterceptedEvent = (e) => {
    this.#interceptedEvents[e.type] = false;
  };
  #markResponsibleLayer = () => {
    if (!this.opts.ref.current) return;
    this.#isResponsibleLayer = isResponsibleLayer(this.opts.ref.current);
  };
  #isTargetWithinLayer = (target) => {
    if (!this.opts.ref.current) return false;
    return isOrContainsTarget(this.opts.ref.current, target);
  };
  #resetState = debounce(
    () => {
      for (const eventType in this.#interceptedEvents) {
        this.#interceptedEvents[eventType] = false;
      }
      this.#isResponsibleLayer = false;
    },
    20
  );
  #isAnyEventIntercepted() {
    const i = Object.values(this.#interceptedEvents).some(Boolean);
    return i;
  }
  #onfocuscapture = () => {
    this.#isFocusInsideDOMTree = true;
  };
  #onblurcapture = () => {
    this.#isFocusInsideDOMTree = false;
  };
  props = {
    onfocuscapture: this.#onfocuscapture,
    onblurcapture: this.#onblurcapture
  };
}
function getTopMostDismissableLayer(layersArr = [...globalThis.bitsDismissableLayers]) {
  return layersArr.findLast(([_, { current: behaviorType }]) => behaviorType === "close" || behaviorType === "ignore");
}
function isResponsibleLayer(node) {
  const layersArr = [...globalThis.bitsDismissableLayers];
  const topMostLayer = getTopMostDismissableLayer(layersArr);
  if (topMostLayer) return topMostLayer[0].opts.ref.current === node;
  const [firstLayerNode] = layersArr[0];
  return firstLayerNode.opts.ref.current === node;
}
function isValidEvent(e, node) {
  const target = e.target;
  if (!isElementOrSVGElement(target)) return false;
  const targetIsContextMenuTrigger = Boolean(target.closest(`[${CONTEXT_MENU_TRIGGER_ATTR}]`));
  const nodeIsContextMenu = Boolean(node.closest(`[${CONTEXT_MENU_CONTENT_ATTR}]`));
  if ("button" in e && e.button > 0 && !targetIsContextMenuTrigger) return false;
  if ("button" in e && e.button === 0 && targetIsContextMenuTrigger) return nodeIsContextMenu;
  if (targetIsContextMenuTrigger && nodeIsContextMenu) return false;
  const ownerDocument = getOwnerDocument(target);
  const isValid = ownerDocument.documentElement.contains(target) && !isOrContainsTarget(node, target) && isClickTrulyOutside(e, node);
  return isValid;
}
function createWrappedEvent(e) {
  const capturedCurrentTarget = e.currentTarget;
  const capturedTarget = e.target;
  let newEvent;
  if (e instanceof PointerEvent) {
    newEvent = new PointerEvent(e.type, e);
  } else {
    newEvent = new PointerEvent("pointerdown", e);
  }
  let isPrevented = false;
  const wrappedEvent = new Proxy(newEvent, {
    get: (target, prop) => {
      if (prop === "currentTarget") {
        return capturedCurrentTarget;
      }
      if (prop === "target") {
        return capturedTarget;
      }
      if (prop === "preventDefault") {
        return () => {
          isPrevented = true;
          if (typeof target.preventDefault === "function") {
            target.preventDefault();
          }
        };
      }
      if (prop === "defaultPrevented") {
        return isPrevented;
      }
      if (prop in target) {
        return target[prop];
      }
      return e[prop];
    }
  });
  return wrappedEvent;
}
function Dismissible_layer($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let {
      interactOutsideBehavior = "close",
      onInteractOutside = noop,
      onFocusOutside = noop,
      id,
      children,
      enabled,
      isValidEvent: isValidEvent2 = () => false,
      ref
    } = $$props;
    const dismissibleLayerState = DismissibleLayerState.create({
      id: boxWith(() => id),
      interactOutsideBehavior: boxWith(() => interactOutsideBehavior),
      onInteractOutside: boxWith(() => onInteractOutside),
      enabled: boxWith(() => enabled),
      onFocusOutside: boxWith(() => onFocusOutside),
      isValidEvent: boxWith(() => isValidEvent2),
      ref
    });
    children?.($$renderer2, { props: dismissibleLayerState.props });
    $$renderer2.push(`<!---->`);
  });
}
globalThis.bitsEscapeLayers ??= /* @__PURE__ */ new Map();
class EscapeLayerState {
  static create(opts) {
    return new EscapeLayerState(opts);
  }
  opts;
  domContext;
  constructor(opts) {
    this.opts = opts;
    this.domContext = new DOMContext(this.opts.ref);
    let unsubEvents = noop;
    watch(() => opts.enabled.current, (enabled) => {
      if (enabled) {
        globalThis.bitsEscapeLayers.set(this, opts.escapeKeydownBehavior);
        unsubEvents = this.#addEventListener();
      }
      return () => {
        unsubEvents();
        globalThis.bitsEscapeLayers.delete(this);
      };
    });
  }
  #addEventListener = () => {
    return on(this.domContext.getDocument(), "keydown", this.#onkeydown, { passive: false });
  };
  #onkeydown = (e) => {
    if (e.key !== ESCAPE || !isResponsibleEscapeLayer(this)) return;
    const clonedEvent = new KeyboardEvent(e.type, e);
    e.preventDefault();
    const behaviorType = this.opts.escapeKeydownBehavior.current;
    if (behaviorType !== "close" && behaviorType !== "defer-otherwise-close") return;
    this.opts.onEscapeKeydown.current(clonedEvent);
  };
}
function isResponsibleEscapeLayer(instance) {
  const layersArr = [...globalThis.bitsEscapeLayers];
  const topMostLayer = layersArr.findLast(([_, { current: behaviorType }]) => behaviorType === "close" || behaviorType === "ignore");
  if (topMostLayer) return topMostLayer[0] === instance;
  const [firstLayerNode] = layersArr[0];
  return firstLayerNode === instance;
}
function Escape_layer($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let {
      escapeKeydownBehavior = "close",
      onEscapeKeydown = noop,
      children,
      enabled,
      ref
    } = $$props;
    EscapeLayerState.create({
      escapeKeydownBehavior: boxWith(() => escapeKeydownBehavior),
      onEscapeKeydown: boxWith(() => onEscapeKeydown),
      enabled: boxWith(() => enabled),
      ref
    });
    children?.($$renderer2);
    $$renderer2.push(`<!---->`);
  });
}
class FocusScopeManager {
  static instance;
  #scopeStack = simpleBox([]);
  #focusHistory = /* @__PURE__ */ new WeakMap();
  #preFocusHistory = /* @__PURE__ */ new WeakMap();
  static getInstance() {
    if (!this.instance) {
      this.instance = new FocusScopeManager();
    }
    return this.instance;
  }
  register(scope) {
    const current = this.getActive();
    if (current && current !== scope) {
      current.pause();
    }
    const activeElement = document.activeElement;
    if (activeElement && activeElement !== document.body) {
      this.#preFocusHistory.set(scope, activeElement);
    }
    this.#scopeStack.current = this.#scopeStack.current.filter((s) => s !== scope);
    this.#scopeStack.current.unshift(scope);
  }
  unregister(scope) {
    this.#scopeStack.current = this.#scopeStack.current.filter((s) => s !== scope);
    const next2 = this.getActive();
    if (next2) {
      next2.resume();
    }
  }
  getActive() {
    return this.#scopeStack.current[0];
  }
  setFocusMemory(scope, element2) {
    this.#focusHistory.set(scope, element2);
  }
  getFocusMemory(scope) {
    return this.#focusHistory.get(scope);
  }
  isActiveScope(scope) {
    return this.getActive() === scope;
  }
  setPreFocusMemory(scope, element2) {
    this.#preFocusHistory.set(scope, element2);
  }
  getPreFocusMemory(scope) {
    return this.#preFocusHistory.get(scope);
  }
  clearPreFocusMemory(scope) {
    this.#preFocusHistory.delete(scope);
  }
}
class FocusScope {
  #paused = false;
  #container = null;
  #manager = FocusScopeManager.getInstance();
  #cleanupFns = [];
  #opts;
  constructor(opts) {
    this.#opts = opts;
  }
  get paused() {
    return this.#paused;
  }
  pause() {
    this.#paused = true;
  }
  resume() {
    this.#paused = false;
  }
  #cleanup() {
    for (const fn of this.#cleanupFns) {
      fn();
    }
    this.#cleanupFns = [];
  }
  mount(container) {
    if (this.#container) {
      this.unmount();
    }
    this.#container = container;
    this.#manager.register(this);
    this.#setupEventListeners();
    this.#handleOpenAutoFocus();
  }
  unmount() {
    if (!this.#container) return;
    this.#cleanup();
    this.#handleCloseAutoFocus();
    this.#manager.unregister(this);
    this.#manager.clearPreFocusMemory(this);
    this.#container = null;
  }
  #handleOpenAutoFocus() {
    if (!this.#container) return;
    const event = new CustomEvent("focusScope.onOpenAutoFocus", { bubbles: false, cancelable: true });
    this.#opts.onOpenAutoFocus.current(event);
    if (!event.defaultPrevented) {
      requestAnimationFrame(() => {
        if (!this.#container) return;
        const firstTabbable = this.#getFirstTabbable();
        if (firstTabbable) {
          firstTabbable.focus();
          this.#manager.setFocusMemory(this, firstTabbable);
        } else {
          this.#container.focus();
        }
      });
    }
  }
  #handleCloseAutoFocus() {
    const event = new CustomEvent("focusScope.onCloseAutoFocus", { bubbles: false, cancelable: true });
    this.#opts.onCloseAutoFocus.current?.(event);
    if (!event.defaultPrevented) {
      const preFocusedElement = this.#manager.getPreFocusMemory(this);
      if (preFocusedElement && document.contains(preFocusedElement)) {
        try {
          preFocusedElement.focus();
        } catch {
          document.body.focus();
        }
      }
    }
  }
  #setupEventListeners() {
    if (!this.#container || !this.#opts.trap.current) return;
    const container = this.#container;
    const doc = container.ownerDocument;
    const handleFocus = (e) => {
      if (this.#paused || !this.#manager.isActiveScope(this)) return;
      const target = e.target;
      if (!target) return;
      const isInside = container.contains(target);
      if (isInside) {
        this.#manager.setFocusMemory(this, target);
      } else {
        const lastFocused = this.#manager.getFocusMemory(this);
        if (lastFocused && container.contains(lastFocused) && isFocusable(lastFocused)) {
          e.preventDefault();
          lastFocused.focus();
        } else {
          const firstTabbable = this.#getFirstTabbable();
          const firstFocusable = this.#getAllFocusables()[0];
          (firstTabbable || firstFocusable || container).focus();
        }
      }
    };
    const handleKeydown = (e) => {
      if (!this.#opts.loop || this.#paused || e.key !== "Tab") return;
      if (!this.#manager.isActiveScope(this)) return;
      const tabbables = this.#getTabbables();
      if (tabbables.length === 0) return;
      const first = tabbables[0];
      const last = tabbables[tabbables.length - 1];
      if (!e.shiftKey && doc.activeElement === last) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && doc.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    };
    this.#cleanupFns.push(on(doc, "focusin", handleFocus, { capture: true }), on(container, "keydown", handleKeydown));
    const observer = new MutationObserver(() => {
      const lastFocused = this.#manager.getFocusMemory(this);
      if (lastFocused && !container.contains(lastFocused)) {
        const firstTabbable = this.#getFirstTabbable();
        const firstFocusable = this.#getAllFocusables()[0];
        const elementToFocus = firstTabbable || firstFocusable;
        if (elementToFocus) {
          elementToFocus.focus();
          this.#manager.setFocusMemory(this, elementToFocus);
        } else {
          container.focus();
        }
      }
    });
    observer.observe(container, { childList: true, subtree: true });
    this.#cleanupFns.push(() => observer.disconnect());
  }
  #getTabbables() {
    if (!this.#container) return [];
    return tabbable(this.#container, { includeContainer: false, getShadowRoot: true });
  }
  #getFirstTabbable() {
    const tabbables = this.#getTabbables();
    return tabbables[0] || null;
  }
  #getAllFocusables() {
    if (!this.#container) return [];
    return focusable(this.#container, { includeContainer: false, getShadowRoot: true });
  }
  static use(opts) {
    let scope = null;
    watch([() => opts.ref.current, () => opts.enabled.current], ([ref, enabled]) => {
      if (ref && enabled) {
        if (!scope) {
          scope = new FocusScope(opts);
        }
        scope.mount(ref);
      } else if (scope) {
        scope.unmount();
        scope = null;
      }
    });
    return {
      get props() {
        return { tabindex: -1 };
      }
    };
  }
}
function Focus_scope($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let {
      enabled = false,
      trapFocus = false,
      loop = false,
      onCloseAutoFocus = noop,
      onOpenAutoFocus = noop,
      focusScope,
      ref
    } = $$props;
    const focusScopeState = FocusScope.use({
      enabled: boxWith(() => enabled),
      trap: boxWith(() => trapFocus),
      loop,
      onCloseAutoFocus: boxWith(() => onCloseAutoFocus),
      onOpenAutoFocus: boxWith(() => onOpenAutoFocus),
      ref
    });
    focusScope?.($$renderer2, { props: focusScopeState.props });
    $$renderer2.push(`<!---->`);
  });
}
globalThis.bitsTextSelectionLayers ??= /* @__PURE__ */ new Map();
class TextSelectionLayerState {
  static create(opts) {
    return new TextSelectionLayerState(opts);
  }
  opts;
  domContext;
  #unsubSelectionLock = noop;
  constructor(opts) {
    this.opts = opts;
    this.domContext = new DOMContext(opts.ref);
    let unsubEvents = noop;
    watch(() => this.opts.enabled.current, (isEnabled) => {
      if (isEnabled) {
        globalThis.bitsTextSelectionLayers.set(this, this.opts.enabled);
        unsubEvents();
        unsubEvents = this.#addEventListeners();
      }
      return () => {
        unsubEvents();
        this.#resetSelectionLock();
        globalThis.bitsTextSelectionLayers.delete(this);
      };
    });
  }
  #addEventListeners() {
    return executeCallbacks(on(this.domContext.getDocument(), "pointerdown", this.#pointerdown), on(this.domContext.getDocument(), "pointerup", composeHandlers(this.#resetSelectionLock, this.opts.onPointerUp.current)));
  }
  #pointerdown = (e) => {
    const node = this.opts.ref.current;
    const target = e.target;
    if (!isHTMLElement(node) || !isHTMLElement(target) || !this.opts.enabled.current) return;
    if (!isHighestLayer(this) || !contains(node, target)) return;
    this.opts.onPointerDown.current(e);
    if (e.defaultPrevented) return;
    this.#unsubSelectionLock = preventTextSelectionOverflow(node, this.domContext.getDocument().body);
  };
  #resetSelectionLock = () => {
    this.#unsubSelectionLock();
    this.#unsubSelectionLock = noop;
  };
}
const getUserSelect = (node) => node.style.userSelect || node.style.webkitUserSelect;
function preventTextSelectionOverflow(node, body) {
  const originalBodyUserSelect = getUserSelect(body);
  const originalNodeUserSelect = getUserSelect(node);
  setUserSelect(body, "none");
  setUserSelect(node, "text");
  return () => {
    setUserSelect(body, originalBodyUserSelect);
    setUserSelect(node, originalNodeUserSelect);
  };
}
function setUserSelect(node, value) {
  node.style.userSelect = value;
  node.style.webkitUserSelect = value;
}
function isHighestLayer(instance) {
  const layersArr = [...globalThis.bitsTextSelectionLayers];
  if (!layersArr.length) return false;
  const highestLayer = layersArr.at(-1);
  if (!highestLayer) return false;
  return highestLayer[0] === instance;
}
function Text_selection_layer($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let {
      preventOverflowTextSelection = true,
      onPointerDown = noop,
      onPointerUp = noop,
      id,
      children,
      enabled,
      ref
    } = $$props;
    TextSelectionLayerState.create({
      id: boxWith(() => id),
      onPointerDown: boxWith(() => onPointerDown),
      onPointerUp: boxWith(() => onPointerUp),
      enabled: boxWith(() => enabled && preventOverflowTextSelection),
      ref
    });
    children?.($$renderer2);
    $$renderer2.push(`<!---->`);
  });
}
globalThis.bitsIdCounter ??= { current: 0 };
function useId(prefix = "bits") {
  globalThis.bitsIdCounter.current++;
  return `${prefix}-${globalThis.bitsIdCounter.current}`;
}
class SharedState {
  #factory;
  #subscribers = 0;
  #state;
  #scope;
  constructor(factory) {
    this.#factory = factory;
  }
  #dispose() {
    this.#subscribers -= 1;
    if (this.#scope && this.#subscribers <= 0) {
      this.#scope();
      this.#state = void 0;
      this.#scope = void 0;
    }
  }
  get(...args) {
    this.#subscribers += 1;
    if (this.#state === void 0) {
      this.#scope = () => {
      };
    }
    return this.#state;
  }
}
const lockMap = new SvelteMap();
let initialBodyStyle = null;
let cleanupTimeoutId = null;
let isInCleanupTransition = false;
const anyLocked = boxWith(() => {
  for (const value of lockMap.values()) {
    if (value) return true;
  }
  return false;
});
let cleanupScheduledAt = null;
const bodyLockStackCount = new SharedState(() => {
  function resetBodyStyle() {
    return;
  }
  function cancelPendingCleanup() {
    if (cleanupTimeoutId === null) return;
    window.clearTimeout(cleanupTimeoutId);
    cleanupTimeoutId = null;
  }
  function scheduleCleanupIfNoNewLocks(delay, callback) {
    cancelPendingCleanup();
    isInCleanupTransition = true;
    cleanupScheduledAt = Date.now();
    const currentCleanupId = cleanupScheduledAt;
    const cleanupFn = () => {
      cleanupTimeoutId = null;
      if (cleanupScheduledAt !== currentCleanupId) return;
      if (!isAnyLocked(lockMap)) {
        isInCleanupTransition = false;
        callback();
      } else {
        isInCleanupTransition = false;
      }
    };
    const actualDelay = delay === null ? 24 : delay;
    cleanupTimeoutId = window.setTimeout(cleanupFn, actualDelay);
  }
  function ensureInitialStyleCaptured() {
    if (initialBodyStyle === null && lockMap.size === 0 && !isInCleanupTransition) {
      initialBodyStyle = document.body.getAttribute("style");
    }
  }
  watch(() => anyLocked.current, () => {
    if (!anyLocked.current) return;
    ensureInitialStyleCaptured();
    isInCleanupTransition = false;
    const htmlStyle = getComputedStyle(document.documentElement);
    const bodyStyle = getComputedStyle(document.body);
    const hasStableGutter = htmlStyle.scrollbarGutter?.includes("stable") || bodyStyle.scrollbarGutter?.includes("stable");
    const verticalScrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    const paddingRight = Number.parseInt(bodyStyle.paddingRight ?? "0", 10);
    const config = {
      padding: paddingRight + verticalScrollbarWidth,
      margin: Number.parseInt(bodyStyle.marginRight ?? "0", 10)
    };
    if (verticalScrollbarWidth > 0 && !hasStableGutter) {
      document.body.style.paddingRight = `${config.padding}px`;
      document.body.style.marginRight = `${config.margin}px`;
      document.body.style.setProperty("--scrollbar-width", `${verticalScrollbarWidth}px`);
    }
    document.body.style.overflow = "hidden";
    if (isIOS) {
      on(
        document,
        "touchmove",
        (e) => {
          if (e.target !== document.documentElement) return;
          if (e.touches.length > 1) return;
          e.preventDefault();
        },
        { passive: false }
      );
    }
    afterTick(() => {
      document.body.style.pointerEvents = "none";
      document.body.style.overflow = "hidden";
    });
  });
  return {
    get lockMap() {
      return lockMap;
    },
    resetBodyStyle,
    scheduleCleanupIfNoNewLocks,
    cancelPendingCleanup,
    ensureInitialStyleCaptured
  };
});
class BodyScrollLock {
  #id = useId();
  #initialState;
  #restoreScrollDelay = () => null;
  #countState;
  locked;
  constructor(initialState, restoreScrollDelay = () => null) {
    this.#initialState = initialState;
    this.#restoreScrollDelay = restoreScrollDelay;
    this.#countState = bodyLockStackCount.get();
    if (!this.#countState) return;
    this.#countState.cancelPendingCleanup();
    this.#countState.ensureInitialStyleCaptured();
    this.#countState.lockMap.set(this.#id, this.#initialState ?? false);
    this.locked = boxWith(() => this.#countState.lockMap.get(this.#id) ?? false, (v) => this.#countState.lockMap.set(this.#id, v));
  }
}
function isAnyLocked(map) {
  for (const [_, value] of map) {
    if (value) return true;
  }
  return false;
}
function Scroll_lock($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { preventScroll = true, restoreScrollDelay = null } = $$props;
    if (preventScroll) {
      new BodyScrollLock(preventScroll, () => restoreScrollDelay);
    }
  });
}
function Dialog_overlay($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const uid = props_id($$renderer2);
    let {
      id = createId(uid),
      forceMount = false,
      child,
      children,
      ref = null,
      $$slots,
      $$events,
      ...restProps
    } = $$props;
    const overlayState = DialogOverlayState.create({
      id: boxWith(() => id),
      ref: boxWith(() => ref, (v) => ref = v)
    });
    const mergedProps = derived(() => mergeProps(restProps, overlayState.props));
    if (overlayState.shouldRender || forceMount) {
      $$renderer2.push("<!--[0-->");
      if (child) {
        $$renderer2.push("<!--[0-->");
        child($$renderer2, {
          props: mergeProps(mergedProps()),
          ...overlayState.snippetProps
        });
        $$renderer2.push(`<!---->`);
      } else {
        $$renderer2.push("<!--[-1-->");
        $$renderer2.push(`<div${attributes({ ...mergeProps(mergedProps()) })}>`);
        children?.($$renderer2, overlayState.snippetProps);
        $$renderer2.push(`<!----></div>`);
      }
      $$renderer2.push(`<!--]-->`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]-->`);
    bind_props($$props, { ref });
  });
}
function Dialog_description($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const uid = props_id($$renderer2);
    let {
      id = createId(uid),
      children,
      child,
      ref = null,
      $$slots,
      $$events,
      ...restProps
    } = $$props;
    const descriptionState = DialogDescriptionState.create({
      id: boxWith(() => id),
      ref: boxWith(() => ref, (v) => ref = v)
    });
    const mergedProps = derived(() => mergeProps(restProps, descriptionState.props));
    if (child) {
      $$renderer2.push("<!--[0-->");
      child($$renderer2, { props: mergedProps() });
      $$renderer2.push(`<!---->`);
    } else {
      $$renderer2.push("<!--[-1-->");
      $$renderer2.push(`<div${attributes({ ...mergedProps() })}>`);
      children?.($$renderer2);
      $$renderer2.push(`<!----></div>`);
    }
    $$renderer2.push(`<!--]-->`);
    bind_props($$props, { ref });
  });
}
function Button($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let {
      href,
      type,
      children,
      disabled = false,
      ref = null,
      $$slots,
      $$events,
      ...restProps
    } = $$props;
    element(
      $$renderer2,
      href ? "a" : "button",
      () => {
        $$renderer2.push(`${attributes({
          "data-button-root": true,
          type: href ? void 0 : type,
          href: href && !disabled ? href : void 0,
          disabled: href ? void 0 : disabled,
          "aria-disabled": href ? disabled : void 0,
          role: href && disabled ? "link" : void 0,
          tabindex: href && disabled ? -1 : 0,
          ...restProps
        })}`);
      },
      () => {
        children?.($$renderer2);
        $$renderer2.push(`<!---->`);
      }
    );
    bind_props($$props, { ref });
  });
}
function Hidden_input($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { value = void 0, $$slots, $$events, ...restProps } = $$props;
    const mergedProps = derived(() => mergeProps(restProps, {
      "aria-hidden": "true",
      tabindex: -1,
      style: { ...srOnlyStyles, position: "absolute", top: "0", left: "0" }
    }));
    if (mergedProps().type === "checkbox") {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<input${attributes({ ...mergedProps(), value }, void 0, void 0, void 0, 4)}/>`);
    } else {
      $$renderer2.push("<!--[-1-->");
      $$renderer2.push(`<input${attributes({ value, ...mergedProps() }, void 0, void 0, void 0, 4)}/>`);
    }
    $$renderer2.push(`<!--]-->`);
    bind_props($$props, { value });
  });
}
function get(valueOrGetValue) {
  return typeof valueOrGetValue === "function" ? valueOrGetValue() : valueOrGetValue;
}
function getDPR(element2) {
  if (typeof window === "undefined") return 1;
  const win = element2.ownerDocument.defaultView || window;
  return win.devicePixelRatio || 1;
}
function roundByDPR(element2, value) {
  const dpr = getDPR(element2);
  return Math.round(value * dpr) / dpr;
}
function getFloatingContentCSSVars(name) {
  return {
    [`--bits-${name}-content-transform-origin`]: `var(--bits-floating-transform-origin)`,
    [`--bits-${name}-content-available-width`]: `var(--bits-floating-available-width)`,
    [`--bits-${name}-content-available-height`]: `var(--bits-floating-available-height)`,
    [`--bits-${name}-anchor-width`]: `var(--bits-floating-anchor-width)`,
    [`--bits-${name}-anchor-height`]: `var(--bits-floating-anchor-height)`
  };
}
function useFloating(options) {
  const openOption = derived(() => get(options.open) ?? true);
  const middlewareOption = derived(() => get(options.middleware));
  const transformOption = derived(() => get(options.transform) ?? true);
  const placementOption = derived(() => get(options.placement) ?? "bottom");
  const strategyOption = derived(() => get(options.strategy) ?? "absolute");
  const sideOffsetOption = derived(() => get(options.sideOffset) ?? 0);
  const alignOffsetOption = derived(() => get(options.alignOffset) ?? 0);
  const reference = options.reference;
  let x = 0;
  let y = 0;
  const floating = simpleBox(null);
  let strategy = strategyOption();
  let placement = placementOption();
  let middlewareData = {};
  let isPositioned = false;
  let updateRequestId = 0;
  const floatingStyles = derived(() => {
    const xVal = floating.current ? roundByDPR(floating.current, x) : x;
    const yVal = floating.current ? roundByDPR(floating.current, y) : y;
    if (transformOption()) {
      return {
        position: strategy,
        left: "0",
        top: "0",
        transform: `translate(${xVal}px, ${yVal}px)`,
        ...floating.current && getDPR(floating.current) >= 1.5 && { willChange: "transform" }
      };
    }
    return { position: strategy, left: `${xVal}px`, top: `${yVal}px` };
  });
  function update() {
    if (reference.current === null || floating.current === null) return;
    const referenceNode = reference.current;
    const floatingNode = floating.current;
    const requestId = ++updateRequestId;
    computePosition(referenceNode, floatingNode, {
      middleware: middlewareOption(),
      placement: placementOption(),
      strategy: strategyOption()
    }).then((position) => {
      if (requestId !== updateRequestId) return;
      if (reference.current !== referenceNode || floating.current !== floatingNode) return;
      const referenceHidden = isReferenceHidden(referenceNode);
      if (referenceHidden) {
        middlewareData = {
          ...middlewareData,
          hide: {
            // oxlint-disable-next-line no-explicit-any
            ...middlewareData.hide,
            referenceHidden: true
          }
        };
        return;
      }
      if (!openOption() && x !== 0 && y !== 0) {
        const maxExpectedOffset = Math.max(Math.abs(sideOffsetOption()), Math.abs(alignOffsetOption()), 15);
        if (position.x <= maxExpectedOffset && position.y <= maxExpectedOffset) return;
      }
      x = position.x;
      y = position.y;
      strategy = position.strategy;
      placement = position.placement;
      middlewareData = position.middlewareData;
      isPositioned = true;
    });
  }
  return {
    floating,
    reference,
    get strategy() {
      return strategy;
    },
    get placement() {
      return placement;
    },
    get middlewareData() {
      return middlewareData;
    },
    get isPositioned() {
      return isPositioned;
    },
    get floatingStyles() {
      return floatingStyles();
    },
    get update() {
      return update;
    }
  };
}
function isReferenceHidden(node) {
  if (!(node instanceof Element)) return false;
  if (!node.isConnected) return true;
  if (node instanceof HTMLElement && node.hidden) return true;
  return node.getClientRects().length === 0;
}
const OPPOSITE_SIDE = { top: "bottom", right: "left", bottom: "top", left: "right" };
const FloatingRootContext = new Context2("Floating.Root");
const FloatingContentContext = new Context2("Floating.Content");
const FloatingTooltipRootContext = new Context2("Floating.Root");
class FloatingRootState {
  static create(tooltip = false) {
    return tooltip ? FloatingTooltipRootContext.set(new FloatingRootState()) : FloatingRootContext.set(new FloatingRootState());
  }
  anchorNode = simpleBox(null);
  customAnchorNode = simpleBox(null);
  triggerNode = simpleBox(null);
  constructor() {
  }
}
class FloatingContentState {
  static create(opts, tooltip = false) {
    return tooltip ? FloatingContentContext.set(new FloatingContentState(opts, FloatingTooltipRootContext.get())) : FloatingContentContext.set(new FloatingContentState(opts, FloatingRootContext.get()));
  }
  opts;
  root;
  // nodes
  contentRef = simpleBox(null);
  wrapperRef = simpleBox(null);
  arrowRef = simpleBox(null);
  contentAttachment = attachRef(this.contentRef);
  wrapperAttachment = attachRef(this.wrapperRef);
  arrowAttachment = attachRef(this.arrowRef);
  // ids
  arrowId = simpleBox(useId());
  #transformedStyle = derived(() => {
    if (typeof this.opts.style === "string") return cssToStyleObj(this.opts.style);
    if (!this.opts.style) return {};
  });
  #updatePositionStrategy = void 0;
  #arrowSize = new ElementSize(() => this.arrowRef.current ?? void 0);
  #arrowWidth = derived(() => this.#arrowSize?.width ?? 0);
  #arrowHeight = derived(() => this.#arrowSize?.height ?? 0);
  #desiredPlacement = derived(() => this.opts.side?.current + (this.opts.align.current !== "center" ? `-${this.opts.align.current}` : ""));
  #boundary = derived(() => Array.isArray(this.opts.collisionBoundary.current) ? this.opts.collisionBoundary.current : [this.opts.collisionBoundary.current]);
  #hasExplicitBoundaries = derived(() => this.#boundary().length > 0);
  get hasExplicitBoundaries() {
    return this.#hasExplicitBoundaries();
  }
  set hasExplicitBoundaries($$value) {
    return this.#hasExplicitBoundaries($$value);
  }
  #detectOverflowOptions = derived(() => ({
    padding: this.opts.collisionPadding.current,
    boundary: this.#boundary().filter(isNotNull),
    altBoundary: this.hasExplicitBoundaries
  }));
  get detectOverflowOptions() {
    return this.#detectOverflowOptions();
  }
  set detectOverflowOptions($$value) {
    return this.#detectOverflowOptions($$value);
  }
  #availableWidth = void 0;
  #availableHeight = void 0;
  #anchorWidth = void 0;
  #anchorHeight = void 0;
  #middleware = derived(() => [
    offset({
      mainAxis: this.opts.sideOffset.current + this.#arrowHeight(),
      alignmentAxis: this.opts.alignOffset.current
    }),
    this.opts.avoidCollisions.current && shift({
      mainAxis: true,
      crossAxis: false,
      limiter: this.opts.sticky.current === "partial" ? limitShift() : void 0,
      ...this.detectOverflowOptions
    }),
    this.opts.avoidCollisions.current && flip({ ...this.detectOverflowOptions }),
    size({
      ...this.detectOverflowOptions,
      apply: ({ rects, availableWidth, availableHeight }) => {
        const { width: anchorWidth, height: anchorHeight } = rects.reference;
        this.#availableWidth = availableWidth;
        this.#availableHeight = availableHeight;
        this.#anchorWidth = anchorWidth;
        this.#anchorHeight = anchorHeight;
      }
    }),
    this.arrowRef.current && arrow({
      element: this.arrowRef.current,
      padding: this.opts.arrowPadding.current
    }),
    transformOrigin({
      arrowWidth: this.#arrowWidth(),
      arrowHeight: this.#arrowHeight()
    }),
    this.opts.hideWhenDetached.current && hide({ strategy: "referenceHidden", ...this.detectOverflowOptions })
  ].filter(Boolean));
  get middleware() {
    return this.#middleware();
  }
  set middleware($$value) {
    return this.#middleware($$value);
  }
  floating;
  #placedSide = derived(() => getSideFromPlacement(this.floating.placement));
  get placedSide() {
    return this.#placedSide();
  }
  set placedSide($$value) {
    return this.#placedSide($$value);
  }
  #placedAlign = derived(() => getAlignFromPlacement(this.floating.placement));
  get placedAlign() {
    return this.#placedAlign();
  }
  set placedAlign($$value) {
    return this.#placedAlign($$value);
  }
  #arrowX = derived(() => this.floating.middlewareData.arrow?.x ?? 0);
  get arrowX() {
    return this.#arrowX();
  }
  set arrowX($$value) {
    return this.#arrowX($$value);
  }
  #arrowY = derived(() => this.floating.middlewareData.arrow?.y ?? 0);
  get arrowY() {
    return this.#arrowY();
  }
  set arrowY($$value) {
    return this.#arrowY($$value);
  }
  #cannotCenterArrow = derived(() => this.floating.middlewareData.arrow?.centerOffset !== 0);
  get cannotCenterArrow() {
    return this.#cannotCenterArrow();
  }
  set cannotCenterArrow($$value) {
    return this.#cannotCenterArrow($$value);
  }
  contentZIndex;
  #arrowBaseSide = derived(() => OPPOSITE_SIDE[this.placedSide]);
  get arrowBaseSide() {
    return this.#arrowBaseSide();
  }
  set arrowBaseSide($$value) {
    return this.#arrowBaseSide($$value);
  }
  #wrapperProps = derived(() => ({
    id: this.opts.wrapperId.current,
    "data-bits-floating-content-wrapper": "",
    style: {
      ...this.floating.floatingStyles,
      transform: this.floating.isPositioned ? this.floating.floatingStyles.transform : "translate(0, -200%)",
      minWidth: "max-content",
      zIndex: this.contentZIndex,
      "--bits-floating-transform-origin": `${this.floating.middlewareData.transformOrigin?.x} ${this.floating.middlewareData.transformOrigin?.y}`,
      "--bits-floating-available-width": `${this.#availableWidth}px`,
      "--bits-floating-available-height": `${this.#availableHeight}px`,
      "--bits-floating-anchor-width": `${this.#anchorWidth}px`,
      "--bits-floating-anchor-height": `${this.#anchorHeight}px`,
      ...this.floating.middlewareData.hide?.referenceHidden && { visibility: "hidden", "pointer-events": "none" },
      ...this.#transformedStyle()
    },
    dir: this.opts.dir.current,
    ...this.wrapperAttachment
  }));
  get wrapperProps() {
    return this.#wrapperProps();
  }
  set wrapperProps($$value) {
    return this.#wrapperProps($$value);
  }
  #props = derived(() => ({
    "data-side": this.placedSide,
    "data-align": this.placedAlign,
    style: styleToString({ ...this.#transformedStyle() }),
    ...this.contentAttachment
  }));
  get props() {
    return this.#props();
  }
  set props($$value) {
    return this.#props($$value);
  }
  #arrowStyle = derived(() => ({
    position: "absolute",
    left: this.arrowX ? `${this.arrowX}px` : void 0,
    top: this.arrowY ? `${this.arrowY}px` : void 0,
    [this.arrowBaseSide]: 0,
    "transform-origin": { top: "", right: "0 0", bottom: "center 0", left: "100% 0" }[this.placedSide],
    transform: {
      top: "translateY(100%)",
      right: "translateY(50%) rotate(90deg) translateX(-50%)",
      bottom: "rotate(180deg)",
      left: "translateY(50%) rotate(-90deg) translateX(50%)"
    }[this.placedSide],
    visibility: this.cannotCenterArrow ? "hidden" : void 0
  }));
  get arrowStyle() {
    return this.#arrowStyle();
  }
  set arrowStyle($$value) {
    return this.#arrowStyle($$value);
  }
  constructor(opts, root) {
    this.opts = opts;
    this.root = root;
    this.#updatePositionStrategy = opts.updatePositionStrategy;
    if (opts.customAnchor) {
      this.root.customAnchorNode.current = opts.customAnchor.current;
    }
    watch(() => opts.customAnchor.current, (customAnchor) => {
      this.root.customAnchorNode.current = customAnchor;
    });
    this.floating = useFloating({
      strategy: () => this.opts.strategy.current,
      placement: () => this.#desiredPlacement(),
      middleware: () => this.middleware,
      reference: this.root.anchorNode,
      open: () => this.opts.enabled.current,
      sideOffset: () => this.opts.sideOffset.current,
      alignOffset: () => this.opts.alignOffset.current
    });
    watch(() => this.contentRef.current, (contentNode) => {
      if (!contentNode || !this.opts.enabled.current) return;
      const win = getWindow(contentNode);
      const rafId = win.requestAnimationFrame(() => {
        if (this.contentRef.current !== contentNode || !this.opts.enabled.current) return;
        const zIndex = win.getComputedStyle(contentNode).zIndex;
        if (zIndex !== this.contentZIndex) {
          this.contentZIndex = zIndex;
        }
      });
      return () => {
        win.cancelAnimationFrame(rafId);
      };
    });
  }
}
class FloatingAnchorState {
  static create(opts, tooltip = false) {
    return tooltip ? new FloatingAnchorState(opts, FloatingTooltipRootContext.get()) : new FloatingAnchorState(opts, FloatingRootContext.get());
  }
  opts;
  root;
  constructor(opts, root) {
    this.opts = opts;
    this.root = root;
    if (opts.virtualEl && opts.virtualEl.current) {
      root.triggerNode = boxFrom(opts.virtualEl.current);
    } else {
      root.triggerNode = opts.ref;
    }
  }
}
function transformOrigin(options) {
  return {
    name: "transformOrigin",
    options,
    fn(data) {
      const { placement, rects, middlewareData } = data;
      const cannotCenterArrow = middlewareData.arrow?.centerOffset !== 0;
      const isArrowHidden = cannotCenterArrow;
      const arrowWidth = isArrowHidden ? 0 : options.arrowWidth;
      const arrowHeight = isArrowHidden ? 0 : options.arrowHeight;
      const [placedSide, placedAlign] = getSideAndAlignFromPlacement(placement);
      const noArrowAlign = { start: "0%", center: "50%", end: "100%" }[placedAlign];
      const arrowXCenter = (middlewareData.arrow?.x ?? 0) + arrowWidth / 2;
      const arrowYCenter = (middlewareData.arrow?.y ?? 0) + arrowHeight / 2;
      let x = "";
      let y = "";
      if (placedSide === "bottom") {
        x = isArrowHidden ? noArrowAlign : `${arrowXCenter}px`;
        y = `${-arrowHeight}px`;
      } else if (placedSide === "top") {
        x = isArrowHidden ? noArrowAlign : `${arrowXCenter}px`;
        y = `${rects.floating.height + arrowHeight}px`;
      } else if (placedSide === "right") {
        x = `${-arrowHeight}px`;
        y = isArrowHidden ? noArrowAlign : `${arrowYCenter}px`;
      } else if (placedSide === "left") {
        x = `${rects.floating.width + arrowHeight}px`;
        y = isArrowHidden ? noArrowAlign : `${arrowYCenter}px`;
      }
      return { data: { x, y } };
    }
  };
}
function getSideAndAlignFromPlacement(placement) {
  const [side, align = "center"] = placement.split("-");
  return [side, align];
}
function getSideFromPlacement(placement) {
  return getSideAndAlignFromPlacement(placement)[0];
}
function getAlignFromPlacement(placement) {
  return getSideAndAlignFromPlacement(placement)[1];
}
function Floating_layer($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { children, tooltip = false } = $$props;
    FloatingRootState.create(tooltip);
    children?.($$renderer2);
    $$renderer2.push(`<!---->`);
  });
}
class DataTypeahead {
  #opts;
  #candidateValues = derived(() => this.#opts.candidateValues());
  #search;
  constructor(opts) {
    this.#opts = opts;
    this.#search = boxAutoReset("", { afterMs: 1e3, getWindow: this.#opts.getWindow });
    this.handleTypeaheadSearch = this.handleTypeaheadSearch.bind(this);
    this.resetTypeahead = this.resetTypeahead.bind(this);
  }
  handleTypeaheadSearch(key) {
    if (!this.#opts.enabled() || !this.#candidateValues().length) return;
    this.#search.current = this.#search.current + key;
    const currentItem = this.#opts.getCurrentItem();
    const currentMatch = this.#candidateValues().find((item) => item === currentItem) ?? "";
    const values = this.#candidateValues().map((item) => item ?? "");
    const nextMatch = getNextMatch(values, this.#search.current, currentMatch);
    const newItem = this.#candidateValues().find((item) => item === nextMatch);
    if (newItem) {
      this.#opts.onMatch(newItem);
    }
    return newItem;
  }
  resetTypeahead() {
    this.#search.current = "";
  }
}
const FIRST_KEYS = [ARROW_DOWN, PAGE_UP, HOME];
const LAST_KEYS = [ARROW_UP, PAGE_DOWN, END];
const FIRST_LAST_KEYS = [...FIRST_KEYS, ...LAST_KEYS];
const selectAttrs = createBitsAttrs({
  component: "select",
  parts: [
    "trigger",
    "content",
    "item",
    "viewport",
    "scroll-up-button",
    "scroll-down-button",
    "group",
    "group-label",
    "separator",
    "arrow",
    "input",
    "content-wrapper",
    "item-text",
    "value"
  ]
});
const SelectRootContext = new Context2("Select.Root | Combobox.Root");
const SelectGroupContext = new Context2("Select.Group | Combobox.Group");
const SelectContentContext = new Context2("Select.Content | Combobox.Content");
class SelectBaseRootState {
  opts;
  touchedInput = false;
  inputNode = null;
  contentNode = null;
  contentPresence;
  viewportNode = null;
  triggerNode = null;
  valueId = "";
  highlightedNode = null;
  #highlightedValue = derived(() => {
    if (!this.highlightedNode) return null;
    return this.highlightedNode.getAttribute("data-value");
  });
  get highlightedValue() {
    return this.#highlightedValue();
  }
  set highlightedValue($$value) {
    return this.#highlightedValue($$value);
  }
  #highlightedId = derived(() => {
    if (!this.highlightedNode) return void 0;
    return this.highlightedNode.id;
  });
  get highlightedId() {
    return this.#highlightedId();
  }
  set highlightedId($$value) {
    return this.#highlightedId($$value);
  }
  #highlightedLabel = derived(() => {
    if (!this.highlightedNode) return null;
    return this.highlightedNode.getAttribute("data-label");
  });
  get highlightedLabel() {
    return this.#highlightedLabel();
  }
  set highlightedLabel($$value) {
    return this.#highlightedLabel($$value);
  }
  contentIsPositioned = false;
  isUsingKeyboard = false;
  isCombobox = false;
  domContext = new DOMContext(() => null);
  constructor(opts) {
    this.opts = opts;
    this.isCombobox = opts.isCombobox;
    this.contentPresence = new PresenceManager({
      ref: boxWith(() => this.contentNode),
      open: this.opts.open,
      onComplete: () => {
        this.opts.onOpenChangeComplete.current(this.opts.open.current);
      }
    });
  }
  setHighlightedNode(node, initial = false) {
    this.highlightedNode = node;
    if (node && (this.isUsingKeyboard || initial)) {
      this.scrollHighlightedNodeIntoView(node);
    }
  }
  scrollHighlightedNodeIntoView(node) {
    if (!this.viewportNode || !this.contentIsPositioned) return;
    node.scrollIntoView({ block: this.opts.scrollAlignment.current });
  }
  getCandidateNodes() {
    const node = this.contentNode;
    if (!node) return [];
    return Array.from(node.querySelectorAll(`[${this.getBitsAttr("item")}]:not([data-disabled])`));
  }
  setHighlightedToFirstCandidate(initial = false) {
    this.setHighlightedNode(null);
    let nodes = this.getCandidateNodes();
    if (!nodes.length) return;
    if (this.viewportNode) {
      const viewportRect = this.viewportNode.getBoundingClientRect();
      nodes = nodes.filter((node) => {
        if (!this.viewportNode) return false;
        const nodeRect = node.getBoundingClientRect();
        const isNodeFullyVisible = nodeRect.right <= viewportRect.right && nodeRect.left >= viewportRect.left && nodeRect.bottom <= viewportRect.bottom && nodeRect.top >= viewportRect.top;
        return isNodeFullyVisible;
      });
    }
    this.setHighlightedNode(nodes[0], initial);
  }
  getNodeByValue(value) {
    const candidateNodes = this.getCandidateNodes();
    return candidateNodes.find((node) => node.dataset.value === value) ?? null;
  }
  setOpen(open) {
    this.opts.open.current = open;
  }
  toggleOpen() {
    this.opts.open.current = !this.opts.open.current;
  }
  handleOpen() {
    this.setOpen(true);
  }
  handleClose() {
    this.setHighlightedNode(null);
    this.setOpen(false);
  }
  toggleMenu() {
    this.toggleOpen();
  }
  getBitsAttr = (part) => {
    return selectAttrs.getAttr(part, this.isCombobox ? "combobox" : void 0);
  };
}
class SelectSingleRootState extends SelectBaseRootState {
  opts;
  isMulti = false;
  #hasValue = derived(() => this.opts.value.current !== "");
  get hasValue() {
    return this.#hasValue();
  }
  set hasValue($$value) {
    return this.#hasValue($$value);
  }
  #currentLabel = derived(() => {
    if (!this.opts.items.current.length) return "";
    return this.opts.items.current.find((item) => item.value === this.opts.value.current)?.label ?? "";
  });
  get currentLabel() {
    return this.#currentLabel();
  }
  set currentLabel($$value) {
    return this.#currentLabel($$value);
  }
  #candidateLabels = derived(() => {
    if (!this.opts.items.current.length) return [];
    const filteredItems = this.opts.items.current.filter((item) => !item.disabled);
    return filteredItems.map((item) => item.label);
  });
  get candidateLabels() {
    return this.#candidateLabels();
  }
  set candidateLabels($$value) {
    return this.#candidateLabels($$value);
  }
  #dataTypeaheadEnabled = derived(() => {
    if (this.isMulti) return false;
    if (this.opts.items.current.length === 0) return false;
    return true;
  });
  get dataTypeaheadEnabled() {
    return this.#dataTypeaheadEnabled();
  }
  set dataTypeaheadEnabled($$value) {
    return this.#dataTypeaheadEnabled($$value);
  }
  constructor(opts) {
    super(opts);
    this.opts = opts;
    watch(() => this.opts.open.current, () => {
      if (!this.opts.open.current) return;
      this.setInitialHighlightedNode();
    });
  }
  includesItem(itemValue) {
    return this.opts.value.current === itemValue;
  }
  toggleItem(itemValue, itemLabel = itemValue) {
    const newValue = this.includesItem(itemValue) ? "" : itemValue;
    this.opts.value.current = newValue;
    if (newValue !== "") {
      this.opts.inputValue.current = itemLabel;
    }
  }
  setInitialHighlightedNode() {
    afterTick(() => {
      if (this.highlightedNode && this.domContext.getDocument().contains(this.highlightedNode)) return;
      if (this.opts.value.current !== "") {
        const node = this.getNodeByValue(this.opts.value.current);
        if (node) {
          this.setHighlightedNode(node, true);
          return;
        }
      }
      this.setHighlightedToFirstCandidate(true);
    });
  }
}
class SelectMultipleRootState extends SelectBaseRootState {
  opts;
  isMulti = true;
  #hasValue = derived(() => this.opts.value.current.length > 0);
  get hasValue() {
    return this.#hasValue();
  }
  set hasValue($$value) {
    return this.#hasValue($$value);
  }
  constructor(opts) {
    super(opts);
    this.opts = opts;
    watch(() => this.opts.open.current, () => {
      if (!this.opts.open.current) return;
      this.setInitialHighlightedNode();
    });
  }
  includesItem(itemValue) {
    return this.opts.value.current.includes(itemValue);
  }
  toggleItem(itemValue, itemLabel = itemValue) {
    if (this.includesItem(itemValue)) {
      this.opts.value.current = this.opts.value.current.filter((v) => v !== itemValue);
    } else {
      this.opts.value.current = [...this.opts.value.current, itemValue];
    }
    this.opts.inputValue.current = itemLabel;
  }
  setInitialHighlightedNode() {
    afterTick(() => {
      if (!this.domContext) return;
      if (this.highlightedNode && this.domContext.getDocument().contains(this.highlightedNode)) return;
      if (this.opts.value.current.length && this.opts.value.current[0] !== "") {
        const node = this.getNodeByValue(this.opts.value.current[0]);
        if (node) {
          this.setHighlightedNode(node, true);
          return;
        }
      }
      this.setHighlightedToFirstCandidate(true);
    });
  }
}
class SelectRootState {
  static create(props) {
    const { type, ...rest } = props;
    const rootState = type === "single" ? new SelectSingleRootState(rest) : new SelectMultipleRootState(rest);
    return SelectRootContext.set(rootState);
  }
}
class SelectTriggerState {
  static create(opts) {
    return new SelectTriggerState(opts, SelectRootContext.get());
  }
  opts;
  root;
  attachment;
  #domTypeahead;
  #dataTypeahead;
  constructor(opts, root) {
    this.opts = opts;
    this.root = root;
    this.attachment = attachRef(opts.ref, (v) => this.root.triggerNode = v);
    this.root.domContext = new DOMContext(opts.ref);
    this.#domTypeahead = new DOMTypeahead({
      getCurrentItem: () => this.root.highlightedNode,
      onMatch: (node) => {
        this.root.setHighlightedNode(node);
      },
      getActiveElement: () => this.root.domContext.getActiveElement(),
      getWindow: () => this.root.domContext.getWindow()
    });
    this.#dataTypeahead = new DataTypeahead({
      getCurrentItem: () => {
        if (this.root.isMulti) return "";
        return this.root.currentLabel;
      },
      onMatch: (label) => {
        if (this.root.isMulti) return;
        if (!this.root.opts.items.current) return;
        const matchedItem = this.root.opts.items.current.find((item) => item.label === label);
        if (!matchedItem) return;
        this.root.opts.value.current = matchedItem.value;
      },
      enabled: () => !this.root.isMulti && this.root.dataTypeaheadEnabled,
      candidateValues: () => this.root.isMulti ? [] : this.root.candidateLabels,
      getWindow: () => this.root.domContext.getWindow()
    });
    this.onkeydown = this.onkeydown.bind(this);
    this.onpointerdown = this.onpointerdown.bind(this);
    this.onpointerup = this.onpointerup.bind(this);
    this.onclick = this.onclick.bind(this);
  }
  #handleOpen() {
    this.root.opts.open.current = true;
    this.#dataTypeahead.resetTypeahead();
    this.#domTypeahead.resetTypeahead();
  }
  #handlePointerOpen(_) {
    this.#handleOpen();
  }
  /**
   * Logic used to handle keyboard selection/deselection.
   *
   * If it returns true, it means the item was selected and whatever is calling
   * this function should return early
   *
   */
  #handleKeyboardSelection() {
    const isCurrentSelectedValue = this.root.highlightedValue === this.root.opts.value.current;
    if (!this.root.opts.allowDeselect.current && isCurrentSelectedValue && !this.root.isMulti) {
      this.root.handleClose();
      return true;
    }
    if (this.root.highlightedValue !== null) {
      this.root.toggleItem(this.root.highlightedValue, this.root.highlightedLabel ?? void 0);
    }
    if (!this.root.isMulti && !isCurrentSelectedValue) {
      this.root.handleClose();
      return true;
    }
    return false;
  }
  onkeydown(e) {
    this.root.isUsingKeyboard = true;
    if (e.key === ARROW_UP || e.key === ARROW_DOWN) e.preventDefault();
    if (!this.root.opts.open.current) {
      if (e.key === ENTER || e.key === SPACE || e.key === ARROW_DOWN || e.key === ARROW_UP) {
        e.preventDefault();
        this.root.handleOpen();
      } else if (!this.root.isMulti && this.root.dataTypeaheadEnabled) {
        this.#dataTypeahead.handleTypeaheadSearch(e.key);
        return;
      }
      if (this.root.hasValue) return;
      const candidateNodes2 = this.root.getCandidateNodes();
      if (!candidateNodes2.length) return;
      if (e.key === ARROW_DOWN) {
        const firstCandidate = candidateNodes2[0];
        this.root.setHighlightedNode(firstCandidate);
      } else if (e.key === ARROW_UP) {
        const lastCandidate = candidateNodes2[candidateNodes2.length - 1];
        this.root.setHighlightedNode(lastCandidate);
      }
      return;
    }
    if (e.key === TAB) {
      this.root.handleClose();
      return;
    }
    if ((e.key === ENTER || // if we're currently "typing ahead", we don't want to select the item
    // just yet as the item the user is trying to get to may have a space in it,
    // so we defer handling the close for this case until further down
    e.key === SPACE && this.#domTypeahead.search === "") && !e.isComposing) {
      e.preventDefault();
      const shouldReturn = this.#handleKeyboardSelection();
      if (shouldReturn) return;
    }
    if (e.key === ARROW_UP && e.altKey) {
      this.root.handleClose();
    }
    if (FIRST_LAST_KEYS.includes(e.key)) {
      e.preventDefault();
      const candidateNodes2 = this.root.getCandidateNodes();
      const currHighlightedNode = this.root.highlightedNode;
      const currIndex = currHighlightedNode ? candidateNodes2.indexOf(currHighlightedNode) : -1;
      const loop = this.root.opts.loop.current;
      let nextItem;
      if (e.key === ARROW_DOWN) {
        nextItem = next(candidateNodes2, currIndex, loop);
      } else if (e.key === ARROW_UP) {
        nextItem = prev(candidateNodes2, currIndex, loop);
      } else if (e.key === PAGE_DOWN) {
        nextItem = forward(candidateNodes2, currIndex, 10, loop);
      } else if (e.key === PAGE_UP) {
        nextItem = backward(candidateNodes2, currIndex, 10, loop);
      } else if (e.key === HOME) {
        nextItem = candidateNodes2[0];
      } else if (e.key === END) {
        nextItem = candidateNodes2[candidateNodes2.length - 1];
      }
      if (!nextItem) return;
      this.root.setHighlightedNode(nextItem);
      return;
    }
    const isModifierKey = e.ctrlKey || e.altKey || e.metaKey;
    const isCharacterKey = e.key.length === 1;
    const isSpaceKey = e.key === SPACE;
    const candidateNodes = this.root.getCandidateNodes();
    if (e.key === TAB) return;
    if (!isModifierKey && (isCharacterKey || isSpaceKey)) {
      const matchedNode = this.#domTypeahead.handleTypeaheadSearch(e.key, candidateNodes);
      if (!matchedNode && isSpaceKey) {
        e.preventDefault();
        this.#handleKeyboardSelection();
      }
      return;
    }
    if (!this.root.highlightedNode) {
      this.root.setHighlightedToFirstCandidate();
    }
  }
  onclick(e) {
    const currTarget = e.currentTarget;
    currTarget.focus();
  }
  onpointerdown(e) {
    if (this.root.opts.disabled.current) return;
    if (e.pointerType === "touch") return e.preventDefault();
    const target = e.target;
    if (target?.hasPointerCapture(e.pointerId)) {
      target?.releasePointerCapture(e.pointerId);
    }
    if (e.button === 0 && e.ctrlKey === false) {
      if (this.root.opts.open.current === false) {
        this.#handlePointerOpen(e);
      } else {
        this.root.handleClose();
      }
    }
  }
  onpointerup(e) {
    if (this.root.opts.disabled.current) return;
    e.preventDefault();
    if (e.pointerType === "touch") {
      if (this.root.opts.open.current === false) {
        this.#handlePointerOpen(e);
      } else {
        this.root.handleClose();
      }
    }
  }
  #props = derived(() => ({
    id: this.opts.id.current,
    disabled: this.root.opts.disabled.current ? true : void 0,
    "aria-haspopup": "listbox",
    "aria-expanded": boolToStr(this.root.opts.open.current),
    "aria-activedescendant": this.root.highlightedId,
    "data-state": getDataOpenClosed(this.root.opts.open.current),
    "data-disabled": boolToEmptyStrOrUndef(this.root.opts.disabled.current),
    "data-placeholder": this.root.hasValue ? void 0 : "",
    [this.root.getBitsAttr("trigger")]: "",
    onpointerdown: this.onpointerdown,
    onkeydown: this.onkeydown,
    onclick: this.onclick,
    onpointerup: this.onpointerup,
    ...this.attachment
  }));
  get props() {
    return this.#props();
  }
  set props($$value) {
    return this.#props($$value);
  }
}
class SelectContentState {
  static create(opts) {
    return SelectContentContext.set(new SelectContentState(opts, SelectRootContext.get()));
  }
  opts;
  root;
  attachment;
  isPositioned = false;
  domContext;
  constructor(opts, root) {
    this.opts = opts;
    this.root = root;
    this.attachment = attachRef(opts.ref, (v) => this.root.contentNode = v);
    this.domContext = new DOMContext(this.opts.ref);
    if (this.root.domContext === null) {
      this.root.domContext = this.domContext;
    }
    watch(() => this.root.opts.open.current, () => {
      if (this.root.opts.open.current) return;
      this.root.contentIsPositioned = false;
      this.isPositioned = false;
    });
    watch([() => this.isPositioned, () => this.root.highlightedNode], () => {
      if (!this.isPositioned || !this.root.highlightedNode) return;
      this.root.scrollHighlightedNodeIntoView(this.root.highlightedNode);
    });
    this.onpointermove = this.onpointermove.bind(this);
  }
  onpointermove(_) {
    this.root.isUsingKeyboard = false;
  }
  #styles = derived(() => {
    return getFloatingContentCSSVars(this.root.isCombobox ? "combobox" : "select");
  });
  onInteractOutside = (e) => {
    if (e.target === this.root.triggerNode || e.target === this.root.inputNode) {
      e.preventDefault();
      return;
    }
    this.opts.onInteractOutside.current(e);
    if (e.defaultPrevented) return;
    this.root.handleClose();
  };
  onEscapeKeydown = (e) => {
    this.opts.onEscapeKeydown.current(e);
    if (e.defaultPrevented) return;
    this.root.handleClose();
  };
  onOpenAutoFocus = (e) => {
    e.preventDefault();
  };
  onCloseAutoFocus = (e) => {
    e.preventDefault();
  };
  get shouldRender() {
    return this.root.contentPresence.shouldRender;
  }
  #snippetProps = derived(() => ({ open: this.root.opts.open.current }));
  get snippetProps() {
    return this.#snippetProps();
  }
  set snippetProps($$value) {
    return this.#snippetProps($$value);
  }
  #props = derived(() => ({
    id: this.opts.id.current,
    role: "listbox",
    "aria-multiselectable": this.root.isMulti ? "true" : void 0,
    "data-state": getDataOpenClosed(this.root.opts.open.current),
    ...getDataTransitionAttrs(this.root.contentPresence.transitionStatus),
    [this.root.getBitsAttr("content")]: "",
    style: {
      display: "flex",
      flexDirection: "column",
      outline: "none",
      boxSizing: "border-box",
      pointerEvents: "auto",
      ...this.#styles()
    },
    onpointermove: this.onpointermove,
    ...this.attachment
  }));
  get props() {
    return this.#props();
  }
  set props($$value) {
    return this.#props($$value);
  }
  popperProps = {
    onInteractOutside: this.onInteractOutside,
    onEscapeKeydown: this.onEscapeKeydown,
    onOpenAutoFocus: this.onOpenAutoFocus,
    onCloseAutoFocus: this.onCloseAutoFocus,
    trapFocus: false,
    loop: false,
    onPlaced: () => {
      if (this.root.opts.open.current) {
        this.root.contentIsPositioned = true;
        this.isPositioned = true;
      }
    }
  };
}
class SelectItemState {
  static create(opts) {
    return new SelectItemState(opts, SelectRootContext.get());
  }
  opts;
  root;
  attachment;
  #isSelected = derived(() => this.root.includesItem(this.opts.value.current));
  get isSelected() {
    return this.#isSelected();
  }
  set isSelected($$value) {
    return this.#isSelected($$value);
  }
  #isHighlighted = derived(() => this.root.highlightedValue === this.opts.value.current);
  get isHighlighted() {
    return this.#isHighlighted();
  }
  set isHighlighted($$value) {
    return this.#isHighlighted($$value);
  }
  prevHighlighted = new Previous(() => this.isHighlighted);
  mounted = false;
  constructor(opts, root) {
    this.opts = opts;
    this.root = root;
    this.attachment = attachRef(opts.ref);
    watch([() => this.isHighlighted, () => this.prevHighlighted.current], () => {
      if (this.isHighlighted) {
        this.opts.onHighlight.current();
      } else if (this.prevHighlighted.current) {
        this.opts.onUnhighlight.current();
      }
    });
    watch(() => this.mounted, () => {
      if (!this.mounted) return;
      this.root.setInitialHighlightedNode();
    });
    this.onpointerdown = this.onpointerdown.bind(this);
    this.onpointerup = this.onpointerup.bind(this);
    this.onpointermove = this.onpointermove.bind(this);
  }
  handleSelect() {
    if (this.opts.disabled.current) return;
    const isCurrentSelectedValue = this.opts.value.current === this.root.opts.value.current;
    if (!this.root.opts.allowDeselect.current && isCurrentSelectedValue && !this.root.isMulti) {
      this.root.handleClose();
      return;
    }
    this.root.toggleItem(this.opts.value.current, this.opts.label.current);
    if (!this.root.isMulti && !isCurrentSelectedValue) {
      this.root.handleClose();
    }
  }
  #snippetProps = derived(() => ({ selected: this.isSelected, highlighted: this.isHighlighted }));
  get snippetProps() {
    return this.#snippetProps();
  }
  set snippetProps($$value) {
    return this.#snippetProps($$value);
  }
  onpointerdown(e) {
    e.preventDefault();
  }
  /**
   * Using `pointerup` instead of `click` allows power users to pointerdown
   * the trigger, then release pointerup on an item to select it vs having to do
   * multiple clicks.
   */
  onpointerup(e) {
    if (e.defaultPrevented || !this.opts.ref.current) return;
    if (e.pointerType === "touch" && !isIOS) {
      on(
        this.opts.ref.current,
        "click",
        () => {
          this.handleSelect();
          this.root.setHighlightedNode(this.opts.ref.current);
        },
        { once: true }
      );
      return;
    }
    e.preventDefault();
    this.handleSelect();
    if (e.pointerType === "touch") {
      this.root.setHighlightedNode(this.opts.ref.current);
    }
  }
  onpointermove(e) {
    if (e.pointerType === "touch") return;
    if (this.root.highlightedNode !== this.opts.ref.current) {
      this.root.setHighlightedNode(this.opts.ref.current);
    }
  }
  #props = derived(() => ({
    id: this.opts.id.current,
    role: "option",
    "aria-selected": this.root.includesItem(this.opts.value.current) ? "true" : void 0,
    "data-value": this.opts.value.current,
    "data-disabled": boolToEmptyStrOrUndef(this.opts.disabled.current),
    "data-highlighted": this.root.highlightedValue === this.opts.value.current && !this.opts.disabled.current ? "" : void 0,
    "data-selected": this.root.includesItem(this.opts.value.current) ? "" : void 0,
    "data-label": this.opts.label.current,
    [this.root.getBitsAttr("item")]: "",
    onpointermove: this.onpointermove,
    onpointerdown: this.onpointerdown,
    onpointerup: this.onpointerup,
    ...this.attachment
  }));
  get props() {
    return this.#props();
  }
  set props($$value) {
    return this.#props($$value);
  }
}
class SelectGroupState {
  static create(opts) {
    return SelectGroupContext.set(new SelectGroupState(opts, SelectRootContext.get()));
  }
  opts;
  root;
  labelNode = null;
  attachment;
  constructor(opts, root) {
    this.opts = opts;
    this.root = root;
    this.attachment = attachRef(opts.ref);
  }
  #props = derived(() => ({
    id: this.opts.id.current,
    role: "group",
    [this.root.getBitsAttr("group")]: "",
    "aria-labelledby": this.labelNode?.id ?? void 0,
    ...this.attachment
  }));
  get props() {
    return this.#props();
  }
  set props($$value) {
    return this.#props($$value);
  }
}
class SelectGroupHeadingState {
  static create(opts) {
    return new SelectGroupHeadingState(opts, SelectGroupContext.get());
  }
  opts;
  group;
  attachment;
  constructor(opts, group) {
    this.opts = opts;
    this.group = group;
    this.attachment = attachRef(opts.ref, (v) => this.group.labelNode = v);
  }
  #props = derived(() => ({
    id: this.opts.id.current,
    [this.group.root.getBitsAttr("group-label")]: "",
    ...this.attachment
  }));
  get props() {
    return this.#props();
  }
  set props($$value) {
    return this.#props($$value);
  }
}
class SelectHiddenInputState {
  static create(opts) {
    return new SelectHiddenInputState(opts, SelectRootContext.get());
  }
  opts;
  root;
  #shouldRender = derived(() => this.root.opts.name.current !== "");
  get shouldRender() {
    return this.#shouldRender();
  }
  set shouldRender($$value) {
    return this.#shouldRender($$value);
  }
  constructor(opts, root) {
    this.opts = opts;
    this.root = root;
    this.onfocus = this.onfocus.bind(this);
  }
  onfocus(e) {
    e.preventDefault();
    if (!this.root.isCombobox) {
      this.root.triggerNode?.focus();
    } else {
      this.root.inputNode?.focus();
    }
  }
  #props = derived(() => ({
    disabled: boolToTrueOrUndef(this.root.opts.disabled.current),
    required: boolToTrueOrUndef(this.root.opts.required.current),
    name: this.root.opts.name.current,
    value: this.opts.value.current,
    onfocus: this.onfocus
  }));
  get props() {
    return this.#props();
  }
  set props($$value) {
    return this.#props($$value);
  }
}
function Select_hidden_input($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { value = void 0, autocomplete } = $$props;
    const hiddenInputState = SelectHiddenInputState.create({ value: boxWith(() => value) });
    let $$settled = true;
    let $$inner_renderer;
    function $$render_inner($$renderer3) {
      if (hiddenInputState.shouldRender) {
        $$renderer3.push("<!--[0-->");
        Hidden_input($$renderer3, spread_props([
          hiddenInputState.props,
          {
            autocomplete,
            get value() {
              return value;
            },
            set value($$value) {
              value = $$value;
              $$settled = false;
            }
          }
        ]));
      } else {
        $$renderer3.push("<!--[-1-->");
      }
      $$renderer3.push(`<!--]-->`);
    }
    do {
      $$settled = true;
      $$inner_renderer = $$renderer2.copy();
      $$render_inner($$inner_renderer);
    } while (!$$settled);
    $$renderer2.subsume($$inner_renderer);
    bind_props($$props, { value });
  });
}
function Floating_layer_anchor($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { id, children, virtualEl, ref, tooltip = false } = $$props;
    FloatingAnchorState.create(
      {
        id: boxWith(() => id),
        virtualEl: boxWith(() => virtualEl),
        ref
      },
      tooltip
    );
    children?.($$renderer2);
    $$renderer2.push(`<!---->`);
  });
}
function Floating_layer_content($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let {
      content,
      side = "bottom",
      sideOffset = 0,
      align = "center",
      alignOffset = 0,
      id,
      arrowPadding = 0,
      avoidCollisions = true,
      collisionBoundary = [],
      collisionPadding = 0,
      hideWhenDetached = false,
      onPlaced = () => {
      },
      sticky = "partial",
      updatePositionStrategy = "optimized",
      strategy = "fixed",
      dir = "ltr",
      style = {},
      wrapperId = useId(),
      customAnchor = null,
      enabled,
      tooltip = false
    } = $$props;
    const contentState = FloatingContentState.create(
      {
        side: boxWith(() => side),
        sideOffset: boxWith(() => sideOffset),
        align: boxWith(() => align),
        alignOffset: boxWith(() => alignOffset),
        id: boxWith(() => id),
        arrowPadding: boxWith(() => arrowPadding),
        avoidCollisions: boxWith(() => avoidCollisions),
        collisionBoundary: boxWith(() => collisionBoundary),
        collisionPadding: boxWith(() => collisionPadding),
        hideWhenDetached: boxWith(() => hideWhenDetached),
        onPlaced: boxWith(() => onPlaced),
        sticky: boxWith(() => sticky),
        updatePositionStrategy: boxWith(() => updatePositionStrategy),
        strategy: boxWith(() => strategy),
        dir: boxWith(() => dir),
        style: boxWith(() => style),
        enabled: boxWith(() => enabled),
        wrapperId: boxWith(() => wrapperId),
        customAnchor: boxWith(() => customAnchor)
      },
      tooltip
    );
    const mergedProps = derived(() => mergeProps(contentState.wrapperProps, { style: { pointerEvents: "auto" } }));
    content?.($$renderer2, { props: contentState.props, wrapperProps: mergedProps() });
    $$renderer2.push(`<!---->`);
  });
}
function Floating_layer_content_static($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { content } = $$props;
    content?.($$renderer2, { props: {}, wrapperProps: {} });
    $$renderer2.push(`<!---->`);
  });
}
function Popper_content($$renderer, $$props) {
  let {
    content,
    isStatic = false,
    onPlaced,
    $$slots,
    $$events,
    ...restProps
  } = $$props;
  if (isStatic) {
    $$renderer.push("<!--[0-->");
    Floating_layer_content_static($$renderer, { content });
  } else {
    $$renderer.push("<!--[-1-->");
    Floating_layer_content($$renderer, spread_props([{ content, onPlaced }, restProps]));
  }
  $$renderer.push(`<!--]-->`);
}
function Popper_layer_inner($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let {
      popper,
      onEscapeKeydown,
      escapeKeydownBehavior,
      preventOverflowTextSelection,
      id,
      onPointerDown,
      onPointerUp,
      side,
      sideOffset,
      align,
      alignOffset,
      arrowPadding,
      avoidCollisions,
      collisionBoundary,
      collisionPadding,
      sticky,
      hideWhenDetached,
      updatePositionStrategy,
      strategy,
      dir,
      preventScroll,
      wrapperId,
      style,
      onPlaced,
      onInteractOutside,
      onCloseAutoFocus,
      onOpenAutoFocus,
      onFocusOutside,
      interactOutsideBehavior = "close",
      loop,
      trapFocus = true,
      isValidEvent: isValidEvent2 = () => false,
      customAnchor = null,
      isStatic = false,
      enabled,
      ref,
      tooltip = false,
      contentPointerEvents = "auto",
      $$slots,
      $$events,
      ...restProps
    } = $$props;
    const resolvedPreventScroll = derived(() => preventScroll ?? true);
    const effectiveStrategy = derived(() => strategy ?? (resolvedPreventScroll() ? "fixed" : "absolute"));
    {
      let content = function($$renderer3, { props: floatingProps, wrapperProps }) {
        if (restProps.forceMount && enabled) {
          $$renderer3.push("<!--[0-->");
          Scroll_lock($$renderer3, { preventScroll: resolvedPreventScroll() });
        } else if (!restProps.forceMount) {
          $$renderer3.push("<!--[1-->");
          Scroll_lock($$renderer3, { preventScroll: resolvedPreventScroll() });
        } else {
          $$renderer3.push("<!--[-1-->");
        }
        $$renderer3.push(`<!--]--> `);
        {
          let focusScope = function($$renderer4, { props: focusScopeProps }) {
            Escape_layer($$renderer4, {
              onEscapeKeydown,
              escapeKeydownBehavior,
              enabled,
              ref,
              children: ($$renderer5) => {
                {
                  let children = function($$renderer6, { props: dismissibleProps }) {
                    Text_selection_layer($$renderer6, {
                      id,
                      preventOverflowTextSelection,
                      onPointerDown,
                      onPointerUp,
                      enabled,
                      ref,
                      children: ($$renderer7) => {
                        popper?.($$renderer7, {
                          props: mergeProps(restProps, floatingProps, dismissibleProps, focusScopeProps, { style: { pointerEvents: contentPointerEvents } }),
                          wrapperProps
                        });
                        $$renderer7.push(`<!---->`);
                      }
                    });
                  };
                  Dismissible_layer($$renderer5, {
                    id,
                    onInteractOutside,
                    onFocusOutside,
                    interactOutsideBehavior,
                    isValidEvent: isValidEvent2,
                    enabled,
                    ref,
                    children
                  });
                }
              }
            });
          };
          Focus_scope($$renderer3, {
            onOpenAutoFocus,
            onCloseAutoFocus,
            loop,
            enabled,
            trapFocus,
            forceMount: restProps.forceMount,
            ref,
            focusScope
          });
        }
        $$renderer3.push(`<!---->`);
      };
      Popper_content($$renderer2, {
        isStatic,
        id,
        side,
        sideOffset,
        align,
        alignOffset,
        arrowPadding,
        avoidCollisions,
        collisionBoundary,
        collisionPadding,
        sticky,
        hideWhenDetached,
        updatePositionStrategy,
        strategy: effectiveStrategy(),
        dir,
        wrapperId,
        style,
        onPlaced,
        customAnchor,
        enabled,
        tooltip,
        content,
        $$slots: { content: true }
      });
    }
  });
}
function Popper_layer($$renderer, $$props) {
  let {
    popper,
    open,
    onEscapeKeydown,
    escapeKeydownBehavior,
    preventOverflowTextSelection,
    id,
    onPointerDown,
    onPointerUp,
    side,
    sideOffset,
    align,
    alignOffset,
    arrowPadding,
    avoidCollisions,
    collisionBoundary,
    collisionPadding,
    sticky,
    hideWhenDetached,
    updatePositionStrategy,
    strategy,
    dir,
    preventScroll,
    wrapperId,
    style,
    onPlaced,
    onInteractOutside,
    onCloseAutoFocus,
    onOpenAutoFocus,
    onFocusOutside,
    interactOutsideBehavior = "close",
    loop,
    trapFocus = true,
    isValidEvent: isValidEvent2 = () => false,
    customAnchor = null,
    isStatic = false,
    ref,
    shouldRender,
    $$slots,
    $$events,
    ...restProps
  } = $$props;
  if (shouldRender) {
    $$renderer.push("<!--[0-->");
    Popper_layer_inner($$renderer, spread_props([
      {
        popper,
        onEscapeKeydown,
        escapeKeydownBehavior,
        preventOverflowTextSelection,
        id,
        onPointerDown,
        onPointerUp,
        side,
        sideOffset,
        align,
        alignOffset,
        arrowPadding,
        avoidCollisions,
        collisionBoundary,
        collisionPadding,
        sticky,
        hideWhenDetached,
        updatePositionStrategy,
        strategy,
        dir,
        preventScroll,
        wrapperId,
        style,
        onPlaced,
        customAnchor,
        isStatic,
        enabled: open,
        onInteractOutside,
        onCloseAutoFocus,
        onOpenAutoFocus,
        interactOutsideBehavior,
        loop,
        trapFocus,
        isValidEvent: isValidEvent2,
        onFocusOutside,
        forceMount: false,
        ref
      },
      restProps
    ]));
  } else {
    $$renderer.push("<!--[-1-->");
  }
  $$renderer.push(`<!--]-->`);
}
function Popper_layer_force_mount($$renderer, $$props) {
  let {
    popper,
    onEscapeKeydown,
    escapeKeydownBehavior,
    preventOverflowTextSelection,
    id,
    onPointerDown,
    onPointerUp,
    side,
    sideOffset,
    align,
    alignOffset,
    arrowPadding,
    avoidCollisions,
    collisionBoundary,
    collisionPadding,
    sticky,
    hideWhenDetached,
    updatePositionStrategy,
    strategy,
    dir,
    preventScroll,
    wrapperId,
    style,
    onPlaced,
    onInteractOutside,
    onCloseAutoFocus,
    onOpenAutoFocus,
    onFocusOutside,
    interactOutsideBehavior = "close",
    loop,
    trapFocus = true,
    isValidEvent: isValidEvent2 = () => false,
    customAnchor = null,
    isStatic = false,
    enabled,
    $$slots,
    $$events,
    ...restProps
  } = $$props;
  Popper_layer_inner($$renderer, spread_props([
    {
      popper,
      onEscapeKeydown,
      escapeKeydownBehavior,
      preventOverflowTextSelection,
      id,
      onPointerDown,
      onPointerUp,
      side,
      sideOffset,
      align,
      alignOffset,
      arrowPadding,
      avoidCollisions,
      collisionBoundary,
      collisionPadding,
      sticky,
      hideWhenDetached,
      updatePositionStrategy,
      strategy,
      dir,
      preventScroll,
      wrapperId,
      style,
      onPlaced,
      customAnchor,
      isStatic,
      enabled,
      onInteractOutside,
      onCloseAutoFocus,
      onOpenAutoFocus,
      interactOutsideBehavior,
      loop,
      trapFocus,
      isValidEvent: isValidEvent2,
      onFocusOutside
    },
    restProps,
    { forceMount: true }
  ]));
}
function Select_content($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const uid = props_id($$renderer2);
    let {
      id = createId(uid),
      ref = null,
      forceMount = false,
      side = "bottom",
      onInteractOutside = noop,
      onEscapeKeydown = noop,
      children,
      child,
      preventScroll = false,
      style,
      $$slots,
      $$events,
      ...restProps
    } = $$props;
    const contentState = SelectContentState.create({
      id: boxWith(() => id),
      ref: boxWith(() => ref, (v) => ref = v),
      onInteractOutside: boxWith(() => onInteractOutside),
      onEscapeKeydown: boxWith(() => onEscapeKeydown)
    });
    const mergedProps = derived(() => mergeProps(restProps, contentState.props));
    if (forceMount) {
      $$renderer2.push("<!--[0-->");
      {
        let popper = function($$renderer3, { props, wrapperProps }) {
          const finalProps = mergeProps(props, { style: contentState.props.style }, { style });
          if (child) {
            $$renderer3.push("<!--[0-->");
            child($$renderer3, {
              props: finalProps,
              wrapperProps,
              ...contentState.snippetProps
            });
            $$renderer3.push(`<!---->`);
          } else {
            $$renderer3.push("<!--[-1-->");
            $$renderer3.push(`<div${attributes({ ...wrapperProps })}><div${attributes({ ...finalProps })}>`);
            children?.($$renderer3);
            $$renderer3.push(`<!----></div></div>`);
          }
          $$renderer3.push(`<!--]-->`);
        };
        Popper_layer_force_mount($$renderer2, spread_props([
          mergedProps(),
          contentState.popperProps,
          {
            ref: contentState.opts.ref,
            side,
            enabled: contentState.root.opts.open.current,
            id,
            preventScroll,
            forceMount: true,
            shouldRender: contentState.shouldRender,
            popper,
            $$slots: { popper: true }
          }
        ]));
      }
    } else if (!forceMount) {
      $$renderer2.push("<!--[1-->");
      {
        let popper = function($$renderer3, { props, wrapperProps }) {
          const finalProps = mergeProps(props, { style: contentState.props.style }, { style });
          if (child) {
            $$renderer3.push("<!--[0-->");
            child($$renderer3, {
              props: finalProps,
              wrapperProps,
              ...contentState.snippetProps
            });
            $$renderer3.push(`<!---->`);
          } else {
            $$renderer3.push("<!--[-1-->");
            $$renderer3.push(`<div${attributes({ ...wrapperProps })}><div${attributes({ ...finalProps })}>`);
            children?.($$renderer3);
            $$renderer3.push(`<!----></div></div>`);
          }
          $$renderer3.push(`<!--]-->`);
        };
        Popper_layer($$renderer2, spread_props([
          mergedProps(),
          contentState.popperProps,
          {
            ref: contentState.opts.ref,
            side,
            open: contentState.root.opts.open.current,
            id,
            preventScroll,
            forceMount: false,
            shouldRender: contentState.shouldRender,
            popper,
            $$slots: { popper: true }
          }
        ]));
      }
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]-->`);
    bind_props($$props, { ref });
  });
}
function Mounted($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { mounted = false, onMountedChange = noop } = $$props;
    bind_props($$props, { mounted });
  });
}
function Select_item($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const uid = props_id($$renderer2);
    let {
      id = createId(uid),
      ref = null,
      value,
      label = value,
      disabled = false,
      children,
      child,
      onHighlight = noop,
      onUnhighlight = noop,
      $$slots,
      $$events,
      ...restProps
    } = $$props;
    const itemState = SelectItemState.create({
      id: boxWith(() => id),
      ref: boxWith(() => ref, (v) => ref = v),
      value: boxWith(() => value),
      disabled: boxWith(() => disabled),
      label: boxWith(() => label),
      onHighlight: boxWith(() => onHighlight),
      onUnhighlight: boxWith(() => onUnhighlight)
    });
    const mergedProps = derived(() => mergeProps(restProps, itemState.props));
    let $$settled = true;
    let $$inner_renderer;
    function $$render_inner($$renderer3) {
      if (child) {
        $$renderer3.push("<!--[0-->");
        child($$renderer3, { props: mergedProps(), ...itemState.snippetProps });
        $$renderer3.push(`<!---->`);
      } else {
        $$renderer3.push("<!--[-1-->");
        $$renderer3.push(`<div${attributes({ ...mergedProps() })}>`);
        children?.($$renderer3, itemState.snippetProps);
        $$renderer3.push(`<!----></div>`);
      }
      $$renderer3.push(`<!--]--> `);
      Mounted($$renderer3, {
        get mounted() {
          return itemState.mounted;
        },
        set mounted($$value) {
          itemState.mounted = $$value;
          $$settled = false;
        }
      });
      $$renderer3.push(`<!---->`);
    }
    do {
      $$settled = true;
      $$inner_renderer = $$renderer2.copy();
      $$render_inner($$inner_renderer);
    } while (!$$settled);
    $$renderer2.subsume($$inner_renderer);
    bind_props($$props, { ref });
  });
}
function Select_group($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const uid = props_id($$renderer2);
    let {
      id = createId(uid),
      ref = null,
      children,
      child,
      $$slots,
      $$events,
      ...restProps
    } = $$props;
    const groupState = SelectGroupState.create({
      id: boxWith(() => id),
      ref: boxWith(() => ref, (v) => ref = v)
    });
    const mergedProps = derived(() => mergeProps(restProps, groupState.props));
    if (child) {
      $$renderer2.push("<!--[0-->");
      child($$renderer2, { props: mergedProps() });
      $$renderer2.push(`<!---->`);
    } else {
      $$renderer2.push("<!--[-1-->");
      $$renderer2.push(`<div${attributes({ ...mergedProps() })}>`);
      children?.($$renderer2);
      $$renderer2.push(`<!----></div>`);
    }
    $$renderer2.push(`<!--]-->`);
    bind_props($$props, { ref });
  });
}
function Select_group_heading($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const uid = props_id($$renderer2);
    let {
      id = createId(uid),
      ref = null,
      child,
      children,
      $$slots,
      $$events,
      ...restProps
    } = $$props;
    const groupHeadingState = SelectGroupHeadingState.create({
      id: boxWith(() => id),
      ref: boxWith(() => ref, (v) => ref = v)
    });
    const mergedProps = derived(() => mergeProps(restProps, groupHeadingState.props));
    if (child) {
      $$renderer2.push("<!--[0-->");
      child($$renderer2, { props: mergedProps() });
      $$renderer2.push(`<!---->`);
    } else {
      $$renderer2.push("<!--[-1-->");
      $$renderer2.push(`<div${attributes({ ...mergedProps() })}>`);
      children?.($$renderer2);
      $$renderer2.push(`<!----></div>`);
    }
    $$renderer2.push(`<!--]-->`);
    bind_props($$props, { ref });
  });
}
function isPointInPolygon(point, polygon) {
  const [x, y] = point;
  let isInside = false;
  const length = polygon.length;
  for (let i = 0, j = length - 1; i < length; j = i++) {
    const [xi, yi] = polygon[i] ?? [0, 0];
    const [xj, yj] = polygon[j] ?? [0, 0];
    const intersect = yi >= y !== yj >= y && x <= (xj - xi) * (y - yi) / (yj - yi) + xi;
    if (intersect) {
      isInside = !isInside;
    }
  }
  return isInside;
}
function isInsideRect(point, rect) {
  return point[0] >= rect.left && point[0] <= rect.right && point[1] >= rect.top && point[1] <= rect.bottom;
}
function getSide(triggerRect, contentRect) {
  const triggerCenterX = triggerRect.left + triggerRect.width / 2;
  const triggerCenterY = triggerRect.top + triggerRect.height / 2;
  const contentCenterX = contentRect.left + contentRect.width / 2;
  const contentCenterY = contentRect.top + contentRect.height / 2;
  const deltaX = contentCenterX - triggerCenterX;
  const deltaY = contentCenterY - triggerCenterY;
  if (Math.abs(deltaX) > Math.abs(deltaY)) {
    return deltaX > 0 ? "right" : "left";
  }
  return deltaY > 0 ? "bottom" : "top";
}
class SafePolygon {
  #opts;
  #buffer;
  #transitIntentTimeout;
  // tracks the cursor position when leaving trigger or content
  #exitPoint = null;
  // tracks what we're moving toward: "content" when leaving trigger, "trigger" when leaving content
  #exitTarget = null;
  #transitTargets = [];
  #trackedTriggerNode = null;
  #leaveFallbackRafId = null;
  #transitIntentTimeoutId = null;
  #cancelLeaveFallback() {
    if (this.#leaveFallbackRafId !== null) {
      cancelAnimationFrame(this.#leaveFallbackRafId);
      this.#leaveFallbackRafId = null;
    }
  }
  #scheduleLeaveFallback() {
    this.#cancelLeaveFallback();
    this.#leaveFallbackRafId = requestAnimationFrame(() => {
      this.#leaveFallbackRafId = null;
      if (!this.#exitPoint || !this.#exitTarget) return;
      this.#clearTracking();
      this.#opts.onPointerExit();
    });
  }
  #cancelTransitIntentTimeout() {
    if (this.#transitIntentTimeoutId !== null) {
      clearTimeout(this.#transitIntentTimeoutId);
      this.#transitIntentTimeoutId = null;
    }
  }
  #scheduleTransitIntentTimeout() {
    if (this.#transitIntentTimeout === null) return;
    this.#cancelTransitIntentTimeout();
    this.#transitIntentTimeoutId = window.setTimeout(
      () => {
        this.#transitIntentTimeoutId = null;
        if (!this.#exitPoint || !this.#exitTarget) return;
        this.#clearTracking();
        this.#opts.onPointerExit();
      },
      this.#transitIntentTimeout
    );
  }
  constructor(opts) {
    this.#opts = opts;
    this.#buffer = opts.buffer ?? 1;
    const transitIntentTimeout = opts.transitIntentTimeout;
    this.#transitIntentTimeout = typeof transitIntentTimeout === "number" && transitIntentTimeout > 0 ? transitIntentTimeout : null;
    watch([opts.triggerNode, opts.contentNode, opts.enabled], ([triggerNode, contentNode, enabled]) => {
      if (!triggerNode || !contentNode || !enabled) {
        this.#trackedTriggerNode = null;
        this.#clearTracking();
        return;
      }
      if (this.#trackedTriggerNode && this.#trackedTriggerNode !== triggerNode) {
        this.#clearTracking();
      }
      this.#trackedTriggerNode = triggerNode;
      const doc = getDocument(triggerNode);
      const handlePointerMove = (e) => {
        this.#onPointerMove([e.clientX, e.clientY], triggerNode, contentNode);
      };
      const handleTriggerLeave = (e) => {
        const target = e.relatedTarget;
        if (isElement(target) && contentNode.contains(target)) {
          return;
        }
        const ignoredTargets = this.#opts.ignoredTargets?.() ?? [];
        if (isElement(target) && ignoredTargets.some((n) => n === target || n.contains(target))) {
          return;
        }
        this.#transitTargets = isElement(target) && ignoredTargets.length > 0 ? ignoredTargets.filter((n) => target.contains(n)) : [];
        this.#exitPoint = [e.clientX, e.clientY];
        this.#exitTarget = "content";
        this.#scheduleLeaveFallback();
      };
      const handleTriggerEnter = () => {
        this.#clearTracking();
      };
      const handleContentEnter = () => {
        this.#clearTracking();
      };
      const handleContentLeave = (e) => {
        const target = e.relatedTarget;
        if (isElement(target) && triggerNode.contains(target)) {
          return;
        }
        this.#exitPoint = [e.clientX, e.clientY];
        this.#exitTarget = "trigger";
        this.#scheduleLeaveFallback();
      };
      return [
        on(doc, "pointermove", handlePointerMove),
        on(triggerNode, "pointerleave", handleTriggerLeave),
        on(triggerNode, "pointerenter", handleTriggerEnter),
        on(contentNode, "pointerenter", handleContentEnter),
        on(contentNode, "pointerleave", handleContentLeave)
      ].reduce(
        (acc, cleanup) => () => {
          acc();
          cleanup();
        },
        () => {
        }
      );
    });
  }
  #onPointerMove(clientPoint, triggerNode, contentNode) {
    if (!this.#exitPoint || !this.#exitTarget) return;
    this.#cancelLeaveFallback();
    this.#scheduleTransitIntentTimeout();
    const triggerRect = triggerNode.getBoundingClientRect();
    const contentRect = contentNode.getBoundingClientRect();
    if (this.#exitTarget === "content" && isInsideRect(clientPoint, contentRect)) {
      this.#clearTracking();
      return;
    }
    if (this.#exitTarget === "trigger" && isInsideRect(clientPoint, triggerRect)) {
      this.#clearTracking();
      return;
    }
    if (this.#exitTarget === "content" && this.#transitTargets.length > 0) {
      for (const transitTarget of this.#transitTargets) {
        const transitRect = transitTarget.getBoundingClientRect();
        if (isInsideRect(clientPoint, transitRect)) return;
        const transitSide = getSide(triggerRect, transitRect);
        const transitCorridor = this.#getCorridorPolygon(triggerRect, transitRect, transitSide);
        if (transitCorridor && isPointInPolygon(clientPoint, transitCorridor)) return;
      }
    }
    const side = getSide(triggerRect, contentRect);
    const corridorPoly = this.#getCorridorPolygon(triggerRect, contentRect, side);
    if (corridorPoly && isPointInPolygon(clientPoint, corridorPoly)) {
      return;
    }
    const targetRect = this.#exitTarget === "content" ? contentRect : triggerRect;
    const safePoly = this.#getSafePolygon(this.#exitPoint, targetRect, side, this.#exitTarget);
    if (isPointInPolygon(clientPoint, safePoly)) {
      return;
    }
    this.#clearTracking();
    this.#opts.onPointerExit();
  }
  #clearTracking() {
    this.#exitPoint = null;
    this.#exitTarget = null;
    this.#transitTargets = [];
    this.#cancelLeaveFallback();
    this.#cancelTransitIntentTimeout();
  }
  /**
   * Creates a rectangular corridor between trigger and content
   * This prevents closing when cursor is in the gap between them
   */
  #getCorridorPolygon(triggerRect, contentRect, side) {
    const buffer = this.#buffer;
    switch (side) {
      case "top":
        return [
          [
            Math.min(triggerRect.left, contentRect.left) - buffer,
            triggerRect.top
          ],
          [
            Math.min(triggerRect.left, contentRect.left) - buffer,
            contentRect.bottom
          ],
          [
            Math.max(triggerRect.right, contentRect.right) + buffer,
            contentRect.bottom
          ],
          [
            Math.max(triggerRect.right, contentRect.right) + buffer,
            triggerRect.top
          ]
        ];
      case "bottom":
        return [
          [
            Math.min(triggerRect.left, contentRect.left) - buffer,
            triggerRect.bottom
          ],
          [
            Math.min(triggerRect.left, contentRect.left) - buffer,
            contentRect.top
          ],
          [
            Math.max(triggerRect.right, contentRect.right) + buffer,
            contentRect.top
          ],
          [
            Math.max(triggerRect.right, contentRect.right) + buffer,
            triggerRect.bottom
          ]
        ];
      case "left":
        return [
          [
            triggerRect.left,
            Math.min(triggerRect.top, contentRect.top) - buffer
          ],
          [
            contentRect.right,
            Math.min(triggerRect.top, contentRect.top) - buffer
          ],
          [
            contentRect.right,
            Math.max(triggerRect.bottom, contentRect.bottom) + buffer
          ],
          [
            triggerRect.left,
            Math.max(triggerRect.bottom, contentRect.bottom) + buffer
          ]
        ];
      case "right":
        return [
          [
            triggerRect.right,
            Math.min(triggerRect.top, contentRect.top) - buffer
          ],
          [
            contentRect.left,
            Math.min(triggerRect.top, contentRect.top) - buffer
          ],
          [
            contentRect.left,
            Math.max(triggerRect.bottom, contentRect.bottom) + buffer
          ],
          [
            triggerRect.right,
            Math.max(triggerRect.bottom, contentRect.bottom) + buffer
          ]
        ];
    }
  }
  /**
   * Creates a triangular/trapezoidal safe zone from the exit point to the target
   */
  #getSafePolygon(exitPoint, targetRect, side, exitTarget) {
    const buffer = this.#buffer * 4;
    const [x, y] = exitPoint;
    const effectiveSide = exitTarget === "trigger" ? this.#flipSide(side) : side;
    switch (effectiveSide) {
      case "top":
        return [
          [x - buffer, y + buffer],
          [x + buffer, y + buffer],
          [targetRect.right + buffer, targetRect.bottom],
          [targetRect.right + buffer, targetRect.top],
          [targetRect.left - buffer, targetRect.top],
          [targetRect.left - buffer, targetRect.bottom]
        ];
      case "bottom":
        return [
          [x - buffer, y - buffer],
          [x + buffer, y - buffer],
          [targetRect.right + buffer, targetRect.top],
          [targetRect.right + buffer, targetRect.bottom],
          [targetRect.left - buffer, targetRect.bottom],
          [targetRect.left - buffer, targetRect.top]
        ];
      case "left":
        return [
          [x + buffer, y - buffer],
          [x + buffer, y + buffer],
          [targetRect.right, targetRect.bottom + buffer],
          [targetRect.left, targetRect.bottom + buffer],
          [targetRect.left, targetRect.top - buffer],
          [targetRect.right, targetRect.top - buffer]
        ];
      case "right":
        return [
          [x - buffer, y - buffer],
          [x - buffer, y + buffer],
          [targetRect.left, targetRect.bottom + buffer],
          [targetRect.right, targetRect.bottom + buffer],
          [targetRect.right, targetRect.top - buffer],
          [targetRect.left, targetRect.top - buffer]
        ];
    }
  }
  #flipSide(side) {
    switch (side) {
      case "top":
        return "bottom";
      case "bottom":
        return "top";
      case "left":
        return "right";
      case "right":
        return "left";
    }
  }
}
const popoverAttrs = createBitsAttrs({
  component: "popover",
  parts: ["root", "trigger", "content", "close", "overlay"]
});
const PopoverRootContext = new Context2("Popover.Root");
class PopoverRootState {
  static create(opts) {
    return PopoverRootContext.set(new PopoverRootState(opts));
  }
  opts;
  contentNode = null;
  contentPresence;
  triggerNode = null;
  overlayNode = null;
  overlayPresence;
  // hover tracking state
  openedViaHover = false;
  hasInteractedWithContent = false;
  hoverCooldown = false;
  closeDelay = 0;
  #closeTimeout = null;
  #domContext = null;
  constructor(opts) {
    this.opts = opts;
    this.contentPresence = new PresenceManager({
      ref: boxWith(() => this.contentNode),
      open: this.opts.open,
      onComplete: () => {
        this.opts.onOpenChangeComplete.current(this.opts.open.current);
      }
    });
    this.overlayPresence = new PresenceManager({ ref: boxWith(() => this.overlayNode), open: this.opts.open });
    watch(() => this.opts.open.current, (isOpen) => {
      if (!isOpen) {
        this.openedViaHover = false;
        this.hasInteractedWithContent = false;
        this.#clearCloseTimeout();
      }
    });
  }
  setDomContext(ctx) {
    this.#domContext = ctx;
  }
  #clearCloseTimeout() {
    if (this.#closeTimeout !== null && this.#domContext) {
      this.#domContext.clearTimeout(this.#closeTimeout);
      this.#closeTimeout = null;
    }
  }
  toggleOpen() {
    this.#clearCloseTimeout();
    this.opts.open.current = !this.opts.open.current;
  }
  handleClose() {
    this.#clearCloseTimeout();
    if (!this.opts.open.current) return;
    this.opts.open.current = false;
  }
  handleHoverOpen() {
    this.#clearCloseTimeout();
    if (this.opts.open.current) return;
    this.openedViaHover = true;
    this.opts.open.current = true;
  }
  handleHoverClose() {
    if (!this.opts.open.current) return;
    if (this.openedViaHover && !this.hasInteractedWithContent) {
      this.opts.open.current = false;
    }
  }
  handleDelayedHoverClose() {
    if (!this.opts.open.current) return;
    if (!this.openedViaHover || this.hasInteractedWithContent) return;
    this.#clearCloseTimeout();
    if (this.closeDelay <= 0) {
      this.opts.open.current = false;
    } else if (this.#domContext) {
      this.#closeTimeout = this.#domContext.setTimeout(
        () => {
          if (this.openedViaHover && !this.hasInteractedWithContent) {
            this.opts.open.current = false;
          }
          this.#closeTimeout = null;
        },
        this.closeDelay
      );
    }
  }
  cancelDelayedClose() {
    this.#clearCloseTimeout();
  }
  markInteraction() {
    this.hasInteractedWithContent = true;
    this.#clearCloseTimeout();
  }
}
class PopoverTriggerState {
  static create(opts) {
    return new PopoverTriggerState(opts, PopoverRootContext.get());
  }
  opts;
  root;
  attachment;
  domContext;
  #openTimeout = null;
  #closeTimeout = null;
  #isHovering = false;
  constructor(opts, root) {
    this.opts = opts;
    this.root = root;
    this.attachment = attachRef(this.opts.ref, (v) => this.root.triggerNode = v);
    this.domContext = new DOMContext(opts.ref);
    this.root.setDomContext(this.domContext);
    this.onclick = this.onclick.bind(this);
    this.onkeydown = this.onkeydown.bind(this);
    this.onpointerenter = this.onpointerenter.bind(this);
    this.onpointerleave = this.onpointerleave.bind(this);
    watch(() => this.opts.closeDelay.current, (delay) => {
      this.root.closeDelay = delay;
    });
  }
  #clearOpenTimeout() {
    if (this.#openTimeout !== null) {
      this.domContext.clearTimeout(this.#openTimeout);
      this.#openTimeout = null;
    }
  }
  #clearCloseTimeout() {
    if (this.#closeTimeout !== null) {
      this.domContext.clearTimeout(this.#closeTimeout);
      this.#closeTimeout = null;
    }
  }
  #clearAllTimeouts() {
    this.#clearOpenTimeout();
    this.#clearCloseTimeout();
  }
  onpointerenter(e) {
    if (this.opts.disabled.current) return;
    if (!this.opts.openOnHover.current) return;
    if (isTouch(e)) return;
    this.#isHovering = true;
    this.#clearCloseTimeout();
    this.root.cancelDelayedClose();
    if (this.root.opts.open.current || this.root.hoverCooldown) return;
    const delay = this.opts.openDelay.current;
    if (delay <= 0) {
      this.root.handleHoverOpen();
    } else {
      this.#openTimeout = this.domContext.setTimeout(
        () => {
          this.root.handleHoverOpen();
          this.#openTimeout = null;
        },
        delay
      );
    }
  }
  onpointerleave(e) {
    if (this.opts.disabled.current) return;
    if (!this.opts.openOnHover.current) return;
    if (isTouch(e)) return;
    this.#isHovering = false;
    this.#clearOpenTimeout();
    this.root.hoverCooldown = false;
  }
  onclick(e) {
    if (this.opts.disabled.current) return;
    if (e.button !== 0) return;
    this.#clearAllTimeouts();
    if (this.#isHovering && this.root.opts.open.current && this.root.openedViaHover) {
      this.root.openedViaHover = false;
      this.root.hasInteractedWithContent = true;
      return;
    }
    if (this.#isHovering && this.opts.openOnHover.current && this.root.opts.open.current) {
      this.root.hoverCooldown = true;
    }
    if (this.root.hoverCooldown && !this.root.opts.open.current) {
      this.root.hoverCooldown = false;
    }
    this.root.toggleOpen();
  }
  onkeydown(e) {
    if (this.opts.disabled.current) return;
    if (!(e.key === ENTER || e.key === SPACE)) return;
    e.preventDefault();
    this.#clearAllTimeouts();
    this.root.toggleOpen();
  }
  #getAriaControls() {
    if (this.root.opts.open.current && this.root.contentNode?.id) {
      return this.root.contentNode?.id;
    }
  }
  #props = derived(() => ({
    id: this.opts.id.current,
    "aria-haspopup": "dialog",
    "aria-expanded": boolToStr(this.root.opts.open.current),
    "data-state": getDataOpenClosed(this.root.opts.open.current),
    "aria-controls": this.#getAriaControls(),
    [popoverAttrs.trigger]: "",
    disabled: this.opts.disabled.current,
    //
    onkeydown: this.onkeydown,
    onclick: this.onclick,
    onpointerenter: this.onpointerenter,
    onpointerleave: this.onpointerleave,
    ...this.attachment
  }));
  get props() {
    return this.#props();
  }
  set props($$value) {
    return this.#props($$value);
  }
}
class PopoverContentState {
  static create(opts) {
    return new PopoverContentState(opts, PopoverRootContext.get());
  }
  opts;
  root;
  attachment;
  constructor(opts, root) {
    this.opts = opts;
    this.root = root;
    this.attachment = attachRef(this.opts.ref, (v) => this.root.contentNode = v);
    this.onpointerdown = this.onpointerdown.bind(this);
    this.onfocusin = this.onfocusin.bind(this);
    this.onpointerenter = this.onpointerenter.bind(this);
    this.onpointerleave = this.onpointerleave.bind(this);
    new SafePolygon({
      triggerNode: () => this.root.triggerNode,
      contentNode: () => this.root.contentNode,
      enabled: () => this.root.opts.open.current && this.root.openedViaHover && !this.root.hasInteractedWithContent,
      onPointerExit: () => {
        this.root.handleDelayedHoverClose();
      }
    });
  }
  onpointerdown(_) {
    this.root.markInteraction();
  }
  onfocusin(e) {
    const target = e.target;
    if (isElement(target) && isTabbable(target)) {
      this.root.markInteraction();
    }
  }
  onpointerenter(e) {
    if (isTouch(e)) return;
    this.root.cancelDelayedClose();
  }
  onpointerleave(e) {
    if (isTouch(e)) return;
  }
  onInteractOutside = (e) => {
    this.opts.onInteractOutside.current(e);
    if (e.defaultPrevented) return;
    if (!isElement(e.target)) return;
    const closestTrigger = e.target.closest(popoverAttrs.selector("trigger"));
    if (closestTrigger && closestTrigger === this.root.triggerNode) return;
    if (this.opts.customAnchor.current) {
      if (isElement(this.opts.customAnchor.current)) {
        if (this.opts.customAnchor.current.contains(e.target)) return;
      } else if (typeof this.opts.customAnchor.current === "string") {
        const el = document.querySelector(this.opts.customAnchor.current);
        if (el && el.contains(e.target)) return;
      }
    }
    this.root.handleClose();
  };
  onEscapeKeydown = (e) => {
    this.opts.onEscapeKeydown.current(e);
    if (e.defaultPrevented) return;
    this.root.handleClose();
  };
  get shouldRender() {
    return this.root.contentPresence.shouldRender;
  }
  get shouldTrapFocus() {
    if (this.root.openedViaHover && !this.root.hasInteractedWithContent) return false;
    return true;
  }
  #snippetProps = derived(() => ({ open: this.root.opts.open.current }));
  get snippetProps() {
    return this.#snippetProps();
  }
  set snippetProps($$value) {
    return this.#snippetProps($$value);
  }
  #props = derived(() => ({
    id: this.opts.id.current,
    tabindex: -1,
    "data-state": getDataOpenClosed(this.root.opts.open.current),
    ...getDataTransitionAttrs(this.root.contentPresence.transitionStatus),
    [popoverAttrs.content]: "",
    style: { pointerEvents: "auto", contain: "layout style" },
    onpointerdown: this.onpointerdown,
    onfocusin: this.onfocusin,
    onpointerenter: this.onpointerenter,
    onpointerleave: this.onpointerleave,
    ...this.attachment
  }));
  get props() {
    return this.#props();
  }
  set props($$value) {
    return this.#props($$value);
  }
  popperProps = {
    onInteractOutside: this.onInteractOutside,
    onEscapeKeydown: this.onEscapeKeydown
  };
}
class PopoverCloseState {
  static create(opts) {
    return new PopoverCloseState(opts, PopoverRootContext.get());
  }
  opts;
  root;
  attachment;
  constructor(opts, root) {
    this.opts = opts;
    this.root = root;
    this.attachment = attachRef(this.opts.ref);
    this.onclick = this.onclick.bind(this);
    this.onkeydown = this.onkeydown.bind(this);
  }
  onclick(_) {
    this.root.handleClose();
  }
  onkeydown(e) {
    if (!(e.key === ENTER || e.key === SPACE)) return;
    e.preventDefault();
    this.root.handleClose();
  }
  #props = derived(() => ({
    id: this.opts.id.current,
    onclick: this.onclick,
    onkeydown: this.onkeydown,
    type: "button",
    [popoverAttrs.close]: "",
    ...this.attachment
  }));
  get props() {
    return this.#props();
  }
  set props($$value) {
    return this.#props($$value);
  }
}
function Popover_content($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const uid = props_id($$renderer2);
    let {
      child,
      children,
      ref = null,
      id = createId(uid),
      forceMount = false,
      onOpenAutoFocus = noop,
      onCloseAutoFocus = noop,
      onEscapeKeydown = noop,
      onInteractOutside = noop,
      trapFocus = true,
      preventScroll = false,
      customAnchor = null,
      style,
      $$slots,
      $$events,
      ...restProps
    } = $$props;
    const contentState = PopoverContentState.create({
      id: boxWith(() => id),
      ref: boxWith(() => ref, (v) => ref = v),
      onInteractOutside: boxWith(() => onInteractOutside),
      onEscapeKeydown: boxWith(() => onEscapeKeydown),
      customAnchor: boxWith(() => customAnchor)
    });
    const mergedProps = derived(() => mergeProps(restProps, contentState.props));
    const effectiveTrapFocus = derived(() => trapFocus && contentState.shouldTrapFocus);
    function handleOpenAutoFocus(e) {
      if (!contentState.shouldTrapFocus) {
        e.preventDefault();
      }
      onOpenAutoFocus(e);
    }
    if (forceMount) {
      $$renderer2.push("<!--[0-->");
      {
        let popper = function($$renderer3, { props, wrapperProps }) {
          const finalProps = mergeProps(props, { style: getFloatingContentCSSVars("popover") }, { style });
          if (child) {
            $$renderer3.push("<!--[0-->");
            child($$renderer3, {
              props: finalProps,
              wrapperProps,
              ...contentState.snippetProps
            });
            $$renderer3.push(`<!---->`);
          } else {
            $$renderer3.push("<!--[-1-->");
            $$renderer3.push(`<div${attributes({ ...wrapperProps })}><div${attributes({ ...finalProps })}>`);
            children?.($$renderer3);
            $$renderer3.push(`<!----></div></div>`);
          }
          $$renderer3.push(`<!--]-->`);
        };
        Popper_layer_force_mount($$renderer2, spread_props([
          mergedProps(),
          contentState.popperProps,
          {
            ref: contentState.opts.ref,
            enabled: contentState.root.opts.open.current,
            id,
            trapFocus: effectiveTrapFocus(),
            preventScroll,
            loop: true,
            forceMount: true,
            customAnchor,
            onOpenAutoFocus: handleOpenAutoFocus,
            onCloseAutoFocus,
            shouldRender: contentState.shouldRender,
            popper,
            $$slots: { popper: true }
          }
        ]));
      }
    } else if (!forceMount) {
      $$renderer2.push("<!--[1-->");
      {
        let popper = function($$renderer3, { props, wrapperProps }) {
          const finalProps = mergeProps(props, { style: getFloatingContentCSSVars("popover") }, { style });
          if (child) {
            $$renderer3.push("<!--[0-->");
            child($$renderer3, {
              props: finalProps,
              wrapperProps,
              ...contentState.snippetProps
            });
            $$renderer3.push(`<!---->`);
          } else {
            $$renderer3.push("<!--[-1-->");
            $$renderer3.push(`<div${attributes({ ...wrapperProps })}><div${attributes({ ...finalProps })}>`);
            children?.($$renderer3);
            $$renderer3.push(`<!----></div></div>`);
          }
          $$renderer3.push(`<!--]-->`);
        };
        Popper_layer($$renderer2, spread_props([
          mergedProps(),
          contentState.popperProps,
          {
            ref: contentState.opts.ref,
            open: contentState.root.opts.open.current,
            id,
            trapFocus: effectiveTrapFocus(),
            preventScroll,
            loop: true,
            forceMount: false,
            customAnchor,
            onOpenAutoFocus: handleOpenAutoFocus,
            onCloseAutoFocus,
            shouldRender: contentState.shouldRender,
            popper,
            $$slots: { popper: true }
          }
        ]));
      }
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]-->`);
    bind_props($$props, { ref });
  });
}
function Popover_trigger($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const uid = props_id($$renderer2);
    let {
      children,
      child,
      id = createId(uid),
      ref = null,
      type = "button",
      disabled = false,
      openOnHover = false,
      openDelay = 700,
      closeDelay = 300,
      $$slots,
      $$events,
      ...restProps
    } = $$props;
    const triggerState = PopoverTriggerState.create({
      id: boxWith(() => id),
      ref: boxWith(() => ref, (v) => ref = v),
      disabled: boxWith(() => Boolean(disabled)),
      openOnHover: boxWith(() => openOnHover),
      openDelay: boxWith(() => openDelay),
      closeDelay: boxWith(() => closeDelay)
    });
    const mergedProps = derived(() => mergeProps(restProps, triggerState.props, { type }));
    Floating_layer_anchor($$renderer2, {
      id,
      ref: triggerState.opts.ref,
      children: ($$renderer3) => {
        if (child) {
          $$renderer3.push("<!--[0-->");
          child($$renderer3, { props: mergedProps() });
          $$renderer3.push(`<!---->`);
        } else {
          $$renderer3.push("<!--[-1-->");
          $$renderer3.push(`<button${attributes({ ...mergedProps() })}>`);
          children?.($$renderer3);
          $$renderer3.push(`<!----></button>`);
        }
        $$renderer3.push(`<!--]-->`);
      }
    });
    bind_props($$props, { ref });
  });
}
function Popover_close($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const uid = props_id($$renderer2);
    let {
      child,
      children,
      id = createId(uid),
      ref = null,
      $$slots,
      $$events,
      ...restProps
    } = $$props;
    const closeState = PopoverCloseState.create({
      id: boxWith(() => id),
      ref: boxWith(() => ref, (v) => ref = v)
    });
    const mergedProps = derived(() => mergeProps(restProps, closeState.props));
    if (child) {
      $$renderer2.push("<!--[0-->");
      child($$renderer2, { props: mergedProps() });
      $$renderer2.push(`<!---->`);
    } else {
      $$renderer2.push("<!--[-1-->");
      $$renderer2.push(`<button${attributes({ ...mergedProps() })}>`);
      children?.($$renderer2);
      $$renderer2.push(`<!----></button>`);
    }
    $$renderer2.push(`<!--]-->`);
    bind_props($$props, { ref });
  });
}
function Dialog($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let {
      open = false,
      onOpenChange = noop,
      onOpenChangeComplete = noop,
      children
    } = $$props;
    DialogRootState.create({
      variant: boxWith(() => "dialog"),
      open: boxWith(() => open, (v) => {
        open = v;
        onOpenChange(v);
      }),
      onOpenChangeComplete: boxWith(() => onOpenChangeComplete)
    });
    children?.($$renderer2);
    $$renderer2.push(`<!---->`);
    bind_props($$props, { open });
  });
}
function Dialog_close($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const uid = props_id($$renderer2);
    let {
      children,
      child,
      id = createId(uid),
      ref = null,
      disabled = false,
      $$slots,
      $$events,
      ...restProps
    } = $$props;
    const closeState = DialogCloseState.create({
      variant: boxWith(() => "close"),
      id: boxWith(() => id),
      ref: boxWith(() => ref, (v) => ref = v),
      disabled: boxWith(() => Boolean(disabled))
    });
    const mergedProps = derived(() => mergeProps(restProps, closeState.props));
    if (child) {
      $$renderer2.push("<!--[0-->");
      child($$renderer2, { props: mergedProps() });
      $$renderer2.push(`<!---->`);
    } else {
      $$renderer2.push("<!--[-1-->");
      $$renderer2.push(`<button${attributes({ ...mergedProps() })}>`);
      children?.($$renderer2);
      $$renderer2.push(`<!----></button>`);
    }
    $$renderer2.push(`<!--]-->`);
    bind_props($$props, { ref });
  });
}
function Dialog_content($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const uid = props_id($$renderer2);
    let {
      id = createId(uid),
      children,
      child,
      ref = null,
      forceMount = false,
      onCloseAutoFocus = noop,
      onOpenAutoFocus = noop,
      onEscapeKeydown = noop,
      onInteractOutside = noop,
      trapFocus = true,
      preventScroll = true,
      restoreScrollDelay = null,
      $$slots,
      $$events,
      ...restProps
    } = $$props;
    const contentState = DialogContentState.create({
      id: boxWith(() => id),
      ref: boxWith(() => ref, (v) => ref = v)
    });
    const mergedProps = derived(() => mergeProps(restProps, contentState.props));
    if (contentState.shouldRender || forceMount) {
      $$renderer2.push("<!--[0-->");
      {
        let focusScope = function($$renderer3, { props: focusScopeProps }) {
          Escape_layer($$renderer3, spread_props([
            mergedProps(),
            {
              enabled: contentState.root.opts.open.current,
              ref: contentState.opts.ref,
              onEscapeKeydown: (e) => {
                onEscapeKeydown(e);
                if (e.defaultPrevented) return;
                contentState.root.handleClose();
              },
              children: ($$renderer4) => {
                Dismissible_layer($$renderer4, spread_props([
                  mergedProps(),
                  {
                    ref: contentState.opts.ref,
                    enabled: contentState.root.opts.open.current,
                    onInteractOutside: (e) => {
                      onInteractOutside(e);
                      if (e.defaultPrevented) return;
                      contentState.root.handleClose();
                    },
                    children: ($$renderer5) => {
                      Text_selection_layer($$renderer5, spread_props([
                        mergedProps(),
                        {
                          ref: contentState.opts.ref,
                          enabled: contentState.root.opts.open.current,
                          children: ($$renderer6) => {
                            if (child) {
                              $$renderer6.push("<!--[0-->");
                              if (contentState.root.opts.open.current) {
                                $$renderer6.push("<!--[0-->");
                                Scroll_lock($$renderer6, { preventScroll, restoreScrollDelay });
                              } else {
                                $$renderer6.push("<!--[-1-->");
                              }
                              $$renderer6.push(`<!--]--> `);
                              child($$renderer6, {
                                props: mergeProps(mergedProps(), focusScopeProps),
                                ...contentState.snippetProps
                              });
                              $$renderer6.push(`<!---->`);
                            } else {
                              $$renderer6.push("<!--[-1-->");
                              Scroll_lock($$renderer6, { preventScroll });
                              $$renderer6.push(`<!----> <div${attributes({ ...mergeProps(mergedProps(), focusScopeProps) })}>`);
                              children?.($$renderer6);
                              $$renderer6.push(`<!----></div>`);
                            }
                            $$renderer6.push(`<!--]-->`);
                          },
                          $$slots: { default: true }
                        }
                      ]));
                    },
                    $$slots: { default: true }
                  }
                ]));
              },
              $$slots: { default: true }
            }
          ]));
        };
        Focus_scope($$renderer2, {
          ref: contentState.opts.ref,
          loop: true,
          trapFocus,
          enabled: contentState.root.opts.open.current,
          onOpenAutoFocus,
          onCloseAutoFocus,
          focusScope
        });
      }
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]-->`);
    bind_props($$props, { ref });
  });
}
const labelAttrs = createBitsAttrs({ component: "label", parts: ["root"] });
class LabelRootState {
  static create(opts) {
    return new LabelRootState(opts);
  }
  opts;
  attachment;
  constructor(opts) {
    this.opts = opts;
    this.attachment = attachRef(this.opts.ref);
    this.onmousedown = this.onmousedown.bind(this);
  }
  onmousedown(e) {
    if (e.detail > 1) e.preventDefault();
  }
  #props = derived(() => ({
    id: this.opts.id.current,
    [labelAttrs.root]: "",
    onmousedown: this.onmousedown,
    ...this.attachment
  }));
  get props() {
    return this.#props();
  }
  set props($$value) {
    return this.#props($$value);
  }
}
function Label($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const uid = props_id($$renderer2);
    let {
      children,
      child,
      id = createId(uid),
      ref = null,
      for: forProp,
      $$slots,
      $$events,
      ...restProps
    } = $$props;
    const rootState = LabelRootState.create({
      id: boxWith(() => id),
      ref: boxWith(() => ref, (v) => ref = v)
    });
    const mergedProps = derived(() => mergeProps(restProps, rootState.props, { for: forProp }));
    if (child) {
      $$renderer2.push("<!--[0-->");
      child($$renderer2, { props: mergedProps() });
      $$renderer2.push(`<!---->`);
    } else {
      $$renderer2.push("<!--[-1-->");
      $$renderer2.push(`<label${attributes({ ...mergedProps(), for: forProp })}>`);
      children?.($$renderer2);
      $$renderer2.push(`<!----></label>`);
    }
    $$renderer2.push(`<!--]-->`);
    bind_props($$props, { ref });
  });
}
class SvelteResizeObserver {
  #node;
  #onResize;
  constructor(node, onResize) {
    this.#node = node;
    this.#onResize = onResize;
    this.handler = this.handler.bind(this);
  }
  handler() {
    let rAF = 0;
    const _node = this.#node();
    if (!_node) return;
    const resizeObserver = new ResizeObserver(() => {
      cancelAnimationFrame(rAF);
      rAF = window.requestAnimationFrame(this.#onResize);
    });
    resizeObserver.observe(_node);
    return () => {
      window.cancelAnimationFrame(rAF);
      resizeObserver.unobserve(_node);
    };
  }
}
class Presence {
  opts;
  present;
  #afterAnimations;
  #isPresent = false;
  #hasMounted = false;
  #transitionStatus = void 0;
  #transitionFrame = null;
  constructor(opts) {
    this.opts = opts;
    this.present = this.opts.open;
    this.#isPresent = opts.open.current;
    this.#afterAnimations = new AnimationsComplete({ ref: this.opts.ref, afterTick: this.opts.open });
    watch(() => this.present.current, (isOpen) => {
      if (!this.#hasMounted) {
        this.#hasMounted = true;
        return;
      }
      this.#clearTransitionFrame();
      if (isOpen) {
        this.#isPresent = true;
      }
      this.#transitionStatus = isOpen ? "starting" : "ending";
      if (isOpen) {
        this.#transitionFrame = window.requestAnimationFrame(() => {
          this.#transitionFrame = null;
          if (this.present.current) {
            this.#transitionStatus = void 0;
          }
        });
      }
      this.#afterAnimations.run(() => {
        if (isOpen !== this.present.current) return;
        if (!isOpen) {
          this.#isPresent = false;
        }
        this.#transitionStatus = void 0;
      });
    });
  }
  #_isPresent = derived(() => {
    return this.#isPresent;
  });
  get isPresent() {
    return this.#_isPresent();
  }
  set isPresent($$value) {
    return this.#_isPresent($$value);
  }
  get transitionStatus() {
    return this.#transitionStatus;
  }
  #clearTransitionFrame() {
    if (this.#transitionFrame === null) return;
    window.cancelAnimationFrame(this.#transitionFrame);
    this.#transitionFrame = null;
  }
}
function Presence_layer($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { open, forceMount, presence, ref } = $$props;
    const presenceState = new Presence({ open: boxWith(() => open), ref });
    if (forceMount || open || presenceState.isPresent) {
      $$renderer2.push("<!--[0-->");
      presence?.($$renderer2, {
        present: presenceState.isPresent,
        transitionStatus: presenceState.transitionStatus
      });
      $$renderer2.push(`<!---->`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]-->`);
  });
}
function Popover($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let {
      open = false,
      onOpenChange = noop,
      onOpenChangeComplete = noop,
      children
    } = $$props;
    PopoverRootState.create({
      open: boxWith(() => open, (v) => {
        open = v;
        onOpenChange(v);
      }),
      onOpenChangeComplete: boxWith(() => onOpenChangeComplete)
    });
    Floating_layer($$renderer2, {
      children: ($$renderer3) => {
        children?.($$renderer3);
        $$renderer3.push(`<!---->`);
      }
    });
    bind_props($$props, { open });
  });
}
function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}
class StateMachine {
  state;
  #machine;
  constructor(initialState, machine) {
    this.state = simpleBox(initialState);
    this.#machine = machine;
    this.dispatch = this.dispatch.bind(this);
  }
  #reducer(event) {
    const nextState = this.#machine[this.state.current][event];
    return nextState ?? this.state.current;
  }
  dispatch(event) {
    this.state.current = this.#reducer(event);
  }
}
const scrollAreaAttrs = createBitsAttrs({
  component: "scroll-area",
  parts: ["root", "viewport", "corner", "thumb", "scrollbar"]
});
const ScrollAreaRootContext = new Context2("ScrollArea.Root");
const ScrollAreaScrollbarContext = new Context2("ScrollArea.Scrollbar");
const ScrollAreaScrollbarVisibleContext = new Context2("ScrollArea.ScrollbarVisible");
const ScrollAreaScrollbarAxisContext = new Context2("ScrollArea.ScrollbarAxis");
const ScrollAreaScrollbarSharedContext = new Context2("ScrollArea.ScrollbarShared");
class ScrollAreaRootState {
  static create(opts) {
    return ScrollAreaRootContext.set(new ScrollAreaRootState(opts));
  }
  opts;
  attachment;
  scrollAreaNode = null;
  viewportNode = null;
  contentNode = null;
  scrollbarXNode = null;
  scrollbarYNode = null;
  cornerWidth = 0;
  cornerHeight = 0;
  scrollbarXEnabled = false;
  scrollbarYEnabled = false;
  domContext;
  constructor(opts) {
    this.opts = opts;
    this.attachment = attachRef(opts.ref, (v) => this.scrollAreaNode = v);
    this.domContext = new DOMContext(opts.ref);
  }
  #props = derived(() => ({
    id: this.opts.id.current,
    dir: this.opts.dir.current,
    style: {
      position: "relative",
      "--bits-scroll-area-corner-height": `${this.cornerHeight}px`,
      "--bits-scroll-area-corner-width": `${this.cornerWidth}px`
    },
    [scrollAreaAttrs.root]: "",
    ...this.attachment
  }));
  get props() {
    return this.#props();
  }
  set props($$value) {
    return this.#props($$value);
  }
}
class ScrollAreaViewportState {
  static create(opts) {
    return new ScrollAreaViewportState(opts, ScrollAreaRootContext.get());
  }
  opts;
  root;
  attachment;
  #contentId = simpleBox(useId());
  #contentRef = simpleBox(null);
  contentAttachment = attachRef(this.#contentRef, (v) => this.root.contentNode = v);
  constructor(opts, root) {
    this.opts = opts;
    this.root = root;
    this.attachment = attachRef(opts.ref, (v) => this.root.viewportNode = v);
  }
  #props = derived(() => ({
    id: this.opts.id.current,
    style: {
      overflowX: this.root.scrollbarXEnabled ? "scroll" : "hidden",
      overflowY: this.root.scrollbarYEnabled ? "scroll" : "hidden"
    },
    [scrollAreaAttrs.viewport]: "",
    ...this.attachment
  }));
  get props() {
    return this.#props();
  }
  set props($$value) {
    return this.#props($$value);
  }
  #contentProps = derived(() => ({
    id: this.#contentId.current,
    "data-scroll-area-content": "",
    style: {
      minWidth: this.root.scrollbarXEnabled ? "fit-content" : void 0
    },
    ...this.contentAttachment
  }));
  get contentProps() {
    return this.#contentProps();
  }
  set contentProps($$value) {
    return this.#contentProps($$value);
  }
}
class ScrollAreaScrollbarState {
  static create(opts) {
    return ScrollAreaScrollbarContext.set(new ScrollAreaScrollbarState(opts, ScrollAreaRootContext.get()));
  }
  opts;
  root;
  #isHorizontal = derived(() => this.opts.orientation.current === "horizontal");
  get isHorizontal() {
    return this.#isHorizontal();
  }
  set isHorizontal($$value) {
    return this.#isHorizontal($$value);
  }
  hasThumb = false;
  constructor(opts, root) {
    this.opts = opts;
    this.root = root;
    watch(() => this.isHorizontal, (isHorizontal) => {
      if (isHorizontal) {
        this.root.scrollbarXEnabled = true;
        return () => {
          this.root.scrollbarXEnabled = false;
        };
      } else {
        this.root.scrollbarYEnabled = true;
        return () => {
          this.root.scrollbarYEnabled = false;
        };
      }
    });
  }
}
class ScrollAreaScrollbarHoverState {
  static create() {
    return new ScrollAreaScrollbarHoverState(ScrollAreaScrollbarContext.get());
  }
  scrollbar;
  root;
  isVisible = false;
  constructor(scrollbar) {
    this.scrollbar = scrollbar;
    this.root = scrollbar.root;
  }
  #props = derived(() => ({ "data-state": this.isVisible ? "visible" : "hidden" }));
  get props() {
    return this.#props();
  }
  set props($$value) {
    return this.#props($$value);
  }
}
class ScrollAreaScrollbarScrollState {
  static create() {
    return new ScrollAreaScrollbarScrollState(ScrollAreaScrollbarContext.get());
  }
  scrollbar;
  root;
  machine = new StateMachine("hidden", {
    hidden: { SCROLL: "scrolling" },
    scrolling: { SCROLL_END: "idle", POINTER_ENTER: "interacting" },
    interacting: { SCROLL: "interacting", POINTER_LEAVE: "idle" },
    idle: {
      HIDE: "hidden",
      SCROLL: "scrolling",
      POINTER_ENTER: "interacting"
    }
  });
  #isHidden = derived(() => this.machine.state.current === "hidden");
  get isHidden() {
    return this.#isHidden();
  }
  set isHidden($$value) {
    return this.#isHidden($$value);
  }
  constructor(scrollbar) {
    this.scrollbar = scrollbar;
    this.root = scrollbar.root;
    useDebounce(() => this.machine.dispatch("SCROLL_END"), 100);
    this.onpointerenter = this.onpointerenter.bind(this);
    this.onpointerleave = this.onpointerleave.bind(this);
  }
  onpointerenter(_) {
    this.machine.dispatch("POINTER_ENTER");
  }
  onpointerleave(_) {
    this.machine.dispatch("POINTER_LEAVE");
  }
  #props = derived(() => ({
    "data-state": this.machine.state.current === "hidden" ? "hidden" : "visible",
    onpointerenter: this.onpointerenter,
    onpointerleave: this.onpointerleave
  }));
  get props() {
    return this.#props();
  }
  set props($$value) {
    return this.#props($$value);
  }
}
class ScrollAreaScrollbarAutoState {
  static create() {
    return new ScrollAreaScrollbarAutoState(ScrollAreaScrollbarContext.get());
  }
  scrollbar;
  root;
  isVisible = false;
  constructor(scrollbar) {
    this.scrollbar = scrollbar;
    this.root = scrollbar.root;
    const handleResize = useDebounce(
      () => {
        const viewportNode = this.root.viewportNode;
        if (!viewportNode) return;
        const isOverflowX = viewportNode.offsetWidth < viewportNode.scrollWidth;
        const isOverflowY = viewportNode.offsetHeight < viewportNode.scrollHeight;
        this.isVisible = this.scrollbar.isHorizontal ? isOverflowX : isOverflowY;
      },
      10
    );
    new SvelteResizeObserver(() => this.root.viewportNode, handleResize);
    new SvelteResizeObserver(() => this.root.contentNode, handleResize);
  }
  #props = derived(() => ({ "data-state": this.isVisible ? "visible" : "hidden" }));
  get props() {
    return this.#props();
  }
  set props($$value) {
    return this.#props($$value);
  }
}
class ScrollAreaScrollbarVisibleState {
  static create() {
    return ScrollAreaScrollbarVisibleContext.set(new ScrollAreaScrollbarVisibleState(ScrollAreaScrollbarContext.get()));
  }
  scrollbar;
  root;
  thumbNode = null;
  pointerOffset = 0;
  sizes = {
    content: 0,
    viewport: 0,
    scrollbar: { size: 0, paddingStart: 0, paddingEnd: 0 }
  };
  #thumbRatio = derived(() => getThumbRatio(this.sizes.viewport, this.sizes.content));
  get thumbRatio() {
    return this.#thumbRatio();
  }
  set thumbRatio($$value) {
    return this.#thumbRatio($$value);
  }
  #hasThumb = derived(() => Boolean(this.thumbRatio > 0 && this.thumbRatio < 1));
  get hasThumb() {
    return this.#hasThumb();
  }
  set hasThumb($$value) {
    return this.#hasThumb($$value);
  }
  prevTransformStyle = "";
  constructor(scrollbar) {
    this.scrollbar = scrollbar;
    this.root = scrollbar.root;
  }
  setSizes(sizes) {
    this.sizes = sizes;
  }
  getScrollPosition(pointerPos, dir) {
    return getScrollPositionFromPointer({
      pointerPos,
      pointerOffset: this.pointerOffset,
      sizes: this.sizes,
      dir
    });
  }
  onThumbPointerUp() {
    this.pointerOffset = 0;
  }
  onThumbPointerDown(pointerPos) {
    this.pointerOffset = pointerPos;
  }
  xOnThumbPositionChange() {
    if (!(this.root.viewportNode && this.thumbNode)) return;
    const scrollPos = this.root.viewportNode.scrollLeft;
    const offset2 = getThumbOffsetFromScroll({
      scrollPos,
      sizes: this.sizes,
      dir: this.root.opts.dir.current
    });
    const transformStyle = `translate3d(${offset2}px, 0, 0)`;
    this.thumbNode.style.transform = transformStyle;
    this.prevTransformStyle = transformStyle;
  }
  xOnWheelScroll(scrollPos) {
    if (!this.root.viewportNode) return;
    this.root.viewportNode.scrollLeft = scrollPos;
  }
  xOnDragScroll(pointerPos) {
    if (!this.root.viewportNode) return;
    this.root.viewportNode.scrollLeft = this.getScrollPosition(pointerPos, this.root.opts.dir.current);
  }
  yOnThumbPositionChange() {
    if (!(this.root.viewportNode && this.thumbNode)) return;
    const scrollPos = this.root.viewportNode.scrollTop;
    const offset2 = getThumbOffsetFromScroll({ scrollPos, sizes: this.sizes });
    const transformStyle = `translate3d(0, ${offset2}px, 0)`;
    this.thumbNode.style.transform = transformStyle;
    this.prevTransformStyle = transformStyle;
  }
  yOnWheelScroll(scrollPos) {
    if (!this.root.viewportNode) return;
    this.root.viewportNode.scrollTop = scrollPos;
  }
  yOnDragScroll(pointerPos) {
    if (!this.root.viewportNode) return;
    this.root.viewportNode.scrollTop = this.getScrollPosition(pointerPos, this.root.opts.dir.current);
  }
}
class ScrollAreaScrollbarXState {
  static create(opts) {
    return ScrollAreaScrollbarAxisContext.set(new ScrollAreaScrollbarXState(opts, ScrollAreaScrollbarVisibleContext.get()));
  }
  opts;
  scrollbarVis;
  root;
  scrollbar;
  attachment;
  computedStyle;
  constructor(opts, scrollbarVis) {
    this.opts = opts;
    this.scrollbarVis = scrollbarVis;
    this.root = scrollbarVis.root;
    this.scrollbar = scrollbarVis.scrollbar;
    this.attachment = attachRef(this.scrollbar.opts.ref, (v) => this.root.scrollbarXNode = v);
  }
  onThumbPointerDown = (pointerPos) => {
    this.scrollbarVis.onThumbPointerDown(pointerPos.x);
  };
  onDragScroll = (pointerPos) => {
    this.scrollbarVis.xOnDragScroll(pointerPos.x);
  };
  onThumbPointerUp = () => {
    this.scrollbarVis.onThumbPointerUp();
  };
  onThumbPositionChange = () => {
    this.scrollbarVis.xOnThumbPositionChange();
  };
  onWheelScroll = (e, maxScrollPos) => {
    if (!this.root.viewportNode) return;
    const scrollPos = this.root.viewportNode.scrollLeft + e.deltaX;
    this.scrollbarVis.xOnWheelScroll(scrollPos);
    if (isScrollingWithinScrollbarBounds(scrollPos, maxScrollPos)) {
      e.preventDefault();
    }
  };
  onResize = () => {
    if (!(this.scrollbar.opts.ref.current && this.root.viewportNode && this.computedStyle)) return;
    this.scrollbarVis.setSizes({
      content: this.root.viewportNode.scrollWidth,
      viewport: this.root.viewportNode.offsetWidth,
      scrollbar: {
        size: this.scrollbar.opts.ref.current.clientWidth,
        paddingStart: toInt(this.computedStyle.paddingLeft),
        paddingEnd: toInt(this.computedStyle.paddingRight)
      }
    });
  };
  #thumbSize = derived(() => {
    return getThumbSize(this.scrollbarVis.sizes);
  });
  get thumbSize() {
    return this.#thumbSize();
  }
  set thumbSize($$value) {
    return this.#thumbSize($$value);
  }
  #props = derived(() => ({
    id: this.scrollbar.opts.id.current,
    "data-orientation": "horizontal",
    style: {
      bottom: 0,
      left: this.root.opts.dir.current === "rtl" ? "var(--bits-scroll-area-corner-width)" : 0,
      right: this.root.opts.dir.current === "ltr" ? "var(--bits-scroll-area-corner-width)" : 0,
      "--bits-scroll-area-thumb-width": `${this.thumbSize}px`
    },
    ...this.attachment
  }));
  get props() {
    return this.#props();
  }
  set props($$value) {
    return this.#props($$value);
  }
}
class ScrollAreaScrollbarYState {
  static create(opts) {
    return ScrollAreaScrollbarAxisContext.set(new ScrollAreaScrollbarYState(opts, ScrollAreaScrollbarVisibleContext.get()));
  }
  opts;
  scrollbarVis;
  root;
  scrollbar;
  attachment;
  computedStyle;
  constructor(opts, scrollbarVis) {
    this.opts = opts;
    this.scrollbarVis = scrollbarVis;
    this.root = scrollbarVis.root;
    this.scrollbar = scrollbarVis.scrollbar;
    this.attachment = attachRef(this.scrollbar.opts.ref, (v) => this.root.scrollbarYNode = v);
    this.onThumbPointerDown = this.onThumbPointerDown.bind(this);
    this.onDragScroll = this.onDragScroll.bind(this);
    this.onThumbPointerUp = this.onThumbPointerUp.bind(this);
    this.onThumbPositionChange = this.onThumbPositionChange.bind(this);
    this.onWheelScroll = this.onWheelScroll.bind(this);
    this.onResize = this.onResize.bind(this);
  }
  onThumbPointerDown(pointerPos) {
    this.scrollbarVis.onThumbPointerDown(pointerPos.y);
  }
  onDragScroll(pointerPos) {
    this.scrollbarVis.yOnDragScroll(pointerPos.y);
  }
  onThumbPointerUp() {
    this.scrollbarVis.onThumbPointerUp();
  }
  onThumbPositionChange() {
    this.scrollbarVis.yOnThumbPositionChange();
  }
  onWheelScroll(e, maxScrollPos) {
    if (!this.root.viewportNode) return;
    const scrollPos = this.root.viewportNode.scrollTop + e.deltaY;
    this.scrollbarVis.yOnWheelScroll(scrollPos);
    if (isScrollingWithinScrollbarBounds(scrollPos, maxScrollPos)) {
      e.preventDefault();
    }
  }
  onResize() {
    if (!(this.scrollbar.opts.ref.current && this.root.viewportNode && this.computedStyle)) return;
    this.scrollbarVis.setSizes({
      content: this.root.viewportNode.scrollHeight,
      viewport: this.root.viewportNode.offsetHeight,
      scrollbar: {
        size: this.scrollbar.opts.ref.current.clientHeight,
        paddingStart: toInt(this.computedStyle.paddingTop),
        paddingEnd: toInt(this.computedStyle.paddingBottom)
      }
    });
  }
  #thumbSize = derived(() => {
    return getThumbSize(this.scrollbarVis.sizes);
  });
  get thumbSize() {
    return this.#thumbSize();
  }
  set thumbSize($$value) {
    return this.#thumbSize($$value);
  }
  #props = derived(() => ({
    id: this.scrollbar.opts.id.current,
    "data-orientation": "vertical",
    style: {
      top: 0,
      right: this.root.opts.dir.current === "ltr" ? 0 : void 0,
      left: this.root.opts.dir.current === "rtl" ? 0 : void 0,
      bottom: "var(--bits-scroll-area-corner-height)",
      "--bits-scroll-area-thumb-height": `${this.thumbSize}px`
    },
    ...this.attachment
  }));
  get props() {
    return this.#props();
  }
  set props($$value) {
    return this.#props($$value);
  }
}
class ScrollAreaScrollbarSharedState {
  static create() {
    return ScrollAreaScrollbarSharedContext.set(new ScrollAreaScrollbarSharedState(ScrollAreaScrollbarAxisContext.get()));
  }
  scrollbarState;
  root;
  scrollbarVis;
  scrollbar;
  rect = null;
  prevWebkitUserSelect = "";
  handleResize;
  handleThumbPositionChange;
  handleWheelScroll;
  handleThumbPointerDown;
  handleThumbPointerUp;
  #maxScrollPos = derived(() => this.scrollbarVis.sizes.content - this.scrollbarVis.sizes.viewport);
  get maxScrollPos() {
    return this.#maxScrollPos();
  }
  set maxScrollPos($$value) {
    return this.#maxScrollPos($$value);
  }
  constructor(scrollbarState) {
    this.scrollbarState = scrollbarState;
    this.root = scrollbarState.root;
    this.scrollbarVis = scrollbarState.scrollbarVis;
    this.scrollbar = scrollbarState.scrollbarVis.scrollbar;
    this.handleResize = useDebounce(() => this.scrollbarState.onResize(), 10);
    this.handleThumbPositionChange = this.scrollbarState.onThumbPositionChange;
    this.handleWheelScroll = this.scrollbarState.onWheelScroll;
    this.handleThumbPointerDown = this.scrollbarState.onThumbPointerDown;
    this.handleThumbPointerUp = this.scrollbarState.onThumbPointerUp;
    new SvelteResizeObserver(() => this.scrollbar.opts.ref.current, this.handleResize);
    new SvelteResizeObserver(() => this.root.contentNode, this.handleResize);
    this.onpointerdown = this.onpointerdown.bind(this);
    this.onpointermove = this.onpointermove.bind(this);
    this.onpointerup = this.onpointerup.bind(this);
    this.onlostpointercapture = this.onlostpointercapture.bind(this);
  }
  handleDragScroll(e) {
    if (!this.rect) return;
    const x = e.clientX - this.rect.left;
    const y = e.clientY - this.rect.top;
    this.scrollbarState.onDragScroll({ x, y });
  }
  #cleanupPointerState() {
    if (this.rect === null) return;
    this.root.domContext.getDocument().body.style.webkitUserSelect = this.prevWebkitUserSelect;
    if (this.root.viewportNode) this.root.viewportNode.style.scrollBehavior = "";
    this.rect = null;
  }
  onpointerdown(e) {
    if (e.button !== 0) return;
    const target = e.target;
    target.setPointerCapture(e.pointerId);
    this.rect = this.scrollbar.opts.ref.current?.getBoundingClientRect() ?? null;
    this.prevWebkitUserSelect = this.root.domContext.getDocument().body.style.webkitUserSelect;
    this.root.domContext.getDocument().body.style.webkitUserSelect = "none";
    if (this.root.viewportNode) this.root.viewportNode.style.scrollBehavior = "auto";
    this.handleDragScroll(e);
  }
  onpointermove(e) {
    this.handleDragScroll(e);
  }
  onpointerup(e) {
    const target = e.target;
    if (target.hasPointerCapture(e.pointerId)) {
      target.releasePointerCapture(e.pointerId);
    }
    this.#cleanupPointerState();
  }
  onlostpointercapture(_) {
    this.#cleanupPointerState();
  }
  #props = derived(() => mergeProps({
    ...this.scrollbarState.props,
    style: { position: "absolute", ...this.scrollbarState.props.style },
    [scrollAreaAttrs.scrollbar]: "",
    onpointerdown: this.onpointerdown,
    onpointermove: this.onpointermove,
    onpointerup: this.onpointerup,
    onlostpointercapture: this.onlostpointercapture
  }));
  get props() {
    return this.#props();
  }
  set props($$value) {
    return this.#props($$value);
  }
}
class ScrollAreaThumbImplState {
  static create(opts) {
    return new ScrollAreaThumbImplState(opts, ScrollAreaScrollbarSharedContext.get());
  }
  opts;
  scrollbarState;
  attachment;
  #root;
  #removeUnlinkedScrollListener;
  #debounceScrollEnd = useDebounce(
    () => {
      if (this.#removeUnlinkedScrollListener) {
        this.#removeUnlinkedScrollListener();
        this.#removeUnlinkedScrollListener = void 0;
      }
    },
    100
  );
  constructor(opts, scrollbarState) {
    this.opts = opts;
    this.scrollbarState = scrollbarState;
    this.#root = scrollbarState.root;
    this.attachment = attachRef(this.opts.ref, (v) => this.scrollbarState.scrollbarVis.thumbNode = v);
    this.onpointerdowncapture = this.onpointerdowncapture.bind(this);
    this.onpointerup = this.onpointerup.bind(this);
  }
  onpointerdowncapture(e) {
    const thumb = e.target;
    if (!thumb) return;
    const thumbRect = thumb.getBoundingClientRect();
    const x = e.clientX - thumbRect.left;
    const y = e.clientY - thumbRect.top;
    this.scrollbarState.handleThumbPointerDown({ x, y });
  }
  onpointerup(_) {
    this.scrollbarState.handleThumbPointerUp();
  }
  #props = derived(() => ({
    id: this.opts.id.current,
    "data-state": this.scrollbarState.scrollbarVis.hasThumb ? "visible" : "hidden",
    style: {
      width: "var(--bits-scroll-area-thumb-width)",
      height: "var(--bits-scroll-area-thumb-height)",
      transform: this.scrollbarState.scrollbarVis.prevTransformStyle
    },
    onpointerdowncapture: this.onpointerdowncapture,
    onpointerup: this.onpointerup,
    [scrollAreaAttrs.thumb]: "",
    ...this.attachment
  }));
  get props() {
    return this.#props();
  }
  set props($$value) {
    return this.#props($$value);
  }
}
class ScrollAreaCornerImplState {
  static create(opts) {
    return new ScrollAreaCornerImplState(opts, ScrollAreaRootContext.get());
  }
  opts;
  root;
  attachment;
  #width = 0;
  #height = 0;
  #hasSize = derived(() => Boolean(this.#width && this.#height));
  get hasSize() {
    return this.#hasSize();
  }
  set hasSize($$value) {
    return this.#hasSize($$value);
  }
  constructor(opts, root) {
    this.opts = opts;
    this.root = root;
    this.attachment = attachRef(this.opts.ref);
    new SvelteResizeObserver(() => this.root.scrollbarXNode, () => {
      const height = this.root.scrollbarXNode?.offsetHeight || 0;
      this.root.cornerHeight = height;
      this.#height = height;
    });
    new SvelteResizeObserver(() => this.root.scrollbarYNode, () => {
      const width = this.root.scrollbarYNode?.offsetWidth || 0;
      this.root.cornerWidth = width;
      this.#width = width;
    });
  }
  #props = derived(() => ({
    id: this.opts.id.current,
    style: {
      width: this.#width,
      height: this.#height,
      position: "absolute",
      right: this.root.opts.dir.current === "ltr" ? 0 : void 0,
      left: this.root.opts.dir.current === "rtl" ? 0 : void 0,
      bottom: 0
    },
    [scrollAreaAttrs.corner]: "",
    ...this.attachment
  }));
  get props() {
    return this.#props();
  }
  set props($$value) {
    return this.#props($$value);
  }
}
function toInt(value) {
  return value ? Number.parseInt(value, 10) : 0;
}
function getThumbRatio(viewportSize, contentSize) {
  const ratio = viewportSize / contentSize;
  return Number.isNaN(ratio) ? 0 : ratio;
}
function getThumbSize(sizes) {
  const ratio = getThumbRatio(sizes.viewport, sizes.content);
  const scrollbarPadding = sizes.scrollbar.paddingStart + sizes.scrollbar.paddingEnd;
  const thumbSize = (sizes.scrollbar.size - scrollbarPadding) * ratio;
  return Math.max(thumbSize, 18);
}
function getScrollPositionFromPointer({ pointerPos, pointerOffset, sizes, dir = "ltr" }) {
  const thumbSizePx = getThumbSize(sizes);
  const thumbCenter = thumbSizePx / 2;
  const offset2 = pointerOffset || thumbCenter;
  const thumbOffsetFromEnd = thumbSizePx - offset2;
  const minPointerPos = sizes.scrollbar.paddingStart + offset2;
  const maxPointerPos = sizes.scrollbar.size - sizes.scrollbar.paddingEnd - thumbOffsetFromEnd;
  const maxScrollPos = sizes.content - sizes.viewport;
  const scrollRange = dir === "ltr" ? [0, maxScrollPos] : [maxScrollPos * -1, 0];
  const interpolate = linearScale([minPointerPos, maxPointerPos], scrollRange);
  return interpolate(pointerPos);
}
function getThumbOffsetFromScroll({ scrollPos, sizes, dir = "ltr" }) {
  const thumbSizePx = getThumbSize(sizes);
  const scrollbarPadding = sizes.scrollbar.paddingStart + sizes.scrollbar.paddingEnd;
  const scrollbar = sizes.scrollbar.size - scrollbarPadding;
  const maxScrollPos = sizes.content - sizes.viewport;
  const maxThumbPos = scrollbar - thumbSizePx;
  const scrollClampRange = dir === "ltr" ? [0, maxScrollPos] : [maxScrollPos * -1, 0];
  const scrollWithoutMomentum = clamp(scrollPos, scrollClampRange[0], scrollClampRange[1]);
  const interpolate = linearScale([0, maxScrollPos], [0, maxThumbPos]);
  return interpolate(scrollWithoutMomentum);
}
function linearScale(input, output) {
  return (value) => {
    if (input[0] === input[1] || output[0] === output[1]) return output[0];
    const ratio = (output[1] - output[0]) / (input[1] - input[0]);
    return output[0] + ratio * (value - input[0]);
  };
}
function isScrollingWithinScrollbarBounds(scrollPos, maxScrollPos) {
  return scrollPos > 0 && scrollPos < maxScrollPos;
}
function Scroll_area($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const uid = props_id($$renderer2);
    let {
      ref = null,
      id = createId(uid),
      type = "hover",
      dir = "ltr",
      scrollHideDelay = 600,
      children,
      child,
      $$slots,
      $$events,
      ...restProps
    } = $$props;
    const rootState = ScrollAreaRootState.create({
      type: boxWith(() => type),
      dir: boxWith(() => dir),
      scrollHideDelay: boxWith(() => scrollHideDelay),
      id: boxWith(() => id),
      ref: boxWith(() => ref, (v) => ref = v)
    });
    const mergedProps = derived(() => mergeProps(restProps, rootState.props));
    if (child) {
      $$renderer2.push("<!--[0-->");
      child($$renderer2, { props: mergedProps() });
      $$renderer2.push(`<!---->`);
    } else {
      $$renderer2.push("<!--[-1-->");
      $$renderer2.push(`<div${attributes({ ...mergedProps() })}>`);
      children?.($$renderer2);
      $$renderer2.push(`<!----></div>`);
    }
    $$renderer2.push(`<!--]-->`);
    bind_props($$props, { ref });
  });
}
function Scroll_area_viewport($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const uid = props_id($$renderer2);
    let {
      ref = null,
      id = createId(uid),
      children,
      $$slots,
      $$events,
      ...restProps
    } = $$props;
    const viewportState = ScrollAreaViewportState.create({
      id: boxWith(() => id),
      ref: boxWith(() => ref, (v) => ref = v)
    });
    const mergedProps = derived(() => mergeProps(restProps, viewportState.props));
    const mergedContentProps = derived(() => mergeProps({}, viewportState.contentProps));
    $$renderer2.push(`<div${attributes({ ...mergedProps() })}><div${attributes({ ...mergedContentProps() })}>`);
    children?.($$renderer2);
    $$renderer2.push(`<!----></div></div>`);
    bind_props($$props, { ref });
  });
}
function Scroll_area_scrollbar_shared($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { child, children, $$slots, $$events, ...restProps } = $$props;
    const scrollbarSharedState = ScrollAreaScrollbarSharedState.create();
    const mergedProps = derived(() => mergeProps(restProps, scrollbarSharedState.props));
    if (child) {
      $$renderer2.push("<!--[0-->");
      child($$renderer2, { props: mergedProps() });
      $$renderer2.push(`<!---->`);
    } else {
      $$renderer2.push("<!--[-1-->");
      $$renderer2.push(`<div${attributes({ ...mergedProps() })}>`);
      children?.($$renderer2);
      $$renderer2.push(`<!----></div>`);
    }
    $$renderer2.push(`<!--]-->`);
  });
}
function Scroll_area_scrollbar_x($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { $$slots, $$events, ...restProps } = $$props;
    const isMounted = new IsMounted();
    const scrollbarXState = ScrollAreaScrollbarXState.create({ mounted: boxWith(() => isMounted.current) });
    const mergedProps = derived(() => mergeProps(restProps, scrollbarXState.props));
    Scroll_area_scrollbar_shared($$renderer2, spread_props([mergedProps()]));
  });
}
function Scroll_area_scrollbar_y($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { $$slots, $$events, ...restProps } = $$props;
    const isMounted = new IsMounted();
    const scrollbarYState = ScrollAreaScrollbarYState.create({ mounted: boxWith(() => isMounted.current) });
    const mergedProps = derived(() => mergeProps(restProps, scrollbarYState.props));
    Scroll_area_scrollbar_shared($$renderer2, spread_props([mergedProps()]));
  });
}
function Scroll_area_scrollbar_visible($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { $$slots, $$events, ...restProps } = $$props;
    const scrollbarVisibleState = ScrollAreaScrollbarVisibleState.create();
    if (scrollbarVisibleState.scrollbar.opts.orientation.current === "horizontal") {
      $$renderer2.push("<!--[0-->");
      Scroll_area_scrollbar_x($$renderer2, spread_props([restProps]));
    } else {
      $$renderer2.push("<!--[-1-->");
      Scroll_area_scrollbar_y($$renderer2, spread_props([restProps]));
    }
    $$renderer2.push(`<!--]-->`);
  });
}
function Scroll_area_scrollbar_auto($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { forceMount = false, $$slots, $$events, ...restProps } = $$props;
    const scrollbarAutoState = ScrollAreaScrollbarAutoState.create();
    const mergedProps = derived(() => mergeProps(restProps, scrollbarAutoState.props));
    {
      let presence = function($$renderer3) {
        Scroll_area_scrollbar_visible($$renderer3, spread_props([mergedProps()]));
      };
      Presence_layer($$renderer2, {
        open: forceMount || scrollbarAutoState.isVisible,
        ref: scrollbarAutoState.scrollbar.opts.ref,
        presence
      });
    }
  });
}
function Scroll_area_scrollbar_scroll($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { forceMount = false, $$slots, $$events, ...restProps } = $$props;
    const scrollbarScrollState = ScrollAreaScrollbarScrollState.create();
    const mergedProps = derived(() => mergeProps(restProps, scrollbarScrollState.props));
    {
      let presence = function($$renderer3) {
        Scroll_area_scrollbar_visible($$renderer3, spread_props([mergedProps()]));
      };
      Presence_layer($$renderer2, spread_props([
        mergedProps(),
        {
          open: forceMount || !scrollbarScrollState.isHidden,
          ref: scrollbarScrollState.scrollbar.opts.ref,
          presence,
          $$slots: { presence: true }
        }
      ]));
    }
  });
}
function Scroll_area_scrollbar_hover($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { forceMount = false, $$slots, $$events, ...restProps } = $$props;
    const scrollbarHoverState = ScrollAreaScrollbarHoverState.create();
    const scrollbarAutoState = ScrollAreaScrollbarAutoState.create();
    const mergedProps = derived(() => mergeProps(restProps, scrollbarHoverState.props, scrollbarAutoState.props, {
      "data-state": scrollbarHoverState.isVisible ? "visible" : "hidden"
    }));
    const open = derived(() => forceMount || scrollbarHoverState.isVisible && scrollbarAutoState.isVisible);
    {
      let presence = function($$renderer3) {
        Scroll_area_scrollbar_visible($$renderer3, spread_props([mergedProps()]));
      };
      Presence_layer($$renderer2, {
        open: open(),
        ref: scrollbarAutoState.scrollbar.opts.ref,
        presence
      });
    }
  });
}
function Scroll_area_scrollbar($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const uid = props_id($$renderer2);
    let {
      ref = null,
      id = createId(uid),
      orientation,
      $$slots,
      $$events,
      ...restProps
    } = $$props;
    const scrollbarState = ScrollAreaScrollbarState.create({
      orientation: boxWith(() => orientation),
      id: boxWith(() => id),
      ref: boxWith(() => ref, (v) => ref = v)
    });
    const type = derived(() => scrollbarState.root.opts.type.current);
    if (type() === "hover") {
      $$renderer2.push("<!--[0-->");
      Scroll_area_scrollbar_hover($$renderer2, spread_props([restProps, { id }]));
    } else if (type() === "scroll") {
      $$renderer2.push("<!--[1-->");
      Scroll_area_scrollbar_scroll($$renderer2, spread_props([restProps, { id }]));
    } else if (type() === "auto") {
      $$renderer2.push("<!--[2-->");
      Scroll_area_scrollbar_auto($$renderer2, spread_props([restProps, { id }]));
    } else if (type() === "always") {
      $$renderer2.push("<!--[3-->");
      Scroll_area_scrollbar_visible($$renderer2, spread_props([restProps, { id }]));
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]-->`);
    bind_props($$props, { ref });
  });
}
function Scroll_area_thumb_impl($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let {
      ref = null,
      id,
      child,
      children,
      present,
      $$slots,
      $$events,
      ...restProps
    } = $$props;
    const isMounted = new IsMounted();
    const thumbState = ScrollAreaThumbImplState.create({
      id: boxWith(() => id),
      ref: boxWith(() => ref, (v) => ref = v),
      mounted: boxWith(() => isMounted.current)
    });
    const mergedProps = derived(() => mergeProps(restProps, thumbState.props, { style: { hidden: !present } }));
    if (child) {
      $$renderer2.push("<!--[0-->");
      child($$renderer2, { props: mergedProps() });
      $$renderer2.push(`<!---->`);
    } else {
      $$renderer2.push("<!--[-1-->");
      $$renderer2.push(`<div${attributes({ ...mergedProps() })}>`);
      children?.($$renderer2);
      $$renderer2.push(`<!----></div>`);
    }
    $$renderer2.push(`<!--]-->`);
    bind_props($$props, { ref });
  });
}
function Scroll_area_thumb($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const uid = props_id($$renderer2);
    let {
      id = createId(uid),
      ref = null,
      forceMount = false,
      $$slots,
      $$events,
      ...restProps
    } = $$props;
    const scrollbarState = ScrollAreaScrollbarVisibleContext.get();
    let $$settled = true;
    let $$inner_renderer;
    function $$render_inner($$renderer3) {
      {
        let presence = function($$renderer4, { present }) {
          Scroll_area_thumb_impl($$renderer4, spread_props([
            restProps,
            {
              id,
              present,
              get ref() {
                return ref;
              },
              set ref($$value) {
                ref = $$value;
                $$settled = false;
              }
            }
          ]));
        };
        Presence_layer($$renderer3, {
          open: forceMount || scrollbarState.hasThumb,
          ref: scrollbarState.scrollbar.opts.ref,
          presence
        });
      }
    }
    do {
      $$settled = true;
      $$inner_renderer = $$renderer2.copy();
      $$render_inner($$inner_renderer);
    } while (!$$settled);
    $$renderer2.subsume($$inner_renderer);
    bind_props($$props, { ref });
  });
}
function Scroll_area_corner_impl($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let {
      ref = null,
      id,
      children,
      child,
      $$slots,
      $$events,
      ...restProps
    } = $$props;
    const cornerState = ScrollAreaCornerImplState.create({
      id: boxWith(() => id),
      ref: boxWith(() => ref, (v) => ref = v)
    });
    const mergedProps = derived(() => mergeProps(restProps, cornerState.props));
    if (child) {
      $$renderer2.push("<!--[0-->");
      child($$renderer2, { props: mergedProps() });
      $$renderer2.push(`<!---->`);
    } else {
      $$renderer2.push("<!--[-1-->");
      $$renderer2.push(`<div${attributes({ ...mergedProps() })}>`);
      children?.($$renderer2);
      $$renderer2.push(`<!----></div>`);
    }
    $$renderer2.push(`<!--]-->`);
    bind_props($$props, { ref });
  });
}
function Scroll_area_corner($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const uid = props_id($$renderer2);
    let {
      ref = null,
      id = createId(uid),
      $$slots,
      $$events,
      ...restProps
    } = $$props;
    const scrollAreaState = ScrollAreaRootContext.get();
    const hasBothScrollbarsVisible = derived(() => Boolean(scrollAreaState.scrollbarXNode && scrollAreaState.scrollbarYNode));
    const hasCorner = derived(() => scrollAreaState.opts.type.current !== "scroll" && hasBothScrollbarsVisible());
    let $$settled = true;
    let $$inner_renderer;
    function $$render_inner($$renderer3) {
      if (hasCorner()) {
        $$renderer3.push("<!--[0-->");
        Scroll_area_corner_impl($$renderer3, spread_props([
          restProps,
          {
            id,
            get ref() {
              return ref;
            },
            set ref($$value) {
              ref = $$value;
              $$settled = false;
            }
          }
        ]));
      } else {
        $$renderer3.push("<!--[-1-->");
      }
      $$renderer3.push(`<!--]-->`);
    }
    do {
      $$settled = true;
      $$inner_renderer = $$renderer2.copy();
      $$render_inner($$inner_renderer);
    } while (!$$settled);
    $$renderer2.subsume($$inner_renderer);
    bind_props($$props, { ref });
  });
}
function Select($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let {
      value = void 0,
      onValueChange = noop,
      name = "",
      disabled = false,
      type,
      open = false,
      onOpenChange = noop,
      onOpenChangeComplete = noop,
      loop = false,
      scrollAlignment = "nearest",
      required = false,
      items = [],
      allowDeselect = false,
      autocomplete,
      children
    } = $$props;
    function handleDefaultValue() {
      if (value !== void 0) return;
      value = type === "single" ? "" : [];
    }
    handleDefaultValue();
    watch.pre(() => value, () => {
      handleDefaultValue();
    });
    let inputValue = "";
    const rootState = SelectRootState.create({
      type,
      value: boxWith(() => value, (v) => {
        value = v;
        onValueChange(v);
      }),
      disabled: boxWith(() => disabled),
      required: boxWith(() => required),
      open: boxWith(() => open, (v) => {
        open = v;
        onOpenChange(v);
      }),
      loop: boxWith(() => loop),
      scrollAlignment: boxWith(() => scrollAlignment),
      name: boxWith(() => name),
      isCombobox: false,
      items: boxWith(() => items),
      allowDeselect: boxWith(() => allowDeselect),
      inputValue: boxWith(() => inputValue, (v) => inputValue = v),
      onOpenChangeComplete: boxWith(() => onOpenChangeComplete)
    });
    let $$settled = true;
    let $$inner_renderer;
    function $$render_inner($$renderer3) {
      Floating_layer($$renderer3, {
        children: ($$renderer4) => {
          children?.($$renderer4);
          $$renderer4.push(`<!---->`);
        }
      });
      $$renderer3.push(`<!----> `);
      if (Array.isArray(rootState.opts.value.current)) {
        $$renderer3.push("<!--[0-->");
        if (rootState.opts.value.current.length === 0) {
          $$renderer3.push("<!--[0-->");
          Select_hidden_input($$renderer3, { autocomplete });
        } else {
          $$renderer3.push("<!--[-1-->");
          $$renderer3.push(`<!--[-->`);
          const each_array = ensure_array_like(rootState.opts.value.current);
          for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
            let item = each_array[$$index];
            Select_hidden_input($$renderer3, { value: item, autocomplete });
          }
          $$renderer3.push(`<!--]-->`);
        }
        $$renderer3.push(`<!--]-->`);
      } else {
        $$renderer3.push("<!--[-1-->");
        Select_hidden_input($$renderer3, {
          autocomplete,
          get value() {
            return rootState.opts.value.current;
          },
          set value($$value) {
            rootState.opts.value.current = $$value;
            $$settled = false;
          }
        });
      }
      $$renderer3.push(`<!--]-->`);
    }
    do {
      $$settled = true;
      $$inner_renderer = $$renderer2.copy();
      $$render_inner($$inner_renderer);
    } while (!$$settled);
    $$renderer2.subsume($$inner_renderer);
    bind_props($$props, { value, open });
  });
}
function Select_trigger($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const uid = props_id($$renderer2);
    let {
      id = createId(uid),
      ref = null,
      child,
      children,
      type = "button",
      $$slots,
      $$events,
      ...restProps
    } = $$props;
    const triggerState = SelectTriggerState.create({
      id: boxWith(() => id),
      ref: boxWith(() => ref, (v) => ref = v)
    });
    const mergedProps = derived(() => mergeProps(restProps, triggerState.props, { type }));
    if (Floating_layer_anchor) {
      $$renderer2.push("<!--[-->");
      Floating_layer_anchor($$renderer2, {
        id,
        ref: triggerState.opts.ref,
        children: ($$renderer3) => {
          if (child) {
            $$renderer3.push("<!--[0-->");
            child($$renderer3, { props: mergedProps() });
            $$renderer3.push(`<!---->`);
          } else {
            $$renderer3.push("<!--[-1-->");
            $$renderer3.push(`<button${attributes({ ...mergedProps() })}>`);
            children?.($$renderer3);
            $$renderer3.push(`<!----></button>`);
          }
          $$renderer3.push(`<!--]-->`);
        }
      });
      $$renderer2.push("<!--]-->");
    } else {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push("<!--]-->");
    }
    bind_props($$props, { ref });
  });
}
const switchAttrs = createBitsAttrs({ component: "switch", parts: ["root", "thumb"] });
const SwitchRootContext = new Context2("Switch.Root");
class SwitchRootState {
  static create(opts) {
    return SwitchRootContext.set(new SwitchRootState(opts));
  }
  opts;
  attachment;
  constructor(opts) {
    this.opts = opts;
    this.attachment = attachRef(opts.ref);
    this.onkeydown = this.onkeydown.bind(this);
    this.onclick = this.onclick.bind(this);
  }
  #toggle() {
    this.opts.checked.current = !this.opts.checked.current;
  }
  onkeydown(e) {
    if (!(e.key === ENTER || e.key === SPACE) || this.opts.disabled.current) return;
    e.preventDefault();
    this.#toggle();
  }
  onclick(_) {
    if (this.opts.disabled.current) return;
    this.#toggle();
  }
  #sharedProps = derived(() => ({
    "data-disabled": boolToEmptyStrOrUndef(this.opts.disabled.current),
    "data-state": getDataChecked(this.opts.checked.current),
    "data-required": boolToEmptyStrOrUndef(this.opts.required.current)
  }));
  get sharedProps() {
    return this.#sharedProps();
  }
  set sharedProps($$value) {
    return this.#sharedProps($$value);
  }
  #snippetProps = derived(() => ({ checked: this.opts.checked.current }));
  get snippetProps() {
    return this.#snippetProps();
  }
  set snippetProps($$value) {
    return this.#snippetProps($$value);
  }
  #props = derived(() => ({
    ...this.sharedProps,
    id: this.opts.id.current,
    role: "switch",
    disabled: boolToTrueOrUndef(this.opts.disabled.current),
    "aria-checked": getAriaChecked(this.opts.checked.current),
    "aria-required": boolToStr(this.opts.required.current),
    [switchAttrs.root]: "",
    onclick: this.onclick,
    onkeydown: this.onkeydown,
    ...this.attachment
  }));
  get props() {
    return this.#props();
  }
  set props($$value) {
    return this.#props($$value);
  }
}
class SwitchInputState {
  static create() {
    return new SwitchInputState(SwitchRootContext.get());
  }
  root;
  #shouldRender = derived(() => this.root.opts.name.current !== void 0);
  get shouldRender() {
    return this.#shouldRender();
  }
  set shouldRender($$value) {
    return this.#shouldRender($$value);
  }
  constructor(root) {
    this.root = root;
  }
  #props = derived(() => ({
    type: "checkbox",
    name: this.root.opts.name.current,
    value: this.root.opts.value.current,
    checked: this.root.opts.checked.current,
    disabled: this.root.opts.disabled.current,
    required: this.root.opts.required.current
  }));
  get props() {
    return this.#props();
  }
  set props($$value) {
    return this.#props($$value);
  }
}
class SwitchThumbState {
  static create(opts) {
    return new SwitchThumbState(opts, SwitchRootContext.get());
  }
  opts;
  root;
  attachment;
  constructor(opts, root) {
    this.opts = opts;
    this.root = root;
    this.attachment = attachRef(opts.ref);
  }
  #snippetProps = derived(() => ({ checked: this.root.opts.checked.current }));
  get snippetProps() {
    return this.#snippetProps();
  }
  set snippetProps($$value) {
    return this.#snippetProps($$value);
  }
  #props = derived(() => ({
    ...this.root.sharedProps,
    id: this.opts.id.current,
    [switchAttrs.thumb]: "",
    ...this.attachment
  }));
  get props() {
    return this.#props();
  }
  set props($$value) {
    return this.#props($$value);
  }
}
function Switch_input($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const inputState = SwitchInputState.create();
    if (inputState.shouldRender) {
      $$renderer2.push("<!--[0-->");
      Hidden_input($$renderer2, spread_props([inputState.props]));
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]-->`);
  });
}
function Switch($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const uid = props_id($$renderer2);
    let {
      child,
      children,
      ref = null,
      id = createId(uid),
      disabled = false,
      required = false,
      checked = false,
      value = "on",
      name = void 0,
      type = "button",
      onCheckedChange = noop,
      $$slots,
      $$events,
      ...restProps
    } = $$props;
    const rootState = SwitchRootState.create({
      checked: boxWith(() => checked, (v) => {
        checked = v;
        onCheckedChange?.(v);
      }),
      disabled: boxWith(() => disabled ?? false),
      required: boxWith(() => required),
      value: boxWith(() => value),
      name: boxWith(() => name),
      id: boxWith(() => id),
      ref: boxWith(() => ref, (v) => ref = v)
    });
    const mergedProps = derived(() => mergeProps(restProps, rootState.props, { type }));
    if (child) {
      $$renderer2.push("<!--[0-->");
      child($$renderer2, { props: mergedProps(), ...rootState.snippetProps });
      $$renderer2.push(`<!---->`);
    } else {
      $$renderer2.push("<!--[-1-->");
      $$renderer2.push(`<button${attributes({ ...mergedProps() })}>`);
      children?.($$renderer2, rootState.snippetProps);
      $$renderer2.push(`<!----></button>`);
    }
    $$renderer2.push(`<!--]--> `);
    Switch_input($$renderer2);
    $$renderer2.push(`<!---->`);
    bind_props($$props, { ref, checked });
  });
}
function Switch_thumb($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const uid = props_id($$renderer2);
    let {
      child,
      children,
      ref = null,
      id = createId(uid),
      $$slots,
      $$events,
      ...restProps
    } = $$props;
    const thumbState = SwitchThumbState.create({
      id: boxWith(() => id),
      ref: boxWith(() => ref, (v) => ref = v)
    });
    const mergedProps = derived(() => mergeProps(restProps, thumbState.props));
    if (child) {
      $$renderer2.push("<!--[0-->");
      child($$renderer2, { props: mergedProps(), ...thumbState.snippetProps });
      $$renderer2.push(`<!---->`);
    } else {
      $$renderer2.push("<!--[-1-->");
      $$renderer2.push(`<span${attributes({ ...mergedProps() })}>`);
      children?.($$renderer2, thumbState.snippetProps);
      $$renderer2.push(`<!----></span>`);
    }
    $$renderer2.push(`<!--]-->`);
    bind_props($$props, { ref });
  });
}
const defaultAttributes = {
  xmlns: "http://www.w3.org/2000/svg",
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  "stroke-width": 2,
  "stroke-linecap": "round",
  "stroke-linejoin": "round"
};
const hasA11yProp = (props) => {
  for (const prop in props) {
    if (prop.startsWith("aria-") || prop === "role" || prop === "title") {
      return true;
    }
  }
  return false;
};
const LucideContext = /* @__PURE__ */ Symbol("lucide-context");
const getLucideContext = () => getContext(LucideContext);
function Icon($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const globalProps = getLucideContext() ?? {};
    const {
      name,
      color = globalProps.color ?? "currentColor",
      size: size2 = globalProps.size ?? 24,
      strokeWidth = globalProps.strokeWidth ?? 2,
      absoluteStrokeWidth = globalProps.absoluteStrokeWidth ?? false,
      iconNode = [],
      children,
      $$slots,
      $$events,
      ...props
    } = $$props;
    const calculatedStrokeWidth = derived(() => absoluteStrokeWidth ? Number(strokeWidth) * 24 / Number(size2) : strokeWidth);
    $$renderer2.push(`<svg${attributes(
      {
        ...defaultAttributes,
        ...!children && !hasA11yProp(props) && { "aria-hidden": "true" },
        ...props,
        width: size2,
        height: size2,
        stroke: color,
        "stroke-width": calculatedStrokeWidth(),
        class: clsx([
          "lucide-icon lucide",
          globalProps.class,
          name && `lucide-${name}`,
          props.class
        ])
      },
      void 0,
      void 0,
      void 0,
      3
    )}><!--[-->`);
    const each_array = ensure_array_like(iconNode);
    for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
      let [tag, attrs] = each_array[$$index];
      element($$renderer2, tag, () => {
        $$renderer2.push(`${attributes({ ...attrs }, void 0, void 0, void 0, 3)}`);
      });
    }
    $$renderer2.push(`<!--]-->`);
    children?.($$renderer2);
    $$renderer2.push(`<!----></svg>`);
  });
}
function Arrow_down_0_1($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { $$slots, $$events, ...props } = $$props;
    const iconNode = [
      ["path", { "d": "m3 16 4 4 4-4" }],
      ["path", { "d": "M7 20V4" }],
      [
        "rect",
        { "x": "15", "y": "4", "width": "4", "height": "6", "ry": "2" }
      ],
      ["path", { "d": "M17 20v-6h-2" }],
      ["path", { "d": "M15 20h4" }]
    ];
    Icon($$renderer2, spread_props([
      { name: "arrow-down-0-1" },
      /**
       * @component @name ArrowDown01
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8cGF0aCBkPSJtMyAxNiA0IDQgNC00IiAvPgogIDxwYXRoIGQ9Ik03IDIwVjQiIC8+CiAgPHJlY3QgeD0iMTUiIHk9IjQiIHdpZHRoPSI0IiBoZWlnaHQ9IjYiIHJ5PSIyIiAvPgogIDxwYXRoIGQ9Ik0xNyAyMHYtNmgtMiIgLz4KICA8cGF0aCBkPSJNMTUgMjBoNCIgLz4KPC9zdmc+Cg==) - https://lucide.dev/icons/arrow-down-0-1
       * @see https://lucide.dev/guide/packages/lucide-svelte - Documentation
       *
       * @param {Object} props - Lucide icons props and any valid SVG attribute
       * @returns {FunctionalComponent} Svelte component
       *
       */
      props,
      {
        iconNode,
        children: ($$renderer3) => {
          props.children?.($$renderer3);
          $$renderer3.push(`<!---->`);
        },
        $$slots: { default: true }
      }
    ]));
  });
}
function Arrow_right_left($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { $$slots, $$events, ...props } = $$props;
    const iconNode = [
      ["path", { "d": "m16 3 4 4-4 4" }],
      ["path", { "d": "M20 7H4" }],
      ["path", { "d": "m8 21-4-4 4-4" }],
      ["path", { "d": "M4 17h16" }]
    ];
    Icon($$renderer2, spread_props([
      { name: "arrow-right-left" },
      /**
       * @component @name ArrowRightLeft
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8cGF0aCBkPSJtMTYgMyA0IDQtNCA0IiAvPgogIDxwYXRoIGQ9Ik0yMCA3SDQiIC8+CiAgPHBhdGggZD0ibTggMjEtNC00IDQtNCIgLz4KICA8cGF0aCBkPSJNNCAxN2gxNiIgLz4KPC9zdmc+Cg==) - https://lucide.dev/icons/arrow-right-left
       * @see https://lucide.dev/guide/packages/lucide-svelte - Documentation
       *
       * @param {Object} props - Lucide icons props and any valid SVG attribute
       * @returns {FunctionalComponent} Svelte component
       *
       */
      props,
      {
        iconNode,
        children: ($$renderer3) => {
          props.children?.($$renderer3);
          $$renderer3.push(`<!---->`);
        },
        $$slots: { default: true }
      }
    ]));
  });
}
function Arrow_up_down($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { $$slots, $$events, ...props } = $$props;
    const iconNode = [
      ["path", { "d": "m21 16-4 4-4-4" }],
      ["path", { "d": "M17 20V4" }],
      ["path", { "d": "m3 8 4-4 4 4" }],
      ["path", { "d": "M7 4v16" }]
    ];
    Icon($$renderer2, spread_props([
      { name: "arrow-up-down" },
      /**
       * @component @name ArrowUpDown
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8cGF0aCBkPSJtMjEgMTYtNCA0LTQtNCIgLz4KICA8cGF0aCBkPSJNMTcgMjBWNCIgLz4KICA8cGF0aCBkPSJtMyA4IDQtNCA0IDQiIC8+CiAgPHBhdGggZD0iTTcgNHYxNiIgLz4KPC9zdmc+Cg==) - https://lucide.dev/icons/arrow-up-down
       * @see https://lucide.dev/guide/packages/lucide-svelte - Documentation
       *
       * @param {Object} props - Lucide icons props and any valid SVG attribute
       * @returns {FunctionalComponent} Svelte component
       *
       */
      props,
      {
        iconNode,
        children: ($$renderer3) => {
          props.children?.($$renderer3);
          $$renderer3.push(`<!---->`);
        },
        $$slots: { default: true }
      }
    ]));
  });
}
function Arrow_up_right($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { $$slots, $$events, ...props } = $$props;
    const iconNode = [
      ["path", { "d": "M7 7h10v10" }],
      ["path", { "d": "M7 17 17 7" }]
    ];
    Icon($$renderer2, spread_props([
      { name: "arrow-up-right" },
      /**
       * @component @name ArrowUpRight
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8cGF0aCBkPSJNNyA3aDEwdjEwIiAvPgogIDxwYXRoIGQ9Ik03IDE3IDE3IDciIC8+Cjwvc3ZnPgo=) - https://lucide.dev/icons/arrow-up-right
       * @see https://lucide.dev/guide/packages/lucide-svelte - Documentation
       *
       * @param {Object} props - Lucide icons props and any valid SVG attribute
       * @returns {FunctionalComponent} Svelte component
       *
       */
      props,
      {
        iconNode,
        children: ($$renderer3) => {
          props.children?.($$renderer3);
          $$renderer3.push(`<!---->`);
        },
        $$slots: { default: true }
      }
    ]));
  });
}
function Book_open($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { $$slots, $$events, ...props } = $$props;
    const iconNode = [
      ["path", { "d": "M12 7v14" }],
      [
        "path",
        {
          "d": "M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"
        }
      ]
    ];
    Icon($$renderer2, spread_props([
      { name: "book-open" },
      /**
       * @component @name BookOpen
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8cGF0aCBkPSJNMTIgN3YxNCIgLz4KICA8cGF0aCBkPSJNMyAxOGExIDEgMCAwIDEtMS0xVjRhMSAxIDAgMCAxIDEtMWg1YTQgNCAwIDAgMSA0IDQgNCA0IDAgMCAxIDQtNGg1YTEgMSAwIDAgMSAxIDF2MTNhMSAxIDAgMCAxLTEgMWgtNmEzIDMgMCAwIDAtMyAzIDMgMyAwIDAgMC0zLTN6IiAvPgo8L3N2Zz4K) - https://lucide.dev/icons/book-open
       * @see https://lucide.dev/guide/packages/lucide-svelte - Documentation
       *
       * @param {Object} props - Lucide icons props and any valid SVG attribute
       * @returns {FunctionalComponent} Svelte component
       *
       */
      props,
      {
        iconNode,
        children: ($$renderer3) => {
          props.children?.($$renderer3);
          $$renderer3.push(`<!---->`);
        },
        $$slots: { default: true }
      }
    ]));
  });
}
function Camera($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { $$slots, $$events, ...props } = $$props;
    const iconNode = [
      [
        "path",
        {
          "d": "M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z"
        }
      ],
      ["circle", { "cx": "12", "cy": "13", "r": "3" }]
    ];
    Icon($$renderer2, spread_props([
      { name: "camera" },
      /**
       * @component @name Camera
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8cGF0aCBkPSJNMTMuOTk3IDRhMiAyIDAgMCAxIDEuNzYgMS4wNWwuNDg2LjlBMiAyIDAgMCAwIDE4LjAwMyA3SDIwYTIgMiAwIDAgMSAyIDJ2OWEyIDIgMCAwIDEtMiAySDRhMiAyIDAgMCAxLTItMlY5YTIgMiAwIDAgMSAyLTJoMS45OTdhMiAyIDAgMCAwIDEuNzU5LTEuMDQ4bC40ODktLjkwNEEyIDIgMCAwIDEgMTAuMDA0IDR6IiAvPgogIDxjaXJjbGUgY3g9IjEyIiBjeT0iMTMiIHI9IjMiIC8+Cjwvc3ZnPgo=) - https://lucide.dev/icons/camera
       * @see https://lucide.dev/guide/packages/lucide-svelte - Documentation
       *
       * @param {Object} props - Lucide icons props and any valid SVG attribute
       * @returns {FunctionalComponent} Svelte component
       *
       */
      props,
      {
        iconNode,
        children: ($$renderer3) => {
          props.children?.($$renderer3);
          $$renderer3.push(`<!---->`);
        },
        $$slots: { default: true }
      }
    ]));
  });
}
function Check($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { $$slots, $$events, ...props } = $$props;
    const iconNode = [["path", { "d": "M20 6 9 17l-5-5" }]];
    Icon($$renderer2, spread_props([
      { name: "check" },
      /**
       * @component @name Check
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8cGF0aCBkPSJNMjAgNiA5IDE3bC01LTUiIC8+Cjwvc3ZnPgo=) - https://lucide.dev/icons/check
       * @see https://lucide.dev/guide/packages/lucide-svelte - Documentation
       *
       * @param {Object} props - Lucide icons props and any valid SVG attribute
       * @returns {FunctionalComponent} Svelte component
       *
       */
      props,
      {
        iconNode,
        children: ($$renderer3) => {
          props.children?.($$renderer3);
          $$renderer3.push(`<!---->`);
        },
        $$slots: { default: true }
      }
    ]));
  });
}
function Chevron_down($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { $$slots, $$events, ...props } = $$props;
    const iconNode = [["path", { "d": "m6 9 6 6 6-6" }]];
    Icon($$renderer2, spread_props([
      { name: "chevron-down" },
      /**
       * @component @name ChevronDown
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8cGF0aCBkPSJtNiA5IDYgNiA2LTYiIC8+Cjwvc3ZnPgo=) - https://lucide.dev/icons/chevron-down
       * @see https://lucide.dev/guide/packages/lucide-svelte - Documentation
       *
       * @param {Object} props - Lucide icons props and any valid SVG attribute
       * @returns {FunctionalComponent} Svelte component
       *
       */
      props,
      {
        iconNode,
        children: ($$renderer3) => {
          props.children?.($$renderer3);
          $$renderer3.push(`<!---->`);
        },
        $$slots: { default: true }
      }
    ]));
  });
}
function Circle_alert($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { $$slots, $$events, ...props } = $$props;
    const iconNode = [
      ["circle", { "cx": "12", "cy": "12", "r": "10" }],
      ["line", { "x1": "12", "x2": "12", "y1": "8", "y2": "12" }],
      [
        "line",
        { "x1": "12", "x2": "12.01", "y1": "16", "y2": "16" }
      ]
    ];
    Icon($$renderer2, spread_props([
      { name: "circle-alert" },
      /**
       * @component @name CircleAlert
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8Y2lyY2xlIGN4PSIxMiIgY3k9IjEyIiByPSIxMCIgLz4KICA8bGluZSB4MT0iMTIiIHgyPSIxMiIgeTE9IjgiIHkyPSIxMiIgLz4KICA8bGluZSB4MT0iMTIiIHgyPSIxMi4wMSIgeTE9IjE2IiB5Mj0iMTYiIC8+Cjwvc3ZnPgo=) - https://lucide.dev/icons/circle-alert
       * @see https://lucide.dev/guide/packages/lucide-svelte - Documentation
       *
       * @param {Object} props - Lucide icons props and any valid SVG attribute
       * @returns {FunctionalComponent} Svelte component
       *
       */
      props,
      {
        iconNode,
        children: ($$renderer3) => {
          props.children?.($$renderer3);
          $$renderer3.push(`<!---->`);
        },
        $$slots: { default: true }
      }
    ]));
  });
}
function Download($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { $$slots, $$events, ...props } = $$props;
    const iconNode = [
      ["path", { "d": "M12 15V3" }],
      ["path", { "d": "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }],
      ["path", { "d": "m7 10 5 5 5-5" }]
    ];
    Icon($$renderer2, spread_props([
      { name: "download" },
      /**
       * @component @name Download
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8cGF0aCBkPSJNMTIgMTVWMyIgLz4KICA8cGF0aCBkPSJNMjEgMTV2NGEyIDIgMCAwIDEtMiAySDVhMiAyIDAgMCAxLTItMnYtNCIgLz4KICA8cGF0aCBkPSJtNyAxMCA1IDUgNS01IiAvPgo8L3N2Zz4K) - https://lucide.dev/icons/download
       * @see https://lucide.dev/guide/packages/lucide-svelte - Documentation
       *
       * @param {Object} props - Lucide icons props and any valid SVG attribute
       * @returns {FunctionalComponent} Svelte component
       *
       */
      props,
      {
        iconNode,
        children: ($$renderer3) => {
          props.children?.($$renderer3);
          $$renderer3.push(`<!---->`);
        },
        $$slots: { default: true }
      }
    ]));
  });
}
function Ellipsis($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { $$slots, $$events, ...props } = $$props;
    const iconNode = [
      ["circle", { "cx": "12", "cy": "12", "r": "1" }],
      ["circle", { "cx": "19", "cy": "12", "r": "1" }],
      ["circle", { "cx": "5", "cy": "12", "r": "1" }]
    ];
    Icon($$renderer2, spread_props([
      { name: "ellipsis" },
      /**
       * @component @name Ellipsis
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8Y2lyY2xlIGN4PSIxMiIgY3k9IjEyIiByPSIxIiAvPgogIDxjaXJjbGUgY3g9IjE5IiBjeT0iMTIiIHI9IjEiIC8+CiAgPGNpcmNsZSBjeD0iNSIgY3k9IjEyIiByPSIxIiAvPgo8L3N2Zz4K) - https://lucide.dev/icons/ellipsis
       * @see https://lucide.dev/guide/packages/lucide-svelte - Documentation
       *
       * @param {Object} props - Lucide icons props and any valid SVG attribute
       * @returns {FunctionalComponent} Svelte component
       *
       */
      props,
      {
        iconNode,
        children: ($$renderer3) => {
          props.children?.($$renderer3);
          $$renderer3.push(`<!---->`);
        },
        $$slots: { default: true }
      }
    ]));
  });
}
function External_link($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { $$slots, $$events, ...props } = $$props;
    const iconNode = [
      ["path", { "d": "M15 3h6v6" }],
      ["path", { "d": "M10 14 21 3" }],
      [
        "path",
        {
          "d": "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"
        }
      ]
    ];
    Icon($$renderer2, spread_props([
      { name: "external-link" },
      /**
       * @component @name ExternalLink
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8cGF0aCBkPSJNMTUgM2g2djYiIC8+CiAgPHBhdGggZD0iTTEwIDE0IDIxIDMiIC8+CiAgPHBhdGggZD0iTTE4IDEzdjZhMiAyIDAgMCAxLTIgMkg1YTIgMiAwIDAgMS0yLTJWOGEyIDIgMCAwIDEgMi0yaDYiIC8+Cjwvc3ZnPgo=) - https://lucide.dev/icons/external-link
       * @see https://lucide.dev/guide/packages/lucide-svelte - Documentation
       *
       * @param {Object} props - Lucide icons props and any valid SVG attribute
       * @returns {FunctionalComponent} Svelte component
       *
       */
      props,
      {
        iconNode,
        children: ($$renderer3) => {
          props.children?.($$renderer3);
          $$renderer3.push(`<!---->`);
        },
        $$slots: { default: true }
      }
    ]));
  });
}
function Eye_off($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { $$slots, $$events, ...props } = $$props;
    const iconNode = [
      [
        "path",
        {
          "d": "M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"
        }
      ],
      ["path", { "d": "M14.084 14.158a3 3 0 0 1-4.242-4.242" }],
      [
        "path",
        {
          "d": "M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"
        }
      ],
      ["path", { "d": "m2 2 20 20" }]
    ];
    Icon($$renderer2, spread_props([
      { name: "eye-off" },
      /**
       * @component @name EyeOff
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8cGF0aCBkPSJNMTAuNzMzIDUuMDc2YTEwLjc0NCAxMC43NDQgMCAwIDEgMTEuMjA1IDYuNTc1IDEgMSAwIDAgMSAwIC42OTYgMTAuNzQ3IDEwLjc0NyAwIDAgMS0xLjQ0NCAyLjQ5IiAvPgogIDxwYXRoIGQ9Ik0xNC4wODQgMTQuMTU4YTMgMyAwIDAgMS00LjI0Mi00LjI0MiIgLz4KICA8cGF0aCBkPSJNMTcuNDc5IDE3LjQ5OWExMC43NSAxMC43NSAwIDAgMS0xNS40MTctNS4xNTEgMSAxIDAgMCAxIDAtLjY5NiAxMC43NSAxMC43NSAwIDAgMSA0LjQ0Ni01LjE0MyIgLz4KICA8cGF0aCBkPSJtMiAyIDIwIDIwIiAvPgo8L3N2Zz4K) - https://lucide.dev/icons/eye-off
       * @see https://lucide.dev/guide/packages/lucide-svelte - Documentation
       *
       * @param {Object} props - Lucide icons props and any valid SVG attribute
       * @returns {FunctionalComponent} Svelte component
       *
       */
      props,
      {
        iconNode,
        children: ($$renderer3) => {
          props.children?.($$renderer3);
          $$renderer3.push(`<!---->`);
        },
        $$slots: { default: true }
      }
    ]));
  });
}
function Eye($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { $$slots, $$events, ...props } = $$props;
    const iconNode = [
      [
        "path",
        {
          "d": "M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"
        }
      ],
      ["circle", { "cx": "12", "cy": "12", "r": "3" }]
    ];
    Icon($$renderer2, spread_props([
      { name: "eye" },
      /**
       * @component @name Eye
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8cGF0aCBkPSJNMi4wNjIgMTIuMzQ4YTEgMSAwIDAgMSAwLS42OTYgMTAuNzUgMTAuNzUgMCAwIDEgMTkuODc2IDAgMSAxIDAgMCAxIDAgLjY5NiAxMC43NSAxMC43NSAwIDAgMS0xOS44NzYgMCIgLz4KICA8Y2lyY2xlIGN4PSIxMiIgY3k9IjEyIiByPSIzIiAvPgo8L3N2Zz4K) - https://lucide.dev/icons/eye
       * @see https://lucide.dev/guide/packages/lucide-svelte - Documentation
       *
       * @param {Object} props - Lucide icons props and any valid SVG attribute
       * @returns {FunctionalComponent} Svelte component
       *
       */
      props,
      {
        iconNode,
        children: ($$renderer3) => {
          props.children?.($$renderer3);
          $$renderer3.push(`<!---->`);
        },
        $$slots: { default: true }
      }
    ]));
  });
}
function File_up($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { $$slots, $$events, ...props } = $$props;
    const iconNode = [
      [
        "path",
        {
          "d": "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"
        }
      ],
      ["path", { "d": "M14 2v5a1 1 0 0 0 1 1h5" }],
      ["path", { "d": "M12 12v6" }],
      ["path", { "d": "m15 15-3-3-3 3" }]
    ];
    Icon($$renderer2, spread_props([
      { name: "file-up" },
      /**
       * @component @name FileUp
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8cGF0aCBkPSJNNiAyMmEyIDIgMCAwIDEtMi0yVjRhMiAyIDAgMCAxIDItMmg4YTIuNCAyLjQgMCAwIDEgMS43MDQuNzA2bDMuNTg4IDMuNTg4QTIuNCAyLjQgMCAwIDEgMjAgOHYxMmEyIDIgMCAwIDEtMiAyeiIgLz4KICA8cGF0aCBkPSJNMTQgMnY1YTEgMSAwIDAgMCAxIDFoNSIgLz4KICA8cGF0aCBkPSJNMTIgMTJ2NiIgLz4KICA8cGF0aCBkPSJtMTUgMTUtMy0zLTMgMyIgLz4KPC9zdmc+Cg==) - https://lucide.dev/icons/file-up
       * @see https://lucide.dev/guide/packages/lucide-svelte - Documentation
       *
       * @param {Object} props - Lucide icons props and any valid SVG attribute
       * @returns {FunctionalComponent} Svelte component
       *
       */
      props,
      {
        iconNode,
        children: ($$renderer3) => {
          props.children?.($$renderer3);
          $$renderer3.push(`<!---->`);
        },
        $$slots: { default: true }
      }
    ]));
  });
}
function Globe($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { $$slots, $$events, ...props } = $$props;
    const iconNode = [
      ["circle", { "cx": "12", "cy": "12", "r": "10" }],
      [
        "path",
        { "d": "M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" }
      ],
      ["path", { "d": "M2 12h20" }]
    ];
    Icon($$renderer2, spread_props([
      { name: "globe" },
      /**
       * @component @name Globe
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8Y2lyY2xlIGN4PSIxMiIgY3k9IjEyIiByPSIxMCIgLz4KICA8cGF0aCBkPSJNMTIgMmExNC41IDE0LjUgMCAwIDAgMCAyMCAxNC41IDE0LjUgMCAwIDAgMC0yMCIgLz4KICA8cGF0aCBkPSJNMiAxMmgyMCIgLz4KPC9zdmc+Cg==) - https://lucide.dev/icons/globe
       * @see https://lucide.dev/guide/packages/lucide-svelte - Documentation
       *
       * @param {Object} props - Lucide icons props and any valid SVG attribute
       * @returns {FunctionalComponent} Svelte component
       *
       */
      props,
      {
        iconNode,
        children: ($$renderer3) => {
          props.children?.($$renderer3);
          $$renderer3.push(`<!---->`);
        },
        $$slots: { default: true }
      }
    ]));
  });
}
function Heart($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { $$slots, $$events, ...props } = $$props;
    const iconNode = [
      [
        "path",
        {
          "d": "M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5"
        }
      ]
    ];
    Icon($$renderer2, spread_props([
      { name: "heart" },
      /**
       * @component @name Heart
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8cGF0aCBkPSJNMiA5LjVhNS41IDUuNSAwIDAgMSA5LjU5MS0zLjY3Ni41Ni41NiAwIDAgMCAuODE4IDBBNS40OSA1LjQ5IDAgMCAxIDIyIDkuNWMwIDIuMjktMS41IDQtMyA1LjVsLTUuNDkyIDUuMzEzYTIgMiAwIDAgMS0zIC4wMTlMNSAxNWMtMS41LTEuNS0zLTMuMi0zLTUuNSIgLz4KPC9zdmc+Cg==) - https://lucide.dev/icons/heart
       * @see https://lucide.dev/guide/packages/lucide-svelte - Documentation
       *
       * @param {Object} props - Lucide icons props and any valid SVG attribute
       * @returns {FunctionalComponent} Svelte component
       *
       */
      props,
      {
        iconNode,
        children: ($$renderer3) => {
          props.children?.($$renderer3);
          $$renderer3.push(`<!---->`);
        },
        $$slots: { default: true }
      }
    ]));
  });
}
function Keyboard($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { $$slots, $$events, ...props } = $$props;
    const iconNode = [
      ["path", { "d": "M10 8h.01" }],
      ["path", { "d": "M12 12h.01" }],
      ["path", { "d": "M14 8h.01" }],
      ["path", { "d": "M16 12h.01" }],
      ["path", { "d": "M18 8h.01" }],
      ["path", { "d": "M6 8h.01" }],
      ["path", { "d": "M7 16h10" }],
      ["path", { "d": "M8 12h.01" }],
      [
        "rect",
        { "width": "20", "height": "16", "x": "2", "y": "4", "rx": "2" }
      ]
    ];
    Icon($$renderer2, spread_props([
      { name: "keyboard" },
      /**
       * @component @name Keyboard
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8cGF0aCBkPSJNMTAgOGguMDEiIC8+CiAgPHBhdGggZD0iTTEyIDEyaC4wMSIgLz4KICA8cGF0aCBkPSJNMTQgOGguMDEiIC8+CiAgPHBhdGggZD0iTTE2IDEyaC4wMSIgLz4KICA8cGF0aCBkPSJNMTggOGguMDEiIC8+CiAgPHBhdGggZD0iTTYgOGguMDEiIC8+CiAgPHBhdGggZD0iTTcgMTZoMTAiIC8+CiAgPHBhdGggZD0iTTggMTJoLjAxIiAvPgogIDxyZWN0IHdpZHRoPSIyMCIgaGVpZ2h0PSIxNiIgeD0iMiIgeT0iNCIgcng9IjIiIC8+Cjwvc3ZnPgo=) - https://lucide.dev/icons/keyboard
       * @see https://lucide.dev/guide/packages/lucide-svelte - Documentation
       *
       * @param {Object} props - Lucide icons props and any valid SVG attribute
       * @returns {FunctionalComponent} Svelte component
       *
       */
      props,
      {
        iconNode,
        children: ($$renderer3) => {
          props.children?.($$renderer3);
          $$renderer3.push(`<!---->`);
        },
        $$slots: { default: true }
      }
    ]));
  });
}
function Menu($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { $$slots, $$events, ...props } = $$props;
    const iconNode = [
      ["path", { "d": "M4 5h16" }],
      ["path", { "d": "M4 12h16" }],
      ["path", { "d": "M4 19h16" }]
    ];
    Icon($$renderer2, spread_props([
      { name: "menu" },
      /**
       * @component @name Menu
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8cGF0aCBkPSJNNCA1aDE2IiAvPgogIDxwYXRoIGQ9Ik00IDEyaDE2IiAvPgogIDxwYXRoIGQ9Ik00IDE5aDE2IiAvPgo8L3N2Zz4K) - https://lucide.dev/icons/menu
       * @see https://lucide.dev/guide/packages/lucide-svelte - Documentation
       *
       * @param {Object} props - Lucide icons props and any valid SVG attribute
       * @returns {FunctionalComponent} Svelte component
       *
       */
      props,
      {
        iconNode,
        children: ($$renderer3) => {
          props.children?.($$renderer3);
          $$renderer3.push(`<!---->`);
        },
        $$slots: { default: true }
      }
    ]));
  });
}
function Minus($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { $$slots, $$events, ...props } = $$props;
    const iconNode = [["path", { "d": "M5 12h14" }]];
    Icon($$renderer2, spread_props([
      { name: "minus" },
      /**
       * @component @name Minus
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8cGF0aCBkPSJNNSAxMmgxNCIgLz4KPC9zdmc+Cg==) - https://lucide.dev/icons/minus
       * @see https://lucide.dev/guide/packages/lucide-svelte - Documentation
       *
       * @param {Object} props - Lucide icons props and any valid SVG attribute
       * @returns {FunctionalComponent} Svelte component
       *
       */
      props,
      {
        iconNode,
        children: ($$renderer3) => {
          props.children?.($$renderer3);
          $$renderer3.push(`<!---->`);
        },
        $$slots: { default: true }
      }
    ]));
  });
}
function Moon($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { $$slots, $$events, ...props } = $$props;
    const iconNode = [
      [
        "path",
        {
          "d": "M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"
        }
      ]
    ];
    Icon($$renderer2, spread_props([
      { name: "moon" },
      /**
       * @component @name Moon
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8cGF0aCBkPSJNMjAuOTg1IDEyLjQ4NmE5IDkgMCAxIDEtOS40NzMtOS40NzJjLjQwNS0uMDIyLjYxNy40Ni40MDIuODAzYTYgNiAwIDAgMCA4LjI2OCA4LjI2OGMuMzQ0LS4yMTUuODI1LS4wMDQuODAzLjQwMSIgLz4KPC9zdmc+Cg==) - https://lucide.dev/icons/moon
       * @see https://lucide.dev/guide/packages/lucide-svelte - Documentation
       *
       * @param {Object} props - Lucide icons props and any valid SVG attribute
       * @returns {FunctionalComponent} Svelte component
       *
       */
      props,
      {
        iconNode,
        children: ($$renderer3) => {
          props.children?.($$renderer3);
          $$renderer3.push(`<!---->`);
        },
        $$slots: { default: true }
      }
    ]));
  });
}
function Move_horizontal($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { $$slots, $$events, ...props } = $$props;
    const iconNode = [
      ["path", { "d": "m18 8 4 4-4 4" }],
      ["path", { "d": "M2 12h20" }],
      ["path", { "d": "m6 8-4 4 4 4" }]
    ];
    Icon($$renderer2, spread_props([
      { name: "move-horizontal" },
      /**
       * @component @name MoveHorizontal
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8cGF0aCBkPSJtMTggOCA0IDQtNCA0IiAvPgogIDxwYXRoIGQ9Ik0yIDEyaDIwIiAvPgogIDxwYXRoIGQ9Im02IDgtNCA0IDQgNCIgLz4KPC9zdmc+Cg==) - https://lucide.dev/icons/move-horizontal
       * @see https://lucide.dev/guide/packages/lucide-svelte - Documentation
       *
       * @param {Object} props - Lucide icons props and any valid SVG attribute
       * @returns {FunctionalComponent} Svelte component
       *
       */
      props,
      {
        iconNode,
        children: ($$renderer3) => {
          props.children?.($$renderer3);
          $$renderer3.push(`<!---->`);
        },
        $$slots: { default: true }
      }
    ]));
  });
}
function Pause($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { $$slots, $$events, ...props } = $$props;
    const iconNode = [
      [
        "rect",
        { "x": "14", "y": "3", "width": "5", "height": "18", "rx": "1" }
      ],
      [
        "rect",
        { "x": "5", "y": "3", "width": "5", "height": "18", "rx": "1" }
      ]
    ];
    Icon($$renderer2, spread_props([
      { name: "pause" },
      /**
       * @component @name Pause
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8cmVjdCB4PSIxNCIgeT0iMyIgd2lkdGg9IjUiIGhlaWdodD0iMTgiIHJ4PSIxIiAvPgogIDxyZWN0IHg9IjUiIHk9IjMiIHdpZHRoPSI1IiBoZWlnaHQ9IjE4IiByeD0iMSIgLz4KPC9zdmc+Cg==) - https://lucide.dev/icons/pause
       * @see https://lucide.dev/guide/packages/lucide-svelte - Documentation
       *
       * @param {Object} props - Lucide icons props and any valid SVG attribute
       * @returns {FunctionalComponent} Svelte component
       *
       */
      props,
      {
        iconNode,
        children: ($$renderer3) => {
          props.children?.($$renderer3);
          $$renderer3.push(`<!---->`);
        },
        $$slots: { default: true }
      }
    ]));
  });
}
function Play($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { $$slots, $$events, ...props } = $$props;
    const iconNode = [
      [
        "path",
        {
          "d": "M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"
        }
      ]
    ];
    Icon($$renderer2, spread_props([
      { name: "play" },
      /**
       * @component @name Play
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8cGF0aCBkPSJNNSA1YTIgMiAwIDAgMSAzLjAwOC0xLjcyOGwxMS45OTcgNi45OThhMiAyIDAgMCAxIC4wMDMgMy40NThsLTEyIDdBMiAyIDAgMCAxIDUgMTl6IiAvPgo8L3N2Zz4K) - https://lucide.dev/icons/play
       * @see https://lucide.dev/guide/packages/lucide-svelte - Documentation
       *
       * @param {Object} props - Lucide icons props and any valid SVG attribute
       * @returns {FunctionalComponent} Svelte component
       *
       */
      props,
      {
        iconNode,
        children: ($$renderer3) => {
          props.children?.($$renderer3);
          $$renderer3.push(`<!---->`);
        },
        $$slots: { default: true }
      }
    ]));
  });
}
function Plus($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { $$slots, $$events, ...props } = $$props;
    const iconNode = [["path", { "d": "M5 12h14" }], ["path", { "d": "M12 5v14" }]];
    Icon($$renderer2, spread_props([
      { name: "plus" },
      /**
       * @component @name Plus
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8cGF0aCBkPSJNNSAxMmgxNCIgLz4KICA8cGF0aCBkPSJNMTIgNXYxNCIgLz4KPC9zdmc+Cg==) - https://lucide.dev/icons/plus
       * @see https://lucide.dev/guide/packages/lucide-svelte - Documentation
       *
       * @param {Object} props - Lucide icons props and any valid SVG attribute
       * @returns {FunctionalComponent} Svelte component
       *
       */
      props,
      {
        iconNode,
        children: ($$renderer3) => {
          props.children?.($$renderer3);
          $$renderer3.push(`<!---->`);
        },
        $$slots: { default: true }
      }
    ]));
  });
}
function Search($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { $$slots, $$events, ...props } = $$props;
    const iconNode = [
      ["path", { "d": "m21 21-4.34-4.34" }],
      ["circle", { "cx": "11", "cy": "11", "r": "8" }]
    ];
    Icon($$renderer2, spread_props([
      { name: "search" },
      /**
       * @component @name Search
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8cGF0aCBkPSJtMjEgMjEtNC4zNC00LjM0IiAvPgogIDxjaXJjbGUgY3g9IjExIiBjeT0iMTEiIHI9IjgiIC8+Cjwvc3ZnPgo=) - https://lucide.dev/icons/search
       * @see https://lucide.dev/guide/packages/lucide-svelte - Documentation
       *
       * @param {Object} props - Lucide icons props and any valid SVG attribute
       * @returns {FunctionalComponent} Svelte component
       *
       */
      props,
      {
        iconNode,
        children: ($$renderer3) => {
          props.children?.($$renderer3);
          $$renderer3.push(`<!---->`);
        },
        $$slots: { default: true }
      }
    ]));
  });
}
function Settings_2($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { $$slots, $$events, ...props } = $$props;
    const iconNode = [
      ["path", { "d": "M14 17H5" }],
      ["path", { "d": "M19 7h-9" }],
      ["circle", { "cx": "17", "cy": "17", "r": "3" }],
      ["circle", { "cx": "7", "cy": "7", "r": "3" }]
    ];
    Icon($$renderer2, spread_props([
      { name: "settings-2" },
      /**
       * @component @name Settings2
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8cGF0aCBkPSJNMTQgMTdINSIgLz4KICA8cGF0aCBkPSJNMTkgN2gtOSIgLz4KICA8Y2lyY2xlIGN4PSIxNyIgY3k9IjE3IiByPSIzIiAvPgogIDxjaXJjbGUgY3g9IjciIGN5PSI3IiByPSIzIiAvPgo8L3N2Zz4K) - https://lucide.dev/icons/settings-2
       * @see https://lucide.dev/guide/packages/lucide-svelte - Documentation
       *
       * @param {Object} props - Lucide icons props and any valid SVG attribute
       * @returns {FunctionalComponent} Svelte component
       *
       */
      props,
      {
        iconNode,
        children: ($$renderer3) => {
          props.children?.($$renderer3);
          $$renderer3.push(`<!---->`);
        },
        $$slots: { default: true }
      }
    ]));
  });
}
function Share_2($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { $$slots, $$events, ...props } = $$props;
    const iconNode = [
      ["circle", { "cx": "18", "cy": "5", "r": "3" }],
      ["circle", { "cx": "6", "cy": "12", "r": "3" }],
      ["circle", { "cx": "18", "cy": "19", "r": "3" }],
      [
        "line",
        { "x1": "8.59", "x2": "15.42", "y1": "13.51", "y2": "17.49" }
      ],
      [
        "line",
        { "x1": "15.41", "x2": "8.59", "y1": "6.51", "y2": "10.49" }
      ]
    ];
    Icon($$renderer2, spread_props([
      { name: "share-2" },
      /**
       * @component @name Share2
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8Y2lyY2xlIGN4PSIxOCIgY3k9IjUiIHI9IjMiIC8+CiAgPGNpcmNsZSBjeD0iNiIgY3k9IjEyIiByPSIzIiAvPgogIDxjaXJjbGUgY3g9IjE4IiBjeT0iMTkiIHI9IjMiIC8+CiAgPGxpbmUgeDE9IjguNTkiIHgyPSIxNS40MiIgeTE9IjEzLjUxIiB5Mj0iMTcuNDkiIC8+CiAgPGxpbmUgeDE9IjE1LjQxIiB4Mj0iOC41OSIgeTE9IjYuNTEiIHkyPSIxMC40OSIgLz4KPC9zdmc+Cg==) - https://lucide.dev/icons/share-2
       * @see https://lucide.dev/guide/packages/lucide-svelte - Documentation
       *
       * @param {Object} props - Lucide icons props and any valid SVG attribute
       * @returns {FunctionalComponent} Svelte component
       *
       */
      props,
      {
        iconNode,
        children: ($$renderer3) => {
          props.children?.($$renderer3);
          $$renderer3.push(`<!---->`);
        },
        $$slots: { default: true }
      }
    ]));
  });
}
function Shopping_bag($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { $$slots, $$events, ...props } = $$props;
    const iconNode = [
      ["path", { "d": "M16 10a4 4 0 0 1-8 0" }],
      ["path", { "d": "M3.103 6.034h17.794" }],
      [
        "path",
        {
          "d": "M3.4 5.467a2 2 0 0 0-.4 1.2V20a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6.667a2 2 0 0 0-.4-1.2l-2-2.667A2 2 0 0 0 17 2H7a2 2 0 0 0-1.6.8z"
        }
      ]
    ];
    Icon($$renderer2, spread_props([
      { name: "shopping-bag" },
      /**
       * @component @name ShoppingBag
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8cGF0aCBkPSJNMTYgMTBhNCA0IDAgMCAxLTggMCIgLz4KICA8cGF0aCBkPSJNMy4xMDMgNi4wMzRoMTcuNzk0IiAvPgogIDxwYXRoIGQ9Ik0zLjQgNS40NjdhMiAyIDAgMCAwLS40IDEuMlYyMGEyIDIgMCAwIDAgMiAyaDE0YTIgMiAwIDAgMCAyLTJWNi42NjdhMiAyIDAgMCAwLS40LTEuMmwtMi0yLjY2N0EyIDIgMCAwIDAgMTcgMkg3YTIgMiAwIDAgMC0xLjYuOHoiIC8+Cjwvc3ZnPgo=) - https://lucide.dev/icons/shopping-bag
       * @see https://lucide.dev/guide/packages/lucide-svelte - Documentation
       *
       * @param {Object} props - Lucide icons props and any valid SVG attribute
       * @returns {FunctionalComponent} Svelte component
       *
       */
      props,
      {
        iconNode,
        children: ($$renderer3) => {
          props.children?.($$renderer3);
          $$renderer3.push(`<!---->`);
        },
        $$slots: { default: true }
      }
    ]));
  });
}
function Square($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { $$slots, $$events, ...props } = $$props;
    const iconNode = [
      [
        "rect",
        { "width": "18", "height": "18", "x": "3", "y": "3", "rx": "2" }
      ]
    ];
    Icon($$renderer2, spread_props([
      { name: "square" },
      /**
       * @component @name Square
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8cmVjdCB3aWR0aD0iMTgiIGhlaWdodD0iMTgiIHg9IjMiIHk9IjMiIHJ4PSIyIiAvPgo8L3N2Zz4K) - https://lucide.dev/icons/square
       * @see https://lucide.dev/guide/packages/lucide-svelte - Documentation
       *
       * @param {Object} props - Lucide icons props and any valid SVG attribute
       * @returns {FunctionalComponent} Svelte component
       *
       */
      props,
      {
        iconNode,
        children: ($$renderer3) => {
          props.children?.($$renderer3);
          $$renderer3.push(`<!---->`);
        },
        $$slots: { default: true }
      }
    ]));
  });
}
function Sun($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { $$slots, $$events, ...props } = $$props;
    const iconNode = [
      ["circle", { "cx": "12", "cy": "12", "r": "4" }],
      ["path", { "d": "M12 2v2" }],
      ["path", { "d": "M12 20v2" }],
      ["path", { "d": "m4.93 4.93 1.41 1.41" }],
      ["path", { "d": "m17.66 17.66 1.41 1.41" }],
      ["path", { "d": "M2 12h2" }],
      ["path", { "d": "M20 12h2" }],
      ["path", { "d": "m6.34 17.66-1.41 1.41" }],
      ["path", { "d": "m19.07 4.93-1.41 1.41" }]
    ];
    Icon($$renderer2, spread_props([
      { name: "sun" },
      /**
       * @component @name Sun
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8Y2lyY2xlIGN4PSIxMiIgY3k9IjEyIiByPSI0IiAvPgogIDxwYXRoIGQ9Ik0xMiAydjIiIC8+CiAgPHBhdGggZD0iTTEyIDIwdjIiIC8+CiAgPHBhdGggZD0ibTQuOTMgNC45MyAxLjQxIDEuNDEiIC8+CiAgPHBhdGggZD0ibTE3LjY2IDE3LjY2IDEuNDEgMS40MSIgLz4KICA8cGF0aCBkPSJNMiAxMmgyIiAvPgogIDxwYXRoIGQ9Ik0yMCAxMmgyIiAvPgogIDxwYXRoIGQ9Im02LjM0IDE3LjY2LTEuNDEgMS40MSIgLz4KICA8cGF0aCBkPSJtMTkuMDcgNC45My0xLjQxIDEuNDEiIC8+Cjwvc3ZnPgo=) - https://lucide.dev/icons/sun
       * @see https://lucide.dev/guide/packages/lucide-svelte - Documentation
       *
       * @param {Object} props - Lucide icons props and any valid SVG attribute
       * @returns {FunctionalComponent} Svelte component
       *
       */
      props,
      {
        iconNode,
        children: ($$renderer3) => {
          props.children?.($$renderer3);
          $$renderer3.push(`<!---->`);
        },
        $$slots: { default: true }
      }
    ]));
  });
}
function Trash_2($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { $$slots, $$events, ...props } = $$props;
    const iconNode = [
      ["path", { "d": "M10 11v6" }],
      ["path", { "d": "M14 11v6" }],
      ["path", { "d": "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" }],
      ["path", { "d": "M3 6h18" }],
      ["path", { "d": "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" }]
    ];
    Icon($$renderer2, spread_props([
      { name: "trash-2" },
      /**
       * @component @name Trash2
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8cGF0aCBkPSJNMTAgMTF2NiIgLz4KICA8cGF0aCBkPSJNMTQgMTF2NiIgLz4KICA8cGF0aCBkPSJNMTkgNnYxNGEyIDIgMCAwIDEtMiAySDdhMiAyIDAgMCAxLTItMlY2IiAvPgogIDxwYXRoIGQ9Ik0zIDZoMTgiIC8+CiAgPHBhdGggZD0iTTggNlY0YTIgMiAwIDAgMSAyLTJoNGEyIDIgMCAwIDEgMiAydjIiIC8+Cjwvc3ZnPgo=) - https://lucide.dev/icons/trash-2
       * @see https://lucide.dev/guide/packages/lucide-svelte - Documentation
       *
       * @param {Object} props - Lucide icons props and any valid SVG attribute
       * @returns {FunctionalComponent} Svelte component
       *
       */
      props,
      {
        iconNode,
        children: ($$renderer3) => {
          props.children?.($$renderer3);
          $$renderer3.push(`<!---->`);
        },
        $$slots: { default: true }
      }
    ]));
  });
}
function Upload($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { $$slots, $$events, ...props } = $$props;
    const iconNode = [
      ["path", { "d": "M12 3v12" }],
      ["path", { "d": "m17 8-5-5-5 5" }],
      ["path", { "d": "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }]
    ];
    Icon($$renderer2, spread_props([
      { name: "upload" },
      /**
       * @component @name Upload
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8cGF0aCBkPSJNMTIgM3YxMiIgLz4KICA8cGF0aCBkPSJtMTcgOC01LTUtNSA1IiAvPgogIDxwYXRoIGQ9Ik0yMSAxNXY0YTIgMiAwIDAgMS0yIDJINWEyIDIgMCAwIDEtMi0ydi00IiAvPgo8L3N2Zz4K) - https://lucide.dev/icons/upload
       * @see https://lucide.dev/guide/packages/lucide-svelte - Documentation
       *
       * @param {Object} props - Lucide icons props and any valid SVG attribute
       * @returns {FunctionalComponent} Svelte component
       *
       */
      props,
      {
        iconNode,
        children: ($$renderer3) => {
          props.children?.($$renderer3);
          $$renderer3.push(`<!---->`);
        },
        $$slots: { default: true }
      }
    ]));
  });
}
function Volume_2($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { $$slots, $$events, ...props } = $$props;
    const iconNode = [
      [
        "path",
        {
          "d": "M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"
        }
      ],
      ["path", { "d": "M16 9a5 5 0 0 1 0 6" }],
      ["path", { "d": "M19.364 18.364a9 9 0 0 0 0-12.728" }]
    ];
    Icon($$renderer2, spread_props([
      { name: "volume-2" },
      /**
       * @component @name Volume2
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8cGF0aCBkPSJNMTEgNC43MDJhLjcwNS43MDUgMCAwIDAtMS4yMDMtLjQ5OEw2LjQxMyA3LjU4N0ExLjQgMS40IDAgMCAxIDUuNDE2IDhIM2ExIDEgMCAwIDAtMSAxdjZhMSAxIDAgMCAwIDEgMWgyLjQxNmExLjQgMS40IDAgMCAxIC45OTcuNDEzbDMuMzgzIDMuMzg0QS43MDUuNzA1IDAgMCAwIDExIDE5LjI5OHoiIC8+CiAgPHBhdGggZD0iTTE2IDlhNSA1IDAgMCAxIDAgNiIgLz4KICA8cGF0aCBkPSJNMTkuMzY0IDE4LjM2NGE5IDkgMCAwIDAgMC0xMi43MjgiIC8+Cjwvc3ZnPgo=) - https://lucide.dev/icons/volume-2
       * @see https://lucide.dev/guide/packages/lucide-svelte - Documentation
       *
       * @param {Object} props - Lucide icons props and any valid SVG attribute
       * @returns {FunctionalComponent} Svelte component
       *
       */
      props,
      {
        iconNode,
        children: ($$renderer3) => {
          props.children?.($$renderer3);
          $$renderer3.push(`<!---->`);
        },
        $$slots: { default: true }
      }
    ]));
  });
}
function X($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { $$slots, $$events, ...props } = $$props;
    const iconNode = [
      ["path", { "d": "M18 6 6 18" }],
      ["path", { "d": "m6 6 12 12" }]
    ];
    Icon($$renderer2, spread_props([
      { name: "x" },
      /**
       * @component @name X
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8cGF0aCBkPSJNMTggNiA2IDE4IiAvPgogIDxwYXRoIGQ9Im02IDYgMTIgMTIiIC8+Cjwvc3ZnPgo=) - https://lucide.dev/icons/x
       * @see https://lucide.dev/guide/packages/lucide-svelte - Documentation
       *
       * @param {Object} props - Lucide icons props and any valid SVG attribute
       * @returns {FunctionalComponent} Svelte component
       *
       */
      props,
      {
        iconNode,
        children: ($$renderer3) => {
          props.children?.($$renderer3);
          $$renderer3.push(`<!---->`);
        },
        $$slots: { default: true }
      }
    ]));
  });
}
function SiteSelector($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const DB_TYPE_ORDER = ["5128", "IEMs", "Headphones", "Earbuds"];
    const groupedSites = derived(() => {
      const typeMap = new SvelteMap();
      for (const site of squiglinkStore.sites) {
        for (let i = 0; i < site.dbs.length; i++) {
          const db = site.dbs[i];
          const items = typeMap.get(db.type) ?? [];
          const href = squiglinkStore.buildSiteUrl(site) + (db.folder || "/");
          items.push({
            type: db.type,
            value: site.name,
            label: site.name,
            href,
            username: site.username,
            dbIndex: i
          });
          typeMap.set(db.type, items);
        }
      }
      for (const items of typeMap.values()) {
        items.sort((a, b) => a.label.localeCompare(b.label));
      }
      const sortedTypes = [...typeMap.keys()].sort((a, b) => {
        const aIdx = DB_TYPE_ORDER.indexOf(a);
        const bIdx = DB_TYPE_ORDER.indexOf(b);
        if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
        if (aIdx !== -1) return -1;
        if (bIdx !== -1) return 1;
        return a.localeCompare(b);
      });
      return sortedTypes.map((type) => ({ type, items: typeMap.get(type) }));
    });
    const flatItems = derived(() => groupedSites().flatMap((g) => g.items.map((i) => ({ value: i.value, label: i.label }))));
    const currentValue = derived(() => {
      return "";
    });
    const triggerLabel = derived(() => {
      const username = squiglinkStore.currentSiteUsername;
      if (!username) return "Select a site";
      return squiglinkStore.sites.find((s) => s.username === username)?.name ?? "Select a site";
    });
    if (squiglinkStore.isEnabled && squiglinkStore.sites.length > 0) {
      $$renderer2.push("<!--[0-->");
      if (Select) {
        $$renderer2.push("<!--[-->");
        Select($$renderer2, {
          type: "single",
          value: currentValue(),
          items: flatItems(),
          children: ($$renderer3) => {
            if (Select_trigger) {
              $$renderer3.push("<!--[-->");
              Select_trigger($$renderer3, {
                class: "inline-flex items-center justify-between gap-1 rounded border border-base-content/20\n				min-w-36 bg-base-200 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-accent",
                children: ($$renderer4) => {
                  $$renderer4.push(`<!---->${escape_html(triggerLabel())} `);
                  Chevron_down($$renderer4, { class: "h-3 w-3 shrink-0 text-base-content/60" });
                  $$renderer4.push(`<!---->`);
                },
                $$slots: { default: true }
              });
              $$renderer3.push("<!--]-->");
            } else {
              $$renderer3.push("<!--[!-->");
              $$renderer3.push("<!--]-->");
            }
            $$renderer3.push(` `);
            if (Select_content) {
              $$renderer3.push("<!--[-->");
              Select_content($$renderer3, {
                side: "bottom",
                sideOffset: 4,
                class: "z-50 max-h-80 overflow-y-auto rounded-lg border border-base-content/15\n				bg-base-200 p-1 shadow-xl",
                style: "min-width: 12rem;",
                children: ($$renderer4) => {
                  $$renderer4.push(`<!--[-->`);
                  const each_array = ensure_array_like(groupedSites());
                  for (let $$index_1 = 0, $$length = each_array.length; $$index_1 < $$length; $$index_1++) {
                    let group = each_array[$$index_1];
                    if (Select_group) {
                      $$renderer4.push("<!--[-->");
                      Select_group($$renderer4, {
                        children: ($$renderer5) => {
                          if (Select_group_heading) {
                            $$renderer5.push("<!--[-->");
                            Select_group_heading($$renderer5, {
                              class: "px-2 py-1 text-[12px] font-semibold uppercase tracking-wider\n							text-base-content/50",
                              children: ($$renderer6) => {
                                $$renderer6.push(`<!---->${escape_html(group.type)}`);
                              },
                              $$slots: { default: true }
                            });
                            $$renderer5.push("<!--]-->");
                          } else {
                            $$renderer5.push("<!--[!-->");
                            $$renderer5.push("<!--]-->");
                          }
                          $$renderer5.push(` <!--[-->`);
                          const each_array_1 = ensure_array_like(group.items);
                          for (let $$index = 0, $$length2 = each_array_1.length; $$index < $$length2; $$index++) {
                            let item = each_array_1[$$index];
                            {
                              let child = function($$renderer6, { props, selected }) {
                                $$renderer6.push(`<a${attributes({
                                  ...props,
                                  href: item.href,
                                  target: "_blank",
                                  rel: "external noopener noreferrer",
                                  class: `block cursor-pointer rounded px-2 py-1 text-sm text-base-content no-underline outline-none data-highlighted:bg-base-300 ${stringify(selected ? "font-medium text-accent" : "")}`
                                })}>${escape_html(item.label)}</a>`);
                              };
                              if (Select_item) {
                                $$renderer5.push("<!--[-->");
                                Select_item($$renderer5, {
                                  value: item.value,
                                  label: item.label,
                                  child,
                                  $$slots: { child: true }
                                });
                                $$renderer5.push("<!--]-->");
                              } else {
                                $$renderer5.push("<!--[!-->");
                                $$renderer5.push("<!--]-->");
                              }
                            }
                          }
                          $$renderer5.push(`<!--]-->`);
                        },
                        $$slots: { default: true }
                      });
                      $$renderer4.push("<!--]-->");
                    } else {
                      $$renderer4.push("<!--[!-->");
                      $$renderer4.push("<!--]-->");
                    }
                  }
                  $$renderer4.push(`<!--]-->`);
                },
                $$slots: { default: true }
              });
              $$renderer3.push("<!--]-->");
            } else {
              $$renderer3.push("<!--[!-->");
              $$renderer3.push("<!--]-->");
            }
          },
          $$slots: { default: true }
        });
        $$renderer2.push("<!--]-->");
      } else {
        $$renderer2.push("<!--[!-->");
        $$renderer2.push("<!--]-->");
      }
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]-->`);
  });
}
function Button_1($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let {
      variant = "primary",
      size: size2 = "md",
      title,
      children,
      $$slots,
      $$events,
      ...restProps
    } = $$props;
    const variantClasses = {
      primary: "bg-primary text-primary-content hover:bg-primary/90",
      secondary: "bg-secondary text-secondary-content hover:bg-secondary/80",
      muted: "bg-base-300 text-base-content hover:bg-base-content/10",
      destructive: "bg-error text-error-content hover:bg-error/90",
      outline: "ring ring-base-content/20 bg-inherit text-base-content hover:brightness-90",
      ghost: "text-base-content bg-inherit hover:brightness-90",
      link: "text-primary underline-offset-4 hover:underline"
    };
    const sizeClasses = {
      xs: "px-1.5 py-0.5 text-[10px]",
      sm: "px-2.5 py-1.5 text-xs",
      md: "px-4 py-2 text-sm",
      lg: "px-6 py-3 text-base",
      icon: "p-2"
    };
    if (Button) {
      $$renderer2.push("<!--[-->");
      Button($$renderer2, spread_props([
        restProps,
        {
          class: `inline-flex items-center justify-center rounded-md font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent data-[state=open]:bg-base-100 ${stringify(sizeClasses[size2])} ${stringify(variantClasses[variant])} ${stringify(restProps.class)}`,
          title,
          "aria-label": restProps["aria-label"] || title,
          children: ($$renderer3) => {
            children?.($$renderer3);
            $$renderer3.push(`<!---->`);
          },
          $$slots: { default: true }
        }
      ]));
      $$renderer2.push("<!--]-->");
    } else {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push("<!--]-->");
    }
  });
}
function TopNavBar($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const titleType = derived(() => getConfigValue() ?? "TEXT");
    const titleContent = derived(() => getConfigValue() ?? "modernGraphTool");
    const linkList = derived(() => getConfigValue() ?? []);
    let sidebarOpen = false;
    function openSidebar() {
      sidebarOpen = true;
    }
    function closeSidebar() {
      sidebarOpen = false;
    }
    $$renderer2.push(`<header class="flex h-12 items-center border-b border-base-content/15 bg-base-300 px-4"><nav class="flex w-full items-center justify-between"><div class="flex items-center gap-4"><a href="." class="flex items-center no-underline text-base-content">`);
    if (titleType() === "HTML") {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`${html(titleContent())}`);
    } else if (titleType() === "IMAGE") {
      $$renderer2.push("<!--[1-->");
      $$renderer2.push(`<img${attr("src", titleContent())} alt="topbar title" class="h-8"/>`);
    } else {
      $$renderer2.push("<!--[-1-->");
      $$renderer2.push(`<span class="text-base font-semibold text-base-content">${escape_html(titleContent())}</span>`);
    }
    $$renderer2.push(`<!--]--></a> `);
    if (!appStore.isMobile) {
      $$renderer2.push("<!--[0-->");
      SiteSelector($$renderer2);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--></div> `);
    if (!appStore.isMobile) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div class="flex items-center gap-4"><!--[-->`);
      const each_array = ensure_array_like(linkList());
      for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
        let link = each_array[$$index];
        $$renderer2.push(`<a${attr("href", link.URL)} target="_blank" rel="external noopener noreferrer" class="text-sm hover:text-base-content">${escape_html(link.TITLE)}</a>`);
      }
      $$renderer2.push(`<!--]--></div>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> `);
    if (appStore.isMobile) {
      $$renderer2.push("<!--[0-->");
      Button_1($$renderer2, {
        title: "Open menu",
        onclick: openSidebar,
        variant: "ghost",
        size: "icon",
        class: "hover:bg-base-300",
        children: ($$renderer3) => {
          Menu($$renderer3, { class: "h-5 w-5" });
        },
        $$slots: { default: true }
      });
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--></nav></header> `);
    if (appStore.isMobile && sidebarOpen) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div role="presentation" class="fixed inset-0 z-40 bg-black/40"></div> <div class="fixed right-0 top-0 z-50 flex h-full w-64 flex-col bg-base-200 shadow-xl"><div class="flex items-center justify-between h-12 bg-base-300 border-b border-base-content/15 px-4 py-3"><h2 class="text-sm font-semibold">${escape_html(top_nav_bar_sidebar_link_title())}</h2> `);
      Button_1($$renderer2, {
        title: "Close menu",
        onclick: closeSidebar,
        variant: "ghost",
        size: "icon",
        children: ($$renderer3) => {
          X($$renderer3, { class: "h-5 w-5", "aria-hidden": "true" });
        },
        $$slots: { default: true }
      });
      $$renderer2.push(`<!----></div> <nav class="flex flex-col gap-0.5 p-2"><!--[-->`);
      const each_array_1 = ensure_array_like(linkList());
      for (let $$index_1 = 0, $$length = each_array_1.length; $$index_1 < $$length; $$index_1++) {
        let link = each_array_1[$$index_1];
        $$renderer2.push(`<a${attr("href", link.URL)} target="_blank" rel="external noopener noreferrer" class="rounded-md p-2 text-sm hover:bg-base-300">${escape_html(link.TITLE)}</a>`);
      }
      $$renderer2.push(`<!--]--></nav> <div class="mt-auto border-t border-base-content/15 p-4">`);
      SiteSelector($$renderer2);
      $$renderer2.push(`<!----></div></div>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]-->`);
  });
}
function DragDivider($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    $$renderer2.push(`<div role="none" tabindex="-1" data-tutorial-target="divider"${attr_class(`w-[5px] cursor-col-resize transition-colors ${stringify("bg-base-content/20 hover:bg-base-content/35")}`)}></div>`);
  });
}
const MENU_PANELS = ["device", "graph", "equalizer", "misc"];
class MenuStore {
  currentPanel = "graph";
  /** 1 = sliding right (next panel), -1 = sliding left (prev panel) */
  slideDirection = 1;
  setPanel(panel) {
    const oldIdx = MENU_PANELS.indexOf(this.currentPanel);
    const newIdx = MENU_PANELS.indexOf(panel);
    this.slideDirection = newIdx >= oldIdx ? 1 : -1;
    this.currentPanel = panel;
  }
}
const menuStore = new MenuStore();
function MenuCarousel($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const BUTTON_W = 96;
    const STRIDE = BUTTON_W + 12;
    const panels = [
      { id: "device", label: menu_item_device_label },
      { id: "graph", label: menu_item_graph_label },
      { id: "equalizer", label: menu_item_equalizer_label },
      { id: "misc", label: menu_item_misc_label }
    ];
    let currentIndex = derived(() => panels.findIndex((p) => p.id === menuStore.currentPanel));
    let containerWidth = 0;
    const scrollX = derived(() => containerWidth / 2 - currentIndex() * STRIDE - BUTTON_W / 2 + 0);
    $$renderer2.push(`<nav data-tutorial-target="menu"${attr_class(`relative flex h-12 items-center overflow-hidden border-base-content/15 bg-base-300 select-none ${stringify(appStore.isMobile ? "border-t" : "border-b")}`)}><div role="tablist" aria-orientation="horizontal" class="flex items-center gap-3 transition-transform duration-300 ease-in-out"${attr_style("", {
      transform: `translateX(${stringify(scrollX())}px)`,
      transition: void 0
    })}><!--[-->`);
    const each_array = ensure_array_like(panels);
    for (let i = 0, $$length = each_array.length; i < $$length; i++) {
      let panel = each_array[i];
      $$renderer2.push(`<button type="button" role="tab"${attr("aria-selected", menuStore.currentPanel === panel.id)}${attr_class(`relative w-24 shrink-0 rounded-md px-2 py-1.5 text-sm font-semibold tracking-wide transition-all focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none ${stringify(menuStore.currentPanel === panel.id ? "text-accent" : Math.abs(i - currentIndex()) === 1 ? "text-base-content/60" : "text-base-content/25")}`)}>${escape_html(panel.label())} `);
      if (menuStore.currentPanel === panel.id) {
        $$renderer2.push("<!--[0-->");
        $$renderer2.push(`<span class="absolute bottom-0 left-1/2 h-0.5 w-12 -translate-x-1/2 rounded-full bg-accent"></span>`);
      } else {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]--></button>`);
    }
    $$renderer2.push(`<!--]--></div></nav>`);
  });
}
class GraphHandle {
  svg;
  graphEngine;
  yShift;
  maxShift;
  isMobile;
  handleRadius;
  handleGroup;
  handle;
  minY = 0;
  maxY = 0;
  centerY = 0;
  constructor(svg, graphEngine2, isMobile) {
    this.svg = svg;
    this.graphEngine = graphEngine2;
    this.yShift = 0;
    this.maxShift = 20;
    this.isMobile = isMobile;
    this.handleRadius = isMobile ? 20 : 10;
    this._initHandle();
    this._setupDragBehavior();
    this._attachEventListeners();
  }
  _initHandle() {
    this.handleGroup = this.svg.append("g").attr("class", "y-scaler-handle").attr("data-tutorial-target", "graph_handle").attr("transform", `translate(${this.graphEngine.graphGeometry.xEnd},0)`);
    this.handle = this.handleGroup.append("circle").attr("r", this.handleRadius).attr("stroke", "var(--color-primary)").attr("stroke-width", 2).attr("fill", "var(--color-base-300)").attr("opacity", "0.4").attr("cursor", "pointer").attr(
      "cy",
      (this.graphEngine.graphGeometry.yTop + this.graphEngine.graphGeometry.yBottom) / 2
    );
    this.minY = this.graphEngine.graphGeometry.yTop + this.handleRadius;
    this.maxY = this.graphEngine.graphGeometry.yBottom - this.handleRadius;
    this.centerY = (this.minY + this.maxY) / 2;
  }
  _setupDragBehavior() {
    const drag = d3.drag().on("start", () => {
      this.handle.attr("opacity", "1");
    }).on("drag", (event) => {
      const newY = Math.max(this.minY, Math.min(this.maxY, event.y));
      this.handle.attr("cy", newY);
      const normalizedPosition = (newY - this.centerY) / (this.maxY - this.centerY);
      this.yShift = this.maxShift * normalizedPosition;
      this._updateGraphPosition();
    }).on("end", () => {
      this.handle.attr("opacity", "0.4");
    });
    this.handle.call(
      drag
    );
  }
  _updateGraphPosition() {
    this.graphEngine.yScale = d3.scaleLinear().domain([
      -(this.graphEngine.yScaleValue / 2) + this.yShift,
      this.graphEngine.yScaleValue / 2 + this.yShift
    ]).range([this.graphEngine.graphGeometry.yBottom, this.graphEngine.graphGeometry.yTop]);
    this.graphEngine.baseYScale = this.graphEngine.yScale.copy();
    this.graphEngine.updateYAxis(null, false);
    this.graphEngine.repositionCurves();
  }
  resetHandle() {
    this.handle.transition().duration(0).attr("cy", this.centerY);
    this.yShift = 0;
    this._updateGraphPosition();
  }
  /** Called by GraphContainer when appStore.isMobile changes */
  setMobile(isMobile) {
    this.isMobile = isMobile;
    this.handleRadius = isMobile ? 20 : 10;
    this.handle.attr("r", this.handleRadius);
    this.minY = this.graphEngine.graphGeometry.yTop + this.handleRadius;
    this.maxY = this.graphEngine.graphGeometry.yBottom - this.handleRadius;
    this.centerY = (this.minY + this.maxY) / 2;
    if (this.yShift === 0) {
      this.handle.attr("cy", this.centerY);
    }
  }
  _attachEventListeners() {
    this.handle.on("dblclick touchstart", (event) => {
      if (event.type === "touchstart") {
        const lastTouch = this.handle.property("lastTouch") || 0;
        const currentTime = (/* @__PURE__ */ new Date()).getTime();
        if (currentTime - lastTouch <= 300) {
          event.preventDefault();
          this.resetHandle();
          this.handle.property("lastTouch", 0);
        } else {
          this.handle.property("lastTouch", currentTime);
        }
      } else {
        this.resetHandle();
      }
    });
  }
}
class GraphInspection {
  graphEngine;
  isEnabled;
  verticalLine;
  inspectionGroup;
  valueDisplay;
  bisector;
  frequencyText;
  mouseTracker;
  constructor(graphEngine2) {
    this.graphEngine = graphEngine2;
    this.isEnabled = false;
    this.mouseTracker = null;
    this.bisector = d3.bisector((d) => d[0]).left;
    this._setupInspectionElements();
  }
  _setupInspectionElements() {
    this.inspectionGroup = this.graphEngine.svg.append("g").attr("class", "fr-graph-inspection").style("pointer-events", "none").style("display", "none");
    this.verticalLine = this.inspectionGroup.append("line").attr("class", "inspection-line").attr("y1", this.graphEngine.graphGeometry.yTop).attr("y2", this.graphEngine.graphGeometry.yBottom).attr("stroke", "var(--color-base-content)").attr("stroke-width", 1).attr("stroke-dasharray", "2,2").attr("opacity", 0.7);
    this.valueDisplay = this.inspectionGroup.append("g").attr("class", "inspection-values");
    this.frequencyText = this.inspectionGroup.append("text").attr("class", "inspection-frequency").attr("y", this.graphEngine.graphGeometry.yBottom - 15).attr("text-anchor", "middle").attr("font-size", "16px").attr("font-weight", "bold").attr("fill", "var(--color-base-content)");
  }
  /** Called by GraphPanel component to toggle inspection mode */
  setEnabled(enabled) {
    this.isEnabled = enabled;
    if (enabled) {
      this._enableMouseTracking();
      this._hideLabels();
      this.inspectionGroup.style("display", "block");
    } else {
      this._disableMouseTracking();
      this._showLabels();
      this.inspectionGroup.style("display", "none");
    }
  }
  _enableMouseTracking() {
    this.mouseTracker = this.graphEngine.svg.append("rect").attr("class", "mouse-tracker").attr("x", this.graphEngine.graphGeometry.xStart).attr("y", this.graphEngine.graphGeometry.yTop).attr("width", this.graphEngine.graphGeometry.xEnd - this.graphEngine.graphGeometry.xStart).attr("height", this.graphEngine.graphGeometry.yBottom - this.graphEngine.graphGeometry.yTop).attr("fill", "none").attr("pointer-events", "all").style("cursor", "crosshair");
    this.mouseTracker.on("mousemove", (event) => this._onMouseMove(event)).on("mouseleave", () => this._onMouseLeave());
  }
  _disableMouseTracking() {
    if (this.mouseTracker) {
      this.mouseTracker.remove();
      this.mouseTracker = null;
    }
  }
  _onMouseMove(event) {
    const [mouseX] = d3.pointer(event);
    const frequency = this.graphEngine.xScale.invert(mouseX);
    this.verticalLine.attr("x1", mouseX).attr("x2", mouseX);
    this._updateFrequencyDisplay(frequency, mouseX);
    this._updateValueDisplays(frequency, mouseX);
  }
  _onMouseLeave() {
    this.inspectionGroup.style("opacity", 0.7);
  }
  _updateFrequencyDisplay(frequency, mouseX) {
    const frequencyString = frequency >= 1e3 ? `${(frequency / 1e3).toFixed(1)}kHz` : `${Math.round(frequency)}Hz`;
    const textWidth = frequencyString.length * 10;
    const halfTextWidth = textWidth / 2;
    let textX = mouseX;
    let textAnchor = "middle";
    if (mouseX + halfTextWidth > this.graphEngine.graphGeometry.xEnd) {
      textX = mouseX - 10;
      textAnchor = "end";
    } else if (mouseX - halfTextWidth < this.graphEngine.graphGeometry.xStart) {
      textX = mouseX + 10;
      textAnchor = "start";
    }
    this.frequencyText.attr("x", textX).attr("text-anchor", textAnchor).text(frequencyString);
  }
  _updateValueDisplays(frequency, mouseX) {
    this.valueDisplay.selectAll("*").remove();
    let yOffset = 0;
    const lineHeight = 18;
    const rectPadding = 10;
    const deviceListData = [];
    Array.from(frStore.entries).filter(([, obj]) => !obj.hidden).sort(([, a], [, b]) => a.type === "target" ? -1 : 1).forEach(([, obj]) => {
      const channels = obj.type === "target" ? ["AVG"] : [...obj.dispChannel];
      channels.forEach((channel) => {
        const channelData = obj.channels[channel]?.data;
        if (!channelData) return;
        const splValue = this._interpolateSPL(channelData, frequency);
        if (splValue === null) return;
        const compensatedSPL = this._applyBaselineCompensation(splValue, frequency);
        const displayName = obj.type !== "target" ? `${obj.identifier} (${channel})` : obj.identifier;
        const displayText = `${displayName}: ${compensatedSPL.toFixed(1)}dB`;
        deviceListData.push({
          displayText,
          textWidth: 0,
          color: obj.colors[channel] || obj.colors?.AVG || "var(--color-base-content)",
          yOffset
        });
        yOffset += lineHeight;
      });
      if (obj.samples && obj.dispSamples?.length) {
        for (const key of obj.dispSamples) {
          const match = key.match(/^([LR])(\d+)$/);
          if (!match) continue;
          const side = match[1];
          const sampleIndex = parseInt(match[2]) - 1;
          const sample = obj.samples[sampleIndex];
          const sampleData = sample?.[side]?.data;
          if (!sampleData) continue;
          const splValue = this._interpolateSPL(sampleData, frequency);
          if (splValue === null) continue;
          const compensatedSPL = this._applyBaselineCompensation(splValue, frequency);
          const displayText = `  ${obj.identifier} (${key}): ${compensatedSPL.toFixed(1)}dB`;
          deviceListData.push({
            displayText,
            textWidth: 0,
            color: obj.colors.samples?.[key] || obj.colors[side] || obj.colors.AVG || "var(--color-base-content)",
            yOffset
          });
          yOffset += lineHeight;
        }
      }
    });
    const scratch = this.valueDisplay.append("text").attr("font-size", "16px").attr("font-weight", "500").style("visibility", "hidden");
    let maxTextWidth = 0;
    for (const item of deviceListData) {
      scratch.text(item.displayText);
      item.textWidth = scratch.node().getBBox().width + rectPadding * 2;
      if (item.textWidth > maxTextWidth) maxTextWidth = item.textWidth;
    }
    scratch.remove();
    const listPadding = 15;
    const rightEdgeSpace = this.graphEngine.graphGeometry.xEnd - mouseX;
    const leftEdgeSpace = mouseX - this.graphEngine.graphGeometry.xStart;
    let listX;
    let textAnchor;
    if (rightEdgeSpace >= maxTextWidth + listPadding) {
      listX = mouseX + listPadding;
      textAnchor = "start";
    } else if (leftEdgeSpace >= maxTextWidth + listPadding) {
      listX = mouseX - listPadding;
      textAnchor = "end";
    } else if (rightEdgeSpace > leftEdgeSpace) {
      listX = mouseX + 10;
      textAnchor = "start";
    } else {
      listX = mouseX - 10;
      textAnchor = "end";
    }
    deviceListData.forEach((item) => {
      const valueGroup = this.valueDisplay.append("g").attr(
        "transform",
        `translate(${listX}, ${this.graphEngine.graphGeometry.yTop + 32 + item.yOffset})`
      );
      const rectX = textAnchor === "start" ? -rectPadding : -(item.textWidth - rectPadding);
      valueGroup.append("rect").attr("x", rectX).attr("y", -16).attr("width", item.textWidth).attr("height", 18).attr("fill", "var(--color-base-200)").attr("rx", 2).attr("opacity", 0.7);
      valueGroup.append("text").attr("x", 0).attr("y", -2).attr("text-anchor", textAnchor).attr("font-size", "16px").attr("font-weight", "500").attr("fill", item.color).text(item.displayText);
    });
    this.inspectionGroup.style("opacity", 1);
  }
  _interpolateSPL(channelData, frequency) {
    if (!channelData || channelData.length === 0) return null;
    const i = this.bisector(channelData, frequency);
    const a = channelData[i - 1];
    const b = channelData[i];
    if (a && b) {
      const t = (frequency - a[0]) / (b[0] - a[0]);
      return a[1] + t * (b[1] - a[1]);
    } else if (a) {
      return a[1];
    } else if (b) {
      return b[1];
    }
    return null;
  }
  _applyBaselineCompensation(splValue, frequency) {
    const baselineData = this.graphEngine.getBaselineData();
    if (!baselineData.channelData || baselineData.channelData.length === 0) {
      return splValue;
    }
    const baselineSPL = this._interpolateSPL(baselineData.channelData, frequency);
    if (baselineSPL === null) return splValue;
    return splValue - baselineSPL;
  }
  _hideLabels() {
    this.graphEngine.svg.selectAll(".fr-graph-label, .fr-graph-label-bg").style("display", "none");
  }
  _showLabels() {
    this.graphEngine.svg.selectAll(".fr-graph-label, .fr-graph-label-bg").style("display", "block");
  }
  onLabelsUpdated() {
    if (this.isEnabled) {
      this._hideLabels();
    }
  }
  destroy() {
    this._disableMouseTracking();
    if (this.inspectionGroup) {
      this.inspectionGroup.remove();
    }
  }
}
class GraphEngine {
  // ── Property declarations ──────────────────────────────────────────────────
  viewBoxWidth;
  viewBoxHeight;
  graphGeometry;
  labelPosition;
  baselineData;
  transitionDuration;
  yScaleValue = 50;
  svg;
  graphHandle;
  graphInspection;
  _updateCurveRAF = null;
  xScale;
  yScale;
  /** Y scale without handle pan shift — used by EQ overlay for node positioning */
  baseYScale;
  curveGroup;
  /** Optional EQ overlay reference — set by GraphContainer for handle-drag coordination */
  eqOverlay = null;
  isInitialized = false;
  constructor() {
    const aspectRatio = getConfigValue() || "16:9";
    this.viewBoxWidth = 800;
    this.viewBoxHeight = aspectRatio === "CrinGraph" ? 346 : 450;
    const margin = 15;
    this.graphGeometry = {
      xStart: margin,
      xEnd: this.viewBoxWidth - margin,
      yTop: margin,
      yBottom: this.viewBoxHeight - margin
    };
    const g = this.graphGeometry;
    this.labelPosition = {
      BOTTOM_LEFT: { x: g.xStart, y: g.yBottom, anchor: "start", growUp: true },
      BOTTOM_RIGHT: { x: g.xEnd, y: g.yBottom, anchor: "end", growUp: true },
      TOP_LEFT: { x: g.xStart, y: g.yTop, anchor: "start", growUp: false },
      TOP_RIGHT: { x: g.xEnd, y: g.yTop, anchor: "end", growUp: false },
      CENTER: {
        x: (g.xStart + g.xEnd) / 2,
        y: (g.yTop + g.yBottom) / 2,
        anchor: "middle",
        growUp: false
      }
    };
    this.baselineData = { uuid: null, identifier: null, channelData: null };
    this.transitionDuration = 300;
  }
  /** Initialize GraphEngine with bound SVG element */
  init(svgEl, isMobile = false) {
    this.yScaleValue = parseInt(getConfigValue() || "50") || 50;
    graphStore.yScale = this.yScaleValue;
    this.svg = d3.select(svgEl).attr("viewBox", `0 0 ${this.viewBoxWidth} ${this.viewBoxHeight}`).attr("preserveAspectRatio", "xMidYMid meet");
    this._setupScales();
    this._drawAxis();
    this._drawFadeGradient();
    this._createCurveGroup();
    this.graphHandle = new GraphHandle(this.svg, this, isMobile);
    this.graphInspection = new GraphInspection(this);
    this.isInitialized = true;
  }
  /** Update the graph with new data — coalesced via requestAnimationFrame */
  refreshEveryFRCurves() {
    if (this._updateCurveRAF !== null) {
      cancelAnimationFrame(this._updateCurveRAF);
    }
    this._updateCurveRAF = requestAnimationFrame(() => {
      this.refreshBaselineData();
      this.curveGroup.attr("transform", "translate(0,0)");
      this.svg.select(".fr-graph-curve-container").selectAll("path[class*='fr-graph-'][class*='-curve']").interrupt().remove();
      frStore.entries.forEach((obj, uuid) => {
        if (!obj.hidden) {
          this.drawFRCurve(uuid);
        }
      });
      this.orderOverlayLayers();
      this._updateCurveRAF = null;
    });
  }
  /** Update Y Scale of Graph */
  updateYScale(scale) {
    this.yScaleValue = parseInt(scale);
    graphStore.yScale = this.yScaleValue;
    this._setupScales();
    this.graphHandle.resetHandle();
    this.updateYAxis();
    this.curveGroup.selectAll("path[class*='fr-graph-'][class*='-curve']:not(.fr-graph-hptf-fill)").interrupt().transition().duration(this.transitionDuration).attr("d", (d) => this._getCompensatedPath(d));
    this._transitionHpTFFillPaths(true);
  }
  /** Refresh baseline channel data from latest frStore entry (after re-smooth, re-normalize, etc.) */
  refreshBaselineData() {
    if (!this.baselineData.uuid) return;
    const data = frStore.get(this.baselineData.uuid);
    if (!data) {
      this.baselineData = { uuid: null, identifier: null, channelData: null };
      graphStore.baselineUUID = null;
      graphStore.baselineMode = "off";
      return;
    }
    if (graphStore.baselineMode === "withAdjustment") {
      const original = graphStore.targetOriginalData.get(this.baselineData.uuid);
      if (original?.["AVG"]?.data) {
        this.baselineData.channelData = original["AVG"].data;
      }
      return;
    }
    this.baselineData.channelData = data.type === "phone" ? data.channels[data.dispChannel.includes("L") && data.dispChannel.includes("R") ? "AVG" : data.dispChannel[0]]?.data ?? null : data.channels["AVG"]?.data ?? null;
  }
  /** Update Baseline Data */
  updateBaselineData(enable, { uuid = null, channelData = null } = {}) {
    if (!enable) {
      this.baselineData = { uuid: null, identifier: null, channelData: null };
    } else {
      if (uuid === null) {
        console.error("Baseline UUID is not defined");
        return;
      }
      const baselineMetaData = frStore.get(uuid);
      if (!baselineMetaData) {
        console.error("Baseline data not found for UUID:", uuid);
        return;
      }
      this.baselineData = {
        uuid,
        identifier: baselineMetaData.identifier,
        channelData: channelData !== null ? channelData : baselineMetaData.type === "phone" ? baselineMetaData.channels[baselineMetaData.dispChannel.includes("L") && baselineMetaData.dispChannel.includes("R") ? "AVG" : baselineMetaData.dispChannel[0]]?.data ?? null : baselineMetaData.channels["AVG"]?.data ?? null
      };
    }
    graphStore.baselineUUID = this.baselineData.uuid;
    this.updateBaseline(true);
  }
  /** Update Baseline on Graph */
  updateBaseline(animate = false) {
    const self = this;
    this.curveGroup.selectAll("path[class*='fr-graph-'][class*='-curve']:not(.fr-graph-hptf-fill)").interrupt().transition().duration(animate ? this.transitionDuration : 0).attrTween("d", function(d) {
      const path = d3.select(this);
      const oldPath = path.attr("d") ?? "";
      const newPath = self._getCompensatedPath(d) ?? "";
      return (t) => d3.interpolateString(oldPath, newPath)(t);
    });
    this._transitionHpTFFillPaths(animate);
  }
  /** Update visibility of curves */
  updateVisibility(uuid, visible) {
    this.svg.selectAll(`.fr-graph-curve-container *[uuid="${uuid}"]`).attr("visibility", visible ? "visible" : "hidden");
  }
  /** Get compensated path for frequency response data */
  _getCompensatedPath(originalData) {
    const bisect = d3.bisector((point) => point[0]).left;
    const isBaselineValid = Array.isArray(this.baselineData.channelData) && this.baselineData.channelData.length > 0;
    const lineGenerator = d3.line().x((d) => this.xScale(d[0])).y((d) => {
      if (!isBaselineValid) {
        return this.yScale(d[1]);
      }
      const channelData = this.baselineData.channelData;
      const i = bisect(channelData, d[0], 0);
      const a = channelData[i - 1];
      const b = channelData[i];
      let baselineY = 0;
      if (a && b) {
        const t = (d[0] - a[0]) / (b[0] - a[0]);
        baselineY = a[1] + t * (b[1] - a[1]);
      } else if (a) {
        baselineY = a[1];
      } else if (b) {
        baselineY = b[1];
      }
      return this.yScale(d[1] - baselineY);
    }).curve(d3.curveMonotoneX);
    return lineGenerator(originalData);
  }
  /** Merge multiple per-channel envelopes into one by taking the widest spread
   *  at each frequency index. Used when dispChannel covers more than one channel
   *  (e.g. L+R) so the fill area reflects every underlying sample's extremes. */
  _combineHpTFEnvelopes(envelopes) {
    const valid = envelopes.filter((e) => e?.upper.length && e?.lower.length);
    if (valid.length === 0) return { upper: [], lower: [] };
    if (valid.length === 1) return valid[0];
    const base2 = valid[0];
    const upper = base2.upper.map(([freq], i) => {
      let max = -Infinity;
      for (const e of valid) {
        const v = e.upper[i]?.[1];
        if (v !== void 0 && v > max) max = v;
      }
      return [freq, max];
    });
    const lower = base2.lower.map(([freq], i) => {
      let min = Infinity;
      for (const e of valid) {
        const v = e.lower[i]?.[1];
        if (v !== void 0 && v < min) min = v;
      }
      return [freq, min];
    });
    return { upper, lower };
  }
  /** Build closed SVG path for HpTF deviation envelope */
  _buildHpTFEnvelopePath(obj) {
    if (!obj.hptf) return null;
    const channels = obj.dispChannel.length >= 1 ? [...obj.dispChannel] : ["AVG"];
    const envelope = this._combineHpTFEnvelopes(channels.map((c) => obj.hptf.envelope[c]));
    if (!envelope.upper.length) return null;
    const bisect = d3.bisector((point) => point[0]).left;
    const isBaselineValid = Array.isArray(this.baselineData.channelData) && this.baselineData.channelData.length > 0;
    const computeY = (point) => {
      if (!isBaselineValid) return this.yScale(point[1]);
      const channelData = this.baselineData.channelData;
      const i = bisect(channelData, point[0], 0);
      const a = channelData[i - 1];
      const b = channelData[i];
      let baselineY = 0;
      if (a && b) {
        const t = (point[0] - a[0]) / (b[0] - a[0]);
        baselineY = a[1] + t * (b[1] - a[1]);
      } else if (a) baselineY = a[1];
      else if (b) baselineY = b[1];
      return this.yScale(point[1] - baselineY);
    };
    const lineGen = d3.line().x((d) => this.xScale(d[0])).y((d) => computeY(d)).curve(d3.curveMonotoneX);
    const upperPath = lineGen(envelope.upper) ?? "";
    const lowerPath = lineGen([...envelope.lower].reverse()) ?? "";
    return upperPath + lowerPath.replace(/^M/, "L") + "Z";
  }
  /** Transition HpTF fill paths after scale or baseline changes */
  _transitionHpTFFillPaths(animate) {
    const self = this;
    this.curveGroup.selectAll("path.fr-graph-hptf-fill").each(function() {
      const el = d3.select(this);
      el.interrupt();
      const uuid = el.attr("uuid");
      if (!uuid) return;
      const obj = frStore.get(uuid);
      if (!obj) return;
      const newPath = self._buildHpTFEnvelopePath(obj);
      if (!newPath) return;
      if (animate) {
        const oldPath = el.attr("d") ?? "";
        const oldCount = (oldPath.match(/-?\d+\.?\d*(e[+-]?\d+)?/gi) ?? []).length;
        const newCount = (newPath.match(/-?\d+\.?\d*(e[+-]?\d+)?/gi) ?? []).length;
        if (oldCount === newCount && oldCount > 0) {
          el.transition().duration(self.transitionDuration).attrTween("d", () => (t) => d3.interpolateString(oldPath, newPath)(t));
        } else {
          el.attr("d", newPath);
        }
      } else {
        el.attr("d", newPath);
      }
    });
  }
  /** Reposition all visible curves by recomputing path data with current yScale.
   *  Lightweight: no DOM creation/removal, just d-attribute updates. */
  repositionCurves() {
    this.curveGroup.selectAll("path[class*='fr-graph-'][class*='-curve']:not(.fr-graph-hptf-fill)").attr("d", (d) => this._getCompensatedPath(d));
    this._transitionHpTFFillPaths(false);
    this.eqOverlay?.render();
  }
  getBaselineData() {
    return this.baselineData;
  }
  getYScale() {
    return this.yScaleValue;
  }
  getBaselineUUID() {
    return this.baselineData.uuid;
  }
  /** Apply a dB y-offset to all SVG paths for a given UUID */
  applyYOffset(uuid, yOffset) {
    const pixelOffset = yOffset ? this.yScale(0) - this.yScale(yOffset) : 0;
    this.svg.selectAll(`.fr-graph-curve-container *[uuid="${uuid}"]`).attr("transform", pixelOffset !== 0 ? `translate(0, ${-pixelOffset})` : null);
  }
  /** Order overlay layers in the SVG */
  orderOverlayLayers() {
    this.svg.selectAll(".fr-graph-x-axis, .fr-graph-y-axis").lower();
    this.svg.selectAll(".fr-graph-spectrum-overlay").raise();
    this.svg.selectAll(".fr-graph-curve-container").raise();
    this.svg.selectAll(".x-grid-text, .x-grid-text-major, .y-grid-text").raise();
    this.svg.selectAll(".fr-graph-label, .fr-graph-label-bg").raise();
    this.svg.selectAll(".fr-graph-eq-clip-wrapper").raise();
    this.svg.selectAll(".y-scaler-handle").raise();
  }
  /** Setup scales for the graph */
  _setupScales() {
    this.xScale = d3.scaleLog().domain([20, 2e4]).range([this.graphGeometry.xStart, this.graphGeometry.xEnd]);
    this.yScale = d3.scaleLinear().domain([-(this.yScaleValue / 2), this.yScaleValue / 2]).range([this.graphGeometry.yBottom, this.graphGeometry.yTop]);
    this.baseYScale = this.yScale.copy();
  }
  getScales() {
    return { xScale: this.xScale, yScale: this.yScale };
  }
  /** Draw Y-axis (X-axis is Svelte-managed via GraphXAxis component) */
  _drawAxis() {
    if (this.svg.select(".fr-graph-y-axis").empty()) {
      this.svg.append("g").attr("class", "fr-graph-y-axis").attr("transform", "translate(0,0)");
    }
    this.updateYAxis();
  }
  /** Create curve group for frequency response curves */
  _createCurveGroup() {
    if (this.svg.select(".fr-graph-curve-container").empty()) {
      this.curveGroup = this.svg.append("g").attr("class", "fr-graph-curve-container").attr("transform", "translate(0,0)").attr("fill", "none").attr("mask", "url(#blur-fade-mask)");
    }
  }
  /** Draw FR Curve */
  drawFRCurve(uuid) {
    this.eraseFRCurve(uuid);
    const object = frStore.get(uuid);
    if (!object) return;
    if (object.type === "phone") {
      this._drawPhoneCurve(object);
    } else if (object.type === "target") {
      this._drawTargetCurve(object);
    } else {
      this._drawUnknownCurve(object);
    }
    if (object.yOffset) {
      this.applyYOffset(uuid, object.yOffset);
    }
  }
  /** Draw Phone curve */
  _drawPhoneCurve(obj) {
    const channels = [...obj.dispChannel];
    const baseThickness = parseFloat(getConfigValue() || "2");
    const isEqSource = eqStore.isEnabled && obj.uuid === eqStore.sourcePhoneUUID;
    if (obj.hptf && obj.hptfFillVisible) {
      const fillPath = this._buildHpTFEnvelopePath(obj);
      if (fillPath) {
        const baseAvg = obj.colors.AVG;
        const strokeOpacity = getConfigValue() ?? 0.5;
        const fillOpacity = getConfigValue() ?? 0.3;
        const toAlpha = (c, a) => c.startsWith("hsl(") ? c.replace("hsl(", "hsla(").replace(")", `, ${a})`) : c;
        const color = toAlpha(baseAvg, strokeOpacity);
        const fillColor = toAlpha(baseAvg, fillOpacity);
        this.curveGroup.insert("path", ":first-child").attr("class", "fr-graph-phone-curve fr-graph-hptf-fill").attr("uuid", obj.uuid).attr("type", obj.type).attr("identifier", obj.identifier).attr("d", fillPath).attr("fill", fillColor).attr("stroke", color).attr("stroke-width", String(baseThickness / 2)).attr("opacity", isEqSource ? 0.35 : null).style("pointer-events", "none");
      }
    }
    if (obj.hptf && obj.dispHptf?.length) {
      for (const key of obj.dispHptf) {
        const match = key.match(/^sample(\d+)_(L|R|AVG)$/);
        if (!match) continue;
        const sampleIndex = parseInt(match[1]);
        const channel = match[2];
        const hptfSample = obj.hptf.samples[sampleIndex];
        if (!hptfSample?.[channel]) continue;
        const color = obj.colors.AVG;
        this.curveGroup.append("path").datum(() => FRSmoother.smooth(hptfSample[channel].data, graphStore.smoothValue)).attr("class", "fr-graph-phone-curve fr-graph-hptf-sample-curve").attr("uuid", obj.uuid).attr("type", obj.type).attr("channel", key).attr("hptf-sample", "true").attr("identifier", obj.identifier).attr("stroke", color).attr("stroke-width", String(baseThickness)).attr("stroke-dasharray", obj.dash || "1 0").attr("opacity", isEqSource ? 0.35 : null).attr("d", (d) => this._getCompensatedPath(d));
      }
    }
    if (obj.hptfOnly && obj.hptfAvgVisible) {
      channels.forEach((channel) => {
        if (!obj.channels[channel]) return;
        this.curveGroup.append("path").datum(() => FRSmoother.smooth(obj.channels[channel].data, graphStore.smoothValue)).attr("class", "fr-graph-phone-curve fr-graph-hptf-avg-curve").attr("uuid", obj.uuid).attr("type", obj.type).attr("channel", channel).attr("hptf-avg", "true").attr("identifier", obj.identifier).attr("stroke", `${obj.colors[channel] || obj.colors["AVG"]}`).attr("stroke-width", String(baseThickness)).attr("opacity", isEqSource ? 0.35 : null).attr("d", (d) => this._getCompensatedPath(d));
      });
    }
    if (!obj.hptfOnly) {
      channels.forEach((channel) => {
        this.curveGroup.append("path").datum(() => FRSmoother.smooth(obj.channels[channel].data, graphStore.smoothValue)).attr("class", "fr-graph-phone-curve").attr("uuid", obj.uuid).attr("type", obj.type).attr("channel", channel).attr("identifier", obj.identifier).attr("stroke", `${obj.colors[channel] || obj.colors["AVG"]}`).attr("stroke-width", String(baseThickness)).attr("stroke-dasharray", obj.dash || "1 0").attr("opacity", isEqSource ? 0.35 : null).attr("d", (d) => this._getCompensatedPath(d));
      });
    }
    if (obj.samples && obj.dispSamples?.length) {
      const sampleThickness = baseThickness * 0.6;
      for (const key of obj.dispSamples) {
        const match = key.match(/^([LR])(\d+)$/);
        if (!match) continue;
        const side = match[1];
        const sampleIndex = parseInt(match[2]) - 1;
        const sample = obj.samples[sampleIndex];
        if (!sample?.[side]) continue;
        this.curveGroup.append("path").datum(() => FRSmoother.smooth(sample[side].data, graphStore.smoothValue)).attr("class", "fr-graph-phone-curve").attr("uuid", obj.uuid).attr("type", obj.type).attr("channel", key).attr("sample", "true").attr("identifier", obj.identifier).attr("stroke", "var(--color-base-content)").attr("stroke-width", String(sampleThickness)).attr("stroke-dasharray", obj.dash || "1 0").attr("opacity", "0.35").attr("d", (d) => this._getCompensatedPath(d));
      }
    }
  }
  /** Draw Target curve */
  _drawTargetCurve(obj) {
    this.curveGroup.append("path").datum(obj.channels["AVG"].data).attr("class", "fr-graph-target-curve").attr("uuid", obj.uuid).attr("type", obj.type).attr("identifier", obj.identifier).attr("stroke", `${obj.colors["AVG"] || "var(--color-base-content)"}`).attr("stroke-width", getConfigValue() || "1").attr("stroke-dasharray", obj.dash || "4 4").attr("d", (d) => this._getCompensatedPath(d));
  }
  /** Draw Unknown curve */
  _drawUnknownCurve(obj) {
    const channels = [...obj.dispChannel];
    channels.forEach((channel) => {
      this.curveGroup.append("path").datum(() => FRSmoother.smooth(obj.channels[channel].data, graphStore.smoothValue)).attr("class", `fr-graph-${obj.type}-curve`).attr("uuid", obj.uuid).attr("type", obj.type).attr("channel", channel).attr("identifier", obj.identifier).attr("stroke", `${obj.colors[channel] || obj.colors["AVG"]}`).attr("stroke-width", obj.type === "inserted-target" ? getConfigValue() || "1" : getConfigValue() || "2").attr("stroke-dasharray", obj.dash || "1 0").attr("d", (d) => this._getCompensatedPath(d));
    });
  }
  /** Erase FR Curve */
  eraseFRCurve(uuid) {
    this.curveGroup.selectAll(`*[uuid="${uuid}"]`).remove();
  }
  /** Update Y Axis of the graph */
  updateYAxis(oldYScale = null, transition = true) {
    const yScale = this.yScale;
    const tickValues = this.yScaleValue < 50 ? yScale.ticks(this.yScaleValue) : yScale.ticks(this.yScaleValue / 5);
    const axis = this.svg.select(".fr-graph-y-axis");
    const gridGroups = axis.selectAll(".y-grid-group").data(tickValues, (d) => d);
    gridGroups.exit().transition().duration(transition ? this.transitionDuration : 0).style("opacity", 0).remove();
    const enterGroups = gridGroups.enter().append("g").attr("class", "y-grid-group").attr("y", (d) => d).style("opacity", 0);
    this._createYAxisElements(enterGroups, oldYScale || yScale);
    const allGroups = enterGroups.merge(gridGroups);
    allGroups.transition().duration(transition ? this.transitionDuration : 0).style("opacity", 1);
    allGroups.selectAll(".y-grid-line, .y-grid-line-major").transition().duration(transition ? this.transitionDuration : 0).attr("y1", (d) => yScale(d)).attr("y2", (d) => yScale(d));
    allGroups.selectAll(".y-grid-text").transition().duration(transition ? this.transitionDuration : 0).attr("y", (d) => yScale(d));
    let dbText = axis.select(".y-grid-db-text");
    if (dbText.empty()) {
      dbText = axis.append("text").attr("class", "y-grid-db-text").attr("transform", "rotate(-90)").text("dB");
    }
    dbText.attr("x", -31).attr("y", 15).attr("dx", 4).attr("dy", -4).attr("font-size", "0.6rem").attr("font-weight", "400").attr("text-anchor", "start").attr("fill", "var(--color-graph-grid-text)");
    this.orderOverlayLayers();
  }
  /** Create Y Axis elements (lines and text) */
  _createYAxisElements(selection, scale) {
    selection.append("line").attr("class", (d) => {
      const isMajor = d % 10 === 0;
      return isMajor ? "y-grid-line" : "y-grid-line-major";
    }).attr("x1", this.graphGeometry.xStart).attr("x2", this.graphGeometry.xEnd).attr("y1", (d) => scale(d)).attr("y2", (d) => scale(d)).attr("stroke", (d) => {
      const isMajor = d % 10 === 0;
      return isMajor ? "var(--color-graph-grid-major)" : "var(--color-graph-grid-minor)";
    }).attr("stroke-width", (d) => {
      const isMajor = d % 10 === 0;
      return isMajor ? 1 : 0.7;
    });
    selection.each((d, i, nodes) => {
      const isMajor = d % 10 === 0;
      if (isMajor) {
        d3.select(nodes[i]).append("text").attr("class", "y-grid-text").attr("x", this.graphGeometry.xStart).attr("y", scale(d)).attr("dx", 4).attr("dy", -4).attr("font-size", "0.6rem").attr("font-weight", "400").attr("text-anchor", "start").attr("fill", "var(--color-graph-grid-text)").text(d);
      }
    });
  }
  /** Draw fade gradient mask for the graph */
  _drawFadeGradient() {
    const defs = this.svg.append("defs");
    const ix = 20;
    const iy = 20;
    defs.append("mask").attr("id", "blur-fade-mask").append("rect").attr("x", ix).attr("y", iy).attr("width", this.viewBoxWidth - 2 * ix).attr("height", this.viewBoxHeight - 2 * iy).attr("fill", "white").attr("filter", "blur(5px)");
  }
  /** Handle channel update for frequency response curves */
  channelUpdateRunner(uuid, type) {
    this.curveGroup.selectAll(`.fr-graph-${type}-curve[uuid="${uuid}"]`).remove();
    const frData = frStore.get(uuid);
    if (!frData) return;
    if (type === "phone") {
      this._drawPhoneCurve(frData);
    } else {
      this._drawUnknownCurve(frData);
    }
  }
}
const graphEngine = new GraphEngine();
class Equalizer {
  config;
  constructor() {
    this.config = {
      DefaultSampleRate: 48e3,
      TrebleStartFrom: 7e3,
      AutoEQRange: [20, 15e3],
      OptimizeQRange: [0.5, 2],
      OptimizeGainRange: [-12, 12],
      OptimizeDeltas: [
        [10, 10, 10, 5, 0.1, 0.5],
        [10, 10, 10, 2, 0.1, 0.2],
        [10, 10, 10, 1, 0.1, 0.1]
      ],
      GraphicEQRawFrequences: new Array(Math.ceil(Math.log(2e4 / 20) / Math.log(1.0072))).fill(null).map((_, i) => 20 * Math.pow(1.0072, i)),
      GraphicEQFrequences: Array.from(
        new Set(
          new Array(Math.ceil(Math.log(2e4 / 20) / Math.log(1.0563))).fill(null).map((_, i) => Math.floor(20 * Math.pow(1.0563, i)))
        )
      ).sort((a, b) => a - b)
    };
  }
  _interpolate(fv, fr) {
    let i = 0;
    return fv.map((f) => {
      for (; i < fr.length - 1; ++i) {
        const [f0, v0] = fr[i];
        const [f1, v1] = fr[i + 1];
        if (i == 0 && f < f0) {
          return [f, v0];
        } else if (f >= f0 && f < f1) {
          const v = v0 + (v1 - v0) * (f - f0) / (f1 - f0);
          return [f, v];
        }
      }
      return [f, fr[fr.length - 1][1]];
    });
  }
  _lowshelf(freq, q, gain) {
    freq = freq / this.config.DefaultSampleRate;
    freq = Math.max(1e-6, Math.min(freq, 1));
    q = Math.max(1e-4, Math.min(q, 1e3));
    gain = Math.max(-40, Math.min(gain, 40));
    const w0 = 2 * Math.PI * freq;
    const sin = Math.sin(w0);
    const cos = Math.cos(w0);
    const a = Math.pow(10, gain / 40);
    const alpha = sin / (2 * q);
    const alphamod = 2 * Math.sqrt(a) * alpha || 0;
    const a0 = a + 1 + (a - 1) * cos + alphamod;
    const a1 = -2 * (a - 1 + (a + 1) * cos);
    const a2 = a + 1 + (a - 1) * cos - alphamod;
    const b0 = a * (a + 1 - (a - 1) * cos + alphamod);
    const b1 = 2 * a * (a - 1 - (a + 1) * cos);
    const b2 = a * (a + 1 - (a - 1) * cos - alphamod);
    return [1, a1 / a0, a2 / a0, b0 / a0, b1 / a0, b2 / a0];
  }
  _highshelf(freq, q, gain) {
    freq = freq / this.config.DefaultSampleRate;
    freq = Math.max(1e-6, Math.min(freq, 1));
    q = Math.max(1e-4, Math.min(q, 1e3));
    gain = Math.max(-40, Math.min(gain, 40));
    const w0 = 2 * Math.PI * freq;
    const sin = Math.sin(w0);
    const cos = Math.cos(w0);
    const a = Math.pow(10, gain / 40);
    const alpha = sin / (2 * q);
    const alphamod = 2 * Math.sqrt(a) * alpha || 0;
    const a0 = a + 1 - (a - 1) * cos + alphamod;
    const a1 = 2 * (a - 1 - (a + 1) * cos);
    const a2 = a + 1 - (a - 1) * cos - alphamod;
    const b0 = a * (a + 1 + (a - 1) * cos + alphamod);
    const b1 = -2 * a * (a - 1 + (a + 1) * cos);
    const b2 = a * (a + 1 + (a - 1) * cos - alphamod);
    return [1, a1 / a0, a2 / a0, b0 / a0, b1 / a0, b2 / a0];
  }
  _peaking(freq, q, gain) {
    freq = freq / this.config.DefaultSampleRate;
    freq = Math.max(1e-6, Math.min(freq, 1));
    q = Math.max(1e-4, Math.min(q, 1e3));
    gain = Math.max(-40, Math.min(gain, 40));
    const w0 = 2 * Math.PI * freq;
    const sin = Math.sin(w0);
    const cos = Math.cos(w0);
    const alpha = sin / (2 * q);
    const a = Math.pow(10, gain / 40);
    const a0 = 1 + alpha / a;
    const a1 = -2 * cos;
    const a2 = 1 - alpha / a;
    const b0 = 1 + alpha * a;
    const b1 = -2 * cos;
    const b2 = 1 - alpha * a;
    return [1, a1 / a0, a2 / a0, b0 / a0, b1 / a0, b2 / a0];
  }
  _calculateGains(freqs, coeffs) {
    const gains = new Array(freqs.length).fill(0);
    for (let i = 0; i < coeffs.length; ++i) {
      const [a0, a1, a2, b0, b1, b2] = coeffs[i];
      for (let j = 0; j < freqs.length; ++j) {
        const w = 2 * Math.PI * freqs[j] / this.config.DefaultSampleRate;
        const phi = 4 * Math.pow(Math.sin(w / 2), 2);
        const c = 10 * Math.log10(
          Math.pow(b0 + b1 + b2, 2) + (b0 * b2 * phi - (b1 * (b0 + b2) + 4 * b0 * b2)) * phi
        ) - 10 * Math.log10(
          Math.pow(a0 + a1 + a2, 2) + (a0 * a2 * phi - (a1 * (a0 + a2) + 4 * a0 * a2)) * phi
        );
        gains[j] += c;
      }
    }
    return gains;
  }
  calculateGainsFromFilter(freqs, filters) {
    const coeffs = this._filtersToCoeffs(filters);
    return this._calculateGains(freqs, coeffs);
  }
  calculatePreamp(source, filters) {
    const fr2 = this.applyFilters(source, filters);
    let maxGain = -Infinity;
    for (let i = 0; i < source.length; ++i) {
      maxGain = Math.max(maxGain, fr2[i][1] - source[i][1]);
    }
    return -maxGain;
  }
  _calculateDistance(fr1, fr2) {
    let distance = 0;
    for (let i = 0; i < fr1.length; ++i) {
      const d = Math.abs(fr1[i][1] - fr2[i][1]);
      distance += d >= 0.1 ? d : 0;
    }
    return distance / fr1.length;
  }
  _filtersToCoeffs(filters) {
    return filters.map((f) => {
      if (!f.freq || !f.gain || !f.q) {
        return null;
      } else if (f.type === "LSQ") {
        return this._lowshelf(f.freq, f.q, f.gain);
      } else if (f.type === "HSQ") {
        return this._highshelf(f.freq, f.q, f.gain);
      } else if (f.type === "PK") {
        return this._peaking(f.freq, f.q, f.gain);
      }
      return null;
    }).filter((f) => f !== null);
  }
  _normalizeResolution(source, target) {
    const frequencies = [20];
    const step = Math.pow(2, 1 / 48);
    while (frequencies[frequencies.length - 1] < 2e4) {
      frequencies.push(frequencies[frequencies.length - 1] * step);
    }
    const normalizedSource = this._interpolatePoints(frequencies, source);
    const normalizedTarget = this._interpolatePoints(frequencies, target);
    const refFreq = 1e3;
    const sourceRefIdx = frequencies.findIndex((f) => f >= refFreq);
    const offset2 = normalizedSource[sourceRefIdx][1] - normalizedTarget[sourceRefIdx][1];
    const alignedTarget = normalizedTarget.map(
      (point) => [point[0], point[1] + offset2]
    );
    return { source: normalizedSource, target: alignedTarget };
  }
  _interpolatePoints(freqs, points) {
    if (!points || points.length === 0) return freqs.map((f) => [f, 0]);
    const sortedPoints = [...points].sort((a, b) => a[0] - b[0]);
    return freqs.map((f) => {
      let i = 0;
      while (i < sortedPoints.length - 1 && sortedPoints[i + 1][0] < f) {
        i++;
      }
      if (i >= sortedPoints.length - 1) {
        return [f, sortedPoints[sortedPoints.length - 1][1]];
      } else if (i < 0 || f <= sortedPoints[0][0]) {
        return [f, sortedPoints[0][1]];
      } else {
        const [f0, v0] = sortedPoints[i];
        const [f1, v1] = sortedPoints[i + 1];
        const ratio = Math.log(f / f0) / Math.log(f1 / f0);
        const v = v0 + ratio * (v1 - v0);
        return [f, v];
      }
    });
  }
  applyFilters(fr, filters) {
    const freqs = fr.map((p) => p[0]);
    const coeffs = this._filtersToCoeffs(filters);
    const gains = this._calculateGains(freqs, coeffs);
    return freqs.map((f, i) => [f, fr[i][1] + gains[i]]);
  }
  _searchCandidates(fr, frTarget, threshold) {
    let state = 0;
    let startIndex = -1;
    const candidates = [];
    const [minFreq, maxFreq] = this.config.AutoEQRange;
    for (let i = 0; i < fr.length; ++i) {
      const [f, v0] = fr[i];
      const v1 = frTarget[i][1];
      const delta = v0 - v1;
      const deltaAbs = Math.abs(delta);
      const nextState = deltaAbs < threshold ? 0 : delta / deltaAbs;
      if (nextState === state) continue;
      if (startIndex >= 0) {
        if (state != 0) {
          const start = fr[startIndex][0];
          const end = f;
          const center = Math.sqrt(start * end);
          const gain = this._interpolate([center], frTarget.slice(startIndex, i))[0][1] - this._interpolate([center], fr.slice(startIndex, i))[0][1];
          const q = center / (end - start);
          if (center >= minFreq && center <= maxFreq) {
            candidates.push({ type: "PK", freq: center, q, gain });
          }
        }
        startIndex = -1;
      } else {
        startIndex = i;
      }
      state = nextState;
    }
    return candidates;
  }
  _freqUnit(freq) {
    if (freq < 100) return 1;
    if (freq < 1e3) return 10;
    if (freq < 1e4) return 100;
    return 1e3;
  }
  _round(value, decimals = 1) {
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
  }
  _stripFilters(filters) {
    const [minQ, maxQ] = this.config.OptimizeQRange;
    const [minGain, maxGain] = this.config.OptimizeGainRange;
    return filters.map((f) => ({
      enabled: f.enabled,
      type: f.type,
      freq: Math.floor(f.freq - f.freq % this._freqUnit(f.freq)),
      q: Math.min(Math.max(f.q, minQ), maxQ),
      gain: Math.min(Math.max(f.gain, minGain), maxGain)
    }));
  }
  convertFilterAsGraphicEQ(filters) {
    const rawFreq = this.config.GraphicEQRawFrequences;
    const eqFreq = this.config.GraphicEQFrequences;
    const coeffs = this._filtersToCoeffs(filters);
    const gains = this._calculateGains(rawFreq, coeffs);
    const rawFR = rawFreq.map((f, i2) => [f, gains[i2]]);
    let i = 0;
    const resultFR = eqFreq.map((f, j) => {
      const freqTo = j < eqFreq.length - 1 ? Math.sqrt(f * eqFreq[j + 1]) : 2e4;
      const points = [];
      for (; i < rawFreq.length; ++i) {
        if (rawFreq[i] < freqTo) {
          points.push(rawFR[i][1]);
        } else {
          break;
        }
      }
      const avg = points.reduce((a, b) => a + b, 0) / points.length;
      return [f, avg];
    });
    const maxGain = resultFR.reduce((a, b) => a > b[1] ? a : b[1], -Infinity);
    return resultFR.map(([f, v]) => [f, v - maxGain]);
  }
  _optimize(fr, frTarget, filters, iteration, dir = false) {
    filters = this._stripFilters(filters);
    const [minFreq, maxFreq] = this.config.AutoEQRange;
    const [minQ, maxQ] = this.config.OptimizeQRange;
    const [minGain, maxGain] = this.config.OptimizeGainRange;
    const [maxDF, maxDQ, maxDG, stepDF, stepDQ, stepDG] = this.config.OptimizeDeltas[iteration];
    const [begin, end, step] = dir ? [filters.length - 1, -1, -1] : [0, filters.length, 1];
    for (let i = begin; i != end; i += step) {
      let f = filters[i];
      const fr1 = this.applyFilters(
        fr,
        filters.filter((_f, fi) => fi !== i)
      );
      let bestFilter = f;
      let bestDistance = this._calculateDistance(this.applyFilters(fr1, [f]), frTarget);
      const isShelfFilter = f.type === "LSQ" || f.type === "HSQ";
      const effectiveMinFreq = isShelfFilter ? f.type === "LSQ" ? 20 : 4e3 : minFreq;
      const effectiveMaxFreq = isShelfFilter ? f.type === "LSQ" ? 400 : 16e3 : maxFreq;
      const effectiveMinQ = isShelfFilter ? 0.3 : minQ;
      const effectiveMaxQ = isShelfFilter ? 1.5 : maxQ;
      const testNewFilter = (df, dq, dg) => {
        const freq = f.freq + df * this._freqUnit(f.freq) * stepDF;
        const q = f.q + dq * stepDQ;
        const gain = f.gain + dg * stepDG;
        if (freq < effectiveMinFreq || freq > effectiveMaxFreq || q < effectiveMinQ || q > effectiveMaxQ || gain < minGain || gain > maxGain) {
          return false;
        }
        const newFilter = { ...f, freq, q, gain };
        const newFR = this.applyFilters(fr1, [newFilter]);
        const newDistance = this._calculateDistance(newFR, frTarget);
        if (newDistance < bestDistance) {
          bestFilter = newFilter;
          bestDistance = newDistance;
          return true;
        }
        return false;
      };
      let improved = true;
      let maxIterations = 50;
      let iterCount = 0;
      while (improved && iterCount < maxIterations) {
        improved = false;
        iterCount++;
        for (let df = -maxDF; df <= maxDF && !improved; df++) {
          if (df !== 0 && testNewFilter(df, 0, 0)) {
            f = bestFilter;
            improved = true;
          }
        }
        for (let dq = -maxDQ; dq <= maxDQ && !improved; dq++) {
          if (dq !== 0 && testNewFilter(0, dq, 0)) {
            f = bestFilter;
            improved = true;
          }
        }
        for (let dg = -maxDG; dg <= maxDG && !improved; dg++) {
          if (dg !== 0 && testNewFilter(0, 0, dg)) {
            f = bestFilter;
            improved = true;
          }
        }
      }
      for (let df = -maxDF; df <= maxDF; ++df) {
        for (let dq = maxDQ; dq >= -maxDQ; --dq) {
          for (let dg = 0; dg <= maxDG; ++dg) {
            if (!testNewFilter(df, dq, dg)) break;
          }
          for (let dg = 0; dg >= -maxDG; --dg) {
            if (!testNewFilter(df, dq, dg)) break;
          }
        }
      }
      filters[i] = bestFilter;
    }
    return filters.sort((a, b) => a.freq - b.freq);
  }
  _analyzeShelfOpportunities(fr, frTarget) {
    const [minFreq, maxFreq] = this.config.AutoEQRange;
    const shelfFilters = [];
    const lowFreqPoints = fr.filter((p) => p[0] >= minFreq && p[0] <= 200);
    const lowFreqTargetPoints = frTarget.filter((p) => p[0] >= minFreq && p[0] <= 200);
    if (lowFreqPoints.length > 0 && lowFreqTargetPoints.length > 0) {
      let totalDelta = 0;
      for (let i = 0; i < lowFreqPoints.length; i++) {
        totalDelta += lowFreqTargetPoints[i][1] - lowFreqPoints[i][1];
      }
      const avgDelta = totalDelta / lowFreqPoints.length;
      if (Math.abs(avgDelta) > 1.5) {
        let shelfFreq = 100;
        for (let i = lowFreqPoints.length - 1; i >= 0; i--) {
          const delta = lowFreqTargetPoints[i][1] - lowFreqPoints[i][1];
          if (Math.sign(delta) === Math.sign(avgDelta) && Math.abs(delta) > 1) {
            shelfFreq = lowFreqPoints[i][0];
          } else {
            break;
          }
        }
        shelfFilters.push({
          type: "LSQ",
          freq: Math.max(shelfFreq, 50),
          q: 0.7,
          gain: avgDelta
        });
      }
    }
    const highFreqPoints = fr.filter((p) => p[0] >= 8e3 && p[0] <= maxFreq);
    const highFreqTargetPoints = frTarget.filter((p) => p[0] >= 8e3 && p[0] <= maxFreq);
    if (highFreqPoints.length > 0 && highFreqTargetPoints.length > 0) {
      let totalDelta = 0;
      for (let i = 0; i < highFreqPoints.length; i++) {
        totalDelta += highFreqTargetPoints[i][1] - highFreqPoints[i][1];
      }
      const avgDelta = totalDelta / highFreqPoints.length;
      if (Math.abs(avgDelta) > 1.5) {
        let shelfFreq = 8e3;
        for (let i = 0; i < highFreqPoints.length; i++) {
          const delta = highFreqTargetPoints[i][1] - highFreqPoints[i][1];
          if (Math.sign(delta) === Math.sign(avgDelta) && Math.abs(delta) > 1) {
            shelfFreq = highFreqPoints[i][0];
            break;
          }
        }
        shelfFilters.push({
          type: "HSQ",
          freq: Math.min(shelfFreq, 12e3),
          q: 0.7,
          gain: avgDelta
        });
      }
    }
    return shelfFilters;
  }
  _calculateWeightedError(fr1, fr2) {
    let error = 0;
    for (let i = 0; i < fr1.length; i++) {
      const diff = Math.abs(fr1[i][1] - fr2[i][1]);
      error += diff * diff;
    }
    return Math.sqrt(error / fr1.length);
  }
  _scoreCandidates(fr, frTarget, candidates) {
    return candidates.map((c) => {
      const newFR = this.applyFilters(fr, [c]);
      const originalError = this._calculateWeightedError(fr, frTarget);
      const newError = this._calculateWeightedError(newFR, frTarget);
      return { ...c, score: originalError - newError };
    }).filter((c) => c.score > 0).sort((a, b) => b.score - a.score);
  }
  _optimizeShelfFilter(fr, frTarget, filter) {
    const isLowShelf = filter.type === "LSQ";
    const [minGain, maxGain] = this.config.OptimizeGainRange;
    let bestFilter = { enabled: true, ...filter };
    let bestError = this._calculateWeightedError(
      this.applyFilters(fr, [bestFilter]),
      frTarget
    );
    const freqSteps = isLowShelf ? [30, 50, 70, 100, 120, 150, 200, 250, 300] : [4e3, 5e3, 6e3, 7e3, 8e3, 9e3, 1e4, 11e3, 12e3];
    const qSteps = [0.4, 0.5, 0.6, 0.7, 0.8, 1, 1.2, 1.5];
    for (const freq of freqSteps) {
      for (const q of qSteps) {
        let lowGain = minGain;
        let highGain = maxGain;
        while (highGain - lowGain > 0.2) {
          const midGain = (lowGain + highGain) / 2;
          const t1 = {
            enabled: true,
            type: filter.type,
            freq,
            q,
            gain: midGain - 0.5
          };
          const t2 = {
            enabled: true,
            type: filter.type,
            freq,
            q,
            gain: midGain + 0.5
          };
          if (this._calculateWeightedError(this.applyFilters(fr, [t1]), frTarget) < this._calculateWeightedError(this.applyFilters(fr, [t2]), frTarget)) {
            highGain = midGain;
          } else {
            lowGain = midGain;
          }
        }
        const testFilter = {
          enabled: true,
          type: filter.type,
          freq,
          q,
          gain: (lowGain + highGain) / 2
        };
        const error = this._calculateWeightedError(
          this.applyFilters(fr, [testFilter]),
          frTarget
        );
        if (error < bestError) {
          bestFilter = testFilter;
          bestError = error;
        }
      }
    }
    return bestFilter;
  }
  _iterativeBatchOptimization(fr, frTarget, initialFilters, maxFilters) {
    let filters = [...initialFilters];
    let currentFR = this.applyFilters(fr, filters);
    while (filters.length < maxFilters) {
      const candidates = this._searchCandidates(currentFR, frTarget, 0.3);
      if (candidates.length === 0) break;
      const scoredCandidates = this._scoreCandidates(currentFR, frTarget, candidates);
      if (scoredCandidates.length === 0) break;
      const best = scoredCandidates[0];
      filters.push({
        enabled: true,
        type: best.type,
        freq: best.freq,
        q: best.q,
        gain: best.gain
      });
      for (let i = 0; i < this.config.OptimizeDeltas.length; i++) {
        filters = this._optimize(fr, frTarget, filters, i);
        filters = this._optimize(fr, frTarget, filters, i, true);
      }
      currentFR = this.applyFilters(fr, filters);
      if (this._calculateWeightedError(currentFR, frTarget) < 0.5) break;
    }
    return filters;
  }
  autoEQ(source, target, options = {}) {
    const maxFilters = options.maxFilters || 8;
    const freqRange = options.freqRange || this.config.AutoEQRange;
    const qRange = options.qRange || this.config.OptimizeQRange;
    const gainRange = options.gainRange || this.config.OptimizeGainRange;
    const useShelfFilter = options.useShelfFilter !== false;
    this.config.AutoEQRange = freqRange;
    this.config.OptimizeQRange = qRange;
    this.config.OptimizeGainRange = gainRange;
    const normalizedData = this._normalizeResolution(source, target);
    const fr = normalizedData.source.filter(
      (p) => p[0] >= freqRange[0] && p[0] <= freqRange[1]
    );
    const frTarget = normalizedData.target.filter(
      (p) => p[0] >= freqRange[0] && p[0] <= freqRange[1]
    );
    let initialFilters = [];
    let remainingFilterSlots = maxFilters;
    if (useShelfFilter) {
      const shelfSuggestions = this._analyzeShelfOpportunities(fr, frTarget);
      for (const shelf of shelfSuggestions) {
        if (remainingFilterSlots <= 2) break;
        const optimizedShelf = this._optimizeShelfFilter(fr, frTarget, shelf);
        const withShelf = this.applyFilters(fr, [...initialFilters, optimizedShelf]);
        const withoutShelf = this.applyFilters(fr, initialFilters);
        if (this._calculateWeightedError(withoutShelf, frTarget) - this._calculateWeightedError(withShelf, frTarget) > 0.3) {
          initialFilters.push(optimizedShelf);
          remainingFilterSlots--;
        }
      }
    }
    let allFilters = this._iterativeBatchOptimization(
      fr,
      frTarget,
      initialFilters,
      maxFilters
    );
    for (let i = 0; i < this.config.OptimizeDeltas.length; i++) {
      allFilters = this._optimize(fr, frTarget, allFilters, i);
      allFilters = this._optimize(fr, frTarget, allFilters, i, true);
    }
    allFilters = this._pruneIneffectiveFilters(fr, frTarget, allFilters);
    return allFilters.map((f) => ({
      enabled: true,
      type: f.type,
      freq: this._round(f.freq, 0),
      q: this._round(f.q, 2),
      gain: this._round(f.gain, 1)
    })).sort((a, b) => a.freq - b.freq);
  }
  _pruneIneffectiveFilters(fr, frTarget, filters) {
    const baselineError = this._calculateWeightedError(
      this.applyFilters(fr, filters),
      frTarget
    );
    return filters.filter((_filter, index) => {
      const withoutThisFilter = filters.filter((_, i) => i !== index);
      const errorWithout = this._calculateWeightedError(
        this.applyFilters(fr, withoutThisFilter),
        frTarget
      );
      return errorWithout - baselineError > 0.1;
    });
  }
}
class AudioSpectrumStore {
  /** Whether the user wants the spectrum overlay visible */
  isEnabled = false;
  /** AnalyserNode reference — set by EqAudioPlayer, read by GraphSpectrumOverlay */
  analyserNode = null;
}
const audioSpectrumStore = new AudioSpectrumStore();
function GraphWatermark($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const positionData = derived(() => graphEngine.labelPosition);
    const rigDescription = getConfigValue() || "Measured with IEC 60318-4 (711)";
    const rigFontPx = 14;
    const watermarkData = getConfigValue() || [];
    function resolvePosition(watermarkObj) {
      const loc = watermarkObj.LOCATION || "CENTER";
      const basePos = positionData()[loc] || positionData()["CENTER"];
      const offsetX = watermarkObj.POSITION ? (watermarkObj.POSITION.RIGHT ?? 0) - (watermarkObj.POSITION.LEFT ?? 0) : 0;
      const offsetY = watermarkObj.POSITION ? (watermarkObj.POSITION.DOWN ?? 0) - (watermarkObj.POSITION.UP ?? 0) : 0;
      return {
        x: basePos.x + offsetX,
        y: basePos.y + offsetY,
        anchor: basePos.anchor,
        growUp: basePos.growUp
      };
    }
    function resolveContent(content) {
      if (Array.isArray(content)) {
        return content[Math.floor(Math.random() * content.length)];
      }
      return content || "";
    }
    {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<text class="rig-description"${attr("x", positionData().TOP_RIGHT.x - 32)}${attr("y", positionData().TOP_RIGHT.y + rigFontPx + 39)}${attr("font-size", `${stringify(rigFontPx)}px`)} font-weight="500"${attr("text-anchor", positionData().TOP_RIGHT.anchor)} fill="var(--color-base-content)" opacity="0.3" filter="var(--watermark-text-filter)">${escape_html(rigDescription)}</text>`);
    }
    $$renderer2.push(`<!--]--><g class="watermark-group"><!--[-->`);
    const each_array = ensure_array_like(watermarkData);
    for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
      let watermarkObj = each_array[$$index];
      const pos = resolvePosition(watermarkObj);
      if (watermarkObj.TYPE === "IMAGE") {
        $$renderer2.push("<!--[0-->");
        $$renderer2.push(`<image class="watermark-image"${attr("x", pos.x)}${attr("y", pos.y)}${attr("width", watermarkObj.SIZE || "100px")}${attr("opacity", watermarkObj.OPACITY || "0.3")}${attr("href", resolveContent(watermarkObj.CONTENT))}></image>`);
      } else if (watermarkObj.TYPE === "TEXT") {
        $$renderer2.push("<!--[1-->");
        $$renderer2.push(`<text class="watermark-text"${attr("x", pos.x)}${attr("y", pos.y)}${attr("font-size", watermarkObj.SIZE || "20px")}${attr("font-weight", watermarkObj.FONT_WEIGHT || "500")}${attr("font-family", watermarkObj.FONT_FAMILY || "")}${attr("text-anchor", pos.anchor)}${attr("fill", watermarkObj.COLOR || "var(--color-base-content)")}${attr("opacity", watermarkObj.OPACITY || "0.3")} filter="var(--watermark-text-filter)">${escape_html(resolveContent(watermarkObj.CONTENT))}</text>`);
      } else {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]-->`);
    }
    $$renderer2.push(`<!--]--></g>`);
  });
}
function GraphXAxis($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const X_TICK_VALUES = [
      20,
      30,
      40,
      50,
      60,
      70,
      80,
      100,
      200,
      300,
      400,
      500,
      600,
      800,
      1e3,
      2e3,
      3e3,
      4e3,
      5e3,
      6e3,
      8e3,
      1e4,
      15e3,
      2e4
    ];
    const MAJOR_TICKS = /* @__PURE__ */ new Set([80, 300, 1e3, 4e3, 6e3, 1e4]);
    let { xScale, yTop, yBottom } = $$props;
    function isMajor(d) {
      return d === 20 || d === 2e4 || MAJOR_TICKS.has(d);
    }
    function formatTick(d) {
      return d >= 1e3 ? `${d / 1e3}k` : String(d);
    }
    $$renderer2.push(`<g class="fr-graph-x-axis"><!--[-->`);
    const each_array = ensure_array_like(X_TICK_VALUES);
    for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
      let tick2 = each_array[$$index];
      $$renderer2.push(`<g class="x-grid-group"${attr("transform", `translate(${stringify(xScale(tick2))},0)`)}><line${attr_class(clsx(MAJOR_TICKS.has(tick2) ? "x-grid-line-major" : "x-grid-line"))}${attr("x1", 0)}${attr("x2", 0)}${attr("y1", yBottom)}${attr("y2", yTop)}${attr("stroke", isMajor(tick2) ? "var(--color-graph-grid-major)" : "var(--color-graph-grid-minor)")}${attr("stroke-width", isMajor(tick2) ? 1 : 0.5)}></line><text${attr_class(clsx(MAJOR_TICKS.has(tick2) ? "x-grid-text-major" : "x-grid-text"))}${attr("x", 0)}${attr("y", yBottom)} dy="11" font-size="0.6rem"${attr("font-weight", MAJOR_TICKS.has(tick2) ? "500" : "300")} text-anchor="middle" fill="var(--color-graph-grid-text)">${escape_html(formatTick(tick2))}</text></g>`);
    }
    $$renderer2.push(`<!--]--></g>`);
  });
}
function GraphContainer($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const labelLocation = getConfigValue() || "BOTTOM_LEFT";
    const labelFontSize = getConfigValue() || "14px";
    const labelFontPx = parseInt(labelFontSize) || 14;
    const labelFontWeight = getConfigValue() || "600";
    const labelLineHeight = labelFontPx + 8;
    const labelBgPaddingX = 12;
    const labelOffsetRight = parseInt(getConfigValue() || "0");
    const labelOffsetLeft = parseInt(getConfigValue() || "0");
    const labelOffsetDown = parseInt(getConfigValue() || "0");
    const labelOffsetUp = parseInt(getConfigValue() || "0");
    const labelTextWidths = new SvelteMap();
    function backdropX(width, anchor) {
      if (anchor === "end") return -(width + labelBgPaddingX / 2);
      if (anchor === "middle") return -(width + labelBgPaddingX) / 2;
      return -labelBgPaddingX / 2;
    }
    const labelData = derived(() => {
      if (!graphEngine.isInitialized) return {
        entries: [],
        startX: 0,
        startY: 0,
        growUp: false,
        anchor: "start",
        style: null
      };
      for (const _ of frStore.entries) {
      }
      const pos = graphEngine.labelPosition[labelLocation];
      const startX = pos.x + labelOffsetRight - labelOffsetLeft;
      const startY = pos.y + labelOffsetDown - labelOffsetUp;
      const raw = [];
      let counter = 0;
      Array.from(frStore.entries).sort(([, a]) => a.type === "target" ? -1 : 1).forEach(([, obj]) => {
        if (obj.hidden) return;
        const channels = [...obj.dispChannel];
        if (obj.hptf) {
          const channelStr = channels.length === 2 && channels.includes("L") && channels.includes("R") ? "L+R" : channels.join("+");
          const desc = obj.hptfFillVisible && obj.hptf.description ? ` ${obj.hptf.description}` : "";
          const suffix = obj.dispSuffix ? ` ${obj.dispSuffix}` : "";
          const channelPart = channelStr ? ` (${channelStr})` : "";
          raw.push({
            uuid: obj.uuid,
            channel: "hptf",
            text: `${obj.identifier}${suffix}${desc}${channelPart}`,
            color: obj.colors?.AVG || "var(--color-base-content)",
            index: counter
          });
          counter++;
          return;
        }
        channels.forEach((channel) => {
          const text = obj.type !== "target" ? `${obj.identifier} ${obj.dispSuffix} (${channel})` : `${obj.identifier} ${obj.dispSuffix}`;
          raw.push({
            uuid: obj.uuid,
            channel,
            text,
            color: obj.colors[channel] || obj.colors?.AVG || "var(--color-base-content)",
            index: counter
          });
          counter++;
        });
      });
      const total = raw.length;
      const entries = raw.map((r) => ({
        ...r,
        textY: pos.growUp ? -(total - 1 - r.index) * labelLineHeight : r.index * labelLineHeight + labelFontPx
      }));
      return {
        entries,
        startX,
        startY,
        growUp: pos.growUp,
        anchor: pos.anchor,
        style: pos.style ?? null
      };
    });
    const labelTransform = derived(() => `translate(${labelData().startX}, ${labelData().startY})`);
    const blLabelLoc = getConfigValue() || "BOTTOM_LEFT";
    const blFontSize = getConfigValue() || "15px";
    const blFontPx = parseInt(blFontSize) || 15;
    const blFontWeight = getConfigValue() || "500";
    const blOffsetRight = parseInt(getConfigValue() || "0");
    const blOffsetLeft = parseInt(getConfigValue() || "0");
    const blOffsetDown = parseInt(getConfigValue() || "0");
    const blOffsetUp = parseInt(getConfigValue() || "0");
    const baselineLabel = derived(() => {
      if (!graphEngine.isInitialized || !graphStore.baselineUUID) return null;
      const data = frStore.get(graphStore.baselineUUID);
      if (!data) return null;
      const pos = graphEngine.labelPosition[blLabelLoc];
      if (!pos) return null;
      const identifier = data.identifier;
      const text = graphStore.baselineMode === "withAdjustment" ? `${identifier} (with Adjustment) Compensated` : `${identifier} Compensated`;
      const baseY = pos.y + blOffsetDown - blOffsetUp;
      return {
        x: pos.x + blOffsetRight - blOffsetLeft,
        y: pos.growUp ? baseY : baseY + blFontPx,
        anchor: pos.anchor,
        text
      };
    });
    let overlay = null;
    let spectrumOverlay = null;
    onDestroy(() => {
      overlay?.destroy();
      overlay = null;
      spectrumOverlay?.destroy();
      spectrumOverlay = null;
    });
    $$renderer2.push(`<svg class="w-full h-full" role="img" aria-label="Frequency response graph">`);
    if (
      // Iterate entries to subscribe to all SvelteMap mutations,
      // including same-key value updates (visibility, channel, normalize, smooth, y-offset).
      // A bare reference `frStore.entries` only tracks size changes, not value mutations.
      /* reactive subscription */
      // Track EQ state so curves re-render with ghost opacity when EQ is toggled
      // Notify GraphInspection when labels change (hides labels when inspection is active)
      // Track EQ curve data (post-normalization) for node positioning
      // Track source phone data for ghost opacity changes
      graphEngine.isInitialized
    ) {
      $$renderer2.push("<!--[0-->");
      GraphWatermark($$renderer2);
      $$renderer2.push(`<!---->`);
      GraphXAxis($$renderer2, {
        xScale: (freq) => graphEngine.xScale(freq),
        yTop: graphEngine.graphGeometry.yTop,
        yBottom: graphEngine.graphGeometry.yBottom
      });
      $$renderer2.push(`<!---->`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]-->`);
    if (labelData().entries.length > 0) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<g class="fr-graph-label-bg"${attr("transform", labelTransform())}><!--[-->`);
      const each_array = ensure_array_like(labelData().entries);
      for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
        let label = each_array[$$index];
        const key = label.uuid + label.channel;
        const w = labelTextWidths.get(key) ?? 0;
        $$renderer2.push(`<rect class="fr-graph-label-bg-rect"${attr("x", backdropX(w, labelData().anchor))}${attr("y", label.textY - labelFontPx)}${attr("rx", 4)}${attr("ry", 4)}${attr("width", w + labelBgPaddingX)}${attr("height", labelLineHeight)} fill="var(--color-base-200)" opacity="0.7" filter="blur(4px)"></rect>`);
      }
      $$renderer2.push(`<!--]--></g><g class="fr-graph-label"${attr("transform", labelTransform())}><!--[-->`);
      const each_array_1 = ensure_array_like(labelData().entries);
      for (let $$index_1 = 0, $$length = each_array_1.length; $$index_1 < $$length; $$index_1++) {
        let label = each_array_1[$$index_1];
        $$renderer2.push(`<text class="fr-graph-label-text"${attr("y", label.textY)}${attr("fill", label.color)}${attr_style(labelData().style)}${attr("text-anchor", labelData().anchor)}${attr("font-size", labelFontSize)}${attr("font-weight", labelFontWeight)}>${escape_html(label.text)}</text>`);
      }
      $$renderer2.push(`<!--]--></g>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]-->`);
    if (baselineLabel()) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<text class="fr-graph-baseline-text"${attr("x", baselineLabel().x)}${attr("y", baselineLabel().y)}${attr("text-anchor", baselineLabel().anchor)} fill="var(--color-graph-axis-label)"${attr("font-size", blFontSize)}${attr("font-weight", blFontWeight)} opacity="0.6">${escape_html(baselineLabel().text)}</text>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--></svg>`);
  });
}
function NormalizerInput($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    function onNormTypeChange(value) {
      graphStore.normType = value;
      dataProvider.renormalizeAll();
    }
    $$renderer2.push(`<div class="flex h-9 items-center rounded-md ring ring-base-content/20 text-sm font-medium"><div class="flex h-full items-center p-0.5 gap-0.5">`);
    Button_1($$renderer2, {
      title: "Normalize at average",
      variant: graphStore.normType === "Avg" ? "primary" : "ghost",
      class: "h-full rounded-sm px-2.5!",
      onclick: () => onNormTypeChange("Avg"),
      children: ($$renderer3) => {
        $$renderer3.push(`<!---->${escape_html(normalizer_input_avg_btn())}`);
      },
      $$slots: { default: true }
    });
    $$renderer2.push(`<!----> `);
    Button_1($$renderer2, {
      title: "Normalize at specific frequency",
      variant: graphStore.normType === "Hz" ? "primary" : "ghost",
      class: "h-full rounded-sm px-2.5!",
      onclick: () => onNormTypeChange("Hz"),
      children: ($$renderer3) => {
        $$renderer3.push(`<!---->${escape_html(normalizer_input_hz_btn())}`);
      },
      $$slots: { default: true }
    });
    $$renderer2.push(`<!----></div> <span class="h-5 w-px bg-base-content/20"></span> <input type="number" min="20" max="20000" step="1"${attr("value", graphStore.normHzValue)}${attr("disabled", graphStore.normType === "Avg", true)} class="h-full w-16 bg-transparent px-2 text-center tabular-nums focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed"/></div>`);
  });
}
function SmoothingButton($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const options = ["1/48", "1/24", "1/12", "1/6", "1/3"];
    let currentIndex = 0;
    function handleClick() {
      currentIndex = (currentIndex + 1) % options.length;
      graphStore.smoothValue = options[currentIndex];
      dataProvider.reSmoothAll();
    }
    Button_1($$renderer2, {
      title: smoothing_button_label(),
      onclick: handleClick,
      variant: "outline",
      class: "h-9! px-3! gap-1.5",
      children: ($$renderer3) => {
        $$renderer3.push(`<!---->${escape_html(smoothing_button_label())} <span class="h-5 w-px bg-base-content/20"></span> <b>${escape_html(options[currentIndex])}oct</b>`);
      },
      $$slots: { default: true }
    });
  });
}
function YAxisScaleButton($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const options = [30, 40, 50, 60, 80];
    function findClosestIndex(value) {
      let closest = 2;
      let minDiff = Infinity;
      for (let i = 0; i < options.length; i++) {
        const diff = Math.abs(options[i] - value);
        if (diff < minDiff) {
          minDiff = diff;
          closest = i;
        }
      }
      return closest;
    }
    let currentIndex = findClosestIndex(graphStore.yScale);
    function handleClick() {
      currentIndex = (currentIndex + 1) % options.length;
      graphStore.yScale = options[currentIndex];
    }
    Button_1($$renderer2, {
      title: y_axis_scale_button_label(),
      onclick: handleClick,
      variant: "outline",
      class: "h-9! px-3! gap-1.5",
      children: ($$renderer3) => {
        $$renderer3.push(`<!---->${escape_html(y_axis_scale_button_label())} <span class="h-5 w-px bg-base-content/20"></span> <b>${escape_html(options[currentIndex])}dB</b>`);
      },
      $$slots: { default: true }
    });
  });
}
function InspectionToggle($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let enabled = false;
    function handleClick() {
      enabled = !enabled;
      graphEngine.graphInspection?.setEnabled(enabled);
    }
    Button_1($$renderer2, {
      title: inspection_toggle_label(),
      onclick: handleClick,
      variant: enabled ? "primary" : "outline",
      class: "h-9! px-3! gap-1.5",
      children: ($$renderer3) => {
        $$renderer3.push(`<!---->${escape_html(inspection_toggle_label())} <span${attr_class(`h-5 w-px ${stringify(enabled ? "bg-accent-content/30" : "bg-base-content/20")}`)}></span> <span class="font-semibold">${escape_html(enabled ? "ON" : "OFF")}</span>`);
      },
      $$slots: { default: true }
    });
  });
}
function ScreenshotButton($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    async function inlineImageHref(image) {
      const href = image.getAttribute("href") ?? image.getAttributeNS("http://www.w3.org/1999/xlink", "href");
      if (!href || href.startsWith("data:")) return;
      try {
        const res = await fetch(href);
        if (!res.ok) return;
        const blob = await res.blob();
        const dataUrl = await new Promise((resolve2, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve2(reader.result);
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        });
        image.setAttribute("href", dataUrl);
        image.removeAttributeNS("http://www.w3.org/1999/xlink", "href");
      } catch {
      }
    }
    async function downloadScreenshot() {
      analyticsService.trackGeneralEvent("clicked_download");
      const svgNode = graphEngine.svg?.node();
      if (!svgNode) return;
      const clone = svgNode.cloneNode(true);
      clone.querySelectorAll(".y-scaler-handle").forEach((el) => el.remove());
      await Promise.all(Array.from(clone.querySelectorAll("image")).map((el) => inlineImageHref(el)));
      const viewBox = svgNode.getAttribute("viewBox");
      const [, , vbWidth, vbHeight] = (viewBox ?? "0 0 800 450").split(" ").map(Number);
      clone.setAttribute("width", String(vbWidth));
      clone.setAttribute("height", String(vbHeight));
      const sourceElements = svgNode.querySelectorAll("*");
      const cloneElements = clone.querySelectorAll("*");
      const styleProps = [
        "fill",
        "stroke",
        "font-size",
        "font-family",
        "font-weight",
        "opacity",
        "stroke-width",
        "stroke-dasharray"
      ];
      sourceElements.forEach((src, i) => {
        const computed = getComputedStyle(src);
        const cloneEl = cloneElements[i];
        if (!cloneEl) return;
        for (const prop of styleProps) {
          const val = computed.getPropertyValue(prop);
          if (val) cloneEl.style.setProperty(prop, val);
        }
      });
      const graphArea = document.querySelector(".graph-area");
      const bgColor = graphArea ? getComputedStyle(graphArea).backgroundColor : getComputedStyle(document.documentElement).getPropertyValue("--color-base-200").trim();
      const bgRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      bgRect.setAttribute("width", String(vbWidth));
      bgRect.setAttribute("height", String(vbHeight));
      bgRect.setAttribute("fill", bgColor);
      clone.insertBefore(bgRect, clone.firstChild);
      const svgData = new XMLSerializer().serializeToString(clone);
      const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
      const svgUrl = URL.createObjectURL(svgBlob);
      const scale = 2;
      const canvas = document.createElement("canvas");
      canvas.width = vbWidth * scale;
      canvas.height = vbHeight * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(svgUrl);
        return;
      }
      const img = new Image();
      img.onload = () => {
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(svgUrl);
        const pngUrl = canvas.toDataURL("image/png");
        const a = document.createElement("a");
        a.href = pngUrl;
        a.download = "graph.png";
        a.click();
        toast.success(screenshot_button_label());
      };
      img.onerror = () => {
        URL.revokeObjectURL(svgUrl);
        toast.error("Screenshot failed");
      };
      img.src = svgUrl;
    }
    Button_1($$renderer2, {
      title: screenshot_button_label(),
      onclick: downloadScreenshot,
      variant: "muted",
      class: "h-9! px-3! gap-1.5",
      children: ($$renderer3) => {
        Camera($$renderer3, { class: "h-4 w-4", "aria-hidden": "true" });
        $$renderer3.push(`<!----> ${escape_html(screenshot_button_label())}`);
      },
      $$slots: { default: true }
    });
  });
}
function ShareButton($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    async function handleClick() {
      try {
        const url = urlProvider.getCurrentURL();
        await navigator.clipboard.writeText(url);
        toast.success(share_button_on_click());
      } catch {
        toast.error("Failed to copy URL");
      }
    }
    Button_1($$renderer2, {
      title: share_button_label(),
      onclick: handleClick,
      variant: "muted",
      class: "h-9! px-3! gap-1.5",
      children: ($$renderer3) => {
        Share_2($$renderer3, { class: "h-4 w-4", "aria-hidden": "true" });
        $$renderer3.push(`<!----> ${escape_html(share_button_label())}`);
      },
      $$slots: { default: true }
    });
  });
}
function PreferenceBound($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const baseDFTarget = getConfigValue() ?? "";
    const isEnabled = !!baseDFTarget;
    let isVisible = isEnabled && !!(getConfigValue() ?? false);
    function toggle() {
      isVisible = !isVisible;
    }
    if (isEnabled) {
      $$renderer2.push("<!--[0-->");
      Button_1($$renderer2, {
        title: pref_bound_btn_label(),
        onclick: toggle,
        variant: isVisible ? "primary" : "outline",
        class: "h-9! px-3! gap-1.5",
        children: ($$renderer3) => {
          $$renderer3.push(`<!---->${escape_html(pref_bound_btn_label())}`);
        },
        $$slots: { default: true }
      });
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]-->`);
  });
}
function ShopLink($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const shopLink = derived(() => {
      if (!squiglinkStore.isEnabled || squiglinkStore.isCurrentSiteOptedOut) return null;
      const phones = [...frStore.entries.values()].filter((e) => e.type === "phone");
      if (phones.length !== 1) return null;
      const phone = phones[0];
      const sponsorDetail = squiglinkStore.getSponsorDetail();
      const match = squiglinkStore.findShopLink(phone.identifier);
      if (!match?.hfg_com) return null;
      return {
        model: phone.identifier,
        url: match.hfg_com + (sponsorDetail?.utmParams ?? ""),
        sponsorName: sponsorDetail?.sponsorName ?? null,
        hfgUrl: match.hfg_com
      };
    });
    if (shopLink()) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<a${attr("href", shopLink().url)} target="_blank" rel="noopener noreferrer" class="flex items-center gap-1.75 rounded-md px-3 py-1.5 h-9 text-sm font-medium transition-colors bg-secondary text-secondary-content hover:bg-secondary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">`);
      Shopping_bag($$renderer2, { class: "w-4 h-4" });
      $$renderer2.push(`<!----> ${escape_html(shoplink_buy_now())} `);
      if (shopLink().sponsorName) {
        $$renderer2.push("<!--[0-->");
        $$renderer2.push(`<div class="w-px h-5 bg-success-content/60"></div> <span class="flex gap-0.5">`);
        {
          $$renderer2.push("<!--[-1-->");
        }
        $$renderer2.push(`<!--]--> `);
        {
          $$renderer2.push("<!--[-1-->");
        }
        $$renderer2.push(`<!--]--> `);
        if (shopLink().sponsorName) {
          $$renderer2.push("<!--[0-->");
          $$renderer2.push(`${escape_html(shopLink().sponsorName)}`);
        } else {
          $$renderer2.push("<!--[-1-->");
        }
        $$renderer2.push(`<!--]--></span>`);
      } else {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]--></a>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]-->`);
  });
}
function GraphToolbar($$renderer) {
  $$renderer.push(`<div class="flex flex-wrap items-center justify-center gap-2 px-3 py-2">`);
  NormalizerInput($$renderer);
  $$renderer.push(`<!----> `);
  SmoothingButton($$renderer);
  $$renderer.push(`<!----> `);
  YAxisScaleButton($$renderer);
  $$renderer.push(`<!----> `);
  PreferenceBound($$renderer);
  $$renderer.push(`<!----> `);
  InspectionToggle($$renderer);
  $$renderer.push(`<!----> `);
  ScreenshotButton($$renderer);
  $$renderer.push(`<!----> `);
  ShareButton($$renderer);
  $$renderer.push(`<!----> `);
  ShopLink($$renderer);
  $$renderer.push(`<!----></div>`);
}
function Input($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let {
      icon,
      label,
      placeholder = "",
      value = void 0,
      class: className = "",
      type = "text",
      $$slots,
      $$events,
      ...restProps
    } = $$props;
    $$renderer2.push(`<label${attr_class(`flex w-full gap-1 text-sm font-medium text-base-content ${stringify(className)}`)}>`);
    if (label) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<span>${escape_html(label)}</span>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> <div class="relative flex-1 gap-1">`);
    if (icon) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">`);
      icon($$renderer2);
      $$renderer2.push(`<!----></div>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> <input${attributes(
      {
        type,
        value,
        placeholder,
        class: `block w-full rounded-md border border-base-content/20 px-3 py-2 focus:outline-none focus:ring-1 focus:ring-accent disabled:cursor-not-allowed disabled:opacity-50 ${stringify(icon ? "pl-9" : "")}`,
        ...restProps
      },
      void 0,
      void 0,
      void 0,
      4
    )}/></div></label>`);
    bind_props($$props, { value });
  });
}
function CrossSiteSearchResults($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { searchQuery, resultCount = 0, isLoading = false } = $$props;
    const crossSiteEnabled = derived(() => squiglinkStore.isEnabled && getConfigValue() !== false);
    const crossSiteResults = derived(() => crossSiteEnabled() && searchQuery.trim().length >= 2 ? squiglinkStore.searchResults : []);
    const groupedCrossSite = derived(() => {
      const map = new SvelteMap();
      const seen = new SvelteSet();
      for (const result of crossSiteResults()) {
        const dedupKey = result.siteUsername + "\0" + result.dbType + "\0" + result.brand + "\0" + result.phoneName;
        if (seen.has(dedupKey)) continue;
        seen.add(dedupKey);
        const groupKey = result.siteUsername + "\0" + result.dbType;
        const existing = map.get(groupKey);
        if (existing) {
          existing.push(result);
        } else {
          map.set(groupKey, [result]);
        }
      }
      return map;
    });
    const showCrossSiteSection = derived(() => crossSiteEnabled() && searchQuery.trim().length >= 2);
    function getCrossSiteUrl(siteUrl, brandName, phoneName) {
      return `${siteUrl}?share=${encodeURIComponent(`${brandName} ${phoneName}`.replace(/ /g, "_"))}`;
    }
    if (showCrossSiteSection()) {
      $$renderer2.push("<!--[0-->");
      {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]--> `);
      if (crossSiteResults().length > 0) {
        $$renderer2.push("<!--[0-->");
        $$renderer2.push(`<!--[-->`);
        const each_array = ensure_array_like([...groupedCrossSite()]);
        for (let $$index_1 = 0, $$length = each_array.length; $$index_1 < $$length; $$index_1++) {
          let [siteUsername, results] = each_array[$$index_1];
          $$renderer2.push(`<div class="flex gap-1 items-center px-3 py-1.5 bg-base-300 border-b border-base-content/10"><span class="text-[12px] mr-1.5 font-medium text-base-content">${escape_html(results[0].siteName)}</span> <span class="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-content">${escape_html(results[0].dbType)}</span> `);
          if (results[0].deltaReady) {
            $$renderer2.push("<!--[0-->");
            $$renderer2.push(`<span class="shrink-0 rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-secondary-content">Delta Ready</span>`);
          } else {
            $$renderer2.push("<!--[-1-->");
          }
          $$renderer2.push(`<!--]--></div> <!--[-->`);
          const each_array_1 = ensure_array_like(results);
          for (let $$index = 0, $$length2 = each_array_1.length; $$index < $$length2; $$index++) {
            let result = each_array_1[$$index];
            $$renderer2.push(`<a${attr("href", getCrossSiteUrl(result.siteUrl, result.brand, result.phoneName))} target="_blank" rel="external noopener noreferrer" class="flex w-full items-center gap-2 px-3 py-1 text-left text-sm transition-colors hover:bg-base-300 border-b border-base-content/10 cursor-pointer no-underline">`);
            Arrow_up_right($$renderer2, { class: "h-4 w-4 text-base-content/80", "aria-hidden": "true" });
            $$renderer2.push(`<!----> <span class="min-w-0 flex-1 truncate">${escape_html(result.brand)} ${escape_html(result.phoneName)}</span></a>`);
          }
          $$renderer2.push(`<!--]-->`);
        }
        $$renderer2.push(`<!--]-->`);
      } else {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]-->`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]-->`);
    bind_props($$props, { resultCount, isLoading });
  });
}
function PhoneSelector($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const allowRemovingPhone = getConfigValue() ?? true;
    const selectedBrands = new SvelteSet();
    let searchQuery = "";
    let showPhonePane = true;
    const loadingIds = new SvelteSet();
    let crossSiteResultCount = 0;
    let crossSiteIsLoading = false;
    const fullPhoneList = derived(() => {
      if (!MetadataParser.phoneMetadata) return [];
      return MetadataParser.phoneMetadata.flatMap((b) => b.phones.map((p) => ({ ...p, brand: b.brand })));
    });
    const brandListData = derived(() => {
      if (!MetadataParser.phoneMetadata) return [];
      return MetadataParser.phoneMetadata.map((b) => b.brand);
    });
    const loadedIds = derived(() => new Set([...frStore.entries.values()].map((e) => e.identifier)));
    const displayPhones = derived(() => {
      let list = selectedBrands.size > 0 ? fullPhoneList().filter((p) => selectedBrands.has(p.brand)) : fullPhoneList();
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        list = list.filter((p) => p.identifier.toLowerCase().includes(q));
      }
      return list;
    });
    function clearBrands() {
      selectedBrands.clear();
    }
    function renderScore(score) {
      const num = typeof score === "number" ? score : parseFloat(score);
      if (isNaN(num)) return String(score);
      const clamped = Math.max(0, Math.min(5, num));
      const full = Math.floor(clamped);
      const half = clamped % 1 >= 0.5 ? 1 : 0;
      const empty = 5 - full - half;
      return "★".repeat(full) + (half ? "⭐" : "") + "☆".repeat(empty);
    }
    let $$settled = true;
    let $$inner_renderer;
    function $$render_inner($$renderer3) {
      $$renderer3.push(`<div class="flex h-full flex-col overflow-hidden" style="container-type: inline-size;"><div class="flex shrink-0 items-center gap-2 bg-base-200 border-b border-base-content/15 px-1.5 py-1.5">`);
      if (showPhonePane) {
        $$renderer3.push("<!--[0-->");
        $$renderer3.push(`<div class="ps-nav-btn svelte-1ozi2v4">`);
        Button_1($$renderer3, {
          title: phone_selector_header_brand_btn(),
          onclick: () => showPhonePane = false,
          variant: "primary",
          children: ($$renderer4) => {
            $$renderer4.push(`<!---->${escape_html(phone_selector_header_brand_btn())}`);
          },
          $$slots: { default: true }
        });
        $$renderer3.push(`<!----></div>`);
      } else {
        $$renderer3.push("<!--[-1-->");
      }
      $$renderer3.push(`<!--]--> `);
      {
        let icon = function($$renderer4) {
          Search($$renderer4, { class: "h-4 w-4 text-base-content/60", "aria-hidden": "true" });
        };
        Input($$renderer3, {
          type: "search",
          placeholder: phone_selector_header_search_bar_placeholder(),
          class: "flex-1 bg-base-100!",
          get value() {
            return searchQuery;
          },
          set value($$value) {
            searchQuery = $$value;
            $$settled = false;
          },
          icon,
          $$slots: { icon: true }
        });
      }
      $$renderer3.push(`<!----> `);
      if (!showPhonePane) {
        $$renderer3.push("<!--[0-->");
        $$renderer3.push(`<div class="ps-nav-btn svelte-1ozi2v4">`);
        Button_1($$renderer3, {
          title: phone_selector_header_device_btn(),
          onclick: () => showPhonePane = true,
          variant: "primary",
          children: ($$renderer4) => {
            $$renderer4.push(`<!---->${escape_html(phone_selector_header_device_btn())}`);
          },
          $$slots: { default: true }
        });
        $$renderer3.push(`<!----></div>`);
      } else {
        $$renderer3.push("<!--[-1-->");
      }
      $$renderer3.push(`<!--]--></div> `);
      if (selectedBrands.size > 0) {
        $$renderer3.push("<!--[0-->");
        $$renderer3.push(`<div class="shrink-0 p-1.5">`);
        Button_1($$renderer3, {
          title: phone_selector_clear_brands_btn(),
          onclick: clearBrands,
          variant: "secondary",
          class: "w-full gap-2",
          children: ($$renderer4) => {
            X($$renderer4, { class: "h-4 w-4", "aria-hidden": "true" });
            $$renderer4.push(`<!----> ${escape_html(phone_selector_clear_brands_btn())}`);
          },
          $$slots: { default: true }
        });
        $$renderer3.push(`<!----></div>`);
      } else {
        $$renderer3.push("<!--[-1-->");
      }
      $$renderer3.push(`<!--]--> <div class="relative min-h-0 flex-1"><div class="flex h-full flex-row"><div${attr_class("ps-brand-pane flex flex-col overflow-y-auto border-r border-base-content/15 svelte-1ozi2v4", void 0, { "ps-brand-hidden": showPhonePane })}><!--[-->`);
      const each_array = ensure_array_like(brandListData());
      for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
        let brand = each_array[$$index];
        $$renderer3.push(`<button${attr_class(`flex w-full cursor-pointer items-center px-3 py-1.5 text-left text-sm transition-colors border-b border-base-content/8 ${stringify(selectedBrands.has(brand) ? "border-l-2 border-l-accent bg-accent/8 font-medium text-accent" : "hover:bg-base-300")}`)}><span class="truncate">${escape_html(brand)}</span></button>`);
      }
      $$renderer3.push(`<!--]--></div> <div${attr_class("ps-phone-pane flex flex-col overflow-y-auto svelte-1ozi2v4", void 0, { "ps-phone-hidden": !showPhonePane })}>`);
      if (displayPhones().length === 0 && crossSiteResultCount === 0 && !crossSiteIsLoading) {
        $$renderer3.push("<!--[0-->");
        $$renderer3.push(`<p class="px-3 py-6 text-center text-xs text-base-content/60">${escape_html(searchQuery.trim() ? "No results." : "No devices.")}</p>`);
      } else {
        $$renderer3.push("<!--[-1-->");
      }
      $$renderer3.push(`<!--]--> <!--[-->`);
      const each_array_1 = ensure_array_like(displayPhones());
      for (let $$index_1 = 0, $$length = each_array_1.length; $$index_1 < $$length; $$index_1++) {
        let phone = each_array_1[$$index_1];
        const isLoaded = loadedIds().has(phone.identifier);
        const isLoading = loadingIds.has(phone.identifier);
        $$renderer3.push(`<div${attr_class(`border-b border-base-content/8 ${stringify(isLoaded ? "border-l-2 border-l-accent bg-accent/8" : "")}`)}><button${attr("disabled", isLoading || isLoaded && !allowRemovingPhone, true)}${attr_class(`flex flex-col w-full min-h-8 items-start gap-1 px-3 py-1.5 text-left text-sm transition-colors ${stringify(isLoaded ? "font-medium text-base-content" : " hover:bg-base-300")} ${stringify(isLoading ? "opacity-50" : "")} cursor-pointer disabled:cursor-default`)}><span class="min-w-0 flex-1 truncate leading-snug">${escape_html(phone.identifier)}</span> `);
        if (phone.description) {
          $$renderer3.push("<!--[0-->");
          $$renderer3.push(`<span${attr_class(`min-w-0 self-stretch text-xs text-base-content/60 leading-snug ${stringify(isLoaded ? "line-clamp-3" : "line-clamp-1 truncate")}`)}${attr("title", phone.description)}>${escape_html(phone.description)}</span>`);
        } else {
          $$renderer3.push("<!--[-1-->");
        }
        $$renderer3.push(`<!--]--> `);
        if (isLoaded && (phone.reviewScore !== void 0 || phone.price || phone.reviewLink || phone.shopLink)) {
          $$renderer3.push("<!--[0-->");
          $$renderer3.push(`<div class="flex flex-wrap items-center gap-x-2 gap-y-1">`);
          if (phone.reviewScore !== void 0) {
            $$renderer3.push("<!--[0-->");
            $$renderer3.push(`<span class="text-xs text-warning"${attr("title", `Score: ${stringify(phone.reviewScore)}`)}>${escape_html(renderScore(phone.reviewScore))}</span>`);
          } else {
            $$renderer3.push("<!--[-1-->");
          }
          $$renderer3.push(`<!--]--> `);
          if (phone.price) {
            $$renderer3.push("<!--[0-->");
            $$renderer3.push(`<span class="text-xs text-base-content/60">${escape_html(phone.price)}</span>`);
          } else {
            $$renderer3.push("<!--[-1-->");
          }
          $$renderer3.push(`<!--]--> `);
          if (phone.reviewLink) {
            $$renderer3.push("<!--[0-->");
            $$renderer3.push(`<a${attr("href", phone.reviewLink)} target="_blank" rel="external noopener noreferrer" class="text-xs text-info hover:underline">${escape_html(phone_selector_item_review())}</a>`);
          } else {
            $$renderer3.push("<!--[-1-->");
          }
          $$renderer3.push(`<!--]--> `);
          if (phone.shopLink) {
            $$renderer3.push("<!--[0-->");
            $$renderer3.push(`<a${attr("href", phone.shopLink)} target="_blank" rel="external noopener noreferrer" class="text-xs text-info hover:underline">${escape_html(phone_selector_item_shop())}</a>`);
          } else {
            $$renderer3.push("<!--[-1-->");
          }
          $$renderer3.push(`<!--]--></div>`);
        } else {
          $$renderer3.push("<!--[-1-->");
        }
        $$renderer3.push(`<!--]--></button></div>`);
      }
      $$renderer3.push(`<!--]--> `);
      CrossSiteSearchResults($$renderer3, {
        searchQuery,
        get resultCount() {
          return crossSiteResultCount;
        },
        set resultCount($$value) {
          crossSiteResultCount = $$value;
          $$settled = false;
        },
        get isLoading() {
          return crossSiteIsLoading;
        },
        set isLoading($$value) {
          crossSiteIsLoading = $$value;
          $$settled = false;
        }
      });
      $$renderer3.push(`<!----> `);
      if (crossSiteResultCount > 0 && displayPhones().length > 0) {
        $$renderer3.push("<!--[0-->");
        $$renderer3.push(`<div class="mx-3 my-1 border-t border-base-content/15"></div>`);
      } else {
        $$renderer3.push("<!--[-1-->");
      }
      $$renderer3.push(`<!--]--></div></div></div></div>`);
    }
    do {
      $$settled = true;
      $$inner_renderer = $$renderer2.copy();
      $$render_inner($$inner_renderer);
    } while (!$$settled);
    $$renderer2.subsume($$inner_renderer);
  });
}
function DevicePanel($$renderer) {
  $$renderer.push(`<div class="flex h-full flex-col overflow-hidden">`);
  PhoneSelector($$renderer);
  $$renderer.push(`<!----></div>`);
}
function Accordion_1($$renderer, $$props) {
  let { children, $$slots, $$events, ...restProps } = $$props;
  if (Accordion) {
    $$renderer.push("<!--[-->");
    Accordion($$renderer, spread_props([
      restProps,
      {
        children: ($$renderer2) => {
          children?.($$renderer2);
          $$renderer2.push(`<!---->`);
        },
        $$slots: { default: true }
      }
    ]));
    $$renderer.push("<!--]-->");
  } else {
    $$renderer.push("<!--[!-->");
    $$renderer.push("<!--]-->");
  }
}
function AccordionItem($$renderer, $$props) {
  let {
    duration = 200,
    title,
    children,
    $$slots,
    $$events,
    ...restProps
  } = $$props;
  if (Accordion_item) {
    $$renderer.push("<!--[-->");
    Accordion_item($$renderer, spread_props([
      restProps,
      {
        children: ($$renderer2) => {
          if (Accordion_header) {
            $$renderer2.push("<!--[-->");
            Accordion_header($$renderer2, {
              children: ($$renderer3) => {
                if (Accordion_trigger) {
                  $$renderer3.push("<!--[-->");
                  Accordion_trigger($$renderer3, {
                    class: "flex w-full flex-1 gap-2 select-none items-center p-2 rounded-md text-sm font-medium cursor-pointer text-base-content/70 transition-all hover:bg-base-content/10 [&[data-state=open]>svg]:rotate-180",
                    children: ($$renderer4) => {
                      Chevron_down($$renderer4, {
                        class: "h-4 w-4 transition-transform data-[state=open]:rotate-180"
                      });
                      $$renderer4.push(`<!----> ${escape_html(title)}`);
                    },
                    $$slots: { default: true }
                  });
                  $$renderer3.push("<!--]-->");
                } else {
                  $$renderer3.push("<!--[!-->");
                  $$renderer3.push("<!--]-->");
                }
              },
              $$slots: { default: true }
            });
            $$renderer2.push("<!--]-->");
          } else {
            $$renderer2.push("<!--[!-->");
            $$renderer2.push("<!--]-->");
          }
          $$renderer2.push(` `);
          {
            let child = function($$renderer3, { props, open }) {
              if (open) {
                $$renderer3.push("<!--[0-->");
                $$renderer3.push(`<div${attributes({ ...props })}>`);
                children?.($$renderer3);
                $$renderer3.push(`<!----></div>`);
              } else {
                $$renderer3.push("<!--[-1-->");
              }
              $$renderer3.push(`<!--]-->`);
            };
            if (Accordion_content) {
              $$renderer2.push("<!--[-->");
              Accordion_content($$renderer2, { child, $$slots: { child: true } });
              $$renderer2.push("<!--]-->");
            } else {
              $$renderer2.push("<!--[!-->");
              $$renderer2.push("<!--]-->");
            }
          }
        },
        $$slots: { default: true }
      }
    ]));
    $$renderer.push("<!--]-->");
  } else {
    $$renderer.push("<!--[!-->");
    $$renderer.push("<!--]-->");
  }
}
function Scrollbar($$renderer, { orientation }) {
  if (Scroll_area_scrollbar) {
    $$renderer.push("<!--[-->");
    Scroll_area_scrollbar($$renderer, {
      orientation,
      class: `group flex touch-none select-none p-0.5 transition-all duration-300 ease-out data-[state=visible]:animate-in data-[state=hidden]:animate-out data-[state=hidden]:fade-out-0 data-[state=visible]:fade-in-0 ${stringify(orientation === "vertical" ? "w-2 hover:w-2.5" : "h-2 hover:h-2.5")}`,
      children: ($$renderer2) => {
        if (Scroll_area_thumb) {
          $$renderer2.push("<!--[-->");
          Scroll_area_thumb($$renderer2, {
            class: "relative flex-1 rounded-full bg-base-content/20 transition-colors duration-200 group-hover:bg-base-content/30"
          });
          $$renderer2.push("<!--]-->");
        } else {
          $$renderer2.push("<!--[!-->");
          $$renderer2.push("<!--]-->");
        }
      },
      $$slots: { default: true }
    });
    $$renderer.push("<!--]-->");
  } else {
    $$renderer.push("<!--[!-->");
    $$renderer.push("<!--]-->");
  }
}
function ScrollArea_1($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let {
      ref = null,
      orientation = "vertical",
      viewportClasses,
      children,
      $$slots,
      $$events,
      ...restProps
    } = $$props;
    let $$settled = true;
    let $$inner_renderer;
    function $$render_inner($$renderer3) {
      if (Scroll_area) {
        $$renderer3.push("<!--[-->");
        Scroll_area($$renderer3, spread_props([
          restProps,
          {
            get ref() {
              return ref;
            },
            set ref($$value) {
              ref = $$value;
              $$settled = false;
            },
            children: ($$renderer4) => {
              if (Scroll_area_viewport) {
                $$renderer4.push("<!--[-->");
                Scroll_area_viewport($$renderer4, {
                  class: viewportClasses,
                  children: ($$renderer5) => {
                    children?.($$renderer5);
                    $$renderer5.push(`<!---->`);
                  },
                  $$slots: { default: true }
                });
                $$renderer4.push("<!--]-->");
              } else {
                $$renderer4.push("<!--[!-->");
                $$renderer4.push("<!--]-->");
              }
              $$renderer4.push(` `);
              if (orientation === "vertical" || orientation === "both") {
                $$renderer4.push("<!--[0-->");
                Scrollbar($$renderer4, { orientation: "vertical" });
              } else {
                $$renderer4.push("<!--[-1-->");
              }
              $$renderer4.push(`<!--]--> `);
              if (orientation === "horizontal" || orientation === "both") {
                $$renderer4.push("<!--[0-->");
                Scrollbar($$renderer4, { orientation: "horizontal" });
              } else {
                $$renderer4.push("<!--[-1-->");
              }
              $$renderer4.push(`<!--]--> `);
              if (Scroll_area_corner) {
                $$renderer4.push("<!--[-->");
                Scroll_area_corner($$renderer4, {});
                $$renderer4.push("<!--]-->");
              } else {
                $$renderer4.push("<!--[!-->");
                $$renderer4.push("<!--]-->");
              }
            },
            $$slots: { default: true }
          }
        ]));
        $$renderer3.push("<!--]-->");
      } else {
        $$renderer3.push("<!--[!-->");
        $$renderer3.push("<!--]-->");
      }
    }
    do {
      $$settled = true;
      $$inner_renderer = $$renderer2.copy();
      $$render_inner($$inner_renderer);
    } while (!$$settled);
    $$renderer2.subsume($$inner_renderer);
    bind_props($$props, { ref });
  });
}
function TargetSelector($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const allowMultiLine = getConfigValue() ?? true;
    const omitSuffix = getConfigValue() ?? false;
    const collapseOnInitial = getConfigValue() ?? false;
    const targets = getConfigValue() ?? [];
    function getIdentifier(file) {
      return file.includes(" Target") ? file : file + " Target";
    }
    function getDisplayName(file) {
      if (omitSuffix) return file.replace(/ Target$/, "");
      return file;
    }
    const loadedIds = derived(() => new Set([...frStore.entries.values()].map((e) => e.identifier)));
    let loading = /* @__PURE__ */ new Set();
    async function toggleTarget(identifier, isLoaded) {
      if (loading.has(identifier)) return;
      loading = /* @__PURE__ */ new Set([...loading, identifier]);
      try {
        await dataProvider.toggleFRData("target", identifier, !isLoaded);
      } finally {
        loading = new Set([...loading].filter((id) => id !== identifier));
      }
    }
    function targetRow($$renderer3, group) {
      ScrollArea_1($$renderer3, {
        orientation: "horizontal",
        type: "always",
        viewportClasses: "flex w-full px-[1px] pt-[1px] pb-2 last-child:pb-[1px]",
        children: ($$renderer4) => {
          $$renderer4.push(`<div class="flex items-center gap-2"><span class="pl-1 shrink-0 text-xs font-medium text-base-content/40">${escape_html(group.type)}</span> <div class="flex gap-1.5"><!--[-->`);
          const each_array = ensure_array_like(group.files);
          for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
            let file = each_array[$$index];
            const identifier = getIdentifier(file);
            const isLoaded = loadedIds().has(identifier);
            const isLoading = loading.has(identifier);
            Button_1($$renderer4, {
              title: getDisplayName(file),
              onclick: () => toggleTarget(identifier, isLoaded),
              disabled: isLoading,
              variant: isLoaded ? "primary" : "outline",
              size: "sm",
              class: "whitespace-nowrap",
              children: ($$renderer5) => {
                $$renderer5.push(`<!---->${escape_html(getDisplayName(file))}`);
              },
              $$slots: { default: true }
            });
          }
          $$renderer4.push(`<!--]--></div></div>`);
        },
        $$slots: { default: true }
      });
    }
    if (targets.length > 0) {
      $$renderer2.push("<!--[0-->");
      if (allowMultiLine) {
        $$renderer2.push("<!--[0-->");
        Accordion_1($$renderer2, {
          type: "single",
          value: collapseOnInitial ? "" : "targets",
          children: ($$renderer3) => {
            AccordionItem($$renderer3, {
              value: "targets",
              title: target_selector_label(),
              children: ($$renderer4) => {
                $$renderer4.push(`<div class="flex flex-col gap-0.5 pt-1 -mb-0.75"><!--[-->`);
                const each_array_1 = ensure_array_like(targets);
                for (let $$index_1 = 0, $$length = each_array_1.length; $$index_1 < $$length; $$index_1++) {
                  let group = each_array_1[$$index_1];
                  targetRow($$renderer4, group);
                }
                $$renderer4.push(`<!--]--></div>`);
              },
              $$slots: { default: true }
            });
          },
          $$slots: { default: true }
        });
      } else {
        $$renderer2.push("<!--[-1-->");
        $$renderer2.push(`<!--[-->`);
        const each_array_2 = ensure_array_like(targets);
        for (let $$index_2 = 0, $$length = each_array_2.length; $$index_2 < $$length; $$index_2++) {
          let group = each_array_2[$$index_2];
          targetRow($$renderer2, group);
        }
        $$renderer2.push(`<!--]-->`);
      }
      $$renderer2.push(`<!--]-->`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]-->`);
  });
}
function GraphColorWheel($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { uuid, item } = $$props;
    function hslToHex(h, s, l) {
      s /= 100;
      l /= 100;
      const a = s * Math.min(l, 1 - l);
      const f = (n) => {
        const k = (n + h / 30) % 12;
        const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
        return Math.round(255 * color).toString(16).padStart(2, "0");
      };
      return `#${f(0)}${f(8)}${f(4)}`;
    }
    function parseHsl(colorStr) {
      const match = colorStr.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
      return match ? [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])] : [0, 70, 50];
    }
    function parseDash(dash) {
      const parts = dash.trim().split(/\s+/);
      return [parseFloat(parts[0]) || 1, parseFloat(parts[1]) || 0];
    }
    let hexColor = derived(() => hslToHex(...parseHsl(item.colors.AVG)));
    let isOpen = false;
    let localH = 0;
    let localS = 0;
    let localL = 0;
    let localHex = "#000000";
    let localTick = 1;
    let localSpace = 0;
    function syncFromItem() {
      const [h, s, l] = parseHsl(item.colors.AVG);
      localH = h;
      localS = s;
      localL = l;
      localHex = hslToHex(h, s, l);
      const [tick2, space] = parseDash(item.dash);
      localTick = tick2;
      localSpace = space;
    }
    function handleOpenChange(open) {
      isOpen = open;
      if (open) syncFromItem();
    }
    if (Popover) {
      $$renderer2.push("<!--[-->");
      Popover($$renderer2, {
        open: isOpen,
        onOpenChange: handleOpenChange,
        children: ($$renderer3) => {
          {
            let child = function($$renderer4, { props }) {
              $$renderer4.push(`<button${attributes({
                ...props,
                class: "h-5 w-5 shrink-0 cursor-pointer rounded-sm border-0 transition-opacity hover:opacity-80",
                style: `background-color: ${stringify(hexColor())};`,
                "aria-label": "Pick color"
              })}></button>`);
            };
            if (Popover_trigger) {
              $$renderer3.push("<!--[-->");
              Popover_trigger($$renderer3, { child, $$slots: { child: true } });
              $$renderer3.push("<!--]-->");
            } else {
              $$renderer3.push("<!--[!-->");
              $$renderer3.push("<!--]-->");
            }
          }
          $$renderer3.push(` `);
          if (Portal) {
            $$renderer3.push("<!--[-->");
            Portal($$renderer3, {
              children: ($$renderer4) => {
                if (Popover_content) {
                  $$renderer4.push("<!--[-->");
                  Popover_content($$renderer4, {
                    sideOffset: 6,
                    class: "z-50 w-56 rounded-lg border border-base-content/15 bg-base-200 p-3 shadow-xl",
                    children: ($$renderer5) => {
                      $$renderer5.push(`<div class="mb-3"><input${attr("id", `${stringify(uuid)}-color-hex`)} type="color"${attr("value", localHex)} class="h-8 w-full cursor-pointer rounded border border-base-content/20 p-0.5"/></div> <div class="mb-3 flex items-center gap-2"><div class="flex flex-col items-center gap-0.5"><label${attr("for", `${stringify(uuid)}-hsl-h`)} class="text-xs text-base-content/60">${escape_html(graph_color_wheel_label_hue())}</label> <input${attr("id", `${stringify(uuid)}-hsl-h`)} type="number" min="0" max="360"${attr("value", localH)} class="w-14 rounded border border-base-content/20 px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-accent"/></div> <div class="flex flex-col items-center gap-0.5"><label${attr("for", `${stringify(uuid)}-hsl-s`)} class="text-xs text-base-content/60">${escape_html(graph_color_wheel_label_saturation())}</label> <input${attr("id", `${stringify(uuid)}-hsl-s`)} type="number" min="0" max="100"${attr("value", localS)} class="w-14 rounded border border-base-content/20 px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-accent"/></div> <div class="flex flex-col items-center gap-0.5"><label${attr("for", `${stringify(uuid)}-hsl-l`)} class="text-xs text-base-content/60">${escape_html(graph_color_wheel_label_lightness())}</label> <input${attr("id", `${stringify(uuid)}-hsl-l`)} type="number" min="0" max="100"${attr("value", localL)} class="w-14 rounded border border-base-content/20 px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-accent"/></div></div> <div class="mb-3 flex items-center gap-2"><div class="flex flex-col items-center gap-0.5"><label${attr("for", `${stringify(uuid)}-dash-tick`)} class="text-xs text-base-content/60">${escape_html(graph_color_wheel_label_tick())}</label> <input${attr("id", `${stringify(uuid)}-dash-tick`)} type="number" min="0" step="0.5"${attr("value", localTick)} class="w-14 rounded border border-base-content/20 px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-accent"/></div> <div class="flex flex-col items-center gap-0.5"><label${attr("for", `${stringify(uuid)}-dash-space`)} class="text-xs text-base-content/60">${escape_html(graph_color_wheel_label_space())}</label> <input${attr("id", `${stringify(uuid)}-dash-space`)} type="number" min="0" step="0.5"${attr("value", localSpace)} class="w-14 rounded border border-base-content/20 px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-accent"/></div></div> <div class="flex items-center justify-between gap-2"><button class="rounded bg-base-300 px-2 py-1 text-xs transition-colors hover:bg-base-content/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">${escape_html(graph_color_wheel_btn_random())}</button> `);
                      {
                        let child = function($$renderer6, { props }) {
                          $$renderer6.push(`<button${attributes({
                            ...props,
                            class: "rounded bg-base-300 px-2 py-1 text-xs transition-colors hover:bg-base-content/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                          })}>${escape_html(graph_color_wheel_btn_close())}</button>`);
                        };
                        if (Popover_close) {
                          $$renderer5.push("<!--[-->");
                          Popover_close($$renderer5, { child, $$slots: { child: true } });
                          $$renderer5.push("<!--]-->");
                        } else {
                          $$renderer5.push("<!--[!-->");
                          $$renderer5.push("<!--]-->");
                        }
                      }
                      $$renderer5.push(`</div>`);
                    },
                    $$slots: { default: true }
                  });
                  $$renderer4.push("<!--]-->");
                } else {
                  $$renderer4.push("<!--[!-->");
                  $$renderer4.push("<!--]-->");
                }
              }
            });
            $$renderer3.push("<!--]-->");
          } else {
            $$renderer3.push("<!--[!-->");
            $$renderer3.push("<!--]-->");
          }
        },
        $$slots: { default: true }
      });
      $$renderer2.push("<!--]-->");
    } else {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push("<!--]-->");
    }
  });
}
function PopoverPanel($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let {
      open = false,
      onOpenChange,
      trigger,
      children,
      contentClass = "",
      sideOffset = 6,
      side = "bottom",
      align = "start",
      trapFocus = true
    } = $$props;
    function handleOpenChange(value) {
      open = value;
      onOpenChange?.(value);
    }
    if (Popover) {
      $$renderer2.push("<!--[-->");
      Popover($$renderer2, {
        open,
        onOpenChange: handleOpenChange,
        children: ($$renderer3) => {
          {
            let child = function($$renderer4, { props }) {
              trigger($$renderer4, { props });
              $$renderer4.push(`<!---->`);
            };
            if (Popover_trigger) {
              $$renderer3.push("<!--[-->");
              Popover_trigger($$renderer3, { child, $$slots: { child: true } });
              $$renderer3.push("<!--]-->");
            } else {
              $$renderer3.push("<!--[!-->");
              $$renderer3.push("<!--]-->");
            }
          }
          $$renderer3.push(` `);
          if (Portal) {
            $$renderer3.push("<!--[-->");
            Portal($$renderer3, {
              children: ($$renderer4) => {
                if (Popover_content) {
                  $$renderer4.push("<!--[-->");
                  Popover_content($$renderer4, {
                    sideOffset,
                    side,
                    align,
                    trapFocus,
                    class: `z-50 rounded-lg border border-base-content/15 bg-base-200 p-1.5 shadow-xl ${stringify(contentClass)}`,
                    children: ($$renderer5) => {
                      children($$renderer5);
                      $$renderer5.push(`<!---->`);
                    },
                    $$slots: { default: true }
                  });
                  $$renderer4.push("<!--]-->");
                } else {
                  $$renderer4.push("<!--[!-->");
                  $$renderer4.push("<!--]-->");
                }
              }
            });
            $$renderer3.push("<!--]-->");
          } else {
            $$renderer3.push("<!--[!-->");
            $$renderer3.push("<!--]-->");
          }
        },
        $$slots: { default: true }
      });
      $$renderer2.push("<!--]-->");
    } else {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push("<!--]-->");
    }
    bind_props($$props, { open });
  });
}
function TargetCustomizer($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { uuid, item } = $$props;
    const tcConfig = window.GRAPHTOOL_CONFIG?.TARGET_CUSTOMIZER;
    const customizableTargets = tcConfig?.CUSTOMIZABLE_TARGETS ?? [];
    const availableFilters = tcConfig?.FILTERS ?? [
      {
        id: "tilt",
        name: "Tilt (dB/oct)",
        type: "TILT",
        freq: 0,
        q: 0
      },
      {
        id: "bass",
        name: "Bass (dB)",
        type: "LSQ",
        freq: 105,
        q: 0.707
      },
      {
        id: "treble",
        name: "Treble (dB)",
        type: "HSQ",
        freq: 2500,
        q: 0.42
      }
    ];
    const filterPresets = tcConfig?.FILTER_PRESET ?? [];
    const initialFilters = tcConfig?.INITIAL_TARGET_FILTERS ?? [];
    const isCustomizable = derived(() => customizableTargets.includes(item.identifier));
    const i18nLabels = {
      tilt: target_customizer_label_tilt,
      bass: target_customizer_label_bass,
      treble: target_customizer_label_treble,
      ear: target_customizer_label_ear,
      pssr: target_customizer_label_pssr
    };
    function getFilterLabel(def) {
      const fn = i18nLabels[def.id];
      return fn ? fn() : def.name;
    }
    function getGainRange(def) {
      if (def.type === "TILT") return { min: -2, max: 2, step: 0.1 };
      return { min: -20, max: 20, step: 0.5 };
    }
    const activeFilterIds = new SvelteSet();
    const filterValues = new SvelteMap();
    let selectedPreset = "";
    const initial = initialFilters.find((f) => item.identifier.includes(f.name));
    if (initial) {
      for (const [id, value] of Object.entries(initial.filter)) {
        if (availableFilters.some((f) => f.id === id)) {
          activeFilterIds.add(id);
          filterValues.set(id, value);
        }
      }
    }
    const activeFilters = derived(() => availableFilters.filter((f) => activeFilterIds.has(f.id)));
    const inactiveFilters = derived(() => availableFilters.filter((f) => !activeFilterIds.has(f.id)));
    new Equalizer();
    onDestroy(() => {
      if (!frStore.get(uuid)) {
        graphStore.targetOriginalData.delete(uuid);
      }
    });
    function removeFilter(id) {
      activeFilterIds.delete(id);
      filterValues.delete(id);
    }
    function handleReset() {
      for (const id of [...activeFilterIds]) {
        activeFilterIds.delete(id);
        filterValues.delete(id);
      }
      selectedPreset = "";
    }
    function applyPreset(preset) {
      for (const id of [...activeFilterIds]) {
        activeFilterIds.delete(id);
        filterValues.delete(id);
      }
      for (const [id, value] of Object.entries(preset.filter)) {
        if (availableFilters.some((f) => f.id === id) && value !== 0) {
          activeFilterIds.add(id);
          filterValues.set(id, value);
        }
      }
    }
    function handlePresetChange(e) {
      const name = e.target.value;
      selectedPreset = name;
      if (!name) return;
      const preset = filterPresets.find((p) => p.name === name);
      if (preset) applyPreset(preset);
    }
    if (isCustomizable()) {
      $$renderer2.push("<!--[0-->");
      {
        let trigger = function($$renderer3, { props }) {
          Button_1($$renderer3, spread_props([
            props,
            {
              title: target_customizer_btn_view(),
              variant: "outline",
              size: "icon",
              class: "mr-0.5 data-[state=open]:bg-accent! data-[state=open]:text-accent-content!",
              children: ($$renderer4) => {
                Settings_2($$renderer4, { class: "h-4 w-4" });
              },
              $$slots: { default: true }
            }
          ]));
        };
        PopoverPanel($$renderer2, {
          contentClass: "w-72",
          align: "end",
          trapFocus: false,
          trigger,
          children: ($$renderer3) => {
            if (activeFilters().length === 0) {
              $$renderer3.push("<!--[0-->");
              $$renderer3.push(`<p class="text-center text-xs text-base-content/60">${escape_html(target_customizer_no_filters())}</p>`);
            } else {
              $$renderer3.push("<!--[-1-->");
            }
            $$renderer3.push(`<!--]--> <div class="grid gap-1.5" style="grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));"><!--[-->`);
            const each_array = ensure_array_like(activeFilters());
            for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
              let def = each_array[$$index];
              const range = getGainRange(def);
              const value = filterValues.get(def.id) ?? 0;
              $$renderer3.push(`<div class="flex items-center gap-1.5 rounded border border-base-content/15 bg-base-100 p-1.5 pb-2"><div class="flex flex-col flex-1 gap-0.25"><div class="flex items-center justify-between"><div class="flex items-center"><label${attr("for", `${stringify(uuid)}-${stringify(def.id)}`)} class="text-xs font-medium line-clamp-1">${escape_html(getFilterLabel(def))}</label> `);
              if (def.description) {
                $$renderer3.push("<!--[0-->");
                {
                  let trigger2 = function($$renderer4, { props }) {
                    Button_1($$renderer4, spread_props([
                      props,
                      {
                        title: "Open target filter description",
                        variant: "ghost",
                        size: "icon",
                        class: "ml-0.5 p-1! opacity-80 hover:opacity-100 data-[state=open]:bg-accent! data-[state=open]:text-accent-content!",
                        children: ($$renderer5) => {
                          Circle_alert($$renderer5, { class: "h-3 w-3" });
                        },
                        $$slots: { default: true }
                      }
                    ]));
                  };
                  PopoverPanel($$renderer3, {
                    align: "end",
                    trigger: trigger2,
                    children: ($$renderer4) => {
                      $$renderer4.push(`<p class="max-w-xs text-sm text-base-content">${escape_html(def.description)}</p>`);
                    },
                    $$slots: { trigger: true, default: true }
                  });
                }
              } else {
                $$renderer3.push("<!--[-1-->");
              }
              $$renderer3.push(`<!--]--></div> <span class="w-8 text-right text-xs tabular-nums">${escape_html(value.toFixed(1))}</span></div> <div><input${attr("id", `${stringify(uuid)}-${stringify(def.id)}`)} type="range"${attr("min", range.min)}${attr("max", range.max)}${attr("step", range.step)}${attr("value", value)} class="h-1 min-w-0 w-full cursor-pointer appearance-none rounded-full bg-base-content/20 accent-accent"/></div></div> `);
              Button_1($$renderer3, {
                title: "Remove",
                onclick: () => removeFilter(def.id),
                variant: "ghost",
                size: "icon",
                children: ($$renderer4) => {
                  X($$renderer4, { class: "size-3" });
                },
                $$slots: { default: true }
              });
              $$renderer3.push(`<!----></div>`);
            }
            $$renderer3.push(`<!--]--></div> <div class="mt-2 flex flex-wrap items-center gap-1.5">`);
            if (inactiveFilters().length > 0) {
              $$renderer3.push("<!--[0-->");
              $$renderer3.push(`<select class="rounded border border-base-content/20 bg-base-100 px-1.5 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-accent flex-1">`);
              $$renderer3.option({ value: "" }, ($$renderer4) => {
                $$renderer4.push(`${escape_html(target_customizer_add_filter())}`);
              });
              $$renderer3.push(`<!--[-->`);
              const each_array_1 = ensure_array_like(inactiveFilters());
              for (let $$index_1 = 0, $$length = each_array_1.length; $$index_1 < $$length; $$index_1++) {
                let def = each_array_1[$$index_1];
                $$renderer3.option({ value: def.id }, ($$renderer4) => {
                  $$renderer4.push(`${escape_html(getFilterLabel(def))}`);
                });
              }
              $$renderer3.push(`<!--]--></select>`);
            } else {
              $$renderer3.push("<!--[-1-->");
            }
            $$renderer3.push(`<!--]--> `);
            if (filterPresets.length > 0) {
              $$renderer3.push("<!--[0-->");
              $$renderer3.select(
                {
                  value: selectedPreset,
                  onchange: handlePresetChange,
                  class: "rounded border border-base-content/20 bg-base-100 px-1.5 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-accent flex-1"
                },
                ($$renderer4) => {
                  $$renderer4.option({ value: "" }, ($$renderer5) => {
                    $$renderer5.push(`${escape_html(target_customizer_preset())}`);
                  });
                  $$renderer4.push(`<!--[-->`);
                  const each_array_2 = ensure_array_like(filterPresets);
                  for (let $$index_2 = 0, $$length = each_array_2.length; $$index_2 < $$length; $$index_2++) {
                    let preset = each_array_2[$$index_2];
                    $$renderer4.option({ value: preset.name }, ($$renderer5) => {
                      $$renderer5.push(`${escape_html(preset.name)}`);
                    });
                  }
                  $$renderer4.push(`<!--]-->`);
                }
              );
            } else {
              $$renderer3.push("<!--[-1-->");
            }
            $$renderer3.push(`<!--]--> <div class="ml-auto">`);
            Button_1($$renderer3, {
              title: target_customizer_btn_reset(),
              onclick: handleReset,
              variant: "destructive",
              size: "sm",
              children: ($$renderer4) => {
                $$renderer4.push(`<!---->${escape_html(target_customizer_btn_reset())}`);
              },
              $$slots: { default: true }
            });
            $$renderer3.push(`<!----></div></div>`);
          },
          $$slots: { trigger: true, default: true }
        });
      }
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]-->`);
  });
}
function SampleChannelSelector($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { uuid, item } = $$props;
    function dispChannelToSelectValue(dispChannel) {
      if (dispChannel.includes("L") && dispChannel.includes("R")) return "L+R";
      return dispChannel[0] ?? "AVG";
    }
    let channelOptions = derived(() => {
      const keys = Object.keys(item.channels);
      const opts = [];
      const hasL = keys.includes("L");
      const hasR = keys.includes("R");
      const hasAVG = keys.includes("AVG");
      if (hasL) opts.push({ value: "L", label: selection_list_channel_left() });
      if (hasR) opts.push({ value: "R", label: selection_list_channel_right() });
      if (hasL && hasR) opts.push({
        value: "L+R",
        label: selection_list_channel_left_and_right()
      });
      if (hasAVG) opts.push({ value: "AVG", label: selection_list_channel_average() });
      return opts;
    });
    let currentChannelValue = derived(() => dispChannelToSelectValue(item.dispChannel));
    let triggerLabel = derived(() => {
      const val = currentChannelValue();
      const opt = channelOptions().find((o) => o.value === val);
      return opt ? opt.label : val;
    });
    let hasSamples = derived(() => (item.sampleCount ?? 0) > 0);
    let sampleCount = derived(() => item.sampleCount ?? 0);
    let allSampleKeys = derived(() => {
      const keys = [];
      for (let i = 1; i <= sampleCount(); i++) {
        keys.push(`L${i}`);
        keys.push(`R${i}`);
      }
      return keys;
    });
    let dispSamples = derived(() => item.dispSamples ?? []);
    let hasHptf = derived(() => !!item.hptf);
    let hptfFillOnly = derived(() => item.hptf?.fillOnly ?? true);
    let hptfSamples = derived(() => item.hptf?.samples ?? []);
    let dispHptf = derived(() => item.dispHptf ?? []);
    let hptfFillVisible = derived(() => item.hptfFillVisible ?? false);
    let hptfAvgVisible = derived(() => item.hptfAvgVisible ?? false);
    function handlePreset(preset) {
      let next2 = [];
      switch (preset) {
        case "allL":
          next2 = allSampleKeys().filter((k) => k.startsWith("L"));
          break;
        case "allR":
          next2 = allSampleKeys().filter((k) => k.startsWith("R"));
          break;
        case "all":
          next2 = [...allSampleKeys()];
          break;
        case "none":
          next2 = [];
          break;
      }
      dataProvider.updateSampleDisplay(uuid, next2);
    }
    function isSampleChecked(key) {
      return dispSamples().includes(key);
    }
    function handleHptfPreset(preset) {
      if (preset === "none") {
        dataProvider.updateHpTFDisplay(uuid, [], hptfFillVisible(), hptfAvgVisible());
      } else {
        const keys = [];
        item.hptf?.samples.forEach((sample, i) => {
          if (sample.AVG) keys.push(`sample${i}_AVG`);
          else if (sample.L) keys.push(`sample${i}_L`);
          else if (sample.R) keys.push(`sample${i}_R`);
        });
        dataProvider.updateHpTFDisplay(uuid, keys, hptfFillVisible(), hptfAvgVisible());
      }
    }
    function isHptfSampleChecked(sampleIndex) {
      return dispHptf().some((k) => k.startsWith(`sample${sampleIndex}_`));
    }
    if (Popover) {
      $$renderer2.push("<!--[-->");
      Popover($$renderer2, {
        children: ($$renderer3) => {
          {
            let child = function($$renderer4, { props }) {
              Button_1($$renderer4, spread_props([
                props,
                {
                  title: triggerLabel(),
                  variant: "outline",
                  size: "sm",
                  class: "h-7! px-2! justify-between! gap-1 min-w-14 rounded-sm! bg-base-200!",
                  children: ($$renderer5) => {
                    $$renderer5.push(`<!---->${escape_html(triggerLabel())} `);
                    Ellipsis($$renderer5, { class: "h-3 w-3 shrink-0 text-base-content/70" });
                    $$renderer5.push(`<!---->`);
                  },
                  $$slots: { default: true }
                }
              ]));
            };
            if (Popover_trigger) {
              $$renderer3.push("<!--[-->");
              Popover_trigger($$renderer3, { child, $$slots: { child: true } });
              $$renderer3.push("<!--]-->");
            } else {
              $$renderer3.push("<!--[!-->");
              $$renderer3.push("<!--]-->");
            }
          }
          $$renderer3.push(` `);
          if (Portal) {
            $$renderer3.push("<!--[-->");
            Portal($$renderer3, {
              children: ($$renderer4) => {
                if (Popover_content) {
                  $$renderer4.push("<!--[-->");
                  Popover_content($$renderer4, {
                    sideOffset: 6,
                    align: "end",
                    class: "z-50 w-54 rounded-lg border border-base-content/15 bg-base-200 p-2 shadow-xl",
                    children: ($$renderer5) => {
                      $$renderer5.push(`<fieldset class="mb-0"><!--[-->`);
                      const each_array = ensure_array_like(channelOptions());
                      for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
                        let opt = each_array[$$index];
                        $$renderer5.push(`<label class="flex cursor-pointer items-center gap-1.5 rounded px-1.5 py-1 text-xs hover:bg-base-300"><input type="radio"${attr("name", `${stringify(uuid)}-channel`)}${attr("value", opt.value)}${attr("checked", currentChannelValue() === opt.value, true)} class="accent-accent"/> ${escape_html(opt.label)}</label>`);
                      }
                      $$renderer5.push(`<!--]--></fieldset> `);
                      if (hasSamples()) {
                        $$renderer5.push("<!--[0-->");
                        $$renderer5.push(`<div class="mt-2 border-t border-base-content/8 pt-2"><p class="mb-1.5 px-1.5 text-xs font-medium text-base-content/60">${escape_html(selection_list_samples_header())} (${escape_html(sampleCount())})</p> <div class="grid grid-cols-2 gap-0"><!--[-->`);
                        const each_array_1 = ensure_array_like(allSampleKeys());
                        for (let $$index_1 = 0, $$length = each_array_1.length; $$index_1 < $$length; $$index_1++) {
                          let key = each_array_1[$$index_1];
                          $$renderer5.push(`<label class="flex cursor-pointer items-center gap-1.5 rounded px-1.5 py-0.5 text-xs hover:bg-base-300"><input type="checkbox"${attr("checked", isSampleChecked(key), true)} class="accent-accent"/> ${escape_html(key)}</label>`);
                        }
                        $$renderer5.push(`<!--]--></div> <div class="mt-1.5 flex gap-1 px-1">`);
                        Button_1($$renderer5, {
                          title: selection_list_samples_all_l(),
                          onclick: () => handlePreset("allL"),
                          variant: "muted",
                          size: "sm",
                          class: "flex-1",
                          children: ($$renderer6) => {
                            $$renderer6.push(`<!---->${escape_html(selection_list_samples_all_l())}`);
                          },
                          $$slots: { default: true }
                        });
                        $$renderer5.push(`<!----> `);
                        Button_1($$renderer5, {
                          title: selection_list_samples_all_r(),
                          onclick: () => handlePreset("allR"),
                          variant: "muted",
                          size: "sm",
                          class: "flex-1",
                          children: ($$renderer6) => {
                            $$renderer6.push(`<!---->${escape_html(selection_list_samples_all_r())}`);
                          },
                          $$slots: { default: true }
                        });
                        $$renderer5.push(`<!----></div> <div class="mt-1.5 flex gap-1 px-1">`);
                        Button_1($$renderer5, {
                          title: selection_list_samples_all(),
                          onclick: () => handlePreset("all"),
                          variant: "muted",
                          size: "sm",
                          class: "flex-1",
                          children: ($$renderer6) => {
                            $$renderer6.push(`<!---->${escape_html(selection_list_samples_all())}`);
                          },
                          $$slots: { default: true }
                        });
                        $$renderer5.push(`<!----> `);
                        Button_1($$renderer5, {
                          title: selection_list_samples_none(),
                          onclick: () => handlePreset("none"),
                          variant: "muted",
                          size: "sm",
                          class: "flex-1",
                          children: ($$renderer6) => {
                            $$renderer6.push(`<!---->${escape_html(selection_list_samples_none())}`);
                          },
                          $$slots: { default: true }
                        });
                        $$renderer5.push(`<!----></div></div>`);
                      } else {
                        $$renderer5.push("<!--[-1-->");
                      }
                      $$renderer5.push(`<!--]--> `);
                      if (hasHptf()) {
                        $$renderer5.push("<!--[0-->");
                        $$renderer5.push(`<div class="mt-2 border-t border-base-content/8 pt-2"><p class="mb-1.5 px-1.5 text-xs font-medium text-base-content/60">${escape_html(selection_list_hptf_header())}</p> <label class="flex cursor-pointer items-center gap-1.5 rounded px-1.5 py-0.5 text-xs hover:bg-base-300"><input type="checkbox"${attr("checked", hptfFillVisible(), true)} class="accent-accent"/> ${escape_html(selection_list_hptf_fill_toggle())}</label> <label class="flex cursor-pointer items-center gap-1.5 rounded px-1.5 py-0.5 text-xs hover:bg-base-300"><input type="checkbox"${attr("checked", hptfAvgVisible(), true)} class="accent-accent"/> ${escape_html(selection_list_hptf_avg_toggle())}</label> `);
                        if (!hptfFillOnly() && hptfSamples().length > 0) {
                          $$renderer5.push("<!--[0-->");
                          $$renderer5.push(`<!--[-->`);
                          const each_array_2 = ensure_array_like(hptfSamples());
                          for (let i = 0, $$length = each_array_2.length; i < $$length; i++) {
                            let sample = each_array_2[i];
                            $$renderer5.push(`<label class="flex cursor-pointer items-center gap-1.5 rounded px-1.5 py-0.5 text-xs ml-2 hover:bg-base-300"><input type="checkbox"${attr("checked", isHptfSampleChecked(i), true)} class="accent-accent"/> ${escape_html(sample.label)}</label>`);
                          }
                          $$renderer5.push(`<!--]--> <div class="mt-1.5 flex gap-1 px-0.5">`);
                          Button_1($$renderer5, {
                            title: selection_list_hptf_all(),
                            onclick: () => handleHptfPreset("all"),
                            variant: "muted",
                            size: "sm",
                            class: "flex-1",
                            children: ($$renderer6) => {
                              $$renderer6.push(`<!---->${escape_html(selection_list_hptf_all())}`);
                            },
                            $$slots: { default: true }
                          });
                          $$renderer5.push(`<!----> `);
                          Button_1($$renderer5, {
                            title: selection_list_hptf_none(),
                            onclick: () => handleHptfPreset("none"),
                            variant: "muted",
                            size: "sm",
                            class: "flex-1",
                            children: ($$renderer6) => {
                              $$renderer6.push(`<!---->${escape_html(selection_list_hptf_none())}`);
                            },
                            $$slots: { default: true }
                          });
                          $$renderer5.push(`<!----></div>`);
                        } else {
                          $$renderer5.push("<!--[-1-->");
                        }
                        $$renderer5.push(`<!--]--></div>`);
                      } else {
                        $$renderer5.push("<!--[-1-->");
                      }
                      $$renderer5.push(`<!--]-->`);
                    },
                    $$slots: { default: true }
                  });
                  $$renderer4.push("<!--]-->");
                } else {
                  $$renderer4.push("<!--[!-->");
                  $$renderer4.push("<!--]-->");
                }
              }
            });
            $$renderer3.push("<!--]-->");
          } else {
            $$renderer3.push("<!--[!-->");
            $$renderer3.push("<!--]-->");
          }
        },
        $$slots: { default: true }
      });
      $$renderer2.push("<!--]-->");
    } else {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push("<!--]-->");
    }
  });
}
function GraphUploader($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let phoneInputEl = void 0;
    let targetInputEl = void 0;
    $$renderer2.push(`<div class="flex gap-2">`);
    Button_1($$renderer2, {
      title: graph_uploader_upload_fr(),
      onclick: () => phoneInputEl?.click(),
      variant: "outline",
      size: "sm",
      class: "flex-1",
      children: ($$renderer3) => {
        File_up($$renderer3, { class: "size-3.5 mr-1.5" });
        $$renderer3.push(`<!----> ${escape_html(graph_uploader_upload_fr())}`);
      },
      $$slots: { default: true }
    });
    $$renderer2.push(`<!----> `);
    Button_1($$renderer2, {
      title: graph_uploader_upload_target(),
      onclick: () => targetInputEl?.click(),
      variant: "outline",
      size: "sm",
      class: "flex-1",
      children: ($$renderer3) => {
        File_up($$renderer3, { class: "size-3.5 mr-1.5" });
        $$renderer3.push(`<!----> ${escape_html(graph_uploader_upload_target())}`);
      },
      $$slots: { default: true }
    });
    $$renderer2.push(`<!----> <input type="file" accept=".txt" class="hidden"/> <input type="file" accept=".txt" class="hidden"/></div>`);
  });
}
function SelectionList($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const sortedEntries = derived(() => {
      frStore.size;
      const entries = [...frStore.entries.entries()];
      return entries.sort(([, a], [, b]) => {
        if (a.type === "target" && b.type !== "target") return -1;
        if (b.type === "target" && a.type !== "target") return 1;
        return 0;
      });
    });
    let openVariantUUID = null;
    function getChannelOptions(item) {
      const keys = Object.keys(item.channels);
      const opts = [];
      const hasL = keys.includes("L");
      const hasR = keys.includes("R");
      const hasAVG = keys.includes("AVG");
      if (hasL) opts.push({ value: "L", label: selection_list_channel_left() });
      if (hasR) opts.push({ value: "R", label: selection_list_channel_right() });
      if (hasL && hasR) opts.push({
        value: "L+R",
        label: selection_list_channel_left_and_right()
      });
      if (hasAVG) opts.push({ value: "AVG", label: selection_list_channel_average() });
      return opts;
    }
    function dispChannelToSelectValue(dispChannel) {
      if (dispChannel.includes("L") && dispChannel.includes("R")) return "L+R";
      return dispChannel[0] ?? "AVG";
    }
    function selectValueToDispChannel(value) {
      if (value === "L+R") return ["L", "R"];
      return [value];
    }
    function handleChannelChange(uuid, value) {
      dataProvider.updateDisplayChannel(uuid, selectValueToDispChannel(value));
    }
    let yOffsetTimer = null;
    function startYOffset(uuid, direction) {
      stopYOffset();
      const perform = () => {
        const item = frStore.get(uuid);
        if (!item) {
          stopYOffset();
          return;
        }
        const next2 = (item.yOffset ?? 0) + (direction === "inc" ? 1 : -1);
        dataProvider.updateYOffset(uuid, next2);
      };
      perform();
      yOffsetTimer = setInterval(perform, 150);
    }
    function stopYOffset() {
      if (yOffsetTimer !== null) {
        clearInterval(yOffsetTimer);
        yOffsetTimer = null;
      }
    }
    function handleBaselineClick(uuid) {
      const item = frStore.get(uuid);
      const hasOriginal = graphStore.targetOriginalData.has(uuid);
      const isTargetItem = item && isTarget(item);
      if (!isTargetItem || !hasOriginal) {
        const isActive = graphStore.baselineUUID === uuid;
        graphEngine.updateBaselineData(!isActive, { uuid });
        graphStore.baselineUUID = isActive ? null : uuid;
        graphStore.baselineMode = isActive ? "off" : "withoutAdjustment";
        return;
      }
      const currentUUID = graphStore.baselineUUID;
      const currentMode = graphStore.baselineMode;
      if (currentUUID !== uuid) {
        const originalChannels = graphStore.targetOriginalData.get(uuid);
        const channelData = originalChannels["AVG"]?.data ?? null;
        graphEngine.updateBaselineData(true, { uuid, channelData });
        graphStore.baselineMode = "withoutAdjustment";
      } else if (currentMode === "withoutAdjustment") {
        graphEngine.updateBaselineData(true, { uuid });
        graphStore.baselineMode = "withAdjustment";
      } else {
        graphEngine.updateBaselineData(false);
        graphStore.baselineMode = "off";
      }
    }
    function getBaselineTooltip(uuid) {
      if (graphStore.baselineUUID !== uuid) return selection_list_baseline_off();
      if (graphStore.baselineMode === "withAdjustment") return selection_list_baseline_with_adjustment();
      return selection_list_baseline_without_adjustment();
    }
    function isTarget(item) {
      return item.type === "target" || item.type === "inserted-target";
    }
    $$renderer2.push(`<div class="flex flex-col flex-1 gap-0 overflow-y-auto pb-2">`);
    if (sortedEntries().length === 0) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<p class="px-3 py-6 text-center text-xs text-base-content/60">No curves loaded.</p>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> <!--[-->`);
    const each_array = ensure_array_like(sortedEntries());
    for (let $$index_2 = 0, $$length = each_array.length; $$index_2 < $$length; $$index_2++) {
      let [uuid, item] = each_array[$$index_2];
      const isBaseline = graphStore.baselineUUID === uuid;
      const channelOpts = getChannelOptions(item);
      const currentChannelVal = dispChannelToSelectValue(item.dispChannel);
      const variantFiles = !isTarget(item) && item.meta?.files || [];
      const hasVariants = variantFiles.length > 1;
      $$renderer2.push(`<div${attr_class(`flex flex-col border-b border-base-content/8 p-3 gap-2 ${stringify(item.hidden ? "opacity-50" : "")}`)}><div class="flex flex-1 items-start gap-2">`);
      GraphColorWheel($$renderer2, { uuid, item });
      $$renderer2.push(`<!----> `);
      if (hasVariants) {
        $$renderer2.push("<!--[0-->");
        {
          let trigger = function($$renderer3, { props }) {
            $$renderer3.push(`<button${attributes({
              ...props,
              class: "group flex min-w-0 flex-1 items-center gap-1 rounded-md px-1.5 py-0.5 -mt-0.5 -ml-1.5 text-left transition-colors hover:bg-base-content/5 data-[state=open]:bg-base-content/5"
            })}><div class="flex min-w-0 flex-1 flex-col"><span class="truncate text-sm font-medium text-base-content">${escape_html(item.identifier)}</span> `);
            if (item.dispSuffix) {
              $$renderer3.push("<!--[0-->");
              $$renderer3.push(`<span class="flex flex-row items-center gap-0.5"><span class="truncate text-xs text-base-content/60">${escape_html(item.dispSuffix)}</span> `);
              Chevron_down($$renderer3, {
                class: "h-3 w-3 shrink-0 text-base-content/65 transition-transform\n												group-data-[state=open]:rotate-180"
              });
              $$renderer3.push(`<!----></span>`);
            } else {
              $$renderer3.push("<!--[-1-->");
            }
            $$renderer3.push(`<!--]--> `);
            if (item.hptfFillVisible && item.hptf?.description) {
              $$renderer3.push("<!--[0-->");
              $$renderer3.push(`<span class="truncate text-xs text-base-content/50">${escape_html(item.hptf.description)}</span>`);
            } else {
              $$renderer3.push("<!--[-1-->");
            }
            $$renderer3.push(`<!--]--></div></button>`);
          };
          PopoverPanel($$renderer2, {
            open: openVariantUUID === uuid,
            onOpenChange: (v) => {
              if (v) openVariantUUID = uuid;
              else if (openVariantUUID === uuid) openVariantUUID = null;
            },
            contentClass: "w-52",
            trapFocus: false,
            trigger,
            children: ($$renderer3) => {
              $$renderer3.push(`<div class="flex flex-col"><!--[-->`);
              const each_array_1 = ensure_array_like(variantFiles);
              for (let $$index = 0, $$length2 = each_array_1.length; $$index < $$length2; $$index++) {
                let variant = each_array_1[$$index];
                const isSelected = item.dispSuffix === variant.suffix;
                $$renderer3.push(`<button${attr_class(`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${stringify(isSelected ? "bg-accent/10 text-accent font-medium" : "text-base-content/70 hover:bg-base-content/5")}`)}>${escape_html(variant.suffix || "(default)")} `);
                Check($$renderer3, {
                  class: `h-4 w-4 shrink-0 ${stringify(isSelected ? "opacity-100" : "opacity-0")}`
                });
                $$renderer3.push(`<!----></button>`);
              }
              $$renderer3.push(`<!--]--></div>`);
            },
            $$slots: { trigger: true, default: true }
          });
        }
      } else {
        $$renderer2.push("<!--[-1-->");
        $$renderer2.push(`<div class="flex min-w-0 flex-1 flex-col"><span class="truncate text-sm font-medium text-base-content">${escape_html(item.identifier)}</span> `);
        if (item.dispSuffix) {
          $$renderer2.push("<!--[0-->");
          $$renderer2.push(`<span class="truncate text-xs text-base-content/60">${escape_html(item.dispSuffix)}</span>`);
        } else {
          $$renderer2.push("<!--[-1-->");
        }
        $$renderer2.push(`<!--]--> `);
        if (item.hptfFillVisible && item.hptf?.description) {
          $$renderer2.push("<!--[0-->");
          $$renderer2.push(`<span class="truncate text-xs text-base-content/50">${escape_html(item.hptf.description)}</span>`);
        } else {
          $$renderer2.push("<!--[-1-->");
        }
        $$renderer2.push(`<!--]--></div>`);
      }
      $$renderer2.push(`<!--]--> <div class="-mt-1 mb-2 -mr-1 flex items-center justify-end gap-1">`);
      if (isTarget(item)) {
        $$renderer2.push("<!--[0-->");
        TargetCustomizer($$renderer2, { uuid, item });
      } else {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]--> `);
      Button_1($$renderer2, {
        title: getBaselineTooltip(uuid),
        onclick: () => handleBaselineClick(uuid),
        "aria-label": getBaselineTooltip(uuid),
        variant: "ghost",
        size: "icon",
        children: ($$renderer3) => {
          $$renderer3.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="h-4 w-4">`);
          if (isBaseline && graphStore.baselineMode === "withoutAdjustment") {
            $$renderer3.push("<!--[0-->");
            $$renderer3.push(`<path d="M12.5935 23.2578l-0.0116 0.0017 -0.071 0.0355 -0.019 0.0037 -0.0152 -0.0037 -0.071 -0.0355c-0.0099 -0.0031 -0.0187 -0.0005 -0.0236 0.0054l-0.0041 0.0109 -0.0171 0.4273 0.005 0.0204 0.011 0.0122 0.1036 0.074 0.0148 0.0039 0.0118 -0.0039 0.1036 -0.074 0.0126 -0.016 0.0034 -0.0166 -0.0171 -0.4273c-0.002 -0.0101 -0.0086 -0.0165 -0.0161 -0.018Zm0.2649 -0.1125 -0.0139 0.002 -0.1847 0.0924 -0.0099 0.0102 -0.0027 0.0112 0.0179 0.4295 0.0048 0.0128 0.0085 0.0071 0.2009 0.0927c0.0121 0.0037 0.0229 -0.0002 0.0285 -0.008l0.004 -0.014 -0.0341 -0.6147c-0.0024 -0.0119 -0.0103 -0.0195 -0.0193 -0.0212Zm-0.7154 0.002c-0.0098 -0.0049 -0.0208 -0.002 -0.0274 0.0053l-0.0057 0.0139 -0.0341 0.6147c-0.0007 0.0115 0.007 0.0207 0.0168 0.0234l0.0157 -0.0014 0.2009 -0.0927 0.0094 -0.0081 0.0039 -0.0118 0.0179 -0.4295 -0.0032 -0.0126 -0.0094 -0.0088 -0.1848 -0.0924Z" stroke-width="5"></path><path d="M20.7071 3.29289c0.3905 0.39053 0.3905 1.02369 0 1.41422L4.70711 20.7071c-0.39053 0.3905 -1.02369 0.3905 -1.41422 0 -0.39052 -0.3905 -0.39052 -1.0237 0 -1.4142L19.2929 3.29289c0.3905 -0.39052 1.0237 -0.39052 1.4142 0Z" stroke-width="5"></path>`);
          } else if (isBaseline && graphStore.baselineMode === "withAdjustment") {
            $$renderer3.push("<!--[1-->");
            $$renderer3.push(`<path d="M2 12C2 11.4477 2.44772 11 3 11H21C21.5523 11 22 11.4477 22 12C22 12.5523 21.5523 13 21 13H3C2.44772 13 2 12.5523 2 12Z"></path>`);
          } else {
            $$renderer3.push("<!--[-1-->");
            $$renderer3.push(`<path d="M22.768125 12.478124999999999c-2.15625 4.59375 -4.03125 6.6468750000000005 -6.076874999999999 6.6468750000000005 -2.59125 0 -4.106249999999999 -3.22875 -5.709375 -6.6468750000000005 -0.6693749999999999 -1.43625 -1.3696875 -2.9156250000000004 -2.083125 -3.9721874999999995C8.2865625 7.6021875 7.7371875 7.125 7.3125 7.125c-0.35812499999999997 0 -1.71 0.38625 -4.0396875 5.353125a1.125 1.125 0 0 1 -2.0371875 -0.9562499999999999c2.15625 -4.59375 4.03125 -6.6468750000000005 6.076874999999999 -6.6468750000000005 2.59125 0 4.106249999999999 3.22875 5.709375 6.6468750000000005 0.6740625 1.43625 1.3696875 2.9203124999999996 2.083125 3.9721874999999995 0.6121875 0.90375 1.1615625 1.3809375 1.59375 1.3809375 0.35812499999999997 0 1.71 -0.38625 4.0396875 -5.353125a1.125 1.125 0 0 1 2.0371875 0.9562499999999999Z"></path>`);
          }
          $$renderer3.push(`<!--]--></svg>`);
        },
        $$slots: { default: true }
      });
      $$renderer2.push(`<!----> `);
      Button_1($$renderer2, {
        title: item.hidden ? "Show" : "Hide",
        onclick: () => {
          const willBeHidden = !item.hidden;
          graphEngine.updateVisibility(uuid, !willBeHidden);
          dataProvider.updateVisibility(uuid, willBeHidden);
        },
        "aria-label": item.hidden ? "Show" : "Hide",
        variant: "ghost",
        size: "icon",
        children: ($$renderer3) => {
          if (item.hidden) {
            $$renderer3.push("<!--[0-->");
            Eye_off($$renderer3, { class: "h-4 w-4", "aria-hidden": "true" });
          } else {
            $$renderer3.push("<!--[-1-->");
            Eye($$renderer3, { class: "h-4 w-4", "aria-hidden": "true" });
          }
          $$renderer3.push(`<!--]-->`);
        },
        $$slots: { default: true }
      });
      $$renderer2.push(`<!----> `);
      Button_1($$renderer2, {
        title: "Remove",
        onclick: () => dataProvider.removeFRDataWithUUID(item.type, uuid),
        "aria-label": "Remove",
        variant: "ghost",
        size: "icon",
        class: "hover:bg-error/10 hover:text-error",
        children: ($$renderer3) => {
          Trash_2($$renderer3, { class: "h-4 w-4", "aria-hidden": "true" });
        },
        $$slots: { default: true }
      });
      $$renderer2.push(`<!----></div></div> <div class="flex flex-col -mt-2"><div class="flex justify-end flex-wrap items-center gap-3">`);
      if (!isTarget(item) && channelOpts.length > 0) {
        $$renderer2.push("<!--[0-->");
        if (item.sampleCount && item.sampleCount > 0 || item.hptf) {
          $$renderer2.push("<!--[0-->");
          SampleChannelSelector($$renderer2, { uuid, item });
        } else {
          $$renderer2.push("<!--[-1-->");
          $$renderer2.select(
            {
              value: currentChannelVal,
              onchange: (e) => handleChannelChange(uuid, e.currentTarget.value),
              "aria-label": "Channel",
              class: "h-7 rounded border border-base-content/20 bg-base-200 px-1 text-xs focus:outline-none focus:ring-1 focus:ring-accent"
            },
            ($$renderer3) => {
              $$renderer3.push(`<!--[-->`);
              const each_array_2 = ensure_array_like(channelOpts);
              for (let $$index_1 = 0, $$length2 = each_array_2.length; $$index_1 < $$length2; $$index_1++) {
                let opt = each_array_2[$$index_1];
                $$renderer3.option({ value: opt.value }, ($$renderer4) => {
                  $$renderer4.push(`${escape_html(opt.label)}`);
                });
              }
              $$renderer3.push(`<!--]-->`);
            }
          );
        }
        $$renderer2.push(`<!--]-->`);
      } else {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]--> <div class="flex items-center gap-1">`);
      Button_1($$renderer2, {
        title: "Decrease Y offset",
        onmousedown: () => startYOffset(uuid, "dec"),
        onmouseup: stopYOffset,
        onmouseleave: stopYOffset,
        "aria-label": "Decrease Y offset",
        variant: "secondary",
        size: "icon",
        class: "p-1! rounded-full!",
        children: ($$renderer3) => {
          Minus($$renderer3, { class: "h-4 w-4", "aria-hidden": "true" });
        },
        $$slots: { default: true }
      });
      $$renderer2.push(`<!----> <input type="number" name="yOffset"${attr("id", `yOffset_${stringify(uuid)}`)}${attr("value", item.yOffset ?? 0)} aria-label="Y offset" class="h-7 w-12 rounded border border-base-content/20 bg-base-200 text-center text-xs focus:outline-none focus:ring-1 focus:ring-accent"/> `);
      Button_1($$renderer2, {
        title: "Increase Y offset",
        onmousedown: () => startYOffset(uuid, "inc"),
        onmouseup: stopYOffset,
        onmouseleave: stopYOffset,
        "aria-label": "Increase Y offset",
        variant: "secondary",
        size: "icon",
        class: "p-1! rounded-full!",
        children: ($$renderer3) => {
          Plus($$renderer3, { class: "h-4 w-4", "aria-hidden": "true" });
        },
        $$slots: { default: true }
      });
      $$renderer2.push(`<!----></div></div></div></div>`);
    }
    $$renderer2.push(`<!--]--> <div class="px-2 py-4 -mb-2">`);
    GraphUploader($$renderer2);
    $$renderer2.push(`<!----></div></div>`);
  });
}
function GraphPanel($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    $$renderer2.push(`<div class="flex h-full flex-col overflow-hidden">`);
    if (appStore.isMobile) {
      $$renderer2.push("<!--[0-->");
      Accordion_1($$renderer2, {
        type: "single",
        class: "border-b border-base-content/15 bg-base-200 p-1",
        children: ($$renderer3) => {
          AccordionItem($$renderer3, {
            title: graph_controls_label(),
            children: ($$renderer4) => {
              GraphToolbar($$renderer4);
            },
            $$slots: { default: true }
          });
        },
        $$slots: { default: true }
      });
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> <div class="border-b border-base-content/15 bg-base-200 p-1">`);
    TargetSelector($$renderer2);
    $$renderer2.push(`<!----></div> `);
    SelectionList($$renderer2);
    $$renderer2.push(`<!----></div>`);
  });
}
function EqPhoneSelect($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const sourceOptions = derived(() => {
      frStore.size;
      const opts = [];
      for (const [, item] of frStore.entries) {
        if (item.type !== "eq" && item.type !== "inserted-eq") {
          opts.push({
            uuid: item.uuid,
            label: `${item.identifier} ${item.dispSuffix || ""}`.trim()
          });
        }
      }
      return opts;
    });
    $$renderer2.select(
      {
        value: eqStore.sourcePhoneUUID ?? "",
        onchange: (e) => {
          eqStore.sourcePhoneUUID = e.target.value || null;
        },
        class: "flex-1 rounded min-w-16 border border-base-content/20 bg-base-100 px-2 py-1 text-sm"
      },
      ($$renderer3) => {
        $$renderer3.option({ value: "" }, ($$renderer4) => {
          $$renderer4.push(`${escape_html(equalizer_phone_select_option_source())}`);
        });
        $$renderer3.push(`<!--[-->`);
        const each_array = ensure_array_like(sourceOptions());
        for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
          let opt = each_array[$$index];
          $$renderer3.option({ value: opt.uuid }, ($$renderer4) => {
            $$renderer4.push(`${escape_html(opt.label)}`);
          });
        }
        $$renderer3.push(`<!--]-->`);
      }
    );
  });
}
function logToLinear(value, min, max, steps = 1e3) {
  const logMin = Math.log10(min);
  const logMax = Math.log10(max);
  return Math.round((Math.log10(value) - logMin) / (logMax - logMin) * steps);
}
function Switch_1($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let {
      id = useId(),
      checked = false,
      ref = null,
      labelText,
      labelClass = "",
      size: size2 = "md",
      variant = "accent",
      $$slots,
      $$events,
      ...restProps
    } = $$props;
    const sizeClasses = { sm: "h-5 w-9", md: "h-6 w-11", lg: "h-7 w-14" };
    const thumbSizeClasses = {
      sm: "size-3.5 data-[state=checked]:translate-x-4",
      md: "size-[18px] data-[state=checked]:translate-x-5",
      lg: "size-[22px] data-[state=checked]:translate-x-7"
    };
    const variantRootClasses = {
      accent: "focus-visible:ring-accent focus-visible:ring-offset-base-100 data-[state=checked]:bg-primary data-[state=unchecked]:bg-base-300",
      muted: "focus-visible:ring-base-content focus-visible:ring-offset-base-100 data-[state=checked]:bg-base-content/80 data-[state=unchecked]:bg-base-content/30"
    };
    const variantThumbClasses = { accent: "bg-base-100", muted: "bg-base-100" };
    let $$settled = true;
    let $$inner_renderer;
    function $$render_inner($$renderer3) {
      $$renderer3.push(`<div class="flex items-center space-x-2">`);
      if (Switch) {
        $$renderer3.push("<!--[-->");
        Switch($$renderer3, spread_props([
          {
            id,
            class: `peer inline-flex shrink-0 cursor-pointer items-center rounded-full px-0.75 transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2 data-[state=unchecked]:shadow-inner disabled:cursor-not-allowed disabled:opacity-50 ${stringify(sizeClasses[size2])} ${stringify(variantRootClasses[variant])} ${stringify(restProps.class)}`
          },
          restProps,
          {
            get checked() {
              return checked;
            },
            set checked($$value) {
              checked = $$value;
              $$settled = false;
            },
            get ref() {
              return ref;
            },
            set ref($$value) {
              ref = $$value;
              $$settled = false;
            },
            children: ($$renderer4) => {
              if (Switch_thumb) {
                $$renderer4.push("<!--[-->");
                Switch_thumb($$renderer4, {
                  class: `pointer-events-none block shrink-0 rounded-full shadow-sm transition-transform data-[state=unchecked]:translate-x-0 ${stringify(thumbSizeClasses[size2])} ${stringify(variantThumbClasses[variant])}`
                });
                $$renderer4.push("<!--]-->");
              } else {
                $$renderer4.push("<!--[!-->");
                $$renderer4.push("<!--]-->");
              }
            },
            $$slots: { default: true }
          }
        ]));
        $$renderer3.push("<!--]-->");
      } else {
        $$renderer3.push("<!--[!-->");
        $$renderer3.push("<!--]-->");
      }
      $$renderer3.push(` `);
      if (labelText) {
        $$renderer3.push("<!--[0-->");
        if (Label) {
          $$renderer3.push("<!--[-->");
          Label($$renderer3, {
            for: id,
            class: `text-sm font-medium ${stringify(labelClass)}`,
            children: ($$renderer4) => {
              $$renderer4.push(`<!---->${escape_html(labelText)}`);
            },
            $$slots: { default: true }
          });
          $$renderer3.push("<!--]-->");
        } else {
          $$renderer3.push("<!--[!-->");
          $$renderer3.push("<!--]-->");
        }
      } else {
        $$renderer3.push("<!--[-1-->");
      }
      $$renderer3.push(`<!--]--></div>`);
    }
    do {
      $$settled = true;
      $$inner_renderer = $$renderer2.copy();
      $$render_inner($$inner_renderer);
    } while (!$$settled);
    $$renderer2.subsume($$inner_renderer);
    bind_props($$props, { checked, ref });
  });
}
function EqFilterCard($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { filter, index, expanded, onToggle, onUpdate, onRemove } = $$props;
    const typeShortLabels = { PK: "PK", LSQ: "LS", HSQ: "HS" };
    const typeOptions = [
      ["PK", equalizer_filter_list_peak],
      ["LSQ", equalizer_filter_list_lowshelf],
      ["HSQ", equalizer_filter_list_highshelf]
    ];
    let freqSliderValue = derived(() => filter.freq != null ? logToLinear(filter.freq, 20, 2e4) : 500);
    let gainSliderValue = derived(() => filter.gain != null ? Math.round(filter.gain * 10) : 0);
    let qSliderValue = derived(() => filter.q != null ? logToLinear(filter.q, 0.1, 10) : logToLinear(1, 0.1, 10));
    const inputBase = "bg-transparent text-xs tabular-nums text-base-content text-right outline-none rounded px-1 py-0.5 ring-1 ring-base-content/30 hover:bg-base-content/5 focus:bg-base-200 focus:ring-accent/50 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";
    $$renderer2.push(`<div class="rounded-lg border overflow-hidden transition-colors border-base-content/20"><div class="flex min-h-8 items-center gap-2 pl-2 pr-1 py-0.5">`);
    Switch_1($$renderer2, {
      size: "sm",
      variant: "muted",
      checked: filter.enabled,
      onCheckedChange: (checked) => onUpdate({ enabled: checked })
    });
    $$renderer2.push(`<!----> `);
    Button_1($$renderer2, {
      title: "Change filter type",
      onclick: (e) => {
        e.stopPropagation();
        const currentIndex = typeOptions.findIndex(([value]) => value === filter.type);
        const nextType = typeOptions[(currentIndex + 1) % typeOptions.length][0];
        onUpdate({ type: nextType });
      },
      variant: "muted",
      size: "xs",
      children: ($$renderer3) => {
        $$renderer3.push(`<!---->${escape_html(typeShortLabels[filter.type])}`);
      },
      $$slots: { default: true }
    });
    $$renderer2.push(`<!----> <label class="flex-1 inline-flex items-baseline gap-0.5 shrink-0"><input type="number"${attr("value", filter.freq)}${attr("min", 20)}${attr("max", 2e4)}${attr("step", 1)}${attr_class(`w-full ${stringify(inputBase)}`)}/> <span class="text-[12px] text-base-content/60 select-none">Hz</span></label> <label class="flex-1 inline-flex items-baseline gap-0.5 shrink-0"><input type="number"${attr("value", filter.gain)}${attr("min", -30)}${attr("max", 30)}${attr("step", 0.1)}${attr_class(`w-full ${stringify(inputBase)}`)}/> <span class="text-[12px] text-base-content/60 select-none">dB</span></label> <span class="text-[12px] text-base-content/60 select-none">-</span> <label class="flex-1 inline-flex items-baseline gap-0.5 shrink-0"><span class="text-[12px] text-base-content/60 select-none">Q</span> <input type="number"${attr("value", filter.q)}${attr("min", 0.1)}${attr("max", 10)}${attr("step", 0.01)}${attr_class(`w-full ${stringify(inputBase)}`)}/></label> <div class="flex items-center">`);
    Button_1($$renderer2, {
      title: `Expand filter ${stringify(index + 1)} options`,
      onclick: onToggle,
      variant: "ghost",
      size: "icon",
      class: "text-base-content/50 hover:text-accent",
      children: ($$renderer3) => {
        Chevron_down($$renderer3, {
          class: `h-4 w-4 shrink-0 text-base-content/50 transition-transform duration-150 ${stringify(expanded ? "rotate-180" : "")}`
        });
      },
      $$slots: { default: true }
    });
    $$renderer2.push(`<!----> `);
    Button_1($$renderer2, {
      title: `Remove filter ${stringify(index + 1)}`,
      onclick: (e) => {
        e.stopPropagation();
        onRemove();
      },
      variant: "ghost",
      size: "icon",
      class: "text-base-content/50 hover:text-error",
      children: ($$renderer3) => {
        X($$renderer3, { class: "h-3.5 w-3.5" });
      },
      $$slots: { default: true }
    });
    $$renderer2.push(`<!----></div></div> `);
    if (expanded) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div${attr_class("flex flex-col gap-3 px-3 pb-4 pt-0.5", void 0, { "opacity-50": !filter.enabled })}><div class="flex border border-base-content/20 rounded-md"><!--[-->`);
      const each_array = ensure_array_like(typeOptions);
      for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
        let [value, label] = each_array[$$index];
        $$renderer2.push(`<button${attr_class(`flex-1 py-1 text-xs font-medium transition-colors first:rounded-l-md last:rounded-r-md first:border-r last:border-l border-base-content/20 ${stringify(filter.type === value ? "bg-accent text-white" : "bg-base-200 text-base-content/70 hover:bg-base-300")}`)}>${escape_html(label())}</button>`);
      }
      $$renderer2.push(`<!--]--></div> <div class="flex flex-col gap-1"><div class="flex items-center justify-between"><span class="text-xs text-base-content/60">${escape_html(equalizer_filter_list_freq())}</span> <label class="inline-flex items-baseline gap-1"><input type="number"${attr("value", filter.freq)}${attr("min", 20)}${attr("max", 2e4)}${attr("step", 1)}${attr_class(`w-16 ${stringify(inputBase)} border border-transparent focus:border-base-content/20`)}/> <span class="text-[10px] text-base-content/40 select-none">Hz</span></label></div> <input type="range" min="0" max="1000" step="1"${attr("value", freqSliderValue())} class="h-1 w-full cursor-pointer appearance-none rounded-full bg-base-content/20 accent-accent"/></div> <div class="flex flex-col gap-1"><div class="flex items-center justify-between"><span class="text-xs text-base-content/60">${escape_html(equalizer_filter_list_gain())}</span> <label class="inline-flex items-baseline gap-1"><input type="number"${attr("value", filter.gain)}${attr("min", -30)}${attr("max", 30)}${attr("step", 0.1)}${attr_class(`w-14 ${stringify(inputBase)} border border-transparent focus:border-base-content/20`)}/> <span class="text-[10px] text-base-content/40 select-none">dB</span></label></div> <input type="range" min="-300" max="300" step="1"${attr("value", gainSliderValue())} class="h-1 w-full cursor-pointer appearance-none rounded-full bg-base-content/20 accent-accent"/></div> <div class="flex flex-col gap-1"><div class="flex items-center justify-between"><span class="text-xs text-base-content/60">${escape_html(equalizer_filter_list_q())}</span> <label class="inline-flex items-baseline gap-1"><span class="text-[10px] text-base-content/40 select-none">Q</span> <input type="number"${attr("value", filter.q)}${attr("min", 0.1)}${attr("max", 10)}${attr("step", 0.01)}${attr_class(`w-14 ${stringify(inputBase)} border border-transparent focus:border-base-content/20`)}/></label></div> <input type="range" min="0" max="1000" step="1"${attr("value", qSliderValue())} class="h-1 w-full cursor-pointer appearance-none rounded-full bg-base-content/20 accent-accent"/></div></div>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--></div>`);
  });
}
function EqFilterList($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let expandedIndex = null;
    const preamp = derived(() => {
      const filters = eqStore.filters.filter((f) => f.enabled && f.freq && f.q && f.gain);
      if (!filters.length) return 0;
      const baseFreqs = Array.from({ length: 100 }, (_, i) => 20 * Math.pow(10, i * Math.log10(2e4 / 20) / 99));
      const baseFR = baseFreqs.map((f) => [f, 0]);
      const eq = new Equalizer();
      return parseFloat(eq.calculatePreamp(baseFR, filters).toFixed(1));
    });
    function addBand() {
      eqStore.addBand({ enabled: true, type: "PK", freq: null, q: null, gain: null });
    }
    function removeBand() {
      if (eqStore.filters.length > 0) {
        const lastIdx = eqStore.filters.length - 1;
        if (expandedIndex === lastIdx) expandedIndex = null;
        eqStore.removeBandAt(lastIdx);
      }
    }
    function sortBands() {
      expandedIndex = null;
      const sorted = [...eqStore.filters].sort((a, b) => (a.freq ?? Infinity) - (b.freq ?? Infinity));
      eqStore.filters = sorted;
    }
    function updateFilter(index, partial) {
      eqStore.updateBandAt(index, partial);
    }
    function importFilters() {
    }
    function exportFilters() {
      const validFilters = eqStore.filters.filter((f) => f.freq != null && f.q != null && f.gain != null);
      if (!validFilters.length) {
        toast.warning(equalizer_filter_list_no_filter_export_alert());
        return;
      }
      let text = `Preamp: ${preamp().toFixed(1)} dB
`;
      validFilters.forEach((f, i) => {
        let type = f.type;
        if (type === "LSQ") type = "LSC";
        if (type === "HSQ") type = "HSC";
        text += `Filter ${i + 1}: ON ${type} Fc ${f.freq.toFixed(0)} Hz Gain ${f.gain.toFixed(1)} dB Q ${f.q.toFixed(3)}
`;
      });
      downloadText(text, "filters.txt");
      toast.success(equalizer_filter_list_export());
    }
    function exportGraphicEQ() {
      if (!eqStore.filters.length) {
        toast.warning(equalizer_filter_list_no_filter_export_alert());
        return;
      }
      const eq = new Equalizer();
      const graphicEQ = eq.convertFilterAsGraphicEQ(eqStore.filters);
      const text = "GraphicEQ: " + graphicEQ.map(([f, g]) => `${f.toFixed(0)} ${g.toFixed(1)}`).join("; ");
      downloadText(text, "graphic_eq.txt");
      toast.success(equalizer_filter_list_export_graphic_eq());
    }
    function downloadText(text, filename) {
      const blob = new Blob([text], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }
    $$renderer2.push(`<div class="flex flex-col gap-1.75"><div class="flex items-center justify-between"><span class="text-xs text-base-content/60">${escape_html(equalizer_filter_list_preamp())}: <span class="font-medium text-base-content">${escape_html(preamp().toFixed(1))} dB</span></span> <div class="flex gap-1">`);
    Button_1($$renderer2, {
      title: "Add EQ Band",
      variant: "outline",
      size: "icon",
      class: "size-6 p-px",
      onclick: addBand,
      children: ($$renderer3) => {
        Plus($$renderer3, { class: "size-3" });
      },
      $$slots: { default: true }
    });
    $$renderer2.push(`<!----> `);
    Button_1($$renderer2, {
      title: "Remove EQ Band",
      variant: "outline",
      size: "icon",
      class: "size-6 p-px",
      onclick: removeBand,
      children: ($$renderer3) => {
        Minus($$renderer3, { class: "size-3" });
      },
      $$slots: { default: true }
    });
    $$renderer2.push(`<!----> `);
    Button_1($$renderer2, {
      title: "Sort EQ Bands",
      variant: "outline",
      size: "icon",
      class: "size-6 p-px",
      onclick: sortBands,
      children: ($$renderer3) => {
        Arrow_down_0_1($$renderer3, { class: "size-3.25" });
      },
      $$slots: { default: true }
    });
    $$renderer2.push(`<!----></div></div> <div class="flex flex-col gap-1.5"><!--[-->`);
    const each_array = ensure_array_like(eqStore.filters);
    for (let i = 0, $$length = each_array.length; i < $$length; i++) {
      let filter = each_array[i];
      EqFilterCard($$renderer2, {
        filter,
        index: i,
        expanded: expandedIndex === i,
        onToggle: () => expandedIndex = expandedIndex === i ? null : i,
        onUpdate: (partial) => updateFilter(i, partial),
        onRemove: () => {
          if (expandedIndex === i) expandedIndex = null;
          else if (expandedIndex !== null && expandedIndex > i) expandedIndex--;
          eqStore.removeBandAt(i);
        }
      });
    }
    $$renderer2.push(`<!--]--></div> <div class="flex gap-1.5">`);
    Button_1($$renderer2, {
      title: equalizer_filter_list_import(),
      onclick: importFilters,
      variant: "outline",
      size: "sm",
      class: "flex-1",
      children: ($$renderer3) => {
        Download($$renderer3, { class: "size-3.5 mr-1.5" });
        $$renderer3.push(`<!----> ${escape_html(equalizer_filter_list_import())}`);
      },
      $$slots: { default: true }
    });
    $$renderer2.push(`<!----> `);
    Button_1($$renderer2, {
      title: equalizer_filter_list_export(),
      onclick: exportFilters,
      variant: "outline",
      size: "sm",
      class: "flex-1",
      children: ($$renderer3) => {
        Upload($$renderer3, { class: "size-3.5 mr-1.5" });
        $$renderer3.push(`<!----> ${escape_html(equalizer_filter_list_export())}`);
      },
      $$slots: { default: true }
    });
    $$renderer2.push(`<!----></div> <div>`);
    Button_1($$renderer2, {
      title: "Export filters as Graphic EQ File",
      onclick: exportGraphicEQ,
      variant: "muted",
      size: "sm",
      class: "w-full ring-1 ring-base-content/20 hover:ring-base-content/40 focus:ring-base-content/40",
      children: ($$renderer3) => {
        $$renderer3.push(`<!---->${escape_html(equalizer_filter_list_export_graphic_eq())}`);
      },
      $$slots: { default: true }
    });
    $$renderer2.push(`<!----></div> <input type="file" accept=".txt" class="hidden"/></div>`);
  });
}
function EqAutoEqSelect($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const targetOptions = derived(() => {
      frStore.size;
      const opts = [];
      for (const [, item] of frStore.entries) {
        if (item.type !== "eq" && item.type !== "inserted-eq") {
          opts.push({
            uuid: item.uuid,
            label: `${item.identifier} ${item.dispSuffix || ""}`.trim()
          });
        }
      }
      return opts;
    });
    $$renderer2.select(
      {
        value: eqStore.autoEqTargetUUID ?? "",
        onchange: (e) => {
          eqStore.autoEqTargetUUID = e.target.value || null;
        },
        class: "w-full rounded border border-base-content/20 px-2 py-1 text-sm cursor-pointer"
      },
      ($$renderer3) => {
        $$renderer3.option({ value: "" }, ($$renderer4) => {
          $$renderer4.push(`${escape_html(equalizer_phone_select_option_target())}`);
        });
        $$renderer3.push(`<!--[-->`);
        const each_array = ensure_array_like(targetOptions());
        for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
          let opt = each_array[$$index];
          $$renderer3.option({ value: opt.uuid }, ($$renderer4) => {
            $$renderer4.push(`${escape_html(opt.label)}`);
          });
        }
        $$renderer3.push(`<!--]-->`);
      }
    );
  });
}
let worker = null;
let nextId = 0;
function getWorker() {
  if (!worker) {
    worker = new Worker(new URL("./autoeq.worker.ts", import.meta.url), { type: "module" });
  }
  return worker;
}
function runAutoEQInWorker(source, target, options) {
  const w = getWorker();
  const id = ++nextId;
  return new Promise((resolve2, reject) => {
    function handler(e) {
      const data = e.data;
      if (data.id !== id) return;
      w.removeEventListener("message", handler);
      w.removeEventListener("error", errorHandler);
      if (data.type === "autoeq-result") {
        resolve2(data.filters);
      } else if (data.type === "autoeq-error") {
        reject(new Error(data.error));
      }
    }
    function errorHandler(e) {
      w.removeEventListener("message", handler);
      w.removeEventListener("error", errorHandler);
      reject(new Error(e.message || "Worker error"));
    }
    w.addEventListener("message", handler);
    w.addEventListener("error", errorHandler);
    w.postMessage({ type: "run-autoeq", id, source, target, options });
  });
}
function EqAutoEq($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let freqMin = 20;
    let freqMax = 15e3;
    let qMin = 0.5;
    let qMax = 2;
    let gainMin = -12;
    let gainMax = 12;
    let useShelfFilter = true;
    let isRunning = false;
    async function runAutoEQ() {
      const sourceUUID = eqStore.sourcePhoneUUID;
      const targetUUID = eqStore.autoEqTargetUUID;
      if (!sourceUUID || !targetUUID) {
        alert("Please select both a source device and target in the phone select above.");
        return;
      }
      const sourceData = frStore.get(sourceUUID);
      const targetData = frStore.get(targetUUID);
      if (!sourceData || !targetData) {
        alert("Source or target data not found.");
        return;
      }
      const getChannelData = (data) => {
        return data?.channels?.AVG?.data ?? data?.channels?.L?.data ?? data?.channels?.R?.data ?? [];
      };
      const sourcePoints = getChannelData(sourceData);
      const targetPoints = getChannelData(targetData);
      if (!sourcePoints.length || !targetPoints.length) {
        alert("Could not retrieve frequency response data.");
        return;
      }
      const maxFilters = Math.max(1, eqStore.filters.length);
      const options = {
        maxFilters,
        freqRange: [freqMin, freqMax],
        qRange: [qMin, qMax],
        gainRange: [gainMin, gainMax],
        useShelfFilter
      };
      isRunning = true;
      try {
        const filters = await runAutoEQInWorker(sourcePoints, targetPoints, options);
        eqStore.filters = filters;
      } catch (err) {
        console.error("AutoEQ failed:", err);
      } finally {
        isRunning = false;
      }
    }
    let $$settled = true;
    let $$inner_renderer;
    function $$render_inner($$renderer3) {
      $$renderer3.push(`<div class="flex flex-col gap-2 text-sm"><fieldset class="rounded border border-base-content/15 px-3 py-2"><legend class="px-1 text-xs text-base-content/60">${escape_html(equalizer_autoeq_filter_setting())}</legend> `);
      Switch_1($$renderer3, {
        labelText: equalizer_autoeq_use_shelf_filter(),
        size: "sm",
        labelClass: "text-xs font-normal",
        get checked() {
          return useShelfFilter;
        },
        set checked($$value) {
          useShelfFilter = $$value;
          $$settled = false;
        }
      });
      $$renderer3.push(`<!----></fieldset> <fieldset class="rounded border border-base-content/15 px-3 py-2"><legend class="px-1 text-xs text-base-content/60">${escape_html(equalizer_autoeq_freq_range())}</legend> <div class="flex items-center gap-2"><span class="text-xs text-base-content/60">${escape_html(equalizer_autoeq_min())}</span> <input type="number"${attr("value", freqMin)} min="20" max="20000" class="flex-1 rounded border border-base-content/20 bg-base-200 px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-accent"/> <span class="text-xs text-base-content/60">${escape_html(equalizer_autoeq_max())}</span> <input type="number"${attr("value", freqMax)} min="20" max="20000" class="flex-1 rounded border border-base-content/20 bg-base-200 px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-accent"/></div></fieldset> <fieldset class="rounded border border-base-content/15 px-3 py-2"><legend class="px-1 text-xs text-base-content/60">${escape_html(equalizer_autoeq_gain_range())}</legend> <div class="flex items-center gap-2"><span class="text-xs text-base-content/60">${escape_html(equalizer_autoeq_min())}</span> <input type="number"${attr("value", gainMin)} min="-40" max="0" class="flex-1 rounded border border-base-content/20 bg-base-200 px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-accent"/> <span class="text-xs text-base-content/60">${escape_html(equalizer_autoeq_max())}</span> <input type="number"${attr("value", gainMax)} min="0" max="40" class="flex-1 rounded border border-base-content/20 bg-base-200 px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-accent"/></div></fieldset> <fieldset class="rounded border border-base-content/15 px-3 py-2"><legend class="px-1 text-xs text-base-content/60">${escape_html(equalizer_autoeq_q_range())}</legend> <div class="flex items-center gap-2"><span class="text-xs text-base-content/60">${escape_html(equalizer_autoeq_min())}</span> <input type="number"${attr("value", qMin)} min="0.1" max="10" step="0.1" class="flex-1 rounded border border-base-content/20 bg-base-200 px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-accent"/> <span class="text-xs text-base-content/60">${escape_html(equalizer_autoeq_max())}</span> <input type="number"${attr("value", qMax)} min="0.1" max="10" step="0.1" class="flex-1 rounded border border-base-content/20 bg-base-200 px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-accent"/></div></fieldset> <p class="text-xs text-base-content/60">${escape_html(equalizer_autoeq_description())}</p> `);
      Button_1($$renderer3, {
        title: equalizer_autoeq_run_button(),
        onclick: runAutoEQ,
        disabled: isRunning,
        variant: "primary",
        children: ($$renderer4) => {
          $$renderer4.push(`<!---->${escape_html(isRunning ? "..." : equalizer_autoeq_run_button())}`);
        },
        $$slots: { default: true }
      });
      $$renderer3.push(`<!----></div>`);
    }
    do {
      $$settled = true;
      $$inner_renderer = $$renderer2.copy();
      $$render_inner($$inner_renderer);
    } while (!$$settled);
    $$renderer2.subsume($$inner_renderer);
  });
}
function EqAudioPlayer($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let audioContext = null;
    let gainNode = null;
    let analyserNode = null;
    let sourceNode = null;
    let oscillatorNode = null;
    let filterNodes = [];
    let isPlaying = false;
    let startTime = 0;
    let pausedAt = 0;
    let audioSource = "";
    let filtersEnabled = true;
    let showSpectrum = false;
    let volume = 0.1;
    let toneFreq = 1e3;
    let fileInputEl = void 0;
    function getAudioContext() {
      if (!audioContext) {
        audioContext = new AudioContext();
      }
      return audioContext;
    }
    function updateFilters() {
      const ctx = audioContext;
      if (!ctx || !gainNode) return;
      filterNodes.forEach((n) => n.disconnect());
      filterNodes = [];
      const filters = eqStore.filters.filter((f) => f.enabled && f.freq && f.q && f.gain);
      if (!filtersEnabled || !filters.length) {
        reconnectSource();
        return;
      }
      const preampNode = ctx.createGain();
      preampNode.gain.value = Math.pow(10, eqStore.preamp / 20);
      filterNodes.push(preampNode);
      for (const f of filters) {
        const node = ctx.createBiquadFilter();
        if (f.type === "PK") node.type = "peaking";
        else if (f.type === "LSQ") node.type = "lowshelf";
        else if (f.type === "HSQ") node.type = "highshelf";
        node.frequency.value = f.freq;
        node.Q.value = f.q;
        node.gain.value = f.gain;
        filterNodes.push(node);
      }
      for (let i = 0; i < filterNodes.length - 1; i++) {
        filterNodes[i].connect(filterNodes[i + 1]);
      }
      const chainTarget = analyserNode ?? gainNode;
      filterNodes[filterNodes.length - 1].connect(chainTarget);
      reconnectSource();
    }
    function reconnectSource() {
      const source = sourceNode ?? oscillatorNode ?? null;
      if (!source) return;
      source.disconnect();
      if (filterNodes.length > 0) {
        source.connect(filterNodes[0]);
      } else {
        source.connect(analyserNode ?? gainNode);
      }
    }
    function createNoiseNode(type) {
      const ctx = getAudioContext();
      const bufferSize = 2 * ctx.sampleRate;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = buffer.getChannelData(0);
      if (type === "white") {
        for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;
      } else {
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
        for (let i = 0; i < bufferSize; i++) {
          const w = Math.random() * 2 - 1;
          b0 = 0.99886 * b0 + w * 0.0555179;
          b1 = 0.99332 * b1 + w * 0.0750759;
          b2 = 0.969 * b2 + w * 0.153852;
          b3 = 0.8665 * b3 + w * 0.3104856;
          b4 = 0.55 * b4 + w * 0.5329522;
          b5 = -0.7616 * b5 - w * 0.016898;
          b6 = w * 0.115926;
          output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        }
      }
      const node = ctx.createBufferSource();
      node.buffer = buffer;
      node.loop = true;
      return node;
    }
    function play() {
      const ctx = getAudioContext();
      if (!gainNode) {
        gainNode = ctx.createGain();
        gainNode.gain.value = volume;
        gainNode.connect(ctx.destination);
      }
      if (!analyserNode) {
        analyserNode = ctx.createAnalyser();
        analyserNode.fftSize = 4096;
        analyserNode.smoothingTimeConstant = 0.8;
        analyserNode.connect(gainNode);
        audioSpectrumStore.analyserNode = analyserNode;
      }
      updateFilters();
      if (audioSource === "white" || audioSource === "pink") {
        sourceNode = createNoiseNode(audioSource);
        const target = filterNodes.length > 0 ? filterNodes[0] : analyserNode ?? gainNode;
        sourceNode.connect(target);
        sourceNode.start();
      } else if (audioSource === "tone") {
        oscillatorNode = ctx.createOscillator();
        oscillatorNode.type = "sine";
        oscillatorNode.frequency.value = toneFreq;
        const target = filterNodes.length > 0 ? filterNodes[0] : analyserNode ?? gainNode;
        oscillatorNode.connect(target);
        oscillatorNode.start();
      } else return;
      startTime = ctx.currentTime;
      isPlaying = true;
    }
    function pause() {
      if (!isPlaying) return;
      sourceNode?.stop();
      sourceNode?.disconnect();
      sourceNode = null;
      oscillatorNode?.stop();
      oscillatorNode?.disconnect();
      oscillatorNode = null;
      if (audioContext) pausedAt += audioContext.currentTime - startTime;
      isPlaying = false;
    }
    function stop() {
      pause();
      pausedAt = 0;
    }
    function togglePlay() {
      if (!audioSource) return;
      if (isPlaying) pause();
      else play();
    }
    onDestroy(() => {
      stop();
      audioSpectrumStore.analyserNode = null;
      audioSpectrumStore.isEnabled = false;
      audioContext?.close();
      audioContext = null;
    });
    $$renderer2.push(`<div class="flex flex-col gap-3"><div class="flex items-center gap-4">`);
    Switch_1($$renderer2, {
      title: filtersEnabled ? "Disable EQ filters" : "Enable EQ filters",
      labelText: equalizer_player_filter_toggle(),
      labelClass: "text-xs",
      size: "sm",
      checked: filtersEnabled,
      onCheckedChange: (checked) => {
        filtersEnabled = checked;
      }
    });
    $$renderer2.push(`<!----> `);
    Switch_1($$renderer2, {
      title: showSpectrum ? "Hide audio spectrum" : "Show audio spectrum",
      labelText: equalizer_player_spectrum_toggle(),
      labelClass: "text-xs",
      size: "sm",
      checked: showSpectrum,
      onCheckedChange: () => {
        showSpectrum = !showSpectrum;
        audioSpectrumStore.isEnabled = showSpectrum;
      }
    });
    $$renderer2.push(`<!----></div> `);
    $$renderer2.select(
      {
        value: audioSource,
        onchange: (e) => {
          audioSource = e.target.value;
          if (isPlaying) stop();
        },
        class: "w-full rounded border border-base-content/20 bg-base-200 px-2 py-1 text-sm"
      },
      ($$renderer3) => {
        $$renderer3.option({ value: "" }, ($$renderer4) => {
          $$renderer4.push(`${escape_html(equalizer_player_option_init())}`);
        });
        $$renderer3.option({ value: "white" }, ($$renderer4) => {
          $$renderer4.push(`${escape_html(equalizer_player_option_white())}`);
        });
        $$renderer3.option({ value: "pink" }, ($$renderer4) => {
          $$renderer4.push(`${escape_html(equalizer_player_option_pink())}`);
        });
        $$renderer3.option({ value: "tone" }, ($$renderer4) => {
          $$renderer4.push(`${escape_html(equalizer_player_option_tone())}`);
        });
        $$renderer3.option({ value: "file" }, ($$renderer4) => {
          $$renderer4.push(`${escape_html(equalizer_player_option_file())}`);
        });
      }
    );
    $$renderer2.push(` `);
    if (audioSource === "tone") {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div class="flex flex-col gap-1"><span class="text-xs text-base-content/60">${escape_html(equalizer_player_tone_freq_label())}<span class="font-medium">${escape_html(toneFreq)} Hz</span></span> <input type="range" min="0" max="1000" step="1"${attr("value", Math.round((Math.log10(toneFreq) - Math.log10(20)) / (Math.log10(2e4) - Math.log10(20)) * 1e3))} class="w-full accent-accent"/></div>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> `);
    if (audioSource === "file") {
      $$renderer2.push("<!--[0-->");
      Button_1($$renderer2, {
        title: equalizer_player_file_upload(),
        onclick: () => fileInputEl?.click(),
        variant: "outline",
        size: "sm",
        class: "w-full",
        children: ($$renderer3) => {
          File_up($$renderer3, { class: "size-3.5 mr-1.5" });
          $$renderer3.push(`<!----> ${escape_html(equalizer_player_file_upload())}`);
        },
        $$slots: { default: true }
      });
      $$renderer2.push(`<!----> <input type="file" accept="audio/*" class="hidden"/> `);
      {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]-->`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> <div class="flex items-center gap-1.5">`);
    Button_1($$renderer2, {
      title: "Stop Audio",
      onclick: stop,
      disabled: !audioSource,
      variant: "muted",
      size: "icon",
      children: ($$renderer3) => {
        Square($$renderer3, { class: "size-3.5" });
      },
      $$slots: { default: true }
    });
    $$renderer2.push(`<!----> `);
    Button_1($$renderer2, {
      title: isPlaying ? "Pause Audio" : "Play Audio",
      onclick: togglePlay,
      disabled: !audioSource || audioSource === "file" && true,
      variant: "muted",
      size: "icon",
      children: ($$renderer3) => {
        if (isPlaying) {
          $$renderer3.push("<!--[0-->");
          Pause($$renderer3, { class: "size-3.5" });
        } else {
          $$renderer3.push("<!--[-1-->");
          Play($$renderer3, { class: "size-3.5" });
        }
        $$renderer3.push(`<!--]-->`);
      },
      $$slots: { default: true }
    });
    $$renderer2.push(`<!----> <div class="w-px h-5 bg-base-content/30 mx-1"></div> <div class="flex flex-1 items-center gap-1">`);
    {
      $$renderer2.push("<!--[-1-->");
      Volume_2($$renderer2, { class: "size-3.5" });
    }
    $$renderer2.push(`<!--]--> <input type="range" min="0" max="1" step="0.01"${attr("value", volume)} class="w-full accent-accent"/></div></div></div>`);
  });
}
class DevicePeqStore {
  isConnected = false;
  isConnecting = false;
  deviceName = null;
  manufacturer = null;
  connectionType = null;
  activeSlot = null;
  slots = [];
  isReading = false;
  isWriting = false;
  statusMessage = null;
  device = null;
  setConnected(device, slots, currentSlot) {
    this.device = device;
    this.isConnected = true;
    this.isConnecting = false;
    this.deviceName = device.model;
    this.manufacturer = device.manufacturer;
    this.connectionType = device.connectionType;
    this.slots = slots;
    this.activeSlot = currentSlot;
    this.statusMessage = `Connected: ${device.model}`;
  }
  setDisconnected() {
    this.device = null;
    this.isConnected = false;
    this.isConnecting = false;
    this.deviceName = null;
    this.manufacturer = null;
    this.connectionType = null;
    this.activeSlot = null;
    this.slots = [];
    this.isReading = false;
    this.isWriting = false;
    this.statusMessage = null;
  }
  setStatus(message) {
    this.statusMessage = message;
  }
}
const devicePeqStore = new DevicePeqStore();
function DevicePeq($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const hasHid = typeof navigator !== "undefined" && "hid" in navigator;
    const hasSerial = typeof navigator !== "undefined" && "serial" in navigator;
    const hasBluetooth = typeof navigator !== "undefined" && "bluetooth" in navigator;
    const hasDeviceApi = hasHid || hasSerial || hasBluetooth;
    async function getConnector(connectionType) {
      if (connectionType === "hid") {
        return await import("../../chunks/usb-hid-connector.js");
      }
      if (connectionType === "serial") {
        return await import("../../chunks/usb-serial-connector.js");
      }
      if (connectionType === "ble") {
        return await import("../../chunks/bluetooth-ble-connector.js");
      }
      return await import("../../chunks/network-connector.js");
    }
    async function onSlotChange(slotId) {
      const device = devicePeqStore.device;
      if (!device) return;
      devicePeqStore.activeSlot = slotId;
      try {
        const connector = await getConnector(device.connectionType);
        await connector.enablePEQ(device, true, slotId);
      } catch (e) {
        console.error("Failed to change slot:", e);
      }
    }
    if (hasDeviceApi) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div class="flex flex-col gap-2">`);
      if (!devicePeqStore.isConnected) {
        $$renderer2.push("<!--[0-->");
        $$renderer2.push(`<div class="flex gap-1">`);
        if (hasHid) {
          $$renderer2.push("<!--[0-->");
          $$renderer2.push(`<button${attr("disabled", devicePeqStore.isConnecting, true)} class="flex-1 rounded border border-base-content/20 bg-base-200 px-2 py-1 text-xs transition-colors hover:bg-base-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50">${escape_html(devicePeqStore.isConnecting ? "Connecting..." : "USB (HID)")}</button>`);
        } else {
          $$renderer2.push("<!--[-1-->");
        }
        $$renderer2.push(`<!--]--> `);
        if (hasSerial) {
          $$renderer2.push("<!--[0-->");
          $$renderer2.push(`<button${attr("disabled", devicePeqStore.isConnecting, true)} class="flex-1 rounded border border-base-content/20 bg-base-200 px-2 py-1 text-xs transition-colors hover:bg-base-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50">${escape_html(devicePeqStore.isConnecting ? "Connecting..." : "USB (Serial)")}</button>`);
        } else {
          $$renderer2.push("<!--[-1-->");
        }
        $$renderer2.push(`<!--]--> `);
        if (hasBluetooth) {
          $$renderer2.push("<!--[0-->");
          $$renderer2.push(`<button${attr("disabled", devicePeqStore.isConnecting, true)} class="flex-1 rounded border border-base-content/20 bg-base-200 px-2 py-1 text-xs text-base-content/60 transition-colors hover:bg-base-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50">${escape_html(devicePeqStore.isConnecting ? "Connecting..." : "Bluetooth")}</button>`);
        } else {
          $$renderer2.push("<!--[-1-->");
        }
        $$renderer2.push(`<!--]--> <button class="flex-1 rounded border border-base-content/20 bg-base-200 px-2 py-1 text-xs transition-colors hover:bg-base-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">Network</button></div> `);
        {
          $$renderer2.push("<!--[-1-->");
        }
        $$renderer2.push(`<!--]-->`);
      } else {
        $$renderer2.push("<!--[-1-->");
        $$renderer2.push(`<div class="flex items-center justify-between text-xs"><span class="font-medium"${attr("title", devicePeqStore.manufacturer ?? "")}>${escape_html(devicePeqStore.deviceName)}</span> <button class="rounded border border-error/40 px-2 py-0.5 text-xs text-error hover:bg-error/10">Disconnect</button></div> `);
        if (devicePeqStore.slots.length > 0) {
          $$renderer2.push("<!--[0-->");
          $$renderer2.select(
            {
              value: devicePeqStore.activeSlot ?? "",
              onchange: (e) => onSlotChange(Number(e.target.value)),
              class: "w-full rounded border border-base-content/20 bg-base-200 px-2 py-1 text-xs"
            },
            ($$renderer3) => {
              $$renderer3.push(`<!--[-->`);
              const each_array = ensure_array_like(devicePeqStore.slots);
              for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
                let slot = each_array[$$index];
                $$renderer3.option({ value: slot.id }, ($$renderer4) => {
                  $$renderer4.push(`${escape_html(slot.name)}`);
                });
              }
              $$renderer3.push(`<!--]-->`);
            }
          );
        } else {
          $$renderer2.push("<!--[-1-->");
        }
        $$renderer2.push(`<!--]--> <div class="flex gap-1"><button${attr("disabled", devicePeqStore.isReading || devicePeqStore.isWriting, true)} class="flex-1 rounded border border-base-content/20 bg-base-200 px-2 py-1 text-xs transition-colors hover:bg-base-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50">${escape_html(devicePeqStore.isReading ? "Reading..." : "Pull from Device")}</button> <button${attr("disabled", devicePeqStore.isReading || devicePeqStore.isWriting, true)} class="flex-1 rounded border border-base-content/20 bg-base-200 px-2 py-1 text-xs transition-colors hover:bg-base-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50">${escape_html(devicePeqStore.isWriting ? "Writing..." : "Push to Device")}</button></div>`);
      }
      $$renderer2.push(`<!--]--> `);
      if (devicePeqStore.statusMessage) {
        $$renderer2.push("<!--[0-->");
        $$renderer2.push(`<p class="text-xs text-base-content/60">${escape_html(devicePeqStore.statusMessage)}</p>`);
      } else {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]--></div>`);
    } else {
      $$renderer2.push("<!--[-1-->");
      $$renderer2.push(`<p class="text-xs text-base-content/60">${escape_html(equalizer_device_peq_incompatible_browser_alert())}</p>`);
    }
    $$renderer2.push(`<!--]-->`);
  });
}
function EqualizerPanel($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    new Equalizer();
    let $$settled = true;
    let $$inner_renderer;
    function $$render_inner($$renderer3) {
      $$renderer3.push(`<div class="flex gap-3 px-3 py-2 items-center bg-base-200 border-b border-base-content/20">`);
      Switch_1($$renderer3, {
        labelText: menu_item_equalizer_label(),
        size: "md",
        get checked() {
          return eqStore.isEnabled;
        },
        set checked($$value) {
          eqStore.isEnabled = $$value;
          $$settled = false;
        }
      });
      $$renderer3.push(`<!----> <div class="h-7 w-px bg-base-content/20"></div> `);
      EqPhoneSelect($$renderer3);
      $$renderer3.push(`<!----></div> <div class="flex h-full flex-col overflow-y-auto"><div class="p-3 pb-4 border-b border-base-content/20">`);
      EqFilterList($$renderer3);
      $$renderer3.push(`<!----></div> `);
      Accordion_1($$renderer3, {
        type: "multiple",
        class: "pt-1",
        children: ($$renderer4) => {
          AccordionItem($$renderer4, {
            value: "auto-eq",
            title: equalizer_auto_eq_label(),
            class: "px-1",
            children: ($$renderer5) => {
              $$renderer5.push(`<div class="flex flex-col gap-2 p-2 pt-1">`);
              EqAutoEqSelect($$renderer5);
              $$renderer5.push(`<!----> `);
              EqAutoEq($$renderer5);
              $$renderer5.push(`<!----></div>`);
            },
            $$slots: { default: true }
          });
          $$renderer4.push(`<!----> <div class="w-full h-px bg-base-content/20 my-1"></div> `);
          AccordionItem($$renderer4, {
            value: "audio-player",
            title: equalizer_player_label(),
            class: "px-1",
            children: ($$renderer5) => {
              $$renderer5.push(`<div class="p-2 pt-1">`);
              EqAudioPlayer($$renderer5);
              $$renderer5.push(`<!----></div>`);
            },
            $$slots: { default: true }
          });
          $$renderer4.push(`<!----> <div class="w-full h-px bg-base-content/20 my-1"></div> `);
          AccordionItem($$renderer4, {
            value: "device-peq",
            title: equalizer_device_peq_label(),
            class: "px-1",
            children: ($$renderer5) => {
              $$renderer5.push(`<div class="p-2 pt-1">`);
              DevicePeq($$renderer5);
              $$renderer5.push(`<!----></div>`);
            },
            $$slots: { default: true }
          });
          $$renderer4.push(`<!----> <div class="w-full h-px bg-base-content/20 mt-1"></div>`);
        },
        $$slots: { default: true }
      });
      $$renderer3.push(`<!----></div>`);
    }
    do {
      $$settled = true;
      $$inner_renderer = $$renderer2.copy();
      $$render_inner($$inner_renderer);
    } while (!$$settled);
    $$renderer2.subsume($$inner_renderer);
  });
}
function MiscPanel($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const languages = [
      { value: "en", label: "English" },
      { value: "ko", label: "한국어" }
    ];
    const enableI18n = derived(() => !!getConfigValue());
    const description = derived(() => getConfigValue());
    function handleLocaleChange(e) {
      const select = e.currentTarget;
      setLocale(select.value);
    }
    const hideDonate = derived(() => !!getConfigValue());
    const prefBoundTarget = getConfigValue() ?? "";
    $$renderer2.push(`<div class="flex h-full flex-col gap-4 overflow-y-auto p-4"><div class="flex items-center gap-3"><button${attr("title", appStore.theme === "dark" ? "Switch to light mode" : "Switch to dark mode")} class="flex h-9 w-9 items-center justify-center rounded-md border border-base-content/20 transition-colors hover:bg-base-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">`);
    if (appStore.theme === "dark") {
      $$renderer2.push("<!--[0-->");
      Moon($$renderer2, { class: "h-4 w-4", "aria-hidden": "true" });
    } else {
      $$renderer2.push("<!--[-1-->");
      Sun($$renderer2, { class: "h-4 w-4", "aria-hidden": "true" });
    }
    $$renderer2.push(`<!--]--></button> `);
    if (enableI18n()) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<span class="h-5 w-px bg-base-content/20"></span> `);
      Globe($$renderer2, { class: "h-4 w-4 ", "aria-hidden": "true" });
      $$renderer2.push(`<!----> `);
      $$renderer2.select(
        {
          value: getLocale(),
          onchange: handleLocaleChange,
          class: "h-9 flex-1 rounded-md border border-base-content/20 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
        },
        ($$renderer3) => {
          $$renderer3.push(`<!--[-->`);
          const each_array = ensure_array_like(languages);
          for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
            let lang = each_array[$$index];
            $$renderer3.option({ value: lang.value }, ($$renderer4) => {
              $$renderer4.push(`${escape_html(lang.label)}`);
            });
          }
          $$renderer3.push(`<!--]-->`);
        }
      );
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--></div> `);
    if (description() && description().length > 0) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div class="flex flex-col gap-2 text-sm"><!--[-->`);
      const each_array_1 = ensure_array_like(description());
      for (let $$index_1 = 0, $$length = each_array_1.length; $$index_1 < $$length; $$index_1++) {
        let item = each_array_1[$$index_1];
        if (item.TYPE.toUpperCase() === "TEXT") {
          $$renderer2.push("<!--[0-->");
          $$renderer2.push(`<p>${escape_html(item.CONTENT)}</p>`);
        } else if (item.TYPE.toUpperCase() === "IMAGE") {
          $$renderer2.push("<!--[1-->");
          $$renderer2.push(`<img${attr("src", item.CONTENT)} alt="" class="max-w-full rounded"/>`);
        } else if (item.TYPE.toUpperCase() === "HTML") {
          $$renderer2.push("<!--[2-->");
          $$renderer2.push(`${html(item.CONTENT)}`);
        } else {
          $$renderer2.push("<!--[-1-->");
        }
        $$renderer2.push(`<!--]-->`);
      }
      $$renderer2.push(`<!--]--></div>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> `);
    if (prefBoundTarget) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<p class="text-sm text-base-content/70">${escape_html(pref_bound_description_label())}: ${escape_html(prefBoundTarget)}</p>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> <div class="flex-1"></div> <div class="flex flex-col items-center gap-1 text-center"><div class="flex items-baseline gap-2"><h2 class="text-base font-bold text-base-content">modernGraphTool v2</h2> <span class="text-xs text-base-content/60">beta</span></div> <p class="text-xs text-base-content/60">Open-source project under the MIT license</p> <div class="flex gap-2 pt-0.5"><a href="https://github.com/potatosalad775/modernGraphTool" target="_blank" rel="noopener noreferrer" title="GitHub" class="rounded-md p-1.5 text-base-content/60 hover:bg-base-300 hover:"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4" aria-hidden="true"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path></svg></a> <a href="https://potatosalad775.github.io/modernGraphTool/docs" target="_blank" rel="noopener noreferrer" title="Documentation" class="rounded-md p-1.5 text-base-content/60 hover:bg-base-300 hover:">`);
    Book_open($$renderer2, { class: "h-4 w-4", "aria-hidden": "true" });
    $$renderer2.push(`<!----></a> `);
    if (!hideDonate()) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<a href="https://ko-fi.com/potatosalad775" target="_blank" rel="noopener noreferrer" title="Support on Ko-fi" class="rounded-md p-1.5 text-base-content/60 hover:bg-base-300 hover:">`);
      Heart($$renderer2, { class: "h-4 w-4", "aria-hidden": "true" });
      $$renderer2.push(`<!----></a>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--></div></div></div>`);
  });
}
function SponsorBanner($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let open = false;
    const configEnabled = derived(() => squiglinkStore.isEnabled && getConfigValue() !== false && !squiglinkStore.isCurrentSiteOptedOut);
    const showDialog = derived(() => configEnabled() && squiglinkStore.sponsorContent !== null);
    function dismiss() {
      open = false;
      localStorage.setItem("squiglink-sponsor-dismissed", "true");
    }
    function buildUtmUrl(baseUrl, sponsorId) {
      const separator = baseUrl.includes("?") ? "&" : "?";
      return `${baseUrl}${separator}utm_source=squiglink&utm_medium=landingpromo&utm_campaign=${sponsorId}`;
    }
    let $$settled = true;
    let $$inner_renderer;
    function $$render_inner($$renderer3) {
      if (showDialog() && squiglinkStore.sponsorContent) {
        $$renderer3.push("<!--[0-->");
        const sponsor = squiglinkStore.sponsorContent;
        if (Dialog) {
          $$renderer3.push("<!--[-->");
          Dialog($$renderer3, {
            onOpenChange: (v) => {
              if (!v) dismiss();
            },
            get open() {
              return open;
            },
            set open($$value) {
              open = $$value;
              $$settled = false;
            },
            children: ($$renderer4) => {
              if (Portal) {
                $$renderer4.push("<!--[-->");
                Portal($$renderer4, {
                  children: ($$renderer5) => {
                    if (Dialog_overlay) {
                      $$renderer5.push("<!--[-->");
                      Dialog_overlay($$renderer5, { class: "fixed inset-0 z-40 bg-black/40" });
                      $$renderer5.push("<!--]-->");
                    } else {
                      $$renderer5.push("<!--[!-->");
                      $$renderer5.push("<!--]-->");
                    }
                    $$renderer5.push(` `);
                    if (Dialog_content) {
                      $$renderer5.push("<!--[-->");
                      Dialog_content($$renderer5, {
                        class: "fixed left-1/2 top-1/2 z-50 w-11/12 max-w-md max-h-11/12 -translate-x-1/2 -translate-y-1/2\n					flex flex-col rounded-xl bg-base-200 p-6 shadow-2xl",
                        children: ($$renderer6) => {
                          if (Dialog_title) {
                            $$renderer6.push("<!--[-->");
                            Dialog_title($$renderer6, {
                              class: "text-lg font-semibold text-base-content",
                              children: ($$renderer7) => {
                                $$renderer7.push(`<!---->${escape_html(sponsor.heading)}`);
                              },
                              $$slots: { default: true }
                            });
                            $$renderer6.push("<!--]-->");
                          } else {
                            $$renderer6.push("<!--[!-->");
                            $$renderer6.push("<!--]-->");
                          }
                          $$renderer6.push(` `);
                          if (Dialog_description) {
                            $$renderer6.push("<!--[-->");
                            Dialog_description($$renderer6, {
                              class: "mt-1 text-sm text-base-content/60",
                              children: ($$renderer7) => {
                                $$renderer7.push(`<!---->${escape_html(sponsor.sponsorMessage)}`);
                              },
                              $$slots: { default: true }
                            });
                            $$renderer6.push("<!--]-->");
                          } else {
                            $$renderer6.push("<!--[!-->");
                            $$renderer6.push("<!--]-->");
                          }
                          $$renderer6.push(` `);
                          if (sponsor.creative) {
                            $$renderer6.push("<!--[0-->");
                            $$renderer6.push(`<div class="mt-4 flex flex-1 justify-center overflow-hidden rounded-lg"${attr_style("", {
                              "background-color": sponsor.creativeBgColor || "var(--color-base-300)"
                            })}><img${attr("src", sponsor.creative)}${attr("alt", sponsor.sponsorshipName)} class="object-contain"/></div>`);
                          } else {
                            $$renderer6.push("<!--[-1-->");
                          }
                          $$renderer6.push(`<!--]--> <div class="mt-3 flex flex-row gap-2">`);
                          if (sponsor.ctaLink) {
                            $$renderer6.push("<!--[0-->");
                            $$renderer6.push(`<a${attr("href", buildUtmUrl(sponsor.ctaLink, sponsor.sponsorId))} target="_blank" rel="noopener noreferrer" class="flex items-center justify-center flex-1 gap-2 h-12 rounded-lg bg-accent px-4 py-2.5 text-center text-sm font-medium text-accent-content transition-colors hover:bg-accent/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">`);
                            External_link($$renderer6, { class: "w-4 h-4" });
                            $$renderer6.push(`<!----> ${escape_html(sponsor.ctaText)}</a>`);
                          } else {
                            $$renderer6.push("<!--[-1-->");
                          }
                          $$renderer6.push(`<!--]--> `);
                          if (sponsor.cta2Link && sponsor.cta2Text) {
                            $$renderer6.push("<!--[0-->");
                            $$renderer6.push(`<a${attr("href", buildUtmUrl(sponsor.cta2Link, sponsor.sponsorId))} target="_blank" rel="noopener noreferrer" class="flex items-center justify-center flex-1 gap-2 h-12 rounded-lg border border-base-content/20 px-4 py-2.5 text-center text-sm font-medium hover:bg-base-300">`);
                            External_link($$renderer6, { class: "w-4 h-4" });
                            $$renderer6.push(`<!----> ${escape_html(sponsor.cta2Text)}</a>`);
                          } else {
                            $$renderer6.push("<!--[-1-->");
                          }
                          $$renderer6.push(`<!--]--></div> `);
                          if (Dialog_close) {
                            $$renderer6.push("<!--[-->");
                            Dialog_close($$renderer6, {
                              class: "mt-3 -mb-2 h-12 w-full text-center text-sm text-base-content/60 hover:bg-base-300 rounded-lg py-1 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-base-content/80",
                              children: ($$renderer7) => {
                                $$renderer7.push(`<!---->${escape_html(sponsor_banner_dismiss())}`);
                              },
                              $$slots: { default: true }
                            });
                            $$renderer6.push("<!--]-->");
                          } else {
                            $$renderer6.push("<!--[!-->");
                            $$renderer6.push("<!--]-->");
                          }
                        },
                        $$slots: { default: true }
                      });
                      $$renderer5.push("<!--]-->");
                    } else {
                      $$renderer5.push("<!--[!-->");
                      $$renderer5.push("<!--]-->");
                    }
                  }
                });
                $$renderer4.push("<!--]-->");
              } else {
                $$renderer4.push("<!--[!-->");
                $$renderer4.push("<!--]-->");
              }
            },
            $$slots: { default: true }
          });
          $$renderer3.push("<!--]-->");
        } else {
          $$renderer3.push("<!--[!-->");
          $$renderer3.push("<!--]-->");
        }
      } else {
        $$renderer3.push("<!--[-1-->");
      }
      $$renderer3.push(`<!--]-->`);
    }
    do {
      $$settled = true;
      $$inner_renderer = $$renderer2.copy();
      $$render_inner($$inner_renderer);
    } while (!$$settled);
    $$renderer2.subsume($$inner_renderer);
  });
}
function TutorialModal($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const STORAGE_KEY = "gt-tutorial-dismissed";
    const steps = derived(() => {
      const base2 = [
        {
          title: tutorial_modal_intro_title,
          content: tutorial_modal_intro_content,
          icon: "👋"
        },
        {
          content: tutorial_modal_menu_content,
          icon: Arrow_right_left,
          target: "menu"
        },
        {
          content: tutorial_modal_graph_handle_content,
          icon: Arrow_up_down,
          target: "graph_handle"
        }
      ];
      if (appStore.isMobile) {
        base2.push({
          title: tutorial_modal_pwa_title,
          content: tutorial_modal_pwa_content,
          extra: tutorial_modal_pwa_inst_ios,
          extra2: tutorial_modal_pwa_inst_android,
          icon: "📱"
        });
      } else {
        base2.push({
          content: tutorial_modal_divider_content,
          icon: Move_horizontal,
          target: "divider"
        });
        base2.push({
          content: tutorial_modal_shortcuts_content,
          icon: Keyboard,
          target: "keyboard"
        });
      }
      return base2;
    });
    let open = false;
    let currentStep = 0;
    let targetRect = null;
    const isFirst = derived(() => currentStep === 0);
    const isLast = derived(() => currentStep === steps().length - 1);
    const currentTarget = derived(() => steps()[currentStep]?.target ?? null);
    const hasSpotlight = derived(() => currentTarget() !== null && targetRect !== null);
    const spotlightStyle = derived(() => {
      return "";
    });
    const dialogStyle = derived(() => {
      if (!hasSpotlight() || !targetRect) {
        return "top:50%;left:50%;transform:translate(-50%,-50%);";
      }
    });
    function dismiss() {
      open = false;
      currentStep = 0;
      localStorage.setItem(STORAGE_KEY, "true");
    }
    function next2() {
      if (isLast()) dismiss();
      else currentStep++;
    }
    function prev2() {
      if (!isFirst()) currentStep--;
    }
    let $$settled = true;
    let $$inner_renderer;
    function $$render_inner($$renderer3) {
      if (Dialog) {
        $$renderer3.push("<!--[-->");
        Dialog($$renderer3, {
          onOpenChange: (v) => {
            if (!v) dismiss();
          },
          get open() {
            return open;
          },
          set open($$value) {
            open = $$value;
            $$settled = false;
          },
          children: ($$renderer4) => {
            if (Portal) {
              $$renderer4.push("<!--[-->");
              Portal($$renderer4, {
                children: ($$renderer5) => {
                  if (Dialog_overlay) {
                    $$renderer5.push("<!--[-->");
                    Dialog_overlay($$renderer5, {
                      class: `fixed inset-0 z-40 transition-colors duration-300 ${stringify(hasSpotlight() ? "" : "bg-black/50 backdrop-blur-sm")}`
                    });
                    $$renderer5.push("<!--]-->");
                  } else {
                    $$renderer5.push("<!--[!-->");
                    $$renderer5.push("<!--]-->");
                  }
                  $$renderer5.push(` `);
                  if (hasSpotlight()) {
                    $$renderer5.push("<!--[0-->");
                    $$renderer5.push(`<div aria-hidden="true" class="pointer-events-none fixed z-40 rounded-lg border-2 border-accent transition-all duration-300 ease-out"${attr_style(spotlightStyle())}></div>`);
                  } else {
                    $$renderer5.push("<!--[-1-->");
                  }
                  $$renderer5.push(`<!--]--> `);
                  if (Dialog_content) {
                    $$renderer5.push("<!--[-->");
                    Dialog_content($$renderer5, {
                      class: "fixed z-50 w-[calc(100%-2rem)] max-w-sm rounded-xl bg-base-200 shadow-2xl transition-[top,bottom,left,transform] duration-300 ease-out",
                      style: dialogStyle(),
                      children: ($$renderer6) => {
                        $$renderer6.push(`<div class="px-6 pt-6 pb-4"><div class="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-lg">`);
                        if (typeof steps()[currentStep].icon === "string") {
                          $$renderer6.push("<!--[0-->");
                          $$renderer6.push(`${escape_html(steps()[currentStep].icon)}`);
                        } else {
                          $$renderer6.push("<!--[-1-->");
                          const IconComponent = steps()[currentStep].icon;
                          if (IconComponent) {
                            $$renderer6.push("<!--[-->");
                            IconComponent($$renderer6, { size: 20 });
                            $$renderer6.push("<!--]-->");
                          } else {
                            $$renderer6.push("<!--[!-->");
                            $$renderer6.push("<!--]-->");
                          }
                        }
                        $$renderer6.push(`<!--]--></div> `);
                        if (steps()[currentStep].title) {
                          $$renderer6.push("<!--[0-->");
                          if (Dialog_title) {
                            $$renderer6.push("<!--[-->");
                            Dialog_title($$renderer6, {
                              class: "text-base font-semibold text-base-content",
                              children: ($$renderer7) => {
                                $$renderer7.push(`<!---->${escape_html(steps()[currentStep].title?.())}`);
                              },
                              $$slots: { default: true }
                            });
                            $$renderer6.push("<!--]-->");
                          } else {
                            $$renderer6.push("<!--[!-->");
                            $$renderer6.push("<!--]-->");
                          }
                        } else {
                          $$renderer6.push("<!--[-1-->");
                          if (Dialog_title) {
                            $$renderer6.push("<!--[-->");
                            Dialog_title($$renderer6, {
                              class: "sr-only",
                              children: ($$renderer7) => {
                                $$renderer7.push(`<!---->Tutorial step ${escape_html(currentStep + 1)}`);
                              },
                              $$slots: { default: true }
                            });
                            $$renderer6.push("<!--]-->");
                          } else {
                            $$renderer6.push("<!--[!-->");
                            $$renderer6.push("<!--]-->");
                          }
                        }
                        $$renderer6.push(`<!--]--> `);
                        if (Dialog_description) {
                          $$renderer6.push("<!--[-->");
                          Dialog_description($$renderer6, {
                            class: "mt-1.5 text-sm leading-relaxed text-base-content/70",
                            children: ($$renderer7) => {
                              $$renderer7.push(`<!---->${escape_html(steps()[currentStep].content())}`);
                            },
                            $$slots: { default: true }
                          });
                          $$renderer6.push("<!--]-->");
                        } else {
                          $$renderer6.push("<!--[!-->");
                          $$renderer6.push("<!--]-->");
                        }
                        $$renderer6.push(` `);
                        if (steps()[currentStep].extra) {
                          $$renderer6.push("<!--[0-->");
                          $$renderer6.push(`<div class="mt-3 space-y-1.5 text-xs text-base-content/55"><p>${escape_html(steps()[currentStep].extra?.())}</p> `);
                          if (steps()[currentStep].extra2) {
                            $$renderer6.push("<!--[0-->");
                            $$renderer6.push(`<p>${escape_html(steps()[currentStep].extra2?.())}</p>`);
                          } else {
                            $$renderer6.push("<!--[-1-->");
                          }
                          $$renderer6.push(`<!--]--></div>`);
                        } else {
                          $$renderer6.push("<!--[-1-->");
                        }
                        $$renderer6.push(`<!--]--></div> <div class="flex items-center justify-between border-t border-base-content/10 px-6 py-3"><div class="flex gap-1.5"><!--[-->`);
                        const each_array = ensure_array_like(steps());
                        for (let i = 0, $$length = each_array.length; i < $$length; i++) {
                          each_array[i];
                          $$renderer6.push(`<button type="button"${attr_class(`h-1.5 rounded-full transition-all ${stringify(i === currentStep ? "w-4 bg-accent" : "w-1.5 bg-base-content/20 hover:bg-base-content/35")}`)}${attr("aria-label", `Go to step ${stringify(i + 1)}`)}></button>`);
                        }
                        $$renderer6.push(`<!--]--></div> <div class="flex items-center gap-2">`);
                        if (!isLast()) {
                          $$renderer6.push("<!--[0-->");
                          Button_1($$renderer6, {
                            title: tutorial_modal_btn_skip(),
                            variant: "ghost",
                            size: "sm",
                            class: "text-base-content/50 hover:text-base-content/70",
                            onclick: dismiss,
                            children: ($$renderer7) => {
                              $$renderer7.push(`<!---->${escape_html(tutorial_modal_btn_skip())}`);
                            },
                            $$slots: { default: true }
                          });
                        } else {
                          $$renderer6.push("<!--[-1-->");
                        }
                        $$renderer6.push(`<!--]--> `);
                        if (!isFirst()) {
                          $$renderer6.push("<!--[0-->");
                          Button_1($$renderer6, {
                            title: tutorial_modal_btn_prev(),
                            onclick: prev2,
                            variant: "ghost",
                            size: "sm",
                            children: ($$renderer7) => {
                              $$renderer7.push(`<!---->${escape_html(tutorial_modal_btn_prev())}`);
                            },
                            $$slots: { default: true }
                          });
                        } else {
                          $$renderer6.push("<!--[-1-->");
                        }
                        $$renderer6.push(`<!--]--> `);
                        Button_1($$renderer6, {
                          title: isLast() ? tutorial_modal_btn_done() : tutorial_modal_btn_next(),
                          onclick: next2,
                          variant: "primary",
                          size: "sm",
                          children: ($$renderer7) => {
                            $$renderer7.push(`<!---->${escape_html(isLast() ? tutorial_modal_btn_done() : tutorial_modal_btn_next())}`);
                          },
                          $$slots: { default: true }
                        });
                        $$renderer6.push(`<!----></div></div>`);
                      },
                      $$slots: { default: true }
                    });
                    $$renderer5.push("<!--]-->");
                  } else {
                    $$renderer5.push("<!--[!-->");
                    $$renderer5.push("<!--]-->");
                  }
                }
              });
              $$renderer4.push("<!--]-->");
            } else {
              $$renderer4.push("<!--[!-->");
              $$renderer4.push("<!--]-->");
            }
          },
          $$slots: { default: true }
        });
        $$renderer3.push("<!--]-->");
      } else {
        $$renderer3.push("<!--[!-->");
        $$renderer3.push("<!--]-->");
      }
    }
    do {
      $$settled = true;
      $$inner_renderer = $$renderer2.copy();
      $$render_inner($$inner_renderer);
    } while (!$$settled);
    $$renderer2.subsume($$inner_renderer);
  });
}
function FrequencyTutorial($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const FREQ_RANGES = [
      { key: "sub_bass", range: [20, 60] },
      { key: "bass", range: [60, 250] },
      { key: "lower_mids", range: [250, 1e3] },
      { key: "upper_mids", range: [1e3, 4e3] },
      { key: "presence", range: [4e3, 6e3] },
      { key: "brilliance", range: [6e3, 2e4] }
    ];
    function getRangeName(key) {
      const names = {
        sub_bass: tutorial_freq_sub_bass_name,
        bass: tutorial_freq_bass_name,
        lower_mids: tutorial_freq_lower_mids_name,
        upper_mids: tutorial_freq_upper_mids_name,
        presence: tutorial_freq_presence_name,
        brilliance: tutorial_freq_brilliance_name
      };
      return names[key]?.() ?? key;
    }
    function getRangeDesc(key) {
      const descs = {
        sub_bass: tutorial_freq_sub_bass_desc,
        bass: tutorial_freq_bass_desc,
        lower_mids: tutorial_freq_lower_mids_desc,
        upper_mids: tutorial_freq_upper_mids_desc,
        presence: tutorial_freq_presence_desc,
        brilliance: tutorial_freq_brilliance_desc
      };
      return descs[key]?.() ?? "";
    }
    let activeKey = null;
    function toggleRange(key) {
      activeKey = activeKey === key ? null : key;
    }
    $$renderer2.push(`<div class="flex flex-col">`);
    ScrollArea_1($$renderer2, {
      orientation: "horizontal",
      type: "always",
      viewportClasses: "flex gap-2 w-full",
      children: ($$renderer3) => {
        $$renderer3.push(`<div class="flex gap-1.5 px-3 py-2 justify-center"><!--[-->`);
        const each_array = ensure_array_like(FREQ_RANGES);
        for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
          let { key } = each_array[$$index];
          Button_1($$renderer3, {
            title: getRangeName(key),
            onclick: () => toggleRange(key),
            variant: activeKey === key ? "primary" : "outline",
            size: "sm",
            class: "whitespace-nowrap line-clamp-1",
            children: ($$renderer4) => {
              $$renderer4.push(`<!---->${escape_html(getRangeName(key))}`);
            },
            $$slots: { default: true }
          });
        }
        $$renderer3.push(`<!--]--></div>`);
      },
      $$slots: { default: true }
    });
    $$renderer2.push(`<!----> `);
    if (activeKey !== null) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<span class="flex justify-center rounded-md bg-base-300 px-3 py-2 text-xs">${escape_html(getRangeDesc(activeKey))}</span>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--></div>`);
  });
}
function KeyboardShortcutBar($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let modKey = derived(() => "Ctrl+");
    $$renderer2.push(`<div data-tutorial-target="keyboard" class="mt-auto flex flex-wrap items-center gap-x-4 gap-y-0.5 border-t border-base-content/20 bg-base-200 px-3 py-2 text-xs text-base-content/85 select-none"><span${attr_class("inline-flex items-center gap-1.5 transition-opacity", void 0, { "opacity-30": !commandHistory.canUndo })}><kbd>${escape_html(modKey())}+Z</kbd> ${escape_html(keyboard_shortcut_undo())}</span> <span${attr_class("inline-flex items-center gap-1.5 transition-opacity", void 0, { "opacity-30": !commandHistory.canRedo })}><kbd>${escape_html(modKey())}+${escape_html("Shift+")}+Z</kbd> ${escape_html(keyboard_shortcut_redo())}</span> <span class="inline-flex items-center gap-1.5"><kbd>1</kbd>–<kbd>4</kbd> ${escape_html(keyboard_shortcut_panels())}</span> `);
    if (menuStore.currentPanel === "equalizer") {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<span class="inline-flex items-center gap-1.5"><kbd>${escape_html("Shift")}+Drag</kbd> ${escape_html(keyboard_shortcut_axis_lock())}</span>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--></div>`);
  });
}
function AppShell($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let gridCols = "minmax(400px, 65%) 5px minmax(340px, 1fr)";
    $$renderer2.push(`<div class="flex flex-col h-full">`);
    TopNavBar($$renderer2);
    $$renderer2.push(`<!----> `);
    if (
      // Auto-update URL when store data changes (phones added/removed, graph state, etc.)
      // Subscribe to reactive dependencies
      /* track all FR data mutations */
      appStore.isMobile
    ) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<main class="flex flex-1 flex-col overflow-hidden bg-base-100 text-base-content"><section aria-label="Frequency response graph" class="flex flex-col overflow-hidden"><div class="min-h-0 overflow-hidden border-b border-base-content/15">`);
      GraphContainer($$renderer2);
      $$renderer2.push(`<!----></div> <div class="bg-base-200 border-b border-base-content/15">`);
      FrequencyTutorial($$renderer2);
      $$renderer2.push(`<!----></div></section> <section aria-label="Controls" class="flex min-h-0 flex-1 flex-col overflow-hidden border-base-content/15"><div class="relative min-h-0 flex-1 overflow-hidden"><!---->`);
      {
        $$renderer2.push(`<div class="absolute inset-0 flex flex-col overflow-hidden">`);
        if (menuStore.currentPanel === "device") {
          $$renderer2.push("<!--[0-->");
          DevicePanel($$renderer2);
        } else if (menuStore.currentPanel === "graph") {
          $$renderer2.push("<!--[1-->");
          GraphPanel($$renderer2);
        } else if (menuStore.currentPanel === "equalizer") {
          $$renderer2.push("<!--[2-->");
          EqualizerPanel($$renderer2);
        } else {
          $$renderer2.push("<!--[-1-->");
          MiscPanel($$renderer2);
        }
        $$renderer2.push(`<!--]--></div>`);
      }
      $$renderer2.push(`<!----></div> `);
      MenuCarousel($$renderer2);
      $$renderer2.push(`<!----></section></main>`);
    } else {
      $$renderer2.push("<!--[-1-->");
      $$renderer2.push(`<main class="grid flex-1 overflow-hidden"${attr_style("", { "grid-template-columns": gridCols })}><section aria-label="Frequency response graph" class="flex flex-col overflow-hidden bg-base-100"><div class="min-h-0 overflow-hidden border-b border-base-content/15">`);
      GraphContainer($$renderer2);
      $$renderer2.push(`<!----></div> <div class="bg-base-200 border-b border-base-content/15">`);
      FrequencyTutorial($$renderer2);
      $$renderer2.push(`<!----></div> `);
      GraphToolbar($$renderer2);
      $$renderer2.push(`<!----> `);
      KeyboardShortcutBar($$renderer2);
      $$renderer2.push(`<!----></section> `);
      DragDivider($$renderer2);
      $$renderer2.push(`<!----> <section aria-label="Controls" class="flex min-w-85 flex-col overflow-hidden bg-base-100">`);
      MenuCarousel($$renderer2);
      $$renderer2.push(`<!----> <div class="relative min-h-0 flex-1 overflow-hidden"><!---->`);
      {
        $$renderer2.push(`<div class="absolute inset-0">`);
        if (menuStore.currentPanel === "device") {
          $$renderer2.push("<!--[0-->");
          DevicePanel($$renderer2);
        } else if (menuStore.currentPanel === "graph") {
          $$renderer2.push("<!--[1-->");
          GraphPanel($$renderer2);
        } else if (menuStore.currentPanel === "equalizer") {
          $$renderer2.push("<!--[2-->");
          EqualizerPanel($$renderer2);
        } else {
          $$renderer2.push("<!--[-1-->");
          MiscPanel($$renderer2);
        }
        $$renderer2.push(`<!--]--></div>`);
      }
      $$renderer2.push(`<!----></div></section></main>`);
    }
    $$renderer2.push(`<!--]--></div> `);
    Toaster($$renderer2, {
      position: "top-center",
      richColors: true,
      closeButton: true,
      theme: appStore.theme
    });
    $$renderer2.push(`<!----> `);
    SponsorBanner($$renderer2);
    $$renderer2.push(`<!----> `);
    TutorialModal($$renderer2);
    $$renderer2.push(`<!---->`);
  });
}
function _page($$renderer) {
  AppShell($$renderer);
}
export {
  _page as default
};
