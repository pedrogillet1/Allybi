/**
 * Script to add regex patterns to intent_patterns.json
 * Run with: node scripts/add_patterns.js
 */

const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, '../src/data/intent_patterns.json');
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

// Helper to add patterns without duplicates
function addPatterns(intent, lang, newPatterns) {
  if (!data[intent]) {
    console.error(`Intent ${intent} not found!`);
    return;
  }
  if (!data[intent].patterns) {
    data[intent].patterns = {};
  }
  if (!data[intent].patterns[lang]) {
    data[intent].patterns[lang] = [];
  }

  const existing = new Set(data[intent].patterns[lang]);
  let added = 0;
  for (const p of newPatterns) {
    if (!existing.has(p)) {
      // Validate regex compiles
      try {
        new RegExp(p, 'i');
        data[intent].patterns[lang].push(p);
        added++;
      } catch (e) {
        console.error(`Invalid regex for ${intent}/${lang}: "${p}" - ${e.message}`);
      }
    }
  }
  console.log(`${intent}/${lang}: Added ${added} patterns (${newPatterns.length - added} duplicates)`);
}

// ============================================================================
// AMBIGUOUS - Unclear or vague queries
// ============================================================================

// English patterns for AMBIGUOUS
addPatterns('AMBIGUOUS', 'en', [
  '^(what|why|how|where|when|who)\\?*$',  // Single question words
  '^(huh|eh|um|uh|hmm)\\?*$',              // Fillers
  '^(go on|continue|more|next)$',          // Continuation without context
  '^(the|a|an) (one|thing|stuff)$',        // Vague references
  '^(like|about) (that|this|it)$',         // Vague about
  '^do (it|that|this)$',                   // Vague commands
  '^(same|again|repeat)$',                 // No context repeats
  '^(which|what) one\\?*$',                // Unclear selection
  '^(tell me|show me)$',                   // Incomplete requests
  '^and\\?*$',                             // Incomplete conjunction
  '^(please|thanks|thank you)$',           // Polite but no request
  '^(idk|dunno|not sure)$',                // Uncertain responses
  '^(maybe|perhaps|possibly)$',            // Non-committal
  '^(the other|another)( one)?$',          // Vague other
  '^so\\?*$',                              // Single word
  '^(well|anyway|anyhow)$',                // Discourse markers only
  '^(good|bad|fine|nice)$',                // Adjectives only
  '^(here|there)$',                        // Location only
]);

// Portuguese patterns for AMBIGUOUS
addPatterns('AMBIGUOUS', 'pt', [
  '^(o que|por que|como|onde|quando|quem)\\?*$',  // Question words
  '^(hã|é|hum|ué)\\?*$',                          // Fillers
  '^(continua|mais|próximo)$',                    // Continuation
  '^(o|a|um|uma) (coisa|negócio)$',               // Vague references
  '^(sobre|como) (isso|isto|aquilo)$',            // Vague about
  '^(faz|faça) (isso|isto|aquilo)$',              // Vague commands
  '^(mesmo|de novo|repete)$',                     // Repeats
  '^(qual|quais)( um| uma)?\\?*$',                // Unclear selection
  '^(me (diz|fala|mostra))$',                     // Incomplete requests
  '^e\\?*$',                                      // Incomplete conjunction
  '^(por favor|obrigado|valeu)$',                 // Polite only
  '^(sei lá|não sei|talvez)$',                    // Uncertain
  '^(o outro|outra)( um| uma)?$',                 // Vague other
  '^(então|pois|bem)\\?*$',                       // Discourse markers
  '^(bom|ruim|legal|ok)$',                        // Adjectives only
  '^(aqui|ali|lá)$',                              // Location only
]);

// Spanish patterns for AMBIGUOUS
addPatterns('AMBIGUOUS', 'es', [
  '^(qué|por qué|cómo|dónde|cuándo|quién)\\?*$',  // Question words
  '^(eh|ah|um|este)\\?*$',                         // Fillers
  '^(continúa|más|siguiente)$',                    // Continuation
  '^(el|la|un|una) (cosa|asunto)$',                // Vague references
  '^(sobre|como) (eso|esto|aquello)$',             // Vague about
  '^(haz|hazlo|hazla)$',                           // Vague commands
  '^(mismo|otra vez|repite)$',                     // Repeats
  '^(cuál|cuáles)( uno| una)?\\?*$',               // Unclear selection
  '^(dime|muéstrame)$',                            // Incomplete requests
  '^y\\?*$',                                       // Incomplete conjunction
  '^(por favor|gracias)$',                         // Polite only
  '^(no sé|quizás|tal vez)$',                      // Uncertain
  '^(el otro|la otra)( uno| una)?$',               // Vague other
  '^(entonces|pues|bueno)\\?*$',                   // Discourse markers
  '^(bueno|malo|bien|ok)$',                        // Adjectives only
  '^(aquí|allí|ahí)$',                             // Location only
]);

