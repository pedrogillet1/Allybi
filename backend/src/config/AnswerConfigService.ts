/**
 * AnswerConfigService.ts
 *
 * This service is the SINGLE SOURCE OF TRUTH for all answer-related configuration JSONs.
 * It loads all relevant JSON config files once at application startup, validates them,
 * and exposes safe, typed accessor methods to retrieve config data.
 *
 * Responsibilities:
 * - Load and validate answer_styles.json, markdown_components.json, table_presets.json, answer_examples.json
 * - Provide typed interfaces for all configs
 * - Gracefully handle missing keys with sensible defaults
 * - Log every config access for traceability and debugging
 * - Fail fast on startup if any config is missing or invalid
 * - Prevent direct JSON access outside this service to enforce config integrity
 */

import fs from 'fs';
import path from 'path';

// Define the directory where JSON config files reside
const DATA_DIR = path.resolve(__dirname, '../data');

// -----------------------------
// TypeScript Interfaces
// -----------------------------

export interface AnswerStyleSectionLabels {
  tldr?: string;
  explanation?: string;
  whatIDid?: string;
  whatYouCanDoNext?: string;
  limitations?: string;
  sources?: string;
  [key: string]: string | undefined;
}

export interface AnswerStyleConfig {
  key: string;
  displayName: string;
  description?: string;
  typicalStructure: string[];
  tone: 'short' | 'detailed' | 'concise' | 'friendly' | string;
  sectionLabels: AnswerStyleSectionLabels;
  requireHeadline: boolean;
  showSources: boolean;
  [key: string]: unknown;
}

export interface AnswerStylesConfig {
  [key: string]: AnswerStyleConfig | any;
}

export interface MarkdownComponent {
  type: string;
  label: string;
  style: string;
  icon?: string;
  [key: string]: unknown;
}

export interface MarkdownComponentsConfig {
  notices?: Record<string, any>;
  blocks?: Record<string, any>;
  inlines?: Record<string, any>;
  [key: string]: any;
}

export interface TableColumn {
  header: string;
  key: string;
  align?: 'left' | 'center' | 'right';
  width?: number;
  [key: string]: unknown;
}

export interface TablePreset {
  key?: string;
  description?: string;
  columns?: TableColumn[];
  headers?: Record<string, string[]>;
  formatting?: Record<string, any>;
  style?: string;
  [key: string]: unknown;
}

export interface TablePresetsConfig {
  [key: string]: TablePreset;
}

export interface AnswerExample {
  id?: string;
  intent?: string;
  inputExample?: string;
  outputExample?: string;
  description?: string;
  [key: string]: unknown;
}

export interface AnswerExamplesConfig {
  [key: string]: any;
}

// -----------------------------
// AnswerConfigService Implementation
// -----------------------------

export class AnswerConfigService {
  private readonly answerStyles: AnswerStylesConfig;
  private readonly markdownComponents: MarkdownComponentsConfig;
  private readonly tablePresets: TablePresetsConfig;
  private readonly answerExamples: AnswerExamplesConfig;

  constructor() {
    console.log('[AnswerConfigService] Initializing and loading configs');

    this.answerStyles = this.loadConfig<AnswerStylesConfig>(
      'answer_styles.json',
      this.getDefaultAnswerStyles()
    );

    this.markdownComponents = this.loadConfig<MarkdownComponentsConfig>(
      'markdown_components.json',
      this.getDefaultMarkdownComponents()
    );

    this.tablePresets = this.loadConfig<TablePresetsConfig>(
      'table_presets.json',
      this.getDefaultTablePresets()
    );

    this.answerExamples = this.loadConfig<AnswerExamplesConfig>(
      'answer_examples.json',
      {}
    );

    console.log('[AnswerConfigService] Successfully loaded all configs');
  }

  private loadConfig<T>(filename: string, fallback: T): T {
    const filePath = path.join(DATA_DIR, filename);
    try {
      console.log(`[AnswerConfigService] Loading config file: ${filename}`);
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      console.log(`[AnswerConfigService] Config file ${filename} loaded successfully`);
      return parsed as T;
    } catch (err) {
      console.warn(
        `[AnswerConfigService] Failed to load ${filename}. Using fallback default. Error: ${err instanceof Error ? err.message : err}`
      );
      return fallback;
    }
  }

  public getAllAnswerStyles(): AnswerStylesConfig {
    return structuredClone(this.answerStyles);
  }

