// ============================================================
// DummyData.ts — Mock file tree for @ether (player = repository)
// ============================================================

export interface FileEntry {
  name: string;
  isDirectory: boolean;
  modified: string;
  children?: TreeEntry[];
  content?: string;
  access?: 'public' | 'local' | 'private' | 'npc' | 'player' | 'everyone';
  encrypted?: boolean;
}

export interface CompoundEntry {
  op: '&' | '|';
  entries: TreeEntry[];
}

export type TreeEntry = FileEntry | CompoundEntry;

export function isCompound(entry: TreeEntry): entry is CompoundEntry {
  return 'op' in entry;
}

export function flattenEntries(tree: TreeEntry[]): FileEntry[] {
  const result: FileEntry[] = [];
  for (const entry of tree) {
    if (isCompound(entry)) {
      result.push(...flattenEntries(entry.entries));
    } else {
      result.push(entry);
    }
  }
  return result;
}

export interface Repository {
  user: string;
  description: string;
  tree: TreeEntry[];
}

// ---- Pull Request types ----

export type PRStatus = 'open' | 'closed' | 'merged';

export interface FileDiff {
  path: string;
  oldContent: string;
  newContent: string;
  type: 'added' | 'modified' | 'deleted';
}

export interface PRCommit {
  id: string;
  message: string;
  author: string;
  createdAt: string;
  diffs: FileDiff[];
}

export interface PRComment {
  id: number;
  author: string;
  body: string;
  createdAt: string;
}

export type ActivityItem =
  | { type: 'commit'; commit: PRCommit; createdAt: string }
  | { type: 'comment'; comment: PRComment; createdAt: string }
  | { type: 'status_change'; from: PRStatus; to: PRStatus; author: string; createdAt: string }
  | { type: 'merge'; author: string; createdAt: string };

export interface PullRequest {
  id: number;
  title: string;
  description: string;
  status: PRStatus;
  author: string;
  createdAt: string;
  updatedAt: string;
  sourceVersion: string;
  targetVersion: string;
  sourceLabel: string;
  targetLabel: string;
  commits: PRCommit[];
  comments: PRComment[];
  activity: ActivityItem[];
  mergeable: boolean;
}

// ---- Usage.ray index.ray.js — self-contained usage UI for sandbox iframe ----


// ---- Usage.ray index.ray.js — self-contained usage UI for sandbox iframe ----

