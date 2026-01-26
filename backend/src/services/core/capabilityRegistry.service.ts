/**
 * Capability Registry Service
 *
 * Validates that follow-up suggestions only offer actions the system can perform.
 * Prevents suggesting disabled or unimplemented features.
 *
 * Usage:
 * ```typescript
 * const registry = getCapabilityRegistry();
 * const isAvailable = registry.isCapabilityAvailable('compare', { docScope: 'single' });
 * const filtered = registry.filterFollowupsByCapability(followups, context);
 * ```
 */

import * as fs from 'fs';
import * as path from 'path';
import type { FollowupType, DocScope } from './followupSuppression.service';

// ============================================================================
// Types
// ============================================================================

export type CapabilityCategory =
  | 'document_management'
  | 'content_analysis'
  | 'export_capabilities'
  | 'search_capabilities'
  | 'conversation_capabilities';

export interface Capability {
  enabled: boolean;
  requires: string[];
  description: string;
}

export interface CapabilityContext {
  docScope?: DocScope;
  hasDocuments?: boolean;
  documentCount?: number;
  selectedDocumentId?: string;
  availableFeatures?: string[];
}

interface CapabilityRegistryData {
  core_capabilities: Record<string, Record<string, Capability>>;
  followup_capability_map: {
    mappings: Record<string, string>;
  };
  context_requirements: {
    requirements: Record<
      string,
      {
        available: string[];
        unavailable: string[];
      }
    >;
  };
  disabled_capabilities: {
    disabled: string[];
    reason: string;
  };
}

// ============================================================================
// Service
// ============================================================================

export class CapabilityRegistryService {
  private registry: CapabilityRegistryData | null = null;

  // Hardcoded disabled capabilities (fail-safe)
  private readonly disabledCapabilities: Set<string> = new Set([
    'export_pdf',
    'export_csv',
    'export_text',
  ]);

  // Capability path cache
  private capabilityCache: Map<string, Capability | null> = new Map();

  constructor() {
    this.loadRegistry();
  }

