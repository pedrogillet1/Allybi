/**
 * Script to add regex patterns - Batch 3
 * Covers: DOC_SUMMARIZE, MEMORY_*, FEATURE_REQUEST, GENERIC_KNOWLEDGE, META_AI, ONBOARDING_HELP, DOC_QA, DOC_SEARCH, REASONING_TASK
 */

const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, '../src/data/intent_patterns.json');
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

function addPatterns(intent, lang, newPatterns) {
  if (!data[intent]) {
    console.error(`Intent ${intent} not found!`);
    return;
  }
  if (!data[intent].patterns) data[intent].patterns = {};
  if (!data[intent].patterns[lang]) data[intent].patterns[lang] = [];

  const existing = new Set(data[intent].patterns[lang]);
  let added = 0;
  for (const p of newPatterns) {
    if (!existing.has(p)) {
      try {
        new RegExp(p, 'i');
        data[intent].patterns[lang].push(p);
        added++;
      } catch (e) {
        console.error(`Invalid regex for ${intent}/${lang}: "${p}" - ${e.message}`);
      }
    }
  }
  console.log(`${intent}/${lang}: Added ${added} patterns`);
}

// ============================================================================
// DOC_SUMMARIZE - Summarize documents
// ============================================================================

addPatterns('DOC_SUMMARIZE', 'en', [
  '(summarize|summary of) (this|that|the) (document|file|report)',
  '(give|provide) (me |)(a |)(summary|overview|recap)',
  '(what are|whats) (the |)(main|key) (points|takeaways)',
  '(tldr|tl;dr) (of |)(this|that|the)',
  '(brief|short|quick) (summary|overview)',
  '(condense|boil down) (this|that|the) (document|content)',
  '(highlight|extract) (the |)(key|main|important) (points|information)',
  '(executive|high-level) summary',
  '(sum up|wrap up) (this|that|the)',
  '(distill|compress) (the |)(content|information)',
  '(in a nutshell|bottom line)',
  '(cliff notes|key findings)',
  '(gist|essence) of (this|that|the)',
]);

addPatterns('DOC_SUMMARIZE', 'pt', [
  '(resuma|resumo de) (este|esse|o) (documento|arquivo|relatório)',
  '(me |)(dê|forneça) (um |)(resumo|visão geral|recapitulação)',
  '(quais são|qual é) (os |a |)(principais|pontos-chave)',
  '(resumo rápido) (de |)(isso|desse|do)',
  '(resumo|visão geral) (breve|curto|rápido)',
  '(condense|resuma) (este|esse|o) (documento|conteúdo)',
  '(destaque|extraia) (os |as |)(pontos|informações) (principais|importantes)',
  '(resumo executivo|visão geral)',
  '(resuma|sintetize) (isso|esse|o)',
  '(essência|ponto principal) (de |)(isso|desse|do)',
  '(em poucas palavras|conclusão)',
  '(pontos principais|achados-chave)',
]);

addPatterns('DOC_SUMMARIZE', 'es', [
  '(resume|resumen de) (este|ese|el) (documento|archivo|informe)',
  '(dame|proporciona) (un |)(resumen|panorama|recapitulación)',
  '(cuáles son|cuál es) (los |la |)(principales|puntos clave)',
  '(resumen rápido) (de |)(esto|ese|el)',
  '(resumen|panorama) (breve|corto|rápido)',
  '(condensa|resume) (este|ese|el) (documento|contenido)',
  '(destaca|extrae) (los |las |)(puntos|información) (principales|importantes)',
  '(resumen ejecutivo|visión general)',
  '(resume|sintetiza) (esto|ese|el)',
  '(esencia|punto principal) (de |)(esto|ese|el)',
  '(en pocas palabras|conclusión)',
  '(puntos principales|hallazgos clave)',
]);

// ============================================================================
// MEMORY_STORE - Store/remember information
// ============================================================================

