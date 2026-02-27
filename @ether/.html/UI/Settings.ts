// ============================================================
// Settings.ts — Settings page: General & Usage tab
// ============================================================

import { PHOSPHOR, CRT_SCREEN_BG } from './CRTShell.ts';
import type { SettingsParams } from './Router.ts';

let styleEl: HTMLStyleElement | null = null;
let currentContainer: HTMLElement | null = null;
let navigateFn: ((path: string) => void) | null = null;
let currentParams: SettingsParams | null = null;

// ---- SVG Icons ----

const ARROW_LEFT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M512 320L128 320M128 320L288 160M128 320L288 480" fill="none" stroke="currentColor" stroke-width="48" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const INFINITY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M480 200c-66.3 0-120 53.7-120 120 0 0-40-120-120-120S120 253.7 120 320s53.7 120 120 120c80 0 120-120 120-120s53.7 120 120 120 120-53.7 120-120-53.7-120-120-120zM240 392c-39.8 0-72-32.2-72-72s32.2-72 72-72c39.8 0 72 72 72 72s-32.2 72-72 72zm240 0c-39.8 0-72-72-72-72s32.2-72 72-72c39.8 0 72 32.2 72 72s-32.2 72-72 72z" fill="currentColor"/></svg>`;
const AWS_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M220 340l-36 108h-2l-36-108h-34l52 148h38l52-148h-34zm130 0v28c-16-22-36-32-62-32-26 0-48 10-66 30s-26 44-26 74 8 54 26 74 40 30 66 30c26 0 46-10 62-32v28h32V340h-32zm-54 176c-18 0-34-8-46-22s-18-34-18-56 6-42 18-56 28-22 46-22 34 8 46 22 18 34 18 56-6 42-18 56-28 22-46 22zm174-10c-10 0-20-4-28-10s-12-16-12-28h-32c0 22 8 40 24 52s34 20 52 20c22 0 40-6 52-18s20-28 20-46c0-30-20-50-58-62l-20-6c-24-8-36-18-36-32 0-10 4-18 12-24s18-10 28-10c12 0 22 4 30 10s12 16 12 26h32c0-20-8-36-22-48s-32-18-52-18c-22 0-38 6-50 18s-20 26-20 44c0 30 20 50 58 62l20 6c24 8 36 20 36 34 0 10-4 20-12 26s-20 10-34 10z" fill="currentColor"/></svg>`;
const AZURE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M248 96L128 352l80 16L112 544h72l248-280h-136L392 96H248z" fill="currentColor"/></svg>`;
const GCLOUD_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M432 288h64c0-97-79-176-176-176-73 0-136 45-162 108l56 56c10-44 50-76 96-76 53 0 96 43 96 96h-64l80 80 80-80h-70zm-224 64h-64c0 97 79 176 176 176 73 0 136-45 162-108l-56-56c-10 44-50 76-96 76-53 0-96-43-96-96h64l-80-80-80 80h70z" fill="currentColor"/></svg>`;
const STORAGE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M128 128h384v96H128zm0 144h384v96H128zm0 144h384v96H128zM176 176c-13.3 0-24 10.7-24 24s10.7 24 24 24 24-10.7 24-24-10.7-24-24-24zm0 144c-13.3 0-24 10.7-24 24s10.7 24 24 24 24-10.7 24-24-10.7-24-24-24zm0 144c-13.3 0-24 10.7-24 24s10.7 24 24 24 24-10.7 24-24-10.7-24-24-24z" fill="currentColor"/></svg>`;
const NETWORK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M320 96c-123.7 0-224 100.3-224 224s100.3 224 224 224 224-100.3 224-224S443.7 96 320 96zm0 400c-97.2 0-176-78.8-176-176S222.8 144 320 144s176 78.8 176 176-78.8 176-176 176zm-160-192h320v32H160v-32zm144-128v384h32V176h-32z" fill="currentColor"/></svg>`;
const DISK_READ_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M128 96h384c17.7 0 32 14.3 32 32v384c0 17.7-14.3 32-32 32H128c-17.7 0-32-14.3-32-32V128c0-17.7 14.3-32 32-32zm192 352l96-96H368V224h-96v128H224l96 96z" fill="currentColor"/></svg>`;
const DISK_WRITE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M128 96h384c17.7 0 32 14.3 32 32v384c0 17.7-14.3 32-32 32H128c-17.7 0-32-14.3-32-32V128c0-17.7 14.3-32 32-32zm192 64l-96 96h48v128h96V256h48L320 160z" fill="currentColor"/></svg>`;
const SEARCH_INDEX_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M416 352c26.5-38.5 42-85.2 42-136C458 121.7 378.3 42 280 42S102 121.7 102 216s79.7 174 178 174c50.8 0 97.5-15.5 136-42l142 142 34-34-176-104zM280 342c-69.6 0-126-56.4-126-126S210.4 90 280 90s126 56.4 126 126-56.4 126-126 126z" fill="currentColor"/></svg>`;
const FILE_VIEWER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M384 64H192c-35.3 0-64 28.7-64 64v384c0 35.3 28.7 64 64 64h256c35.3 0 64-28.7 64-64V192L384 64zm0 64l128 128H384V128zM224 288h192v32H224v-32zm0 64h192v32H224v-32zm0 64h128v32H224v-32z" fill="currentColor"/></svg>`;
const CLONE_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M352 512L128 512L128 288L176 288L176 224L128 224C92.7 224 64 252.7 64 288L64 512C64 547.3 92.7 576 128 576L352 576C387.3 576 416 547.3 416 512L416 464L352 464L352 512zM288 416L512 416C547.3 416 576 387.3 576 352L576 128C576 92.7 547.3 64 512 64L288 64C252.7 64 224 92.7 224 128L224 352C224 387.3 252.7 416 288 416z" fill="currentColor"/></svg>`;
const CHEVRON_RIGHT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M240 128l192 192-192 192" fill="none" stroke="currentColor" stroke-width="48" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const CHEVRON_DOWN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M128 240l192 192 192-192" fill="none" stroke="currentColor" stroke-width="48" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const CURRENCY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M320 64C178.6 64 64 178.6 64 320s114.6 256 256 256 256-114.6 256-256S461.4 64 320 64zm16 384h-32v-32h32v32zm0-64h-32V192h32v192z" fill="currentColor"/></svg>`;
const FOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M128 128c-35.3 0-64 28.7-64 64v256c0 35.3 28.7 64 64 64h384c35.3 0 64-28.7 64-64V240c0-35.3-28.7-64-64-64H336l-48-48H128z" fill="currentColor"/></svg>`;

// ---- Data Types ----

interface CloudRegion {
  id: string;
  name: string;
  storagePricePerGBMonth: number;
  putPer1000: number;
  getPer1000: number;
  listPer1000: number;
  deletePer1000: number;
  egressPerGB: number;
  ingressPerGB: number;
}

interface CloudProvider {
  id: string;
  name: string;
  icon: string;
  enabled: boolean;
  selectedRegion: string;
  regions: CloudRegion[];
  gcRegionType?: 'single' | 'dual' | 'multi';
}

interface UsageTreeNode {
  name: string;
  isDirectory: boolean;
  storageBytes: number;
  readOps: number;
  writeOps: number;
  networkEgressBytes: number;
  networkIngressBytes: number;
  children: UsageTreeNode[];
}

interface Currency {
  code: string;
  symbol: string;
  name: string;
  rate: number; // conversion from USD
}

interface SettingsState {
  billingPeriod: 'hourly' | 'daily' | 'monthly' | 'yearly';
  currencyCode: string;
  storageQuotaGB: number;
  storageUsedGB: number;
  providers: CloudProvider[];
}

// ---- Currency Data ----

