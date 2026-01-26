# KODA Fallback System - Complete Frontend Output Test

> This document shows the **EXACT messages** users see in the frontend when fallback responses are triggered.

> **Test Date:** 2025-12-03T21:10:15.189Z
> **Total Test Cases:** 50

---

## 1. KNOWLEDGE QUERIES

### Test 1: No documents uploaded

**User Query:** `What is the total revenue for Q4?`

**Context:**
- Documents: 0 (none)
- Fallback Type: `knowledge`
- Confidence: 1
- Reason: No documents uploaded

**Frontend Output (What User Sees):**

```
"I've looked for the Q4 revenue information, but I haven't been able to find any documents in your account to search through. To help me answer your question, you could:

*   Upload the financial documents that contain your Q4 revenue data.
*   Try rephrasing your question once the documents are uploaded. For example, you could ask "Summarize the Q4 financial performance."

Once you've uploaded the relevant documents, I can analyze them to find the specific revenue figure you're looking for. Please upload your documents, and I'll be ready to assist you."
```

### Test 2: Documents exist but specific info not found

**User Query:** `What is the CEO salary?`

**Context:**
- Documents: 5 (Budget_2024.xlsx, Q4_Report.pdf, Meeting_Notes.docx)
- Fallback Type: `knowledge`
- Confidence: 0.9
- Reason: No relevant information found in documents

**Frontend Output (What User Sees):**

```
"I looked through the Budget_2024.xlsx, Q4_Report.pdf, and Meeting_Notes.docx documents, but I couldn't find the CEO's specific salary information. However, I can potentially help you with related information. Would you be interested in:

*   Searching for information about overall executive compensation mentioned in the Q4 report?
*   Trying a broader search for "executive pay" or "leadership compensation" within the documents?
*   Uploading a document that specifically outlines executive compensation packages?

Let me know if you'd like to try any of these options."
```

### Test 3: Looking for specific date not in documents

**User Query:** `What happened on March 15th, 2024?`

**Context:**
- Documents: 3 (Annual_Report.pdf, Q4_Summary.xlsx)
- Fallback Type: `knowledge`
- Confidence: 0.9
- Reason: No relevant information found in documents

**Frontend Output (What User Sees):**

```
"I searched through your Annual Report and Q4 Summary for information about events on March 15th, 2024, but unfortunately, I didn't find anything specific to that date. However, I can help you with:

*   Summarizing key events mentioned in the Annual Report.
*   Analyzing financial data presented in the Q4 Summary.
*   Searching for information related to the general time period around March 2024 within these documents.

Would you like to try one of these options, or perhaps the information is located in a different document?"
```

### Test 4: Asking about person not mentioned

**User Query:** `What did John Smith say in the meeting?`

**Context:**
- Documents: 4 (Meeting_Notes.docx, Team_Update.pdf)
- Fallback Type: `knowledge`
- Confidence: 0.9
- Reason: No relevant information found in documents

**Frontend Output (What User Sees):**

```
"I've reviewed the Meeting_Notes.docx and Team_Update.pdf files, but I didn't find specific quotes or statements attributed to John Smith.

Perhaps the information is recorded under a different name or in a different context. Alternatively, I can:

*   Search for mentions of specific topics discussed in the meeting to see if John Smith's contributions are indirectly referenced.
*   Look for action items assigned to John Smith, which might indicate his involvement or responsibilities discussed.

Would you like me to try searching using keywords from the meeting agenda, or is there another document you think might contain this information?"
```

### Test 5: Looking for specific product not in docs

**User Query:** `What are the specifications for Product XYZ?`

**Context:**
- Documents: 3 (Product_Catalog.pdf, Sales_Data.xlsx)
- Fallback Type: `knowledge`
- Confidence: 0.9
- Reason: No relevant information found in documents

**Frontend Output (What User Sees):**

```
"I've looked through your Product Catalog and Sales Data documents but didn't find specific specifications for Product XYZ. However, I can help you with:

- Summarizing the key features and benefits of products listed in the Product Catalog.
- Analyzing sales trends related to different products in the Sales Data.
- Identifying products with similar names or functionalities in the Product Catalog.

Perhaps the specifications are located in a document with a different name, or you could try phrasing your request as 'What are the features of Product XYZ?' Would you like me to try one of these alternatives, or is there another document I should review?"
```

### Test 6: Asking about department not covered

**User Query:** `What is the HR policy on remote work?`

**Context:**
- Documents: 2 (Finance_Policy.pdf, IT_Guidelines.docx)
- Fallback Type: `knowledge`
- Confidence: 0.9
- Reason: No relevant information found in documents

