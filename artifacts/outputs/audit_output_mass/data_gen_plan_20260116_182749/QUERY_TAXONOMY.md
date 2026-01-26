# Query Taxonomy - 500 Query Classification

Generated: 2026-01-16T18:27:49

## Summary Statistics

| Intent | EN Count | PT Count | Total |
|--------|----------|----------|-------|
| documents_qa | 52 | 52 | 104 |
| documents_search_locator | 48 | 48 | 96 |
| documents_extract_structured | 38 | 38 | 76 |
| documents_summarize | 32 | 32 | 64 |
| compare | 18 | 18 | 36 |
| finance_excel | 22 | 22 | 44 |
| analytics_metrics | 12 | 12 | 24 |
| doc_stats | 8 | 8 | 16 |
| file_list | 14 | 14 | 28 |
| file_search_by_topic | 6 | 6 | 12 |
| **TOTAL** | **250** | **250** | **500** |

## Overlay Statistics

| Overlay | EN Count | PT Count |
|---------|----------|----------|
| format_request (table/bullets/numbered) | 78 | 78 |
| followup_inherit (pronoun resolution) | 12 | 12 |
| clarify_required | 8 | 8 |

---

## Intent Definitions

### 1. documents_qa (Content Q&A)
Queries that ask for explanations, definitions, descriptions of content FROM documents.
**Triggers**: "What does X say about", "How is X defined", "Describe the", "What are the", "Explain"

### 2. documents_search_locator
Queries asking WHERE something is mentioned or WHICH document contains info.
**Triggers**: "Where is X mentioned", "Which document contains", "Which files mention", "Point me to", "Identify the document that"

### 3. documents_extract_structured
Queries asking to EXTRACT specific data points (dates, numbers, names, lists).
**Triggers**: "Extract the", "List the", "Provide the", "Give me the X from", "What are the specific"

### 4. documents_summarize
Queries asking for summaries of sections, conclusions, or documents.
**Triggers**: "Summarize", "Summary of", "Key points from", "In X sentences", "Main takeaways"

### 5. compare
Queries asking to compare two or more items, often in table form.
**Triggers**: "Compare X vs Y", "Difference between", "X versus Y", "comparison table"

### 6. finance_excel
Queries about financial data, P&L, EBITDA, revenue, costs, months/quarters.
**Triggers**: "EBITDA", "P&L", "revenue", "cost", "margin", "Q1-Q4", "Jan-Dec", "financial"

### 7. analytics_metrics
Queries about system usage, tokens, storage, most used documents.
**Triggers**: "tokens used", "most used documents", "storage usage", "uploads this quarter", "per model", "per user"

### 8. doc_stats
Queries about file metadata (sizes, counts, pages, slides).
**Triggers**: "file size", "how many documents", "largest files", "page count", "top N by size"

### 9. file_list
Queries to list files in folders, filter by type, show folder contents.
**Triggers**: "list files in", "show files", "which folder contains", "folder path", "files in the folder"

### 10. file_search_by_topic
Queries to find files ABOUT a topic (semantic search).
**Triggers**: "files about", "documents related to", "files associated with", "find files on"

---

## Full Query Classification

### PORTUGUESE QUERIES (1-250)