const USAGE_RAY_JS = `document.body.style.background = '#0a0a0a';
document.body.style.color = '#fff';
document.body.style.margin = '0';
document.body.style.fontFamily = "'Courier New', Courier, monospace";

window.addEventListener('ether:ready', async function() {

var PHOSPHOR = '#ffffff';
var FREE_CREDITS_EUR = 0.50;
var EXTRA_CREDITS_EUR = 0;
var TOTAL_CREDITS_EUR = FREE_CREDITS_EUR + EXTRA_CREDITS_EUR;
var EUR_TO_USD = 1 / 0.92;

var ARROW_LEFT_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M512 320L128 320M128 320L288 160M128 320L288 480" fill="none" stroke="currentColor" stroke-width="48" stroke-linecap="round" stroke-linejoin="round"/></svg>';
var INFINITY_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M480 200c-66.3 0-120 53.7-120 120 0 0-40-120-120-120S120 253.7 120 320s53.7 120 120 120c80 0 120-120 120-120s53.7 120 120 120 120-53.7 120-120-53.7-120-120-120zM240 392c-39.8 0-72-32.2-72-72s32.2-72 72-72c39.8 0 72 72 72 72s-32.2 72-72 72zm240 0c-39.8 0-72-72-72-72s32.2-72 72-72c39.8 0 72 32.2 72 72s-32.2 72-72 72z" fill="currentColor"/></svg>';
var AWS_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M220 340l-36 108h-2l-36-108h-34l52 148h38l52-148h-34zm130 0v28c-16-22-36-32-62-32-26 0-48 10-66 30s-26 44-26 74 8 54 26 74 40 30 66 30c26 0 46-10 62-32v28h32V340h-32zm-54 176c-18 0-34-8-46-22s-18-34-18-56 6-42 18-56 28-22 46-22 34 8 46 22 18 34 18 56-6 42-18 56-28 22-46 22zm174-10c-10 0-20-4-28-10s-12-16-12-28h-32c0 22 8 40 24 52s34 20 52 20c22 0 40-6 52-18s20-28 20-46c0-30-20-50-58-62l-20-6c-24-8-36-18-36-32 0-10 4-18 12-24s18-10 28-10c12 0 22 4 30 10s12 16 12 26h32c0-20-8-36-22-48s-32-18-52-18c-22 0-38 6-50 18s-20 26-20 44c0 30 20 50 58 62l20 6c24 8 36 20 36 34 0 10-4 20-12 26s-20 10-34 10z" fill="currentColor"/></svg>';
var AZURE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M248 96L128 352l80 16L112 544h72l248-280h-136L392 96H248z" fill="currentColor"/></svg>';
var GCLOUD_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M432 288h64c0-97-79-176-176-176-73 0-136 45-162 108l56 56c10-44 50-76 96-76 53 0 96 43 96 96h-64l80 80 80-80h-70zm-224 64h-64c0 97 79 176 176 176 73 0 136-45 162-108l-56-56c-10 44-50 76-96 76-53 0-96-43-96-96h64l-80-80-80 80h70z" fill="currentColor"/></svg>';
var STORAGE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M128 128h384v96H128zm0 144h384v96H128zm0 144h384v96H128zM176 176c-13.3 0-24 10.7-24 24s10.7 24 24 24 24-10.7 24-24-10.7-24-24-24zm0 144c-13.3 0-24 10.7-24 24s10.7 24 24 24 24-10.7 24-24-10.7-24-24-24zm0 144c-13.3 0-24 10.7-24 24s10.7 24 24 24 24-10.7 24-24-10.7-24-24-24z" fill="currentColor"/></svg>';
var NETWORK_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M320 96c-123.7 0-224 100.3-224 224s100.3 224 224 224 224-100.3 224-224S443.7 96 320 96zm0 400c-97.2 0-176-78.8-176-176S222.8 144 320 144s176 78.8 176 176-78.8 176-176 176zm-160-192h320v32H160v-32zm144-128v384h32V176h-32z" fill="currentColor"/></svg>';
var DISK_READ_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M128 96h384c17.7 0 32 14.3 32 32v384c0 17.7-14.3 32-32 32H128c-17.7 0-32-14.3-32-32V128c0-17.7 14.3-32 32-32zm192 352l96-96H368V224h-96v128H224l96 96z" fill="currentColor"/></svg>';
var DISK_WRITE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M128 96h384c17.7 0 32 14.3 32 32v384c0 17.7-14.3 32-32 32H128c-17.7 0-32-14.3-32-32V128c0-17.7 14.3-32 32-32zm192 64l-96 96h48v128h96V256h48L320 160z" fill="currentColor"/></svg>';
var SEARCH_INDEX_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M416 352c26.5-38.5 42-85.2 42-136C458 121.7 378.3 42 280 42S102 121.7 102 216s79.7 174 178 174c50.8 0 97.5-15.5 136-42l142 142 34-34-176-104zM280 342c-69.6 0-126-56.4-126-126S210.4 90 280 90s126 56.4 126 126-56.4 126-126 126z" fill="currentColor"/></svg>';
var FILE_VIEWER_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M384 64H192c-35.3 0-64 28.7-64 64v384c0 35.3 28.7 64 64 64h256c35.3 0 64-28.7 64-64V192L384 64zm0 64l128 128H384V128zM224 288h192v32H224v-32zm0 64h192v32H224v-32zm0 64h128v32H224v-32z" fill="currentColor"/></svg>';
var CLONE_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M352 512L128 512L128 288L176 288L176 224L128 224C92.7 224 64 252.7 64 288L64 512C64 547.3 92.7 576 128 576L352 576C387.3 576 416 547.3 416 512L416 464L352 464L352 512zM288 416L512 416C547.3 416 576 387.3 576 352L576 128C576 92.7 547.3 64 512 64L288 64C252.7 64 224 92.7 224 128L224 352C224 387.3 252.7 416 288 416z" fill="currentColor"/></svg>';
var CHEVRON_RIGHT_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M240 128l192 192-192 192" fill="none" stroke="currentColor" stroke-width="48" stroke-linecap="round" stroke-linejoin="round"/></svg>';
var CHEVRON_DOWN_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M128 240l192 192 192-192" fill="none" stroke="currentColor" stroke-width="48" stroke-linecap="round" stroke-linejoin="round"/></svg>';
var FOLDER_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M128 128c-35.3 0-64 28.7-64 64v256c0 35.3 28.7 64 64 64h384c35.3 0 64-28.7 64-64V240c0-35.3-28.7-64-64-64H336l-48-48H128z" fill="currentColor"/></svg>';
var CHART_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M128 512V128h32v352h352v32H128zm64-64V288h48v160h-48zm80 0V208h48v240h-48zm80 0V256h48v192h-48zm80 0V176h48v272h-48z" fill="currentColor"/></svg>';
var INFO_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M320 64C178.6 64 64 178.6 64 320s114.6 256 256 256 256-114.6 256-256S461.4 64 320 64zm16 384h-32V288h32v160zm0-192h-32v-32h32v32z" fill="currentColor"/></svg>';

var CURRENCIES = [
  { code: 'USD', symbol: '$', name: 'US Dollar', rate: 1 },
  { code: 'EUR', symbol: '\\u20AC', name: 'Euro', rate: 0.92 },
  { code: 'GBP', symbol: '\\u00A3', name: 'British Pound', rate: 0.79 },
  { code: 'JPY', symbol: '\\u00A5', name: 'Japanese Yen', rate: 149.5 },
  { code: 'CNY', symbol: '\\u00A5', name: 'Chinese Yuan', rate: 7.24 },
  { code: 'KRW', symbol: '\\u20A9', name: 'South Korean Won', rate: 1320.5 },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar', rate: 1.36 },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', rate: 1.53 },
  { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc', rate: 0.88 },
  { code: 'INR', symbol: '\\u20B9', name: 'Indian Rupee', rate: 83.1 },
  { code: 'BRL', symbol: 'R$', name: 'Brazilian Real', rate: 4.97 },
  { code: 'MXN', symbol: 'MX$', name: 'Mexican Peso', rate: 17.15 },
  { code: 'SEK', symbol: 'kr', name: 'Swedish Krona', rate: 10.45 },
  { code: 'NOK', symbol: 'kr', name: 'Norwegian Krone', rate: 10.62 },
  { code: 'PLN', symbol: 'z\\u0142', name: 'Polish Zloty', rate: 4.02 },
  { code: 'TRY', symbol: '\\u20BA', name: 'Turkish Lira', rate: 30.25 },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar', rate: 1.34 },
  { code: 'BTC', symbol: '\\u20BF', name: 'Bitcoin', rate: 0.0000105 },
  { code: 'ETH', symbol: '\\u039E', name: 'Ethereum', rate: 0.000312 },
  { code: 'RUB', symbol: '\\u20BD', name: 'Russian Ruble', rate: 92.5 }
];

function createProviders() {
  return [
    { id: 'aws', name: 'AWS S3', icon: AWS_SVG, enabled: true, selectedRegion: 'us-east-1', regions: [
      { id: 'us-east-1', name: 'US East (N. Virginia)', storagePricePerGBMonth: 0.023, putPer1000: 0.005, getPer1000: 0.0004, listPer1000: 0.005, deletePer1000: 0, egressPerGB: 0.09, ingressPerGB: 0 },
      { id: 'us-west-2', name: 'US West (Oregon)', storagePricePerGBMonth: 0.023, putPer1000: 0.005, getPer1000: 0.0004, listPer1000: 0.005, deletePer1000: 0, egressPerGB: 0.09, ingressPerGB: 0 },
      { id: 'eu-west-1', name: 'EU (Ireland)', storagePricePerGBMonth: 0.023, putPer1000: 0.005, getPer1000: 0.0004, listPer1000: 0.005, deletePer1000: 0, egressPerGB: 0.09, ingressPerGB: 0 },
      { id: 'eu-central-1', name: 'EU (Frankfurt)', storagePricePerGBMonth: 0.0245, putPer1000: 0.0054, getPer1000: 0.00043, listPer1000: 0.0054, deletePer1000: 0, egressPerGB: 0.09, ingressPerGB: 0 },
      { id: 'ap-southeast-1', name: 'Asia Pacific (Singapore)', storagePricePerGBMonth: 0.025, putPer1000: 0.005, getPer1000: 0.0004, listPer1000: 0.005, deletePer1000: 0, egressPerGB: 0.12, ingressPerGB: 0 },
      { id: 'ap-northeast-1', name: 'Asia Pacific (Tokyo)', storagePricePerGBMonth: 0.025, putPer1000: 0.0047, getPer1000: 0.00037, listPer1000: 0.0047, deletePer1000: 0, egressPerGB: 0.114, ingressPerGB: 0 },
      { id: 'sa-east-1', name: 'South America (S\\u00E3o Paulo)', storagePricePerGBMonth: 0.0405, putPer1000: 0.007, getPer1000: 0.0006, listPer1000: 0.007, deletePer1000: 0, egressPerGB: 0.15, ingressPerGB: 0 }
    ] },
    { id: 'azure', name: 'Azure Blob', icon: AZURE_SVG, enabled: true, selectedRegion: 'eastus', regions: [
      { id: 'eastus', name: 'East US', storagePricePerGBMonth: 0.018, putPer1000: 0.005, getPer1000: 0.0004, listPer1000: 0.005, deletePer1000: 0, egressPerGB: 0.087, ingressPerGB: 0 },
      { id: 'westus2', name: 'West US 2', storagePricePerGBMonth: 0.018, putPer1000: 0.005, getPer1000: 0.0004, listPer1000: 0.005, deletePer1000: 0, egressPerGB: 0.087, ingressPerGB: 0 },
      { id: 'westeurope', name: 'West Europe', storagePricePerGBMonth: 0.02, putPer1000: 0.005, getPer1000: 0.0004, listPer1000: 0.005, deletePer1000: 0, egressPerGB: 0.087, ingressPerGB: 0 },
      { id: 'northeurope', name: 'North Europe', storagePricePerGBMonth: 0.018, putPer1000: 0.005, getPer1000: 0.0004, listPer1000: 0.005, deletePer1000: 0, egressPerGB: 0.087, ingressPerGB: 0 },
      { id: 'southeastasia', name: 'Southeast Asia', storagePricePerGBMonth: 0.02, putPer1000: 0.005, getPer1000: 0.0004, listPer1000: 0.005, deletePer1000: 0, egressPerGB: 0.12, ingressPerGB: 0 },
      { id: 'japaneast', name: 'Japan East', storagePricePerGBMonth: 0.022, putPer1000: 0.005, getPer1000: 0.0004, listPer1000: 0.005, deletePer1000: 0, egressPerGB: 0.12, ingressPerGB: 0 },
      { id: 'brazilsouth', name: 'Brazil South', storagePricePerGBMonth: 0.035, putPer1000: 0.008, getPer1000: 0.0006, listPer1000: 0.008, deletePer1000: 0, egressPerGB: 0.16, ingressPerGB: 0 }
    ] },
    { id: 'gcloud', name: 'Google Cloud', icon: GCLOUD_SVG, enabled: true, selectedRegion: 'us-central1', gcRegionType: 'single', regions: [
      { id: 'us-central1', name: 'Iowa (Single)', storagePricePerGBMonth: 0.02, putPer1000: 0.005, getPer1000: 0.0004, listPer1000: 0.005, deletePer1000: 0, egressPerGB: 0.12, ingressPerGB: 0 },
      { id: 'us-east1', name: 'S. Carolina (Single)', storagePricePerGBMonth: 0.02, putPer1000: 0.005, getPer1000: 0.0004, listPer1000: 0.005, deletePer1000: 0, egressPerGB: 0.12, ingressPerGB: 0 },
      { id: 'europe-west1', name: 'Belgium (Single)', storagePricePerGBMonth: 0.02, putPer1000: 0.005, getPer1000: 0.0004, listPer1000: 0.005, deletePer1000: 0, egressPerGB: 0.12, ingressPerGB: 0 },
      { id: 'asia-east1', name: 'Taiwan (Single)', storagePricePerGBMonth: 0.02, putPer1000: 0.005, getPer1000: 0.0004, listPer1000: 0.005, deletePer1000: 0, egressPerGB: 0.12, ingressPerGB: 0 },
      { id: 'nam4', name: 'Iowa+S.Carolina (Dual)', storagePricePerGBMonth: 0.036, putPer1000: 0.01, getPer1000: 0.0004, listPer1000: 0.01, deletePer1000: 0, egressPerGB: 0.12, ingressPerGB: 0 },
      { id: 'eur4', name: 'Finland+Netherlands (Dual)', storagePricePerGBMonth: 0.036, putPer1000: 0.01, getPer1000: 0.0004, listPer1000: 0.01, deletePer1000: 0, egressPerGB: 0.12, ingressPerGB: 0 },
      { id: 'us', name: 'US (Multi)', storagePricePerGBMonth: 0.026, putPer1000: 0.005, getPer1000: 0.0004, listPer1000: 0.005, deletePer1000: 0, egressPerGB: 0.12, ingressPerGB: 0 },
      { id: 'eu', name: 'EU (Multi)', storagePricePerGBMonth: 0.026, putPer1000: 0.005, getPer1000: 0.0004, listPer1000: 0.005, deletePer1000: 0, egressPerGB: 0.12, ingressPerGB: 0 },
      { id: 'asia', name: 'Asia (Multi)', storagePricePerGBMonth: 0.026, putPer1000: 0.005, getPer1000: 0.0004, listPer1000: 0.005, deletePer1000: 0, egressPerGB: 0.12, ingressPerGB: 0 }
    ] }
  ];
}

function gcFilterRegions(regions, type) {
  if (type === 'single') return regions.filter(function(r) { return r.name.indexOf('(Single)') >= 0; });
  if (type === 'dual') return regions.filter(function(r) { return r.name.indexOf('(Dual)') >= 0; });
  return regions.filter(function(r) { return r.name.indexOf('(Multi)') >= 0; });
}

var defaultState = {
  billingPeriod: 'monthly',
  currencyCode: 'EUR',
  storageAllocationPct: 80,
  providers: null,
  currentMonth: new Date().getMonth(),
  currentYear: new Date().getFullYear()
};

var state = {};
var currentTab = 'usage';
var navExpanded = false;
var locationOpen = false;
var showHistory = false;
var currencyDropdownOpen = false;
var currencySearch = '';
var expandedOps = {};
var isDragging = false;
var activeTooltip = null;

var root = document.createElement('div');
root.id = 'st-root';
document.body.appendChild(root);

async function loadState() {
  var saved = null;
  try {
    var raw = await ether.storage.get('usage-state');
    if (raw) saved = JSON.parse(raw);
  } catch(e) {}
  state = {};
  var keys = Object.keys(defaultState);
  for (var i = 0; i < keys.length; i++) {
    state[keys[i]] = (saved && saved[keys[i]] !== undefined && saved[keys[i]] !== null) ? saved[keys[i]] : defaultState[keys[i]];
  }
  var fresh = createProviders();
  if (saved && saved.providers && Array.isArray(saved.providers)) {
    for (var p = 0; p < fresh.length; p++) {
      for (var s = 0; s < saved.providers.length; s++) {
        if (fresh[p].id === saved.providers[s].id) {
          if (saved.providers[s].enabled !== undefined) fresh[p].enabled = saved.providers[s].enabled;
          if (saved.providers[s].selectedRegion) fresh[p].selectedRegion = saved.providers[s].selectedRegion;
          if (saved.providers[s].gcRegionType) fresh[p].gcRegionType = saved.providers[s].gcRegionType;
        }
      }
    }
  }
  state.providers = fresh;
}

function saveState() {
  var toSave = {
    billingPeriod: state.billingPeriod,
    currencyCode: state.currencyCode,
    storageAllocationPct: state.storageAllocationPct,
    currentMonth: state.currentMonth,
    currentYear: state.currentYear,
    providers: state.providers.map(function(p) {
      var o = { id: p.id, enabled: p.enabled, selectedRegion: p.selectedRegion };
      if (p.gcRegionType) o.gcRegionType = p.gcRegionType;
      return o;
    })
  };
  try { ether.storage.set('usage-state', JSON.stringify(toSave)); } catch(e) {}
}

function getCurrency() {
  return CURRENCIES.find(function(c) { return c.code === state.currencyCode; }) || CURRENCIES[0];
}

function periodMultiplier() {
  if (state.billingPeriod === 'hourly') return 1 / 720;
  if (state.billingPeriod === 'daily') return 1 / 30;
  if (state.billingPeriod === 'yearly') return 12;
  return 1;
}

function formatCost(usdMonthly) {
  var cur = getCurrency();
  var val = usdMonthly * periodMultiplier() * cur.rate;
  if (Math.abs(val) < 0.0001 && val !== 0) return cur.symbol + val.toExponential(2);
  if (Math.abs(val) < 0.01 && val !== 0) return cur.symbol + val.toFixed(6);
  if (Math.abs(val) < 1) return cur.symbol + val.toFixed(4);
  if (cur.rate > 100) return cur.symbol + val.toFixed(0);
  return cur.symbol + val.toFixed(2);
}

function formatCredits(eurMonthly) {
  var cur = getCurrency();
  var val = eurMonthly * periodMultiplier() * (cur.rate / 0.92);
  if (Math.abs(val) < 0.01 && val !== 0) return cur.symbol + val.toFixed(4);
  if (cur.rate > 100) return cur.symbol + val.toFixed(0);
  return cur.symbol + val.toFixed(2);
}

function periodLabel() {
  if (state.billingPeriod === 'hourly') return '/hr';
  if (state.billingPeriod === 'daily') return '/day';
  if (state.billingPeriod === 'yearly') return '/yr';
  return '/mo';
}

function getActiveRegion(provider) {
  return provider.regions.find(function(r) { return r.id === provider.selectedRegion; }) || provider.regions[0] || { storagePricePerGBMonth: 0, putPer1000: 0, getPer1000: 0, listPer1000: 0, deletePer1000: 0, egressPerGB: 0, ingressPerGB: 0 };
}

function avgStoragePrice() {
  var enabled = state.providers.filter(function(p) { return p.enabled; });
  if (enabled.length === 0) return 0;
  return enabled.reduce(function(sum, p) { return sum + getActiveRegion(p).storagePricePerGBMonth; }, 0) / enabled.length;
}

function storageBudgetUSD() { return (TOTAL_CREDITS_EUR * (state.storageAllocationPct / 100)) * EUR_TO_USD; }
function maxStorageGB() { var price = avgStoragePrice(); return price <= 0 ? 0 : storageBudgetUSD() / price; }
var storageUsedGB = 2.84;

function formatBytes(bytes) {
  if (bytes >= Math.pow(1024, 3)) return (bytes / Math.pow(1024, 3)).toFixed(2) + ' GB';
  if (bytes >= Math.pow(1024, 2)) return (bytes / Math.pow(1024, 2)).toFixed(2) + ' MB';
  if (bytes >= 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return bytes + ' B';
}

function generateChartData() {
  var data = [];
  var now = new Date(state.currentYear, state.currentMonth);
  for (var i = 11; i >= 0; i--) {
    var d = new Date(now.getFullYear(), now.getMonth() - i);
    var base = storageUsedGB * avgStoragePrice();
    var variation = (Math.sin(i * 0.8 + 1) * 0.3 + 0.7) * base;
    data.push({ month: d.toLocaleString('default', { month: 'short' }), year: d.getFullYear(), cost: Math.max(0.001, variation) });
  }
  return data;
}

function injectCSS() {
  var P = PHOSPHOR;
  var style = document.createElement('style');
  style.textContent = [
    '*, *::before, *::after { box-sizing: border-box; }',
    '.st-page { max-width:960px; margin:0 auto; padding:32px 24px; color:' + P + '; min-height:100vh; }',
    '.st-layout { display:flex; gap:0; margin-top:16px; border:1px solid rgba(255,255,255,0.1); border-radius:6px; overflow:hidden; min-height:600px; }',
    '.st-nav { width:200px; min-width:200px; border-right:1px solid rgba(255,255,255,0.1); padding:12px 0; }',
    '.st-nav-item { display:block; width:100%; padding:10px 18px; font-size:13px; color:rgba(255,255,255,0.4); cursor:pointer; border:none; background:none; border-left:2px solid transparent; font-family:inherit; text-align:left; transition:color 0.1s,border-color 0.1s; }',
    '.st-nav-item:hover:not(.disabled) { color:rgba(255,255,255,0.65); }',
    '.st-nav-item.active { color:' + P + '; border-left-color:' + P + '; }',
    '.st-nav-item.disabled { color:rgba(255,255,255,0.15); cursor:not-allowed; }',
    '.st-content { flex:1; padding:24px; overflow-y:auto; position:relative; }',
    '.st-hamburger { display:none; position:fixed; top:8px; left:8px; z-index:1001; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.15); color:rgba(255,255,255,0.6); font-size:20px; width:36px; height:36px; cursor:pointer; border-radius:4px; font-family:inherit; }',
    '.st-toolbar { display:flex; align-items:center; justify-content:space-between; margin-bottom:24px; gap:12px; flex-wrap:wrap; }',
    '.st-credits { position:relative; }',
    '.st-credits-main { display:inline-flex; align-items:baseline; font-size:22px; color:' + P + '; }',
    '.st-credits-free { margin-top:4px; }',
    '.st-credits-free-val { font-size:14px; color:#00c850; }',
    '.st-credits-free-label { font-size:14px; color:rgba(255,255,255,0.35); margin-left:4px; }',
    '.st-credits-currency-wrap { position:relative; display:inline-flex; align-items:center; }',
    '.st-credits-edit { position:absolute; right:100%; margin-right:2px; opacity:0; transition:opacity 0.15s; color:rgba(255,255,255,0.3); display:inline-flex; align-items:center; }',
    '.st-credits-currency-wrap:hover .st-credits-edit { opacity:1; }',
    '.st-credits-edit svg { width:11px; height:11px; fill:currentColor; }',
    '.st-credits-currency { color:' + P + '; cursor:pointer; }',
    '.st-credits-currency:hover { color:rgba(255,255,255,0.7); }',
    '.st-credits-label { color:rgba(255,255,255,0.35); font-size:12px; margin-left:6px; }',
    '.st-currency-dropdown { position:absolute; top:36px; left:0; background:#0e0e0e; border:1px solid rgba(255,255,255,0.12); border-radius:8px; width:260px; max-height:320px; overflow:hidden; z-index:1100; display:none; flex-direction:column; box-shadow:0 4px 24px rgba(0,0,0,0.6),0 0 12px rgba(255,255,255,0.03); }',
    '.st-currency-dropdown.open { display:flex; }',
    '.st-currency-search { background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.12); border-radius:4px; color:' + P + '; padding:6px 10px; font-size:12px; outline:none; font-family:inherit; margin:8px 8px 6px; }',
    '.st-currency-search:focus { border-color:rgba(255,255,255,0.3); }',
    '.st-currency-list { overflow-y:auto; flex:1; padding:0 8px 8px; }',
    '.st-currency-item { display:flex; align-items:center; padding:6px 10px; cursor:pointer; font-size:12px; color:rgba(255,255,255,0.5); gap:8px; border-radius:4px; transition:background 0.1s,color 0.1s; }',
    '.st-currency-item:hover { background:rgba(255,255,255,0.06); color:rgba(255,255,255,0.8); }',
    '.st-currency-item.selected { color:' + P + '; background:rgba(255,255,255,0.08); }',
    '.st-currency-sym { min-width:24px; color:rgba(255,255,255,0.3); }',
    '.st-currency-code { width:36px; font-weight:600; }',
    '.st-period-bar { display:flex; gap:0; margin:16px 0 24px; }',
    '.st-period-toggle { display:flex; gap:0; border:1px solid rgba(255,255,255,0.15); border-radius:4px; overflow:hidden; }',
    '.st-period-btn { padding:6px 16px; font-size:12px; color:rgba(255,255,255,0.4); cursor:pointer; border:none; background:none; font-family:inherit; transition:color 0.1s,background 0.1s; }',
    '.st-period-btn:not(:last-child) { border-right:1px solid rgba(255,255,255,0.15); }',
    '.st-period-btn:hover:not(.active) { color:rgba(255,255,255,0.65); background:rgba(255,255,255,0.04); }',
    '.st-period-btn.active { color:' + P + '; background:rgba(255,255,255,0.08); }',
    '.st-section-heading { font-size:11px; text-transform:uppercase; letter-spacing:1.5px; color:rgba(255,255,255,0.35); margin:32px 0 16px; display:flex; align-items:center; gap:8px; }',
    '.st-section-heading svg { width:16px; height:16px; fill:currentColor; }',
    '.st-section-right { margin-left:auto; font-size:12px; letter-spacing:0; text-transform:none; color:rgba(255,255,255,0.5); display:flex; align-items:center; gap:6px; }',
    '.st-section-right svg { width:14px; height:14px; }',
    '.st-columns { display:flex; gap:32px; }',
    '.st-col { flex:1; min-width:0; }',
    '.st-location-btn { display:flex; align-items:center; gap:6px; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.15); color:rgba(255,255,255,0.6); padding:6px 12px; border-radius:4px; cursor:pointer; font-size:12px; width:100%; text-align:left; font-family:inherit; transition:color 0.1s,border-color 0.1s; }',
    '.st-location-btn:hover { border-color:rgba(255,255,255,0.3); color:' + P + '; }',
    '.st-location-btn svg { width:14px; height:14px; flex-shrink:0; }',
    '.st-location-dropdown { background:#0e0e0e; border:1px solid rgba(255,255,255,0.12); border-radius:6px; margin-top:4px; overflow:hidden; display:none; }',
    '.st-location-dropdown.open { display:block; }',
    '.st-provider-row { display:flex; align-items:center; padding:8px 12px; gap:8px; border-bottom:1px solid rgba(255,255,255,0.04); }',
    '.st-provider-row:last-child { border-bottom:none; }',
    '.st-provider-check { width:16px; height:16px; accent-color:' + P + '; cursor:pointer; }',
    '.st-provider-icon { width:16px; height:16px; color:rgba(255,255,255,0.4); flex-shrink:0; }',
    '.st-provider-icon svg { width:100%; height:100%; }',
    '.st-provider-name { flex:1; font-size:12px; color:rgba(255,255,255,0.7); }',
    '.st-provider-info { width:14px; height:14px; color:rgba(255,255,255,0.25); cursor:pointer; position:relative; }',
    '.st-provider-info svg { width:100%; height:100%; }',
    '.st-provider-info:hover { color:rgba(255,255,255,0.5); }',
    '.st-info-popup { display:none; position:absolute; right:20px; top:-4px; background:#0e0e0e; border:1px solid rgba(255,255,255,0.12); border-radius:6px; padding:10px 12px; width:220px; z-index:50; font-size:11px; color:rgba(255,255,255,0.5); line-height:1.5; box-shadow:0 4px 24px rgba(0,0,0,0.6); }',
    '.st-provider-info:hover .st-info-popup { display:block; }',
    '.st-region-list { padding:4px 8px 8px 38px; }',
    '.st-region-item { padding:4px 8px; font-size:11px; color:rgba(255,255,255,0.35); cursor:pointer; border-radius:3px; transition:background 0.1s,color 0.1s; }',
    '.st-region-item:hover { background:rgba(255,255,255,0.04); color:rgba(255,255,255,0.6); }',
    '.st-region-item.selected { color:' + P + '; }',
    '.st-gc-tabs { display:flex; gap:0; padding:4px 8px 2px 38px; border:1px solid rgba(255,255,255,0.12); border-radius:4px; overflow:hidden; width:fit-content; margin-left:38px; }',
    '.st-gc-tab { background:none; border:none; color:rgba(255,255,255,0.35); font-size:11px; padding:4px 12px; cursor:pointer; font-family:inherit; transition:color 0.1s,background 0.1s; }',
    '.st-gc-tab:not(:last-child) { border-right:1px solid rgba(255,255,255,0.12); }',
    '.st-gc-tab.active { color:' + P + '; background:rgba(255,255,255,0.08); }',
    '.st-gc-tab:hover:not(.active) { color:rgba(255,255,255,0.6); }',
    '.st-slider-row { display:flex; align-items:center; justify-content:space-between; margin-top:12px; font-size:12px; }',
    '.st-slider-label { color:rgba(255,255,255,0.5); }',
    '.st-slider-value { color:rgba(255,255,255,0.4); font-size:11px; }',
    '.st-slider-wrap { margin:6px 0; }',
    '.st-slider-wrap input[type=range] { width:100%; height:4px; -webkit-appearance:none; appearance:none; background:rgba(255,255,255,0.06); border-radius:2px; outline:none; }',
    '.st-slider-wrap input[type=range]::-webkit-slider-thumb { -webkit-appearance:none; width:14px; height:14px; border-radius:50%; background:' + P + '; cursor:pointer; box-shadow:0 0 8px rgba(255,255,255,0.15); }',
    '.st-slider-wrap input[type=range]::-moz-range-thumb { width:14px; height:14px; border-radius:50%; background:' + P + '; cursor:pointer; border:none; box-shadow:0 0 8px rgba(255,255,255,0.15); }',
    '.st-progress-wrap { margin:8px 0 4px; }',
    '.st-progress-bar { width:100%; height:8px; background:rgba(255,255,255,0.06); border-radius:4px; overflow:hidden; position:relative; margin-bottom:6px; }',
    '.st-progress-fill { height:100%; border-radius:4px; background:linear-gradient(90deg,rgba(255,255,255,0.25),rgba(255,255,255,0.5)); box-shadow:0 0 8px rgba(255,255,255,0.15),0 0 20px rgba(255,255,255,0.05); transition:width 0.3s ease; }',
    '.st-progress-fill.danger { background:linear-gradient(90deg,rgba(255,80,80,0.5),rgba(255,80,80,0.8)); box-shadow:0 0 8px rgba(255,80,80,0.3),0 0 20px rgba(255,80,80,0.1); }',
    '.st-progress-label { font-size:12px; color:rgba(255,255,255,0.5); }',
    '.st-progress-label strong { color:rgba(255,255,255,0.8); }',
    '.st-divider { border:none; border-top:1px solid rgba(255,255,255,0.08); margin:24px 0; }',
    '.st-op-group { border:1px solid rgba(255,255,255,0.06); border-radius:6px; margin-bottom:10px; overflow:hidden; }',
    '.st-op-header { display:flex; align-items:center; gap:10px; padding:10px 14px; cursor:pointer; transition:background 0.1s; user-select:none; }',
    '.st-op-header:hover { background:rgba(255,255,255,0.03); }',
    '.st-op-chevron { width:14px; height:14px; color:rgba(255,255,255,0.25); transition:transform 0.1s; }',
    '.st-op-chevron svg { width:12px; height:12px; fill:none; stroke:currentColor; stroke-width:48; }',
    '.st-op-chevron.expanded { transform:rotate(90deg); }',
    '.st-op-icon { width:20px; height:20px; display:flex; align-items:center; justify-content:center; color:rgba(255,255,255,0.4); }',
    '.st-op-icon svg { width:18px; height:18px; fill:currentColor; }',
    '.st-op-title { flex:1; font-size:13px; color:rgba(255,255,255,0.7); }',
    '.st-op-header:hover .st-op-title { color:' + P + '; }',
    '.st-op-credits { font-size:13px; color:rgba(255,255,255,0.5); }',
    '.st-op-sub { padding:0 14px 10px 44px; }',
    '.st-op-sub.collapsed { display:none; }',
    '.st-op-sub-item { display:flex; align-items:center; gap:8px; padding:3px 0; font-size:12px; color:rgba(255,255,255,0.35); }',
    '.st-op-sub-icon { width:14px; height:14px; display:flex; align-items:center; justify-content:center; }',
    '.st-op-sub-icon svg { width:12px; height:12px; fill:currentColor; }',
    '.st-op-sub-name { flex:1; }',
    '.st-op-sub-cost { color:rgba(255,255,255,0.45); }',
    '.st-history { padding:0; }',
    '.st-history-back { display:flex; align-items:center; gap:6px; background:none; border:none; color:rgba(255,255,255,0.5); font-size:12px; cursor:pointer; padding:4px 0; margin-bottom:12px; font-family:inherit; }',
    '.st-history-back svg { width:16px; height:16px; }',
    '.st-history-back:hover { color:' + P + '; }',
    '.st-history-nav { display:flex; align-items:center; justify-content:center; gap:16px; margin-bottom:16px; }',
    '.st-history-nav button { background:none; border:none; color:rgba(255,255,255,0.35); font-size:16px; cursor:pointer; padding:4px 8px; font-family:inherit; }',
    '.st-history-nav button:hover { color:' + P + '; }',
    '.st-history-nav span { color:rgba(255,255,255,0.7); font-size:13px; min-width:120px; text-align:center; }',
    '.st-chart-wrap { background:#0e0e0e; border:1px solid rgba(255,255,255,0.08); border-radius:6px; padding:16px; position:relative; }',
    '.st-chart-tooltip { position:absolute; background:#0e0e0e; border:1px solid rgba(255,255,255,0.12); border-radius:4px; padding:4px 8px; font-size:11px; color:rgba(255,255,255,0.7); pointer-events:none; display:none; white-space:nowrap; z-index:10; }',
    '.st-general-placeholder { color:rgba(255,255,255,0.35); font-size:14px; margin-top:40px; }',
    '@media (max-width:768px) {',
    '  .st-hamburger { display:block; }',
    '  .st-nav { position:fixed; left:0; top:0; bottom:0; z-index:1000; transform:translateX(-100%); transition:transform 0.2s; background:#0a0a0a; }',
    '  .st-nav.expanded { transform:translateX(0); }',
    '  .st-content { padding:48px 16px 16px; }',
    '  .st-columns { flex-direction:column; }',
    '  .st-layout { border:none; border-radius:0; }',
    '}'
  ].join('\\n');
  document.head.appendChild(style);
}

function renderNav() {
  var items = [
    { id: 'usage', label: 'General & Usage', disabled: false },
    { id: 'permissions', label: 'Permissions', disabled: true },
    { id: 'webhooks', label: 'Webhooks', disabled: true },
    { id: 'branches', label: 'Branches', disabled: true },
    { id: 'actions', label: 'Actions', disabled: true }
  ];
  var h = '';
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    var cls = 'st-nav-item';
    if (it.id === currentTab) cls += ' active';
    if (it.disabled) cls += ' disabled';
    h += '<button class="' + cls + '" data-tab="' + it.id + '"' + (it.disabled ? ' disabled' : '') + '>' + it.label + '</button>';
  }
  return h;
}

function renderCurrencyDropdown() {
  var cur = getCurrency();
  var filtered = CURRENCIES;
  if (currencySearch) {
    var q = currencySearch.toLowerCase();
    filtered = CURRENCIES.filter(function(c) {
      return c.code.toLowerCase().indexOf(q) >= 0 || c.name.toLowerCase().indexOf(q) >= 0 || c.symbol.toLowerCase().indexOf(q) >= 0;
    });
  }
  var h = '<div class="st-currency-dropdown' + (currencyDropdownOpen ? ' open' : '') + '" data-currency-dropdown>';
  h += '<input type="text" class="st-currency-search" placeholder="Search currencies..." data-currency-search value="' + currencySearch + '">';
  h += '<div class="st-currency-list">';
  for (var i = 0; i < filtered.length; i++) {
    var c = filtered[i];
    h += '<div class="st-currency-item' + (c.code === state.currencyCode ? ' selected' : '') + '" data-currency-code="' + c.code + '">';
    h += '<span class="st-currency-sym">' + c.symbol + '</span>';
    h += '<span class="st-currency-code">' + c.code + '</span>';
    h += '<span>' + c.name + '</span>';
    h += '</div>';
  }
  h += '</div></div>';
  return h;
}

function renderCredits() {
  var cur = getCurrency();
  var extraVal = formatCredits(EXTRA_CREDITS_EUR);
  var freeVal = formatCredits(FREE_CREDITS_EUR);
  var editSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M416.9 85.2L372 130.1L509.9 268L554.8 223.1C568.4 209.6 576 191.2 576 172C576 152.8 568.4 134.4 554.8 120.9L519.1 85.2C505.6 71.6 487.2 64 468 64C448.8 64 430.4 71.6 416.9 85.2zM338.1 164L122.9 379.1C112.2 389.8 104.4 403.2 100.3 417.8L64.9 545.6C62.6 553.9 64.9 562.9 71.1 569C77.3 575.1 86.2 577.5 94.5 575.2L222.3 539.7C236.9 535.6 250.2 527.9 261 517.1L476 301.9L338.1 164z" fill="currentColor"/></svg>';
  var h = '<div class="st-credits">';
  h += '<div class="st-credits-main">';
  h += '<span class="st-credits-currency-wrap"><span class="st-credits-edit" data-currency-toggle>' + editSvg + '</span><span class="st-credits-currency" data-currency-toggle>' + cur.symbol + '</span></span>';
  h += '<span>' + extraVal.replace(cur.symbol, '') + periodLabel() + '</span> ';
  h += '<span class="st-credits-label">extra credits</span>';
  h += '</div>';
  h += '<div class="st-credits-free"><span class="st-credits-free-val">+' + freeVal + periodLabel() + '</span><span class="st-credits-free-label">free credits</span></div>';
  h += renderCurrencyDropdown();
  h += '</div>';
  return h;
}

function renderToolbar() {
  return '<div class="st-toolbar">' + renderCredits() + renderPeriodBar() + '</div>';
}

function renderPeriodBar() {
  var periods = [
    { id: 'hourly', label: 'hourly' },
    { id: 'daily', label: 'daily' },
    { id: 'monthly', label: 'monthly' },
    { id: 'yearly', label: 'yearly' }
  ];
  var h = '<div class="st-period-bar">';
  h += '<div class="st-period-toggle">';
  for (var i = 0; i < periods.length; i++) {
    var p = periods[i];
    h += '<button class="st-period-btn' + (state.billingPeriod === p.id ? ' active' : '') + '" data-period="' + p.id + '">' + p.label + '</button>';
  }
  h += '<button class="st-period-btn' + (showHistory ? ' active' : '') + '" data-toggle-history title="Cost History">%</button>';
  h += '</div></div>';
  return h;
}

function renderProviderInfo(provider) {
  var region = getActiveRegion(provider);
  var h = '<div class="st-info-popup">';
  h += '<div style="margin-bottom:4px;font-weight:600;color:#ccc;">' + provider.name + ' Pricing</div>';
  h += '<div>Storage: ' + formatCost(region.storagePricePerGBMonth) + '/GB' + periodLabel() + '</div>';
  h += '<div>PUT: ' + formatCost(region.putPer1000) + '/1k ops' + periodLabel() + '</div>';
  h += '<div>GET: ' + formatCost(region.getPer1000) + '/1k ops' + periodLabel() + '</div>';
  h += '<div>LIST: ' + formatCost(region.listPer1000) + '/1k ops' + periodLabel() + '</div>';
  h += '<div>DELETE: ' + formatCost(region.deletePer1000) + '/1k ops' + periodLabel() + '</div>';
  h += '<div>Egress: ' + formatCost(region.egressPerGB) + '/GB' + periodLabel() + '</div>';
  h += '<div>Ingress: ' + formatCost(region.ingressPerGB) + '/GB' + periodLabel() + '</div>';
  h += '</div>';
  return h;
}

function renderLocationDropdown() {
  var enabledNames = state.providers.filter(function(p) { return p.enabled; }).map(function(p) { return p.name; });
  var btnLabel = enabledNames.length > 0 ? enabledNames.join(', ') : 'No providers selected';
  var h = '<div style="margin-bottom:12px;">';
  h += '<label style="font-size:11px;color:#666;display:block;margin-bottom:4px;">Data Location</label>';
  h += '<button class="st-location-btn" data-location-toggle>';
  h += '<span class="st-provider-icon">' + STORAGE_SVG + '</span>';
  h += '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + btnLabel + '</span>';
  h += '<span style="width:12px;height:12px;color:#555;">' + (locationOpen ? CHEVRON_DOWN_SVG : CHEVRON_RIGHT_SVG) + '</span>';
  h += '</button>';
  h += '<div class="st-location-dropdown' + (locationOpen ? ' open' : '') + '">';
  for (var i = 0; i < state.providers.length; i++) {
    var prov = state.providers[i];
    h += '<div class="st-provider-row">';
    h += '<input type="checkbox" class="st-provider-check" data-provider-toggle="' + prov.id + '"' + (prov.enabled ? ' checked' : '') + '>';
    h += '<span class="st-provider-icon">' + prov.icon + '</span>';
    h += '<span class="st-provider-name">' + prov.name + '</span>';
    h += '<span class="st-provider-info">' + INFO_SVG + renderProviderInfo(prov) + '</span>';
    h += '</div>';
    if (prov.id === 'gcloud') {
      h += '<div class="st-gc-tabs">';
      var gcTypes = ['single', 'dual', 'multi'];
      for (var t = 0; t < gcTypes.length; t++) {
        h += '<button class="st-gc-tab' + ((prov.gcRegionType || 'single') === gcTypes[t] ? ' active' : '') + '" data-gc-type="' + gcTypes[t] + '">' + gcTypes[t] + '</button>';
      }
      h += '</div>';
      var gcRegions = gcFilterRegions(prov.regions, prov.gcRegionType || 'single');
      h += '<div class="st-region-list">';
      for (var r = 0; r < gcRegions.length; r++) {
        h += '<div class="st-region-item' + (gcRegions[r].id === prov.selectedRegion ? ' selected' : '') + '" data-region="' + gcRegions[r].id + '" data-provider="' + prov.id + '">' + gcRegions[r].name + '</div>';
      }
      h += '</div>';
    } else {
      h += '<div class="st-region-list">';
      for (var r = 0; r < prov.regions.length; r++) {
        h += '<div class="st-region-item' + (prov.regions[r].id === prov.selectedRegion ? ' selected' : '') + '" data-region="' + prov.regions[r].id + '" data-provider="' + prov.id + '">' + prov.regions[r].name + '</div>';
      }
      h += '</div>';
    }
  }
  h += '</div></div>';
  return h;
}

function renderStorageSlider() {
  var pct = state.storageAllocationPct;
  var maxGB = maxStorageGB();
  var storageCostStr = formatCredits(TOTAL_CREDITS_EUR * pct / 100);
  var h = '';
  h += '<div class="st-slider-row">';
  h += '<span class="st-slider-label" data-alloc-label>Storage: ' + maxGB.toFixed(2) + ' GB</span>';
  h += '<span class="st-slider-value" data-alloc-value>max: ' + storageCostStr + periodLabel() + '</span>';
  h += '</div>';
  h += '<div class="st-slider-wrap">';
  h += '<input type="range" min="0" max="100" value="' + pct + '" data-alloc-slider>';
  h += '</div>';
  var usedPct = maxGB > 0 ? Math.min(100, (storageUsedGB / maxGB) * 100) : 0;
  h += '<div class="st-progress-wrap">';
  h += '<div class="st-progress-bar"><div class="st-progress-fill' + (usedPct > 90 ? ' danger' : '') + '" style="width:' + usedPct.toFixed(1) + '%;"></div></div>';
  h += '<div class="st-progress-label" data-storage-max><strong>' + storageUsedGB.toFixed(2) + ' GB</strong> / ' + maxGB.toFixed(2) + ' GB</div>';
  h += '</div>';
  return h;
}

function computeOpCosts() {
  var enabled = state.providers.filter(function(p) { return p.enabled; });
  if (enabled.length === 0) return { avgGet: 0, avgPut: 0, avgEgress: 0 };
  var avgGet = enabled.reduce(function(s, p) { return s + getActiveRegion(p).getPer1000; }, 0) / enabled.length;
  var avgPut = enabled.reduce(function(s, p) { return s + getActiveRegion(p).putPer1000; }, 0) / enabled.length;
  var avgEgress = enabled.reduce(function(s, p) { return s + getActiveRegion(p).egressPerGB; }, 0) / enabled.length;
  return { avgGet: avgGet, avgPut: avgPut, avgEgress: avgEgress };
}

function renderOperations() {
  var c = computeOpCosts();
  var cloneNet = 0.2 * c.avgEgress;
  var cloneRead = (200 / 1000) * c.avgGet;
  var cloneWrite = (150 / 1000) * c.avgPut;
  var explorerNet = 0.1 * c.avgEgress;
  var explorerRead = (100 / 1000) * c.avgGet;
  var searchRead = (80 / 1000) * c.avgGet;
  var searchWrite = (60 / 1000) * c.avgPut;
  var ops = [
    { id: 'cloning', label: 'Cloning', icon: CLONE_ICON_SVG, total: cloneNet + cloneRead + cloneWrite, subs: [
      { icon: NETWORK_SVG, name: 'Network', costUSD: cloneNet },
      { icon: DISK_READ_SVG, name: 'Disk Read', costUSD: cloneRead },
      { icon: DISK_WRITE_SVG, name: 'Disk Write', costUSD: cloneWrite }
    ] },
    { id: 'explorer', label: 'Explorer viewing', icon: FILE_VIEWER_SVG, total: explorerNet + explorerRead, subs: [
      { icon: NETWORK_SVG, name: 'Network', costUSD: explorerNet },
      { icon: DISK_READ_SVG, name: 'Disk Read', costUSD: explorerRead }
    ] },
    { id: 'search', label: 'Search index', icon: SEARCH_INDEX_SVG, total: searchRead + searchWrite, subs: [
      { icon: DISK_READ_SVG, name: 'Disk Read', costUSD: searchRead },
      { icon: DISK_WRITE_SVG, name: 'Disk Write', costUSD: searchWrite }
    ] }
  ];
  var h = '';
  for (var i = 0; i < ops.length; i++) {
    var op = ops[i];
    var expanded = !!expandedOps[op.id];
    h += '<div class="st-op-group">';
    h += '<div class="st-op-header" data-op-toggle="' + op.id + '">';
    h += '<span class="st-op-chevron' + (expanded ? ' expanded' : '') + '">' + CHEVRON_RIGHT_SVG + '</span>';
    h += '<span class="st-op-icon">' + op.icon + '</span>';
    h += '<span class="st-op-title">' + op.label + '</span>';
    h += '<span class="st-op-credits">' + formatCost(op.total) + periodLabel() + '</span>';
    h += '</div>';
    h += '<div class="st-op-sub' + (expanded ? '' : ' collapsed') + '">';
    for (var s = 0; s < op.subs.length; s++) {
      var sub = op.subs[s];
      h += '<div class="st-op-sub-item">';
      h += '<span class="st-op-sub-icon">' + sub.icon + '</span>';
      h += '<span class="st-op-sub-name">' + sub.name + '</span>';
      h += '<span class="st-op-sub-cost">' + formatCost(sub.costUSD) + periodLabel() + '</span>';
      h += '</div>';
    }
    h += '</div>';
    h += '</div>';
  }
  return h;
}

function renderHistory() {
  var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var monthName = months[state.currentMonth];
  var data = generateChartData();
  var maxCost = 0;
  for (var i = 0; i < data.length; i++) { if (data[i].cost > maxCost) maxCost = data[i].cost; }
  if (maxCost === 0) maxCost = 1;
  var svgW = 560;
  var svgH = 200;
  var padL = 50;
  var padR = 20;
  var padT = 20;
  var padB = 40;
  var plotW = svgW - padL - padR;
  var plotH = svgH - padT - padB;
  var stepX = plotW / 11;
  var points = [];
  for (var i = 0; i < data.length; i++) {
    var x = padL + i * stepX;
    var y = padT + plotH - (data[i].cost / maxCost) * plotH;
    points.push({ x: x, y: y, data: data[i] });
  }
  var polyline = '';
  for (var i = 0; i < points.length; i++) {
    polyline += (i === 0 ? '' : ' ') + points[i].x.toFixed(1) + ',' + points[i].y.toFixed(1);
  }
  var svg = '<svg viewBox="0 0 ' + svgW + ' ' + svgH + '" style="width:100%;height:auto;">';
  svg += '<line x1="' + padL + '" y1="' + padT + '" x2="' + padL + '" y2="' + (padT + plotH) + '" stroke="#222" stroke-width="1"/>';
  svg += '<line x1="' + padL + '" y1="' + (padT + plotH) + '" x2="' + (padL + plotW) + '" y2="' + (padT + plotH) + '" stroke="#222" stroke-width="1"/>';
  var gridSteps = 4;
  for (var g = 0; g <= gridSteps; g++) {
    var gy = padT + plotH - (g / gridSteps) * plotH;
    var gVal = (maxCost * g / gridSteps);
    svg += '<line x1="' + padL + '" y1="' + gy.toFixed(1) + '" x2="' + (padL + plotW) + '" y2="' + gy.toFixed(1) + '" stroke="#1a1a1a" stroke-width="1"/>';
    svg += '<text x="' + (padL - 4) + '" y="' + (gy + 4).toFixed(1) + '" text-anchor="end" fill="#555" font-size="9">' + formatCost(gVal) + '</text>';
  }
  for (var i = 0; i < points.length; i++) {
    svg += '<text x="' + points[i].x.toFixed(1) + '" y="' + (padT + plotH + 16) + '" text-anchor="middle" fill="#555" font-size="9">' + data[i].month + '</text>';
  }
  svg += '<polyline points="' + polyline + '" fill="none" stroke="#2a6" stroke-width="2"/>';
  for (var i = 0; i < points.length; i++) {
    svg += '<circle cx="' + points[i].x.toFixed(1) + '" cy="' + points[i].y.toFixed(1) + '" r="4" fill="#0e0e0e" stroke="#2a6" stroke-width="2" data-chart-point="' + i + '" style="cursor:pointer;"/>';
  }
  svg += '</svg>';
  var h = '<div class="st-history">';
  h += '<button class="st-history-back" data-history-back>' + ARROW_LEFT_SVG + ' Back to usage</button>';
  h += '<div class="st-history-nav">';
  h += '<button data-month-prev>&larr;</button>';
  h += '<span>' + monthName + ' ' + state.currentYear + '</span>';
  h += '<button data-month-next>&rarr;</button>';
  h += '</div>';
  h += '<div class="st-chart-wrap">';
  h += svg;
  h += '<div class="st-chart-tooltip" data-chart-tooltip></div>';
  h += '</div>';
  h += '</div>';
  return h;
}

function renderUsageContent() {
  if (showHistory) return renderHistory();
  var storageCost = storageUsedGB * avgStoragePrice();
  var h = '';
  h += renderToolbar();
  h += '<div class="st-columns">';
  h += '<div class="st-col">';
  h += '<div class="st-section-heading">' + STORAGE_SVG + ' Data Storage';
  h += '<span class="st-section-right">' + formatCost(storageCost) + periodLabel() + '</span>';
  h += '</div>';
  h += renderLocationDropdown();
  h += renderStorageSlider();
  h += '</div>';
  h += '<div class="st-col">';
  h += '<div class="st-section-heading">' + NETWORK_SVG + ' Data Processing';
  h += '<span class="st-section-right">' + INFINITY_SVG + ' <span style="color:rgba(255,255,255,0.7)">Unlimited</span></span>';
  h += '</div>';
  h += renderOperations();
  h += '</div>';
  h += '</div>';
  return h;
}

function renderGeneralContent() {
  return '<div class="st-general-placeholder">Coming soon</div>';
}

function render() {
  if (isDragging) return;
  var h = '';
  h += '<button class="st-hamburger" data-hamburger>\\u2261</button>';
  h += '<div class="st-page">';
  h += '<div class="st-layout">';
  h += '<div class="st-nav' + (navExpanded ? ' expanded' : '') + '" data-nav>';
  h += renderNav();
  h += '</div>';
  h += '<div class="st-content">';
  h += renderUsageContent();
  h += '</div>';
  h += '</div></div>';
  root.innerHTML = h;
  bindEvents();
}

function bindEvents() {
  var navItems = root.querySelectorAll('.st-nav-item:not(.disabled)');
  for (var i = 0; i < navItems.length; i++) {
    navItems[i].addEventListener('click', function(e) {
      var tab = e.currentTarget.getAttribute('data-tab');
      if (tab) {
        currentTab = tab;
        navExpanded = false;
        render();
      }
    });
  }

  var hamburger = root.querySelector('[data-hamburger]');
  if (hamburger) {
    hamburger.addEventListener('click', function() {
      navExpanded = !navExpanded;
      var nav = root.querySelector('[data-nav]');
      if (nav) {
        if (navExpanded) nav.classList.add('expanded');
        else nav.classList.remove('expanded');
      }
    });
  }

  var periodBtns = root.querySelectorAll('[data-period]');
  for (var i = 0; i < periodBtns.length; i++) {
    periodBtns[i].addEventListener('click', function(e) {
      state.billingPeriod = e.currentTarget.getAttribute('data-period');
      saveState();
      render();
    });
  }

  var historyToggle = root.querySelector('[data-toggle-history]');
  if (historyToggle) {
    historyToggle.addEventListener('click', function() {
      showHistory = !showHistory;
      render();
    });
  }

  var historyBack = root.querySelector('[data-history-back]');
  if (historyBack) {
    historyBack.addEventListener('click', function() {
      showHistory = false;
      render();
    });
  }

  var monthPrev = root.querySelector('[data-month-prev]');
  if (monthPrev) {
    monthPrev.addEventListener('click', function() {
      state.currentMonth--;
      if (state.currentMonth < 0) { state.currentMonth = 11; state.currentYear--; }
      saveState();
      render();
    });
  }

  var monthNext = root.querySelector('[data-month-next]');
  if (monthNext) {
    monthNext.addEventListener('click', function() {
      state.currentMonth++;
      if (state.currentMonth > 11) { state.currentMonth = 0; state.currentYear++; }
      saveState();
      render();
    });
  }

  var chartPoints = root.querySelectorAll('[data-chart-point]');
  var chartTooltip = root.querySelector('[data-chart-tooltip]');
  for (var i = 0; i < chartPoints.length; i++) {
    (function(pt) {
      pt.addEventListener('mouseenter', function(e) {
        var idx = parseInt(pt.getAttribute('data-chart-point'));
        var data = generateChartData();
        if (data[idx] && chartTooltip) {
          chartTooltip.textContent = data[idx].month + ' ' + data[idx].year + ': ' + formatCost(data[idx].cost);
          chartTooltip.style.display = 'block';
          var rect = pt.getBoundingClientRect();
          var wrap = root.querySelector('.st-chart-wrap');
          var wrapRect = wrap ? wrap.getBoundingClientRect() : { left: 0, top: 0 };
          chartTooltip.style.left = (rect.left - wrapRect.left + rect.width / 2) + 'px';
          chartTooltip.style.top = (rect.top - wrapRect.top - 28) + 'px';
          chartTooltip.style.transform = 'translateX(-50%)';
        }
      });
      pt.addEventListener('mouseleave', function() {
        if (chartTooltip) chartTooltip.style.display = 'none';
      });
    })(chartPoints[i]);
  }

  var currencyToggles = root.querySelectorAll('[data-currency-toggle]');
  for (var ci = 0; ci < currencyToggles.length; ci++) {
    currencyToggles[ci].addEventListener('click', function(e) {
      e.stopPropagation();
      currencyDropdownOpen = !currencyDropdownOpen;
      currencySearch = '';
      render();
      if (currencyDropdownOpen) {
        var searchInput = root.querySelector('[data-currency-search]');
        if (searchInput) searchInput.focus();
      }
    });
  }

  var currencySearchInput = root.querySelector('[data-currency-search]');
  if (currencySearchInput) {
    currencySearchInput.addEventListener('input', function(e) {
      currencySearch = e.target.value;
      var listEl = root.querySelector('.st-currency-list');
      if (listEl) {
        var filtered = CURRENCIES;
        if (currencySearch) {
          var q = currencySearch.toLowerCase();
          filtered = CURRENCIES.filter(function(c) {
            return c.code.toLowerCase().indexOf(q) >= 0 || c.name.toLowerCase().indexOf(q) >= 0 || c.symbol.toLowerCase().indexOf(q) >= 0;
          });
        }
        var ih = '';
        for (var i = 0; i < filtered.length; i++) {
          var c = filtered[i];
          ih += '<div class="st-currency-item' + (c.code === state.currencyCode ? ' selected' : '') + '" data-currency-code="' + c.code + '">';
          ih += '<span class="st-currency-sym">' + c.symbol + '</span>';
          ih += '<span class="st-currency-code">' + c.code + '</span>';
          ih += '<span>' + c.name + '</span>';
          ih += '</div>';
        }
        listEl.innerHTML = ih;
        bindCurrencyItems();
      }
    });
    currencySearchInput.addEventListener('click', function(e) { e.stopPropagation(); });
  }

  bindCurrencyItems();

  if (currencyDropdownOpen) {
    document.addEventListener('click', function closeCurrency(e) {
      var dd = root.querySelector('[data-currency-dropdown]');
      if (dd && !dd.contains(e.target)) {
        currencyDropdownOpen = false;
        currencySearch = '';
        document.removeEventListener('click', closeCurrency);
        render();
      }
    });
  }

  var locToggle = root.querySelector('[data-location-toggle]');
  if (locToggle) {
    locToggle.addEventListener('click', function() {
      locationOpen = !locationOpen;
      render();
    });
  }

  var provToggles = root.querySelectorAll('[data-provider-toggle]');
  for (var i = 0; i < provToggles.length; i++) {
    provToggles[i].addEventListener('change', function(e) {
      var pid = e.currentTarget.getAttribute('data-provider-toggle');
      var checked = e.currentTarget.checked;
      for (var p = 0; p < state.providers.length; p++) {
        if (state.providers[p].id === pid) state.providers[p].enabled = checked;
      }
      saveState();
      render();
    });
  }

  var regionItems = root.querySelectorAll('[data-region]');
  for (var i = 0; i < regionItems.length; i++) {
    regionItems[i].addEventListener('click', function(e) {
      var rid = e.currentTarget.getAttribute('data-region');
      var pid = e.currentTarget.getAttribute('data-provider');
      for (var p = 0; p < state.providers.length; p++) {
        if (state.providers[p].id === pid) state.providers[p].selectedRegion = rid;
      }
      saveState();
      render();
    });
  }

  var gcTabs = root.querySelectorAll('[data-gc-type]');
  for (var i = 0; i < gcTabs.length; i++) {
    gcTabs[i].addEventListener('click', function(e) {
      var type = e.currentTarget.getAttribute('data-gc-type');
      for (var p = 0; p < state.providers.length; p++) {
        if (state.providers[p].id === 'gcloud') {
          state.providers[p].gcRegionType = type;
          var filtered = gcFilterRegions(state.providers[p].regions, type);
          if (filtered.length > 0) state.providers[p].selectedRegion = filtered[0].id;
        }
      }
      saveState();
      render();
    });
  }

  var slider = root.querySelector('[data-alloc-slider]');
  if (slider) {
    slider.addEventListener('pointerdown', function() { isDragging = true; });
    slider.addEventListener('pointerup', function() { isDragging = false; });
    slider.addEventListener('input', function() {
      state.storageAllocationPct = parseInt(slider.value);
      var lbl = root.querySelector('[data-alloc-label]');
      var valLbl = root.querySelector('[data-alloc-value]');
      var maxLbl = root.querySelector('[data-storage-max]');
      if (lbl) lbl.textContent = 'Storage: ' + maxStorageGB().toFixed(2) + ' GB';
      if (valLbl) valLbl.textContent = 'max: ' + formatCredits(TOTAL_CREDITS_EUR * state.storageAllocationPct / 100) + periodLabel();
      if (maxLbl) maxLbl.innerHTML = '<strong>' + storageUsedGB.toFixed(2) + ' GB</strong> / ' + maxStorageGB().toFixed(2) + ' GB';
      var maxGB = maxStorageGB();
      var usedPct = maxGB > 0 ? Math.min(100, (storageUsedGB / maxGB) * 100) : 0;
      var fill = root.querySelector('.st-progress-fill');
      if (fill) {
        fill.style.width = usedPct.toFixed(1) + '%';
        if (usedPct > 90) fill.classList.add('danger');
        else fill.classList.remove('danger');
      }
      saveState();
    });
    slider.addEventListener('change', function() {
      isDragging = false;
      render();
    });
  }

  var opToggles = root.querySelectorAll('[data-op-toggle]');
  for (var i = 0; i < opToggles.length; i++) {
    opToggles[i].addEventListener('click', function(e) {
      var opId = e.currentTarget.getAttribute('data-op-toggle');
      expandedOps[opId] = !expandedOps[opId];
      render();
    });
  }
}

function bindCurrencyItems() {
  var items = root.querySelectorAll('[data-currency-code]');
  for (var i = 0; i < items.length; i++) {
    items[i].addEventListener('click', function(e) {
      e.stopPropagation();
      var code = e.currentTarget.getAttribute('data-currency-code');
      state.currencyCode = code;
      currencyDropdownOpen = false;
      currencySearch = '';
      saveState();
      render();
    });
  }
}

injectCSS();
await loadState();
render();

});
`;

