import type { slides_v1 } from 'googleapis';
import {
  SlidesClientError,
  SlidesClientService,
  type SlidesRequestContext,
} from './slidesClient.service';

export interface SlidesThemeProfile {
  titleFontFamily: string;
  bodyFontFamily: string;
  titleFontSizePt: number;
  bodyFontSizePt: number;
  primaryTextColor: string;
  accentColor: string;
  backgroundColor: string;
}

export interface StyleConsistencyResult {
  profile: SlidesThemeProfile;
  requests: slides_v1.Schema$Request[];
}

interface ThemeColorMap {
  [key: string]: string;
}

const DEFAULT_THEME_PROFILE: SlidesThemeProfile = {
  titleFontFamily: 'Arial',
  bodyFontFamily: 'Arial',
  titleFontSizePt: 32,
  bodyFontSizePt: 20,
  primaryTextColor: '#1F2937',
  accentColor: '#2563EB',
  backgroundColor: '#FFFFFF',
};

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function rgbToHex(color: slides_v1.Schema$RgbColor | undefined): string | null {
  if (!color) return null;

  const to255 = (value: number | null | undefined): number => {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return 0;
    }
    return Math.max(0, Math.min(255, Math.round(value * 255)));
  };

  const r = to255(color.red);
  const g = to255(color.green);
  const b = to255(color.blue);

  return `#${[r, g, b].map((part) => part.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

function textStyleFromShape(shape: slides_v1.Schema$Shape | undefined): slides_v1.Schema$TextStyle | undefined {
  const textElements = asArray(shape?.text?.textElements);
  for (const textElement of textElements) {
    if (textElement.textRun?.style) {
      return textElement.textRun.style;
    }
  }
  return undefined;
}

/**
 * Deck-style detection and safe default styling for generated slides.
 */
export class SlidesLayoutService {
  constructor(private readonly slidesClient: SlidesClientService = new SlidesClientService()) {}

  async detectTheme(
    presentationId: string,
    ctx?: SlidesRequestContext,
  ): Promise<SlidesThemeProfile> {
    const presentation = await this.slidesClient.getPresentation(presentationId, ctx);

    const colorMap = this.extractThemeColorMap(presentation);
    const sampleStyles = this.extractSampleTextStyles(presentation);

    const titleStyle = sampleStyles.title;
    const bodyStyle = sampleStyles.body;

    const profile: SlidesThemeProfile = {
      titleFontFamily: titleStyle?.weightedFontFamily?.fontFamily ?? DEFAULT_THEME_PROFILE.titleFontFamily,
      bodyFontFamily: bodyStyle?.weightedFontFamily?.fontFamily ?? DEFAULT_THEME_PROFILE.bodyFontFamily,
      titleFontSizePt: titleStyle?.fontSize?.magnitude ?? DEFAULT_THEME_PROFILE.titleFontSizePt,
      bodyFontSizePt: bodyStyle?.fontSize?.magnitude ?? DEFAULT_THEME_PROFILE.bodyFontSizePt,
      primaryTextColor:
        this.resolveOpaqueColor(titleStyle?.foregroundColor, colorMap) ?? DEFAULT_THEME_PROFILE.primaryTextColor,
      accentColor: colorMap['ACCENT1'] ?? DEFAULT_THEME_PROFILE.accentColor,
      backgroundColor: colorMap['BACKGROUND1'] ?? DEFAULT_THEME_PROFILE.backgroundColor,
    };

    return profile;
  }

  async buildSafeDefaultsForSlide(
    presentationId: string,
    slideObjectId: string,
    ctx?: SlidesRequestContext,
  ): Promise<StyleConsistencyResult> {
    if (!slideObjectId.trim()) {
      throw new SlidesClientError('slideObjectId is required.', {
        code: 'INVALID_SLIDE_OBJECT_ID',
        retryable: false,
      });
    }

    const presentation = await this.slidesClient.getPresentation(presentationId, ctx);
    const profile = await this.detectTheme(presentationId, ctx);

    const slide = (presentation.slides ?? []).find((entry) => entry.objectId === slideObjectId);
    if (!slide) {
      throw new SlidesClientError(`Slide not found: ${slideObjectId}`, {
        code: 'SLIDE_NOT_FOUND',
        retryable: false,
      });
    }

    const requests = this.buildStyleRequests(slide, profile);

    return {
      profile,
      requests,
    };
  }

  async enforceSafeDefaults(
    presentationId: string,
    slideObjectId: string,
    ctx?: SlidesRequestContext,
  ): Promise<StyleConsistencyResult> {
    const result = await this.buildSafeDefaultsForSlide(presentationId, slideObjectId, ctx);

    if (result.requests.length > 0) {
      await this.slidesClient.batchUpdate(presentationId, result.requests, ctx);
    }

    return result;
  }

  private extractThemeColorMap(presentation: slides_v1.Schema$Presentation): ThemeColorMap {
    const scheme = presentation.masters?.[0]?.pageProperties?.colorScheme?.colors ?? [];
    const map: ThemeColorMap = {};

    for (const entry of scheme) {
      const type = entry.type;
      const rgb = entry.color;
      if (!type || !rgb) continue;
      const hex = rgbToHex(rgb);
      if (hex) {
        map[type] = hex;
      }
    }

    return map;
  }

  private extractSampleTextStyles(presentation: slides_v1.Schema$Presentation): {
    title?: slides_v1.Schema$TextStyle;
    body?: slides_v1.Schema$TextStyle;
  } {
    const slides = presentation.slides ?? [];

    for (const slide of slides) {
      const pageElements = slide.pageElements ?? [];

      let titleStyle: slides_v1.Schema$TextStyle | undefined;
      let bodyStyle: slides_v1.Schema$TextStyle | undefined;

      for (const element of pageElements) {
        const placeholderType = element.shape?.placeholder?.type;
        const style = textStyleFromShape(element.shape);
        if (!style) continue;

        if (!titleStyle && (placeholderType === 'TITLE' || placeholderType === 'CENTERED_TITLE')) {
          titleStyle = style;
        }

        if (!bodyStyle && (placeholderType === 'BODY' || placeholderType === 'SUBTITLE')) {
          bodyStyle = style;
        }
      }

      if (titleStyle || bodyStyle) {
        return {
          title: titleStyle,
          body: bodyStyle,
        };
      }
    }

    return {};
  }

  private resolveOpaqueColor(
    color: slides_v1.Schema$OptionalColor | undefined,
    themeColorMap: ThemeColorMap,
  ): string | null {
    const opaque = color?.opaqueColor;
    if (!opaque) return null;

    const rgb = opaque.rgbColor;
    if (rgb) {
      return rgbToHex(rgb);
    }

    const themeRef = opaque.themeColor;
    if (themeRef && themeColorMap[themeRef]) {
      return themeColorMap[themeRef];
    }

    return null;
  }

  private buildStyleRequests(
    slide: slides_v1.Schema$Page,
    profile: SlidesThemeProfile,
  ): slides_v1.Schema$Request[] {
    const pageElements = slide.pageElements ?? [];
    const requests: slides_v1.Schema$Request[] = [];

    for (const element of pageElements) {
      const objectId = element.objectId;
      if (!objectId || !element.shape) continue;

      const placeholderType = element.shape.placeholder?.type;
      const isTitle = placeholderType === 'TITLE' || placeholderType === 'CENTERED_TITLE';
      const isBody = placeholderType === 'BODY' || placeholderType === 'SUBTITLE';

      if (!isTitle && !isBody) continue;

      requests.push({
        updateTextStyle: {
          objectId,
          style: {
            weightedFontFamily: {
              fontFamily: isTitle ? profile.titleFontFamily : profile.bodyFontFamily,
              weight: 400,
            },
            fontSize: {
              unit: 'PT',
              magnitude: isTitle ? profile.titleFontSizePt : profile.bodyFontSizePt,
            },
            foregroundColor: {
              opaqueColor: {
                rgbColor: this.hexToRgb(profile.primaryTextColor),
              },
            },
          },
          fields: 'weightedFontFamily,fontSize,foregroundColor',
          textRange: { type: 'ALL' },
        },
      });
    }

    return requests;
  }

  private hexToRgb(hex: string): slides_v1.Schema$RgbColor {
    const normalized = hex.replace('#', '').trim();
    if (!/^[0-9A-Fa-f]{6}$/.test(normalized)) {
      return { red: 0, green: 0, blue: 0 };
    }

    const r = parseInt(normalized.slice(0, 2), 16) / 255;
    const g = parseInt(normalized.slice(2, 4), 16) / 255;
    const b = parseInt(normalized.slice(4, 6), 16) / 255;

    return { red: r, green: g, blue: b };
  }
}

export default SlidesLayoutService;
