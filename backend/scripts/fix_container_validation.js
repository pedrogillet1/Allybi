/**
 * Fix container.ts to include validationService
 */
const fs = require('fs');
const path = require('path');

const containerPath = path.join(__dirname, '../src/bootstrap/container.ts');
let content = fs.readFileSync(containerPath, 'utf-8');

let changes = 0;

// 1. Add import
if (!content.includes('KodaAnswerValidationService')) {
  content = content.replace(
    `import { TruncationDetectorService } from '../services/utils/truncationDetector.service';`,
    `import { TruncationDetectorService } from '../services/utils/truncationDetector.service';
import { KodaAnswerValidationService } from '../services/validation/kodaAnswerValidation.service';`
  );
  changes++;
  console.log('1. Added import');
}

// 2. Add to interface
if (!content.includes('validationService: KodaAnswerValidationService')) {
  content = content.replace(
    'truncationDetector: TruncationDetectorService;',
    `truncationDetector: TruncationDetectorService;
  validationService: KodaAnswerValidationService;`
  );
  changes++;
  console.log('2. Added to interface');
}

// 3. Add instantiation (after truncationDetector)
if (!content.includes('this.services.validationService = new KodaAnswerValidationService')) {
  content = content.replace(
    'this.services.truncationDetector = new TruncationDetectorService();',
    `this.services.truncationDetector = new TruncationDetectorService();
      this.services.validationService = new KodaAnswerValidationService();`
  );
  changes++;
  console.log('3. Added instantiation');
}

// 4. Add to orchestrator injection
if (!content.includes('validationService: this.services.validationService')) {
  content = content.replace(
    'documentSearch: this.services.documentSearch,',
    `documentSearch: this.services.documentSearch,
          validationService: this.services.validationService,`
  );
  changes++;
  console.log('4. Added to orchestrator injection');
}

// 5. Add to criticalServices (use regex for flexibility)
if (!content.includes("'validationService',")) {
  const criticalServicesRegex = /(const criticalServices[^=]*=\s*\[[^\]]*'fallbackConfig',)/;
  if (content.match(criticalServicesRegex)) {
    content = content.replace(criticalServicesRegex, "$1\n      'validationService',");
    changes++;
    console.log('5. Added to criticalServices');
  }
}

// 6. Add getter (after getTruncationDetector)
if (!content.includes('getValidationService(): KodaAnswerValidationService')) {
  const getterCode = `

  /**
   * Get the validation service instance.
   */
  public getValidationService(): KodaAnswerValidationService {
    if (!this._isInitialized) {
      throw new BootstrapWiringError('Container not initialized');
    }
    return this.services.validationService!;
  }`;

  // Find getTruncationDetector and add after
  const truncGetterRegex = /(public getTruncationDetector\(\): TruncationDetectorService \{[^}]+\})/;
  if (content.match(truncGetterRegex)) {
    content = content.replace(truncGetterRegex, '$1' + getterCode);
    changes++;
    console.log('6. Added getter');
  }
}

fs.writeFileSync(containerPath, content);
console.log(`Done. Made ${changes} changes.`);