addPatterns('MEMORY_STORE', 'en', [
  '(remember|memorize|store) (this|that)',
  '(save|keep) (this|that) (for later|in memory)',
  '(note|take note) (of |)(this|that)',
  '(dont|do not) forget (this|that)',
  '(add|save) (this|that) (to|as) (my |)(notes|memory)',
  '(keep in mind|bear in mind) (that |)(.*)',
  '(store|save) (this|that) (information|fact|detail)',
  '(make a note|write down) (that |)(.*)',
  'i (want|need) you to (remember|store|save)',
  '(this is|heres) (important|something to remember)',
  '(log|record) (this|that)',
  '(bookmark|pin) (this|that)',
]);

addPatterns('MEMORY_STORE', 'pt', [
  '(lembre|memorize|guarde) (isso|isto)',
  '(salve|guarde) (isso|isto) (para depois|na memória)',
  '(anote|tome nota) (de |)(isso|isto)',
  '(não|nao) (esqueça|esquece) (isso|isto)',
  '(adicione|salve) (isso|isto) (nas |como |)(notas|memória)',
  '(tenha em mente|lembre-se) (que |)(.*)',
  '(guarde|salve) (essa|esta) (informação|fato|detalhe)',
  '(faça uma nota|anote) (que |)(.*)',
  '(quero|preciso) que você (lembre|guarde|salve)',
  '(isso é|aqui está) (importante|algo para lembrar)',
  '(registre|grave) (isso|isto)',
  '(marque|fixe) (isso|isto)',
]);

addPatterns('MEMORY_STORE', 'es', [
  '(recuerda|memoriza|guarda) (esto|eso)',
  '(guarda|conserva) (esto|eso) (para después|en memoria)',
  '(anota|toma nota) (de |)(esto|eso)',
  'no (olvides|te olvides de) (esto|eso)',
  '(agrega|guarda) (esto|eso) (en |como |)(notas|memoria)',
  '(ten en cuenta|recuerda) (que |)(.*)',
  '(guarda|almacena) (esta|esa) (información|dato|detalle)',
  '(haz una nota|anota) (que |)(.*)',
  '(quiero|necesito) que (recuerdes|guardes|almacenes)',
  '(esto es|aquí hay) (importante|algo para recordar)',
  '(registra|graba) (esto|eso)',
  '(marca|fija) (esto|eso)',
]);

// ============================================================================
// MEMORY_RECALL - Recall stored information
// ============================================================================

addPatterns('MEMORY_RECALL', 'en', [
  '(what|do you) (remember|recall) (about|)',
  '(did i|have i) (tell|told) you (about|)',
  '(what|whats) (in |)(my |)(notes|memory)',
  '(recall|retrieve) (what i|my) (.*)',
  '(what did i|did i) (say|mention|tell you) (about|)',
  '(show|list) (my |)(saved|stored) (notes|information)',
  '(what do you|you) (know|remember) (about me|)',
  '(remind me|what was) (.*)',
  '(bring up|pull up) (my |)(notes|memory) (about|on)',
  '(check|look at) (my |)(saved|stored) (information|notes)',
  '(did i mention|did i say) (.*)',
  '(whats|what is) (stored|saved) (about|)',
]);

addPatterns('MEMORY_RECALL', 'pt', [
  '(o que você|você) (lembra|recorda) (sobre|)',
  '(eu |)(te |)(disse|contei) (sobre|)',
  '(o que|quais) (estão |)(nas |)(minhas |)(notas|memória)',
  '(lembre|recupere) (o que eu|meu) (.*)',
  '(o que eu|eu) (disse|mencionei|te contei) (sobre|)',
  '(mostre|liste) (minhas |)(notas|informações) (salvas|guardadas)',
  '(o que você|você) (sabe|lembra) (sobre mim|)',
  '(me lembre|qual era) (.*)',
  '(traga|puxe) (minhas |)(notas|memória) (sobre|de)',
  '(verifique|veja) (minhas |)(informações|notas) (salvas|guardadas)',
  '(eu mencionei|eu disse) (.*)',
  '(o que está|o que foi) (guardado|salvo) (sobre|)',
]);