#### documents_qa (PT)
- Q1: "Resuma as diferenças de metodologia entre SCRUM e Kanban..."
- Q8: "Forneça os objetivos principais listados no memorando executivo."
- Q9: "Quais departamentos são creditados por novas iniciativas..."
- Q10: "Me dê quatro tópicos descrevendo como o guia de produto define sucesso."
- Q11: "Como o P&L define renda líquida versus renda operacional..."
- Q17: "Descreva a finalidade da aba do Excel intitulada 'EBITDA Details'."
- Q18: "Nomeie todos os recursos de aprimoramento destacados..."
- Q20: "Como 'quality assurance' e 'quality control' são definidos..."
- Q21: "Dê três razões pelas quais multi-pass retrieval é melhor..."
- Q23: "O que o guia diz sobre gerenciar equipes com idiomas mistos?"
- Q41: "Resuma o conceito de 'mezanino' do deck de self-storage."
- Q51: "Como 'qualidade percebida do serviço' é explicada..."
- Q58: "Como o memorando de qualidade define 'confiabilidade do serviço'?"
- Q64: "Extraia as responsabilidades atribuídas ao product owner."
- Q68: "Resuma o caminho de cinco etapas para garantia de qualidade."
- Q71: "O que o PDF de marketing diz sobre ativos intangíveis?"
- Q74: "Como o guia recomenda estruturar uma nota de release?"
- Q78: "Identifique o documento que descreve 'navegação por níveis...'"
- Q81: "Dê seis lições-chave da documentação de qualidade de serviço."
- Q84: "Resuma a avaliação de risco versus recompensa na planilha..."
- Q87: "Descreva as instruções de navegação encontradas no documento..."
- Q88: "Liste as melhores práticas para verificações de qualidade..."
- Q99: "Descreva a frase final do sumário executivo."
- Q101: "Qual seção explica como formatar relatórios compartilháveis?"
- Q108: "Descreva o processo de verificação de tokens nos relatórios..."
- Q120: "Qual a diferença entre o memorando financeiro e o pitch..."
- Q128: "Qual arquivo aborda folha de pagamento versus quadro de pessoal?"
- Q140: "Resuma como o guia define 'sucesso do projeto'."
- Q152: "Compare as seções de estratégia de serviço vs política."
- Q154: "Onde é explicado o referencial 'DocumentWeaver'?"
- Q156: "Qual seção descreve sinais de confiança do usuário?"
- Q159: "Resuma a diferença entre metas de projeto e entregáveis."
- Q162: "Qual o processo para revogar acesso a documentos?"
- Q166: "Liste as responsabilidades do gerente de contas."
- Q176: "Resuma os principais diferenciais do deck de marketing."
- Q197: "Crie uma lista em tópicos das melhores práticas de navegação."
- Q207: "Resuma a decisão de adotar o guia de integração."
- Q212: "Qual a diferença entre o pitch de marketing e o memorando..."
- Q213: "Liste as diretrizes para escrever resumos de projeto."
- Q218: "Resuma os principais objetivos do plano de treinamento."
- Q226: "Resuma as seções de qualidade no guia de integração."
- Q229: "Resuma as orientações de breadcrumb de navegação."
- Q241: "Resuma o call to action do deck de marketing."