const README_CONTENT = `# @ether/library

A **Ray-based** library for compositional abstractions over equivalences.

## Overview

This library provides the foundational primitives for working with
*vertices*, *edges*, and *rays* in the Ether runtime.

> "Every sufficiently advanced abstraction is indistinguishable from a ray."

---

## Installation

\`\`\`sh
ether add @ether/library
\`\`\`

## Quick Start

\`\`\`ts
import { Ray, Vertex, Edge } from '@ether/library';

const vertex = Ray.vertex();
const edge = vertex.compose(Ray.vertex());

console.log(edge.is_equivalent(edge)); // true
\`\`\`

## API Reference

| Export | Type | Description |
|--------|------|-------------|
| \`Ray\` | class | The fundamental compositional primitive |
| \`Vertex\` | type | A zero-dimensional ray |
| \`Edge\` | type | A one-dimensional composition of rays |
| \`Orbit\` | type | A cyclic equivalence class |
| \`Mine\` | function | Constructs a ray from a perspective |

### Ray Methods

1. \`Ray.vertex()\` — create a vertex
2. \`Ray.edge(a, b)\` — compose two rays
3. \`Ray.orbit(rays)\` — create a cyclic structure
4. \`Ray.equivalent(a, b)\` — test equivalence

### Features

- [x] Zero-cost vertex abstraction
- [x] Compositional edge construction
- [x] Equivalence testing
- [ ] Parallel orbit resolution
- [ ] Distributed ray tracing

## Examples

See the [\`examples/\`](examples) directory for usage patterns:

- **basic.ray** — A minimal vertex composition
- **composition.ray** — Chaining edges
- **orbit.ray** — Cyclic structures

## License

~~MIT~~ — *Unlicensed*. This is free and unencumbered software released into the public domain.

![Ether Logo](images/avatar/2d.svg)
`;

