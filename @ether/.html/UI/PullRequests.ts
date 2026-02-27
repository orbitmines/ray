// ============================================================
// PullRequests.ts — Pull request list, detail, new PR form, commit diff
// ============================================================

import { PHOSPHOR, CRT_SCREEN_BG } from './CRTShell.ts';
import { renderMarkdown } from './Markdown.ts';
import { getInlinePullRequests, getCategoryPRSummary, getCategoryPullRequests, getPullRequest, getOpenPRCount, createPullRequest, getRepository, getCurrentPlayer, resolveFile } from './API.ts';
import type { PullRequest, PRStatus, PRCommit, FileDiff, ActivityItem, InlinePR, CategoryPRSummary } from './API.ts';
import type { PRParams } from './Router.ts';
import { computeDiff, renderUnifiedDiff, renderSideBySideDiff } from './DiffView.ts';
import {
  COMMIT_SVG, BRANCH_SVG, COMMENT_SVG, CHECK_SVG,
  MERGE_SVG, ARROW_LEFT_SVG, ARROW_RIGHT_SVG, STATUS_CHANGE_SVG, FILE_DIFF_SVG,
  EDIT_SVG, PR_SVG,
} from './PRIcons.ts';
import {
  escapeHtml, formatTime, renderUserIcon, userLink,
  getChatMessageStyles,
  getTimelineStyles,
} from './ChatCommon.ts';
import type { TimelineEntry } from './ChatCommon.ts';
import type { ChatMessage } from './API.ts';
import { createChatView } from './ChatView.ts';
import type { ChatView } from './ChatView.ts';

let styleEl: HTMLStyleElement | null = null;
let currentContainer: HTMLElement | null = null;
let navigateFn: ((path: string) => void) | null = null;
let currentParams: PRParams | null = null;
let currentDiffMode: 'unified' | 'side-by-side' = 'unified';
let chatView: ChatView | null = null;


// ---- Styles ----