// ============================================================================
// DOC_ANALYTICS - Document statistics and metrics
// ============================================================================

addPatterns('DOC_ANALYTICS', 'en', [
  'how many (documents|files|pages)',
  '(total|count|number) (of |)(documents|files|pages)',
  '(document|file) (statistics|stats|metrics)',
  '(storage|space) (used|usage)',
  '(show|display|get) (my |)(analytics|metrics|stats)',
  '(document|file) (breakdown|distribution)',
  'what (documents|files) (do i|have i)',
  '(newest|oldest|recent|latest) (documents|files)',
  '(most|least) (viewed|accessed|used) (documents|files)',
  '(documents|files) (by|per) (type|format|date)',
  'how (much|many) (have i|did i) (upload|store)',
  '(upload|storage) (history|timeline)',
  '(weekly|monthly|daily) (uploads|activity)',
  '(document|file) (trends|patterns)',
  'activity (report|summary)',
]);

addPatterns('DOC_ANALYTICS', 'pt', [
  'quantos (documentos|arquivos|páginas)',
  '(total|contagem|número) (de |)(documentos|arquivos|páginas)',
  '(estatísticas|métricas) (de |)(documentos|arquivos)',
  '(espaço|armazenamento) (usado|utilizado)',
  '(mostrar|exibir|ver) (minhas |)(análises|métricas|estatísticas)',
  '(distribuição|divisão) (de |)(documentos|arquivos)',
  '(quais|que) (documentos|arquivos) (eu |)(tenho|possuo)',
  '(mais |)(novos|antigos|recentes) (documentos|arquivos)',
  '(mais|menos) (vistos|acessados|usados)',
  '(documentos|arquivos) por (tipo|formato|data)',
  'quanto (eu |)(carreguei|armazenei)',
  '(histórico|linha do tempo) (de |)(uploads|carregamentos)',
  '(uploads|atividade) (semanal|mensal|diária)',
  '(tendências|padrões) (de |)(documentos|arquivos)',
  '(relatório|resumo) (de |)atividade',
]);

addPatterns('DOC_ANALYTICS', 'es', [
  'cuántos (documentos|archivos|páginas)',
  '(total|conteo|número) (de |)(documentos|archivos|páginas)',
  '(estadísticas|métricas) (de |)(documentos|archivos)',
  '(espacio|almacenamiento) (usado|utilizado)',
  '(mostrar|ver) (mis |)(análisis|métricas|estadísticas)',
  '(distribución|desglose) (de |)(documentos|archivos)',
  '(cuáles|qué) (documentos|archivos) (tengo|poseo)',
  '(más |)(nuevos|antiguos|recientes) (documentos|archivos)',
  '(más|menos) (vistos|accedidos|usados)',
  '(documentos|archivos) por (tipo|formato|fecha)',
  'cuánto (he |)(subido|almacenado)',
  '(historial|línea de tiempo) (de |)(subidas|cargas)',
  '(subidas|actividad) (semanal|mensual|diaria)',
  '(tendencias|patrones) (de |)(documentos|archivos)',
  '(informe|resumen) (de |)actividad',
]);

// ============================================================================
// DOC_MANAGEMENT - Document operations (upload, delete, rename, organize)
// ============================================================================

addPatterns('DOC_MANAGEMENT', 'en', [
  '(upload|add|import) (a |)(new |)(document|file)',
  '(delete|remove|trash) (this |that |the |)(document|file)',
  '(rename|name) (this |that |the |)(document|file)',
  '(move|organize|sort) (my |)(documents|files)',
  '(create|make|add) (a |)(folder|directory)',
  '(download|export|save) (this |that |the |)(document|file)',
  '(share|send) (this |that |the |)(document|file)',
  '(copy|duplicate) (this |that |the |)(document|file)',
  '(archive|backup) (my |)(documents|files)',
  '(restore|recover|undelete) (a |the |)(document|file)',
  '(tag|label|categorize) (this |that |the |)(document|file)',
  'change (the |)(file|document) (name|title)',
  'put (this|that|it) in (a |)(folder|category)',
  '(bulk|batch) (delete|upload|download)',
  'manage (my |)(documents|files|storage)',
]);