const ALT_README = `# @ether/library (Draft)

An **experimental** rewrite of the core library using Ray v2 primitives.

## Status

This is an alternative README reflecting the in-progress v2 branch.

> "All rays are equivalent — some are just more equivalent than others."

---

## Changes from v1

- \`Ray.vertex()\` is now \`Ray.point()\`
- \`Ray.edge(a, b)\` replaced by \`Ray.connect(a, b)\`
- New: \`Ray.superpose(rays)\` — quantum-style superposition

## Migration Guide

\`\`\`ts
// v1
const v = Ray.vertex();
const e = v.compose(Ray.vertex());

// v2
const p = Ray.point();
const c = p.connect(Ray.point());
\`\`\`

## License

~~MIT~~ — *Unlicensed*. This is free and unencumbered software released into the public domain.
`;

const DOCS_README = `# Documentation

Detailed guides for working with @ether/library.

## Contents

- \`getting-started.md\` — Setup and first steps
- \`api.md\` — Full API reference
- \`architecture.md\` — Internal design overview
`;

const RAY_TS_V1 = `// Ray.ts — The fundamental compositional primitive
// v1: Original implementation

import { Vertex } from './Vertex';
import { Edge } from './Edge';

export type Equivalence<T> = (a: T, b: T) => boolean;

export class Ray {
  private _initial: Ray | null = null;
  private _terminal: Ray | null = null;
  private _vertex: boolean;

  private constructor(vertex: boolean = false) {
    this._vertex = vertex;
  }

  static vertex(): Ray {
    const r = new Ray(true);
    r._initial = r;
    r._terminal = r;
    return r;
  }

  static edge(a: Ray, b: Ray): Ray {
    const r = new Ray(false);
    r._initial = a;
    r._terminal = b;
    return r;
  }

  static orbit(rays: Ray[]): Ray {
    if (rays.length === 0) return Ray.vertex();
    let current = rays[0];
    for (let i = 1; i < rays.length; i++) {
      current = Ray.edge(current, rays[i]);
    }
    return Ray.edge(current, rays[0]);
  }

  get initial(): Ray { return this._initial ?? this; }
  get terminal(): Ray { return this._terminal ?? this; }
  get is_vertex(): boolean { return this._vertex; }

  compose(other: Ray): Ray {
    return Ray.edge(this, other);
  }

  is_equivalent(other: Ray): boolean {
    if (this === other) return true;
    if (this._vertex && other._vertex) return true;
    return false;
  }

  static equivalent(a: Ray, b: Ray): boolean {
    return a.is_equivalent(b);
  }

  toString(): string {
    if (this._vertex) return '(*)';
    return \`(\${this._initial} -> \${this._terminal})\`;
  }
}`;