const CURRENCIES: Currency[] = [
  { code: 'USD', symbol: '$', name: 'US Dollar', rate: 1 },
  { code: 'EUR', symbol: '\u20AC', name: 'Euro', rate: 0.92 },
  { code: 'GBP', symbol: '\u00A3', name: 'British Pound', rate: 0.79 },
  { code: 'JPY', symbol: '\u00A5', name: 'Japanese Yen', rate: 149.5 },
  { code: 'CNY', symbol: '\u00A5', name: 'Chinese Yuan', rate: 7.24 },
  { code: 'KRW', symbol: '\u20A9', name: 'South Korean Won', rate: 1320.5 },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar', rate: 1.36 },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', rate: 1.53 },
  { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc', rate: 0.88 },
  { code: 'INR', symbol: '\u20B9', name: 'Indian Rupee', rate: 83.1 },
  { code: 'BRL', symbol: 'R$', name: 'Brazilian Real', rate: 4.97 },
  { code: 'MXN', symbol: 'MX$', name: 'Mexican Peso', rate: 17.15 },
  { code: 'SEK', symbol: 'kr', name: 'Swedish Krona', rate: 10.45 },
  { code: 'NOK', symbol: 'kr', name: 'Norwegian Krone', rate: 10.62 },
  { code: 'PLN', symbol: 'z\u0142', name: 'Polish Zloty', rate: 4.02 },
  { code: 'TRY', symbol: '\u20BA', name: 'Turkish Lira', rate: 30.25 },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar', rate: 1.34 },
  { code: 'BTC', symbol: '\u20BF', name: 'Bitcoin', rate: 0.0000105 },
  { code: 'ETH', symbol: '\u039E', name: 'Ethereum', rate: 0.000312 },
  { code: 'RUB', symbol: '\u20BD', name: 'Russian Ruble', rate: 92.5 },
];

// ---- Cloud Provider Data ----

function createProviders(): CloudProvider[] {
  return [
    {
      id: 'aws', name: 'AWS S3', icon: AWS_SVG, enabled: true, selectedRegion: 'us-east-1',
      regions: [
        { id: 'us-east-1', name: 'US East (N. Virginia)', storagePricePerGBMonth: 0.023, putPer1000: 0.005, getPer1000: 0.0004, listPer1000: 0.005, deletePer1000: 0, egressPerGB: 0.09, ingressPerGB: 0 },
        { id: 'us-west-2', name: 'US West (Oregon)', storagePricePerGBMonth: 0.023, putPer1000: 0.005, getPer1000: 0.0004, listPer1000: 0.005, deletePer1000: 0, egressPerGB: 0.09, ingressPerGB: 0 },
        { id: 'eu-west-1', name: 'EU (Ireland)', storagePricePerGBMonth: 0.023, putPer1000: 0.005, getPer1000: 0.0004, listPer1000: 0.005, deletePer1000: 0, egressPerGB: 0.09, ingressPerGB: 0 },
        { id: 'eu-central-1', name: 'EU (Frankfurt)', storagePricePerGBMonth: 0.0245, putPer1000: 0.0054, getPer1000: 0.00043, listPer1000: 0.0054, deletePer1000: 0, egressPerGB: 0.09, ingressPerGB: 0 },
        { id: 'ap-southeast-1', name: 'Asia Pacific (Singapore)', storagePricePerGBMonth: 0.025, putPer1000: 0.005, getPer1000: 0.0004, listPer1000: 0.005, deletePer1000: 0, egressPerGB: 0.12, ingressPerGB: 0 },
        { id: 'ap-northeast-1', name: 'Asia Pacific (Tokyo)', storagePricePerGBMonth: 0.025, putPer1000: 0.0047, getPer1000: 0.00037, listPer1000: 0.0047, deletePer1000: 0, egressPerGB: 0.114, ingressPerGB: 0 },
        { id: 'sa-east-1', name: 'South America (S\u00E3o Paulo)', storagePricePerGBMonth: 0.0405, putPer1000: 0.007, getPer1000: 0.0006, listPer1000: 0.007, deletePer1000: 0, egressPerGB: 0.15, ingressPerGB: 0 },
      ],
    },
    {
      id: 'azure', name: 'Azure Blob', icon: AZURE_SVG, enabled: true, selectedRegion: 'eastus',
      regions: [
        { id: 'eastus', name: 'East US', storagePricePerGBMonth: 0.018, putPer1000: 0.005, getPer1000: 0.0004, listPer1000: 0.005, deletePer1000: 0, egressPerGB: 0.087, ingressPerGB: 0 },
        { id: 'westus2', name: 'West US 2', storagePricePerGBMonth: 0.018, putPer1000: 0.005, getPer1000: 0.0004, listPer1000: 0.005, deletePer1000: 0, egressPerGB: 0.087, ingressPerGB: 0 },
        { id: 'westeurope', name: 'West Europe', storagePricePerGBMonth: 0.02, putPer1000: 0.005, getPer1000: 0.0004, listPer1000: 0.005, deletePer1000: 0, egressPerGB: 0.087, ingressPerGB: 0 },
        { id: 'northeurope', name: 'North Europe', storagePricePerGBMonth: 0.018, putPer1000: 0.005, getPer1000: 0.0004, listPer1000: 0.005, deletePer1000: 0, egressPerGB: 0.087, ingressPerGB: 0 },
        { id: 'southeastasia', name: 'Southeast Asia', storagePricePerGBMonth: 0.02, putPer1000: 0.005, getPer1000: 0.0004, listPer1000: 0.005, deletePer1000: 0, egressPerGB: 0.12, ingressPerGB: 0 },
        { id: 'japaneast', name: 'Japan East', storagePricePerGBMonth: 0.022, putPer1000: 0.005, getPer1000: 0.0004, listPer1000: 0.005, deletePer1000: 0, egressPerGB: 0.12, ingressPerGB: 0 },
        { id: 'brazilsouth', name: 'Brazil South', storagePricePerGBMonth: 0.035, putPer1000: 0.008, getPer1000: 0.0006, listPer1000: 0.008, deletePer1000: 0, egressPerGB: 0.16, ingressPerGB: 0 },
      ],
    },
    {
      id: 'gcloud', name: 'Google Cloud', icon: GCLOUD_SVG, enabled: true, selectedRegion: 'us-central1',
      gcRegionType: 'single',
      regions: [
        // Single regions
        { id: 'us-central1', name: 'Iowa (Single)', storagePricePerGBMonth: 0.02, putPer1000: 0.005, getPer1000: 0.0004, listPer1000: 0.005, deletePer1000: 0, egressPerGB: 0.12, ingressPerGB: 0 },
        { id: 'us-east1', name: 'S. Carolina (Single)', storagePricePerGBMonth: 0.02, putPer1000: 0.005, getPer1000: 0.0004, listPer1000: 0.005, deletePer1000: 0, egressPerGB: 0.12, ingressPerGB: 0 },
        { id: 'europe-west1', name: 'Belgium (Single)', storagePricePerGBMonth: 0.02, putPer1000: 0.005, getPer1000: 0.0004, listPer1000: 0.005, deletePer1000: 0, egressPerGB: 0.12, ingressPerGB: 0 },
        { id: 'asia-east1', name: 'Taiwan (Single)', storagePricePerGBMonth: 0.02, putPer1000: 0.005, getPer1000: 0.0004, listPer1000: 0.005, deletePer1000: 0, egressPerGB: 0.12, ingressPerGB: 0 },
        // Dual regions
        { id: 'nam4', name: 'Iowa+S.Carolina (Dual)', storagePricePerGBMonth: 0.036, putPer1000: 0.01, getPer1000: 0.0004, listPer1000: 0.01, deletePer1000: 0, egressPerGB: 0.12, ingressPerGB: 0 },
        { id: 'eur4', name: 'Finland+Netherlands (Dual)', storagePricePerGBMonth: 0.036, putPer1000: 0.01, getPer1000: 0.0004, listPer1000: 0.01, deletePer1000: 0, egressPerGB: 0.12, ingressPerGB: 0 },
        // Multi regions
        { id: 'us', name: 'US (Multi)', storagePricePerGBMonth: 0.026, putPer1000: 0.005, getPer1000: 0.0004, listPer1000: 0.005, deletePer1000: 0, egressPerGB: 0.12, ingressPerGB: 0 },
        { id: 'eu', name: 'EU (Multi)', storagePricePerGBMonth: 0.026, putPer1000: 0.005, getPer1000: 0.0004, listPer1000: 0.005, deletePer1000: 0, egressPerGB: 0.12, ingressPerGB: 0 },
        { id: 'asia', name: 'Asia (Multi)', storagePricePerGBMonth: 0.026, putPer1000: 0.005, getPer1000: 0.0004, listPer1000: 0.005, deletePer1000: 0, egressPerGB: 0.12, ingressPerGB: 0 },
      ],
    },
  ];
}

