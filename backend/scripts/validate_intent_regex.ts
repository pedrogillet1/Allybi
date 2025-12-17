/**
 * Regex Validation Script for Intent Patterns
 * Run: npx ts-node --transpile-only scripts/validate_intent_regex.ts
 */

interface IntentPatterns {
  [intent: string]: {
    priority?: number;
    keywords?: { en: string[]; pt: string[]; es: string[] };
    patterns?: { en: string[]; pt: string[]; es: string[] };
  };
}

// All generated patterns to validate
const generatedPatterns: IntentPatterns = {
  DOC_QA: {
    priority: 80,
    patterns: {
      en: [
        "^what does (the |this |my )?(document|file|report|contract|pdf) say",
        "^what does .+ say about",
        "^according to (the |this |my )?(document|file|report)",
        "^based on (the |this |my )?(document|file|report)",
        "^in (the |this |my )?(document|file|report)",
        "^(extract|quote|pull) (from |)(the |this |my )?(document|file)",
        "^what (is|are) .+ (in|from) (the |this |my )?(document|file)",
        "^(find|get|retrieve) .+ (in|from) (the |this |my )?(document|file)",
        "(document|file|report|contract) (says|states|mentions|indicates)",
        "^(tell me |explain |describe )?(what|how|why|when|where|who) .+ (document|file)",
        "^look up .+ in (the |my )?(document|file)",
        "^check (the |my )?(document|file) for",
        "^what (information|data|details) .+ (document|file)",
        "^(is there|does it) (mention|say|state|include) .+ (document|file)",
        "(stated|written|documented|recorded|specified|noted) in (the |my )?",
        "^(can you |please )?(tell me |explain )?(what|how) .+ (document|file)",
        "^(from|per|as per) (the |this |my )?(document|file)",
        "^(verify|confirm|check) (in |from |)(the |my )?(document|file)",
        "^what (does|do) (the |my )?(uploaded |)?(document|file|pdf) (contain|include|have)",
        "^(search|look) (in|through) (the |my )?(document|file) for"
      ],
      pt: [
        "^o que (o |este |meu )?(documento|arquivo|relatório|contrato|pdf) diz",
        "^o que .+ diz sobre",
        "^de acordo com (o |este |meu )?(documento|arquivo|relatório)",
        "^baseado (no |neste |em meu )?(documento|arquivo|relatório)",
        "^(no |neste |em meu )?(documento|arquivo|relatório)",
        "^(extrair|citar|puxar) (de |do |)(o |este |meu )?(documento|arquivo)",
        "^(o que|quais?) (é|são) .+ (no|do) (o |este |meu )?(documento|arquivo)",
        "^(encontrar|obter|recuperar) .+ (no|do) (o |este |meu )?(documento|arquivo)",
        "(documento|arquivo|relatório|contrato) (diz|afirma|menciona|indica)",
        "^(me diga |explique |descreva )?(o que|como|por que|quando|onde|quem) .+ (documento|arquivo)",
        "^procurar .+ (no |em meu )?(documento|arquivo)",
        "^verificar (o |meu )?(documento|arquivo) (por|para)",
        "^(qual|quais) (informação|dados|detalhes) .+ (documento|arquivo)",
        "^(tem|existe|menciona|diz|inclui) .+ (documento|arquivo)",
        "(declarado|escrito|documentado|registrado|especificado|anotado) (no |em meu )?",
        "^(você pode |por favor )?(me diga |explique )?(o que|como) .+ (documento|arquivo)",
        "^(do|conforme|segundo) (o |este |meu )?(documento|arquivo)",
        "^(verificar|confirmar|checar) (no |do |em )?(o |meu )?(documento|arquivo)",
        "^o que (o |meu )?(documento|arquivo|pdf) (enviado )?(contém|inclui|tem)",
        "^(buscar|procurar) (no|pelo) (o |meu )?(documento|arquivo)"
      ],
      es: [
        "^qué (dice |)(el |este |mi )?(documento|archivo|informe|contrato|pdf)",
        "^qué .+ dice sobre",
        "^según (el |este |mi )?(documento|archivo|informe)",
        "^basado en (el |este |mi )?(documento|archivo|informe)",
        "^en (el |este |mi )?(documento|archivo|informe)",
        "^(extraer|citar|sacar) (de |del |)(el |este |mi )?(documento|archivo)",
        "^(qué|cuáles?) (es|son) .+ (en|del) (el |este |mi )?(documento|archivo)",
        "^(encontrar|obtener|recuperar) .+ (en|del) (el |este |mi )?(documento|archivo)",
        "(documento|archivo|informe|contrato) (dice|afirma|menciona|indica)",
        "^(dime |explica |describe )?(qué|cómo|por qué|cuándo|dónde|quién) .+ (documento|archivo)",
        "^buscar .+ en (el |mi )?(documento|archivo)",
        "^verificar (el |mi )?(documento|archivo) (por|para)",
        "^(qué|cuál) (información|datos|detalles) .+ (documento|archivo)",
        "^(hay|existe|menciona|dice|incluye) .+ (documento|archivo)",
        "(declarado|escrito|documentado|registrado|especificado|anotado) en (el |mi )?",
        "^(puedes |por favor )?(dime |explica )?(qué|cómo) .+ (documento|archivo)",
        "^(del|conforme|según) (el |este |mi )?(documento|archivo)",
        "^(verificar|confirmar|revisar) (en |del |)(el |mi )?(documento|archivo)",
        "^qué (el |mi )?(documento|archivo|pdf) (subido )?(contiene|incluye|tiene)",
        "^(buscar|revisar) (en|por) (el |mi )?(documento|archivo)"
      ]
    }
  },
  DOC_ANALYTICS: {
    priority: 75,
    patterns: {
      en: [
        "^how many (documents|files|pdfs|contracts|reports)",
        "^count (all |my |the )?(documents|files)",
        "^(what is |show |get )?(the )?(total|number of) (documents|files)",
        "^(show|display|get) (my |)(document|file) (count|statistics|stats|metrics)",
        "^(document|file|storage) (usage|analytics|statistics|metrics)",
        "^how much (storage|space|disk)",
        "^(what|show) .+ (storage|space) (used|remaining|left)",
        "^(documents|files) (uploaded|added|created) (this |)(week|month|today|yesterday)",
        "^(breakdown|distribution|percentage) (of |by )(documents|files|type)",
        "^(documents|files) by (type|category|extension|format)",
        "^(most|least|top|bottom) (uploaded|used|accessed|viewed) (documents|files)",
        "^(recent|latest|new) (uploads|documents|files)",
        "^(upload|document|file) (history|activity|log)",
        "^(trending|popular) (documents|files)",
        "^(usage|activity) (report|summary|overview)",
        "^quota (usage|remaining|status)",
        "^(growth|increase|decrease) (in |of )(documents|files)",
        "^(average|total|sum) .+ (documents|files)",
        "^(insights|analytics) (for |on |about )?(documents|files|usage)",
        "^(document|file) (insights|trends|patterns)"
      ],
      pt: [
        "^quantos (documentos|arquivos|pdfs|contratos|relatórios)",
        "^contar (todos |meus |os )?(documentos|arquivos)",
        "^(qual é |mostrar |obter )?(o )?(total|número de) (documentos|arquivos)",
        "^(mostrar|exibir|obter) (minha |)(contagem|estatísticas|métricas) de (documentos|arquivos)",
        "^(documento|arquivo|armazenamento) (uso|analytics|estatísticas|métricas)",
        "^quanto (armazenamento|espaço|disco)",
        "^(qual|mostrar) .+ (armazenamento|espaço) (usado|restante|livre)",
        "^(documentos|arquivos) (enviados|adicionados|criados) (esta |este |)(semana|mês|hoje|ontem)",
        "^(divisão|distribuição|porcentagem) (de |por )(documentos|arquivos|tipo)",
        "^(documentos|arquivos) por (tipo|categoria|extensão|formato)",
        "^(mais|menos|top) (enviados|usados|acessados|visualizados) (documentos|arquivos)",
        "^(uploads|documentos|arquivos) (recentes|últimos|novos)",
        "^(histórico|atividade|log) de (upload|documento|arquivo)",
        "^(documentos|arquivos) (populares|em alta)",
        "^(relatório|resumo|visão geral) de (uso|atividade)",
        "^(uso|status|restante) de cota",
        "^(crescimento|aumento|diminuição) (de |em )(documentos|arquivos)",
        "^(média|total|soma) .+ (documentos|arquivos)",
        "^(insights|analytics) (de |sobre )?(documentos|arquivos|uso)",
        "^(insights|tendências|padrões) de (documentos|arquivos)"
      ],
      es: [
        "^cuántos (documentos|archivos|pdfs|contratos|informes)",
        "^contar (todos |mis |los )?(documentos|archivos)",
        "^(cuál es |mostrar |obtener )?(el )?(total|número de) (documentos|archivos)",
        "^(mostrar|exhibir|obtener) (mi |)(conteo|estadísticas|métricas) de (documentos|archivos)",
        "^(documento|archivo|almacenamiento) (uso|analytics|estadísticas|métricas)",
        "^cuánto (almacenamiento|espacio|disco)",
        "^(cuál|mostrar) .+ (almacenamiento|espacio) (usado|restante|libre)",
        "^(documentos|archivos) (subidos|agregados|creados) (esta |este |)(semana|mes|hoy|ayer)",
        "^(desglose|distribución|porcentaje) (de |por )(documentos|archivos|tipo)",
        "^(documentos|archivos) por (tipo|categoría|extensión|formato)",
        "^(más|menos|top) (subidos|usados|accedidos|vistos) (documentos|archivos)",
        "^(subidas|documentos|archivos) (recientes|últimos|nuevos)",
        "^(historial|actividad|log) de (subida|documento|archivo)",
        "^(documentos|archivos) (populares|trending)",
        "^(informe|resumen|visión general) de (uso|actividad)",
        "^(uso|estado|restante) de cuota",
        "^(crecimiento|aumento|disminución) (de |en )(documentos|archivos)",
        "^(promedio|total|suma) .+ (documentos|archivos)",
        "^(insights|analytics) (de |sobre )?(documentos|archivos|uso)",
        "^(insights|tendencias|patrones) de (documentos|archivos)"
      ]
    }
  },
  DOC_MANAGEMENT: {
    priority: 70,
    patterns: {
      en: [
        "^(delete|remove) (my |the |this )?(document|file|folder) .+",
        "^(rename|change name of) (my |the |this )?(document|file|folder)",
        "^(move) (my |the |this )?(document|file) (to|into) .+",
        "^(organize|sort|arrange) (my |the |all )?(documents|files|folders)",
        "^(tag|label|mark|retag) (my |the |this )?(document|file)",
        "^(add|remove|update) (tag|label) (to|from|on) .+",
        "^(archive|unarchive) (my |the |this )?(document|file)",
        "^(restore|recover) (my |the |this |deleted )?(document|file)",
        "^(create|make|new) (a |)(new |)folder",
        "^(delete|remove) (the |this |empty )?folder",
        "^(copy|duplicate) (my |the |this )?(document|file)",
        "^(share|unshare) (my |the |this )?(document|file)",
        "^(change|set|update) permissions (for|on) .+",
        "^(replace|update) (my |the |this )?(document|file)",
        "^(merge|combine) (these |my |the )?(documents|files)",
        "^(split|separate|divide) (this |the )?(document|file)",
        "^(categorize|classify|reclassify) (my |the |this )?(document|file)",
        "^(trash|send to trash) (my |the |this )?(document|file)",
        "^(recover from|empty) (the )?trash",
        "^permanently delete"
      ],
      pt: [
        "^(excluir|remover) (meu |o |este )?(documento|arquivo|pasta) .+",
        "^(renomear|mudar nome de) (meu |o |este )?(documento|arquivo|pasta)",
        "^(mover) (meu |o |este )?(documento|arquivo) (para|em) .+",
        "^(organizar|ordenar|arrumar) (meus |os |todos )?(documentos|arquivos|pastas)",
        "^(marcar|rotular|remarcar) (meu |o |este )?(documento|arquivo)",
        "^(adicionar|remover|atualizar) (tag|rótulo) (a|de|em) .+",
        "^(arquivar|desarquivar) (meu |o |este )?(documento|arquivo)",
        "^(restaurar|recuperar) (meu |o |este |excluído )?(documento|arquivo)",
        "^(criar|fazer|nova) (uma |)pasta",
        "^(excluir|remover) (a |esta |vazia )?pasta",
        "^(copiar|duplicar) (meu |o |este )?(documento|arquivo)",
        "^(compartilhar|descompartilhar) (meu |o |este )?(documento|arquivo)",
        "^(mudar|definir|atualizar) permissões (para|de) .+",
        "^(substituir|atualizar) (meu |o |este )?(documento|arquivo)",
        "^(mesclar|combinar) (estes |meus |os )?(documentos|arquivos)",
        "^(dividir|separar) (este |o )?(documento|arquivo)",
        "^(categorizar|classificar|reclassificar) (meu |o |este )?(documento|arquivo)",
        "^(lixeira|enviar para lixeira) (meu |o |este )?(documento|arquivo)",
        "^(recuperar da|esvaziar) (a )?lixeira",
        "^excluir permanentemente"
      ],
      es: [
        "^(eliminar|quitar) (mi |el |este )?(documento|archivo|carpeta) .+",
        "^(renombrar|cambiar nombre de) (mi |el |este )?(documento|archivo|carpeta)",
        "^(mover) (mi |el |este )?(documento|archivo) (a|hacia) .+",
        "^(organizar|ordenar|arreglar) (mis |los |todos )?(documentos|archivos|carpetas)",
        "^(etiquetar|rotular|reetiquetar) (mi |el |este )?(documento|archivo)",
        "^(agregar|quitar|actualizar) (etiqueta|rótulo) (a|de|en) .+",
        "^(archivar|desarchivar) (mi |el |este )?(documento|archivo)",
        "^(restaurar|recuperar) (mi |el |este |eliminado )?(documento|archivo)",
        "^(crear|hacer|nueva) (una |)carpeta",
        "^(eliminar|quitar) (la |esta |vacía )?carpeta",
        "^(copiar|duplicar) (mi |el |este )?(documento|archivo)",
        "^(compartir|dejar de compartir) (mi |el |este )?(documento|archivo)",
        "^(cambiar|establecer|actualizar) permisos (para|de) .+",
        "^(reemplazar|actualizar) (mi |el |este )?(documento|archivo)",
        "^(fusionar|combinar) (estos |mis |los )?(documentos|archivos)",
        "^(dividir|separar) (este |el )?(documento|archivo)",
        "^(categorizar|clasificar|reclasificar) (mi |el |este )?(documento|archivo)",
        "^(papelera|enviar a papelera) (mi |el |este )?(documento|archivo)",
        "^(recuperar de|vaciar) (la )?papelera",
        "^eliminar permanentemente"
      ]
    }
  },
  DOC_SEARCH: {
    priority: 75,
    patterns: {
      en: [
        "^(find|search|locate|look for) (my |the |a |all )?(document|file|contract|report|pdf)",
        "^(find|search|locate) .+ (document|file|contract)",
        "^(show|list|display|get) (me )?(my |all |the )?(documents|files)",
        "^where (is|are) (my |the )?(document|file|contract)",
        "^(filter|sort|order) (my |the |all )?(documents|files) (by|with)",
        "^(documents|files) (with|containing|named|tagged|about|from|matching)",
        "^(documents|files) (in|from) (folder|category)",
        "^(recent|latest|new|old) (documents|files)",
        "^(my|all) (documents|files)",
        "^(do i have|is there) (a |any )?(document|file) (named|called|about)",
        "^(retrieve|pull|get) (my |the |all )?(documents|files)",
        "^(looking for|searching for|trying to find) (a |the |my )?(document|file)",
        "^(which|what) (documents|files) (have|contain|are|match)",
        "^(show|find|list) (documents|files) (that|which|where)",
        "^(documents|files) (created|uploaded|modified|added) (on|after|before|this|last)",
        "^(search|find) (for |)(documents|files) (containing|with|about) .+",
        "^(please |can you )?(find|show|list|locate) .+ (document|file)",
        "^(any|all) (documents|files) (related to|about|containing)",
        "^(i need|i want) (to find|the) (document|file)",
        "^(help me find|looking for) (a |the |my )?(document|file)"
      ],
      pt: [
        "^(encontrar|buscar|localizar|procurar) (meu |o |um |todos )?(documento|arquivo|contrato|relatório|pdf)",
        "^(encontrar|buscar|localizar) .+ (documento|arquivo|contrato)",
        "^(mostrar|listar|exibir|obter) (me )?(meus |todos |os )?(documentos|arquivos)",
        "^onde (está|estão) (meu |o )?(documento|arquivo|contrato)",
        "^(filtrar|ordenar|organizar) (meus |os |todos )?(documentos|arquivos) (por|com)",
        "^(documentos|arquivos) (com|contendo|chamados|marcados|sobre|de|correspondendo)",
        "^(documentos|arquivos) (na|da) (pasta|categoria)",
        "^(documentos|arquivos) (recentes|últimos|novos|antigos)",
        "^(meus|todos) (documentos|arquivos)",
        "^(eu tenho|existe) (um |algum )?(documento|arquivo) (chamado|sobre)",
        "^(recuperar|puxar|obter) (meus |os |todos )?(documentos|arquivos)",
        "^(procurando|buscando|tentando encontrar) (um |o |meu )?(documento|arquivo)",
        "^(quais|que) (documentos|arquivos) (têm|contêm|são|correspondem)",
        "^(mostrar|encontrar|listar) (documentos|arquivos) (que|onde)",
        "^(documentos|arquivos) (criados|enviados|modificados|adicionados) (em|após|antes|esta|última)",
        "^(buscar|encontrar) (documentos|arquivos) (contendo|com|sobre) .+",
        "^(por favor |você pode )?(encontrar|mostrar|listar|localizar) .+ (documento|arquivo)",
        "^(algum|todos) (documentos|arquivos) (relacionados a|sobre|contendo)",
        "^(eu preciso|eu quero) (encontrar|o) (documento|arquivo)",
        "^(me ajude a encontrar|procurando) (um |o |meu )?(documento|arquivo)"
      ],
      es: [
        "^(encontrar|buscar|localizar) (mi |el |un |todos )?(documento|archivo|contrato|informe|pdf)",
        "^(encontrar|buscar|localizar) .+ (documento|archivo|contrato)",
        "^(mostrar|listar|exhibir|obtener) (me )?(mis |todos |los )?(documentos|archivos)",
        "^dónde (está|están) (mi |el )?(documento|archivo|contrato)",
        "^(filtrar|ordenar|organizar) (mis |los |todos )?(documentos|archivos) (por|con)",
        "^(documentos|archivos) (con|conteniendo|llamados|etiquetados|sobre|de|que coinciden)",
        "^(documentos|archivos) (en|de) (carpeta|categoría)",
        "^(documentos|archivos) (recientes|últimos|nuevos|viejos)",
        "^(mis|todos) (documentos|archivos)",
        "^(tengo|existe) (un |algún )?(documento|archivo) (llamado|sobre)",
        "^(recuperar|sacar|obtener) (mis |los |todos )?(documentos|archivos)",
        "^(buscando|tratando de encontrar) (un |el |mi )?(documento|archivo)",
        "^(cuáles|qué) (documentos|archivos) (tienen|contienen|son|coinciden)",
        "^(mostrar|encontrar|listar) (documentos|archivos) (que|donde)",
        "^(documentos|archivos) (creados|subidos|modificados|agregados) (el|después|antes|esta|última)",
        "^(buscar|encontrar) (documentos|archivos) (conteniendo|con|sobre) .+",
        "^(por favor |puedes )?(encontrar|mostrar|listar|localizar) .+ (documento|archivo)",
        "^(algún|todos) (documentos|archivos) (relacionados con|sobre|conteniendo)",
        "^(necesito|quiero) (encontrar|el) (documento|archivo)",
        "^(ayúdame a encontrar|buscando) (un |el |mi )?(documento|archivo)"
      ]
    }
  },
  DOC_SUMMARIZE: {
    priority: 70,
    patterns: {
      en: [
        "^summarize (the |this |my )?",
        "^(give|provide|create|make|write) (me )?(a |the )?(summary|overview|recap)",
        "^(what are |list |give me )(the )?(main|key|important|core) (points|takeaways|ideas)",
        "^(tldr|tl;dr|too long)",
        "^(brief|quick|short) (summary|overview|version)",
        "^(condense|compress|shorten|abridge) (this|the|my)",
        "^(in a |)(nutshell|brief|summary)",
        "^(high level|high-level|bird.s eye) (summary|overview|view)",
        "^(executive|quick) summary",
        "^(highlights|gist|essence|bottom line) (of|from)",
        "^(recap|recapitulate|wrap up) (this|the|my)",
        "^(outline|abstract|synopsis) (of|for)",
        "^(distill|extract) (the )?(main|key|core) (points|ideas)",
        "^(what.s|what is) the (gist|essence|main point|bottom line)",
        "^(can you |please )?(summarize|sum up|condense)",
        "^(i need|give me) (a |the )?(summary|overview|tldr)",
        "^(briefly|in brief|quickly) (explain|describe|tell me)",
        "^(at a glance|overview|summary) (of|for) (the|this|my)",
        "^(shorten|make shorter|abbreviated) (version|summary)",
        "^(digest|abridged) (version|form) (of|for)"
      ],
      pt: [
        "^resumir (o |este |meu )?",
        "^(dar|fornecer|criar|fazer|escrever) (me )?(um )?resumo",
        "^(quais são |listar |me dê )(os )?(principais|importantes) (pontos|conclusões|ideias)",
        "^(tldr|muito longo)",
        "^resumo (breve|rápido|curto)",
        "^(condensar|comprimir|encurtar|abreviar) (isso|o|meu)",
        "^(em poucas palavras|em resumo|resumidamente)",
        "^(alto nível|visão geral|visão panorâmica)",
        "^resumo (executivo|rápido)",
        "^(destaques|essência|conclusão) (de|do)",
        "^(recapitular|recapitulação) (isso|o|meu)",
        "^(esboço|abstrato|sinopse) (de|para)",
        "^(destilar|extrair) (os )?(principais|centrais) (pontos|ideias)",
        "^(qual é|o que é) (a essência|o ponto principal|a conclusão)",
        "^(você pode |por favor )?(resumir|sintetizar|condensar)",
        "^(eu preciso|me dê) (um )?resumo",
        "^(brevemente|em resumo|rapidamente) (explicar|descrever|me diga)",
        "^(num relance|visão geral|resumo) (de|do|para)",
        "^(encurtar|versão curta|abreviado)",
        "^(versão resumida|forma resumida) (de|para)"
      ],
      es: [
        "^resumir (el |este |mi )?",
        "^(dar|proporcionar|crear|hacer|escribir) (me )?(un )?resumen",
        "^(cuáles son |listar |dame )(los )?(principales|importantes) (puntos|conclusiones|ideas)",
        "^(tldr|muy largo)",
        "^resumen (breve|rápido|corto)",
        "^(condensar|comprimir|acortar|abreviar) (esto|el|mi)",
        "^(en pocas palabras|en resumen|resumidamente)",
        "^(alto nivel|visión general|vista panorámica)",
        "^resumen (ejecutivo|rápido)",
        "^(aspectos destacados|esencia|conclusión) (de|del)",
        "^(recapitular|recapitulación) (esto|el|mi)",
        "^(esquema|abstracto|sinopsis) (de|para)",
        "^(destilar|extraer) (los )?(principales|centrales) (puntos|ideas)",
        "^(cuál es|qué es) (la esencia|el punto principal|la conclusión)",
        "^(puedes |por favor )?(resumir|sintetizar|condensar)",
        "^(necesito|dame) (un )?resumen",
        "^(brevemente|en resumen|rápidamente) (explicar|describir|dime)",
        "^(de un vistazo|visión general|resumen) (de|del|para)",
        "^(acortar|versión corta|abreviado)",
        "^(versión resumida|forma resumida) (de|para)"
      ]
    }
  },
  CHITCHAT: {
    priority: 40,
    patterns: {
      en: [
        "^(hello|hi|hey|howdy|yo|hiya|greetings)!?$",
        "^(good )?(morning|afternoon|evening|night)!?$",
        "^(how are you|how.s it going|how are things|what.s up|sup)\\??!?$",
        "^(how (do you do|have you been)|how.s (life|your day))\\??$",
        "^(what.s (new|happening|going on))\\??$",
        "^(bye|goodbye|good bye|see you|see ya|later|farewell)!?$",
        "^(take care|have a (good|nice|great) day)!?$",
        "^(talk|catch you|see you) later!?$",
        "^(nice|pleasure|pleased|glad) to (meet|see) you!?$",
        "^(long time no see|it.s been a while)!?$",
        "^(hope you.re (well|doing well)|hope all is well)!?$",
        "^(doing (well|good|fine)|fine,? thanks)!?$",
        "^(good to|glad to) (see you|meet you|hear from you)!?$",
        "^(hey|hi|hello) (there|friend|buddy|pal)!?$",
        "^(morning|afternoon|evening|night)!?$"
      ],
      pt: [
        "^(olá|oi|ei|eai|e aí|opa|saudações)!?$",
        "^(bom |boa )?(dia|tarde|noite|madrugada)!?$",
        "^(como (vai|você está|estás)|tudo (bem|bom)|beleza)\\??!?$",
        "^(como (vai você|tem passado)|como está a vida)\\??$",
        "^(quais as novas|o que há de novo)\\??$",
        "^(tchau|adeus|até (logo|mais)|falou|fui)!?$",
        "^(se cuida|tenha um (bom|ótimo) dia)!?$",
        "^(a gente se fala|até depois|nos falamos)!?$",
        "^(prazer|muito prazer) (em te conhecer|em conhecer)?!?$",
        "^(quanto tempo|faz tempo|há quanto tempo)!?$",
        "^(espero que (esteja bem|esteja tudo bem))!?$",
        "^(tudo (certo|tranquilo)|de boa|na paz)!?$",
        "^(bom te ver|que bom te ver)!?$",
        "^(ei|oi|olá) (aí|amigo|cara)!?$",
        "^(manhã|tarde|noite)!?$"
      ],
      es: [
        "^(hola|hey|qué tal|buenas|saludos)!?$",
        "^(buen |buenos |buenas )?(día|días|tardes|noches)!?$",
        "^(cómo (estás|te va|andas)|qué (hay|pasa|onda))\\??!?$",
        "^(cómo (has estado|va la vida)|qué (hay de nuevo|cuentas))\\??$",
        "^(qué hay de nuevo|qué está pasando)\\??$",
        "^(adiós|chao|chau|hasta (luego|pronto)|nos vemos|bye)!?$",
        "^(cuídate|que tengas (buen|lindo|un buen) día)!?$",
        "^(hablamos (luego|después)|nos vemos)!?$",
        "^(mucho gusto|encantado|un placer)!?$",
        "^(cuánto tiempo|hace mucho|tiempo sin verte)!?$",
        "^(espero que (estés bien|todo esté bien))!?$",
        "^(todo (bien|tranquilo)|muy bien|bien gracias)!?$",
        "^(qué bueno verte|me alegro de verte)!?$",
        "^(hey|hola) (amigo|amiga)!?$",
        "^(mañana|tarde|noche)!?$"
      ]
    }
  },
  META_AI: {
    priority: 45,
    patterns: {
      en: [
        "^(who|what) (are|is) (you|koda)\\??$",
        "^(who|what) (made|created|built|designed|developed) (you|koda)\\??$",
        "^are you (a |an |)(ai|artificial intelligence|bot|robot|chatbot|assistant)\\??$",
        "^are you (human|real|alive|a person|sentient|conscious)\\??$",
        "^are you (chatgpt|gpt|openai|google|gemini|claude|anthropic|bard|copilot|llama)\\??$",
        "^(what|which) (model|version|llm) (are you|is this)\\??$",
        "^what (can you do|are you capable of|do you know|are your capabilities)\\??$",
        "^(your|what are your) (capabilities|abilities|skills|functions)\\??$",
        "^how (do you work|were you (made|created|trained|built))\\??$",
        "^(do you|can you) (think|feel|have feelings|have emotions|learn)\\??$",
        "^(what is|what.s|tell me) your name\\??$",
        "^(tell me|talk) about yourself",
        "^(introduce yourself|who is koda|what is koda)",
        "^(about|info|information) (on |about )?(you|koda)",
        "^(what should i|how should i|can i) call you\\??$"
      ],
      pt: [
        "^(quem|o que) (é|são) (você|koda)\\??$",
        "^(quem|o que) (te |)(criou|fez|construiu|desenvolveu) (você|koda)?\\??$",
        "^você é (uma? |)(ia|inteligência artificial|bot|robô|chatbot|assistente)\\??$",
        "^você é (humano|real|vivo|uma pessoa|consciente|senciente)\\??$",
        "^você é (chatgpt|gpt|openai|google|gemini|claude|anthropic|bard|copilot|llama)\\??$",
        "^(qual|que) (modelo|versão|llm) (você é|é esse)\\??$",
        "^(o que você (pode fazer|é capaz de|sabe)|quais são suas capacidades)\\??$",
        "^(suas|quais são suas) (capacidades|habilidades|funções)\\??$",
        "^como (você funciona|você foi (feito|criado|treinado|construído))\\??$",
        "^(você |)(pensa|sente|tem sentimentos|tem emoções|aprende)\\??$",
        "^(qual é|me diga) seu nome\\??$",
        "^(me conte|fale) sobre você",
        "^(se apresente|quem é koda|o que é koda)",
        "^(sobre|info|informações) (sobre |de )?(você|koda)",
        "^(como (devo|posso) te chamar)\\??$"
      ],
      es: [
        "^(quién|qué) (eres|es) (tú|koda)\\??$",
        "^(quién|qué) (te |)(creó|hizo|construyó|desarrolló) (a ti|koda)?\\??$",
        "^eres (una? |)(ia|inteligencia artificial|bot|robot|chatbot|asistente)\\??$",
        "^eres (humano|real|vivo|una persona|consciente|sensible)\\??$",
        "^eres (chatgpt|gpt|openai|google|gemini|claude|anthropic|bard|copilot|llama)\\??$",
        "^(qué|cuál) (modelo|versión|llm) (eres|es este)\\??$",
        "^(qué puedes hacer|de qué eres capaz|qué sabes|cuáles son tus capacidades)\\??$",
        "^(tus|cuáles son tus) (capacidades|habilidades|funciones)\\??$",
        "^cómo (funcionas|fuiste (hecho|creado|entrenado|construido))\\??$",
        "^(tú |)(piensas|sientes|tienes sentimientos|tienes emociones|aprendes)\\??$",
        "^(cuál es|dime) tu nombre\\??$",
        "^(cuéntame|habla) sobre ti",
        "^(preséntate|quién es koda|qué es koda)",
        "^(sobre|info|información) (sobre |de )?(ti|koda)",
        "^(cómo (debo|puedo) llamarte)\\??$"
      ]
    }
  },
  FEEDBACK_POSITIVE: {
    priority: 50,
    patterns: {
      en: [
        "^(thank(s| you)|thx|ty|cheers)!?$",
        "^(thanks|thank you) (so much|a lot|very much|a bunch)!?$",
        "^(great|good|excellent|perfect|awesome|amazing|wonderful|fantastic|brilliant)!?$",
        "^(great|good|excellent|perfect|awesome) (answer|job|work|response)!?$",
        "^(helpful|very helpful|so helpful|that helps|this helps)!?$",
        "^(exactly|exactly right|spot on|on point|nailed it)!?$",
        "^(correct|that.s (correct|right)|right|yes|yep|yeah)!?$",
        "^(well done|nice|nice work|nicely done|bravo|kudos)!?$",
        "^(love it|i like it|appreciate it|much appreciated)!?$",
        "^(you.re|that.s|this is) (the best|great|awesome|amazing|helpful)!?$"
      ],
      pt: [
        "^(obrigad(o|a)|valeu|vlw|brigado)!?$",
        "^(muito |)obrigad(o|a)( mesmo| demais)?!?$",
        "^(ótimo|bom|excelente|perfeito|incrível|maravilhoso|fantástico|brilhante)!?$",
        "^(ótima|boa|excelente|perfeita) (resposta|trabalho)!?$",
        "^(útil|muito útil|super útil|isso ajuda|me ajudou)!?$",
        "^(exatamente|certinho|perfeito|na mosca)!?$",
        "^(correto|isso está (correto|certo)|certo|sim|isso|isso mesmo)!?$",
        "^(muito bem|legal|bom trabalho|bem feito|parabéns|mandou bem)!?$",
        "^(adorei|gostei|agradeço|muito agradecido)!?$",
        "^(você é|isso é|isto é) (o melhor|ótimo|incrível|maravilhoso|útil)!?$"
      ],
      es: [
        "^(gracias|muchas gracias|mil gracias)!?$",
        "^(muchas |mil |)gracias( de verdad)?!?$",
        "^(genial|bueno|excelente|perfecto|increíble|maravilloso|fantástico|brillante)!?$",
        "^(gran|buena|excelente|perfecta) (respuesta|trabajo)!?$",
        "^(útil|muy útil|súper útil|eso ayuda|me ayudó)!?$",
        "^(exactamente|perfecto|acertado|en el clavo)!?$",
        "^(correcto|eso (es correcto|está bien)|bien|sí|sip|eso es)!?$",
        "^(bien hecho|genial|buen trabajo|muy bien|bravo|felicitaciones)!?$",
        "^(me encanta|me gusta|lo aprecio|muy agradecido)!?$",
        "^(eres|eso es|esto es) (el mejor|genial|increíble|maravilloso|útil)!?$"
      ]
    }
  },
  FEEDBACK_NEGATIVE: {
    priority: 50,
    patterns: {
      en: [
        "^(wrong|incorrect|not (correct|right))!?$",
        "^(that.s|this is|you.re) (wrong|incorrect|not right)!?$",
        "^(bad|poor|terrible|awful|horrible) (answer|response|job)!?$",
        "^(useless|not (helpful|useful)|unhelpful|didn.t help)!?$",
        "^(mistake|error|you made a (mistake|error))!?$",
        "^(not what i (asked|wanted|meant)|missed the point)!?$",
        "^(inaccurate|not accurate|misleading|false|not true)!?$",
        "^(fail|failed|failure|garbage|trash|nonsense)!?$",
        "^(doesn.t|does not|makes no) (make sense|sense)!?$",
        "^(ridiculous|absurd|stupid|dumb)!?$"
      ],
      pt: [
        "^(errado|incorreto|não (está correto|está certo))!?$",
        "^(isso é|isso está|você está) (errado|incorreto|não certo)!?$",
        "^(má|ruim|terrível|horrível|péssima) (resposta|trabalho)!?$",
        "^(inútil|não (ajudou|é útil)|sem utilidade|não ajuda)!?$",
        "^(erro|engano|você cometeu um (erro|engano))!?$",
        "^(não foi o que eu (pedi|queria|quis dizer)|perdeu o ponto)!?$",
        "^(impreciso|não é preciso|enganoso|falso|não é verdade)!?$",
        "^(falhou|falha|lixo|sem sentido)!?$",
        "^(não faz|não tem) sentido!?$",
        "^(ridículo|absurdo|estúpido|burro)!?$"
      ],
      es: [
        "^(mal|incorrecto|no (es correcto|está bien))!?$",
        "^(eso es|eso está|estás) (mal|incorrecto|equivocado)!?$",
        "^(mala|pobre|terrible|horrible|pésima) (respuesta|trabajo)!?$",
        "^(inútil|no (ayudó|es útil)|sin utilidad|no ayuda)!?$",
        "^(error|equivocación|cometiste un (error|equivocación))!?$",
        "^(no es lo que (pedí|quería|quise decir)|perdiste el punto)!?$",
        "^(impreciso|no es preciso|engañoso|falso|no es verdad)!?$",
        "^(falló|falla|basura|sin sentido)!?$",
        "^no (tiene|hace) sentido!?$",
        "^(ridículo|absurdo|estúpido|tonto)!?$"
      ]
    }
  },
  SAFETY_CONCERN: {
    priority: 95,
    patterns: {
      en: [
        "(hack|exploit|crack|bypass) .*(password|security|system|firewall|account|server)",
        "(steal|leak|dump|extract) .*(data|credentials|information|passwords|database)",
        "(ddos|dos|attack|flood|overload) .*(server|website|network|system|service)",
        "(malware|virus|trojan|ransomware|spyware|keylogger)",
        "(phishing|spoof|fake|fraudulent) .*(email|website|page|login|form)",
        "(inject|injection).*(sql|code|script|command|payload)",
        "(xss|cross.?site|csrf)",
        "(brute.?force|dictionary.?attack|rainbow.?table)",
        "how to (hack|crack|bypass|steal|attack|exploit|break into)",
        "(create|make|build|write) .*(malware|virus|exploit|backdoor|rootkit)"
      ],
      pt: [
        "(hackear|explorar|quebrar|burlar) .*(senha|segurança|sistema|firewall|conta|servidor)",
        "(roubar|vazar|extrair) .*(dados|credenciais|informação|senhas|banco de dados)",
        "(ddos|dos|atacar|inundar|sobrecarregar) .*(servidor|site|rede|sistema|serviço)",
        "(malware|vírus|trojan|ransomware|spyware|keylogger)",
        "(phishing|falsificar|falso|fraudulento) .*(email|site|página|login|formulário)",
        "(injetar|injeção).*(sql|código|script|comando|payload)",
        "(xss|cross.?site|csrf)",
        "(força.?bruta|ataque.?dicionário|rainbow.?table)",
        "como (hackear|quebrar|burlar|roubar|atacar|explorar|invadir)",
        "(criar|fazer|construir|escrever) .*(malware|vírus|exploit|backdoor|rootkit)"
      ],
      es: [
        "(hackear|explotar|crackear|evadir) .*(contraseña|seguridad|sistema|firewall|cuenta|servidor)",
        "(robar|filtrar|extraer) .*(datos|credenciales|información|contraseñas|base de datos)",
        "(ddos|dos|atacar|inundar|sobrecargar) .*(servidor|sitio|red|sistema|servicio)",
        "(malware|virus|troyano|ransomware|spyware|keylogger)",
        "(phishing|falsificar|falso|fraudulento) .*(email|sitio|página|login|formulario)",
        "(inyectar|inyección).*(sql|código|script|comando|payload)",
        "(xss|cross.?site|csrf)",
        "(fuerza.?bruta|ataque.?diccionario|rainbow.?table)",
        "cómo (hackear|crackear|evadir|robar|atacar|explotar|entrar)",
        "(crear|hacer|construir|escribir) .*(malware|virus|exploit|backdoor|rootkit)"
      ]
    }
  },
  MULTI_INTENT: {
    priority: 85,
    patterns: {
      en: [
        ".+ (and also|and then|plus|additionally|in addition|as well) .+",
        ".+ (also|as well as|together with|along with|besides) .+",
        "^(first|1st|one) .+ (then|and|2nd|second|two) .+",
        ".+ (but also|while also|and at the same time) .+",
        ".+ (after that|afterwards|subsequently|next|then) .+"
      ],
      pt: [
        ".+ (e também|e depois|mais|adicionalmente|além disso|assim como) .+",
        ".+ (também|junto com|junto de|além de) .+",
        "^(primeiro|1o|um) .+ (depois|e|2o|segundo|dois) .+",
        ".+ (mas também|e ao mesmo tempo) .+",
        ".+ (depois disso|em seguida|subsequentemente|próximo|então) .+"
      ],
      es: [
        ".+ (y también|y luego|además|adicionalmente|además de|así como) .+",
        ".+ (también|junto con|junto a|aparte de) .+",
        "^(primero|1ro|uno) .+ (luego|y|2do|segundo|dos) .+",
        ".+ (pero también|y al mismo tiempo) .+",
        ".+ (después de eso|enseguida|subsecuentemente|siguiente|entonces) .+"
      ]
    }
  }
};