function injectStyles(): void {
  if (styleEl) return;
  styleEl = document.createElement('style');
  styleEl.textContent = getTimelineStyles() + getChatMessageStyles() + `
    .pr-page {
      max-width: 960px;
      margin: 0 auto;
      padding: 32px 24px 0;
      font-family: 'Courier New', Courier, monospace;
      color: ${PHOSPHOR};
      min-height: 100vh;
      box-sizing: border-box;
    }

    /* ---- Header chain (same as .repo-header in Repository.ts) ---- */
    .pr-page .repo-header {
      display: flex;
      align-items: baseline;
      gap: 8px;
      font-size: 22px;
      margin-bottom: 8px;
      text-shadow: 0 0 4px rgba(255,255,255,0.5), 0 0 11px rgba(255,255,255,0.22);
    }
    .pr-page .repo-header .user { color: rgba(255,255,255,0.55); }
    .pr-page .repo-header .sep { color: rgba(255,255,255,0.25); }
    .pr-page .repo-header .repo-name { color: ${PHOSPHOR}; font-weight: bold; }
    .pr-page .repo-header a { color: inherit; text-decoration: none; }
    .pr-page .repo-header a:hover { text-decoration: underline; }

    .pr-back-link {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: rgba(255,255,255,0.5);
      text-decoration: none;
      font-size: 13px;
      margin-bottom: 16px;
      cursor: pointer;
    }
    .pr-back-link:hover { color: ${PHOSPHOR}; }
    .pr-back-link svg { width: 16px; height: 16px; fill: currentColor; }

    /* ---- Filter tabs ---- */
    .pr-filter-tabs {
      display: flex;
      gap: 0;
      border-bottom: 1px solid rgba(255,255,255,0.1);
      margin-bottom: 0;
    }
    .pr-filter-tab {
      padding: 10px 18px;
      font-size: 13px;
      color: rgba(255,255,255,0.4);
      cursor: pointer;
      border: none;
      background: none;
      border-bottom: 2px solid transparent;
      font-family: inherit;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .pr-filter-tab:hover { color: rgba(255,255,255,0.65); }
    .pr-filter-tab.active { color: ${PHOSPHOR}; border-bottom-color: ${PHOSPHOR}; }
    .pr-filter-count {
      background: rgba(255,255,255,0.08);
      padding: 1px 7px;
      border-radius: 10px;
      font-size: 11px;
    }

    /* ---- PR list ---- */
    .pr-list {
      border: 1px solid rgba(255,255,255,0.1);
      border-top: none;
      border-radius: 0 0 6px 6px;
      overflow: hidden;
      margin-bottom: 32px;
    }
    .pr-row {
      display: flex;
      align-items: flex-start;
      padding: 12px 16px;
      border-bottom: 1px solid rgba(255,255,255,0.06);
      cursor: pointer;
      transition: background 0.1s;
      gap: 10px;
    }
    .pr-row:last-child { border-bottom: none; }
    .pr-row:hover { background: rgba(255,255,255,0.04); }
    .pr-row-icon {
      flex-shrink: 0;
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-top: 2px;
    }
    .pr-row-icon svg { width: 18px; height: 18px; fill: currentColor; }
    .pr-row-icon.open { color: #4ade80; }
    .pr-row-icon.closed { color: #f87171; }
    .pr-row-icon.merged { color: #c084fc; }
    .pr-row-body { flex: 1; min-width: 0; }
    .pr-row-title {
      font-size: 14px;
      font-weight: bold;
      color: rgba(255,255,255,0.85);
      margin-bottom: 2px;
    }
    .pr-row:hover .pr-row-title { color: ${PHOSPHOR}; }
    .pr-row-meta {
      font-size: 12px;
      color: rgba(255,255,255,0.35);
    }
    .pr-row-comments {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      gap: 4px;
      color: rgba(255,255,255,0.3);
      font-size: 12px;
    }
    .pr-row-comments svg { width: 14px; height: 14px; fill: currentColor; }
    .pr-empty {
      padding: 40px;
      text-align: center;
      color: rgba(255,255,255,0.25);
      font-size: 14px;
    }

    /* ---- Folder path prefix on nested PR rows ---- */
    .pr-row-path {
      color: rgba(255,255,255,0.3);
      font-weight: normal;
    }
    .pr-row-path::after {
      content: ' / ';
      color: rgba(255,255,255,0.15);
    }

    /* ---- Category rows (@{: String} players, #{: String} worlds) ---- */
    .pr-category-row {
      display: flex;
      align-items: center;
      padding: 12px 16px;
      border-bottom: 1px solid rgba(255,255,255,0.06);
      cursor: pointer;
      transition: background 0.1s;
      gap: 10px;
      text-decoration: none;
      color: inherit;
      background: rgba(255,255,255,0.015);
    }
    .pr-category-row:hover { background: rgba(255,255,255,0.05); }
    .pr-category-icon {
      flex-shrink: 0;
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: rgba(255,255,255,0.35);
    }
    .pr-category-icon svg { width: 18px; height: 18px; fill: currentColor; }
    .pr-category-body { flex: 1; min-width: 0; }
    .pr-category-name {
      font-size: 14px;
      font-weight: bold;
      color: rgba(255,255,255,0.7);
    }
    .pr-category-row:hover .pr-category-name { color: ${PHOSPHOR}; }
    .pr-category-meta {
      font-size: 11px;
      color: rgba(255,255,255,0.3);
      margin-top: 1px;
    }

    /* ---- New PR button ---- */
    .pr-new-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      height: 30px;
      padding: 0 14px;
      border-radius: 6px;
      font-family: 'Courier New', Courier, monospace;
      font-size: 13px;
      cursor: pointer;
      background: #00c850;
      border: 1px solid #00c850;
      color: #0a0a0a;
      font-weight: bold;
      transition: background 0.15s;
      text-decoration: none;
    }
    .pr-new-btn:hover { background: #00da58; border-color: #00da58; text-decoration: none; }
    .pr-new-btn svg { width: 14px; height: 14px; fill: currentColor; }

    .pr-list-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
    }

    /* ---- PR detail ---- */
    .pr-detail-title-row {
      display: flex;
      align-items: center;
      gap: 0;
      margin-bottom: 2px;
    }
    .pr-detail-title {
      font-size: 24px;
      font-weight: bold;
      text-shadow: 0 0 4px rgba(255,255,255,0.3);
    }
    .pr-detail-id {
      color: rgba(255,255,255,0.35);
      font-weight: normal;
      font-size: 24px;
      margin-left: 8px;
    }
    .pr-detail-meta {
      font-size: 13px;
      color: rgba(255,255,255,0.4);
    }
    .pr-detail-meta a {
      color: rgba(255,255,255,0.6);
      text-decoration: none;
    }
    .pr-detail-meta a:hover { color: ${PHOSPHOR}; text-decoration: underline; }

    /* Meta row — by @user + branch + merge all on one line */
    .pr-meta-row {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    .pr-meta-row .pr-branch-info { margin-bottom: 0; }
    .pr-meta-row .pr-merge-btn { margin-left: auto; flex-shrink: 0; }
    .pr-status-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px 10px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: bold;
      margin-left: 10px;
      vertical-align: middle;
    }
    .pr-status-badge svg { width: 14px; height: 14px; fill: currentColor; }
    .pr-status-badge.open { background: rgba(74,222,128,0.15); color: #4ade80; }
    .pr-status-badge.closed { background: rgba(248,113,113,0.15); color: #f87171; }
    .pr-status-badge.merged { background: rgba(192,132,252,0.15); color: #c084fc; }

    /* ---- Branch info (inline below title) ---- */
    .pr-branch-info {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      line-height: 1;
      color: rgba(255,255,255,0.4);
      margin-bottom: 0;
    }
    .pr-branch-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      width: 18px;
      height: 18px;
    }
    .pr-branch-icon svg { width: 18px; height: 18px; fill: currentColor; display: block; }
    .pr-branch-label {
      background: rgba(255,255,255,0.06);
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 12px;
      color: rgba(255,255,255,0.65);
      text-decoration: none;
      cursor: pointer;
    }
    .pr-branch-label:hover { color: ${PHOSPHOR}; background: rgba(255,255,255,0.1); }
    .pr-branch-arrow {
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      color: rgba(255,255,255,0.2);
    }
    .pr-branch-arrow svg { width: 14px; height: 14px; fill: currentColor; display: block; }

    /* ---- Sticky header ---- */
    .pr-sticky-header {
      position: sticky; top: 0; z-index: 15;
      background: ${CRT_SCREEN_BG};
      padding: 12px 0;
    }

    /* System event CSS now in ChatCommon getTimelineStyles() */

    /* ---- Hover edit buttons ---- */
    .pr-editable {
      position: relative;
      display: flex;
      align-items: center;
      gap: 0;
    }
    .pr-editable .pr-hover-edit {
      opacity: 0;
      transition: opacity 0.15s;
      margin-left: 8px;
      flex-shrink: 0;
    }
    .pr-editable:hover .pr-hover-edit { opacity: 1; }
    .pr-hover-edit {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border-radius: 4px;
      border: none;
      background: none;
      cursor: pointer;
      color: rgba(255,255,255,0.3);
      padding: 0;
      transition: color 0.15s;
    }
    .pr-hover-edit:hover { color: rgba(255,255,255,0.7); }
    .pr-hover-edit svg { width: 16px; height: 16px; fill: currentColor; }

    /* Timeline comment hover edit */
    .pr-timeline-item .pr-hover-edit {
      opacity: 0;
      position: absolute;
      top: 4px;
      right: 4px;
    }
    .pr-timeline-item:hover .pr-hover-edit { opacity: 1; }

    /* ---- Inline editing styles ---- */
    .pr-inline-title-input {
      font-size: 24px;
      font-weight: bold;
      text-shadow: 0 0 4px rgba(255,255,255,0.3);
      background: transparent;
      border: none;
      border-bottom: 1px solid rgba(255,255,255,0.2);
      color: ${PHOSPHOR};
      font-family: 'Courier New', Courier, monospace;
      width: 100%;
      padding: 0;
      outline: none;
    }
    .pr-inline-title-input:focus { border-bottom-color: rgba(255,255,255,0.4); }
    .pr-inline-desc-textarea {
      width: 100%;
      min-height: 80px;
      background: transparent;
      border: none;
      border-bottom: 1px solid rgba(255,255,255,0.15);
      color: rgba(255,255,255,0.7);
      font-family: 'Courier New', Courier, monospace;
      font-size: 14px;
      line-height: 1.6;
      resize: vertical;
      padding: 0;
      outline: none;
      box-sizing: border-box;
    }
    .pr-inline-desc-textarea:focus { border-bottom-color: rgba(255,255,255,0.3); }
    .pr-inline-comment-textarea {
      width: 100%;
      min-height: 40px;
      background: transparent;
      border: none;
      border-bottom: 1px solid rgba(255,255,255,0.15);
      color: rgba(255,255,255,0.7);
      font-family: 'Courier New', Courier, monospace;
      font-size: 14px;
      line-height: 1.6;
      resize: vertical;
      padding: 0;
      outline: none;
      box-sizing: border-box;
    }
    .pr-inline-comment-textarea:focus { border-bottom-color: rgba(255,255,255,0.3); }

    /* ---- Merge button (inline in meta row) ---- */
    .pr-merge-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      height: 28px;
      padding: 0 14px;
      border-radius: 6px;
      font-family: 'Courier New', Courier, monospace;
      font-size: 12px;
      cursor: pointer;
      background: #00c850;
      border: 1px solid #00c850;
      color: #0a0a0a;
      font-weight: bold;
      transition: background 0.15s;
      white-space: nowrap;
    }
    .pr-merge-btn:hover { background: #00da58; }
    .pr-merge-btn svg { width: 14px; height: 14px; fill: currentColor; }

    /* ---- Merge info bar (green, below meta row) ---- */
    .pr-merge-info {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      margin-top: 8px;
      border: 1px solid rgba(74,222,128,0.2);
      border-radius: 6px;
      background: rgba(74,222,128,0.03);
    }
    .pr-merge-check {
      color: #4ade80;
      display: flex;
      align-items: center;
      flex-shrink: 0;
    }
    .pr-merge-check svg { width: 16px; height: 16px; fill: currentColor; }
    .pr-merge-text {
      font-size: 12px;
      color: rgba(255,255,255,0.5);
    }
    @media (max-width: 600px) {
      .pr-merge-info { display: none; }
    }

    /* ---- Activity timeline ---- */
    .pr-timeline { margin-bottom: 24px; }
    .pr-timeline-section-label {
      font-size: 13px;
      color: rgba(255,255,255,0.35);
      margin: 20px 0 6px;
      padding-bottom: 4px;
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }
    .pr-timeline-item {
      display: flex;
      gap: 10px;
      padding: 6px 0;
      border-bottom: 1px solid rgba(255,255,255,0.04);
      position: relative;
    }
    .pr-timeline-item:last-child { border-bottom: none; }
    /* .pr-timeline-icon styles from getTimelineStyles() */
    .pr-timeline-body {
      flex: 1;
      min-width: 0;
      overflow-wrap: break-word;
      word-wrap: break-word;
      word-break: break-word;
    }
    .pr-timeline-header {
      font-size: 13px;
      color: rgba(255,255,255,0.5);
      margin-bottom: 2px;
    }
    .pr-timeline-header strong { color: rgba(255,255,255,0.8); }
    .pr-timeline-header a {
      color: #60a5fa;
      text-decoration: none;
      cursor: pointer;
    }
    .pr-timeline-header a:hover { text-decoration: underline; }
    .pr-timeline-header .pr-user-link {
      color: rgba(255,255,255,0.8);
      text-decoration: none;
      font-weight: bold;
    }
    .pr-timeline-header .pr-user-link:hover { text-decoration: underline; color: ${PHOSPHOR}; }
    .pr-timeline-content {
      font-size: 14px;
      line-height: 1.6;
      color: rgba(255,255,255,0.7);
      overflow-wrap: break-word;
      word-wrap: break-word;
      word-break: break-word;
    }
    .pr-timeline-content p { margin: 0 0 8px 0; }
    .pr-timeline-content p:last-child { margin-bottom: 0; }
    .pr-timeline-content code {
      background: rgba(255,255,255,0.08);
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 13px;
    }
    .pr-timeline-time {
      font-size: 11px;
      color: rgba(255,255,255,0.25);
    }

    /* Grouped consecutive comments — continuation without icon/name */
    .pr-timeline-item.grouped {
      padding-left: 38px; /* 28px icon + 10px gap */
      padding-top: 0;
      border-bottom: none;
    }
    .pr-timeline-item.grouped .pr-timeline-header { display: none; }
    .pr-timeline-item.group-start { border-bottom: none; }

    /* ---- Commit diff page ---- */
    .pr-commit-header {
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 6px;
      padding: 16px;
      margin-bottom: 20px;
      background: rgba(255,255,255,0.02);
    }
    .pr-commit-message {
      font-size: 16px;
      font-weight: bold;
      margin-bottom: 6px;
    }
    .pr-commit-meta {
      font-size: 12px;
      color: rgba(255,255,255,0.35);
    }
    .pr-diff-toggle {
      display: flex;
      gap: 0;
      margin-bottom: 12px;
    }
    .pr-diff-toggle-btn {
      padding: 6px 14px;
      font-size: 12px;
      font-family: 'Courier New', Courier, monospace;
      cursor: pointer;
      background: none;
      border: 1px solid rgba(255,255,255,0.12);
      color: rgba(255,255,255,0.4);
      transition: background 0.15s, color 0.15s;
    }
    .pr-diff-toggle-btn:first-child { border-radius: 4px 0 0 4px; }
    .pr-diff-toggle-btn:last-child { border-radius: 0 4px 4px 0; border-left: none; }
    .pr-diff-toggle-btn.active {
      background: rgba(255,255,255,0.08);
      color: ${PHOSPHOR};
      border-color: rgba(255,255,255,0.2);
    }
    .pr-diff-file {
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 6px;
      overflow: hidden;
      margin-bottom: 16px;
    }
    .pr-diff-file-header {
      padding: 8px 16px;
      font-size: 13px;
      font-weight: bold;
      color: rgba(255,255,255,0.6);
      border-bottom: 1px solid rgba(255,255,255,0.1);
      background: rgba(255,255,255,0.02);
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
    }
    .pr-diff-file-header svg { width: 16px; height: 16px; fill: currentColor; flex-shrink: 0; }
    .pr-diff-file-header:hover { background: rgba(255,255,255,0.04); }
    .pr-diff-file-type {
      font-size: 11px;
      padding: 1px 6px;
      border-radius: 3px;
      font-weight: normal;
    }
    .pr-diff-file-type.added { background: rgba(74,222,128,0.15); color: #4ade80; }
    .pr-diff-file-type.modified { background: rgba(96,165,250,0.15); color: #60a5fa; }
    .pr-diff-file-type.deleted { background: rgba(248,113,113,0.15); color: #f87171; }
    .pr-diff-file-body {
      overflow-x: auto;
      font-size: 13px;
      line-height: 20px;
    }
    .pr-diff-file-body.collapsed { display: none; }

    /* ---- Diff lines ---- */
    .diff-unified, .diff-side-by-side { width: 100%; }
    .diff-line {
      display: flex;
      height: 20px;
      line-height: 20px;
      font-family: 'Courier New', Courier, monospace;
    }
    .diff-line-add { background: rgba(0,200,80,0.08); }
    .diff-line-remove { background: rgba(255,60,60,0.08); }
    .diff-line-context { background: transparent; }
    .diff-line-num {
      flex: 0 0 50px;
      text-align: right;
      padding-right: 8px;
      color: rgba(255,255,255,0.2);
      font-size: 12px;
      user-select: none;
      -webkit-user-select: none;
    }
    .diff-line-prefix {
      flex: 0 0 20px;
      text-align: center;
      color: rgba(255,255,255,0.3);
      user-select: none;
      -webkit-user-select: none;
    }
    .diff-line-add .diff-line-prefix { color: #4ade80; }
    .diff-line-remove .diff-line-prefix { color: #f87171; }
    .diff-line-text {
      flex: 1;
      white-space: pre;
      color: rgba(255,255,255,0.75);
      overflow-x: hidden;
    }
    .diff-line-add .diff-line-text { color: #4ade80; }
    .diff-line-remove .diff-line-text { color: #f87171; }

    /* ---- Side-by-side ---- */
    .diff-sbs-row { display: flex; }
    .diff-sbs-left, .diff-sbs-right {
      flex: 1;
      display: flex;
      height: 20px;
      line-height: 20px;
      font-family: 'Courier New', Courier, monospace;
      min-width: 0;
    }
    .diff-sbs-left { border-right: 1px solid rgba(255,255,255,0.06); }
    .diff-sbs-left.diff-line-remove { background: rgba(255,60,60,0.08); }
    .diff-sbs-right.diff-line-add { background: rgba(0,200,80,0.08); }
    .diff-sbs-left.diff-line-empty,
    .diff-sbs-right.diff-line-empty { background: rgba(255,255,255,0.015); }
    .diff-sbs-left .diff-line-text,
    .diff-sbs-right .diff-line-text {
      flex: 1;
      white-space: pre;
      color: rgba(255,255,255,0.75);
      overflow-x: hidden;
    }
    .diff-sbs-left.diff-line-remove .diff-line-text { color: #f87171; }
    .diff-sbs-right.diff-line-add .diff-line-text { color: #4ade80; }
    .diff-sbs-left .diff-line-num,
    .diff-sbs-right .diff-line-num {
      flex: 0 0 40px;
      text-align: right;
      padding-right: 8px;
      color: rgba(255,255,255,0.2);
      font-size: 12px;
      user-select: none;
      -webkit-user-select: none;
    }

    /* ---- New PR form ---- */
    .pr-form-input {
      width: 100%;
      padding: 0;
      background: transparent;
      border: none;
      border-bottom: 1px solid rgba(255,255,255,0.2);
      color: ${PHOSPHOR};
      font-family: 'Courier New', Courier, monospace;
      font-size: 24px;
      font-weight: bold;
      box-sizing: border-box;
      margin-bottom: 4px;
      text-shadow: 0 0 4px rgba(255,255,255,0.3);
      outline: none;
    }
    .pr-form-input:focus { border-bottom-color: rgba(255,255,255,0.4); }
    .pr-form-input::placeholder { color: rgba(255,255,255,0.2); }
    .pr-form-textarea {
      width: 100%;
      min-height: 80px;
      padding: 0;
      background: transparent;
      border: none;
      border-bottom: 1px solid rgba(255,255,255,0.15);
      color: rgba(255,255,255,0.7);
      font-family: 'Courier New', Courier, monospace;
      font-size: 14px;
      line-height: 1.6;
      resize: vertical;
      box-sizing: border-box;
      outline: none;
    }
    .pr-form-textarea:focus { border-bottom-color: rgba(255,255,255,0.3); }
    .pr-form-textarea::placeholder { color: rgba(255,255,255,0.2); }
    .pr-form-select {
      padding: 2px 8px;
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 4px;
      color: rgba(255,255,255,0.65);
      font-family: 'Courier New', Courier, monospace;
      font-size: 12px;
      cursor: pointer;
    }
    .pr-form-select:focus { outline: 1px solid rgba(255,255,255,0.25); }
    .pr-form-actions {
      display: flex;
      gap: 10px;
      margin-top: 16px;
    }
    .pr-create-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      height: 32px;
      padding: 0 16px;
      border-radius: 6px;
      font-family: 'Courier New', Courier, monospace;
      font-size: 13px;
      cursor: pointer;
      background: #00c850;
      border: 1px solid #00c850;
      color: #0a0a0a;
      font-weight: bold;
      transition: background 0.15s;
    }
    .pr-create-btn:hover { background: #00da58; }
    .pr-cancel-btn {
      display: inline-flex;
      align-items: center;
      height: 32px;
      padding: 0 16px;
      border-radius: 6px;
      font-family: 'Courier New', Courier, monospace;
      font-size: 13px;
      cursor: pointer;
      background: none;
      border: 1px solid rgba(255,255,255,0.15);
      color: rgba(255,255,255,0.55);
      text-decoration: none;
      transition: border-color 0.15s, color 0.15s;
    }
    .pr-cancel-btn:hover { border-color: rgba(255,255,255,0.3); color: rgba(255,255,255,0.75); text-decoration: none; }

    @media (max-width: 640px) {
      .pr-page { padding: 16px 12px 0; }
      .pr-detail-title { font-size: 18px; }
      .pr-branch-info { flex-wrap: wrap; }
      .diff-sbs-row { flex-direction: column; }
      .diff-sbs-left { border-right: none; border-bottom: 1px solid rgba(255,255,255,0.06); }
    }
  `;
  document.head.appendChild(styleEl);
}