function gcFilterRegions(regions: CloudRegion[], type: 'single' | 'dual' | 'multi'): CloudRegion[] {
  if (type === 'single') return regions.filter(r => r.name.includes('(Single)'));
  if (type === 'dual') return regions.filter(r => r.name.includes('(Dual)'));
  return regions.filter(r => r.name.includes('(Multi)'));
}

// ---- Usage Tree Dummy Data ----

function createUsageTree(): UsageTreeNode {
  return {
    name: 'library', isDirectory: true, storageBytes: 2.84 * 1024 ** 3,
    readOps: 14200, writeOps: 3400, networkEgressBytes: 890 * 1024 ** 2, networkIngressBytes: 420 * 1024 ** 2,
    children: [
      {
        name: 'src', isDirectory: true, storageBytes: 1.24 * 1024 ** 3,
        readOps: 8400, writeOps: 2100, networkEgressBytes: 540 * 1024 ** 2, networkIngressBytes: 260 * 1024 ** 2,
        children: [
          { name: 'Ray.ts', isDirectory: false, storageBytes: 340 * 1024, readOps: 2200, writeOps: 480, networkEgressBytes: 120 * 1024 ** 2, networkIngressBytes: 45 * 1024 ** 2, children: [] },
          { name: 'Router.ts', isDirectory: false, storageBytes: 28 * 1024, readOps: 1800, writeOps: 320, networkEgressBytes: 80 * 1024 ** 2, networkIngressBytes: 30 * 1024 ** 2, children: [] },
          { name: 'API.ts', isDirectory: false, storageBytes: 156 * 1024, readOps: 1400, writeOps: 520, networkEgressBytes: 95 * 1024 ** 2, networkIngressBytes: 48 * 1024 ** 2, children: [] },
          { name: 'IDELayout.ts', isDirectory: false, storageBytes: 210 * 1024, readOps: 1200, writeOps: 280, networkEgressBytes: 68 * 1024 ** 2, networkIngressBytes: 32 * 1024 ** 2, children: [] },
          { name: 'Markdown.ts', isDirectory: false, storageBytes: 92 * 1024, readOps: 980, writeOps: 180, networkEgressBytes: 42 * 1024 ** 2, networkIngressBytes: 18 * 1024 ** 2, children: [] },
          { name: 'Settings.ts', isDirectory: false, storageBytes: 48 * 1024, readOps: 320, writeOps: 120, networkEgressBytes: 15 * 1024 ** 2, networkIngressBytes: 8 * 1024 ** 2, children: [] },
        ],
      },
      {
        name: 'assets', isDirectory: true, storageBytes: 0.82 * 1024 ** 3,
        readOps: 3200, writeOps: 640, networkEgressBytes: 200 * 1024 ** 2, networkIngressBytes: 95 * 1024 ** 2,
        children: [
          { name: 'icons', isDirectory: true, storageBytes: 12 * 1024 ** 2, readOps: 1800, writeOps: 240, networkEgressBytes: 80 * 1024 ** 2, networkIngressBytes: 35 * 1024 ** 2, children: [
            { name: 'logo.svg', isDirectory: false, storageBytes: 4.2 * 1024, readOps: 900, writeOps: 20, networkEgressBytes: 40 * 1024 ** 2, networkIngressBytes: 5 * 1024 ** 2, children: [] },
            { name: 'favicon.ico', isDirectory: false, storageBytes: 15.4 * 1024, readOps: 600, writeOps: 10, networkEgressBytes: 30 * 1024 ** 2, networkIngressBytes: 2 * 1024 ** 2, children: [] },
          ] },
          { name: 'fonts', isDirectory: true, storageBytes: 2.4 * 1024 ** 2, readOps: 800, writeOps: 120, networkEgressBytes: 60 * 1024 ** 2, networkIngressBytes: 25 * 1024 ** 2, children: [] },
        ],
      },
      {
        name: 'tests', isDirectory: true, storageBytes: 0.34 * 1024 ** 3,
        readOps: 1200, writeOps: 380, networkEgressBytes: 85 * 1024 ** 2, networkIngressBytes: 40 * 1024 ** 2,
        children: [
          { name: 'unit', isDirectory: true, storageBytes: 0.18 * 1024 ** 3, readOps: 800, writeOps: 240, networkEgressBytes: 55 * 1024 ** 2, networkIngressBytes: 25 * 1024 ** 2, children: [] },
          { name: 'integration', isDirectory: true, storageBytes: 0.16 * 1024 ** 3, readOps: 400, writeOps: 140, networkEgressBytes: 30 * 1024 ** 2, networkIngressBytes: 15 * 1024 ** 2, children: [] },
        ],
      },
      {
        name: 'docs', isDirectory: true, storageBytes: 0.44 * 1024 ** 3,
        readOps: 1400, writeOps: 280, networkEgressBytes: 65 * 1024 ** 2, networkIngressBytes: 25 * 1024 ** 2,
        children: [
          { name: 'README.md', isDirectory: false, storageBytes: 24 * 1024, readOps: 800, writeOps: 60, networkEgressBytes: 30 * 1024 ** 2, networkIngressBytes: 10 * 1024 ** 2, children: [] },
          { name: 'CHANGELOG.md', isDirectory: false, storageBytes: 18 * 1024, readOps: 400, writeOps: 180, networkEgressBytes: 20 * 1024 ** 2, networkIngressBytes: 8 * 1024 ** 2, children: [] },
        ],
      },
    ],
  };
}

// ---- State ----

let settingsState: SettingsState | null = null;
const expandedNodes = new Set<string>();

function loadState(): SettingsState {
  try {
    const raw = localStorage.getItem('ether:settings');
    if (raw) {
      const parsed = JSON.parse(raw);
      // Restore provider objects with full region data
      const fresh = createProviders();
      for (const p of fresh) {
        const saved = parsed.providers?.find((sp: CloudProvider) => sp.id === p.id);
        if (saved) {
          p.enabled = saved.enabled;
          p.selectedRegion = saved.selectedRegion;
          if (p.gcRegionType && saved.gcRegionType) p.gcRegionType = saved.gcRegionType;
        }
      }
      return {
        billingPeriod: parsed.billingPeriod || 'monthly',
        currencyCode: parsed.currencyCode || 'USD',
        storageQuotaGB: parsed.storageQuotaGB || 10,
        storageUsedGB: parsed.storageUsedGB || 2.84,
        providers: fresh,
      };
    }
  } catch { /* ignore */ }
  return {
    billingPeriod: 'monthly',
    currencyCode: 'USD',
    storageQuotaGB: 10,
    storageUsedGB: 2.84,
    providers: createProviders(),
  };
}

function saveState(): void {
  if (!settingsState) return;
  const toSave = {
    billingPeriod: settingsState.billingPeriod,
    currencyCode: settingsState.currencyCode,
    storageQuotaGB: settingsState.storageQuotaGB,
    storageUsedGB: settingsState.storageUsedGB,
    providers: settingsState.providers.map(p => ({
      id: p.id, enabled: p.enabled, selectedRegion: p.selectedRegion,
      ...(p.gcRegionType ? { gcRegionType: p.gcRegionType } : {}),
    })),
  };
  localStorage.setItem('ether:settings', JSON.stringify(toSave));
}

// ---- Cost Calculation Helpers ----

function getCurrency(): Currency {
  return CURRENCIES.find(c => c.code === settingsState!.currencyCode) || CURRENCIES[0];
}