const RAY_TS_V2 = `// Ray.ts — The fundamental compositional primitive
// v2: Refactored with superposition support

import { Vertex } from './Vertex';
import { Edge } from './Edge';

export type Equivalence<T> = (a: T, b: T) => boolean;

export interface RayLike {
  readonly initial: RayLike;
  readonly terminal: RayLike;
  readonly is_vertex: boolean;
  compose(other: RayLike): RayLike;
}

export class Ray implements RayLike {
  private _initial: Ray | null = null;
  private _terminal: Ray | null = null;
  private _vertex: boolean;
  private _superposed: Ray[] = [];

  private constructor(vertex: boolean = false) {
    this._vertex = vertex;
  }

  static point(): Ray {
    const r = new Ray(true);
    r._initial = r;
    r._terminal = r;
    return r;
  }

  static vertex(): Ray {
    return Ray.point();
  }

  static connect(a: Ray, b: Ray): Ray {
    const r = new Ray(false);
    r._initial = a;
    r._terminal = b;
    return r;
  }

  static edge(a: Ray, b: Ray): Ray {
    return Ray.connect(a, b);
  }

  static superpose(...rays: Ray[]): Ray {
    const r = Ray.point();
    r._superposed = rays;
    return r;
  }

  get initial(): Ray { return this._initial ?? this; }
  get terminal(): Ray { return this._terminal ?? this; }
  get is_vertex(): boolean { return this._vertex; }
  get superpositions(): readonly Ray[] { return this._superposed; }

  compose(other: Ray): Ray {
    return Ray.connect(this, other);
  }

  is_equivalent(other: Ray): boolean {
    if (this === other) return true;
    if (this._vertex && other._vertex) return true;
    if (this._superposed.length > 0 || other._superposed.length > 0) {
      return this._superposed.some(s => s.is_equivalent(other))
        || other._superposed.some(s => this.is_equivalent(s));
    }
    return false;
  }

  toString(): string {
    if (this._superposed.length > 0) {
      return \`(\${this._superposed.map(s => s.toString()).join(' | ')})\`;
    }
    if (this._vertex) return '(*)';
    return \`(\${this._initial} -> \${this._terminal})\`;
  }
}`;

const VERTEX_TS_CONTENT = `// Vertex.ts — Zero-dimensional ray abstraction

import { Ray } from './Ray';

export type Vertex = Ray;

export function isVertex(ray: Ray): ray is Vertex {
  return ray.is_vertex;
}

export function createVertex(): Vertex {
  return Ray.vertex();
}

export function vertexPair(): [Vertex, Vertex] {
  return [createVertex(), createVertex()];
}

export namespace VertexOps {
  export function merge(a: Vertex, b: Vertex): Vertex {
    if (a.is_equivalent(b)) return a;
    return Ray.edge(a, b);
  }

  export function split(v: Vertex): [Ray, Ray] {
    return [v.initial, v.terminal];
  }
}`;

const EDGE_TS_CONTENT = `// Edge.ts — One-dimensional composition of rays

import { Ray } from './Ray';

export type Edge = Ray;

export function isEdge(ray: Ray): boolean {
  return !ray.is_vertex;
}

export function createEdge(initial: Ray, terminal: Ray): Edge {
  return Ray.edge(initial, terminal);
}

export function chain(...rays: Ray[]): Edge {
  if (rays.length === 0) return Ray.vertex();
  let current = rays[0];
  for (let i = 1; i < rays.length; i++) {
    current = current.compose(rays[i]);
  }
  return current;
}

export function reverse(edge: Edge): Edge {
  return Ray.edge(edge.terminal, edge.initial);
}

export namespace EdgeOps {
  export function length(edge: Edge): number {
    let count = 0;
    let current: Ray = edge;
    while (!current.is_vertex) {
      count++;
      current = current.terminal;
    }
    return count;
  }
}`;

const ORBIT_TS_CONTENT = `// Orbit.ts — Cyclic equivalence class

import { Ray } from './Ray';
import { Edge, chain } from './Edge';

export class Orbit {
  private _rays: Ray[];
  private _cycle: Edge;

  constructor(rays: Ray[]) {
    if (rays.length === 0) {
      throw new Error('Orbit requires at least one ray');
    }
    this._rays = [...rays];
    this._cycle = Ray.orbit(rays);
  }

  get rays(): readonly Ray[] {
    return this._rays;
  }

  get cycle(): Edge {
    return this._cycle;
  }

  get size(): number {
    return this._rays.length;
  }

  contains(ray: Ray): boolean {
    return this._rays.some(r => r.is_equivalent(ray));
  }

  rotate(n: number = 1): Orbit {
    const len = this._rays.length;
    const shift = ((n % len) + len) % len;
    const rotated = [
      ...this._rays.slice(shift),
      ...this._rays.slice(0, shift),
    ];
    return new Orbit(rotated);
  }

  merge(other: Orbit): Orbit {
    return new Orbit([...this._rays, ...other._rays]);
  }

  toString(): string {
    return \`Orbit(\${this._rays.map(r => r.toString()).join(', ')})\`;
  }
}`;

const INDEX_TS_CONTENT = `// index.ts — Main entry point for @ether/library

export { Ray } from './Ray';
export type { Equivalence, RayLike } from './Ray';

export { isVertex, createVertex, vertexPair } from './Vertex';
export type { Vertex } from './Vertex';

export { isEdge, createEdge, chain, reverse } from './Edge';
export type { Edge } from './Edge';

export { Orbit } from './Orbit';

// Re-export convenience constructors
import { Ray } from './Ray';

export const vertex = Ray.vertex;
export const edge = Ray.edge;

export function mine(perspective: Ray): Ray {
  return perspective.compose(Ray.vertex());
}`;