// ---- Helpers ----

// escapeHtml, formatTime, getUserProfilePic, renderUserIcon, userLink imported from ChatCommon.ts

function statusIcon(status: PRStatus): string {
  if (status === 'merged') return `<span class="pr-row-icon merged">${MERGE_SVG}</span>`;
  if (status === 'closed') return `<span class="pr-row-icon closed">${BRANCH_SVG}</span>`;
  return `<span class="pr-row-icon open">${BRANCH_SVG}</span>`;
}

function statusBadge(status: PRStatus): string {
  const labels: Record<PRStatus, string> = { open: 'Open', closed: 'Closed', merged: 'Merged' };
  return `<span class="pr-status-badge ${status}">${labels[status]}</span>`;
}

function buildPullsUrl(params: PRParams, suffix?: string): string {
  const base = params.base || '';
  const pathPart = params.path.length > 0 ? '/' + params.path.join('/') : '';
  const categoryPart = params.category ? '/' + params.category : '';
  return `${base}${pathPart}/-${categoryPart}/pulls${suffix ? '/' + suffix : ''}`;
}

function buildRepoUrl(params: PRParams): string {
  const base = params.base || '';
  const pathPart = params.path.length > 0 ? '/' + params.path.join('/') : '';
  return `${base}${pathPart}` || '/';
}