addPatterns('MEMORY_RECALL', 'es', [
  '(qué |)(recuerdas|te acuerdas) (de|sobre|)',
  '(te |)(dije|conté) (sobre|)',
  '(qué|cuáles) (están |)(en |)(mis |)(notas|memoria)',
  '(recuerda|recupera) (lo que yo|mi) (.*)',
  '(qué |)(dije|mencioné|te conté) (sobre|)',
  '(muestra|lista) (mis |)(notas|información) (guardadas|almacenadas)',
  '(qué |)(sabes|recuerdas) (de mí|sobre mí|)',
  '(recuérdame|cuál era) (.*)',
  '(trae|busca) (mis |)(notas|memoria) (sobre|de)',
  '(revisa|mira) (mis |)(información|notas) (guardadas|almacenadas)',
  '(mencioné|dije) (.*)',
  '(qué está|qué fue) (guardado|almacenado) (sobre|)',
]);

// ============================================================================
// FEATURE_REQUEST - Request new features
// ============================================================================

addPatterns('FEATURE_REQUEST', 'en', [
  '(can you|could you|would you) (add|implement|build)',
  '(feature|functionality) (request|suggestion)',
  '(it would be (nice|great|helpful) if)',
  '(i wish|i hope) (you|this) (could|would|had)',
  '(you should|please) (add|implement|include)',
  '(missing|need|want) (a |this |)(feature|functionality)',
  '(suggestion|idea) for (improvement|new feature)',
  '(why (cant|doesnt|dont) (you|it) (.*))',
  '(would be (cool|awesome|great) (if|to))',
  '(enhancement|improvement) (request|suggestion)',
  '(can this|does this) (support|do|have)',
  '(requesting|asking for) (a |)(new |)(feature|capability)',
]);

addPatterns('FEATURE_REQUEST', 'pt', [
  '(você pode|poderia|conseguiria) (adicionar|implementar|criar)',
  '(solicitação|sugestão) (de |)(recurso|funcionalidade)',
  '(seria (bom|legal|útil) se)',
  '(eu gostaria|queria) (que |)(você|isso) (pudesse|tivesse)',
  '(você deveria|por favor) (adicionar|implementar|incluir)',
  '(falta|preciso|quero) (um |esta |)(recurso|funcionalidade)',
  '(sugestão|ideia) (para |de |)(melhoria|novo recurso)',
  '(por que (não pode|não tem|não faz) (.*))',
  '(seria (legal|incrível|ótimo) (se|para))',
  '(solicitação|sugestão) (de |)(melhoria|aprimoramento)',
  '(isso (suporta|faz|tem))',
  '(solicitando|pedindo) (um |)(novo |)(recurso|capacidade)',
]);

addPatterns('FEATURE_REQUEST', 'es', [
  '(puedes|podrías|podrías) (agregar|implementar|crear)',
  '(solicitud|sugerencia) (de |)(función|funcionalidad)',
  '(sería (bueno|genial|útil) si)',
  '(me gustaría|quisiera) (que |)(pudieras|esto tuviera)',
  '(deberías|por favor) (agregar|implementar|incluir)',
  '(falta|necesito|quiero) (una |esta |)(función|funcionalidad)',
  '(sugerencia|idea) (para |de |)(mejora|nueva función)',
  '(por qué (no puede|no tiene|no hace) (.*))',
  '(sería (genial|increíble|estupendo) (si|para))',
  '(solicitud|sugerencia) (de |)(mejora|perfeccionamiento)',
  '(esto (soporta|hace|tiene))',
  '(solicitando|pidiendo) (una |)(nueva |)(función|capacidad)',
]);

// ============================================================================
// GENERIC_KNOWLEDGE - General knowledge questions
// ============================================================================

addPatterns('GENERIC_KNOWLEDGE', 'en', [
  '(what is|whats|define) (a |the |)(.*)',
  '(who is|whos|who was) (.*)',
  '(when (did|was|is)) (.*)',
  '(where (is|was|are)) (.*)',
  '(why (is|are|do|does|did)) (.*)',
  '(how (does|do|did|is)) (.*) (work|happen)',
  '(explain|describe) (what|how|why) (.*)',
  '(tell me about|information (about|on)) (.*)',
  '(facts|info|information) (about|on) (.*)',
  '(meaning of|definition of) (.*)',
  '(history of|background on) (.*)',
  '(difference between) (.*) (and) (.*)',
  '(can you explain) (.*)',
  '(what does) (.*) (mean|stand for)',
]);