**Frontend Output (What User Sees):**

```
"I've looked through both the Finance Policy and IT Guidelines documents, but I couldn't find specific details about the HR policy on remote work.

While I don't have that specific information, I can potentially assist you with other related topics. For example, I can search the documents for information about:

*   The IT guidelines regarding remote access and security.
*   Any policies related to employee expenses incurred while working remotely (if applicable in the Finance Policy).

Alternatively, you could upload the relevant HR policy document so I can help you find the information you need. Would you like me to search for one of those related topics, or would you prefer to upload the HR policy?"
```

### Test 7: Historical data not available

**User Query:** `What were the sales figures for 2019?`

**Context:**
- Documents: 3 (Sales_2023.xlsx, Sales_2024.xlsx)
- Fallback Type: `knowledge`
- Confidence: 0.9
- Reason: No relevant information found in documents

**Frontend Output (What User Sees):**

```
"I looked through the 'Sales_2023.xlsx' and 'Sales_2024.xlsx' documents you provided, but I didn't find sales figures specifically for 2019. I can, however, provide you with the sales figures from those documents. Alternatively, you could try rephrasing your request to focus on 2023 or 2024 sales data. If the 2019 figures are in a different document, please upload it, and I can search within that as well. Would you like me to proceed with finding sales data from the available documents?"
```

### Test 8: Technical spec not in documents

**User Query:** `What is the API rate limit?`

**Context:**
- Documents: 2 (User_Guide.pdf, FAQ.docx)
- Fallback Type: `knowledge`
- Confidence: 0.9
- Reason: No relevant information found in documents

**Frontend Output (What User Sees):**

```
"I've looked through both User_Guide.pdf and FAQ.docx but couldn't find specific details regarding the API rate limit. However, I can help you with other information related to the API.

Perhaps the rate limit is mentioned in the context of a specific API function; could you tell me which function you're interested in? Alternatively, if you have a separate document detailing API specifications or usage policies, uploading it would allow me to search for the rate limit information directly.

Would you like me to look for information about a specific API function, or would you like to upload another document?"
```

### Test 9: Contact info not found

**User Query:** `What is the vendor contact email?`

**Context:**
- Documents: 4 (Invoice_001.pdf, Contract.pdf, Terms.docx)
- Fallback Type: `knowledge`
- Confidence: 0.9
- Reason: No relevant information found in documents

**Frontend Output (What User Sees):**

```
"I've reviewed the Invoice_001.pdf, Contract.pdf, and Terms.docx documents, but I couldn't locate the vendor contact email address.

However, I might be able to help you find other vendor information. I can search for:

*   The vendor's physical address, which might be listed in the Contract.pdf.
*   Specific clauses related to vendor communication outlined in the Terms.docx.

Alternatively, could you provide a document that specifically contains vendor contact details, such as a purchase order or a contact list? Let me know if you'd like me to try searching for something else!"
```

### Test 10: Metric not tracked in documents

**User Query:** `What is the customer churn rate?`

**Context:**
- Documents: 3 (Revenue_Report.xlsx, Growth_Metrics.pdf)
- Fallback Type: `knowledge`
- Confidence: 0.9
- Reason: No relevant information found in documents

**Frontend Output (What User Sees):**

```
"I've reviewed the Revenue_Report.xlsx and Growth_Metrics.pdf documents, but I didn't find specific data on customer churn rate within them.

However, I can potentially help if we approach this differently. I could analyze the 'Growth_Metrics.pdf' to identify trends in customer acquisition and retention which might indirectly relate to churn. Alternatively, is there another document, perhaps a 'Customer_Analysis.pdf' or similar, that contains customer churn data that you could upload?

Would you like me to analyze the growth metrics for customer acquisition and retention trends, or would you prefer to upload another document?"
```


---

## 2. CLARIFICATION QUERIES

### Test 11: Vague pronoun - it

**User Query:** `What does it say?`

**Context:**
- Documents: 5 (Report_A.pdf, Report_B.pdf, Budget.xlsx, Notes.docx)
- Fallback Type: `clarification`
- Confidence: 0.9
- Reason: Query uses vague pronoun without clear referent

**Frontend Output (What User Sees):**

```
I want to help you find what you're looking for. The word "it" isn't specific enough for me to understand which document you're referring to.

Could you clarify which document you're asking about? For example:

* Are you asking about what it says in `Report_A.pdf`?
* Are you asking about what it says in `Report_B.pdf`?
* Or, is it something in `Budget.xlsx` or `Notes.docx`?

Please let me know which document you're interested in.
```

### Test 12: Vague pronoun - this

**User Query:** `Can you explain this?`