function generateLargeFile(lines: number): string {
  const parts: string[] = [
    '// generated-test.ray — Auto-generated test file',
    '// This file is used to test virtual scrolling with large content',
    '',
    'import { Ray, Vertex, Edge, Orbit } from "../src";',
    '',
    '// ============================================================',
    '// Test harness: generate a mesh of rays for stress testing',
    '// ============================================================',
    '',
    'const MESH_SIZE = 1000;',
    'const vertices: Ray[] = [];',
    '',
    'for (let i = 0; i < MESH_SIZE; i++) {',
    '  vertices.push(Ray.vertex());',
    '}',
    '',
  ];
  for (let i = parts.length; i < lines; i++) {
    const mod = i % 20;
    if (mod === 0) {
      parts.push(`// ---- Block ${Math.floor(i / 20)} ----`);
    } else if (mod === 1) {
      parts.push(`const ray_${i} = Ray.vertex();`);
    } else if (mod === 2) {
      parts.push(`const edge_${i} = Ray.edge(ray_${i - 1}, Ray.vertex());`);
    } else if (mod === 3) {
      parts.push(`assert(edge_${i - 1}.is_equivalent(edge_${i - 1}));`);
    } else if (mod === 4) {
      parts.push(`assert(!ray_${i - 3}.is_equivalent(edge_${i - 2}));`);
    } else if (mod === 5) {
      parts.push(`const orbit_${i} = new Orbit([ray_${i - 4}, edge_${i - 3}]);`);
    } else if (mod === 6) {
      parts.push(`assert(orbit_${i - 1}.size === 2);`);
    } else if (mod === 7) {
      parts.push(`assert(orbit_${i - 2}.contains(ray_${i - 6}));`);
    } else if (mod === 8) {
      parts.push(`const composed_${i} = ray_${i - 7}.compose(edge_${i - 6});`);
    } else if (mod === 9) {
      parts.push(`assert(!composed_${i - 1}.is_vertex);`);
    } else if (mod === 10) {
      parts.push('');
    } else if (mod === 11) {
      parts.push(`// Verify vertex identity for block ${Math.floor(i / 20)}`);
    } else if (mod === 12) {
      parts.push(`const v_${i} = Ray.vertex();`);
    } else if (mod === 13) {
      parts.push(`assert(v_${i - 1}.is_vertex);`);
    } else if (mod === 14) {
      parts.push(`assert(v_${i - 2}.initial === v_${i - 2});`);
    } else if (mod === 15) {
      parts.push(`assert(v_${i - 3}.terminal === v_${i - 3});`);
    } else if (mod === 16) {
      parts.push(`const chain_${i} = v_${i - 4}.compose(ray_${i - 15});`);
    } else if (mod === 17) {
      parts.push(`assert(!chain_${i - 1}.is_vertex);`);
    } else if (mod === 18) {
      parts.push(`vertices.push(v_${i - 6});`);
    } else {
      parts.push('');
    }
  }
  return parts.slice(0, lines).join('\n');
}

let _largeFileCache: string | null = null;
const generatedTestEntry: FileEntry = { name: 'generated-test.ray', isDirectory: false, modified: '1 day ago' };
Object.defineProperty(generatedTestEntry, 'content', {
  get() {
    if (_largeFileCache === null) _largeFileCache = generateLargeFile(10000);
    return _largeFileCache;
  },
  enumerable: true,
  configurable: true,
});

const ETHER_ROOT_README = `# @ether

The **Ether** runtime environment — a compositional universe built on rays.

## Overview

Ether is a platform for building, sharing, and composing abstractions.
Every player gets a repository, every world gets a tree.

## Getting Started

\`\`\`sh
ether clone @ether/library
\`\`\`

## Worlds

- **#genesis** — The origin world
- **#sandbox** — Experimental playground

## Links

- [Library](/library) — Core runtime primitives
- [Pull Requests](/-/pulls) — Open contributions
`;

const repository: Repository = {
  user: 'ether',
  description: 'The Ether runtime environment',
  tree: [
    { name: 'README.md', isDirectory: false, modified: 'today', content: ETHER_ROOT_README },
    {
      name: 'library',
      isDirectory: true,
      modified: 'yesterday',
      children: [
        {
          name: 'src',
          isDirectory: true,
          modified: '2 days ago',
          children: [
            { op: '|', entries: [
              { name: 'Ray.ts', isDirectory: false, modified: '2 days ago', content: RAY_TS_V1 },
              { name: 'Ray.ts', isDirectory: false, modified: '5 days ago', content: RAY_TS_V2 },
            ]},
            { name: 'Vertex.ts', isDirectory: false, modified: '5 days ago', content: VERTEX_TS_CONTENT },
            { name: 'Edge.ts', isDirectory: false, modified: '5 days ago', content: EDGE_TS_CONTENT },
            { name: 'Orbit.ts', isDirectory: false, modified: '3 days ago', content: ORBIT_TS_CONTENT, access: 'player' },
            { name: 'index.ts', isDirectory: false, modified: '2 days ago', content: INDEX_TS_CONTENT, children: [
              { name: 'types', isDirectory: true, modified: '3 days ago', children: [
                { name: 'Ray.d.ts', isDirectory: false, modified: '3 days ago' },
                { name: 'index.d.ts', isDirectory: false, modified: '3 days ago' },
              ]},
            ]},
          ],
        },
        {
          name: 'docs',
          isDirectory: true,
          modified: '1 week ago',
          children: [
            { name: 'getting-started.md', isDirectory: false, modified: '1 week ago' },
            { name: 'api.md', isDirectory: false, modified: '1 week ago' },
            { name: 'architecture.md', isDirectory: false, modified: '2 weeks ago', access: 'npc' },
            { name: 'README.md', isDirectory: false, modified: '1 week ago', content: DOCS_README },
          ],
        },
        {
          name: 'examples',
          isDirectory: true,
          modified: '4 days ago',
          children: [
            { name: 'basic.ray', isDirectory: false, modified: '1 week ago', access: 'everyone' },
            { name: 'composition.ray', isDirectory: false, modified: '4 days ago' },
            { name: 'orbit.ray', isDirectory: false, modified: '4 days ago' },
            generatedTestEntry,
          ],
        },
        {
          name: 'assets',
          isDirectory: true,
          modified: '2 weeks ago',
          children: [
            { name: 'logo.svg', isDirectory: false, modified: '2 weeks ago' },
            { name: 'banner.png', isDirectory: false, modified: '2 weeks ago' },
          ],
        },
        {
          op: '|',
          entries: [
            { name: 'README.md', isDirectory: false, modified: 'yesterday', content: README_CONTENT },
            { name: 'README.md', isDirectory: false, modified: '3 days ago', content: ALT_README },
          ],
        },
        { name: 'index.ray.js', isDirectory: false, modified: 'today', content: `document.body.style.background = '#0a0a0a';
document.body.style.color = '#fff';
document.body.style.fontFamily = "'Courier New', monospace";

window.addEventListener('ether:ready', async () => {
  const el = document.createElement('div');
  el.style.padding = '40px';

  const count = parseInt(await ether.storage.get('visits') || '0') + 1;
  await ether.storage.set('visits', String(count));

  el.innerHTML = \`<h1>@ether/library</h1>
    <p>Hello, <strong>@\${ether.user}</strong>.</p>
    <p>Visit #\${count}</p>\`;
  document.body.appendChild(el);
});
` },
        {
          op: '&',
          entries: [
            { name: 'package.json', isDirectory: false, modified: '3 days ago' },
            { name: 'tsconfig.json', isDirectory: false, modified: '1 week ago' },
          ],
        },
        { name: 'LICENSE', isDirectory: false, modified: '1 month ago' },
        { name: '.gitignore', isDirectory: false, modified: '1 month ago', access: 'private' },
        {
          name: '@annotations',
          isDirectory: true,
          modified: '1 day ago',
          access: 'local',
          children: [
            { name: 'design-notes.ray', isDirectory: false, modified: '1 day ago', content: '// @annotations: Design notes\n// This directory tests @-prefix escaping' },
          ],
        },
        {
          name: '~drafts',
          isDirectory: true,
          modified: '2 days ago',
          access: 'private',
          encrypted: true,
          children: [
            { name: 'wip.ray', isDirectory: false, modified: '2 days ago', content: '// ~drafts: Work in progress\n// This directory tests ~-prefix escaping' },
          ],
        },
        {
          name: '*',
          isDirectory: true,
          modified: '3 days ago',
          children: [
            { name: 'glob-match.ray', isDirectory: false, modified: '3 days ago', content: '// * directory: glob patterns\n// This tests *-exact escaping' },
          ],
        },
        {
          name: '-',
          isDirectory: true,
          modified: '4 days ago',
          children: [
            { name: 'archive.ray', isDirectory: false, modified: '4 days ago', content: '// - directory: archive\n// This tests dash-exact escaping' },
          ],
        },
        {
          name: '.ether',
          isDirectory: true,
          modified: 'today',
          access: 'private',
          children: [
            {
              name: '%',
              isDirectory: true,
              modified: 'today',
              children: [
                {
                  name: 'pull-requests',
                  isDirectory: true,
                  modified: 'today',
                  children: [
                    { name: '0.ray', isDirectory: false, modified: '3 days ago', content: '# PR #0: Add Orbit cyclic structure support\nstatus: merged\nauthor: @bob\nsource: @bob/orbit-support\ntarget: main' },
                    { name: '1.ray', isDirectory: false, modified: '1 week ago', content: '# PR #1: Refactor Edge to use generics\nstatus: closed\nauthor: @charlie\nsource: @charlie/edge-generics\ntarget: main' },
                    { name: '2.ray', isDirectory: false, modified: 'today', content: '# PR #2: Add superposition support to Ray\nstatus: open\nauthor: @alice\nsource: @alice/superposition\ntarget: main' },
                    { name: '3.ray', isDirectory: false, modified: 'today', content: '# PR #3: Improve documentation README\nstatus: open\nauthor: @alice\nsource: @alice/docs-update\ntarget: main' },
                  ],
                },
              ],
            },
            {
              name: 'Usage.ray',
              isDirectory: true,
              modified: 'today',
              children: [
                { name: 'index.ray.js', isDirectory: false, modified: 'today', content: USAGE_RAY_JS },
              ],
            },
          ],
        },
      ],
    },
  ],
};

const genesisWorld: Repository = {
  user: 'genesis',
  description: 'The origin world — where it all began',
  tree: [
    {
      name: 'terrain',
      isDirectory: true,
      modified: '3 days ago',
      children: [
        { name: 'heightmap.ray', isDirectory: false, modified: '3 days ago' },
        { name: 'biomes.ray', isDirectory: false, modified: '1 week ago' },
      ],
    },
    {
      name: 'entities',
      isDirectory: true,
      modified: 'yesterday',
      children: [
        { name: 'player.ray', isDirectory: false, modified: 'yesterday', access: 'player' },
        { name: 'npc.ray', isDirectory: false, modified: '4 days ago', access: 'npc' },
      ],
    },
    { name: 'world.config', isDirectory: false, modified: '2 days ago', access: 'everyone' },
    { name: 'README.md', isDirectory: false, modified: '1 week ago' },
  ],
};

const sandboxWorld: Repository = {
  user: 'sandbox',
  description: 'An experimental sandbox world',
  tree: [
    {
      name: 'experiments',
      isDirectory: true,
      modified: 'yesterday',
      children: [
        { name: 'gravity.ray', isDirectory: false, modified: 'yesterday' },
        { name: 'time-dilation.ray', isDirectory: false, modified: '3 days ago' },
      ],
    },
    { name: 'world.config', isDirectory: false, modified: '1 week ago' },
    { name: 'README.md', isDirectory: false, modified: '2 weeks ago' },
  ],
};

const ALICE_PROFILE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<circle cx="32" cy="32" r="30" fill="#1a1a2e"/>
<circle cx="32" cy="24" r="10" fill="#c084fc"/>
<ellipse cx="32" cy="48" rx="16" ry="12" fill="#c084fc"/>
<circle cx="28" cy="22" r="2" fill="#1a1a2e"/>
<circle cx="36" cy="22" r="2" fill="#1a1a2e"/>
</svg>`;

const ALICE_README = `# @alice

Hey! I'm Alice, a genesis inhabitant exploring the Ether.

## About

I work on **superposition support** for Ray and contribute to the core library.

## Projects

- \`@ether/library\` — Core contributor
- \`orbit-support\` — Cyclic structure experiments

## Contact

Find me in #genesis or open a PR!
`;

const aliceRepo: Repository = {
  user: 'alice',
  description: 'Alice — a genesis inhabitant',
  tree: [
    { name: 'avatar', isDirectory: true, modified: '1 week ago', children: [
      { name: '2d-square.svg', isDirectory: false, modified: '1 week ago', content: ALICE_PROFILE_SVG },
    ]},
    { name: 'notes.md', isDirectory: false, modified: '2 days ago', access: 'private' },
    { name: 'README.md', isDirectory: false, modified: '3 days ago', content: ALICE_README },
  ],
};

const bobRepo: Repository = {
  user: 'bob',
  description: 'Bob — a genesis builder',
  tree: [
    { name: 'blueprints', isDirectory: true, modified: 'yesterday', children: [
      { name: 'tower.ray', isDirectory: false, modified: 'yesterday' },
    ]},
    { name: 'README.md', isDirectory: false, modified: '5 days ago', content: `# @bob

Builder and architect in genesis. I design structural blueprints for world construction.

## Current Work

- **Tower blueprints** — Modular tower designs for genesis terrain
- **Orbit support** — Contributed cyclic structure PR to @ether/library

> "Build it once, compose it forever."
` },
  ],
};

const charlieRepo: Repository = {
  user: 'charlie',
  description: 'Charlie — sandbox tester',
  tree: [
    { name: 'logs', isDirectory: true, modified: '1 week ago', children: [
      { name: 'test-run-1.log', isDirectory: false, modified: '1 week ago' },
    ]},
    { name: 'README.md', isDirectory: false, modified: '1 week ago', content: `# @charlie

Sandbox tester and edge-case hunter. I break things so you don't have to.

## Testing

I run validation suites against the sandbox world to ensure stability.
` },
  ],
};

const alphaWorld: Repository = {
  user: 'alpha',
  description: 'A nested sub-world within genesis',
  tree: [
    { name: 'seed.ray', isDirectory: false, modified: '5 days ago' },
  ],
};

const allRepositories: Repository[] = [repository, aliceRepo, bobRepo, charlieRepo];

const allWorlds: Map<string, Map<string, Repository>> = new Map([
  ['ether', new Map([
    ['genesis', genesisWorld],
    ['sandbox', sandboxWorld],
  ])],
  ['genesis', new Map([
    ['alpha', alphaWorld],
  ])],
]);

export function getRepository(user: string): Repository | null {
  return allRepositories.find(r => r.user === user) || null;
}

export function getReferencedUsers(user: string, world?: string | null): string[] {
  if (world === 'genesis') return ['alice', 'bob'];
  if (world === 'sandbox') return ['charlie'];
  if (world) return [];  // inside a world with no explicit entries
  if (user === 'ether') return ['ether'];
  return [];
}

export function getReferencedWorlds(user: string, world?: string | null): string[] {
  if (world === 'genesis') return ['alpha'];
  if (world === 'sandbox') return [];
  if (world) return [];  // inside a world with no explicit entries
  const worlds = allWorlds.get(user);
  return worlds ? [...worlds.keys()] : [];
}

