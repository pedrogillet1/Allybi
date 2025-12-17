/**
 * Script to add anti-repetition constraint to all system prompts
 */
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'data', 'system_prompts.json');

// Read file
let data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

// Anti-repetition constraints in all languages
const antiRepeatConstraints = {
  en: "Do not repeat prior answers verbatim; if the user asks the same question again, provide a concise confirmation (e.g., 'As I mentioned...') or give a refreshed answer using current retrieval results",
  pt: "Não repita respostas anteriores literalmente; se o usuário fizer a mesma pergunta novamente, forneça uma confirmação concisa (ex: 'Como mencionei...') ou dê uma resposta atualizada usando resultados de recuperação atuais",
  es: "No repitas respuestas anteriores textualmente; si el usuario hace la misma pregunta de nuevo, proporciona una confirmación concisa (ej: 'Como mencioné...') o da una respuesta actualizada usando resultados de recuperación actuales",
};

// Add to each mode that has constraints
let updated = 0;
for (const prompt of data.prompts) {
  for (const [lang, langData] of Object.entries(prompt.languages)) {
    if (langData.constraints && Array.isArray(langData.constraints)) {
      // Check if already has anti-repeat
      const hasAntiRepeat = langData.constraints.some(c =>
        c.toLowerCase().includes('do not repeat') ||
        c.toLowerCase().includes('não repita') ||
        c.toLowerCase().includes('no repitas')
      );

      if (!hasAntiRepeat) {
        const constraint = antiRepeatConstraints[lang] || antiRepeatConstraints.en;
        langData.constraints.push(constraint);
        updated++;
        console.log(`✅ Added anti-repeat constraint to ${prompt.mode}/${lang}`);
      }
    }
  }
}

// Write back
fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
console.log(`\n✅ Updated ${updated} prompt constraints with anti-repetition rule!`);