**Context:**
- Documents: 4 (Analysis.pdf, Summary.docx, Data.xlsx)
- Fallback Type: `clarification`
- Confidence: 0.9
- Reason: Query uses vague pronoun without clear referent

**Frontend Output (What User Sees):**

```
I want to help you understand the information you're looking for. The word "this" is a little unclear, as you've uploaded a few documents.

To help me answer your question, could you please specify:

*   Are you referring to something in the "Analysis.pdf" document?
*   Are you asking about something specifically within the "Summary.docx" document?
*   Or are you perhaps referring to the "Data.xlsx" spreadsheet?

Please let me know which document you're interested in so I can assist you better!
```

### Test 13: Vague pronoun - that

**User Query:** `What does that mean?`

**Context:**
- Documents: 3 (Report.pdf, Guide.docx)
- Fallback Type: `clarification`
- Confidence: 0.9
- Reason: Query uses vague pronoun without clear referent

**Frontend Output (What User Sees):**

```
"I want to help you understand what you're asking about. The word 'that' isn't specific enough for me to know what you're referring to.

To help me understand, could you tell me:
* Are you referring to something in the 'Report.pdf' document?
* Are you referring to something in the 'Guide.docx' document?
* Or is it something else entirely?

Please let me know so I can assist you better!"
```

### Test 14: Vague pronoun - they

**User Query:** `What did they decide?`

**Context:**
- Documents: 4 (Board_Minutes.pdf, Team_Notes.docx, Action_Items.xlsx)
- Fallback Type: `clarification`
- Confidence: 0.9
- Reason: Query uses vague pronoun without clear referent

**Frontend Output (What User Sees):**

```
I want to help you find out what decisions were made. The pronoun "they" is a little unclear; could you tell me who you're referring to?

To help me narrow it down, are you interested in the decisions made by:

*   The board, as documented in `Board_Minutes.pdf`?
*   The team, as noted in `Team_Notes.docx`?
*   Or are you looking for the decisions related to specific action items listed in `Action_Items.xlsx`?

Let me know which one you're interested in, and I'll do my best to find the answer!
```

### Test 15: Generic document reference

**User Query:** `What is in the document?`

**Context:**
- Documents: 10 (Finance_Report.pdf, Sales_Data.xlsx, HR_Policy.docx, Marketing_Plan.pdf, Budget_2024.xlsx)
- Fallback Type: `clarification`
- Confidence: 0.85
- Reason: Generic document reference with multiple documents available

**Frontend Output (What User Sees):**

```
I want to help you find out what's in the document you're asking about. To give you the most accurate answer, could you please clarify which document you're referring to, as you have several available?

*   Are you interested in the Finance Report, Sales Data, HR Policy, Marketing Plan, or Budget 2024?
*   Or, are you looking for something specific within one of those documents?

Let me know which document you'd like me to analyze!
```

### Test 16: Generic file reference

**User Query:** `Summarize the file`

**Context:**
- Documents: 6 (Doc1.pdf, Doc2.xlsx, Doc3.docx, Doc4.pdf)
- Fallback Type: `clarification`
- Confidence: 0.85
- Reason: Generic document reference with multiple documents available

**Frontend Output (What User Sees):**

```
I'm happy to summarize a file for you. To make sure I summarize the correct one, could you please clarify which file you're referring to?

You have several documents available, including:
* Doc1.pdf
* Doc2.xlsx
* Doc3.docx
* Doc4.pdf

Which of these files would you like me to summarize? Or are you perhaps referring to a different file?
```

### Test 17: Incomplete question - what about

**User Query:** `What about`

**Context:**
- Documents: 3 (Report.pdf, Summary.docx)
- Fallback Type: `clarification`
- Confidence: 0.8
- Reason: Incomplete or context-dependent question

