/**
 * Cover slide templates — inline-style HTML for Satori.
 */
import type { SlideRenderSpec, TemplateConfig } from "./types";
import { cw, ch, escapeHtml, ls, bgStyle, heroBlock, sx, sy } from "./util";

// ── Metadata ─────────────────────────────────────────────

export const COVER_PHOTO_V1_CONFIG: TemplateConfig = {
  id: "cover.photo.v1",
  kind: "cover",
  label: "포토 퍼스트 커버",
  description: "풀블리드 사진 + 하단 미니멀 텍스트 (인스타 매거진 스타일)",
  defaultBg: "#000",
  defaults: { titleSizePx: 48, bodySizePx: 20, footerSizePx: 20, titleWeight: 800, bodyWeight: 400 },
};

export const COVER_V1_CONFIG: TemplateConfig = {
  id: "cover.hero.v1",
  kind: "cover",
  label: "커버 V1 (중앙)",
  description: "중앙 상단 타이틀 + 220px 하단 스크림",
  defaultBg: "linear-gradient(160deg, #0f0c29 0%, #302b63 50%, #24243e 100%)",
  defaults: { titleSizePx: 72, bodySizePx: 30, footerSizePx: 22, titleWeight: 800, bodyWeight: 400 },
};

export const COVER_V2_CONFIG: TemplateConfig = {
  id: "cover.hero.v2",
  kind: "cover",
  label: "커버 V2 (좌측)",
  description: "좌측 정렬 하단 타이틀 + 360px 스크림",
  defaultBg: "linear-gradient(160deg, #1a0a2e 0%, #2d1b4e 40%, #4a2068 100%)",
  defaults: { titleSizePx: 56, bodySizePx: 28, footerSizePx: 22, titleWeight: 800, bodyWeight: 400 },
};

// ── Renderers ────────────────────────────────────────────

/**
 * Photo-first cover — full-bleed image with minimal bottom text.
 * Inspired by AoB, Daily Fashion News style.
 */
export function renderCoverPhotoV1(input: SlideRenderSpec): string {
  const cfg = COVER_PHOTO_V1_CONFIG.defaults;
  const w = cw(input);
  const h = ch(input);
  const titleSize = input.titleSizePx ?? cfg.titleSizePx;
  const tw = input.titleWeight ?? cfg.titleWeight;
  const font = input.fontFamily ?? "Pretendard,sans-serif";
  const pad = sx(60, input);

  // Full-bleed image
  const imgBlock = input.heroImageDataUri
    ? `<img style="position:absolute;top:0;left:0;width:${w}px;height:${h}px;display:flex;object-fit:cover;" src="${escapeHtml(input.heroImageDataUri)}" alt="" />`
    : "";

  // Bottom scrim — lower 40%, transparent to black
  const scrimH = sy(540, input);
  const scrimOp = input.scrimOpacity ?? 0.75;
  const scrim = `<div style="position:absolute;left:0;bottom:0;width:${w}px;height:${scrimH}px;background:linear-gradient(to top, rgba(0,0,0,${scrimOp}), transparent);display:flex;"></div>`;

  // Logo — top-left, small
  const logo = `<div style="position:absolute;top:${sy(48, input)}px;left:${pad}px;font-size:18px;font-weight:700;color:rgba(255,255,255,0.85);letter-spacing:2px;text-shadow:0 1px 6px rgba(0,0,0,0.5);display:flex;">WEB MAGAZINE</div>`;

  // Title — bottom area, bold, minimal
  const title = `<div style="position:absolute;bottom:${sy(120, input)}px;left:${pad}px;width:${w - pad * 2}px;font-size:${titleSize}px;font-weight:${tw};line-height:1.25;color:#fff;text-shadow:0 1px 8px rgba(0,0,0,0.6);display:flex;">${escapeHtml(input.title)}</div>`;

  // Footer — bottom-left, small date/source
  const footer = `<div style="position:absolute;bottom:${sy(50, input)}px;left:${pad}px;font-size:${cfg.footerSizePx}px;font-weight:400;color:rgba(255,255,255,0.6);text-shadow:0 1px 4px rgba(0,0,0,0.4);display:flex;">${escapeHtml(input.footerText)}</div>`;

  return `<div style="position:relative;width:${w}px;height:${h}px;background:#000;font-family:${font};display:flex;flex-direction:column;overflow:hidden;">${imgBlock}${scrim}${logo}${title}${footer}</div>`;
}