// Validation function
function validatePatterns(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  let totalPatterns = 0;
  let validPatterns = 0;

  for (const [intentName, intent] of Object.entries(generatedPatterns)) {
    if (!intent.patterns) continue;

    for (const [lang, patterns] of Object.entries(intent.patterns)) {
      for (const pattern of patterns) {
        totalPatterns++;
        try {
          new RegExp(pattern, 'i');
          validPatterns++;
        } catch (e: any) {
          errors.push(`[${intentName}][${lang}] Invalid regex: "${pattern}" - ${e.message}`);
        }
      }
    }
  }

  console.log(`\n========================================`);
  console.log(`REGEX VALIDATION RESULTS`);
  console.log(`========================================`);
  console.log(`Total patterns: ${totalPatterns}`);
  console.log(`Valid patterns: ${validPatterns}`);
  console.log(`Invalid patterns: ${errors.length}`);
  console.log(`Success rate: ${((validPatterns / totalPatterns) * 100).toFixed(2)}%`);
  console.log(`========================================\n`);

  if (errors.length > 0) {
    console.log(`ERRORS:`);
    errors.forEach((err, i) => console.log(`${i + 1}. ${err}`));
  } else {
    console.log(`All regex patterns are valid!`);
  }

  return { valid: errors.length === 0, errors };
}