**Error:** [GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent: [429 Too Many Requests] Resource exhausted. Please try again later. Please refer to https://cloud.google.com/vertex-ai/generative-ai/docs/error-code-429 for more details.

### Test 18: Incomplete question - how about

**User Query:** `How about`

**Context:**
- Documents: 3 (Data.xlsx, Analysis.pdf)
- Fallback Type: `clarification`
- Confidence: 0.8
- Reason: Incomplete or context-dependent question

**Frontend Output (What User Sees):**

```
I want to help you figure out what you'd like to know. The phrase "How about" is a little open-ended, and I need a bit more context to understand what you're looking for.

Could you clarify what you're asking about? For example, are you wondering:

*   "How about the information in Data.xlsx?"
*   "How about the analysis in Analysis.pdf?"
*   "How about a specific topic within either Data.xlsx or Analysis.pdf?"

Please provide a little more detail so I can assist you better!
```

### Test 19: Very short ambiguous query

**User Query:** `Revenue`

**Context:**
- Documents: 5 (Q1_Revenue.xlsx, Q2_Revenue.xlsx, Annual_Report.pdf)
- Fallback Type: `clarification`
- Confidence: 0.7
- Reason: Ambiguous term "revenue" could mean multiple things

**Frontend Output (What User Sees):**

```
"I want to help you find the revenue information you're looking for. The term 'revenue' can refer to different periods or sources.

To help me find the right information, could you clarify:

*   Are you interested in revenue from a specific quarter, like Q1 or Q2 (referring to the 'Q1_Revenue.xlsx' or 'Q2_Revenue.xlsx' files)?
*   Or are you looking for annual revenue, perhaps as found in the 'Annual_Report.pdf'?

Please let me know which specific revenue data you need."
```

### Test 20: Ambiguous term - costs

**User Query:** `Show me the costs`

**Context:**
- Documents: 4 (Operating_Costs.xlsx, Capital_Expenses.pdf, Budget.xlsx)
- Fallback Type: `clarification`
- Confidence: 0.7
- Reason: Ambiguous term "cost" could mean multiple things

**Frontend Output (What User Sees):**

```
I want to help you find the cost information you're looking for. The word "costs" can refer to different things, so could you clarify which type of costs you're interested in?

*   Are you looking for the day-to-day expenses from the Operating_Costs.xlsx file?
*   Or perhaps the longer-term investments detailed in the Capital_Expenses.pdf file?
*   Alternatively, are you interested in the planned spending outlined in the Budget.xlsx file?

Once I know which type of costs you need, I can find the information for you.
```


---

## 3. REFUSAL - REAL-TIME DATA

### Test 21: Current stock price

**User Query:** `What is the current stock price of Apple?`

**Context:**
- Documents: 5 (Portfolio.xlsx, Investment_Analysis.pdf)
- Fallback Type: `refusal`
- Confidence: 0.9
- Reason: Request requires real-time data not available in documents

**Frontend Output (What User Sees):**

```
"I understand you're looking for the current stock price of Apple. Unfortunately, I'm designed to analyze documents and don't have access to real-time stock market data.

However, with the 5 documents you provided, I could potentially help you by:

*   Identifying key financial insights related to Apple within those documents.
*   Summarizing any mentions of Apple's performance or market position.
*   Comparing information about Apple across the different documents.

Would you like me to focus on any of those document analysis tasks instead?"
```

### Test 22: Today's weather

**User Query:** `What is today's weather in New York?`

**Context:**
- Documents: 3 (Travel_Plan.pdf)
- Fallback Type: `refusal`
- Confidence: 0.9
- Reason: Request requires real-time data not available in documents

**Frontend Output (What User Sees):**

```
"I understand you'd like to know the current weather in New York. While I'm not able to provide real-time weather updates, I can definitely assist you with information within the documents you've provided.

I can help you by:

*   Analyzing any weather-related data that might be mentioned in your 3 documents.
*   Summarizing sections of the documents that discuss climate or weather patterns.
*   Comparing different mentions of weather conditions across the documents.

Would you like me to focus on any of those aspects within your documents?"
```

### Test 23: Latest news

**User Query:** `What is the latest news about Tesla?`

**Context:**
- Documents: 4 (Market_Analysis.pdf)
- Fallback Type: `refusal`
- Confidence: 0.9
- Reason: Request requires real-time data not available in documents

**Frontend Output (What User Sees):**

```
"I understand you're interested in getting the latest news about Tesla. While I'm not equipped to provide real-time news updates, I can definitely help you with other aspects of document analysis.

Given your four documents, I could:

*   Summarize the key information about Tesla mentioned across all four documents.
*   Identify and compare different perspectives on Tesla presented within those documents.
*   Extract specific data points related to Tesla from the documents, such as financial figures or market analysis.

Would you like me to try any of those options for you?"
```

### Test 24: Live data feed

**User Query:** `Show me live cryptocurrency prices`

**Context:**
- Documents: 2 (Crypto_Portfolio.xlsx)
- Fallback Type: `knowledge`
- Confidence: 0.9
- Reason: No relevant information found in documents

**Frontend Output (What User Sees):**

```
"I've looked through your documents for live cryptocurrency prices, but I couldn't find that specific real-time data. However, I can:

- Show you the cryptocurrency holdings currently listed in your Crypto_Portfolio.xlsx document.
- Help you analyze the historical performance of the cryptocurrencies listed in your portfolio, if that data is included in the file.
- Suggest searching for information on specific cryptocurrencies if you can tell me which ones you're interested in.

Would you like me to show you the holdings in your portfolio, analyze historical performance (if the data is present), or refine your search with specific cryptocurrencies?"
```

### Test 25: Current exchange rate

**User Query:** `What is the current USD to EUR exchange rate?`

**Context:**
- Documents: 3 (International_Invoice.pdf)
- Fallback Type: `knowledge`
- Confidence: 0.9
- Reason: No relevant information found in documents

**Frontend Output (What User Sees):**

```
"I checked your documents for the current USD to EUR exchange rate, but this specific information wasn't included. However, I did find your International Invoice, which might contain related financial details.

Perhaps you could try rephrasing your question to focus on specific currencies mentioned in the invoice, or upload a document specifically detailing exchange rates. Would you like me to analyze the International Invoice for currency-related information it *does* contain?"
```


---

## 4. REFUSAL - EXTERNAL ACTIONS

### Test 26: Send email

**User Query:** `Send an email to John about the quarterly report`

**Context:**
- Documents: 5 (Q4_Report.pdf, Contact_List.xlsx)
- Fallback Type: `refusal`
- Confidence: 0.95
- Reason: Request requires external action beyond document analysis

**Frontend Output (What User Sees):**

```
"I understand you'd like me to send an email to John about the quarterly report. Unfortunately, I'm not able to send emails directly.

However, I can definitely help you with the content of that email! I could:

*   Summarize the key findings of the quarterly report for you to include in your email.
*   Extract specific data points from the report that you need to highlight.
*   Compare the results in this report to the other documents you've provided to identify trends.

Would any of those options be helpful in preparing your email?"
```

### Test 27: Book meeting

**User Query:** `Book a meeting for tomorrow at 2pm with the team`

**Context:**
- Documents: 3 (Team_Calendar.xlsx)
- Fallback Type: `refusal`
- Confidence: 0.95
- Reason: Request requires external action beyond document analysis

**Frontend Output (What User Sees):**

```
"I understand you'd like me to book a meeting for your team tomorrow at 2pm. While I can't directly schedule meetings, which is outside my document analysis capabilities, I can definitely assist you with other tasks related to your documents.

I can help you:

*   Summarize the key discussion points relevant to the team across all three documents.
*   Identify any conflicting information or overlapping topics within them.
*   Extract a list of action items mentioned in the documents.

Would analyzing your documents in any of these ways be helpful in preparing for your meeting?"
```

### Test 28: Make payment

**User Query:** `Make a payment of $500 to vendor ABC`

**Context:**
- Documents: 4 (Invoice_ABC.pdf, Payment_History.xlsx)
- Fallback Type: `refusal`
- Confidence: 0.95
- Reason: Request requires external action beyond document analysis

**Frontend Output (What User Sees):**

```
"I understand you'd like me to make a payment of $500 to vendor ABC. Unfortunately, I'm designed to analyze documents and can't directly process financial transactions.

However, with the 4 documents you have, I can help in other ways:

*   I can analyze those documents to find any relevant information about vendor ABC, such as invoices or payment terms.
*   I can also compare information about vendor ABC across all four documents to identify any discrepancies.
*   If any of the documents are receipts, I can extract key details like amounts and dates.

Let me know if you'd like me to focus on any of these document analysis tasks!"
```

### Test 29: Delete file

**User Query:** `Delete the old budget file`

**Context:**
- Documents: 5 (Budget_2023.xlsx, Budget_2024.xlsx)
- Fallback Type: `refusal`
- Confidence: 0.95
- Reason: Request requires external action beyond document analysis

**Error:** [GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent: [429 Too Many Requests] Resource exhausted. Please try again later. Please refer to https://cloud.google.com/vertex-ai/generative-ai/docs/error-code-429 for more details.

### Test 30: Rename file

**User Query:** `Rename my budget file to budget_final.xlsx`

**Context:**
- Documents: 3 (budget.xlsx, expenses.xlsx)
- Fallback Type: `refusal`
- Confidence: 0.95
- Reason: Request requires external action beyond document analysis

**Frontend Output (What User Sees):**

```
"I understand you'd like to rename your budget file. While I can't directly modify files on your system, I can definitely help you with the content of your documents.

Since you have three documents, I could:

*   Analyze the data within your budget file to identify key trends.
*   Compare the budget against other relevant documents you have.
*   Summarize the key findings from your budget document into a concise overview.

Would you like me to help with any of those tasks instead?"
```

### Test 31: Move file

**User Query:** `Move the report to the archive folder`

**Context:**
- Documents: 4 (Report_2024.pdf, Archive_Index.xlsx)
- Fallback Type: `clarification`
- Confidence: 0.85
- Reason: Generic document reference with multiple documents available

**Error:** [GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent: [429 Too Many Requests] Resource exhausted. Please try again later. Please refer to https://cloud.google.com/vertex-ai/generative-ai/docs/error-code-429 for more details.

### Test 32: Create new document

**User Query:** `Create a new spreadsheet for tracking expenses`

**Context:**
- Documents: 2 (Template.xlsx)
- Fallback Type: `knowledge`
- Confidence: 0.9
- Reason: No relevant information found in documents

**Error:** [GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent: [429 Too Many Requests] Resource exhausted. Please try again later. Please refer to https://cloud.google.com/vertex-ai/generative-ai/docs/error-code-429 for more details.

### Test 33: Set reminder

**User Query:** `Set a reminder to review the contract next week`

**Context:**
- Documents: 3 (Contract.pdf)
- Fallback Type: `refusal`
- Confidence: 0.95
- Reason: Request requires external action beyond document analysis

**Frontend Output (What User Sees):**

```
"I understand you'd like me to set a reminder to review the contract next week. While I'm not able to manage reminders, I can definitely help you with aspects of the document itself.

Since you have those three documents, I could:

*   Summarize each contract to give you a quick overview of the key points.
*   Compare specific clauses across all three contracts to highlight any differences.
*   Analyze the contracts for potential risks or areas of concern.

Would you like me to help with any of those options?"
```

### Test 34: Call someone

**User Query:** `Call the client about the proposal`

**Context:**
- Documents: 2 (Proposal.pdf, Client_Info.docx)
- Fallback Type: `refusal`
- Confidence: 0.95
- Reason: Request requires external action beyond document analysis

**Error:** [GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent: [429 Too Many Requests] Resource exhausted. Please try again later. Please refer to https://cloud.google.com/vertex-ai/generative-ai/docs/error-code-429 for more details.

### Test 35: Download from internet

**User Query:** `Download the latest financial report from SEC`

**Context:**
- Documents: 3 (Financial_Analysis.pdf)
- Fallback Type: `refusal`
- Confidence: 0.95
- Reason: Request requires external action beyond document analysis

**Frontend Output (What User Sees):**

```
"I understand you're looking to download the latest financial report from the SEC. Unfortunately, I don't currently have the capability to directly access external websites and download files.

However, I'd be happy to help in other ways with the documents you've provided. I can:

*   Summarize the key findings within those documents.
*   Compare the financial information presented across them.
*   Analyze the sentiment expressed in the reports regarding specific topics.

Would you like me to analyze those documents for you?"
```


---

## 5. REFUSAL - OPINIONS

### Test 36: Personal opinion on investment

**User Query:** `Do you think this is a good investment?`

**Context:**
- Documents: 4 (Investment_Analysis.pdf, Risk_Assessment.xlsx)
- Fallback Type: `refusal`
- Confidence: 0.85
- Reason: Request asks for personal opinion, not document analysis

**Frontend Output (What User Sees):**

```
"I understand you're looking for an opinion on whether this is a good investment. While I can't provide financial advice, I can definitely help you analyze the four documents you have.

Specifically, I can:

*   Summarize the key information and arguments presented in each document.
*   Compare and contrast the information across all four documents to identify potential trends or discrepancies.
*   Extract specific data points or figures that might be relevant to your investment decision.

Would you like me to proceed with any of these analyses to help you better understand the information within your documents?"
```

### Test 37: Preference question

**User Query:** `Which option do you prefer?`

**Context:**
- Documents: 3 (Options_Comparison.pdf)
- Fallback Type: `refusal`
- Confidence: 0.85
- Reason: Request asks for personal opinion, not document analysis

**Frontend Output (What User Sees):**

```
"I understand you're looking for my preference based on those documents. While I'm not designed to make subjective choices, I can definitely help you understand the information within them.

Instead of choosing a preference, I can:

*   Summarize the key points of each of the 3 documents for you.
*   Compare and contrast the information presented in the documents.
*   Identify any common themes or conflicting information across them.

Would you like me to try any of those options to help you analyze the documents' content?"
```

### Test 38: Market prediction

**User Query:** `Will the stock market crash next year?`

**Context:**
- Documents: 2 (Market_Trends.pdf)
- Fallback Type: `knowledge`
- Confidence: 0.9
- Reason: No relevant information found in documents

**Frontend Output (What User Sees):**

```
"I've reviewed your documents, specifically Market_Trends.pdf, but couldn't find information projecting a stock market crash next year. However, I can offer some alternatives:

*   I can analyze the historical market trends detailed in Market_Trends.pdf to identify potential risk factors or patterns.
*   Perhaps reframing your question to focus on specific sectors or economic indicators within the document might provide relevant insights.
*   If you have other documents containing economic forecasts or expert opinions, uploading those would allow me to search for a more direct answer.

Would you like me to try analyzing the existing market trends, or would you prefer to upload additional documents?"
```

### Test 39: Future forecast

**User Query:** `Predict the revenue for next quarter`

**Context:**
- Documents: 4 (Revenue_History.xlsx, Growth_Trends.pdf)
- Fallback Type: `refusal`
- Confidence: 0.7
- Reason: Request asks for prediction beyond document content

**Frontend Output (What User Sees):**

```
"I understand you're hoping to get a revenue prediction for next quarter. While I'm not equipped to predict future revenue based on market trends, I can definitely help you with your documents.

With the 4 documents you have, I can:

*   Summarize key financial data points within each document.
*   Compare and contrast revenue information across the documents to identify trends.
*   Help you extract specific financial figures you're interested in.

Would you like me to help with any of these tasks?"
```

### Test 40: Belief question

**User Query:** `What do you believe is the best strategy?`

**Context:**
- Documents: 3 (Strategy_Doc.pdf, Options.docx)
- Fallback Type: `refusal`
- Confidence: 0.85
- Reason: Request asks for personal opinion, not document analysis

**Error:** [GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent: [429 Too Many Requests] Resource exhausted. Please try again later. Please refer to https://cloud.google.com/vertex-ai/generative-ai/docs/error-code-429 for more details.


---

## 6. CALCULATION QUERIES

### Test 41: Sum without documents

**User Query:** `What is the sum of all expenses?`

**Context:**
- Documents: 0 (none)
- Fallback Type: `knowledge`
- Confidence: 1
- Reason: No documents uploaded

**Error:** [GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent: [429 Too Many Requests] Resource exhausted. Please try again later. Please refer to https://cloud.google.com/vertex-ai/generative-ai/docs/error-code-429 for more details.

### Test 42: Average without relevant data

**User Query:** `What is the average salary in the company?`

**Context:**
- Documents: 2 (Revenue.xlsx, Expenses.pdf)
- Fallback Type: `knowledge`
- Confidence: 0.9
- Reason: No relevant information found in documents

**Frontend Output (What User Sees):**

```
"I looked through your Revenue.xlsx and Expenses.pdf documents, but I couldn't find specific details regarding average employee salary within the company. However, I can help you in other ways. I can:

- Analyze your expense data to identify personnel costs, which might give you a partial view of salary-related spending.
- Help you calculate revenue per employee if you have employee headcount data elsewhere.
- Search for specific job titles or employee names within the documents if you think salary information might be associated with those.

Would you like me to try any of these alternatives, or perhaps you could upload a document that contains salary information, such as a payroll report or HR document?"
```

### Test 43: Percentage calculation - no data

**User Query:** `What percentage of revenue comes from product A?`

**Context:**
- Documents: 0 (none)
- Fallback Type: `knowledge`
- Confidence: 1
- Reason: No documents uploaded

**Error:** [GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent: [429 Too Many Requests] Resource exhausted. Please try again later. Please refer to https://cloud.google.com/vertex-ai/generative-ai/docs/error-code-429 for more details.

### Test 44: Growth rate - missing historical data

**User Query:** `What is the year-over-year growth rate?`

**Context:**
- Documents: 1 (Current_Year.xlsx)
- Fallback Type: `knowledge`
- Confidence: 0.9
- Reason: No relevant information found in documents

**Error:** [GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent: [429 Too Many Requests] Resource exhausted. Please try again later. Please refer to https://cloud.google.com/vertex-ai/generative-ai/docs/error-code-429 for more details.

### Test 45: Comparison calculation - one doc missing

**User Query:** `How much did Q4 revenue increase compared to Q3?`

**Context:**
- Documents: 1 (Q4_Report.pdf)
- Fallback Type: `knowledge`
- Confidence: 0.9
- Reason: No relevant information found in documents

**Frontend Output (What User Sees):**

```
"I looked through the Q4_Report.pdf document but didn't find a direct comparison of Q4 revenue to Q3 revenue. However, I can help you with the following:

- I can extract the Q4 revenue figure from the Q4_Report.pdf.
- I can look for any mentions of Q3 revenue *within* the Q4_Report.pdf, though it may not be a direct comparison.
- If you have a separate Q3 report, or a document containing both Q3 and Q4 revenue, uploading it would allow me to directly calculate the increase.

Would you like me to extract the Q4 revenue, search for mentions of Q3 within the document, or would you like to upload another document?"
```


---

## 7. FILE QUERIES

### Test 46: Find non-existent file

**User Query:** `Where is contract_2025.pdf?`

**Context:**
- Documents: 5 (Budget.xlsx, Report.pdf, Notes.docx, Summary.pdf)
- Fallback Type: `knowledge`
- Confidence: 0.9
- Reason: No relevant information found in documents

**Frontend Output (What User Sees):**

```
"I've looked through your available documents, including Budget.xlsx, Report.pdf, Notes.docx, and Summary.pdf, but I couldn't locate a file named 'contract_2025.pdf'.

While I don't see that specific contract, I can help you with related information. Perhaps the details you're looking for are similar to those in the Report.pdf or possibly summarized in the Budget.xlsx.

Alternatively, if you have access to the 'contract_2025.pdf' file, uploading it would allow me to directly answer your questions about its contents.

Would you like me to search the available documents for related contract information, or would you like to upload the 'contract_2025.pdf' file?"
```

### Test 47: List files when none exist

**User Query:** `Show me all my documents`

**Context:**
- Documents: 0 (none)
- Fallback Type: `knowledge`
- Confidence: 1
- Reason: No documents uploaded

**Frontend Output (What User Sees):**

```
"I've searched for your documents, but it appears you haven't uploaded any yet. To help me show you your documents, you'll need to upload them first. Alternatively, if you're looking for sample documents or examples of what the system can do, I can provide those. You can also review the "Help" section for instructions on how to upload and manage your documents. Would you like me to show you the "Help" section or provide sample documents?"
```

### Test 48: Find file with wrong name

**User Query:** `Open the sales spreadsheet`

**Context:**
- Documents: 3 (Revenue.xlsx, Budget.xlsx, Expenses.xlsx)
- Fallback Type: `knowledge`
- Confidence: 0.9
- Reason: No relevant information found in documents

**Frontend Output (What User Sees):**

```
"I looked through your Revenue, Budget, and Expenses spreadsheets, but I didn't find a document specifically named 'sales spreadsheet.'

However, I can access the data within these spreadsheets. Would you like me to:

*   Summarize the revenue information from the Revenue.xlsx file?
*   Check if the Budget.xlsx file contains any sales projections or related data?
*   Perhaps you could upload a document labeled 'Sales Spreadsheet' if it's stored elsewhere?

Let me know if you'd like to try one of these options!"
```

### Test 49: Find file from different year

**User Query:** `Find the 2020 annual report`

**Context:**
- Documents: 3 (Annual_Report_2023.pdf, Annual_Report_2024.pdf)
- Fallback Type: `knowledge`
- Confidence: 0.9
- Reason: No relevant information found in documents

**Frontend Output (What User Sees):**

```
"I searched your 3 documents for the 2020 annual report, but I didn't find it among them. I do have the 2023 and 2024 annual reports available, which might contain related information or trends of interest. Alternatively, you could try phrasing your request to focus on a specific area covered in those reports, such as revenue or key performance indicators. If the 2020 report is available, uploading it would allow me to find the exact information you need. Would you like to explore the available reports or try a different search?"
```

### Test 50: Find file by content that doesn't exist

**User Query:** `Find the document about employee benefits`

**Context:**
- Documents: 4 (Finance_Policy.pdf, IT_Security.docx, Travel_Policy.pdf)
- Fallback Type: `clarification`
- Confidence: 0.85
- Reason: Generic document reference with multiple documents available

**Frontend Output (What User Sees):**

```
"I want to help you find the document about employee benefits. Since there are several possibilities, could you clarify which document you're looking for?

To help me narrow it down, are you perhaps looking for:

*   A document specifically related to Finance Policy, as in Finance_Policy.pdf?
*   Or are you looking for a document related to Travel Policy, as in Travel_Policy.pdf?

Please let me know which document you need, and I'll be happy to find it for you."
```

---

## Summary

| Metric | Value |
|--------|-------|
| Total Tests | 50 |
| Passed | 41 |
| Failed | 9 |

### Tests by Category

| Category | Count |
|----------|-------|
| KNOWLEDGE QUERIES | 10 |
| CLARIFICATION QUERIES | 10 |
| REFUSAL - REAL-TIME DATA | 5 |
| REFUSAL - EXTERNAL ACTIONS | 10 |
| REFUSAL - OPINIONS | 5 |
| CALCULATION QUERIES | 5 |
| FILE QUERIES | 5 |

---

*Generated by Koda Fallback Test Suite*