addPatterns('GENERIC_KNOWLEDGE', 'pt', [
  '(o que é|qual é|defina) (um |o |a |)(.*)',
  '(quem é|quem foi) (.*)',
  '(quando (foi|era|é)) (.*)',
  '(onde (é|era|fica|estão)) (.*)',
  '(por que (é|são|faz|fazem)) (.*)',
  '(como (funciona|acontece|é)) (.*)',
  '(explique|descreva) (o que|como|por que) (.*)',
  '(me (conte|fale) sobre|informações sobre) (.*)',
  '(fatos|info|informações) (sobre|de) (.*)',
  '(significado de|definição de) (.*)',
  '(história de|contexto sobre) (.*)',
  '(diferença entre) (.*) (e) (.*)',
  '(pode explicar) (.*)',
  '(o que significa|o que quer dizer) (.*)',
]);

addPatterns('GENERIC_KNOWLEDGE', 'es', [
  '(qué es|cuál es|define) (un |el |la |)(.*)',
  '(quién es|quién fue) (.*)',
  '(cuándo (fue|era|es)) (.*)',
  '(dónde (está|estaba|queda|están)) (.*)',
  '(por qué (es|son|hace|hacen)) (.*)',
  '(cómo (funciona|sucede|es)) (.*)',
  '(explica|describe) (qué|cómo|por qué) (.*)',
  '(cuéntame sobre|información sobre) (.*)',
  '(datos|info|información) (sobre|de) (.*)',
  '(significado de|definición de) (.*)',
  '(historia de|contexto sobre) (.*)',
  '(diferencia entre) (.*) (y) (.*)',
  '(puedes explicar) (.*)',
  '(qué significa|qué quiere decir) (.*)',
]);

// ============================================================================
// META_AI - Questions about the AI itself
// ============================================================================

addPatterns('META_AI', 'en', [
  '(who|what) (are you|made you|created you)',
  '(are you|you are) (a |an |)(ai|bot|robot|human|real)',
  '(what (can|do) you|you can) (do|help with)',
  '(how (do you|does this) work)',
  '(what (is|are) your) (capabilities|limits|limitations)',
  '(tell me about yourself)',
  '(are you|do you) (sentient|conscious|alive|thinking)',
  '(what model|which model|what version) (are you|is this)',
  '(who (built|trained|developed) you)',
  '(can you (learn|remember|think))',
  '(do you have) (feelings|emotions|memory|opinions)',
  '(whats your (name|purpose))',
  '(are you (better|different) than) (chatgpt|gpt|other ai)',
]);

addPatterns('META_AI', 'pt', [
  '(quem|o que) (é você|te fez|te criou)',
  '(você é) (uma |um |)(ia|bot|robô|humano|real)',
  '(o que (você pode|você faz)|você pode) (fazer|ajudar)',
  '(como (você funciona|isso funciona))',
  '(quais são suas) (capacidades|limites|limitações)',
  '(me (conte|fale) sobre você)',
  '(você é|você tem) (consciente|vivo|pensante)',
  '(qual modelo|que versão) (você é|é essa)',
  '(quem (construiu|treinou|desenvolveu) você)',
  '(você pode (aprender|lembrar|pensar))',
  '(você tem) (sentimentos|emoções|memória|opiniões)',
  '(qual é seu (nome|propósito))',
  '(você é (melhor|diferente) que) (chatgpt|gpt|outras ia)',
]);