function periodMultiplier(): number {
  if (settingsState!.billingPeriod === 'hourly') return 1 / 720;
  if (settingsState!.billingPeriod === 'daily') return 1 / 30;
  if (settingsState!.billingPeriod === 'yearly') return 12;
  return 1;
}

function formatCost(usdMonthly: number): string {
  const cur = getCurrency();
  const val = usdMonthly * periodMultiplier() * cur.rate;
  // Handle very small values (crypto)
  if (Math.abs(val) < 0.0001 && val !== 0) return `${cur.symbol}${val.toExponential(2)}`;
  if (Math.abs(val) < 0.01 && val !== 0) return `${cur.symbol}${val.toFixed(6)}`;
  if (Math.abs(val) < 1) return `${cur.symbol}${val.toFixed(4)}`;
  if (cur.rate > 100) return `${cur.symbol}${val.toFixed(0)}`;
  return `${cur.symbol}${val.toFixed(2)}`;
}

function periodLabel(): string {
  if (settingsState!.billingPeriod === 'hourly') return '/hr';
  if (settingsState!.billingPeriod === 'daily') return '/day';
  if (settingsState!.billingPeriod === 'yearly') return '/yr';
  return '/mo';
}

function getActiveRegion(provider: CloudProvider): CloudRegion {
  return provider.regions.find(r => r.id === provider.selectedRegion) || provider.regions[0];
}

function avgStoragePrice(): number {
  const enabled = settingsState!.providers.filter(p => p.enabled);
  if (enabled.length === 0) return 0;
  return enabled.reduce((sum, p) => sum + getActiveRegion(p).storagePricePerGBMonth, 0) / enabled.length;
}

