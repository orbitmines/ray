// ============================================================
// ChatIcons.ts — SVG icon constants for chat UI
// ============================================================

import { COMMENT_SVG } from './PRIcons.ts';

/** Chat bubble (alias of COMMENT_SVG) */
export const CHAT_SVG = COMMENT_SVG;

/** Nested speech bubbles (thread icon) */
export const THREAD_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M96 128c-17.7 0-32 14.3-32 32v192c0 17.7 14.3 32 32 32h48v64l80-64h128c17.7 0 32-14.3 32-32V160c0-17.7-14.3-32-32-32H96z" fill="currentColor"/><path d="M256 288h192c17.7 0 32 14.3 32 32v160c0 17.7-14.3 32-32 32h-48v64l-80-64H192c-17.7 0-32-14.3-32-32v-64h64c35.3 0 64-28.7 64-64v-64h-32z" fill="currentColor" opacity="0.6"/></svg>`;

/** Plus sign */
export const PLUS_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M288 96v192H96v64h192v192h64V352h192v-64H352V96h-64z" fill="currentColor"/></svg>`;

/** Microphone */
export const MIC_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M320 64c-44.2 0-80 35.8-80 80v160c0 44.2 35.8 80 80 80s80-35.8 80-80V144c0-44.2-35.8-80-80-80zm160 240c0 79.5-57.3 145.6-132.8 158.9V512h64v48H228.8v-48h64v-49.1C217.3 449.6 160 383.5 160 304h48c0 61.9 50.1 112 112 112s112-50.1 112-112h48z" fill="currentColor"/></svg>`;

/** Smiley face (emoji picker) */
export const EMOJI_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M320 64C178.6 64 64 178.6 64 320s114.6 256 256 256 256-114.6 256-256S461.4 64 320 64zm0 464c-114.9 0-208-93.1-208-208S205.1 112 320 112s208 93.1 208 208-93.1 208-208 208zm-80-240c17.7 0 32-14.3 32-32s-14.3-32-32-32-32 14.3-32 32 14.3 32 32 32zm160 0c17.7 0 32-14.3 32-32s-14.3-32-32-32-32 14.3-32 32 14.3 32 32 32zm16 64c-12.8 44.8-52.8 80-96 80s-83.2-35.2-96-80h-48c16 70.4 75.2 128 144 128s128-57.6 144-128h-48z" fill="currentColor"/></svg>`;

/** Upload arrow */
export const UPLOAD_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M288 384V224H192l128-160 128 160H352v160h-64zm-160 64h384v48H128v-48z" fill="currentColor"/></svg>`;

/** Chevron-down in circle (scroll down) */
export const SCROLL_DOWN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M320 64C178.6 64 64 178.6 64 320s114.6 256 256 256 256-114.6 256-256S461.4 64 320 64zm0 464c-114.9 0-208-93.1-208-208S205.1 112 320 112s208 93.1 208 208-93.1 208-208 208z" fill="currentColor"/><path d="M208 272l112 112 112-112" fill="none" stroke="currentColor" stroke-width="48" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/** Pin icon */
export const PIN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M416 64L224 256l-64-64-96 96 160 160 96-96-64-64L448 96l64 64 32-32L352 0 320 32l96 96v-64z" fill="currentColor" transform="translate(48 48)"/></svg>`;

/** Forward arrow */
export const FORWARD_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M352 128l192 192-192 192v-128c-160 0-256 48-320 160 32-192 128-288 320-320V128z" fill="currentColor"/></svg>`;

/** Curved reply arrow */
export const REPLY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M288 128L96 320l192 192v-128c160 0 256 48 320 160-32-192-128-288-320-320V128z" fill="currentColor"/></svg>`;

/** Bookmark flag */
export const BOOKMARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M160 96h320v480l-160-96-160 96V96z" fill="currentColor"/></svg>`;

/** Clock (schedule) icon */
export const SCHEDULE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M320 64C178.6 64 64 178.6 64 320s114.6 256 256 256 256-114.6 256-256S461.4 64 320 64zm0 464c-114.9 0-208-93.1-208-208S205.1 112 320 112s208 93.1 208 208-93.1 208-208 208zm16-336h-48v160l128 76.8 24-39.4-104-61.7V192z" fill="currentColor"/></svg>`;

/** Archive box */
export const ARCHIVE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M96 128h448v96H96v-96zm32 128h384v288H128V256zm128 64h128v48H256v-48z" fill="currentColor"/></svg>`;

/** Minus-in-circle (DND) */
export const DND_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M320 64C178.6 64 64 178.6 64 320s114.6 256 256 256 256-114.6 256-256S461.4 64 320 64zm0 464c-114.9 0-208-93.1-208-208S205.1 112 320 112s208 93.1 208 208-93.1 208-208 208zm-112-232h224v48H208v-48z" fill="currentColor"/></svg>`;

/** Trash can */
export const TRASH_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M224 128V96c0-17.7 14.3-32 32-32h128c17.7 0 32 14.3 32 32v32h128v48H96v-48h128zm-64 96h320l-24 336c-1.5 20.9-19 37.3-40 37.3H264c-21 0-38.5-16.4-40-37.3L200 224zm96 48v240h48V272h-48zm112 0v240h48V272h-48z" fill="currentColor"/></svg>`;

/** Magnifying glass (search) */
export const SEARCH_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M272 96C167.6 96 80 183.6 80 288s87.6 192 192 192c42.4 0 81.6-13.8 113.4-37.2L492.7 550.1l33.9-33.9L419.3 408.9C440.8 378.2 464 336.4 464 288c0-104.4-87.6-192-192-192zm0 48c79.5 0 144 64.5 144 144s-64.5 144-144 144S128 367.5 128 288s64.5-144 144-144z" fill="currentColor"/></svg>`;

/** Status dots — small filled circles with specific colors */
export const STATUS_ONLINE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><circle cx="320" cy="320" r="160" fill="#4ade80"/></svg>`;
export const STATUS_AWAY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><circle cx="320" cy="320" r="160" fill="#fbbf24"/></svg>`;
export const STATUS_DND_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><circle cx="320" cy="320" r="160" fill="#f87171"/><rect x="224" y="296" width="192" height="48" rx="8" fill="#0a0a0a"/></svg>`;
export const STATUS_INVISIBLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><circle cx="320" cy="320" r="160" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="32"/></svg>`;