export function getWorld(user: string, world: string): Repository | null {
  return allWorlds.get(user)?.get(world) || null;
}

export function resolveDirectory(tree: TreeEntry[], pathSegments: string[]): TreeEntry[] | null {
  let current = tree;
  for (const segment of pathSegments) {
    const flat = flattenEntries(current);
    const entry = flat.find(e => e.name === segment && e.isDirectory);
    if (!entry || !entry.children) return null;
    current = entry.children;
  }
  return current;
}

export function resolveFile(tree: TreeEntry[], pathSegments: string[]): FileEntry | null {
  if (pathSegments.length === 0) return null;
  const dirPath = pathSegments.slice(0, -1);
  const fileName = pathSegments[pathSegments.length - 1];
  const dir = dirPath.length > 0 ? resolveDirectory(tree, dirPath) : tree;
  if (!dir) return null;
  const flat = flattenEntries(dir);
  return flat.find(e => e.name === fileName && !e.isDirectory) || null;
}

/** Like resolveDirectory but also traverses file entries that have children. */
function resolveFlexible(tree: TreeEntry[], pathSegments: string[]): TreeEntry[] | null {
  let current = tree;
  for (const segment of pathSegments) {
    const flat = flattenEntries(current);
    const entry = flat.find(e => e.name === segment && (e.isDirectory || (e.children && e.children.length > 0)));
    if (!entry || !entry.children) return null;
    current = entry.children;
  }
  return current;
}

export function resolveFiles(tree: TreeEntry[], pathSegments: string[]): FileEntry[] {
  if (pathSegments.length === 0) return [];
  const dirPath = pathSegments.slice(0, -1);
  const fileName = pathSegments[pathSegments.length - 1];
  const dir = dirPath.length > 0 ? resolveFlexible(tree, dirPath) : tree;
  if (!dir) return [];
  const flat = flattenEntries(dir);
  return flat.filter(e => e.name === fileName && !e.isDirectory);
}

// ---- Pull Request dummy data ----

const dummyPullRequests: Map<string, PullRequest[]> = new Map();

// PRs for @ether/library
const etherLibraryPRs: PullRequest[] = [
  {
    id: 0,
    title: 'Add Orbit cyclic structure support',
    description: `Adds the \`Orbit\` class for representing cyclic equivalence classes of rays.\n\nThis introduces:\n- \`Orbit\` constructor from a list of rays\n- \`rotate()\`, \`merge()\`, \`contains()\` methods\n- Cycle edge construction via \`Ray.orbit()\``,
    status: 'merged',
    author: 'bob',
    createdAt: '2025-12-01T10:00:00Z',
    updatedAt: '2025-12-03T14:00:00Z',
    sourceVersion: 'a1b2c3d4-e5f6-11ee-b001-000000000001',
    targetVersion: 'a1b2c3d4-e5f6-11ee-b001-000000000000',
    sourceLabel: 'bob/orbit-support',
    targetLabel: 'main',
    commits: [
      {
        id: 'c0a1b2c3-d4e5-11ee-b001-000000000010',
        message: 'Add Orbit class with cyclic structure operations',
        author: 'bob',
        createdAt: '2025-12-01T10:30:00Z',
        diffs: [
          {
            path: 'src/Orbit.ts',
            oldContent: '',
            newContent: ORBIT_TS_CONTENT,
            type: 'added',
          },
        ],
      },
    ],
    comments: [
      { id: 0, author: 'alice', body: 'Looks great! The `rotate()` method is exactly what we needed for the cycle resolution algorithm.', createdAt: '2025-12-01T15:00:00Z' },
      { id: 1, author: 'bob', body: 'Thanks! I also added `merge()` for combining orbits — should help with the distributed case.', createdAt: '2025-12-02T09:00:00Z' },
    ],
    activity: [
      { type: 'commit', commit: { id: 'c0a1b2c3-d4e5-11ee-b001-000000000010', message: 'Add Orbit class with cyclic structure operations', author: 'bob', createdAt: '2025-12-01T10:30:00Z', diffs: [] }, createdAt: '2025-12-01T10:30:00Z' },
      { type: 'comment', comment: { id: 0, author: 'alice', body: 'Looks great! The `rotate()` method is exactly what we needed for the cycle resolution algorithm.', createdAt: '2025-12-01T15:00:00Z' }, createdAt: '2025-12-01T15:00:00Z' },
      { type: 'comment', comment: { id: 1, author: 'bob', body: 'Thanks! I also added `merge()` for combining orbits — should help with the distributed case.', createdAt: '2025-12-02T09:00:00Z' }, createdAt: '2025-12-02T09:00:00Z' },
      { type: 'status_change', from: 'open', to: 'merged', author: 'alice', createdAt: '2025-12-03T14:00:00Z' },
      { type: 'merge', author: 'alice', createdAt: '2025-12-03T14:00:00Z' },
    ],
    mergeable: false,
  },
  {
    id: 1,
    title: 'Refactor Edge to use generics',
    description: `Refactors the \`Edge\` module to use generic type parameters for better type inference.\n\nThis is a breaking change for downstream consumers that rely on the concrete \`Ray\` type in edge construction.`,
    status: 'closed',
    author: 'charlie',
    createdAt: '2025-12-05T08:00:00Z',
    updatedAt: '2025-12-08T12:00:00Z',
    sourceVersion: 'b2c3d4e5-f6a1-11ee-b002-000000000001',
    targetVersion: 'b2c3d4e5-f6a1-11ee-b002-000000000000',
    sourceLabel: 'charlie/edge-generics',
    targetLabel: 'main',
    commits: [
      {
        id: 'c1b2c3d4-e5f6-11ee-b002-000000000010',
        message: 'Refactor Edge module with generic type parameters',
        author: 'charlie',
        createdAt: '2025-12-05T09:00:00Z',
        diffs: [
          {
            path: 'src/Edge.ts',
            oldContent: EDGE_TS_CONTENT,
            newContent: `// Edge.ts — One-dimensional composition of rays (generic)

import { Ray } from './Ray';

export type Edge<T extends Ray = Ray> = T;

export function isEdge(ray: Ray): boolean {
  return !ray.is_vertex;
}

export function createEdge<T extends Ray>(initial: T, terminal: T): Edge<T> {
  return Ray.edge(initial, terminal) as Edge<T>;
}

export function chain<T extends Ray>(...rays: T[]): Edge<T> {
  if (rays.length === 0) return Ray.vertex() as Edge<T>;
  let current: Ray = rays[0];
  for (let i = 1; i < rays.length; i++) {
    current = current.compose(rays[i]);
  }
  return current as Edge<T>;
}

export function reverse<T extends Ray>(edge: Edge<T>): Edge<T> {
  return Ray.edge(edge.terminal, edge.initial) as Edge<T>;
}

export namespace EdgeOps {
  export function length(edge: Edge): number {
    let count = 0;
    let current: Ray = edge;
    while (!current.is_vertex) {
      count++;
      current = current.terminal;
    }
    return count;
  }
}`,
            type: 'modified',
          },
        ],
      },
    ],
    comments: [
      { id: 2, author: 'alice', body: 'I think this introduces too much complexity for the current use case. Can we revisit after the v2 migration?', createdAt: '2025-12-06T10:00:00Z' },
    ],
    activity: [
      { type: 'commit', commit: { id: 'c1b2c3d4-e5f6-11ee-b002-000000000010', message: 'Refactor Edge module with generic type parameters', author: 'charlie', createdAt: '2025-12-05T09:00:00Z', diffs: [] }, createdAt: '2025-12-05T09:00:00Z' },
      { type: 'comment', comment: { id: 2, author: 'alice', body: 'I think this introduces too much complexity for the current use case. Can we revisit after the v2 migration?', createdAt: '2025-12-06T10:00:00Z' }, createdAt: '2025-12-06T10:00:00Z' },
      { type: 'status_change', from: 'open', to: 'closed', author: 'charlie', createdAt: '2025-12-08T12:00:00Z' },
    ],
    mergeable: false,
  },
  {
    id: 2,
    title: 'Add superposition support to Ray',
    description: `Introduces superposition semantics to the \`Ray\` class, enabling quantum-style composition.\n\n## Changes\n- New \`Ray.superpose(...rays)\` static method\n- New \`superpositions\` getter\n- Updated \`is_equivalent\` to handle superposed rays\n- Added \`RayLike\` interface for structural typing`,
    status: 'open',
    author: 'alice',
    createdAt: '2025-12-10T09:00:00Z',
    updatedAt: '2025-12-12T16:00:00Z',
    sourceVersion: 'c3d4e5f6-a1b2-11ee-b003-000000000001',
    targetVersion: 'c3d4e5f6-a1b2-11ee-b003-000000000000',
    sourceLabel: 'alice/superposition',
    targetLabel: 'main',
    commits: [
      {
        id: 'c2a1b2c3-d4e5-11ee-b003-000000000010',
        message: 'Add RayLike interface and superpose static method',
        author: 'alice',
        createdAt: '2025-12-10T10:00:00Z',
        diffs: [
          {
            path: 'src/Ray.ts',
            oldContent: RAY_TS_V1,
            newContent: `// Ray.ts — The fundamental compositional primitive
// v1.5: Adding superposition groundwork

import { Vertex } from './Vertex';
import { Edge } from './Edge';

export type Equivalence<T> = (a: T, b: T) => boolean;

export interface RayLike {
  readonly initial: RayLike;
  readonly terminal: RayLike;
  readonly is_vertex: boolean;
  compose(other: RayLike): RayLike;
}

export class Ray implements RayLike {
  private _initial: Ray | null = null;
  private _terminal: Ray | null = null;
  private _vertex: boolean;

  private constructor(vertex: boolean = false) {
    this._vertex = vertex;
  }

  static vertex(): Ray {
    const r = new Ray(true);
    r._initial = r;
    r._terminal = r;
    return r;
  }

  static edge(a: Ray, b: Ray): Ray {
    const r = new Ray(false);
    r._initial = a;
    r._terminal = b;
    return r;
  }

  static orbit(rays: Ray[]): Ray {
    if (rays.length === 0) return Ray.vertex();
    let current = rays[0];
    for (let i = 1; i < rays.length; i++) {
      current = Ray.edge(current, rays[i]);
    }
    return Ray.edge(current, rays[0]);
  }

  get initial(): Ray { return this._initial ?? this; }
  get terminal(): Ray { return this._terminal ?? this; }
  get is_vertex(): boolean { return this._vertex; }

  compose(other: Ray): Ray {
    return Ray.edge(this, other);
  }

  is_equivalent(other: Ray): boolean {
    if (this === other) return true;
    if (this._vertex && other._vertex) return true;
    return false;
  }

  static equivalent(a: Ray, b: Ray): boolean {
    return a.is_equivalent(b);
  }

  toString(): string {
    if (this._vertex) return '(*)';
    return \`(\${this._initial} -> \${this._terminal})\`;
  }
}`,
            type: 'modified',
          },
        ],
      },
      {
        id: 'c2b1c2d3-e4f5-11ee-b003-000000000011',
        message: 'Implement full superposition with equivalence checks',
        author: 'alice',
        createdAt: '2025-12-11T14:00:00Z',
        diffs: [
          {
            path: 'src/Ray.ts',
            oldContent: RAY_TS_V1,
            newContent: RAY_TS_V2,
            type: 'modified',
          },
        ],
      },
    ],
    comments: [
      { id: 3, author: 'bob', body: 'The `RayLike` interface is a nice touch. Will this support cross-universe superposition eventually?', createdAt: '2025-12-10T14:00:00Z' },
      { id: 4, author: 'alice', body: 'That is the plan! This PR lays the groundwork. Cross-universe will come in a follow-up.', createdAt: '2025-12-10T16:00:00Z' },
      { id: 5, author: 'charlie', body: 'I tested the equivalence changes — they pass all existing test cases plus the new superposition ones.', createdAt: '2025-12-12T11:00:00Z' },
    ],
    activity: [
      { type: 'commit', commit: { id: 'c2a1b2c3-d4e5-11ee-b003-000000000010', message: 'Add RayLike interface and superpose static method', author: 'alice', createdAt: '2025-12-10T10:00:00Z', diffs: [] }, createdAt: '2025-12-10T10:00:00Z' },
      { type: 'comment', comment: { id: 3, author: 'bob', body: 'The `RayLike` interface is a nice touch. Will this support cross-universe superposition eventually?', createdAt: '2025-12-10T14:00:00Z' }, createdAt: '2025-12-10T14:00:00Z' },
      { type: 'comment', comment: { id: 4, author: 'alice', body: 'That is the plan! This PR lays the groundwork. Cross-universe will come in a follow-up.', createdAt: '2025-12-10T16:00:00Z' }, createdAt: '2025-12-10T16:00:00Z' },
      { type: 'commit', commit: { id: 'c2b1c2d3-e4f5-11ee-b003-000000000011', message: 'Implement full superposition with equivalence checks', author: 'alice', createdAt: '2025-12-11T14:00:00Z', diffs: [] }, createdAt: '2025-12-11T14:00:00Z' },
      { type: 'comment', comment: { id: 5, author: 'charlie', body: 'I tested the equivalence changes — they pass all existing test cases plus the new superposition ones.', createdAt: '2025-12-12T11:00:00Z' }, createdAt: '2025-12-12T11:00:00Z' },
    ],
    mergeable: true,
  },
  {
    id: 3,
    title: 'Improve documentation README',
    description: `Updates the README to reflect the v2 API changes and adds migration guide.\n\nThis aligns the documentation with the in-progress superposition branch.`,
    status: 'open',
    author: 'alice',
    createdAt: '2025-12-13T11:00:00Z',
    updatedAt: '2025-12-13T11:00:00Z',
    sourceVersion: 'd4e5f6a1-b2c3-11ee-b004-000000000001',
    targetVersion: 'd4e5f6a1-b2c3-11ee-b004-000000000000',
    sourceLabel: 'alice/docs-update',
    targetLabel: 'main',
    commits: [
      {
        id: 'c3a1b2c3-d4e5-11ee-b004-000000000010',
        message: 'Update README with v2 API changes and migration guide',
        author: 'alice',
        createdAt: '2025-12-13T11:30:00Z',
        diffs: [
          {
            path: 'README.md',
            oldContent: README_CONTENT,
            newContent: ALT_README,
            type: 'modified',
          },
        ],
      },
    ],
    comments: [],
    activity: [
      { type: 'commit', commit: { id: 'c3a1b2c3-d4e5-11ee-b004-000000000010', message: 'Update README with v2 API changes and migration guide', author: 'alice', createdAt: '2025-12-13T11:30:00Z', diffs: [] }, createdAt: '2025-12-13T11:30:00Z' },
    ],
    mergeable: true,
  },
];

dummyPullRequests.set('@ether/library', etherLibraryPRs);