function buildUserUrl(user: string): string {
  return `/@${user}`;
}

// getUserProfilePic, renderUserIcon, userLink imported from ChatCommon.ts

/** Render a clickable branch label */
function branchLink(label: string): string {
  // Branch labels like "alice/superposition" link to /@alice/superposition
  // Branch labels like "main" just render as text
  const href = label.includes('/') ? `/@${label}` : '#';
  return `<a href="${href}" ${href !== '#' ? 'data-link' : ''} class="pr-branch-label">${escapeHtml(label)}</a>`;
}

// ---- Header chain (reuses Repository.ts .repo-header pattern) ----

function renderHeaderChain(params: PRParams): string {
  const base = params.base || '';

  let html = `<div class="repo-header">`;
  // Only show @user breadcrumb when /@user is actually in the URL
  if (base) {
    const userPullsUrl = `${base}/-/pulls`;
    html += `<a href="${userPullsUrl}" data-link class="user">@${escapeHtml(params.user)}</a>`;
  }
  // Path segments → cumulative PR lists using the actual URL base
  for (let i = 0; i < params.path.length; i++) {
    if (base || i > 0) html += `<span class="sep">/</span>`;
    const isLast = i === params.path.length - 1;
    const cls = isLast ? 'repo-name' : 'user';
    const segPath = params.path.slice(0, i + 1).join('/');
    const segPullsUrl = `${base}/${segPath}/-/pulls`;
    html += `<a href="${segPullsUrl}" data-link class="${cls}">${escapeHtml(displaySegment(params.path[i]))}</a>`;
  }
  html += `</div>`;
  return html;
}

// ---- Render: PR List ----

async function renderPRList(params: PRParams): Promise<string> {
  const inlinePRs = await getInlinePullRequests(params.repoPath);
  const playerSummary = await getCategoryPRSummary(params.repoPath, '@');
  const worldSummary = await getCategoryPRSummary(params.repoPath, '~');

  const openPRs = inlinePRs.filter(({ pr }) => pr.status === 'open')
    .sort((a, b) => new Date(b.pr.updatedAt).getTime() - new Date(a.pr.updatedAt).getTime());
  const closedPRs = inlinePRs.filter(({ pr }) => pr.status === 'closed' || pr.status === 'merged')
    .sort((a, b) => new Date(b.pr.updatedAt).getTime() - new Date(a.pr.updatedAt).getTime());

  let html = `<div class="pr-page">`;
  html += renderHeaderChain(params);

  html += `<a href="${buildRepoUrl(params)}" data-link class="pr-back-link">${ARROW_LEFT_SVG} Back to code</a>`;

  html += `<div class="pr-list-header">
    <span style="font-size:16px; font-weight:bold;">Pull Requests</span>
    <a href="${buildPullsUrl(params, 'new')}" data-link class="pr-new-btn">${PR_SVG} New Pull Request</a>
  </div>`;

  html += `<div class="pr-filter-tabs">
    <button class="pr-filter-tab active" data-pr-filter="open">Open <span class="pr-filter-count">${openPRs.length}</span></button>
    <button class="pr-filter-tab" data-pr-filter="closed">Closed <span class="pr-filter-count">${closedPRs.length}</span></button>
  </div>`;

  html += `<div class="pr-list">`;

  // Category rows: Players (@) and Worlds (~) — open + closed variants
  if (playerSummary) {
    html += renderCategoryRow(playerSummary, '@', 'open', params);
    html += renderCategoryRow(playerSummary, '@', 'closed', params);
  }
  if (worldSummary) {
    html += renderCategoryRow(worldSummary, '~', 'open', params);
    html += renderCategoryRow(worldSummary, '~', 'closed', params);
  }

  // Open PRs (visible by default) — each shows its folder path prefix
  for (const { pr, relPath } of openPRs) {
    html += renderPRRow(pr, 'open', false, relPath);
  }
  // Closed/Merged PRs (hidden by default)
  for (const { pr, relPath } of closedPRs) {
    html += renderPRRow(pr, 'closed', true, relPath);
  }

  if (inlinePRs.length === 0 && !playerSummary && !worldSummary) {
    html += `<div class="pr-empty">No pull requests yet.</div>`;
  }

  html += `</div></div>`;
  return html;
}