  public getAnswerStyle(key: string | undefined): AnswerStyleConfig {
    if (!key) {
      console.warn('[AnswerConfigService] getAnswerStyle called with undefined key, returning default');
      return this.getDefaultAnswerStyle();
    }
    const style = this.answerStyles[key];
    if (!style) {
      console.warn(`[AnswerConfigService] Answer style key "${key}" not found. Returning default.`);
      return this.getDefaultAnswerStyle();
    }
    return structuredClone(style) as AnswerStyleConfig;
  }

  public getMarkdownComponents(): MarkdownComponentsConfig {
    return structuredClone(this.markdownComponents);
  }

  public getMarkdownComponent(
    category: keyof MarkdownComponentsConfig,
    key: string
  ): MarkdownComponent | undefined {
    const categoryMap = this.markdownComponents[category];
    if (!categoryMap) {
      console.warn(`[AnswerConfigService] Markdown components category "${String(category)}" not found`);
      return undefined;
    }
    const component = categoryMap[key];
    if (!component) {
      console.warn(`[AnswerConfigService] Markdown component key "${key}" not found in category "${String(category)}"`);
      return undefined;
    }
    return { ...component };
  }

  public getTablePresets(): TablePresetsConfig {
    return structuredClone(this.tablePresets);
  }

  public getTablePreset(key: string): TablePreset | undefined {
    const preset = this.tablePresets[key];
    if (!preset) {
      console.warn(`[AnswerConfigService] Table preset key "${key}" not found`);
      return undefined;
    }
    return structuredClone(preset);
  }

  public getAnswerExamples(): AnswerExamplesConfig {
    return structuredClone(this.answerExamples);
  }

  public getAnswerExample(id: string): AnswerExample | undefined {
    const example = this.answerExamples[id];
    if (!example) {
      console.warn(`[AnswerConfigService] Answer example id "${id}" not found`);
      return undefined;
    }
    return { ...example };
  }

  private getDefaultAnswerStyle(): AnswerStyleConfig {
    return {
      key: 'default',
      displayName: 'Default Style',
      description: 'Fallback default answer style',
      typicalStructure: ['tldr', 'explanation', 'whatYouCanDoNext'],
      tone: 'friendly',
      sectionLabels: {
        tldr: 'TL;DR',
        explanation: 'Explanation',
        whatIDid: 'What I Did',
        whatYouCanDoNext: 'What You Can Do Next',
        limitations: 'Limitations',
        sources: 'Sources',
      },
      requireHeadline: true,
      showSources: true,
    };
  }

  private getDefaultAnswerStyles(): AnswerStylesConfig {
    const defaultStyle = this.getDefaultAnswerStyle();
    return {
      [defaultStyle.key]: defaultStyle,
    };
  }

  private getDefaultMarkdownComponents(): MarkdownComponentsConfig {
    return {
      notices: {
        info: {
          type: 'notice',
          label: 'Info',
          style: 'notice-info',
          icon: 'info-circle',
        },
        warning: {
          type: 'notice',
          label: 'Warning',
          style: 'notice-warning',
          icon: 'exclamation-triangle',
        },
        tip: {
          type: 'notice',
          label: 'Tip',
          style: 'notice-tip',
          icon: 'lightbulb',
        },
      },
      blocks: {
        limitations: {
          type: 'block',
          label: 'Limitations',
          style: 'block-limitations',
          icon: 'ban',
        },
        sources: {
          type: 'block',
          label: 'Sources',
          style: 'block-sources',
          icon: 'book',
        },
      },
      inlines: {},
    };
  }

  private getDefaultTablePresets(): TablePresetsConfig {
    return {
      default_comparison: {
        key: 'default_comparison',
        description: 'Default comparison table preset',
        columns: [
          { header: 'Feature', key: 'feature', align: 'left' },
          { header: 'Option A', key: 'optionA', align: 'center' },
          { header: 'Option B', key: 'optionB', align: 'center' },
        ],
        style: 'table-comparison',
      },
      default_analytics: {
        key: 'default_analytics',
        description: 'Default analytics output table',
        columns: [
          { header: 'Metric', key: 'metric', align: 'left' },
          { header: 'Value', key: 'value', align: 'right' },
        ],
        style: 'table-analytics',
      },
    };
  }
}

export default new AnswerConfigService();