// PRs for @ether/library/assets (nested sub-path)
const etherLibraryAssetsPRs: PullRequest[] = [
  {
    id: 100,
    title: 'Add high-res banner variants',
    description: 'Adds 2x and 3x resolution variants of the banner for retina displays.',
    status: 'open',
    author: 'bob',
    createdAt: '2025-12-14T09:00:00Z',
    updatedAt: '2025-12-14T09:00:00Z',
    sourceVersion: 'e5f6a1b2-c3d4-11ee-b005-000000000001',
    targetVersion: 'e5f6a1b2-c3d4-11ee-b005-000000000000',
    sourceLabel: 'bob/hires-assets',
    targetLabel: 'main',
    commits: [
      {
        id: 'c4a1b2c3-d4e5-11ee-b005-000000000010',
        message: 'Add banner@2x.png and banner@3x.png',
        author: 'bob',
        createdAt: '2025-12-14T09:30:00Z',
        diffs: [
          { path: 'banner@2x.png', oldContent: '', newContent: '(binary)', type: 'added' },
          { path: 'banner@3x.png', oldContent: '', newContent: '(binary)', type: 'added' },
        ],
      },
    ],
    comments: [
      { id: 10, author: 'alice', body: 'These look sharp! Can we also get an SVG version?', createdAt: '2025-12-14T12:00:00Z' },
    ],
    activity: [
      { type: 'commit', commit: { id: 'c4a1b2c3-d4e5-11ee-b005-000000000010', message: 'Add banner@2x.png and banner@3x.png', author: 'bob', createdAt: '2025-12-14T09:30:00Z', diffs: [] }, createdAt: '2025-12-14T09:30:00Z' },
      { type: 'comment', comment: { id: 10, author: 'alice', body: 'These look sharp! Can we also get an SVG version?', createdAt: '2025-12-14T12:00:00Z' }, createdAt: '2025-12-14T12:00:00Z' },
    ],
    mergeable: true,
  },
  {
    id: 101,
    title: 'Update logo color scheme',
    description: 'Changes the logo to match the new brand guidelines.',
    status: 'merged',
    author: 'alice',
    createdAt: '2025-12-08T10:00:00Z',
    updatedAt: '2025-12-09T15:00:00Z',
    sourceVersion: 'f6a1b2c3-d4e5-11ee-b006-000000000001',
    targetVersion: 'f6a1b2c3-d4e5-11ee-b006-000000000000',
    sourceLabel: 'alice/logo-update',
    targetLabel: 'main',
    commits: [
      {
        id: 'c5a1b2c3-d4e5-11ee-b006-000000000010',
        message: 'Update logo.svg with new color palette',
        author: 'alice',
        createdAt: '2025-12-08T10:30:00Z',
        diffs: [
          { path: 'logo.svg', oldContent: '<svg><!-- old --></svg>', newContent: '<svg><!-- new colors --></svg>', type: 'modified' },
        ],
      },
    ],
    comments: [],
    activity: [
      { type: 'commit', commit: { id: 'c5a1b2c3-d4e5-11ee-b006-000000000010', message: 'Update logo.svg with new color palette', author: 'alice', createdAt: '2025-12-08T10:30:00Z', diffs: [] }, createdAt: '2025-12-08T10:30:00Z' },
      { type: 'merge', author: 'bob', createdAt: '2025-12-09T15:00:00Z' },
    ],
    mergeable: false,
  },
];

dummyPullRequests.set('@ether/library/assets', etherLibraryAssetsPRs);

// PRs for @ether/genesis (world — separate from inline listing)
const etherGenesisPRs: PullRequest[] = [
  {
    id: 200,
    title: 'Update terrain heightmap generator',
    description: 'Improves terrain generation with Perlin noise for smoother landscapes.',
    status: 'open',
    author: 'alice',
    createdAt: '2025-12-15T09:00:00Z',
    updatedAt: '2025-12-15T09:00:00Z',
    sourceVersion: 'g1a1b2c3-d4e5-11ee-b010-000000000001',
    targetVersion: 'g1a1b2c3-d4e5-11ee-b010-000000000000',
    sourceLabel: 'alice/terrain-update',
    targetLabel: 'main',
    commits: [{
      id: 'cg1b2c3d-e4f5-11ee-b010-000000000010',
      message: 'Implement Perlin noise heightmap generation',
      author: 'alice',
      createdAt: '2025-12-15T09:30:00Z',
      diffs: [{ path: 'terrain/heightmap.ray', oldContent: '// old heightmap', newContent: '// new Perlin noise heightmap', type: 'modified' }],
    }],
    comments: [{ id: 20, author: 'bob', body: 'The noise parameters look good. Maybe add a seed option?', createdAt: '2025-12-15T14:00:00Z' }],
    activity: [
      { type: 'commit', commit: { id: 'cg1b2c3d-e4f5-11ee-b010-000000000010', message: 'Implement Perlin noise heightmap generation', author: 'alice', createdAt: '2025-12-15T09:30:00Z', diffs: [] }, createdAt: '2025-12-15T09:30:00Z' },
      { type: 'comment', comment: { id: 20, author: 'bob', body: 'The noise parameters look good. Maybe add a seed option?', createdAt: '2025-12-15T14:00:00Z' }, createdAt: '2025-12-15T14:00:00Z' },
    ],
    mergeable: true,
  },
  {
    id: 201,
    title: 'Add NPC dialogue system',
    description: 'Implements a basic dialogue tree system for world NPCs.',
    status: 'open',
    author: 'bob',
    createdAt: '2025-12-16T11:00:00Z',
    updatedAt: '2025-12-16T11:00:00Z',
    sourceVersion: 'g2a1b2c3-d4e5-11ee-b011-000000000001',
    targetVersion: 'g2a1b2c3-d4e5-11ee-b011-000000000000',
    sourceLabel: 'bob/npc-dialogue',
    targetLabel: 'main',
    commits: [{
      id: 'cg2b2c3d-e4f5-11ee-b011-000000000010',
      message: 'Add basic dialogue tree for NPCs',
      author: 'bob',
      createdAt: '2025-12-16T11:30:00Z',
      diffs: [{ path: 'entities/npc.ray', oldContent: '// basic npc', newContent: '// npc with dialogue', type: 'modified' }],
    }],
    comments: [],
    activity: [
      { type: 'commit', commit: { id: 'cg2b2c3d-e4f5-11ee-b011-000000000010', message: 'Add basic dialogue tree for NPCs', author: 'bob', createdAt: '2025-12-16T11:30:00Z', diffs: [] }, createdAt: '2025-12-16T11:30:00Z' },
    ],
    mergeable: true,
  },
];

// Store world PRs under ~genesis (world prefix), not the folder genesis
dummyPullRequests.set('@ether/~genesis', etherGenesisPRs);

// PRs for @ether/@alice (player sub-namespace)
const etherAlicePRs: PullRequest[] = [
  {
    id: 300,
    title: 'Update profile configuration',
    description: 'Reorganizes profile settings and adds new bio section.',
    status: 'open',
    author: 'alice',
    createdAt: '2025-12-17T10:00:00Z',
    updatedAt: '2025-12-17T10:00:00Z',
    sourceVersion: 'p1a1b2c3-d4e5-11ee-b020-000000000001',
    targetVersion: 'p1a1b2c3-d4e5-11ee-b020-000000000000',
    sourceLabel: 'alice/profile-update',
    targetLabel: 'main',
    commits: [{
      id: 'cp1b2c3d-e4f5-11ee-b020-000000000010',
      message: 'Add bio section to profile',
      author: 'alice',
      createdAt: '2025-12-17T10:30:00Z',
      diffs: [{ path: 'profile.ray', oldContent: '// basic profile', newContent: '// profile with bio', type: 'modified' }],
    }],
    comments: [],
    activity: [
      { type: 'commit', commit: { id: 'cp1b2c3d-e4f5-11ee-b020-000000000010', message: 'Add bio section to profile', author: 'alice', createdAt: '2025-12-17T10:30:00Z', diffs: [] }, createdAt: '2025-12-17T10:30:00Z' },
    ],
    mergeable: true,
  },
];

dummyPullRequests.set('@ether/@alice', etherAlicePRs);

// PRs for nested world ~alpha within ~genesis
const genesisAlphaPRs: PullRequest[] = [
  {
    id: 400,
    title: 'Initialize world seed parameters',
    description: 'Sets up the initial seed configuration for the alpha sub-world.',
    status: 'open',
    author: 'alice',
    createdAt: '2025-12-18T09:00:00Z',
    updatedAt: '2025-12-18T09:00:00Z',
    sourceVersion: 'h1a1b2c3-d4e5-11ee-b030-000000000001',
    targetVersion: 'h1a1b2c3-d4e5-11ee-b030-000000000000',
    sourceLabel: 'alice/alpha-seed',
    targetLabel: 'main',
    commits: [{
      id: 'ch1b2c3d-e4f5-11ee-b030-000000000010',
      message: 'Configure alpha world seed parameters',
      author: 'alice',
      createdAt: '2025-12-18T09:30:00Z',
      diffs: [{ path: 'seed.ray', oldContent: '// empty seed', newContent: '// configured seed with params', type: 'modified' }],
    }],
    comments: [],
    activity: [
      { type: 'commit', commit: { id: 'ch1b2c3d-e4f5-11ee-b030-000000000010', message: 'Configure alpha world seed parameters', author: 'alice', createdAt: '2025-12-18T09:30:00Z', diffs: [] }, createdAt: '2025-12-18T09:30:00Z' },
    ],
    mergeable: true,
  },
];

dummyPullRequests.set('@ether/~genesis/~alpha', genesisAlphaPRs);

// PRs for player @bob within ~genesis
const genesisBobPRs: PullRequest[] = [
  {
    id: 401,
    title: 'Add builder toolkit blueprints',
    description: 'Adds Bob\'s builder toolkit with tower blueprints for genesis.',
    status: 'open',
    author: 'bob',
    createdAt: '2025-12-19T11:00:00Z',
    updatedAt: '2025-12-19T11:00:00Z',
    sourceVersion: 'h2a1b2c3-d4e5-11ee-b031-000000000001',
    targetVersion: 'h2a1b2c3-d4e5-11ee-b031-000000000000',
    sourceLabel: 'bob/builder-toolkit',
    targetLabel: 'main',
    commits: [{
      id: 'ch2b2c3d-e4f5-11ee-b031-000000000010',
      message: 'Add tower blueprint templates',
      author: 'bob',
      createdAt: '2025-12-19T11:30:00Z',
      diffs: [{ path: 'blueprints/tower.ray', oldContent: '', newContent: '// tower blueprint v2', type: 'added' }],
    }],
    comments: [],
    activity: [
      { type: 'commit', commit: { id: 'ch2b2c3d-e4f5-11ee-b031-000000000010', message: 'Add tower blueprint templates', author: 'bob', createdAt: '2025-12-19T11:30:00Z', diffs: [] }, createdAt: '2025-12-19T11:30:00Z' },
    ],
    mergeable: true,
  },
];

dummyPullRequests.set('@ether/~genesis/@bob', genesisBobPRs);

// ---- PR accessor functions ----

/** Get PRs registered directly at this path (not nested). */
export function getPullRequests(canonicalPath: string): PullRequest[] {
  return dummyPullRequests.get(canonicalPath) || [];
}

/** Get ALL PRs at this path and all nested sub-paths. */
export function getAllPullRequests(canonicalPath: string): PullRequest[] {
  const result: PullRequest[] = [];
  const prefix = canonicalPath + '/';
  for (const [key, prs] of dummyPullRequests) {
    if (key === canonicalPath || key.startsWith(prefix)) {
      result.push(...prs);
    }
  }
  return result;
}

/** A PR paired with its relative folder path (empty string if direct). */
export interface InlinePR {
  pr: PullRequest;
  relPath: string;
}

/** Get PRs for the inline list — includes nested sub-paths but excludes
 *  world (~) and player (@) sub-paths at any level (those get category rows). */
export function getInlinePullRequests(canonicalPath: string): InlinePR[] {
  const result: InlinePR[] = [];
  const prefix = canonicalPath + '/';

  for (const [key, prs] of dummyPullRequests) {
    if (key === canonicalPath) {
      for (const pr of prs) result.push({ pr, relPath: '' });
    } else if (key.startsWith(prefix)) {
      const rest = key.slice(prefix.length);
      const firstSeg = rest.split('/')[0];
      // Always exclude ~ (worlds) and @ (players) sub-paths — they get their own category rows
      if (firstSeg.startsWith('~') || firstSeg.startsWith('@')) continue;
      for (const pr of prs) result.push({ pr, relPath: rest });
    }
  }
  return result;
}

/** Summary of PRs in a category (worlds or players). */
export interface CategoryPRSummary {
  openCount: number;
  closedCount: number;
  itemCount: number;
}

/** Get summary of PRs in ~ or @ prefixed sub-paths. Works at any level. */
export function getCategoryPRSummary(canonicalPath: string, categoryPrefix: '~' | '@'): CategoryPRSummary | null {
  const prefix = canonicalPath + '/';
  const items = new Set<string>();
  let openCount = 0;
  let closedCount = 0;

  for (const [key, prs] of dummyPullRequests) {
    if (key.startsWith(prefix)) {
      const rest = key.slice(prefix.length);
      const firstSeg = rest.split('/')[0];
      if (firstSeg.startsWith(categoryPrefix)) {
        items.add(firstSeg);
        openCount += prs.filter(pr => pr.status === 'open').length;
        closedCount += prs.filter(pr => pr.status !== 'open').length;
      }
    }
  }

  if (items.size === 0) return null;
  return { openCount, closedCount, itemCount: items.size };
}

/** Get PRs from a specific category (worlds ~ or players @) for the category list page. */
export function getCategoryPullRequests(canonicalPath: string, categoryPrefix: '~' | '@'): InlinePR[] {
  const result: InlinePR[] = [];
  const prefix = canonicalPath + '/';

  for (const [key, prs] of dummyPullRequests) {
    if (key.startsWith(prefix)) {
      const rest = key.slice(prefix.length);
      const firstSeg = rest.split('/')[0];
      if (firstSeg.startsWith(categoryPrefix)) {
        for (const pr of prs) result.push({ pr, relPath: rest });
      }
    }
  }
  return result;
}

export function getPullRequest(canonicalPath: string, prId: number): PullRequest | null {
  // Search at this path first, then nested paths
  const direct = getPullRequests(canonicalPath);
  const found = direct.find(pr => pr.id === prId);
  if (found) return found;
  // Search nested (all sub-paths including ~/@ prefixed ones)
  const prefix = canonicalPath + '/';
  for (const [key, prs] of dummyPullRequests) {
    if (key.startsWith(prefix)) {
      const nested = prs.find(pr => pr.id === prId);
      if (nested) return nested;
    }
  }
  return null;
}

/** Open PR count for the PR button — excludes world/player PRs at user root level. */
export function getOpenPRCount(canonicalPath: string): number {
  return getInlinePullRequests(canonicalPath).filter(({ pr }) => pr.status === 'open').length;
}

let nextPRId = 4;

export function createPullRequest(
  canonicalPath: string,
  title: string,
  description: string,
  sourceLabel: string,
  targetLabel: string,
  author?: string,
): PullRequest {
  const pr: PullRequest = {
    id: nextPRId++,
    title,
    description,
    status: 'open',
    author: author || 'anonymous',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sourceVersion: crypto.randomUUID(),
    targetVersion: crypto.randomUUID(),
    sourceLabel,
    targetLabel,
    commits: [],
    comments: [],
    activity: [],
    mergeable: true,
  };
  const prs = dummyPullRequests.get(canonicalPath) || [];
  prs.push(pr);
  dummyPullRequests.set(canonicalPath, prs);
  return pr;
}
