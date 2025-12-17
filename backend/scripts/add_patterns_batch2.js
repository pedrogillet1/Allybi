/**
 * Script to add regex patterns - Batch 2
 * Covers: FEEDBACK_*, MULTI_INTENT, ANSWER_*, TEXT_TRANSFORM, CHITCHAT
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
// FEEDBACK_POSITIVE - Positive feedback about responses
// ============================================================================

addPatterns('FEEDBACK_POSITIVE', 'en', [
  '(thats|that is|this is) (great|perfect|exactly|correct|right)',
  '(thanks|thank you|thx)',
  '(great|perfect|excellent|awesome|amazing) (answer|response|job)',
  'you (got it|nailed it|are right)',
  '(exactly|precisely) (what i (wanted|needed|asked))',
  '(this|that) (helps|helped|works)',
  '(good|nice) (work|job|one)',
  'i (like|love) (this|that|it)',
  '(spot on|on point|just right)',
  '(yes|yeah|yep),? (that|this) is (it|correct|right)',
  '(very|really|so) (helpful|useful)',
  '(well done|good answer)',
  '(thumbs up|upvote|like)',
  'keep (it |)up',
  '(correct|right|accurate)',
]);

addPatterns('FEEDBACK_POSITIVE', 'pt', [
  '(isso|isto) (é|está) (ótimo|perfeito|exato|correto|certo)',
  '(obrigado|valeu|brigadão)',
  '(ótima|perfeita|excelente) (resposta|ajuda)',
  'você (acertou|está certo)',
  '(exatamente|precisamente) (o que (eu |)(queria|precisava))',
  '(isso|isto) (ajuda|ajudou|funciona)',
  '(bom|belo) (trabalho)',
  '(gostei|adorei) (disso|dessa resposta)',
  '(certinho|na medida|perfeito)',
  '(sim|é),? (isso|isto) (mesmo|está certo)',
  '(muito|bem) (útil|prestativo)',
  '(muito bem|boa resposta)',
  '(curti|gostei|aprovado)',
  'continue (assim|)',
  '(correto|certo|exato)',
]);

addPatterns('FEEDBACK_POSITIVE', 'es', [
  '(eso|esto) (es|está) (genial|perfecto|exacto|correcto)',
  '(gracias|muchas gracias)',
  '(excelente|perfecta|genial) (respuesta|ayuda)',
  '(acertaste|estás en lo cierto)',
  '(exactamente|precisamente) (lo que (yo |)(quería|necesitaba))',
  '(esto|eso) (ayuda|ayudó|funciona)',
  '(buen|excelente) (trabajo)',
  'me (gusta|encanta) (esto|eso)',
  '(perfecto|justo|exacto)',
  '(sí|si),? (eso|esto) (es|está) (correcto|bien)',
  '(muy|bien) (útil|servicial)',
  '(muy bien|buena respuesta)',
  '(me gusta|aprobado)',
  'sigue (así|adelante)',
  '(correcto|cierto|exacto)',
]);

// ============================================================================
// FEEDBACK_NEGATIVE - Negative feedback
// ============================================================================

addPatterns('FEEDBACK_NEGATIVE', 'en', [
  '(thats|that is|this is) (wrong|incorrect|not right)',
  '(not|no),? (what i (wanted|asked|meant))',
  '(wrong|bad|poor|terrible) (answer|response)',
  'you (got it wrong|are wrong|missed)',
  '(try|do it) again',
  '(this|that) (doesnt|does not|didnt) (help|work)',
  '(not|no) (helpful|useful)',
  '(i (dont|didnt) (like|want) (this|that))',
  '(thumbs down|downvote|dislike)',
  '(still wrong|not quite|close but)',
  '(incorrect|inaccurate|false)',
  '(nope|no|nah),? (thats|not it)',
  'that (makes no sense|is confusing)',
  '(please|can you) (fix|correct) (this|that)',
  '(missing|forgot|left out) (something|information)',
]);

addPatterns('FEEDBACK_NEGATIVE', 'pt', [
  '(isso|isto) (está|é) (errado|incorreto)',
  '(não é|não foi) (o que (eu |)(queria|pedi|quis dizer))',
  '(resposta|ajuda) (errada|ruim|péssima)',
  'você (errou|está errado)',
  '(tente|faça) (de novo|novamente)',
  '(isso|isto) (não|nao) (ajuda|funciona|ajudou)',
  '(não é|nada) (útil|prestativo)',
  '(não|nao) (gostei|quero) (disso|isso)',
  '(não gostei|desaprovado|negativo)',
  '(ainda errado|quase|perto mas)',
  '(incorreto|impreciso|falso)',
  '(não|nope),? (não é isso|errado)',
  '(não faz sentido|está confuso)',
  '(por favor |)(corrija|arrume) (isso|isto)',
  '(faltou|esqueceu) (algo|informação)',
]);

addPatterns('FEEDBACK_NEGATIVE', 'es', [
  '(eso|esto) (está|es) (mal|incorrecto)',
  '(no es|no fue) (lo que (yo |)(quería|pedí|quise decir))',
  '(respuesta|ayuda) (incorrecta|mala|terrible)',
  '(te equivocaste|estás equivocado)',
  '(intenta|hazlo) (otra vez|de nuevo)',
  '(esto|eso) no (ayuda|funciona|ayudó)',
  '(no es|nada) (útil|servicial)',
  '(no me (gusta|gustó) (esto|eso))',
  '(no me gusta|desaprobado|negativo)',
  '(todavía mal|casi|cerca pero)',
  '(incorrecto|inexacto|falso)',
  '(no|nope),? (no es eso|mal)',
  '(no tiene sentido|está confuso)',
  '(por favor |)(corrige|arregla) (esto|eso)',
  '(falta|faltó|olvidaste) (algo|información)',
]);

// ============================================================================
// MULTI_INTENT - Multiple requests in one query
// ============================================================================

addPatterns('MULTI_INTENT', 'en', [
  '.+ (and|then|also|plus) .+',
  '(first|after|before) .+ (then|and|after) .+',
  '(summarize|list|find|search) .+ (and|then) (compare|analyze|summarize)',
  '(can you|please) .+ (and|as well as|also) .+',
  '(both|all of) .+ and .+',
  'do (two|three|multiple) things',
  '.+ (in addition to|besides|along with) .+',
  '(start by|begin with) .+ (then|after that) .+',
  '.+ (while|at the same time) .+',
  '(not only|either) .+ (but also|or) .+',
  '.+ (followed by|and finally) .+',
  '(once|when) (you|done) .+ (then|also) .+',
]);

addPatterns('MULTI_INTENT', 'pt', [
  '.+ (e|depois|também|além de) .+',
  '(primeiro|depois) .+ (então|e|depois) .+',
  '(resumir|listar|buscar) .+ (e|depois) (comparar|analisar)',
  '(pode|por favor) .+ (e|também|além de) .+',
  '(ambos|todos) .+ e .+',
  '(fazer|faça) (duas|três|várias) coisas',
  '.+ (além de|junto com) .+',
  '(comece|começando) (por|com) .+ (depois|então) .+',
  '.+ (enquanto|ao mesmo tempo) .+',
  '(não só|tanto) .+ (mas também|quanto) .+',
  '.+ (seguido de|e finalmente) .+',
]);

addPatterns('MULTI_INTENT', 'es', [
  '.+ (y|después|también|además de) .+',
  '(primero|después) .+ (luego|y|después) .+',
  '(resumir|listar|buscar) .+ (y|después) (comparar|analizar)',
  '(puedes|por favor) .+ (y|también|además de) .+',
  '(ambos|todos) .+ y .+',
  '(hacer|haz) (dos|tres|varias) cosas',
  '.+ (además de|junto con) .+',
  '(empieza|comenzando) (por|con) .+ (después|luego) .+',
  '.+ (mientras|al mismo tiempo) .+',
  '(no solo|tanto) .+ (sino también|como) .+',
  '.+ (seguido de|y finalmente) .+',
]);

// ============================================================================
// ANSWER_REWRITE - Rewrite/rephrase the response
// ============================================================================

addPatterns('ANSWER_REWRITE', 'en', [
  '(rewrite|rephrase|reword) (this|that|it)',
  '(say|put) (it|that|this) (differently|another way)',
  '(can you|please) (rephrase|reword)',
  '(different|other|new) (wording|phrasing)',
  'in (other|different) words',
  '(change|modify) (the |)(wording|phrasing)',
  '(make it|write it) (different|differently)',
  '(express|state) (it|this|that) (differently|another way)',
  '(same|that) (meaning|content) (but |)(different words)',
  '(paraphrase) (this|that|it)',
  '(restate|reformulate) (this|that|it)',
  '(word|phrase) (it|this|that) (better|differently)',
]);

addPatterns('ANSWER_REWRITE', 'pt', [
  '(reescreva|reformule) (isso|isto)',
  '(diga|coloque) (isso|de |)(outra forma|diferente)',
  '(pode|por favor) (reformular|reescrever)',
  '(outra|diferente) (forma de dizer|formulação)',
  '(em outras|com outras) palavras',
  '(mude|altere) (a |as |)(palavras|formulação)',
  '(escreva|faça) (de forma |)diferente',
  '(expresse|diga) (isso|de |)(outra maneira)',
  '(mesmo|mesma) (sentido|conteúdo) (mas |)(palavras diferentes)',
  '(parafraseie) (isso|isto)',
  '(reformule) (isso|isto)',
  '(formule) (isso|de |)(melhor|diferente)',
]);

addPatterns('ANSWER_REWRITE', 'es', [
  '(reescribe|reformula) (esto|eso)',
  '(dilo|ponlo) (de |)(otra forma|diferente)',
  '(puedes|por favor) (reformular|reescribir)',
  '(otra|diferente) (forma de decir|formulación)',
  '(en otras|con otras) palabras',
  '(cambia|modifica) (las |)(palabras|formulación)',
  '(escríbelo|hazlo) (de forma |)diferente',
  '(expresa|di) (esto|de |)(otra manera)',
  '(mismo|misma) (sentido|contenido) (pero |)(palabras diferentes)',
  '(parafrasea) (esto|eso)',
  '(reformula) (esto|eso)',
  '(formula) (esto|de |)(mejor|diferente)',
]);

// ============================================================================
// ANSWER_EXPAND - Make the response longer/more detailed
// ============================================================================

addPatterns('ANSWER_EXPAND', 'en', [
  '(expand|elaborate) (on |)(this|that|it)',
  '(more|additional) (details|information|explanation)',
  '(tell|give|show) me more',
  '(go|dig) (deeper|further)',
  '(longer|extended|detailed) (answer|response|explanation)',
  'can you (explain|expand|elaborate) (more|further)',
  '(add|include) more (details|information)',
  '(in |)(more|greater) (detail|depth)',
  '(full|complete|comprehensive) (answer|explanation)',
  '(dont|do not) (be brief|summarize)',
  '(keep|continue) (going|explaining)',
  'i (want|need) more (information|details)',
  '(extend|lengthen) (this|that|the response)',
  '(thorough|detailed) (explanation|breakdown)',
]);

addPatterns('ANSWER_EXPAND', 'pt', [
  '(expanda|elabore) (sobre |)(isso|isto)',
  '(mais|outros) (detalhes|informações|explicação)',
  '(me |)(conte|diga|mostre) mais',
  '(vá|aprofunde) (mais|adiante)',
  '(resposta|explicação) (mais longa|detalhada|completa)',
  '(pode|poderia) (explicar|expandir|elaborar) (mais|)',
  '(adicione|inclua) mais (detalhes|informações)',
  '(em |)(mais|maior) (detalhe|profundidade)',
  '(resposta|explicação) (completa|abrangente)',
  '(não|nao) (resuma|seja breve)',
  '(continue|siga) (explicando|)',
  '(quero|preciso) (de |)mais (informações|detalhes)',
  '(estenda|alongue) (isso|a resposta)',
  '(explicação|análise) (completa|detalhada)',
]);

addPatterns('ANSWER_EXPAND', 'es', [
  '(expande|elabora) (sobre |)(esto|eso)',
  '(más|otros) (detalles|información|explicación)',
  '(dime|cuéntame|muéstrame) más',
  '(profundiza|ve) (más|adelante)',
  '(respuesta|explicación) (más larga|detallada|completa)',
  '(puedes|podrías) (explicar|expandir|elaborar) (más|)',
  '(agrega|incluye) más (detalles|información)',
  '(en |)(más|mayor) (detalle|profundidad)',
  '(respuesta|explicación) (completa|exhaustiva)',
  '(no) (resumas|seas breve)',
  '(continúa|sigue) (explicando|)',
  '(quiero|necesito) más (información|detalles)',
  '(extiende|alarga) (esto|la respuesta)',
  '(explicación|análisis) (completo|detallado)',
]);

// ============================================================================
// ANSWER_SIMPLIFY - Make the response simpler/shorter
// ============================================================================

addPatterns('ANSWER_SIMPLIFY', 'en', [
  '(simplify|shorten) (this|that|it)',
  '(simpler|easier|shorter) (answer|explanation|version)',
  '(in |)(simple|plain) (terms|words|language)',
  '(too|very) (long|complex|complicated|technical)',
  '(explain it|put it) (simply|like im five)',
  '(brief|short|concise) (answer|version)',
  '(just|only) (the |)(basics|essentials|key points)',
  '(cut|trim) (it|this) (down|short)',
  '(eli5|explain like im 5)',
  '(make it|be) (shorter|briefer|simpler)',
  '(less|fewer) (words|details|jargon)',
  '(skip|remove) (the |)(technical|complex) (parts|details)',
  '(boil|break) (it|this) down',
  '(laymans|simple) terms',
]);

addPatterns('ANSWER_SIMPLIFY', 'pt', [
  '(simplifique|encurte) (isso|isto)',
  '(resposta|explicação|versão) (mais simples|fácil|curta)',
  '(em |)(termos|palavras) (simples|fáceis)',
  '(muito|bem) (longo|complexo|complicado|técnico)',
  '(explique|coloque) (de forma |)simples',
  '(resposta|versão) (breve|curta|concisa)',
  '(só|apenas) (o |)(básico|essencial|pontos-chave)',
  '(corte|reduza) (isso|)',
  '(explique como se eu tivesse 5 anos)',
  '(faça|seja) (mais curto|breve|simples)',
  '(menos) (palavras|detalhes|jargão)',
  '(pule|remova) (as |os |)(partes|detalhes) (técnicos|complexos)',
  '(resuma|simplifique) (isso|isto)',
  '(termos) (leigos|simples)',
]);

addPatterns('ANSWER_SIMPLIFY', 'es', [
  '(simplifica|acorta) (esto|eso)',
  '(respuesta|explicación|versión) (más simple|fácil|corta)',
  '(en |)(términos|palabras) (simples|fáciles)',
  '(muy|demasiado) (largo|complejo|complicado|técnico)',
  '(explícalo|ponlo) (de forma |)simple',
  '(respuesta|versión) (breve|corta|concisa)',
  '(solo|únicamente) (lo |)(básico|esencial|puntos clave)',
  '(corta|reduce) (esto|)',
  '(explícamelo como si tuviera 5 años)',
  '(hazlo|sé) (más corto|breve|simple)',
  '(menos) (palabras|detalles|jerga)',
  '(salta|quita) (las |los |)(partes|detalles) (técnicos|complejos)',
  '(resume|simplifica) (esto|eso)',
  '(términos) (sencillos|simples)',
]);

// ============================================================================
// TEXT_TRANSFORM - Transform text format (translate, format, etc.)
// ============================================================================

addPatterns('TEXT_TRANSFORM', 'en', [
  '(translate|convert) (this|that|it) (to|into)',
  '(make|convert) (this|it) (uppercase|lowercase|title case)',
  '(format|reformat) (this|that|it) (as|to|into)',
  '(change|switch) (to|into) (formal|informal|casual)',
  '(convert|change) (to|into) (bullet points|list|table)',
  '(fix|correct) (the |)(grammar|spelling|punctuation)',
  '(proofread|edit) (this|that)',
  '(markdown|html|json) format',
  '(clean up|tidy) (this|the |)(text|formatting)',
  '(remove|strip) (formatting|extra spaces|line breaks)',
  '(add|insert) (line breaks|paragraphs|spacing)',
  '(reverse|flip) (the |)(text|order)',
  '(number|enumerate) (the |)(items|lines|points)',
]);

addPatterns('TEXT_TRANSFORM', 'pt', [
  '(traduza|converta) (isso|isto) (para|em)',
  '(coloque|converta) (isso|em) (maiúsculas|minúsculas)',
  '(formate|reformate) (isso|isto) (como|para|em)',
  '(mude|troque) (para|em) (formal|informal|casual)',
  '(converta|mude) (para|em) (tópicos|lista|tabela)',
  '(corrija) (a |)(gramática|ortografia|pontuação)',
  '(revise|edite) (isso|isto)',
  '(formato|em) (markdown|html|json)',
  '(limpe|organize) (o |)(texto|formatação)',
  '(remova|retire) (formatação|espaços extras|quebras de linha)',
  '(adicione|insira) (quebras de linha|parágrafos|espaçamento)',
  '(inverta) (o |)(texto|ordem)',
  '(numere|enumere) (os |)(itens|linhas|pontos)',
]);

addPatterns('TEXT_TRANSFORM', 'es', [
  '(traduce|convierte) (esto|eso) (a|en)',
  '(pon|convierte) (esto|en) (mayúsculas|minúsculas)',
  '(formatea|reformatea) (esto|eso) (como|a|en)',
  '(cambia|pasa) (a|en) (formal|informal|casual)',
  '(convierte|cambia) (a|en) (viñetas|lista|tabla)',
  '(corrige) (la |)(gramática|ortografía|puntuación)',
  '(revisa|edita) (esto|eso)',
  '(formato|en) (markdown|html|json)',
  '(limpia|ordena) (el |)(texto|formato)',
  '(quita|elimina) (formato|espacios extras|saltos de línea)',
  '(agrega|inserta) (saltos de línea|párrafos|espaciado)',
  '(invierte) (el |)(texto|orden)',
  '(numera|enumera) (los |)(elementos|líneas|puntos)',
]);

// ============================================================================
// CHITCHAT - Casual conversation, greetings
// ============================================================================

addPatterns('CHITCHAT', 'en', [
  '^(hi|hello|hey|howdy|greetings)( there)?$',
  '^(good |)(morning|afternoon|evening|night)$',
  '^(how are you|how you doing|whats up|sup)\\?*$',
  '^(bye|goodbye|see you|later|cya)$',
  '^(thanks|thank you|thx|ty)( so much| very much)?$',
  '^(nice|good) (to |)(meet|talk|chat)( you|)$',
  '^(have a |)(good|great|nice) (day|one|time)$',
  '^(lol|haha|hehe|lmao)$',
  '^(cool|awesome|great|nice)!*$',
  '^(sure|ok|okay|alright|fine)$',
  '^(i see|got it|understood|makes sense)$',
  '^(no (problem|worries)|youre welcome|np|yw)$',
  '^(sorry|my bad|oops)$',
  '^(please|plz)$',
  '^(interesting|fascinating|wow)!*$',
]);

addPatterns('CHITCHAT', 'pt', [
  '^(oi|olá|e aí|eae|opa)$',
  '^(bom |boa |)(dia|tarde|noite)$',
  '^(como (vai|você está)|tudo bem|e aí)\\?*$',
  '^(tchau|até mais|até logo|falou|flw)$',
  '^(obrigado|valeu|brigadão|vlw)( muito)?$',
  '^(prazer|legal) (em |)(conhecer|conversar)$',
  '^(tenha um |)(bom|ótimo) (dia|)$',
  '^(kkk|haha|rsrs|hehe)$',
  '^(legal|massa|top|show)!*$',
  '^(claro|ok|tá|beleza|blz)$',
  '^(entendi|entendo|compreendi|faz sentido)$',
  '^(de nada|sem problemas|tmj)$',
  '^(desculpa|foi mal)$',
  '^(por favor|pfv)$',
  '^(interessante|uau|nossa)!*$',
]);

addPatterns('CHITCHAT', 'es', [
  '^(hola|hey|qué tal|buenas)$',
  '^(buenos |buenas |)(días|tardes|noches)$',
  '^(cómo (estás|vas)|qué tal|qué onda)\\?*$',
  '^(adiós|chao|hasta luego|nos vemos)$',
  '^(gracias|muchas gracias)$',
  '^(mucho gusto|encantado|un placer)$',
  '^(que (tengas|te vaya) (bien|buen día))$',
  '^(jaja|jeje|lol)$',
  '^(genial|chévere|cool|súper)!*$',
  '^(claro|ok|vale|bien|bueno)$',
  '^(entiendo|entendido|ya veo|tiene sentido)$',
  '^(de nada|no hay de qué)$',
  '^(perdón|lo siento|disculpa)$',
  '^(por favor|porfa)$',
  '^(interesante|guau|wow)!*$',
]);

// Update lastUpdated
data.lastUpdated = new Date().toISOString().split('T')[0];

fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
console.log('\n✅ Batch 2 patterns added!');