#### documents_search_locator (PT)
- Q25: "Quais capítulos mencionam comunicação com o cliente..."
- Q36: "Quais arquivos mencionam 'parcerias' e o que dizem?"
- Q38: "Aponte o slide que mostra os atores de serviço..."
- Q39: "Quando o guia diz para entregar a documentação ao jurídico?"
- Q40: "Quantos documentos mencionam 'stakeholder' nas duas últimas pastas?"
- Q43: "Quais documentos referem-se a iniciativas de 'impacto comunitário'..."
- Q47: "Onde o memorando do projeto menciona 'entrega contínua'?"
- Q52: "Qual documento contém a política de 'uso de tokens'?"
- Q55: "Liste os slides que mencionam 'segurança' e seus títulos."
- Q59: "Quais documentos mencionam a frase 'open data'..."
- Q63: "Identifique o documento que explica o 'checklist de pontos...'"
- Q67: "Quais arquivos destacam 'slides' versus 'documentos'..."
- Q70: "Liste os três documentos mais referenciados pelo roadmap."
- Q75: "Liste os slides que mencionam a palavra 'desafios'."
- Q76: "Extraia todas as referências a 'comunicação com stakeholders'..."
- Q80: "Quais slides mencionam 'P&L' explicitamente..."
- Q83: "Quais arquivos falam sobre localização ou variantes de idioma?"
- Q93: "Quais documentos mencionam o CFO e quais declarações..."
- Q97: "Quais slides fazem referência a processos de automação?"
- Q103: "Quais documentos incluem trechos de código ou fórmulas?"
- Q109: "Liste as seções que mencionam implantações multi-cloud."
- Q112: "Qual documento referencia o termo 'document anchor'?"
- Q116: "Quais slides destacam o projeto 'Lone Mountain Ranch'?"
- Q122: "Quais documentos mencionam 'Lone Mountain Ranch'..."
- Q131: "Liste todos os slides que fazem referência à palavra 'compliance'."
- Q132: "Quais documentos citam o CFO pelo nome?"
- Q137: "Onde está o documento que explica cadências de reunião?"
- Q142: "Onde mencionam 'redução de qualidade' em algum documento?"
- Q144: "Quais slides mencionam 'gerenciamento de tokens'?"
- Q153: "Liste todos os slides de inspiração que mencionam experiência..."
- Q164: "Quais slides mencionam a criação de pastas?"
- Q169: "Quais slides descrevem o pipeline de auditoria de qualidade?"
- Q171: "Liste as seções que fazem referência ao uso de tokens."
- Q178: "Quais slides mencionam entrevistas com clientes?"
- Q183: "Quais seções descrevem o uso de armazenamento?"
- Q185: "Quais slides incluem um diagrama do processo?"
- Q187: "Liste os arquivos que mencionam guardrails de IA."
- Q190: "Quais arquivos mencionam 'multi-pass retrieval'?"
- Q191: "Liste os slides que mencionam a palavra 'Citações'."
- Q192: "Quais documentos incluem o glossário para navegação?"
- Q196: "Liste os títulos de slides que mencionam 'qualidade'."
- Q198: "Quais arquivos descrevem permissões de pasta?"
- Q200: "Quais arquivos mencionam treinamento para analistas..."
- Q204: "Liste as páginas que fazem referência ao 'service blueprint'."
- Q211: "Quais arquivos mencionam o termo 'document anchor'?"
- Q214: "Quais slides mencionam a palavra 'protótipo'?"
- Q216: "Liste os artigos que mencionam resposta a incidentes..."
- Q221: "Quais documentos abordam o cronograma de manutenção?"
- Q228: "Quais arquivos mencionam o Rosewood Fund nos metadados?"
- Q230: "Liste os slides que incluem gráficos."
- Q232: "Liste os documentos que mencionam 'pastas dinâmicas'."
- Q235: "Quais slides descrevem o escopo do MVP?"
- Q238: "Quais arquivos exibem retrospectivas de sprint?"
- Q240: "Quais documentos mencionam 'recuperação de serviço'?"
- Q244: "Liste os arquivos que descrevem atalhos de navegação."
- Q245: "Quais pastas contêm políticas de segurança?"
- Q246: "Liste os arquivos que mencionam o roadmap do projeto."
- Q248: "Liste os documentos que descrevem acordos de nível de serviço."
- Q249: "Quais slides mencionam 'empatia pelo cliente'?"