function nodeStorageCostMonthly(node: UsageTreeNode): number {
  const gbUsed = node.storageBytes / (1024 ** 3);
  return gbUsed * avgStoragePrice();
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return (bytes / 1024 ** 3).toFixed(2) + ' GB';
  if (bytes >= 1024 ** 2) return (bytes / 1024 ** 2).toFixed(2) + ' MB';
  if (bytes >= 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return bytes + ' B';
}

// ---- Operation Cost Computation ----

interface OpCategory {
  id: string;
  label: string;
  icon: string;
  usageBytes: number;
  subcategories: { label: string; icon: string; costUSD: number; usageLabel?: string }[];
}

function computeOperationCosts(): OpCategory[] {
  const enabled = settingsState!.providers.filter(p => p.enabled);
  if (enabled.length === 0) return [];

  const avgGet = enabled.reduce((s, p) => s + getActiveRegion(p).getPer1000, 0) / enabled.length;
  const avgPut = enabled.reduce((s, p) => s + getActiveRegion(p).putPer1000, 0) / enabled.length;
  const avgEgress = enabled.reduce((s, p) => s + getActiveRegion(p).egressPerGB, 0) / enabled.length;

  // Cloning: ~200 GET ops, ~150 PUT ops, ~0.2GB egress, ~0.2GB ingress, ~1.2GB stored
  const cloneNetwork = 0.2 * avgEgress;
  const cloneDiskRead = (200 / 1000) * avgGet;
  const cloneDiskWrite = (150 / 1000) * avgPut;

  // Explorer viewing: ~100 GET ops, ~0.1GB egress, ~340MB cached
  const explorerNetwork = 0.1 * avgEgress;
  const explorerDiskRead = (100 / 1000) * avgGet;

  // Search index: ~80 GET ops, ~60 PUT ops, ~680MB index
  const searchDiskRead = (80 / 1000) * avgGet;
  const searchDiskWrite = (60 / 1000) * avgPut;

  return [
    {
      id: 'cloning', label: 'Cloning', icon: CLONE_ICON_SVG, usageBytes: 1.2 * 1024 ** 3,
      subcategories: [
        { label: 'Network', icon: NETWORK_SVG, costUSD: cloneNetwork, usageLabel: '214 MB transferred' },
        { label: 'Disk Read', icon: DISK_READ_SVG, costUSD: cloneDiskRead, usageLabel: '200 ops' },
        { label: 'Disk Write', icon: DISK_WRITE_SVG, costUSD: cloneDiskWrite, usageLabel: '150 ops' },
      ],
    },
    {
      id: 'explorer', label: 'Explorer', icon: FILE_VIEWER_SVG, usageBytes: 340 * 1024 ** 2,
      subcategories: [
        { label: 'Network', icon: NETWORK_SVG, costUSD: explorerNetwork, usageLabel: '102 MB transferred' },
        { label: 'Disk Read', icon: DISK_READ_SVG, costUSD: explorerDiskRead, usageLabel: '100 ops' },
      ],
    },
    {
      id: 'search', label: 'Search Index', icon: SEARCH_INDEX_SVG, usageBytes: 680 * 1024 ** 2,
      subcategories: [
        { label: 'Disk Read', icon: DISK_READ_SVG, costUSD: searchDiskRead, usageLabel: '80 ops' },
        { label: 'Disk Write', icon: DISK_WRITE_SVG, costUSD: searchDiskWrite, usageLabel: '60 ops' },
      ],
    },
  ];
}

// ---- Styles ----

function injectStyles(): void {
  if (styleEl) return;
  styleEl = document.createElement('style');
  styleEl.textContent = `
    .settings-page {
      max-width: 1120px;
      margin: 0 auto;
      padding: 32px 24px;
      font-family: 'Courier New', Courier, monospace;
      color: ${PHOSPHOR};
      min-height: 100vh;
      box-sizing: border-box;
    }

    /* ---- Header (same as PR page) ---- */
    .settings-page .repo-header {
      display: flex;
      align-items: baseline;
      gap: 8px;
      font-size: 22px;
      margin-bottom: 8px;
      text-shadow: 0 0 4px rgba(255,255,255,0.5), 0 0 11px rgba(255,255,255,0.22);
    }
    .settings-page .repo-header .user { color: rgba(255,255,255,0.55); }
    .settings-page .repo-header .sep { color: rgba(255,255,255,0.25); }
    .settings-page .repo-header .repo-name { color: ${PHOSPHOR}; font-weight: bold; }
    .settings-page .repo-header a { color: inherit; text-decoration: none; }
    .settings-page .repo-header a:hover { text-decoration: underline; }

    .settings-back-link {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: rgba(255,255,255,0.5);
      text-decoration: none;
      font-size: 13px;
      margin-bottom: 16px;
      cursor: pointer;
    }
    .settings-back-link:hover { color: ${PHOSPHOR}; }
    .settings-back-link svg { width: 16px; height: 16px; fill: currentColor; }

    /* ---- Layout: sidebar + content ---- */
    .settings-layout {
      display: flex;
      gap: 0;
      margin-top: 16px;
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 6px;
      overflow: hidden;
      min-height: 600px;
    }
    .settings-sidebar {
      width: 200px;
      min-width: 200px;
      border-right: 1px solid rgba(255,255,255,0.1);
      padding: 12px 0;
    }
    .settings-sidebar-tab {
      display: block;
      width: 100%;
      padding: 10px 18px;
      font-size: 13px;
      color: rgba(255,255,255,0.4);
      cursor: pointer;
      border: none;
      background: none;
      border-left: 2px solid transparent;
      font-family: inherit;
      text-align: left;
      transition: color 0.1s, border-color 0.1s;
    }
    .settings-sidebar-tab:hover { color: rgba(255,255,255,0.65); }
    .settings-sidebar-tab.active { color: ${PHOSPHOR}; border-left-color: ${PHOSPHOR}; }
    .settings-sidebar-tab.disabled {
      color: rgba(255,255,255,0.15);
      cursor: not-allowed;
    }
    .settings-content {
      flex: 1;
      padding: 24px;
      overflow-y: auto;
    }

    /* ---- Title bar: total credits left, period toggle right ---- */
    .settings-title-bar {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      margin-bottom: 20px;
      gap: 12px;
      flex-wrap: wrap;
    }
    .settings-total-credits {
      font-size: 20px;
      color: ${PHOSPHOR};
      font-weight: bold;
      text-shadow: 0 0 6px rgba(255,255,255,0.3);
      display: flex;
      align-items: baseline;
      gap: 8px;
    }
    .settings-total-credits .settings-total-label {
      font-size: 11px;
      font-weight: normal;
      color: rgba(255,255,255,0.35);
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .settings-period-toggle {
      display: flex;
      gap: 0;
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 4px;
      overflow: hidden;
    }
    .settings-period-btn {
      padding: 6px 14px;
      font-size: 11px;
      color: rgba(255,255,255,0.4);
      cursor: pointer;
      border: none;
      background: none;
      font-family: inherit;
      transition: color 0.1s, background 0.1s;
    }
    .settings-period-btn:not(:last-child) {
      border-right: 1px solid rgba(255,255,255,0.15);
    }
    .settings-period-btn:hover { color: rgba(255,255,255,0.65); background: rgba(255,255,255,0.04); }
    .settings-period-btn.active { color: ${PHOSPHOR}; background: rgba(255,255,255,0.08); }

    /* ---- Two-column content layout ---- */
    .settings-columns {
      display: flex;
      gap: 24px;
      align-items: flex-start;
    }
    .settings-col {
      flex: 1;
      min-width: 0;
    }
    .settings-col-divider {
      width: 1px;
      align-self: stretch;
      background: rgba(255,255,255,0.08);
      flex-shrink: 0;
    }

    /* ---- Currency selector ---- */
    .settings-currency-wrapper {
      position: relative;
    }
    .settings-currency-btn {
      padding: 6px 14px;
      font-size: 12px;
      color: rgba(255,255,255,0.6);
      cursor: pointer;
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 4px;
      background: none;
      font-family: inherit;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: color 0.1s, border-color 0.1s;
    }
    .settings-currency-btn:hover { color: ${PHOSPHOR}; border-color: rgba(255,255,255,0.3); }
    .settings-currency-btn svg { width: 12px; height: 12px; fill: currentColor; }
    .settings-currency-popup {
      position: absolute;
      top: calc(100% + 6px);
      right: 0;
      width: 260px;
      z-index: 100;
      background: #0e0e0e;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 8px;
      padding: 8px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.6), 0 0 12px rgba(255,255,255,0.03);
      display: none;
      max-height: 320px;
      overflow-y: auto;
    }
    .settings-currency-popup.open { display: block; }
    .settings-currency-search {
      width: 100%;
      padding: 6px 10px;
      font-size: 12px;
      color: ${PHOSPHOR};
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 4px;
      font-family: inherit;
      margin-bottom: 6px;
      outline: none;
      box-sizing: border-box;
    }
    .settings-currency-search:focus { border-color: rgba(255,255,255,0.3); }
    .settings-currency-option {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      font-size: 12px;
      color: rgba(255,255,255,0.5);
      cursor: pointer;
      border-radius: 4px;
      transition: background 0.1s, color 0.1s;
    }
    .settings-currency-option:hover { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.8); }
    .settings-currency-option.active { color: ${PHOSPHOR}; background: rgba(255,255,255,0.08); }
    .settings-currency-symbol { color: rgba(255,255,255,0.3); min-width: 24px; }
    .settings-currency-backdrop {
      position: fixed;
      inset: 0;
      z-index: 99;
      display: none;
    }
    .settings-currency-backdrop.open { display: block; }

    /* ---- Section headers ---- */
    .settings-section {
      margin-bottom: 32px;
    }
    .settings-section-title {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      color: rgba(255,255,255,0.35);
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .settings-section-title svg { width: 16px; height: 16px; fill: currentColor; }
    .settings-section-title .settings-section-right {
      margin-left: auto;
      font-size: 12px;
      letter-spacing: 0;
      text-transform: none;
      color: rgba(255,255,255,0.5);
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .settings-section-title .settings-section-right svg { width: 14px; height: 14px; }

    /* ---- Storage progress bar ---- */
    .settings-storage-bar-container {
      margin-bottom: 16px;
    }
    .settings-storage-bar {
      height: 8px;
      background: rgba(255,255,255,0.06);
      border-radius: 4px;
      overflow: hidden;
      position: relative;
      margin-bottom: 6px;
    }
    .settings-storage-fill {
      height: 100%;
      border-radius: 4px;
      background: linear-gradient(90deg, rgba(255,255,255,0.25), rgba(255,255,255,0.5));
      box-shadow: 0 0 8px rgba(255,255,255,0.15), 0 0 20px rgba(255,255,255,0.05);
      transition: width 0.3s ease, background 0.3s ease;
    }
    .settings-storage-fill.danger {
      background: linear-gradient(90deg, rgba(255,80,60,0.6), rgba(255,50,30,0.85));
      box-shadow: 0 0 8px rgba(255,60,40,0.3), 0 0 20px rgba(255,40,20,0.1);
    }
    .settings-storage-label {
      font-size: 11px;
      color: rgba(255,255,255,0.4);
    }
    .settings-storage-label strong { color: rgba(255,255,255,0.7); }

    /* ---- Provider cards ---- */
    .settings-providers {
      display: flex;
      gap: 10px;
      margin-bottom: 20px;
      flex-wrap: wrap;
    }
    .settings-provider-card {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 12px;
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 6px;
      cursor: pointer;
      font-size: 11px;
      color: rgba(255,255,255,0.4);
      background: rgba(255,255,255,0.02);
      transition: all 0.15s;
      user-select: none;
    }
    .settings-provider-card:hover { border-color: rgba(255,255,255,0.3); color: rgba(255,255,255,0.6); }
    .settings-provider-card.active {
      border-color: rgba(255,255,255,0.5);
      color: ${PHOSPHOR};
      background: rgba(255,255,255,0.05);
      box-shadow: 0 0 12px rgba(255,255,255,0.08), 0 0 4px rgba(255,255,255,0.04);
    }
    .settings-provider-card svg { width: 18px; height: 18px; fill: currentColor; }
    .settings-provider-check {
      font-size: 11px;
      opacity: 0.5;
    }
    .settings-provider-card.active .settings-provider-check { opacity: 1; }

    /* ---- Region selectors ---- */
    .settings-region-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
      flex-wrap: wrap;
    }
    .settings-region-label {
      font-size: 11px;
      color: rgba(255,255,255,0.35);
      min-width: 80px;
    }
    .settings-region-label svg { width: 16px; height: 16px; fill: currentColor; vertical-align: middle; margin-right: 4px; }
    .settings-region-select {
      padding: 5px 10px;
      font-size: 12px;
      color: ${PHOSPHOR};
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 4px;
      font-family: inherit;
      outline: none;
      cursor: pointer;
    }
    .settings-region-select:focus { border-color: rgba(255,255,255,0.3); }
    .settings-region-select option {
      background: #0e0e0e;
      color: ${PHOSPHOR};
    }
    .settings-region-price {
      font-size: 11px;
      color: rgba(255,255,255,0.3);
      margin-left: auto;
    }
    .settings-gc-type-tabs {
      display: flex;
      gap: 0;
      margin-bottom: 6px;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 4px;
      overflow: hidden;
      width: fit-content;
    }
    .settings-gc-type-tab {
      padding: 4px 12px;
      font-size: 11px;
      color: rgba(255,255,255,0.35);
      cursor: pointer;
      border: none;
      background: none;
      font-family: inherit;
      transition: color 0.1s, background 0.1s;
    }
    .settings-gc-type-tab:not(:last-child) { border-right: 1px solid rgba(255,255,255,0.12); }
    .settings-gc-type-tab:hover { color: rgba(255,255,255,0.6); }
    .settings-gc-type-tab.active { color: ${PHOSPHOR}; background: rgba(255,255,255,0.08); }

    /* ---- Provider pricing table ---- */
    .settings-pricing-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
      margin-bottom: 20px;
    }
    .settings-pricing-table th {
      text-align: left;
      color: rgba(255,255,255,0.3);
      font-weight: normal;
      padding: 6px 8px;
      border-bottom: 1px solid rgba(255,255,255,0.08);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      font-size: 10px;
    }
    .settings-pricing-table td {
      padding: 6px 8px;
      color: rgba(255,255,255,0.55);
      border-bottom: 1px solid rgba(255,255,255,0.04);
    }
    .settings-pricing-table tr:last-child td { border-bottom: none; }

    /* ---- Usage tree ---- */
    .settings-tree { margin-top: 8px; }
    .settings-tree-node {
      cursor: pointer;
      user-select: none;
    }
    .settings-tree-row {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 5px 8px;
      border-radius: 4px;
      transition: background 0.1s;
      font-size: 13px;
    }
    .settings-tree-row:hover { background: rgba(255,255,255,0.04); }
    .settings-tree-arrow {
      width: 14px;
      height: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: transform 0.1s;
    }
    .settings-tree-arrow svg { width: 10px; height: 10px; fill: none; stroke: currentColor; stroke-width: 48; }
    .settings-tree-arrow.expanded { transform: rotate(90deg); }
    .settings-tree-arrow.leaf { visibility: hidden; }
    .settings-tree-icon {
      width: 16px;
      height: 16px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      color: rgba(255,255,255,0.35);
    }
    .settings-tree-icon svg { width: 14px; height: 14px; fill: currentColor; }
    .settings-tree-name {
      flex: 1;
      color: rgba(255,255,255,0.7);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .settings-tree-row:hover .settings-tree-name { color: ${PHOSPHOR}; }
    .settings-tree-size {
      font-size: 11px;
      color: rgba(255,255,255,0.3);
      min-width: 70px;
      text-align: right;
    }
    .settings-tree-cost {
      font-size: 11px;
      color: rgba(255,255,255,0.4);
      min-width: 80px;
      text-align: right;
    }
    .settings-tree-children {
      padding-left: 20px;
    }
    .settings-tree-children.collapsed { display: none; }

    /* ---- Operation categories ---- */
    .settings-op-category {
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 6px;
      margin-bottom: 10px;
      overflow: hidden;
    }
    .settings-op-header {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 14px;
      cursor: pointer;
      transition: background 0.1s;
      user-select: none;
    }
    .settings-op-header:hover { background: rgba(255,255,255,0.03); }
    .settings-op-icon {
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: rgba(255,255,255,0.4);
    }
    .settings-op-icon svg { width: 18px; height: 18px; fill: currentColor; }
    .settings-op-label {
      flex: 1;
      font-size: 13px;
      color: rgba(255,255,255,0.7);
    }
    .settings-op-header:hover .settings-op-label { color: ${PHOSPHOR}; }
    .settings-op-total {
      font-size: 13px;
      color: rgba(255,255,255,0.5);
    }
    .settings-op-arrow {
      width: 14px;
      height: 14px;
      color: rgba(255,255,255,0.25);
      transition: transform 0.1s;
    }
    .settings-op-arrow svg { width: 12px; height: 12px; fill: none; stroke: currentColor; stroke-width: 48; }
    .settings-op-arrow.expanded { transform: rotate(90deg); }
    .settings-op-body {
      padding: 0 14px 10px 44px;
    }
    .settings-op-body.collapsed { display: none; }
    .settings-op-sub {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 3px 0;
      font-size: 12px;
      color: rgba(255,255,255,0.35);
    }
    .settings-op-sub-icon {
      width: 14px;
      height: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .settings-op-sub-icon svg { width: 12px; height: 12px; fill: currentColor; }
    .settings-op-sub-label { flex: 1; }
    .settings-op-sub-cost { color: rgba(255,255,255,0.45); }

    /* ---- Divider ---- */
    .settings-divider {
      border: none;
      border-top: 1px solid rgba(255,255,255,0.08);
      margin: 24px 0;
    }

    /* scrollbar for popup */
    .settings-currency-popup::-webkit-scrollbar { width: 6px; }
    .settings-currency-popup::-webkit-scrollbar-track { background: transparent; }
    .settings-currency-popup::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }
  `;
  document.head.appendChild(styleEl);
}

// ---- Render Helpers ----

function buildBackUrl(params: SettingsParams): string {
  const pathPart = params.path.length > 0 ? '/' + params.path.join('/') : '';
  return `${params.base}${pathPart}`;
}

function renderHeader(params: SettingsParams): string {
  const backUrl = buildBackUrl(params);
  const backLabel = params.repoPath.replace(/^@/, '@');

  let html = `<a href="${backUrl}" class="settings-back-link" data-link>${ARROW_LEFT_SVG} Back to ${backLabel}</a>`;
  html += `<div class="repo-header">`;
  html += `<a href="${params.base}" class="user" data-link>@${params.user}</a>`;
  for (const seg of params.path) {
    html += `<span class="sep">/</span><span class="repo-name">${seg}</span>`;
  }
  html += `<span class="sep">/</span><span class="repo-name">Settings</span>`;
  html += `</div>`;
  return html;
}

function computeTotalCostMonthly(): number {
  const st = settingsState!;
  const storageCost = st.storageUsedGB * avgStoragePrice();
  const ops = computeOperationCosts();
  const processingCost = ops.reduce((s, cat) => s + cat.subcategories.reduce((ss, sub) => ss + sub.costUSD, 0), 0);
  return storageCost + processingCost;
}

function renderTitleBar(): string {
  const st = settingsState!;
  const cur = getCurrency();
  const totalCost = computeTotalCostMonthly();

  let html = `<div class="settings-title-bar">`;

  // Left: Total credits + currency picker
  html += `<div style="display:flex;align-items:baseline;gap:12px">`;
  html += `<div class="settings-total-credits">`;
  html += `<span class="settings-total-label">Total</span> ${formatCost(totalCost)}${periodLabel()}`;
  html += `</div>`;
  html += `<div class="settings-currency-wrapper">`;
  html += `<button class="settings-currency-btn" data-currency-toggle>${cur.symbol} ${cur.code} ${CHEVRON_DOWN_SVG}</button>`;
  html += `<div class="settings-currency-backdrop" data-currency-backdrop></div>`;
  html += `<div class="settings-currency-popup" data-currency-popup>`;
  html += `<input type="text" class="settings-currency-search" data-currency-search placeholder="Search currencies..." />`;
  for (const c of CURRENCIES) {
    html += `<div class="settings-currency-option${c.code === st.currencyCode ? ' active' : ''}" data-currency-code="${c.code}">`;
    html += `<span class="settings-currency-symbol">${c.symbol}</span> ${c.code} <span style="color:rgba(255,255,255,0.25);margin-left:auto;font-size:11px">${c.name}</span>`;
    html += `</div>`;
  }
  html += `</div></div>`;
  html += `</div>`;

  // Right: Period toggle
  html += `<div class="settings-period-toggle">`;
  for (const p of ['hourly', 'daily', 'monthly', 'yearly'] as const) {
    html += `<button class="settings-period-btn${st.billingPeriod === p ? ' active' : ''}" data-period="${p}">${p}</button>`;
  }
  html += `</div>`;

  html += `</div>`;
  return html;
}

function renderStorageSection(): string {
  const st = settingsState!;
  const pct = Math.min(100, (st.storageUsedGB / st.storageQuotaGB) * 100);
  const storageCost = st.storageUsedGB * avgStoragePrice();
  const isDanger = pct >= 90;

  let html = `<div class="settings-section">`;
  html += `<div class="settings-section-title">${STORAGE_SVG} Data Storage`;
  html += `<span class="settings-section-right">${formatCost(storageCost)}${periodLabel()}</span>`;
  html += `</div>`;

  // Progress bar (thinner, red when 90%+)
  html += `<div class="settings-storage-bar-container">`;
  html += `<div class="settings-storage-bar"><div class="settings-storage-fill${isDanger ? ' danger' : ''}" style="width:${pct.toFixed(1)}%"></div></div>`;
  html += `<div class="settings-storage-label"><strong>${st.storageUsedGB.toFixed(2)} GB</strong> / ${st.storageQuotaGB.toFixed(2)} GB</div>`;
  html += `</div>`;

  // Provider cards
  html += `<div class="settings-providers">`;
  for (const p of st.providers) {
    html += `<div class="settings-provider-card${p.enabled ? ' active' : ''}" data-provider-toggle="${p.id}">`;
    html += `<span class="settings-provider-check">${p.enabled ? '\u2713' : '\u00A0'}</span>`;
    html += `${p.icon} ${p.name}`;
    html += `</div>`;
  }
  html += `</div>`;

  // Region selectors
  for (const p of st.providers) {
    if (!p.enabled) continue;
    html += `<div class="settings-region-row">`;
    html += `<span class="settings-region-label">${p.icon} ${p.name}</span>`;

    if (p.id === 'gcloud') {
      html += `<div class="settings-gc-type-tabs">`;
      for (const t of ['single', 'dual', 'multi'] as const) {
        html += `<button class="settings-gc-type-tab${p.gcRegionType === t ? ' active' : ''}" data-gc-type="${t}">${t}</button>`;
      }
      html += `</div>`;
      const filtered = gcFilterRegions(p.regions, p.gcRegionType || 'single');
      html += `<select class="settings-region-select" data-region-select="${p.id}">`;
      for (const r of filtered) {
        html += `<option value="${r.id}"${r.id === p.selectedRegion ? ' selected' : ''}>${r.name}</option>`;
      }
      html += `</select>`;
      const region = filtered.find(r => r.id === p.selectedRegion) || filtered[0];
      if (region) {
        html += `<span class="settings-region-price">${formatCost(region.storagePricePerGBMonth)}${periodLabel()}/GB</span>`;
      }
    } else {
      html += `<select class="settings-region-select" data-region-select="${p.id}">`;
      for (const r of p.regions) {
        html += `<option value="${r.id}"${r.id === p.selectedRegion ? ' selected' : ''}>${r.name}</option>`;
      }
      html += `</select>`;
      const region = getActiveRegion(p);
      html += `<span class="settings-region-price">${formatCost(region.storagePricePerGBMonth)}${periodLabel()}/GB</span>`;
    }
    html += `</div>`;
  }

  // Pricing table
  const enabledProviders = st.providers.filter(p => p.enabled);
  if (enabledProviders.length > 0) {
    html += `<table class="settings-pricing-table">`;
    html += `<thead><tr><th>Operation</th>`;
    for (const p of enabledProviders) html += `<th>${p.name}</th>`;
    html += `</tr></thead><tbody>`;

    const ops = [
      { label: 'PUT / 1000', key: 'putPer1000' as const },
      { label: 'GET / 1000', key: 'getPer1000' as const },
      { label: 'LIST / 1000', key: 'listPer1000' as const },
      { label: 'DELETE / 1000', key: 'deletePer1000' as const },
      { label: 'Egress / GB', key: 'egressPerGB' as const },
      { label: 'Ingress / GB', key: 'ingressPerGB' as const },
    ];

    for (const op of ops) {
      html += `<tr><td>${op.label}</td>`;
      for (const p of enabledProviders) {
        const region = getActiveRegion(p);
        const val = region[op.key];
        html += `<td>${val === 0 ? 'Free' : formatCost(val)}</td>`;
      }
      html += `</tr>`;
    }
    html += `</tbody></table>`;
  }

  // Usage tree
  const tree = createUsageTree();
  html += `<div class="settings-tree">${renderTreeNode(tree, '')}</div>`;

  html += `</div>`;
  return html;
}

function renderTreeNode(node: UsageTreeNode, path: string): string {
  const fullPath = path ? `${path}/${node.name}` : node.name;
  const isExpanded = expandedNodes.has(fullPath);
  const hasChildren = node.isDirectory && node.children.length > 0;
  const cost = nodeStorageCostMonthly(node);

  let html = `<div class="settings-tree-node" data-tree-path="${fullPath}">`;
  html += `<div class="settings-tree-row">`;

  // Arrow
  if (hasChildren) {
    html += `<span class="settings-tree-arrow${isExpanded ? ' expanded' : ''}">${CHEVRON_RIGHT_SVG}</span>`;
  } else {
    html += `<span class="settings-tree-arrow leaf">${CHEVRON_RIGHT_SVG}</span>`;
  }

  // Icon
  html += `<span class="settings-tree-icon">${node.isDirectory ? FOLDER_SVG : FILE_VIEWER_SVG}</span>`;

  // Name
  html += `<span class="settings-tree-name">${node.name}${node.isDirectory ? '/' : ''}</span>`;

  // Size
  html += `<span class="settings-tree-size">${formatBytes(node.storageBytes)}</span>`;

  // Cost
  html += `<span class="settings-tree-cost">${formatCost(cost)}${periodLabel()}</span>`;

  html += `</div>`;

  // Children
  if (hasChildren) {
    html += `<div class="settings-tree-children${isExpanded ? '' : ' collapsed'}">`;
    for (const child of node.children) {
      html += renderTreeNode(child, fullPath);
    }
    html += `</div>`;
  }

  html += `</div>`;
  return html;
}

function renderProcessingSection(): string {
  const ops = computeOperationCosts();

  let html = `<div class="settings-section">`;
  html += `<div class="settings-section-title">${NETWORK_SVG} Data Processing`;
  html += `<span class="settings-section-right">Credits: ${INFINITY_SVG} <span style="color:rgba(255,255,255,0.7)">Unlimited</span></span>`;
  html += `</div>`;

  for (const cat of ops) {
    const totalCost = cat.subcategories.reduce((s, sub) => s + sub.costUSD, 0);
    const isExpanded = expandedNodes.has(`op:${cat.id}`);

    html += `<div class="settings-op-category">`;
    html += `<div class="settings-op-header" data-op-toggle="${cat.id}">`;
    html += `<span class="settings-op-arrow${isExpanded ? ' expanded' : ''}">${CHEVRON_RIGHT_SVG}</span>`;
    html += `<span class="settings-op-icon">${cat.icon}</span>`;
    html += `<span class="settings-op-label">${cat.label}</span>`;
    html += `<span style="font-size:11px;color:rgba(255,255,255,0.25);margin-left:auto">${formatBytes(cat.usageBytes)}</span>`;
    html += `<span class="settings-op-total">${formatCost(totalCost)}${periodLabel()}</span>`;
    html += `</div>`;

    html += `<div class="settings-op-body${isExpanded ? '' : ' collapsed'}">`;
    for (const sub of cat.subcategories) {
      html += `<div class="settings-op-sub">`;
      html += `<span class="settings-op-sub-icon">${sub.icon}</span>`;
      html += `<span class="settings-op-sub-label">${sub.label}</span>`;
      if (sub.usageLabel) {
        html += `<span style="font-size:10px;color:rgba(255,255,255,0.2);margin-left:auto">${sub.usageLabel}</span>`;
      }
      html += `<span class="settings-op-sub-cost">${formatCost(sub.costUSD)}${periodLabel()}</span>`;
      html += `</div>`;
    }
    html += `</div>`;
    html += `</div>`;
  }

  // Usage tree for processing
  const tree = createUsageTree();
  html += `<div class="settings-tree">${renderProcessingTreeNode(tree, '')}</div>`;

  html += `</div>`;
  return html;
}

function renderProcessingTreeNode(node: UsageTreeNode, path: string): string {
  const fullPath = path ? `proc:${path}/${node.name}` : `proc:${node.name}`;
  const isExpanded = expandedNodes.has(fullPath);
  const hasChildren = node.isDirectory && node.children.length > 0;

  // Compute processing cost from operations
  const enabled = settingsState!.providers.filter(p => p.enabled);
  let opCost = 0;
  if (enabled.length > 0) {
    const avgGet = enabled.reduce((s, p) => s + getActiveRegion(p).getPer1000, 0) / enabled.length;
    const avgPut = enabled.reduce((s, p) => s + getActiveRegion(p).putPer1000, 0) / enabled.length;
    const avgEgress = enabled.reduce((s, p) => s + getActiveRegion(p).egressPerGB, 0) / enabled.length;
    opCost = (node.readOps / 1000) * avgGet + (node.writeOps / 1000) * avgPut + (node.networkEgressBytes / (1024 ** 3)) * avgEgress;
  }

  let html = `<div class="settings-tree-node" data-tree-path="${fullPath}">`;
  html += `<div class="settings-tree-row">`;

  if (hasChildren) {
    html += `<span class="settings-tree-arrow${isExpanded ? ' expanded' : ''}">${CHEVRON_RIGHT_SVG}</span>`;
  } else {
    html += `<span class="settings-tree-arrow leaf">${CHEVRON_RIGHT_SVG}</span>`;
  }

  html += `<span class="settings-tree-icon">${node.isDirectory ? FOLDER_SVG : FILE_VIEWER_SVG}</span>`;
  html += `<span class="settings-tree-name">${node.name}${node.isDirectory ? '/' : ''}</span>`;
  html += `<span class="settings-tree-size" style="color:rgba(255,255,255,0.25)">${node.readOps.toLocaleString()}R / ${node.writeOps.toLocaleString()}W</span>`;
  html += `<span class="settings-tree-cost">${formatCost(opCost)}${periodLabel()}</span>`;

  html += `</div>`;

  if (hasChildren) {
    html += `<div class="settings-tree-children${isExpanded ? '' : ' collapsed'}">`;
    for (const child of node.children) {
      html += renderProcessingTreeNode(child, path ? `${path}/${node.name}` : node.name);
    }
    html += `</div>`;
  }

  html += `</div>`;
  return html;
}

// ---- Event Binding ----

function bindEvents(): void {
  if (!currentContainer || !settingsState) return;

  // Period toggle
  currentContainer.querySelectorAll('[data-period]').forEach(btn => {
    btn.addEventListener('click', () => {
      settingsState!.billingPeriod = (btn as HTMLElement).dataset.period as 'hourly' | 'daily' | 'monthly' | 'yearly';
      saveState();
      render();
    });
  });

  // Currency toggle
  const currToggle = currentContainer.querySelector('[data-currency-toggle]');
  const currPopup = currentContainer.querySelector('[data-currency-popup]');
  const currBackdrop = currentContainer.querySelector('[data-currency-backdrop]');
  const currSearch = currentContainer.querySelector('[data-currency-search]') as HTMLInputElement | null;

  function openCurrencyPopup(): void {
    currPopup?.classList.add('open');
    currBackdrop?.classList.add('open');
    if (currSearch) { currSearch.value = ''; currSearch.focus(); }
    filterCurrencies('');
  }
  function closeCurrencyPopup(): void {
    currPopup?.classList.remove('open');
    currBackdrop?.classList.remove('open');
  }
  function filterCurrencies(q: string): void {
    const query = q.toLowerCase();
    currPopup?.querySelectorAll('[data-currency-code]').forEach(el => {
      const code = (el as HTMLElement).dataset.currencyCode!;
      const cur = CURRENCIES.find(c => c.code === code);
      const match = !query || code.toLowerCase().includes(query) || (cur?.name.toLowerCase().includes(query) ?? false);
      (el as HTMLElement).style.display = match ? '' : 'none';
    });
  }

  currToggle?.addEventListener('click', openCurrencyPopup);
  currBackdrop?.addEventListener('click', closeCurrencyPopup);
  currSearch?.addEventListener('input', () => filterCurrencies(currSearch.value));

  currentContainer.querySelectorAll('[data-currency-code]').forEach(el => {
    el.addEventListener('click', () => {
      settingsState!.currencyCode = (el as HTMLElement).dataset.currencyCode!;
      saveState();
      closeCurrencyPopup();
      render();
    });
  });

  // Provider toggle
  currentContainer.querySelectorAll('[data-provider-toggle]').forEach(card => {
    card.addEventListener('click', () => {
      const id = (card as HTMLElement).dataset.providerToggle!;
      const provider = settingsState!.providers.find(p => p.id === id);
      if (provider) {
        provider.enabled = !provider.enabled;
        saveState();
        render();
      }
    });
  });

  // Region selectors
  currentContainer.querySelectorAll('[data-region-select]').forEach(sel => {
    sel.addEventListener('change', () => {
      const id = (sel as HTMLElement).dataset.regionSelect!;
      const provider = settingsState!.providers.find(p => p.id === id);
      if (provider) {
        provider.selectedRegion = (sel as HTMLSelectElement).value;
        saveState();
        render();
      }
    });
  });

  // GCloud region type tabs
  currentContainer.querySelectorAll('[data-gc-type]').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = (btn as HTMLElement).dataset.gcType as 'single' | 'dual' | 'multi';
      const gcloud = settingsState!.providers.find(p => p.id === 'gcloud');
      if (gcloud) {
        gcloud.gcRegionType = type;
        // Select first region of new type
        const filtered = gcFilterRegions(gcloud.regions, type);
        if (filtered.length > 0) gcloud.selectedRegion = filtered[0].id;
        saveState();
        render();
      }
    });
  });

  // Tree expand/collapse
  currentContainer.querySelectorAll('[data-tree-path]').forEach(node => {
    const row = node.querySelector('.settings-tree-row');
    if (!row) return;
    row.addEventListener('click', (e) => {
      e.stopPropagation();
      const path = (node as HTMLElement).dataset.treePath!;
      const children = node.querySelector('.settings-tree-children');
      if (!children) return;
      if (expandedNodes.has(path)) {
        expandedNodes.delete(path);
      } else {
        expandedNodes.add(path);
      }
      render();
    });
  });

  // Operation category collapse
  currentContainer.querySelectorAll('[data-op-toggle]').forEach(header => {
    header.addEventListener('click', () => {
      const id = (header as HTMLElement).dataset.opToggle!;
      const key = `op:${id}`;
      if (expandedNodes.has(key)) {
        expandedNodes.delete(key);
      } else {
        expandedNodes.add(key);
      }
      render();
    });
  });
}