  private loadRegistry(): void {
    try {
      const registryPath = path.join(
        __dirname,
        '../../data_banks/formatting/capability_registry.json'
      );

      if (fs.existsSync(registryPath)) {
        this.registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));

        // Add disabled capabilities from registry
        if (this.registry?.disabled_capabilities?.disabled) {
          for (const cap of this.registry.disabled_capabilities.disabled) {
            this.disabledCapabilities.add(cap);
          }
        }

        console.log('✅ [CapabilityRegistry] Registry loaded');
      } else {
        console.warn('⚠️ [CapabilityRegistry] Registry not found, using defaults');
      }
    } catch (error: any) {
      console.error('❌ [CapabilityRegistry] Load failed:', error.message);
    }
  }

  /**
   * Get capability by path (e.g., "document_management.filter")
   */
  public getCapability(capabilityPath: string): Capability | null {
    if (this.capabilityCache.has(capabilityPath)) {
      return this.capabilityCache.get(capabilityPath) || null;
    }

    const parts = capabilityPath.split('.');
    if (parts.length !== 2) {
      this.capabilityCache.set(capabilityPath, null);
      return null;
    }

    const [category, name] = parts;
    const capability = this.registry?.core_capabilities[category]?.[name] || null;

    this.capabilityCache.set(capabilityPath, capability);
    return capability;
  }

  /**
   * Get capability path for a follow-up type
   */
  public getCapabilityForFollowup(followupType: FollowupType): string | null {
    return this.registry?.followup_capability_map?.mappings[followupType] || null;
  }

  /**
   * Check if a capability is enabled
   */
  public isCapabilityEnabled(capabilityPath: string): boolean {
    // Check hardcoded disabled list first
    const capName = capabilityPath.split('.').pop() || '';
    if (this.disabledCapabilities.has(capName)) {
      return false;
    }

    const capability = this.getCapability(capabilityPath);
    return capability?.enabled ?? false;
  }

  /**
   * Check if capability is available in current context
   */
  public isCapabilityAvailable(
    capabilityPath: string,
    context: CapabilityContext
  ): boolean {
    // First check if enabled at all
    if (!this.isCapabilityEnabled(capabilityPath)) {
      return false;
    }

    // Check context requirements
    const capName = capabilityPath.split('.').pop() || '';
    const scopeKey = this.getScopeKey(context);
    const requirements = this.registry?.context_requirements?.requirements[scopeKey];

    if (requirements) {
      // If explicitly unavailable for this scope
      if (requirements.unavailable.includes(capName)) {
        return false;
      }

      // If there's an available list, check if included
      if (requirements.available.length > 0) {
        return requirements.available.includes(capName);
      }
    }

    return true;
  }

  /**
   * Get scope key for context
   */
  private getScopeKey(context: CapabilityContext): string {
    if (context.docScope === 'single') {
      return 'single_doc';
    } else if (context.docScope === 'multi' || (context.documentCount && context.documentCount > 1)) {
      return 'multi_doc';
    } else if (!context.hasDocuments && context.documentCount === 0) {
      return 'no_docs';
    }
    return 'multi_doc'; // Default
  }

  /**
   * Check if a follow-up type is available
   */
  public isFollowupAvailable(
    followupType: FollowupType,
    context: CapabilityContext
  ): boolean {
    const capabilityPath = this.getCapabilityForFollowup(followupType);

    if (!capabilityPath) {
      // No capability mapping = assume available
      return true;
    }

    return this.isCapabilityAvailable(capabilityPath, context);
  }

  /**
   * Filter follow-ups by capability availability
   */
  public filterFollowupsByCapability(
    followups: FollowupType[],
    context: CapabilityContext
  ): FollowupType[] {
    return followups.filter((f) => this.isFollowupAvailable(f, context));
  }

  /**
   * Get all available capabilities for context
   */
  public getAvailableCapabilities(context: CapabilityContext): string[] {
    const available: string[] = [];

    if (!this.registry?.core_capabilities) {
      return available;
    }

    for (const [category, capabilities] of Object.entries(this.registry.core_capabilities)) {
      for (const [name] of Object.entries(capabilities)) {
        const path = `${category}.${name}`;
        if (this.isCapabilityAvailable(path, context)) {
          available.push(path);
        }
      }
    }

    return available;
  }

  /**
   * Get all disabled capabilities
   */
  public getDisabledCapabilities(): string[] {
    return Array.from(this.disabledCapabilities);
  }

  /**
   * Check if any export capability is available
   */
  public hasExportCapabilities(): boolean {
    return (
      this.isCapabilityEnabled('export_capabilities.export_pdf') ||
      this.isCapabilityEnabled('export_capabilities.export_csv') ||
      this.isCapabilityEnabled('export_capabilities.export_text')
    );
  }

  /**
   * Get capability requirements
   */
  public getCapabilityRequirements(capabilityPath: string): string[] {
    const capability = this.getCapability(capabilityPath);
    return capability?.requires || [];
  }

  /**
   * Check if context meets capability requirements
   */
  public meetsRequirements(
    capabilityPath: string,
    providedContext: Record<string, any>
  ): { meets: boolean; missing: string[] } {
    const requirements = this.getCapabilityRequirements(capabilityPath);
    const missing: string[] = [];

    for (const req of requirements) {
      if (!providedContext[req]) {
        missing.push(req);
      }
    }

    return {
      meets: missing.length === 0,
      missing,
    };
  }

  /**
   * Get service stats
   */
  public getStats(): {
    totalCapabilities: number;
    enabledCapabilities: number;
    disabledCapabilities: number;
    followupMappings: number;
  } {
    let total = 0;
    let enabled = 0;

    if (this.registry?.core_capabilities) {
      for (const category of Object.values(this.registry.core_capabilities)) {
        for (const capability of Object.values(category)) {
          total++;
          if (capability.enabled) enabled++;
        }
      }
    }

    return {
      totalCapabilities: total,
      enabledCapabilities: enabled,
      disabledCapabilities: this.disabledCapabilities.size,
      followupMappings: Object.keys(
        this.registry?.followup_capability_map?.mappings || {}
      ).length,
    };
  }
}

// ============================================================================
// Singleton
// ============================================================================

let instance: CapabilityRegistryService | null = null;

export function getCapabilityRegistry(): CapabilityRegistryService {
  if (!instance) {
    instance = new CapabilityRegistryService();
  }
  return instance;
}

export default CapabilityRegistryService;