function renderCategoryRow(summary: CategoryPRSummary, prefix: '@' | '~', filterGroup: 'open' | 'closed', params: PRParams): string {
  const label = prefix === '@' ? '@{: String}' : '#{: String}';
  const kindLabel = prefix === '@'
    ? (summary.itemCount === 1 ? 'Player' : 'Players')
    : (summary.itemCount === 1 ? 'World' : 'Worlds');
  const categoryUrl = `${params.base || ''}${params.path.length > 0 ? '/' + params.path.join('/') : ''}/-/${prefix}/pulls`;
  const fullUrl = filterGroup === 'closed' ? categoryUrl + '?filter=closed' : categoryUrl;
  const hidden = filterGroup === 'closed' ? ' style="display:none"' : '';
  const count = filterGroup === 'open' ? summary.openCount : summary.closedCount;
  if (count === 0) return '';
  const verb = filterGroup === 'open' ? 'open across' : 'closed in';
  const meta = `${count} ${verb} ${summary.itemCount} ${kindLabel}`;

  let html = `<a href="${fullUrl}" data-link class="pr-category-row" data-pr-filter-group="${filterGroup}"${hidden}>`;
  html += `<div class="pr-category-icon">${PR_SVG}</div>`;
  html += `<div class="pr-category-body">`;
  html += `<div class="pr-category-name">${escapeHtml(label)}</div>`;
  html += `<div class="pr-category-meta">${meta}</div>`;
  html += `</div>`;
  html += `</a>`;
  return html;
}

// ---- Render: Category list (players or worlds) ----

async function renderCategoryList(params: PRParams): Promise<string> {
  const prefix = params.category!;
  const categoryLabel = prefix === '@' ? '@{: String}' : '#{: String}';
  const prs = await getCategoryPullRequests(params.repoPath, prefix);

  const openPRs = prs.filter(({ pr }) => pr.status === 'open')
    .sort((a, b) => new Date(b.pr.updatedAt).getTime() - new Date(a.pr.updatedAt).getTime());
  const closedPRs = prs.filter(({ pr }) => pr.status === 'closed' || pr.status === 'merged')
    .sort((a, b) => new Date(b.pr.updatedAt).getTime() - new Date(a.pr.updatedAt).getTime());

  let html = `<div class="pr-page">`;
  html += renderHeaderChain(params);

  // Back link to main PR list
  const mainListParams = { ...params, category: null as '@' | '~' | null };
  html += `<a href="${buildPullsUrl(mainListParams)}" data-link class="pr-back-link">${ARROW_LEFT_SVG} Back to pull requests</a>`;

  html += `<div class="pr-list-header">
    <span style="font-size:16px; font-weight:bold;">${escapeHtml(categoryLabel)}</span>
  </div>`;

  html += `<div class="pr-filter-tabs">
    <button class="pr-filter-tab active" data-pr-filter="open">Open <span class="pr-filter-count">${openPRs.length}</span></button>
    <button class="pr-filter-tab" data-pr-filter="closed">Closed <span class="pr-filter-count">${closedPRs.length}</span></button>
  </div>`;

  html += `<div class="pr-list">`;

  for (const { pr, relPath } of openPRs) {
    html += renderPRRow(pr, 'open', false, relPath);
  }
  for (const { pr, relPath } of closedPRs) {
    html += renderPRRow(pr, 'closed', true, relPath);
  }

  if (prs.length === 0) {
    html += `<div class="pr-empty">No pull requests in this category.</div>`;
  }

  html += `</div></div>`;
  return html;
}

/** Convert a single URL-style segment to display: ~foo → #foo (worlds use # for display, ~ in URLs) */
function displaySegment(seg: string): string {
  return seg.startsWith('~') ? '#' + seg.slice(1) : seg;
}

/** Convert URL-style path segments to display: ~ → # (worlds use # for display, ~ in URLs) */
function displayPath(relPath: string): string {
  return relPath.split('/').map(displaySegment).join('/');
}

function renderPRRow(pr: PullRequest, filterGroup: string, hidden = false, relPath = ''): string {
  const display = hidden ? ' style="display:none"' : '';
  const pathPrefix = relPath ? `<span class="pr-row-path">${escapeHtml(displayPath(relPath))}</span>` : '';
  let html = `<div class="pr-row" data-pr-filter-group="${filterGroup}" data-pr-id="${pr.id}"${display}>`;
  html += statusIcon(pr.status);
  html += `<div class="pr-row-body">
    <div class="pr-row-title">${pathPrefix}${escapeHtml(pr.title)}</div>
    <div class="pr-row-meta">#${pr.id} opened ${formatTime(pr.createdAt)} by ${escapeHtml(pr.author)}</div>
  </div>`;
  if (pr.comments.length > 0) {
    html += `<div class="pr-row-comments">${COMMENT_SVG} ${pr.comments.length}</div>`;
  }
  html += `</div>`;
  return html;
}

// ---- Render shared: title block + branch info ----

function renderStickyHeader(pr: PullRequest, params: PRParams): string {
  let html = `<div class="pr-sticky-header">`;

  // Title + status badge (with hover edit)
  html += `<div class="pr-editable" data-edit-target="title">`;
  html += `<div class="pr-detail-title-row">`;
  html += `<span class="pr-detail-title" data-edit-display="title">${escapeHtml(pr.title)}</span>`;
  html += `<span class="pr-detail-id">#${pr.id}</span>`;
  html += statusBadge(pr.status);
  html += `</div>`;
  if (pr.status === 'open') {
    html += `<button class="pr-hover-edit" data-edit-action="title" title="Edit title">${EDIT_SVG}</button>`;
  }
  html += `</div>`;

  // Meta + branch + merge — all on one row
  html += `<div class="pr-meta-row">`;
  html += `<span class="pr-detail-meta">by ${userLink(pr.author)}</span>`;
  html += `<div class="pr-editable pr-branch-info" data-edit-target="branch">`;
  html += `<span class="pr-branch-icon">${BRANCH_SVG}</span>`;
  html += branchLink(pr.sourceLabel);
  html += `<span class="pr-branch-arrow">${ARROW_RIGHT_SVG}</span>`;
  html += branchLink(pr.targetLabel);
  if (pr.status === 'open') {
    html += `<button class="pr-hover-edit" data-edit-action="branch" title="Edit branch">${EDIT_SVG}</button>`;
  }
  html += `</div>`;
  if (pr.status === 'open' && pr.mergeable) {
    html += `<button class="pr-merge-btn" data-pr-merge>${MERGE_SVG} Merge</button>`;
  }
  html += `</div>`;

  // Merge info box — wider screens only, collapses on mobile
  if (pr.status === 'open' && pr.mergeable) {
    html += `<div class="pr-merge-info">`;
    html += `<span class="pr-merge-check">${CHECK_SVG}</span>`;
    html += `<span class="pr-merge-text">This branch has no conflicts with the base branch.</span>`;
    html += `</div>`;
  }

  html += `</div>`; // close .pr-sticky-header
  return html;
}