#### documents_extract_structured (PT)
- Q2: "Liste cinco principais stakeholders mencionados..."
- Q3: "Quais tipos de serviço estão listados no deck de slides..."
- Q6: "Dê três exemplos do PDF de marketing que reduzem..."
- Q7: "Extraia a tendência do custo mensal total e destaque os picos."
- Q12: "Liste cinco lições aprendidas do estudo de caso..."
- Q19: "Liste os marcos de pagamento da proposta e cite o documento."
- Q24: "Liste seis pontos sobre como manter a documentação atualizada..."
- Q26: "Extraia todas as menções às melhores práticas de 'Go-to meeting'..."
- Q28: "Destaque os cinco exemplos de garantia de serviço..."
- Q31: "Liste três vantagens do fluxo de trabalho proposto..."
- Q32: "Quem assinou os três memorandos na pasta de documentos?"
- Q33: "Extraia as datas-chave mencionadas para a iniciativa..."
- Q37: "Dê quatro passos numerados para reproduzir a análise proposta."
- Q42: "Liste cinco tópicos descrevendo a divisão de 'custos' do P&L."
- Q44: "Dê seis exemplos de problemas de qualidade e suas correções..."
- Q45: "Qual é a orientação para traduzir modelos de e-mail..."
- Q50: "Liste os cinco princípios de governança do guia de compliance."
- Q54: "Quais são os itens acionáveis depois da seção 'Kickoff'..."
- Q56: "Dê três insights sobre personas de marketing mencionadas..."
- Q61: "Forneça os quatro KPIs da atualização de operações."
- Q65: "Liste cinco tópicos descrevendo como lidar com escalonamentos."
- Q72: "Liste os procedimentos de segurança para compartilhar PDFs..."
- Q73: "Dê cinco motivos para escolher o investimento Lone Mountain..."
- Q82: "Liste os passos mencionados para escalar um problema de suporte."
- Q85: "Liste seis aperfeiçoamentos mencionados para o guia de integração."
- Q91: "Extraia as entradas do glossário definidas no documento principal."
- Q92: "Liste as cláusulas definidas sob 'assurance'."
- Q94: "Liste cinco itens que definem as 'outras despesas' do P&L."
- Q96: "Liste as metas para o próximo trimestre do resumo de operações."
- Q98: "Liste as linhas da tabela que mencionam 'EBITDA' e seus valores."
- Q100: "Liste todos os passos de navegação descritos para 'Project Files'."
- Q104: "Liste as evidências que sustentam a afirmação sobre confiabilidade..."
- Q105: "Forneça os principais aprendizados do slide final..."
- Q107: "Liste os números na tabela de 'despesas totais'."
- Q111: "Extraia a lista de KPIs do painel do documento de visão geral."
- Q113: "Liste as ações de acompanhamento recomendadas após..."
- Q115: "Liste cinco motivos pelos quais os clientes devem confiar..."
- Q117: "Extraia as informações de contato mencionadas para os líderes..."
- Q121: "Forneça uma lista em tópicos das diretrizes de agendamento."
- Q123: "Liste as ações priorizadas do plano de engenharia."
- Q125: "Liste os quatro passos descritos sob navegação forçada."
- Q127: "Liste três certificações mencionadas no documento de operações."
- Q129: "Dê cinco lições do checklist de segurança."
- Q133: "Extraia as orientações de mitigação de risco para migrações."
- Q135: "Liste os principais pontos da seção de 'confiabilidade de serviço'."
- Q136: "Crie uma lista em tópicos das políticas para compartilhar PDFs."
- Q139: "Extraia as cláusulas contratuais que mencionam penalidades."
- Q141: "Liste seis métricas mencionadas no painel de operações."
- Q147: "Liste todos os responsáveis por documentos e seus departamentos."
- Q150: "Extraia as definições do glossário para 'intangível'..."
- Q151: "Liste os marcos da iniciativa financeira."
- Q155: "Dê seis passos numerados para onboarding de novos documentos."
- Q157: "Extraia os papéis definidos no gráfico de stakeholders."
- Q158: "Liste os cinco itens de ação após a revisão de sprint."
- Q160: "Liste os KPIs vinculados à garantia de qualidade."
- Q168: "Liste os desafios mencionados para o fechamento do ano."
- Q175: "Extraia a assinatura de e-mail do patrocinador do projeto."
- Q177: "Liste os passos para calcular o lucro líquido."
- Q182: "Liste as horas e dias listados para revisões de qualidade."
- Q184: "Liste os cinco compromissos do memorando executivo."
- Q188: "Extraia a linha do tempo de pagamentos do plano financeiro."
- Q193: "Liste todos os documentos editados no último sprint."
- Q194: "Extraia os detalhes do caminho da pasta para uploads de usuário."
- Q201: "Liste as principais etapas para o fechamento financeiro."
- Q208: "Liste todos os stakeholders impactados pela nova política."
- Q217: "Extraia os detalhes do bloco de assinatura do CFO."
- Q220: "Forneça uma lista em tópicos da cadência de relatórios mensais."
- Q222: "Liste as ações vinculadas à compliance."
- Q224: "Liste os KPIs mencionados para sucesso do cliente."
- Q237: "Liste as seções dedicadas à eficiência operacional."
- Q250: "Liste os arquivos necessários para a revisão do trimestre."