addPatterns('DOC_MANAGEMENT', 'pt', [
  '(carregar|adicionar|importar) (um |)(novo |)(documento|arquivo)',
  '(excluir|remover|apagar) (este |esse |o |)(documento|arquivo)',
  '(renomear|nomear) (este |esse |o |)(documento|arquivo)',
  '(mover|organizar|ordenar) (meus |)(documentos|arquivos)',
  '(criar|fazer|adicionar) (uma |)(pasta|diretório)',
  '(baixar|exportar|salvar) (este |esse |o |)(documento|arquivo)',
  '(compartilhar|enviar) (este |esse |o |)(documento|arquivo)',
  '(copiar|duplicar) (este |esse |o |)(documento|arquivo)',
  '(arquivar|backup) (meus |)(documentos|arquivos)',
  '(restaurar|recuperar) (um |o |)(documento|arquivo)',
  '(marcar|rotular|categorizar) (este |esse |o |)(documento|arquivo)',
  'mudar (o |)(nome|título) (do |)(arquivo|documento)',
  'colocar (isto|isso) (em |numa |)(pasta|categoria)',
  '(excluir|carregar|baixar) (em massa|em lote)',
  'gerenciar (meus |)(documentos|arquivos|armazenamento)',
]);

addPatterns('DOC_MANAGEMENT', 'es', [
  '(subir|agregar|importar) (un |)(nuevo |)(documento|archivo)',
  '(eliminar|borrar|quitar) (este |ese |el |)(documento|archivo)',
  '(renombrar|nombrar) (este |ese |el |)(documento|archivo)',
  '(mover|organizar|ordenar) (mis |)(documentos|archivos)',
  '(crear|hacer|agregar) (una |)(carpeta|directorio)',
  '(descargar|exportar|guardar) (este |ese |el |)(documento|archivo)',
  '(compartir|enviar) (este |ese |el |)(documento|archivo)',
  '(copiar|duplicar) (este |ese |el |)(documento|archivo)',
  '(archivar|respaldar) (mis |)(documentos|archivos)',
  '(restaurar|recuperar) (un |el |)(documento|archivo)',
  '(etiquetar|categorizar) (este |ese |el |)(documento|archivo)',
  'cambiar (el |)(nombre|título) (del |)(archivo|documento)',
  'poner (esto|eso) en (una |)(carpeta|categoría)',
  '(eliminar|subir|descargar) (masivo|en lote)',
  'gestionar (mis |)(documentos|archivos|almacenamiento)',
]);

// ============================================================================
// PREFERENCE_UPDATE - User settings and preferences
// ============================================================================

addPatterns('PREFERENCE_UPDATE', 'en', [
  '(change|update|set) (my |)(settings|preferences)',
  '(change|switch) (the |)(language|theme|mode)',
  '(enable|disable|turn on|turn off) (.*)',
  '(dark|light) mode',
  'change (my |)(password|email|name)',
  '(notification|alert) (settings|preferences)',
  'update (my |)(profile|account)',
  '(increase|decrease) (font|text) size',
  'set (my |)default (language|format|view)',
  '(configure|customize) (my |)(settings|dashboard)',
  'i (want|prefer|like) (to |)(.*) (enabled|disabled)',
  'make (it|this) (my |the )default',
  'remember (my |this |)(choice|preference)',
  'save (my |these |)(settings|preferences)',
  'reset (to |)(default|original) (settings|preferences)',
]);

addPatterns('PREFERENCE_UPDATE', 'pt', [
  '(alterar|atualizar|definir) (minhas |)(configurações|preferências)',
  '(mudar|trocar) (o |a |)(idioma|tema|modo)',
  '(ativar|desativar|ligar|desligar) (.*)',
  'modo (escuro|claro)',
  '(mudar|alterar) (minha |)(senha|email|nome)',
  '(configurações|preferências) (de |)(notificação|alerta)',
  'atualizar (meu |)(perfil|conta)',
  '(aumentar|diminuir) (o |)(tamanho|fonte) (do texto|)',
  'definir (meu |)(padrão|default) (de |)(idioma|formato|visualização)',
  '(configurar|personalizar) (minhas |)(configurações|painel)',
  '(quero|prefiro) (.*) (ativado|desativado)',
  'tornar (isso|isto) (meu |o )padrão',
  'lembrar (minha |esta |)(escolha|preferência)',
  'salvar (minhas |estas |)(configurações|preferências)',
  'resetar (para |)(padrão|original)',
]);