addPatterns('META_AI', 'es', [
  '(quién|qué) (eres|te hizo|te creó)',
  '(eres) (una |un |)(ia|bot|robot|humano|real)',
  '(qué (puedes|haces)|puedes) (hacer|ayudar)',
  '(cómo (funcionas|funciona esto))',
  '(cuáles son tus) (capacidades|límites|limitaciones)',
  '(cuéntame sobre ti)',
  '(eres|tienes) (consciente|vivo|pensante)',
  '(qué modelo|qué versión) (eres|es esta)',
  '(quién (construyó|entrenó|desarrolló))',
  '(puedes (aprender|recordar|pensar))',
  '(tienes) (sentimientos|emociones|memoria|opiniones)',
  '(cuál es tu (nombre|propósito))',
  '(eres (mejor|diferente) que) (chatgpt|gpt|otras ia)',
]);

// ============================================================================
// ONBOARDING_HELP - Getting started help
// ============================================================================

addPatterns('ONBOARDING_HELP', 'en', [
  '(getting|get) started',
  '(how (do i|to)) (begin|start)',
  '(first (steps|time)|im new)',
  '(setup|set up) (guide|help|wizard)',
  '(tutorial|walkthrough|tour)',
  '(quick start|beginners guide)',
  '(show me (around|the basics))',
  '(what (should i|do i) do first)',
  '(help me (get started|begin))',
  '(introduction|intro) (to|guide)',
  '(new (here|user) |)(need help starting)',
  '(where do i (begin|start))',
  '(onboarding|welcome) (guide|tour)',
]);

addPatterns('ONBOARDING_HELP', 'pt', [
  '(começando|começar|iniciar)',
  '(como (eu |)(começo|inicio))',
  '(primeiros passos|sou novo)',
  '(guia|ajuda|assistente) (de |para |)(configuração|setup)',
  '(tutorial|passo a passo|tour)',
  '(início rápido|guia para iniciantes)',
  '(me mostre (o básico|como funciona))',
  '(o que (devo|eu devo) fazer primeiro)',
  '(me ajude a (começar|iniciar))',
  '(introdução|intro) (a|para|guia)',
  '(novo aqui|preciso de ajuda para começar)',
  '(por onde (começo|inicio))',
  '(guia|tour) (de |)(boas-vindas|onboarding)',
]);

addPatterns('ONBOARDING_HELP', 'es', [
  '(empezando|empezar|comenzar)',
  '(cómo (yo |)(empiezo|comienzo))',
  '(primeros pasos|soy nuevo)',
  '(guía|ayuda|asistente) (de |para |)(configuración|setup)',
  '(tutorial|paso a paso|recorrido)',
  '(inicio rápido|guía para principiantes)',
  '(muéstrame (lo básico|cómo funciona))',
  '(qué (debo|debería) hacer primero)',
  '(ayúdame a (empezar|comenzar))',
  '(introducción|intro) (a|para|guía)',
  '(nuevo aquí|necesito ayuda para empezar)',
  '(por dónde (empiezo|comienzo))',
  '(guía|tour) (de |)(bienvenida|onboarding)',
]);

// ============================================================================
// DOC_QA - Questions about document content
// ============================================================================

addPatterns('DOC_QA', 'en', [
  '(what does|what do) (the |my |)(document|file|report) (say|mention) (about|)',
  '(according to|based on) (the |my |)(document|file|report)',
  '(find|search|look for) (in |)(the |my |)(document|file)',
  '(in (the|my) (document|file)),? (what|where|who|when|how)',
  '(does (the|my) (document|file)) (mention|say|contain|have)',
  '(extract|get|pull) (from |)(the |my |)(document|file)',
  '(information|details|data) (from|in) (the |my |)(document|file)',
  '(quote|cite) (from |)(the |my |)(document|file)',
  '(what (is|are)) (.*) (in|from|according to) (the |my |)(document|file)',
  '(tell me|show me) (what) (the |my |)(document|file) (says|contains)',
  '(refer to|check) (the |my |)(document|file) (for|about)',
  '(answer|respond) (based on|from|using) (the |my |)(document|file)',
]);