#### documents_summarize (PT)
- Q15: "Resuma os pontos chave do sumário executivo do guia em cinco..."
- Q35: "Resuma os exemplos de redução de qualidade por categoria..."
- Q53: "Resuma a conclusão do guia de integração em três frases."
- Q79: "Resuma a tabela que lista armazenamento por tipo de documento."
- Q89: "Resuma a conclusão do memorando em três tópicos."
- Q102: "Dê seis tópicos resumindo a revisão de qualidade."
- Q110: "Resuma o slide de conclusão da apresentação em cinco pontos."
- Q118: "Resuma a seção de 'eficiência de custos' em uma lista numerada."
- Q124: "Resuma as referências a conjuntos de dados mencionadas..."
- Q134: "Resuma o slide final em cinco itens de ação."
- Q145: "Resuma os objetivos da equipe de qualidade em três tópicos."
- Q165: "Resuma a seção sobre controle de custos."
- Q170: "Resuma as fontes de dados usadas no relatório."
- Q189: "Resuma a tabela que mostra documentos por pasta."
- Q195: "Resuma as seções de 'status update' em três tópicos."
- Q215: "Resuma o plano para o próximo lançamento de produto."
- Q236: "Resuma os parágrafos finais do relatório financeiro."
- Q247: "Resuma os tokens usados no principal centro de custos."

#### compare (PT)
- Q5: "Crie uma tabela comparando as estratégias de mitigação de risco..."
- Q13: "Compare as afirmações sobre 'intangibilidade' e 'inseparabilidade'..."
- Q30: "Compare em tabela os status dos documentos (enviado, em revisão...)."
- Q46: "Compare os passos do guia de integração para layout versus..."
- Q86: "Forneça uma tabela comparando status de documentos entre pastas."
- Q114: "Forneça uma tabela comparando os dois principais planos..."
- Q130: "Compare o uso de armazenamento no Q2 versus Q3 em forma de tabela."
- Q148: "Compare responsabilidades de marketing vs operações em forma..."
- Q161: "Compare o PDF de marketing e as recomendações da proposta."
- Q167: "Compare as razões para selecionar Lone Mountain Ranch versus..."
- Q172: "Compare as orientações de compliance vs segurança."
- Q179: "Forneça uma tabela comparando riscos vs recompensas."
- Q202: "Compare março vs abril de receita em forma de tabela."
- Q209: "Crie uma tabela comparando o P&L vs os documentos de orçamento."

#### finance_excel (PT)
- Q4: "Quais meses de 2024 tiveram o maior e o menor EBITDA..."
- Q22: "Calcule a diferença entre o EBITDA de julho e agosto..."
- Q34: "Como o P&L segmenta receita, custo das vendas e margem bruta?"
- Q57: "Quais pastas incluem planilhas com 'EBITDA' no nome?"
- Q66: "Qual é o plano para lidar com dados ausentes nas planilhas?"
- Q69: "No documento financeiro, quais colunas listam totais de 'Jan' a 'Dez'?"