// ---- Main Render ----

function render(): void {
  if (!currentContainer || !currentParams || !settingsState) return;

  let html = `<div class="settings-page">`;
  html += renderHeader(currentParams);

  html += `<div class="settings-layout">`;

  // Sidebar
  html += `<div class="settings-sidebar">`;
  html += `<button class="settings-sidebar-tab active">General & Usage</button>`;
  html += `<button class="settings-sidebar-tab disabled" title="Coming soon">Permissions</button>`;
  html += `<button class="settings-sidebar-tab disabled" title="Coming soon">Webhooks</button>`;
  html += `<button class="settings-sidebar-tab disabled" title="Coming soon">Branches</button>`;
  html += `<button class="settings-sidebar-tab disabled" title="Coming soon">Actions</button>`;
  html += `</div>`;

  // Content
  html += `<div class="settings-content">`;
  html += renderTitleBar();

  // Two-column layout: Storage (left 50%) | Processing (right 50%)
  html += `<div class="settings-columns">`;
  html += `<div class="settings-col">`;
  html += renderStorageSection();
  html += `</div>`;
  html += `<div class="settings-col-divider"></div>`;
  html += `<div class="settings-col">`;
  html += renderProcessingSection();
  html += `</div>`;
  html += `</div>`;

  html += `</div>`;

  html += `</div>`;
  html += `</div>`;

  currentContainer.innerHTML = html;
  bindEvents();
}

// ---- Public API ----

export async function mount(
  container: HTMLElement,
  params: SettingsParams,
  navigate: (path: string) => void,
): Promise<void> {
  injectStyles();
  document.body.style.background = CRT_SCREEN_BG;
  currentContainer = container;
  currentParams = params;
  navigateFn = navigate;
  settingsState = loadState();
  render();
}

export async function update(params: SettingsParams): Promise<void> {
  currentParams = params;
  render();
}

export function unmount(): void {
  currentContainer = null;
  currentParams = null;
}