addPatterns('DOC_QA', 'pt', [
  '(o que diz|o que fala) (o |meu |)(documento|arquivo|relatório) (sobre|)',
  '(de acordo com|baseado em) (o |meu |)(documento|arquivo|relatório)',
  '(encontre|busque|procure) (no |em |)(o |meu |)(documento|arquivo)',
  '(no (meu |)(documento|arquivo)),? (o que|onde|quem|quando|como)',
  '(o (meu |)(documento|arquivo)) (menciona|diz|contém|tem)',
  '(extraia|pegue|tire) (do |)(o |meu |)(documento|arquivo)',
  '(informações|detalhes|dados) (do|no|de) (o |meu |)(documento|arquivo)',
  '(cite|transcreva) (do |)(o |meu |)(documento|arquivo)',
  '(o que (é|são)) (.*) (no|do|de acordo com) (o |meu |)(documento|arquivo)',
  '(me (diga|mostre)) (o que) (o |meu |)(documento|arquivo) (diz|contém)',
  '(consulte|verifique) (o |meu |)(documento|arquivo) (sobre|para)',
  '(responda|baseie-se) (em|no|usando) (o |meu |)(documento|arquivo)',
]);

addPatterns('DOC_QA', 'es', [
  '(qué dice|qué menciona) (el |mi |)(documento|archivo|informe) (sobre|)',
  '(según|basado en) (el |mi |)(documento|archivo|informe)',
  '(encuentra|busca) (en |)(el |mi |)(documento|archivo)',
  '(en (el|mi) (documento|archivo)),? (qué|dónde|quién|cuándo|cómo)',
  '(el (mi |)(documento|archivo)) (menciona|dice|contiene|tiene)',
  '(extrae|saca) (del |)(el |mi |)(documento|archivo)',
  '(información|detalles|datos) (del|en|de) (el |mi |)(documento|archivo)',
  '(cita|transcribe) (del |)(el |mi |)(documento|archivo)',
  '(qué (es|son)) (.*) (en|del|según) (el |mi |)(documento|archivo)',
  '(dime|muéstrame) (qué) (el |mi |)(documento|archivo) (dice|contiene)',
  '(consulta|revisa) (el |mi |)(documento|archivo) (sobre|para)',
  '(responde|basándote) (en|del|usando) (el |mi |)(documento|archivo)',
]);

// ============================================================================
// DOC_SEARCH - Search for documents
// ============================================================================

addPatterns('DOC_SEARCH', 'en', [
  '(find|search for|look for) (documents|files) (about|with|containing)',
  '(show|list|display) (all |my |)(documents|files)',
  '(which|what) (documents|files) (have|contain|mention)',
  '(search|find) (.*) (in|across) (my |)(documents|files)',
  '(documents|files) (related to|about|on) (.*)',
  '(filter|sort) (my |)(documents|files) (by|)',
  '(recent|latest|newest|oldest) (documents|files)',
  '(documents|files) (from|uploaded|created) (.*)',
  '(do i have|have i) (any |)(documents|files) (about|on|)',
  '(browse|explore) (my |)(documents|files)',
  '(documents|files) (matching|with) (.*)',
  '(locate|find) (the |a |)(document|file) (named|called|about)',
]);

addPatterns('DOC_SEARCH', 'pt', [
  '(encontre|busque|procure) (documentos|arquivos) (sobre|com|contendo)',
  '(mostre|liste|exiba) (todos |meus |)(documentos|arquivos)',
  '(quais) (documentos|arquivos) (têm|contêm|mencionam)',
  '(busque|encontre) (.*) (em|nos|entre) (meus |)(documentos|arquivos)',
  '(documentos|arquivos) (relacionados a|sobre) (.*)',
  '(filtre|ordene) (meus |)(documentos|arquivos) (por|)',
  '(recentes|últimos|mais novos|mais antigos) (documentos|arquivos)',
  '(documentos|arquivos) (de|carregados|criados) (.*)',
  '(tenho|eu tenho) (algum |)(documento|arquivo) (sobre|de|)',
  '(navegue|explore) (meus |)(documentos|arquivos)',
  '(documentos|arquivos) (correspondentes|com) (.*)',
  '(localize|encontre) (o |um |)(documento|arquivo) (chamado|sobre)',
]);

