// Domain pack service — resolves domain packs, doc types, retrieval strategies
export type {
  DomainPackDocMeta,
  DomainPackResolutionInput,
  DomainPackSelection,
} from '../../../services/core/domain/domainPack.service';
export { DomainPackService } from '../../../services/core/domain/domainPack.service';

// Domain editing constraints — enforces domain-specific editing rules
export type {
  DomainEditingConstraintInput,
  DomainEditingConstraintDecision,
} from '../../../services/core/domain/domainEditingConstraint.service';
export { DomainEditingConstraintService } from '../../../services/core/domain/domainEditingConstraint.service';