// ---- Render system events (commits, status changes, merges) ----

function renderSystemEvent(item: ActivityItem, params: PRParams, pr: PullRequest): string {
  switch (item.type) {
    case 'commit': {
      const commitUrl = buildPullsUrl(params, `${pr.id}/commits/${item.commit.id}`);
      return `<div class="pr-system-event">
        <div class="pr-timeline-icon commit">${COMMIT_SVG}</div>
        <span>${userLink(item.commit.author)} committed <a href="${commitUrl}" data-link>${escapeHtml(item.commit.message)}</a> <span style="color:rgba(255,255,255,0.2)">${formatTime(item.createdAt)}</span></span>
      </div>`;
    }
    case 'status_change':
      return `<div class="pr-system-event">
        <div class="pr-timeline-icon status">${STATUS_CHANGE_SVG}</div>
        <span>${userLink(item.author)} changed status from <em>${item.from}</em> to <em>${item.to}</em> <span style="color:rgba(255,255,255,0.2)">${formatTime(item.createdAt)}</span></span>
      </div>`;
    case 'merge':
      return `<div class="pr-system-event">
        <div class="pr-timeline-icon merge">${MERGE_SVG}</div>
        <span>${userLink(item.author)} merged this pull request <span style="color:rgba(255,255,255,0.2)">${formatTime(item.createdAt)}</span></span>
      </div>`;
    default:
      return '';
  }
}

// ---- Render: PR Detail (as chat conversation) ----

async function renderPRDetailView(params: PRParams): Promise<void> {
  if (!currentContainer) return;
  const pr = await getPullRequest(params.repoPath, params.prId!);
  if (!pr) {
    currentContainer.innerHTML = `<div class="pr-page">${renderHeaderChain(params)}<div class="pr-empty">Pull request #${params.prId} not found.</div></div>`;
    bindNonDetailEvents();
    return;
  }

  // Build wrapper HTML around the ChatView
  let wrapper = `<div class="pr-page">`;
  wrapper += renderHeaderChain(params);
  wrapper += `<a href="${buildPullsUrl(params)}" data-link class="pr-back-link">${ARROW_LEFT_SVG} Back to pull requests</a>`;
  wrapper += `<div data-chatview-root></div>`;
  wrapper += `</div>`;
  currentContainer.innerHTML = wrapper;

  const viewRoot = currentContainer.querySelector<HTMLElement>('[data-chatview-root]')!;

  // Build timeline entry helpers
  function buildPREntries(pr: PullRequest): TimelineEntry[] {
    const descMsg: ChatMessage = {
      id: -1,
      author: pr.author,
      body: pr.description,
      createdAt: pr.createdAt,
      reactions: [],
      deliveryStatus: 'delivered',
    };
    const entries: TimelineEntry[] = [];
    entries.push({ kind: 'message', createdAt: pr.createdAt, message: descMsg });
    for (const item of pr.activity) {
      if (item.type === 'comment') {
        entries.push({ kind: 'message', createdAt: item.createdAt, message: item.comment });
      } else {
        entries.push({ kind: 'system', createdAt: item.createdAt, html: renderSystemEvent(item, params, pr) });
      }
    }
    return entries;
  }

  function getAllPRMessages(pr: PullRequest): ChatMessage[] {
    const descMsg: ChatMessage = {
      id: -1,
      author: pr.author,
      body: pr.description,
      createdAt: pr.createdAt,
      reactions: [],
      deliveryStatus: 'delivered',
    };
    const allComments = pr.activity
      .filter((a): a is { type: 'comment'; comment: ChatMessage; createdAt: string } => a.type === 'comment')
      .map(a => a.comment);
    return [descMsg, ...allComments];
  }

  chatView?.destroy();
  chatView = createChatView(viewRoot, navigateFn!, {
    getEntries: async () => {
      const p = await getPullRequest(params.repoPath, params.prId!);
      return p ? buildPREntries(p) : [];
    },
    getHeaderHtml: () => renderStickyHeader(pr, params),
    headerClass: 'pr-sticky-header',
    titleRowSelector: '.pr-detail-title-row',
    inputEnabled: pr.status === 'open',
    placeholder: 'Leave a comment...',
    getAllMessages: () => getAllPRMessages(pr),
    features: {
      scrollDown: true,
    },
    onSend: async (text) => {
      const currentUser = getCurrentPlayer();
      const body = text.trim();
      if (!body) return;
      const latestPr = await getPullRequest(params.repoPath, params.prId!);
      if (!latestPr) return;
      const comment: ChatMessage = {
        id: latestPr.comments.length + 100,
        author: currentUser,
        body,
        createdAt: new Date().toISOString(),
        reactions: [],
        deliveryStatus: 'delivered',
      };
      latestPr.comments.push(comment);
      latestPr.activity.push({ type: 'comment', comment, createdAt: comment.createdAt });
      latestPr.updatedAt = comment.createdAt;
    },
    onReaction: async (msgId, emoji) => {
      const latestPr = await getPullRequest(params.repoPath, params.prId!);
      if (!latestPr) return;
      if (msgId === -1) return; // skip description reactions
      const msg = latestPr.comments.find(c => c.id === msgId);
      if (!msg) return;
      const me = getCurrentPlayer();
      const existing = msg.reactions.find(r => r.emoji === emoji);
      if (existing) {
        const idx = existing.users.indexOf(me);
        if (idx >= 0) {
          existing.users.splice(idx, 1);
          if (existing.users.length === 0) msg.reactions.splice(msg.reactions.indexOf(existing), 1);
        } else {
          existing.users.push(me);
        }
      } else {
        msg.reactions.push({ emoji, users: [me] });
      }
    },
    onRender: () => chatView?.render(),
    onBindEvents: (c) => {
      // Merge button
      const mergeBtn = c.querySelector('[data-pr-merge]') as HTMLButtonElement | null;
      if (mergeBtn) {
        mergeBtn.addEventListener('click', () => { void (async () => {
          const currentUser = getCurrentPlayer();
          const latestPr = await getPullRequest(params.repoPath, params.prId!);
          if (latestPr) {
            latestPr.status = 'merged';
            latestPr.updatedAt = new Date().toISOString();
            latestPr.mergeable = false;
            latestPr.activity.push({ type: 'merge', author: currentUser, createdAt: new Date().toISOString() });
            latestPr.activity.push({ type: 'status_change', from: 'open', to: 'merged', author: currentUser, createdAt: new Date().toISOString() });
            chatView?.render();
          }
        })(); });
      }

      // Edit buttons (title, description, branch, comment)
      c.querySelectorAll('[data-edit-action]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const action = (btn as HTMLElement).dataset.editAction!;
          if (action === 'title') startEditTitle();
          else if (action === 'description') startEditDescription();
          else if (action === 'branch') startEditBranch();
          else if (action === 'comment') {
            const commentId = parseInt((btn as HTMLElement).dataset.commentId!, 10);
            startEditComment(commentId);
          }
        });
      });
    },
  });
  await chatView.render();

  // Bind non-ChatView events on the wrapper (back link, data-link clicks)
  bindNonDetailEvents();
}

// ---- Render: Commit Diff ----

