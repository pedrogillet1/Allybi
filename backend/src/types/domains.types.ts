// src/types/domain.types.ts

/**
 * Domain typing used across:
 * - domain_detection / domain_ontology banks
 * - intent + operator routing (domain-aware)
 * - retrieval profiles and formatting profiles
 *
 * Keep this file stable: IDs should match your data_banks/semantics/domain_ontology.any.json.
 */

export type DomainId =
  | 'general'

  // Finance family
  | 'finance_corporate'
  | 'finance_real_estate'
  | 'finance_markets'
  | 'finance_lending'
  | 'finance_payments'

  // Accounting family
  | 'accounting_gl'
  | 'accounting_ap_ar'
  | 'accounting_tax'
  | 'accounting_audit'

  // Excel family
  | 'excel_modeling'
  | 'excel_audit_tracing'
  | 'excel_reporting'

  // Legal family
  | 'legal_contracts'
  | 'legal_compliance'
  | 'legal_disputes'

  // Medical family
  | 'medical_labs'
  | 'medical_clinical'
  | 'medical_insurance'

  // Personal documents family
  | 'identity_docs'
  | 'address_proof'
  | 'vehicle_docs'
  | 'housing_rent_mortgage'
  | 'utilities_bills'

  // Billing/commerce family
  | 'invoices_billing'
  | 'banking_statements'
  | 'credit_cards'
  | 'insurance';

export type DomainFamilyId =
  | 'general'
  | 'finance'
  | 'accounting'
  | 'excel'
  | 'legal'
  | 'medical'
  | 'personal_docs'
  | 'billing';

export type DomainConfidence = {
  domain: DomainId;
  score: number; // 0..1
  signals?: string[]; // reason codes or matched tokens
};

export type DomainDetectionResult = {
  topDomain: DomainId;
  confidence: number; // 0..1
  alternatives?: DomainConfidence[]; // sorted desc
  matchedTerms?: Array<{
    term: string;
    weight: 'strong' | 'medium' | 'weak';
    source: 'query' | 'title' | 'snippet';
  }>;
};

export type RetrievalProfileId =
  | 'balanced'
  | 'numeric_leaning'
  | 'numeric_strict'
  | 'structure_first'
  | 'ocr_tolerant'
  | 'field_extraction'
  | 'quote_friendly'
  | 'legal_quote'
  | 'medical_fields'
  | 'market_filings';

export type FormattingProfileId =
  | 'default'
  | 'numbers_first'
  | 'tables_first'
  | 'fields_first'
  | 'bullets_first'
  | 'compliance_cautious'
  | 'medical_calm'
  | 'legal_precise';

export type DomainDocAffinity = {
  preferredDocTypes: string[]; // e.g., ['pdf','xlsx']
  ocrTolerance: 'low' | 'medium' | 'high';
};

export type DomainDefinition = {
  id: DomainId;
  family: DomainFamilyId;
  label: { en: string; pt?: string; es?: string };
  aliases?: { en?: string[]; pt?: string[]; es?: string[] };

  docAffinity?: DomainDocAffinity;
  retrievalProfile?: RetrievalProfileId;
  formattingProfile?: FormattingProfileId;

  relatedDomains?: DomainId[]; // max enforced by ontology bank
  terminologyKey?: string; // key for terminology lexicon hooks
};

export type DomainOntology = {
  defaultDomain: DomainId;
  domainFamilies: Array<{
    id: DomainFamilyId;
    children: DomainId[];
  }>;
  domains: DomainDefinition[];
};

export type DomainEnforcementInput = {
  /**
   * If the user or UI has explicitly chosen a domain, it should be treated as a strong signal.
   */
  userSelectedDomain?: DomainId | null;

  /**
   * Derived from detection.
   */
  detected?: DomainDetectionResult | null;

  /**
   * From scope: doc types in scope can boost compatible domains.
   */
  docTypesInScope?: string[];

  /**
   * Operator intent can constrain allowed domains.
   */
  operator?: string;
};

export type DomainEnforcementOutput = {
  domain: DomainId;
  confidence: number;
  reasonCodes: string[];
  retrievalProfile: RetrievalProfileId;
  formattingProfile: FormattingProfileId;
  relatedDomains?: DomainId[];
};