addPatterns('PREFERENCE_UPDATE', 'es', [
  '(cambiar|actualizar|establecer) (mis |)(configuraciones|preferencias)',
  '(cambiar|modificar) (el |la |)(idioma|tema|modo)',
  '(activar|desactivar|encender|apagar) (.*)',
  'modo (oscuro|claro)',
  '(cambiar|modificar) (mi |)(contraseña|correo|nombre)',
  '(configuraciones|preferencias) (de |)(notificación|alerta)',
  'actualizar (mi |)(perfil|cuenta)',
  '(aumentar|disminuir) (el |)(tamaño|fuente) (del texto|)',
  'establecer (mi |)(predeterminado|default) (de |)(idioma|formato|vista)',
  '(configurar|personalizar) (mis |)(configuraciones|panel)',
  '(quiero|prefiero) (.*) (activado|desactivado)',
  'hacer (esto|eso) (mi |el )predeterminado',
  'recordar (mi |esta |)(elección|preferencia)',
  'guardar (mis |estas |)(configuraciones|preferencias)',
  'restablecer (a |)(predeterminado|original)',
]);

// ============================================================================
// PRODUCT_HELP - Help with the app/product features
// ============================================================================

addPatterns('PRODUCT_HELP', 'en', [
  'how (do i|to|can i) (use|access|find)',
  'where (is|are|can i find) (the |)',
  'what (does|is) (this|that) (button|feature|option)',
  '(help|tutorial|guide) (for|with|about)',
  '(show|explain) (me |)how (to|this works)',
  'i (dont|do not|cannot|cant) (find|see|access)',
  '(getting|get) started (with|guide)',
  '(keyboard|key) shortcuts',
  'what (can|does) (this|the) (app|tool) do',
  '(features|capabilities) (list|overview)',
  'how (does|do) (this|it) work',
  '(user|help) (manual|documentation)',
  '(tips|tricks) (for|and)',
  '(navigate|navigation) (to|through|help)',
  '(troubleshoot|fix) (this|the) (issue|problem)',
]);

addPatterns('PRODUCT_HELP', 'pt', [
  'como (eu |)(uso|acesso|encontro)',
  'onde (está|estão|posso encontrar) (o |a |)',
  'o que (faz|é) (este|esse) (botão|recurso|opção)',
  '(ajuda|tutorial|guia) (para|com|sobre)',
  '(mostrar|explicar) (me |)como (funciona|usar)',
  '(não|nao) (consigo|encontro|vejo|acesso)',
  '(começar|começando) (com|a usar)',
  '(atalhos|teclas) (de teclado|)',
  'o que (pode|faz) (este|o) (app|aplicativo|ferramenta)',
  '(recursos|funcionalidades) (lista|visão geral)',
  'como (funciona|isso funciona)',
  '(manual|documentação) (do usuário|de ajuda)',
  '(dicas|truques) (para|e)',
  '(navegar|navegação) (para|por|ajuda)',
  '(resolver|corrigir) (este|o) (problema|erro)',
]);

addPatterns('PRODUCT_HELP', 'es', [
  'cómo (puedo |)(usar|acceder|encontrar)',
  'dónde (está|están|puedo encontrar) (el |la |)',
  'qué (hace|es) (este|ese) (botón|función|opción)',
  '(ayuda|tutorial|guía) (para|con|sobre)',
  '(mostrar|explicar) (me |)cómo (funciona|usar)',
  'no (puedo|encuentro|veo|accedo)',
  '(empezar|comenzar) (con|a usar)',
  '(atajos|teclas) (de teclado|)',
  'qué (puede|hace) (esta|la) (app|aplicación|herramienta)',
  '(funciones|capacidades) (lista|resumen)',
  'cómo (funciona|esto funciona)',
  '(manual|documentación) (del usuario|de ayuda)',
  '(consejos|trucos) (para|y)',
  '(navegar|navegación) (a|por|ayuda)',
  '(solucionar|arreglar) (este|el) (problema|error)',
]);

// Update lastUpdated date
data.lastUpdated = new Date().toISOString().split('T')[0];

// Write back
fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
console.log('\n✅ Patterns updated successfully!');
console.log(`Last updated: ${data.lastUpdated}`);