async function renderCommitDiff(params: PRParams): Promise<string> {
  const pr = await getPullRequest(params.repoPath, params.prId!);
  if (!pr) {
    return `<div class="pr-page">${renderHeaderChain(params)}<div class="pr-empty">Pull request not found.</div></div>`;
  }

  const commit = pr.commits.find(c => c.id === params.commitId);
  if (!commit) {
    return `<div class="pr-page">${renderHeaderChain(params)}<div class="pr-empty">Commit not found.</div></div>`;
  }

  let html = `<div class="pr-page">`;
  html += renderHeaderChain(params);

  // Back link to PR detail
  html += `<a href="${buildPullsUrl(params, String(pr.id))}" data-link class="pr-back-link">${ARROW_LEFT_SVG} Back to #${pr.id}</a>`;

  // Commit header
  html += `<div class="pr-commit-header">`;
  html += `<div class="pr-commit-message">${escapeHtml(commit.message)}</div>`;
  html += `<div class="pr-commit-meta">${escapeHtml(commit.author)} committed ${formatTime(commit.createdAt)} &middot; <span style="color:rgba(255,255,255,0.2)">${commit.id.slice(0, 8)}</span></div>`;
  html += `</div>`;

  // Diff mode toggle
  html += `<div class="pr-diff-toggle">`;
  html += `<button class="pr-diff-toggle-btn${currentDiffMode === 'unified' ? ' active' : ''}" data-diff-mode="unified">Unified</button>`;
  html += `<button class="pr-diff-toggle-btn${currentDiffMode === 'side-by-side' ? ' active' : ''}" data-diff-mode="side-by-side">Side-by-side</button>`;
  html += `</div>`;

  // File diffs
  for (const diff of commit.diffs) {
    html += renderFileDiff(diff);
  }

  html += `</div>`;
  return html;
}

function renderFileDiff(fileDiff: FileDiff): string {
  const diffLines = computeDiff(fileDiff.oldContent, fileDiff.newContent);
  const diffHtml = currentDiffMode === 'unified'
    ? renderUnifiedDiff(diffLines)
    : renderSideBySideDiff(diffLines);

  let html = `<div class="pr-diff-file">`;
  html += `<div class="pr-diff-file-header" data-diff-collapse>`;
  html += FILE_DIFF_SVG;
  html += `<span>${escapeHtml(fileDiff.path)}</span>`;
  html += `<span class="pr-diff-file-type ${fileDiff.type}">${fileDiff.type}</span>`;
  html += `</div>`;
  html += `<div class="pr-diff-file-body">${diffHtml}</div>`;
  html += `</div>`;
  return html;
}

// ---- Render: New PR form (same layout as detail but editable) ----

async function renderNewPRForm(params: PRParams): Promise<string> {
  const currentUser = getCurrentPlayer();

  let html = `<div class="pr-page">`;
  html += renderHeaderChain(params);

  // Back link
  html += `<a href="${buildPullsUrl(params)}" data-link class="pr-back-link">${ARROW_LEFT_SVG} Back to pull requests</a>`;

  // Editable title (same look as rendered title)
  html += `<input type="text" class="pr-form-input" placeholder="Title" data-pr-title-input />`;

  // "by @currentUser" line
  html += `<div class="pr-detail-meta">by ${userLink(currentUser)}</div>`;

  // Branch info (inline, with editable target)
  html += `<div class="pr-branch-info">`;
  html += `<span class="pr-branch-icon">${BRANCH_SVG}</span>`;
  html += `<span class="pr-branch-label">feature/new-branch</span>`;
  html += `<span class="pr-branch-arrow">${ARROW_RIGHT_SVG}</span>`;
  html += `<select class="pr-form-select" data-pr-target-branch>
    <option value="main">main</option>
    <option value="develop">develop</option>
  </select>`;
  html += `</div>`;

  // Description (same comment-style as detail, but with textarea)
  html += `<div class="pr-timeline-section-label">Description</div>`;
  html += `<div class="pr-timeline-item">`;
  html += await renderUserIcon(`@${currentUser}`, COMMENT_SVG, 'comment');
  html += `<div class="pr-timeline-body">`;
  html += `<div class="pr-timeline-header">${userLink(currentUser)}</div>`;
  html += `<textarea class="pr-form-textarea" placeholder="Describe your changes..." data-pr-desc-input></textarea>`;
  html += `</div></div>`;

  // Actions
  html += `<div class="pr-form-actions">`;
  html += `<button class="pr-create-btn" data-pr-create>Create Pull Request</button>`;
  html += `<a href="${buildPullsUrl(params)}" data-link class="pr-cancel-btn">Cancel</a>`;
  html += `</div>`;

  html += `</div>`;
  return html;
}

// ---- Inline editing ----

async function startEditTitle(): Promise<void> {
  if (!currentContainer || !currentParams) return;
  const pr = await getPullRequest(currentParams.repoPath, currentParams.prId!);
  if (!pr) return;

  const display = currentContainer.querySelector('[data-edit-display="title"]') as HTMLElement;
  if (!display) return;

  const wrapper = display.closest('.pr-editable') as HTMLElement;
  if (!wrapper) return;

  // Replace the title-row content with an input
  const titleRow = wrapper.querySelector('.pr-detail-title-row') as HTMLElement;
  if (!titleRow) return;

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'pr-inline-title-input';
  input.value = pr.title;
  titleRow.replaceWith(input);
  input.focus();
  input.select();

  // Hide edit button while editing
  const editBtn = wrapper.querySelector('.pr-hover-edit') as HTMLElement;
  if (editBtn) editBtn.style.display = 'none';

  const save = () => {
    const newTitle = input.value.trim();
    if (newTitle && newTitle !== pr.title) {
      pr.title = newTitle;
      pr.updatedAt = new Date().toISOString();
    }
    render();
  };

  input.addEventListener('blur', save);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); save(); }
    if (e.key === 'Escape') { render(); }
  });
}

async function startEditDescription(): Promise<void> {
  if (!currentContainer || !currentParams) return;
  const pr = await getPullRequest(currentParams.repoPath, currentParams.prId!);
  if (!pr) return;

  const display = currentContainer.querySelector('[data-edit-display="description"]') as HTMLElement;
  if (!display) return;

  const textarea = document.createElement('textarea');
  textarea.className = 'pr-inline-desc-textarea';
  textarea.value = pr.description;
  display.replaceWith(textarea);
  textarea.focus();

  // Hide edit button
  const item = textarea.closest('.pr-timeline-item') as HTMLElement;
  const editBtn = item?.querySelector('.pr-hover-edit') as HTMLElement;
  if (editBtn) editBtn.style.display = 'none';

  const save = () => {
    const newDesc = textarea.value.trim();
    if (newDesc !== pr.description) {
      pr.description = newDesc;
      pr.updatedAt = new Date().toISOString();
    }
    render();
  };

  textarea.addEventListener('blur', save);
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { render(); }
  });
}

async function startEditComment(commentId: number): Promise<void> {
  if (!currentContainer || !currentParams) return;
  const pr = await getPullRequest(currentParams.repoPath, currentParams.prId!);
  if (!pr) return;

  const comment = pr.comments.find(c => c.id === commentId);
  if (!comment) return;

  const display = currentContainer.querySelector(`[data-edit-display="comment-${commentId}"]`) as HTMLElement;
  if (!display) return;

  const textarea = document.createElement('textarea');
  textarea.className = 'pr-inline-comment-textarea';
  textarea.value = comment.body;
  display.replaceWith(textarea);
  textarea.focus();

  // Hide edit button
  const item = textarea.closest('.pr-timeline-item') as HTMLElement;
  const editBtn = item?.querySelector('.pr-hover-edit') as HTMLElement;
  if (editBtn) editBtn.style.display = 'none';

  const save = () => {
    const newBody = textarea.value.trim();
    if (newBody && newBody !== comment.body) {
      comment.body = newBody;
      pr.updatedAt = new Date().toISOString();
      // Also update the matching activity item
      for (const act of pr.activity) {
        if (act.type === 'comment' && act.comment.id === commentId) {
          act.comment.body = newBody;
        }
      }
    }
    render();
  };

  textarea.addEventListener('blur', save);
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { render(); }
  });
}