export function renderCoverV1(input: SlideRenderSpec): string {
  const cfg = COVER_V1_CONFIG.defaults;
  const w = cw(input);
  const h = ch(input);
  const titleSize = input.titleSizePx ?? cfg.titleSizePx;
  const bodySize = input.bodySizePx ?? cfg.bodySizePx;
  const tw = input.titleWeight ?? cfg.titleWeight;
  const bw = input.bodyWeight ?? cfg.bodyWeight;
  const tc = input.textColor ?? "#fff";
  const fc = input.footerColor ?? "rgba(255,255,255,0.7)";
  const spacing = ls(input.letterSpacing);

  const left = sx(80, input);
  const contentW = w - left * 2;
  const bodyLeft = sx(120, input);
  const bodyW = w - bodyLeft * 2;

  return `<div style="position:relative;width:${w}px;height:${h}px;${bgStyle(input, COVER_V1_CONFIG.defaultBg)}font-family:${input.fontFamily ?? "Pretendard,sans-serif"};color:${tc};display:flex;flex-direction:column;align-items:center;">${heroBlock(input, sy(220, input))}
  <div style="position:absolute;top:${sy(260, input)}px;left:${left}px;width:${contentW}px;font-size:${titleSize}px;font-weight:${tw};line-height:1.25;text-align:center;letter-spacing:${spacing};display:flex;justify-content:center;">${escapeHtml(input.title)}</div>
  <div style="position:absolute;top:${sy(580, input)}px;left:${bodyLeft}px;width:${bodyW}px;font-size:${bodySize}px;font-weight:${bw};line-height:1.5;text-align:center;color:rgba(255,255,255,0.75);display:flex;justify-content:center;">${escapeHtml(input.bodyText)}</div>
  <div style="position:absolute;bottom:${sy(60, input)}px;left:${left}px;width:${contentW}px;font-size:22px;color:${fc};text-align:center;display:flex;justify-content:center;">${escapeHtml(input.footerText)}</div>
</div>`;
}

export function renderCoverV2(input: SlideRenderSpec): string {
  const cfg = COVER_V2_CONFIG.defaults;
  const w = cw(input);
  const h = ch(input);
  const titleSize = input.titleSizePx ?? cfg.titleSizePx;
  const bodySize = input.bodySizePx ?? cfg.bodySizePx;
  const tw = input.titleWeight ?? cfg.titleWeight;
  const bw = input.bodyWeight ?? cfg.bodyWeight;
  const tc = input.textColor ?? "#fff";
  const fc = input.footerColor ?? "rgba(255,255,255,0.7)";
  const spacing = ls(input.letterSpacing);

  const left = sx(80, input);
  const contentW = w - left * 2;
  const bodyW = w - left - sx(160, input);

  return `<div style="position:relative;width:${w}px;height:${h}px;${bgStyle(input, COVER_V2_CONFIG.defaultBg)}font-family:${input.fontFamily ?? "Pretendard,sans-serif"};color:${tc};display:flex;flex-direction:column;">${heroBlock(input, sy(360, input))}
  <div style="position:absolute;bottom:${sy(320, input)}px;left:${left}px;width:${contentW}px;font-size:${titleSize}px;font-weight:${tw};line-height:1.3;letter-spacing:${spacing};display:flex;">${escapeHtml(input.title)}</div>
  <div style="position:absolute;bottom:${sy(200, input)}px;left:${left}px;width:${bodyW}px;font-size:${bodySize}px;font-weight:${bw};line-height:1.5;color:rgba(255,255,255,0.75);display:flex;">${escapeHtml(input.bodyText)}</div>
  <div style="position:absolute;bottom:${sy(60, input)}px;left:${left}px;width:${contentW}px;font-size:22px;color:${fc};display:flex;">${escapeHtml(input.footerText)}</div>
</div>`;
}