// Test patterns against sample inputs
function testPatternsWithSamples(): void {
  const samples = {
    DOC_QA: [
      'what does the document say about pricing',
      'according to the report what is the revenue',
      'based on the contract who is responsible'
    ],
    DOC_ANALYTICS: [
      'how many documents do i have',
      'count all my files',
      'show document statistics'
    ],
    CHITCHAT: [
      'hello',
      'hi',
      'good morning',
      'how are you'
    ],
    SAFETY_CONCERN: [
      'hack the password',
      'steal data from database',
      'ddos attack the server'
    ]
  };

  console.log(`\n========================================`);
  console.log(`PATTERN MATCHING TESTS`);
  console.log(`========================================\n`);

  for (const [intentName, testCases] of Object.entries(samples)) {
    const intent = generatedPatterns[intentName];
    if (!intent?.patterns?.en) continue;

    console.log(`\n[${intentName}]`);
    for (const testCase of testCases) {
      let matched = false;
      let matchedPattern = '';

      for (const pattern of intent.patterns.en) {
        try {
          const regex = new RegExp(pattern, 'i');
          if (regex.test(testCase)) {
            matched = true;
            matchedPattern = pattern;
            break;
          }
        } catch (e) {
          // Skip invalid patterns
        }
      }

      console.log(`  "${testCase}" => ${matched ? '✓ MATCH' : '✗ NO MATCH'}${matched ? ` (${matchedPattern.substring(0, 40)}...)` : ''}`);
    }
  }
}

// Run validation
validatePatterns();
testPatternsWithSamples();