async function startEditBranch(): Promise<void> {
  if (!currentContainer || !currentParams) return;
  const pr = await getPullRequest(currentParams.repoPath, currentParams.prId!);
  if (!pr) return;

  const branchInfo = currentContainer.querySelector('[data-edit-target="branch"]') as HTMLElement;
  if (!branchInfo) return;

  // Replace the branch labels with inputs
  const branchLabels = branchInfo.querySelectorAll('.pr-branch-label');
  if (branchLabels.length < 2) return;

  const sourceInput = document.createElement('input');
  sourceInput.type = 'text';
  sourceInput.value = pr.sourceLabel;
  sourceInput.className = 'pr-branch-label';
  sourceInput.style.border = '1px solid rgba(255,255,255,0.2)';
  sourceInput.style.background = 'rgba(255,255,255,0.03)';
  sourceInput.style.outline = 'none';
  sourceInput.style.fontFamily = "'Courier New', Courier, monospace";
  branchLabels[0].replaceWith(sourceInput);

  const targetInput = document.createElement('input');
  targetInput.type = 'text';
  targetInput.value = pr.targetLabel;
  targetInput.className = 'pr-branch-label';
  targetInput.style.border = '1px solid rgba(255,255,255,0.2)';
  targetInput.style.background = 'rgba(255,255,255,0.03)';
  targetInput.style.outline = 'none';
  targetInput.style.fontFamily = "'Courier New', Courier, monospace";
  branchLabels[1].replaceWith(targetInput);

  sourceInput.focus();
  sourceInput.select();

  // Hide edit button
  const editBtn = branchInfo.querySelector('.pr-hover-edit') as HTMLElement;
  if (editBtn) editBtn.style.display = 'none';

  const save = () => {
    const newSource = sourceInput.value.trim();
    const newTarget = targetInput.value.trim();
    if (newSource) pr.sourceLabel = newSource;
    if (newTarget) pr.targetLabel = newTarget;
    pr.updatedAt = new Date().toISOString();
    render();
  };

  let saving = false;
  const trySave = () => {
    if (saving) return;
    // Only save when both inputs lose focus
    setTimeout(() => {
      if (document.activeElement !== sourceInput && document.activeElement !== targetInput) {
        saving = true;
        save();
      }
    }, 0);
  };

  sourceInput.addEventListener('blur', trySave);
  targetInput.addEventListener('blur', trySave);
  sourceInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); save(); }
    if (e.key === 'Escape') { render(); }
  });
  targetInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); save(); }
    if (e.key === 'Escape') { render(); }
  });
}

// ---- Event binding (non-detail views only) ----

function bindNonDetailEvents(): void {
  if (!currentContainer || !navigateFn || !currentParams) return;

  // Filter tabs
  currentContainer.querySelectorAll('[data-pr-filter]').forEach(tab => {
    tab.addEventListener('click', () => {
      const filter = (tab as HTMLElement).dataset.prFilter!;
      currentContainer!.querySelectorAll('[data-pr-filter]').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentContainer!.querySelectorAll('[data-pr-filter-group]').forEach(row => {
        const group = (row as HTMLElement).dataset.prFilterGroup;
        (row as HTMLElement).style.display = group === filter ? '' : 'none';
      });
    });
  });

  // PR row clicks
  currentContainer.querySelectorAll('.pr-row').forEach(row => {
    row.addEventListener('click', () => {
      const prId = (row as HTMLElement).dataset.prId!;
      navigateFn!(buildPullsUrl(currentParams!, prId));
    });
  });

  // Link clicks (data-link)
  currentContainer.querySelectorAll('[data-link]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const href = (link as HTMLAnchorElement).getAttribute('href');
      if (href && href !== '#') navigateFn!(href);
    });
  });

  // Diff mode toggle
  currentContainer.querySelectorAll('[data-diff-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      currentDiffMode = (btn as HTMLElement).dataset.diffMode as 'unified' | 'side-by-side';
      render();
    });
  });

  // Diff file collapse toggle
  currentContainer.querySelectorAll('[data-diff-collapse]').forEach(header => {
    header.addEventListener('click', () => {
      const body = header.nextElementSibling as HTMLElement;
      if (body) body.classList.toggle('collapsed');
    });
  });

  // Create PR
  const createBtn = currentContainer.querySelector('[data-pr-create]') as HTMLButtonElement | null;
  if (createBtn && currentParams) {
    createBtn.addEventListener('click', () => { void (async () => {
      const titleInput = currentContainer!.querySelector('[data-pr-title-input]') as HTMLInputElement | null;
      const descInput = currentContainer!.querySelector('[data-pr-desc-input]') as HTMLTextAreaElement | null;
      const targetSelect = currentContainer!.querySelector('[data-pr-target-branch]') as HTMLSelectElement | null;
      const title = titleInput?.value.trim() || '';
      const desc = descInput?.value.trim() || '';
      const target = targetSelect?.value || 'main';
      if (!title) {
        if (titleInput) titleInput.style.borderBottomColor = '#f87171';
        return;
      }
      const pr = await createPullRequest(currentParams!.repoPath, title, desc, 'feature/new-branch', target);
      navigateFn!(buildPullsUrl(currentParams!, String(pr.id)));
    })(); });
  }
}

// ---- Render dispatcher ----

async function render(): Promise<void> {
  if (!currentContainer || !currentParams) return;

  // PR detail (non-commit) — ChatView manages its own DOM
  if (currentParams.prAction === 'detail' && !currentParams.commitId) {
    await renderPRDetailView(currentParams);
    return;
  }

  // All other views return HTML strings
  chatView?.destroy();
  chatView = null;

  let html = '';
  if (currentParams.prAction === 'list') {
    html = await renderPRList(currentParams);
  } else if (currentParams.prAction === 'players' || currentParams.prAction === 'worlds') {
    html = await renderCategoryList(currentParams);
  } else if (currentParams.prAction === 'new') {
    html = await renderNewPRForm(currentParams);
  } else if (currentParams.prAction === 'detail' && currentParams.commitId) {
    html = await renderCommitDiff(currentParams);
  }

  currentContainer.innerHTML = html;
  bindNonDetailEvents();

  // Auto-activate closed tab if URL has ?filter=closed
  const filterParam = new URLSearchParams(window.location.search).get('filter');
  if (filterParam === 'closed') {
    const closedTab = currentContainer.querySelector('[data-pr-filter="closed"]') as HTMLElement;
    if (closedTab) closedTab.click();
  }
}

// ---- Public API ----

export async function mount(
  container: HTMLElement,
  params: PRParams,
  navigate: (path: string) => void,
): Promise<void> {
  injectStyles();
  currentContainer = container;
  currentParams = params;
  navigateFn = navigate;
  await render();
}

export async function update(params: PRParams): Promise<void> {
  currentParams = params;
  await render();
}

export function unmount(): void {
  chatView?.destroy();
  chatView = null;
  currentContainer = null;
  currentParams = null;
}
