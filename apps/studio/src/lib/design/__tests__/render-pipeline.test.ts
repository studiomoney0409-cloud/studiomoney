/**
 * Design Engine — Render Pipeline Integration Test.
 *
 * Validates that the rendering pipeline (Satori → PNG) works correctly with:
 *   - Korean text (Pretendard font)
 *   - Multiple aspect ratios (1080x1080, 1080x1920, 1200x675)
 *   - BrandKit styles
 *   - Design engine JSX-style inputs
 */
import { describe, it, expect, beforeAll } from "vitest";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { renderHtmlToPngBuffer } from "../../../../../../agents/shared/render";
import { DEFAULT_BRAND_KIT, getBrandFontStack, pickGradient } from "../brand-kit";
import { PLATFORM_SIZES } from "../types";
import type { DesignPlatform } from "../types";

const OUT_DIR = path.resolve(process.cwd(), "tmp", "design-test-output");

describe("Design Engine Render Pipeline", () => {
  beforeAll(async () => {
    await mkdir(OUT_DIR, { recursive: true });
  });

  it("Korean text rendering (1080x1080)", async () => {
    const kit = DEFAULT_BRAND_KIT;
    const html = `
      <div style="display:flex;flex-direction:column;width:1080;height:1080;background:${kit.colors.background.dark};padding:${kit.layout.safeMargin}px;font-family:${getBrandFontStack(kit, 'heading')}">
        <div style="display:flex;color:${kit.colors.accent};font-size:${kit.typography.sizes.label}px;font-weight:700;letter-spacing:2px">
          ALBUM REVIEW
        </div>
        <div style="display:flex;color:${kit.colors.text.onDark};font-size:${kit.typography.sizes.title}px;font-weight:800;margin-top:24px;line-height:1.3">
          NewJeans 새 앨범 완벽 해부
        </div>
        <div style="display:flex;color:${kit.colors.text.secondary};font-size:${kit.typography.sizes.body}px;font-weight:400;margin-top:16px;line-height:1.6">
          2026년 가장 기대되는 컴백, 뉴진스의 신보를 트랙별로 분석합니다.
        </div>
      </div>
    `;

    const png = await renderHtmlToPngBuffer(html, "bold-display", 1080, 1080);
    expect(png.length).toBeGreaterThan(1000);
    await writeFile(path.join(OUT_DIR, "01-korean-text.png"), png);
  }, 60_000);

  it("Multiple aspect ratios (IG, Story, Twitter)", async () => {
    const kit = DEFAULT_BRAND_KIT;
    const platforms: DesignPlatform[] = ["instagram", "instagram_story", "twitter"];

    for (const platform of platforms) {
      const { width, height } = PLATFORM_SIZES[platform];
      const html = `
        <div style="display:flex;flex-direction:column;width:${width};height:${height};background:${pickGradient(kit, 0)};padding:${kit.layout.safeMargin}px;justify-content:center;align-items:center">
          <div style="display:flex;color:${kit.colors.text.onDark};font-size:${kit.typography.sizes.subtitle}px;font-weight:700;font-family:${getBrandFontStack(kit)}">
            ${platform} (${width}x${height})
          </div>
          <div style="display:flex;color:${kit.colors.accent};font-size:${kit.typography.sizes.body}px;margin-top:12px;font-family:${getBrandFontStack(kit, 'body')}">
            플랫폼별 비율 테스트
          </div>
        </div>
      `;

      const png = await renderHtmlToPngBuffer(html, "bold-display", width, height);
      expect(png.length).toBeGreaterThan(1000);
      await writeFile(path.join(OUT_DIR, `02-ratio-${platform}.png`), png);
    }
  }, 90_000);

  it("Card news slide simulation (1080x1350)", async () => {
    const kit = DEFAULT_BRAND_KIT;
    const html = `
      <div style="display:flex;flex-direction:column;width:1080;height:1350;background:linear-gradient(180deg, #1A1A2E 0%, #2D1B69 100%);padding:${kit.layout.safeMargin}px">
        <div style="display:flex;align-items:center;gap:8px">
          <div style="display:flex;width:4px;height:24px;background:${kit.colors.accent};border-radius:2px"></div>
          <div style="display:flex;color:${kit.colors.accent};font-size:14px;font-weight:700;letter-spacing:2px;font-family:${getBrandFontStack(kit)}">
            TRENDING
          </div>
        </div>
        <div style="display:flex;color:${kit.colors.text.onDark};font-size:42px;font-weight:800;margin-top:32px;line-height:1.25;font-family:${getBrandFontStack(kit)}">
          2026 상반기 음악 트렌드 키워드 5
        </div>
        <div style="display:flex;flex-direction:column;margin-top:40px;gap:16px">
          <div style="display:flex;align-items:center;gap:16px">
            <div style="display:flex;justify-content:center;align-items:center;width:48px;height:48px;background:${kit.colors.primary};border-radius:${kit.layout.cornerRadius}px;color:white;font-size:24px;font-weight:800;font-family:${getBrandFontStack(kit)}">1</div>
            <div style="display:flex;flex-direction:column">
              <div style="display:flex;color:${kit.colors.text.onDark};font-size:22px;font-weight:700;font-family:${getBrandFontStack(kit)}">AI 프로듀싱의 대중화</div>
              <div style="display:flex;color:${kit.colors.text.secondary};font-size:15px;font-weight:400;margin-top:4px;font-family:${getBrandFontStack(kit, 'body')}">AI 작곡 도구가 인디 씬을 변화시키다</div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:16px">
            <div style="display:flex;justify-content:center;align-items:center;width:48px;height:48px;background:${kit.colors.primary};border-radius:${kit.layout.cornerRadius}px;color:white;font-size:24px;font-weight:800;font-family:${getBrandFontStack(kit)}">2</div>
            <div style="display:flex;flex-direction:column">
              <div style="display:flex;color:${kit.colors.text.onDark};font-size:22px;font-weight:700;font-family:${getBrandFontStack(kit)}">K-POP 글로벌 확장</div>
              <div style="display:flex;color:${kit.colors.text.secondary};font-size:15px;font-weight:400;margin-top:4px;font-family:${getBrandFontStack(kit, 'body')}">빌보드 HOT 100 진입이 일상이 되다</div>
            </div>
          </div>
        </div>
        <div style="display:flex;margin-top:auto;color:${kit.colors.text.secondary};font-size:12px;font-family:${getBrandFontStack(kit, 'body')}">
          Web Magazine | 2026.03
        </div>
      </div>
    `;

    const png = await renderHtmlToPngBuffer(html, "bold-display", 1080, 1350);
    expect(png.length).toBeGreaterThan(1000);
    await writeFile(path.join(OUT_DIR, "03-card-news-slide.png"), png);
  }, 60_000);

  it("Brand gradient presets (5 variants)", async () => {
    const kit = DEFAULT_BRAND_KIT;

    for (let i = 0; i < kit.colors.gradients.length; i++) {
      const html = `
        <div style="display:flex;flex-direction:column;width:540;height:540;background:${pickGradient(kit, i)};padding:40px;justify-content:center;align-items:center">
          <div style="display:flex;color:white;font-size:24px;font-weight:700;font-family:${getBrandFontStack(kit)}">
            Gradient #${i + 1}
          </div>
        </div>
      `;
      const png = await renderHtmlToPngBuffer(html, "bold-display", 540, 540);
      expect(png.length).toBeGreaterThan(500);
      await writeFile(path.join(OUT_DIR, `04-gradient-${i + 1}.png`), png);
    }
  }, 90_000);
});