addPatterns('DOC_SEARCH', 'es', [
  '(encuentra|busca) (documentos|archivos) (sobre|con|que contengan)',
  '(muestra|lista|exhibe) (todos |mis |)(documentos|archivos)',
  '(cuáles) (documentos|archivos) (tienen|contienen|mencionan)',
  '(busca|encuentra) (.*) (en|entre) (mis |)(documentos|archivos)',
  '(documentos|archivos) (relacionados con|sobre) (.*)',
  '(filtra|ordena) (mis |)(documentos|archivos) (por|)',
  '(recientes|últimos|más nuevos|más antiguos) (documentos|archivos)',
  '(documentos|archivos) (de|subidos|creados) (.*)',
  '(tengo|yo tengo) (algún |)(documento|archivo) (sobre|de|)',
  '(navega|explora) (mis |)(documentos|archivos)',
  '(documentos|archivos) (que coincidan|con) (.*)',
  '(localiza|encuentra) (el |un |)(documento|archivo) (llamado|sobre)',
]);

// ============================================================================
// REASONING_TASK - Math, logic, calculations
// ============================================================================

addPatterns('REASONING_TASK', 'en', [
  '(calculate|compute|solve) (.*)',
  '(what is|whats) (\\d+) (plus|minus|times|divided by|\\+|\\-|\\*|\\/) (\\d+)',
  '(math|calculation) (problem|question)',
  '(if|given) (.*) (then|what is|find)',
  '(analyze|evaluate|assess) (.*)',
  '(compare|contrast) (.*) (and|with|vs) (.*)',
  '(logical|logic) (problem|puzzle|reasoning)',
  '(figure out|work out|deduce) (.*)',
  '(step by step|show your work)',
  '(what (would|will) happen if)',
  '(probability|chance|likelihood) (of|that) (.*)',
  '(percentage|percent|%) (of|increase|decrease)',
  '(average|mean|median|sum|total) (of|)',
  '(convert|translate) (\\d+) (.*) (to|into) (.*)',
]);

addPatterns('REASONING_TASK', 'pt', [
  '(calcule|compute|resolva) (.*)',
  '(quanto é|qual é) (\\d+) (mais|menos|vezes|dividido por|\\+|\\-|\\*|\\/) (\\d+)',
  '(problema|questão) (de |)(matemática|cálculo)',
  '(se|dado) (.*) (então|qual é|encontre)',
  '(analise|avalie) (.*)',
  '(compare|contraste) (.*) (e|com|vs) (.*)',
  '(problema|enigma|raciocínio) (lógico|de lógica)',
  '(descubra|calcule|deduza) (.*)',
  '(passo a passo|mostre o cálculo)',
  '(o que (aconteceria|acontece) se)',
  '(probabilidade|chance) (de|que) (.*)',
  '(porcentagem|percentual|%) (de|aumento|diminuição)',
  '(média|mediana|soma|total) (de|)',
  '(converta|transforme) (\\d+) (.*) (para|em) (.*)',
]);

addPatterns('REASONING_TASK', 'es', [
  '(calcula|computa|resuelve) (.*)',
  '(cuánto es|cuál es) (\\d+) (más|menos|por|dividido por|\\+|\\-|\\*|\\/) (\\d+)',
  '(problema|pregunta) (de |)(matemáticas|cálculo)',
  '(si|dado) (.*) (entonces|cuál es|encuentra)',
  '(analiza|evalúa) (.*)',
  '(compara|contrasta) (.*) (y|con|vs) (.*)',
  '(problema|acertijo|razonamiento) (lógico|de lógica)',
  '(descubre|calcula|deduce) (.*)',
  '(paso a paso|muestra el cálculo)',
  '(qué (pasaría|pasa) si)',
  '(probabilidad|chance) (de|que) (.*)',
  '(porcentaje|%) (de|aumento|disminución)',
  '(promedio|media|mediana|suma|total) (de|)',
  '(convierte|transforma) (\\d+) (.*) (a|en) (.*)',
]);

// Update lastUpdated
data.lastUpdated = new Date().toISOString().split('T')[0];

fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
console.log('\n✅ Batch 3 patterns added!');