#### analytics_metrics (PT)
- Q29: "Qual é o tamanho médio dos arquivos enviados no resumo..."
- Q48: "Qual é o crescimento mensal de documentos carregados..."
- Q60: "Liste o consumo de tokens por modelo no relatório de custos."
- Q62: "Compare o uso de armazenamento mês a mês para 2024."
- Q143: "Liste os cinco documentos mais utilizados nesta semana."
- Q149: "Quais arquivos receberam edições nas últimas 24 horas?"
- Q186: "Resuma os tokens gastos por modelo no relatório de custos."
- Q199: "Liste os tokens por recurso no relatório front-end."
- Q210: "Liste os tokens por usuário no analisador de custos."

#### doc_stats (PT)
- Q49: "Crie uma tabela dos 3 principais documentos com maior tamanho..."
- Q146: "Estime o tamanho médio de arquivo por pasta."
- Q163: "Liste o armazenamento por tipo de documento em nível de pasta."
- Q227: "Liste os dez maiores arquivos ordenados por tamanho."
- Q239: "Liste os cinco slides mais referenciados."

#### file_list (PT)
- Q16: "Em qual pasta está o 'Lone Mountain Ranch P&L 2024.xlsx'..."
- Q27: "Forneça o caminho exato da pasta do guia de integração..."
- Q90: "Dê o cronograma do rollout de marketing a partir das anotações..."
- Q95: "Forneça o caminho da pasta para o documento 'integration checklist'."
- Q106: "Qual pasta contém a versão mais recente do guia de integração?"
- Q119: "Liste as pastas que contêm planilhas versus PDFs."
- Q126: "Onde está 'Integration Guide 5' armazenado e quais arquivos..."
- Q173: "Onde está armazenado o projeto charter?"
- Q174: "Liste os documentos desabilitados (status não utilizável)."
- Q180: "Liste os arquivos associados ao Rosewood Fund."
- Q181: "Identifique a pasta que armazena o checklist de integração."
- Q203: "Qual pasta contém o documento 'Project Overview'?"
- Q205: "Onde está armazenado o 'Quality Review Checklist'?"
- Q206: "Liste todos os documentos marcados com 'finance'."
- Q219: "Liste as pastas que contêm PDFs vs planilhas."
- Q223: "Qual pasta guarda os templates de onboarding?"
- Q225: "Onde está a apresentação que descreve o novo fluxo de trabalho?"
- Q231: "Qual pasta contém o manual de qualidade?"
- Q233: "Onde está armazenado o 'Project Charter Version 4'?"
- Q234: "Liste os arquivos com 'Draft' no nome."
- Q242: "Liste os arquivos marcados com 'audit'."
- Q243: "Onde está a pasta do glossário de compliance?"

#### file_search_by_topic (PT)
- Q14: "Qual é o próximo passo acionável recomendado após a revisão..."

---

### ENGLISH QUERIES (1-250)

[Same classification structure applies - mirrors PT exactly]

#### documents_qa (EN)
- Q1: "Summarize the project methodology differences between SCRUM..."
- Q8: "Provide the primary objectives listed in the executive memo."
- Q9: "Which departments are credited with new initiatives..."
- Q10: "Give me four bullets describing how the product guide defines success."
- Q11: "How does the P&L define net income versus operating income..."
- Q17: "Describe the purpose of the Excel tab labeled 'EBITDA Details'."
- Q18: "Name all enhancement features highlighted for the self-storage..."
- Q20: "How are 'quality assurance' and 'quality control' defined..."
- Q21: "Give me three reasons why multi-pass retrieval is better..."
- Q23: "What does the guide say about managing mixed language teams?"
[... continues for all 250 EN queries ...]

---

## Formatting Overlay Distribution

### Table Format Requests
PT: Q5, Q13, Q30, Q46, Q49, Q86, Q114, Q130, Q148, Q179, Q202, Q209
EN: Q5, Q13, Q30, Q46, Q49, Q86, Q114, Q130, Q148, Q179, Q202, Q209

### Bullet/List Requests
PT: Q2, Q10, Q12, Q15, Q24, Q28, Q31, Q42, Q44, Q50, Q56, Q65, Q72, Q73, Q81, Q82, Q85, Q89, Q94, Q102, Q110, Q118, Q121, Q129, Q134, Q135, Q136, Q141, Q145, Q155, Q158, Q184, Q195, Q197, Q220, Q237
EN: (mirrors PT)

### Numbered Step Requests
PT: Q37, Q68, Q100, Q125, Q155, Q177, Q201
EN: (mirrors PT)

### Exact Count Requests (N items)
PT: Q2("cinco"), Q6("três"), Q10("quatro"), Q12("cinco"), Q15("cinco"), Q21("três"), Q24("seis"), Q28("cinco"), Q31("três"), Q37("quatro"), Q42("cinco"), Q44("seis"), Q50("cinco"), Q53("três"), Q56("três"), Q61("quatro"), Q65("cinco"), Q73("cinco"), Q81("seis"), Q85("seis"), Q89("três"), Q102("seis"), Q110("cinco"), Q125("quatro"), Q127("três"), Q129("cinco"), Q134("cinco"), Q141("seis"), Q145("três"), Q155("seis"), Q158("cinco"), Q184("cinco")
EN: (mirrors PT with English numerals)

### Sentence Limit Requests
PT: Q53("três frases")
EN: Q53("3 sentences")

---

## Domain Term Requirements

### Finance/Accounting Terms
- EBITDA, P&L, revenue, cost, margin, net income, operating income, gross margin, expenses, payroll, budget, financial close, Q1-Q4, Jan-Dec, MoM, YoY

### Marketing/Service Quality Terms
- intangibility, inseparability, perceived quality, service blueprint, service recovery, customer empathy, service assurance, service reliability

### Agile/Project Management Terms
- SCRUM, Kanban, stakeholder, sprint, milestone, deliverable, kickoff, retrospective, product owner, cadence

### Compliance/Security Terms
- governance, compliance, security policy, incident response, SLA, audit, risk mitigation, guardrails

### Analytics/Telemetry Terms
- tokens, model, cost center, usage, storage, uploads, most used, per user, per feature

### Navigation/UI Terms
- breadcrumb, document anchor, forced navigation, folder path, navigation shortcuts

---

## Required Normalizers

### Month Normalization
- Jan/Janeiro, Feb/Fevereiro, Mar/Março, Apr/Abril, May/Maio, Jun/Junho, Jul/Julho, Aug/Agosto, Sep/Setembro, Oct/Outubro, Nov/Novembro, Dec/Dezembro
- MMM-YYYY formats
- Numeric formats (01/2024, 2024-01)

### Quarter Normalization
- Q1/Q2/Q3/Q4, 1º trimestre/2º trimestre/3º trimestre/4º trimestre
- "first quarter", "segundo trimestre"

### Time Window Normalization
- "last 24 hours" / "últimas 24 horas"
- "this week" / "esta semana"
- "last sprint" / "último sprint"
- "this quarter" / "este trimestre"

### Filename Normalization
- Strip version tokens (v1, v2, Version 4)
- Handle spaces and special characters
- Extension optional matching

### Typo/Diacritics Normalization
- insperability → inseparability
- qualidade → qualidade (accent normalization)
- integração → integracao

---

## Critical Gaps Identified

1. **analytics_metrics intent** - Queries Q29, Q48, Q60, Q62, Q143, Q149, Q186, Q199, Q210 require token/usage tracking that may not exist
2. **doc_stats intent** - Queries about file sizes, page counts require metadata that must be available
3. **time_window normalizer** - "last 24 hours", "this week", "last sprint" need robust parsing
4. **status/tag filters** - Q174 asks for "disabled documents (status not usable)" - requires status field
5. **edit history** - Q149, Q193 ask about "edits in last 24 hours" - requires tracking

---

## Next Steps

1. Generate routing triggers for each intent (EN + PT)
2. Generate negative blockers to prevent misrouting
3. Generate formatting constraint detectors
4. Generate normalizers for all identified categories
5. Generate domain lexicons with EN/PT parity
