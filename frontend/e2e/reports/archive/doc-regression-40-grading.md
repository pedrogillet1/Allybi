# 40-Query Document Regression Report

**Date:** 2026-03-10T13:52:46.998Z  
**Account:** test@allybi.com  
**API Base:** http://localhost:5000  
**Conversations:** 4 (per-group)  
**Documents:** ReserveRequirements_PrimaryRules.pdf, Trade_Act_of_1974__19._U.S._C.____2101_-_2497b__.pdf, br373pt_1.pdf, us423en.pdf  

## Per-Document Scores

| Document | Avg Score | PASS | PARTIAL | FAIL | Missing Sources |
|---|---|---|---|---|---|
| BCB Reserve Requirements | **98.0** | 10/10 | 0/10 | 0/10 | 0 |
| Trade Act of 1974 | **100.0** | 10/10 | 0/10 | 0/10 | 0 |
| INPI Fee Schedule | **100.0** | 10/10 | 0/10 | 0/10 | 0 |
| CARES Act | **100.0** | 10/10 | 0/10 | 0/10 | 0 |

## Full Results

| # | Doc | Query (truncated) | Status | Score | Len | Sources | Issues |
|---|---|---|---|---|---|---|---|
| 1 | BCB Reserve  | What is the current reserve ratio that Bra... | PASS | 100 | 378 | 1 | OK |
| 2 | BCB Reserve  | How is the computation period for time dep... | PASS | 100 | 181 | 1 | OK |
| 3 | BCB Reserve  | What deduction is applied to the reserve b... | PASS | 100 | 220 | 1 | OK |
| 4 | BCB Reserve  | How does Tier 1 Capital affect the deducti... | PASS | 100 | 443 | 1 | OK |
| 5 | BCB Reserve  | What interest rate is charged as a deficie... | PASS | 90 | 106 | 1 | ANSWER_TOO_SHORT |
| 6 | BCB Reserve  | Are savings deposit reserves remunerated d... | PASS | 100 | 207 | 1 | OK |
| 7 | BCB Reserve  | Which types of financial institutions are ... | PASS | 90 | 109 | 1 | ANSWER_TOO_SHORT |
| 8 | BCB Reserve  | How are real estate credit operations fact... | PASS | 100 | 468 | 1 | OK |
| 9 | BCB Reserve  | What is the maintenance period for demand ... | PASS | 100 | 167 | 1 | OK |
| 10 | BCB Reserve  | How does the Selic rate interact with the ... | PASS | 100 | 297 | 1 | OK |
| 11 | Trade Act of | What authority does the President have to ... | PASS | 100 | 323 | 1 | OK |
| 12 | Trade Act of | How does the Trade Adjustment Assistance p... | PASS | 100 | 343 | 1 | OK |
| 13 | Trade Act of | What are the eligibility criteria for a co... | PASS | 100 | 1000 | 1 | OK |
| 14 | Trade Act of | What procedures must the US Trade Represen... | PASS | 100 | 707 | 1 | OK |
| 15 | Trade Act of | How does the Act define and address injury... | PASS | 100 | 863 | 1 | OK |
| 16 | Trade Act of | What role does the International Trade Com... | PASS | 100 | 355 | 1 | OK |
| 17 | Trade Act of | How are trade readjustment allowances calc... | PASS | 100 | 341 | 1 | OK |
| 18 | Trade Act of | What limitations does the Act impose on th... | PASS | 100 | 306 | 1 | OK |
| 19 | Trade Act of | How does the Jackson-Vanik amendment condi... | PASS | 100 | 335 | 1 | OK |
| 20 | Trade Act of | What provisions does the Act include for a... | PASS | 100 | 433 | 1 | OK |
| 21 | INPI Fee Sch | How much does it cost to file a patent app... | PASS | 100 | 188 | 1 | OK |
| 22 | INPI Fee Sch | What discount percentage can micro and sma... | PASS | 100 | 183 | 1 | OK |
| 23 | INPI Fee Sch | How do patent annuity fees change over the... | PASS | 100 | 229 | 1 | OK |
| 24 | INPI Fee Sch | What are the fees for filing a trademark r... | PASS | 100 | 386 | 1 | OK |
| 25 | INPI Fee Sch | Under what conditions can a person with a ... | PASS | 100 | 195 | 1 | OK |
| 26 | INPI Fee Sch | How much does it cost to file an appeal ag... | PASS | 100 | 196 | 1 | OK |
| 27 | INPI Fee Sch | What new service codes were created for pr... | PASS | 100 | 218 | 1 | OK |
| 28 | INPI Fee Sch | How do utility model annuity fees compare ... | PASS | 100 | 555 | 1 | OK |
| 29 | INPI Fee Sch | What fees apply to PCT international phase... | PASS | 100 | 162 | 1 | OK |
| 30 | INPI Fee Sch | What is the fee for requesting a certified... | PASS | 100 | 226 | 1 | OK |
| 31 | CARES Act | How did the Paycheck Protection Program pr... | PASS | 100 | 400 | 1 | OK |
| 32 | CARES Act | What were the eligibility requirements and... | PASS | 100 | 386 | 1 | OK |
| 33 | CARES Act | How did the Pandemic Unemployment Assistan... | PASS | 100 | 600 | 1 | OK |
| 34 | CARES Act | What financial relief did the CARES Act pr... | PASS | 100 | 430 | 1 | OK |
| 35 | CARES Act | How did the Economic Stabilization Fund au... | PASS | 100 | 388 | 1 | OK |
| 36 | CARES Act | What foreclosure moratorium and mortgage f... | PASS | 100 | 560 | 1 | OK |
| 37 | CARES Act | How did the CARES Act expand telehealth co... | PASS | 100 | 818 | 1 | OK |
| 38 | CARES Act | What role did the Special Inspector Genera... | PASS | 100 | 171 | 1 | OK |
| 39 | CARES Act | How did the CARES Act modify the employee ... | PASS | 100 | 379 | 1 | OK |
| 40 | CARES Act | What emergency appropriations did Division... | PASS | 100 | 194 | 1 | OK |

## Overall Metrics

| Metric | Value |
|---|---|
| Aggregate Score | **99.5/100** |
| PASS | 40/40 |
| PARTIAL | 0/40 |
| FAIL | 0/40 |
| Missing Sources | 0/40 |
| Hedge Prefix Leaks | 0/40 |
| Truncated | 0/40 |
| Wrong-Doc Sources | 0/40 |
| Retries | 0 |

## Top Issues

- **ANSWER_TOO_SHORT**: 2x

## Full Answers (for manual review)

### Q1 [BCB Reserve Requirements] — PASS (100/100)

**Query:** What is the current reserve ratio that Brazilian commercial banks must maintain on demand deposits?

**Answer (378 chars):**

Brazilian commercial banks must currently maintain a 21% reserve requirement (reserve ratio) on demand deposits. Key operational details from the current rules:
- **Exemption:** the first BRL 500,000.00 of the reserve base is exempt. - Maintenance/computation cycle: calculated over two consecutive weeks (starting Monday of the first week and ending Friday of the second week).

**Sources:** 27fa8bbd-dbe2-4ab0-8fa5-c445cb356c66

---

### Q2 [BCB Reserve Requirements] — PASS (100/100)

**Query:** How is the computation period for time deposit reserve requirements structured and what is its duration?

**Answer (181 chars):**

For time (term) deposit reserve requirements, the computation period is structured as two consecutive weeks, running from Monday of the first week through Friday of the second week.

**Sources:** 27fa8bbd-dbe2-4ab0-8fa5-c445cb356c66

---

### Q3 [BCB Reserve Requirements] — PASS (100/100)

**Query:** What deduction is applied to the reserve base for demand deposits before calculating the required amount?

**Answer (220 chars):**

Before applying the 21% reserve ratio on **demand deposits**, the reserve base is reduced by an exemption (deduction) of BRL 500,000.00—i.e., the first BRL 500,000.00 of the reserve base is excluded from the calculation.

**Sources:** 27fa8bbd-dbe2-4ab0-8fa5-c445cb356c66

---

### Q4 [BCB Reserve Requirements] — PASS (100/100)

**Query:** How does Tier 1 Capital affect the deduction tiers for time deposit reserve requirements?

**Answer (443 chars):**

Tier 1 Capital determines which deduction tier (and corresponding deduction cap) an institution can use when calculating the **time (term) deposit** reserve requirement deduction under the rules tied to Article 6-A of BCB Resolution No. 188/2022. In practice, the framework works like this:
- Institutions are placed into tiers based on their Tier 1 Capital level.
- **Each tier has a maximum deduction limit (a cap) expressed as a percentage.

**Sources:** 27fa8bbd-dbe2-4ab0-8fa5-c445cb356c66

---

### Q5 [BCB Reserve Requirements] — PASS (90/100)

**Query:** What interest rate is charged as a deficiency penalty when a bank fails to meet its demand deposit reserve obligation?

**Answer (106 chars):**

For demand deposit reserve requirements, any deficiency (shortfall) is charged interest at the Selic rate.

**Sources:** 27fa8bbd-dbe2-4ab0-8fa5-c445cb356c66

---

### Q6 [BCB Reserve Requirements] — PASS (100/100)

**Query:** Are savings deposit reserves remunerated differently depending on when the deposit was made relative to May 2012?

**Answer (207 chars):**

Yes. - Savings deposits made from May 2012 onward: remuneration follows the post‑May 2012 savings rule, in which the return depends on the level of the Selic rate (the “new savings” rule introduced in 2012).

**Sources:** 27fa8bbd-dbe2-4ab0-8fa5-c445cb356c66

---

### Q7 [BCB Reserve Requirements] — PASS (90/100)

**Query:** Which types of financial institutions are subject to savings deposit reserve requirements under BCB rules?

**Answer (109 chars):**

Under BCB reserve-requirement rules for savings deposits, the institutions subject to the requirement are:...

**Sources:** 27fa8bbd-dbe2-4ab0-8fa5-c445cb356c66

---

### Q8 [BCB Reserve Requirements] — PASS (100/100)

**Query:** How are real estate credit operations factored into the calculation of savings deposit reserve requirements?

**Answer (468 chars):**

Real estate credit operations can be used as a **deduction** when calculating the savings deposit reserve requirement, under the mechanism tied to Article 6‑A of BCB Resolution No. 188/2022 (as amended by BCB Resolution No. 512/2025).

- The deduction is capped: The deduction under Article 6‑A is limited to a maximum percentage cap (the document shows a cap structure beginning with “limited: I – to 5% …”, indicating the deduction cannot exceed the applicable cap).

**Sources:** 27fa8bbd-dbe2-4ab0-8fa5-c445cb356c66

---

### Q9 [BCB Reserve Requirements] — PASS (100/100)

**Query:** What is the maintenance period for demand deposit reserves and how does it align with the computation period?

**Answer (167 chars):**

For demand deposit reserve requirements, the maintenance period is two consecutive weeks, starting on Monday of the first week and ending on Friday of the second week.

**Sources:** 27fa8bbd-dbe2-4ab0-8fa5-c445cb356c66

---

### Q10 [BCB Reserve Requirements] — PASS (100/100)

**Query:** How does the Selic rate interact with the remuneration formula for time deposit reserves held at the Central Bank?

**Answer (297 chars):**

Time deposit reserves held at the Central Bank are **remunerated by the Selic rate**. Key mechanics in the remuneration formula:
- Rate applied: Selic. - Balance used for calculation: remuneration is calculated on the end‑of‑day balance. - Exemption: BRL 500,000.00 is exempt from the requirement.

**Sources:** 27fa8bbd-dbe2-4ab0-8fa5-c445cb356c66

---

### Q11 [Trade Act of 1974] — PASS (100/100)

**Query:** What authority does the President have to modify tariff rates under the Trade Act of 1974?

**Answer (323 chars):**

Under the Trade Act of 1974, the President is authorized to change tariff treatment by **proclamation** in order to carry out U.S. trade-agreement commitments. Specifically, the President may proclaim:
- Modifications or continuances of existing duties or other import restrictions (including continuing existing measures).

**Sources:** 75edf961-122b-45ae-a646-7bebbbbf6655

---

### Q12 [Trade Act of 1974] — PASS (100/100)

**Query:** How does the Trade Adjustment Assistance program help workers displaced by increased imports?

**Answer (343 chars):**

The Trade Adjustment Assistance (TAA) program helps workers who lose their jobs (or face reduced hours/wages) because of increased import competition by providing reemployment support and financial assistance tied to training. - Income support while in approved training (so workers can afford to retrain rather than immediately take any job).

**Sources:** 75edf961-122b-45ae-a646-7bebbbbf6655

---

### Q13 [Trade Act of 1974] — PASS (100/100)

**Query:** What are the eligibility criteria for a country to receive benefits under the Generalized System of Preferences?

**Answer (1000 chars):**

To receive benefits under the **Generalized System of Preferences (GSP)**, a country must be designated by the President as a “beneficiary developing country” (BDC) (or, for certain higher-performing countries,... ## 1) Countries that cannot be designated (mandatory bars)
A country is not eligible to be designated as a GSP beneficiary if it falls into certain excluded categories under the Act—such as being a **Communist country** (with limited statutory exceptions),... - Provides adequate and effective protection of intellectual property rights. - Has taken steps to reduce investment barriers and strengthen the rule of law affecting trade and investment. - Is taking steps to afford internationally recognized worker rights. - Cooperates with the United States on counterterrorism and other relevant international obligations. ## 3) “Least-developed” beneficiary status
Separate from basic beneficiary status, the President may designate certain countries as least-developed beneficiaries,...

**Sources:** 75edf961-122b-45ae-a646-7bebbbbf6655

---

### Q14 [Trade Act of 1974] — PASS (100/100)

**Query:** What procedures must the US Trade Representative follow when initiating a Section 301 investigation against unfair trade practices?

**Answer (707 chars):**

When initiating a **Section 301** investigation (19 U.S.C. § 2411) or an investigation under **any other trade law** (except Title VII of the Tariff Act of 1930, 19 U.S.C. § 1671 et seq.), the U.S.

- Seek advice from the trade advisory committee system.

In connection with Section 301 (and other covered trade-law actions), the Trade Representative shall seek the advice of the advisory committees established under the Act.

International Trade Commission (ITC) be asked to conduct an investigation under Section 332 of the Tariff Act of 1930 (19 U.S.C.

These are the core procedural requirements and related mechanisms shown in the provided statutory excerpts for initiating Section 301-related action.

**Sources:** 75edf961-122b-45ae-a646-7bebbbbf6655

---

### Q15 [Trade Act of 1974] — PASS (100/100)

**Query:** How does the Act define and address injury caused to domestic industries by import competition?

**Answer (863 chars):**

The Trade Act of 1974 treats “injury caused by import competition” primarily through its **safeguards (escape clause) framework**, which focuses on whether increased imports are a major driver of harm to a U.S. ## How the Act defines import-caused injury
- The core standard is **“serious injury (or threat thereof)”** to a domestic industry producing an article like, or directly competitive with, the imported article. ## How the Act addresses that injury
- The Act provides “relief from injury caused by import competition” through the mechanisms in chapter 1 of title II (the safeguards provisions) and related trade-remedy authorities referenced alongside other... International Trade Commission (ITC/Commission) plays a central role: it makes an affirmative determination** under the safeguards investigation process (referenced as section 202(b), 19 U.S.C.

**Sources:** 75edf961-122b-45ae-a646-7bebbbbf6655

---

### Q16 [Trade Act of 1974] — PASS (100/100)

**Query:** What role does the International Trade Commission play in investigating trade agreement violations?

**Answer (355 chars):**

In the Trade Act of 1974 framework for investigating alleged trade agreement violations or other unfair trade practices (including **Section 301** matters),... § 1332).

In connection with Section 301 (and other covered trade-law actions), the Trade Representative may recommend to the President** that an ITC investigation be requested under Section 332.

**Sources:** 75edf961-122b-45ae-a646-7bebbbbf6655

---

### Q17 [Trade Act of 1974] — PASS (100/100)

**Query:** How are trade readjustment allowances calculated for workers who lose their jobs due to import competition?

**Answer (341 chars):**

The provided excerpts don’t contain the statutory provisions that set the **formula** for calculating trade readjustment allowances (TRA) (the weekly cash benefits paid under Trade Adjustment Assistance). explain the TRA calculation at a high level only if you confirm you’re asking generally (not strictly limited to the excerpts provided).

**Sources:** 75edf961-122b-45ae-a646-7bebbbbf6655

---

### Q18 [Trade Act of 1974] — PASS (100/100)

**Query:** What limitations does the Act impose on the President's ability to decrease existing duty rates through trade agreements?

**Answer (306 chars):**

The Act lets the President proclaim modifications of existing duties (including decreases) as needed to carry out a trade agreement,... - Limits when the current rate is already a staged (“intermediate stage”) rate: If the duty rate in effect is an intermediate stage under the Act’s staging provisions,...

**Sources:** 75edf961-122b-45ae-a646-7bebbbbf6655

---

### Q19 [Trade Act of 1974] — PASS (100/100)

**Query:** How does the Jackson-Vanik amendment condition most-favored-nation status on emigration policies of non-market economies?

**Answer (335 chars):**

The Jackson–Vanik amendment conditions most-favored-nation (MFN) / nondiscriminatory tariff treatment for **non-market economy** countries on whether they allow freedom of emigration. - How MFN can still be granted: MFN can be extended only if the country’s emigration practices meet the amendment’s freedom-of-emigration standards,...

**Sources:** 75edf961-122b-45ae-a646-7bebbbbf6655

---

### Q20 [Trade Act of 1974] — PASS (100/100)

**Query:** What provisions does the Act include for addressing trade with countries that are uncooperative in combating narcotics production?

**Answer (433 chars):**

The Act ties certain U.S. trade benefits to a country’s cooperation in combating narcotics production and trafficking by allowing the President to withhold, suspend, or limit trade preferences for countries that are not cooperating.

- Use of trade preferences as leverage: Within the Act’s preference programs (the provisions covering the designation and review of beneficiary developing countries and related eligibility rules),...

**Sources:** 75edf961-122b-45ae-a646-7bebbbbf6655

---

### Q21 [INPI Fee Schedule] — PASS (100/100)

**Query:** How much does it cost to file a patent application at INPI under the current fee schedule?

**Answer (188 chars):**

Under the current INPI fee schedule (Portaria GM/MDIC nº 110, May 5, 2025), the filing fee for a patent application is:
- R$ 175.00 — Patent of invention (PI) application filing
- **R$ 70.

**Sources:** 8d46ada3-e57e-4032-b3f4-d204860a0180

---

### Q22 [INPI Fee Schedule] — PASS (100/100)

**Query:** What discount percentage can micro and small businesses receive on INPI service fees?

**Answer (183 chars):**

Micro and small businesses can receive a 60% reduction (discount) on INPI service fees, under the reductions granted by the INPI President in the conditions set out in a specific act.

**Sources:** 8d46ada3-e57e-4032-b3f4-d204860a0180

---

### Q23 [INPI Fee Schedule] — PASS (100/100)

**Query:** How do patent annuity fees change over the lifetime of an invention patent in Brazil?

**Answer (229 chars):**

For an invention patent (patente de invenção, PI) in Brazil, the annuity (maintenance) fee increases in stepwise bands as the patent ages: ### Ordinary (on-time) annuity fees for an invention patent
- 3rd to 6th year: **R$ 1,000.

**Sources:** 8d46ada3-e57e-4032-b3f4-d204860a0180

---

### Q24 [INPI Fee Schedule] — PASS (100/100)

**Query:** What are the fees for filing a trademark registration request at INPI?

**Answer (386 chars):**

INPI charges the trademark application (registration request) filing fee per class, with two filing options:
- **Code 389** — Trademark registration request (standard specification): fee charged per class. So, the amount you pay to file depends on how many Nice classes you include, and whether you file using the standard specification (code 389) or free-text specification (code 394).

**Sources:** 8d46ada3-e57e-4032-b3f4-d204860a0180

---

### Q25 [INPI Fee Schedule] — PASS (100/100)

**Query:** Under what conditions can a person with a disability receive a full fee waiver for INPI services?

**Answer (195 chars):**

A person with a disability can receive a full waiver (100% exemption) of INPI service fees when they fall within the group eligible for fee reductions/exemptions granted by the INPI President,...

**Sources:** 8d46ada3-e57e-4032-b3f4-d204860a0180

---

### Q26 [INPI Fee Schedule] — PASS (100/100)

**Query:** How much does it cost to file an appeal against a patent denial at INPI?

**Answer (196 chars):**

Under INPI’s current fee schedule (Portaria GM/MDIC nº 110, May 5, 2025), the cost to file an appeal against a patent denial is not shown in the provided excerpts of the patent services fee table.

**Sources:** 8d46ada3-e57e-4032-b3f4-d204860a0180

---

### Q27 [INPI Fee Schedule] — PASS (100/100)

**Query:** What new service codes were created for priority processing of trademark applications?

**Answer (218 chars):**

The new service codes created for priority processing (trâmite prioritário) of trademark applications are:
- **Code 3019** — Priority processing of trademarks with entitlement to a fee waiver (gratuidade) (fee: **R$ 0.

**Sources:** 8d46ada3-e57e-4032-b3f4-d204860a0180

---

### Q28 [INPI Fee Schedule] — PASS (100/100)

**Query:** How do utility model annuity fees compare to invention patent annuity fees at INPI?

**Answer (555 chars):**

Utility model annuity fees are lower than invention patent annuity fees at INPI (Portaria GM/MDIC nº 110/2025), both in the ordinary term and (where shown) the extraordinary term. ### Ordinary annuity fees (by year range)
| Year range | Invention patent annuity | Utility model annuity |
| --- | --- | --- |
| 3rd to 6th year | R$ 1,000.00 | R$ 300.00 |
| 7th to 10th year | R$ 1,600.00 | R$ 480.00 |
| 11th to 15th year | R$ 2,200.00 | R$ 660.00 |
| 16th year onward | R$ 2,800.00 | R$ 840.00 |
- **Utility model annuity (extraordinary term):** R$ 800.00

**Sources:** 8d46ada3-e57e-4032-b3f4-d204860a0180

---

### Q29 [INPI Fee Schedule] — PASS (100/100)

**Query:** What fees apply to PCT international phase patent applications filed through INPI?

**Answer (162 chars):**

For PCT international-phase patent applications handled through INPI (service group “International Phase of a PCT process”), the fee table shows these charges:...

**Sources:** 8d46ada3-e57e-4032-b3f4-d204860a0180

---

### Q30 [INPI Fee Schedule] — PASS (100/100)

**Query:** What is the fee for requesting a certified copy or patentability opinion from INPI?

**Answer (226 chars):**

INPI’s fee table excerpts provided here don’t show any line item (service code/price) for either requesting a certified copy (“cópia autenticada/certidão”) or requesting a patentability opinion (“parecer de patenteabilidade”).

**Sources:** 8d46ada3-e57e-4032-b3f4-d204860a0180

---

### Q31 [CARES Act] — PASS (100/100)

**Query:** How did the Paycheck Protection Program provide forgivable loans to small businesses during the pandemic?

**Answer (400 chars):**

The Paycheck Protection Program (PPP) delivered pandemic relief by using the Small Business Administration’s (SBA) existing 7(a) loan-guarantee framework to get cash quickly to eligible small employers through participating lenders,...

- Borrowers didn’t have to prove they couldn’t get credit elsewhere, and SBA fees were waived.

- Forgiveness was administered through SBA’s established processes.

**Sources:** 17079e4e-5c47-4b0a-912c-70816ba7028a

---

### Q32 [CARES Act] — PASS (100/100)

**Query:** What were the eligibility requirements and payment amounts for the individual stimulus recovery rebates?

**Answer (386 chars):**

The provided material here is from H.R. 748 (the CARES Act) sections dealing with unemployment insurance and related state payment mechanics (for example, “pandemic emergency unemployment compensation” and “terms of payments” to states).

It the provisions that set **eligibility requirements** or payment amounts for the individual stimulus recovery rebates (Economic Impact Payments).

**Sources:** 17079e4e-5c47-4b0a-912c-70816ba7028a

---

### Q33 [CARES Act] — PASS (100/100)

**Query:** How did the Pandemic Unemployment Assistance program expand coverage to workers not traditionally eligible for unemployment benefits?

**Answer (600 chars):**

The Pandemic Unemployment Assistance (PUA) program expanded unemployment coverage by creating a temporary, federally backed benefit for “covered individuals” whose unemployment (or partial unemployment,...

- Recognized COVID‑19-specific reasons for being unable to work.

The law lists COVID‑19-related circumstances that could make someone a covered individual, including:...

- **Set a tailored “actively seeking work” standard.** For certain eligibility purposes, the Act defined “actively seeking work” in terms of being registered for employment services in the manner and extent prescribed,...

**Sources:** 17079e4e-5c47-4b0a-912c-70816ba7028a

---

### Q34 [CARES Act] — PASS (100/100)

**Query:** What financial relief did the CARES Act provide specifically to the airline industry?

**Answer (430 chars):**

The CARES Act created a dedicated airline relief package under Title IV (Economic Stabilization and Assistance to Severely Distressed Sectors of the United States Economy), aimed at stabilizing industries hit hard by COVID‑19.

- Support structured through the Act’s **economic stabilization framework** (the same title that set up the federal tools to provide large-scale assistance to distressed industries during the pandemic).

**Sources:** 17079e4e-5c47-4b0a-912c-70816ba7028a

---

### Q35 [CARES Act] — PASS (100/100)

**Query:** How did the Economic Stabilization Fund authorize Treasury lending to affected businesses and what oversight was established?

**Answer (388 chars):**

Title IV of the CARES Act set up an **economic stabilization framework** (“Economic Stabilization and Assistance to Severely Distressed Sectors of the United States Economy”) that empowered the Secretary of the Treasury to run the program and channel...

- Assistance was organized under Title IV’s stabilization framework aimed at “severely distressed sectors” affected by COVID‑19, i.e.

**Sources:** 17079e4e-5c47-4b0a-912c-70816ba7028a

---

### Q36 [CARES Act] — PASS (100/100)

**Query:** What foreclosure moratorium and mortgage forbearance protections did the CARES Act create for homeowners?

**Answer (560 chars):**

The CARES Act created two core homeowner protections for **federally backed mortgage loans**: a temporary foreclosure moratorium and a right to request forbearance. ## 2) Consumer right to request mortgage forbearance (Section 4022)
Homeowners with a federally backed mortgage loan who experienced a COVID‑19-related financial hardship were given a statutory right to request forbearance from their loan servicer. - Duration: Forbearance is provided for up to 180 days, with the ability to extend for an additional 180 days (up to 360 days total) if requested.

**Sources:** 17079e4e-5c47-4b0a-912c-70816ba7028a

---

### Q37 [CARES Act] — PASS (100/100)

**Query:** How did the CARES Act expand telehealth coverage under Medicare during the COVID-19 emergency?

**Answer (818 chars):**

The CARES Act expanded Medicare telehealth during the COVID‑19 emergency by creating several temporary Medicare policy changes that let required “in‑person” interactions be done via telehealth and by easing certain rules tied to telehealth services. 3701).

The Act created a specific Medicare-related exemption for telehealth services during the emergency period.

- Home dialysis: waived the face‑to‑face visit requirement (Sec. 3705).** Medicare’s requirement for **face‑to‑face visits between home dialysis patients and physicians** was **temporarily waived, allowing care to be furnished without the usual in‑person visit requirement. 3706).

The Act allowed telehealth to be used to conduct the face‑to‑face encounter that is required before recertifying eligibility for hospice care during the emergency period.

**Sources:** 17079e4e-5c47-4b0a-912c-70816ba7028a

---

### Q38 [CARES Act] — PASS (100/100)

**Query:** What role did the Special Inspector General for Pandemic Recovery play in overseeing CARES Act spending?

**Answer (171 chars):**

The CARES Act set up oversight of its spending through inspector-general functions, including dedicated funding for Offices of Inspector General to conduct oversight work.

**Sources:** 17079e4e-5c47-4b0a-912c-70816ba7028a

---

### Q39 [CARES Act] — PASS (100/100)

**Query:** How did the CARES Act modify the employee retention tax credit to incentivize keeping workers on payroll?

**Answer (379 chars):**

The CARES Act created an **employee retention tax credit** to reward employers that kept employees on payroll during COVID‑19 disruptions by reducing their federal employment tax burden.

- How it targeted “keeping workers”: The credit was tied directly to wages actually paid to employees, making the incentive proportional to maintaining payroll rather than laying workers off.

**Sources:** 17079e4e-5c47-4b0a-912c-70816ba7028a

---

### Q40 [CARES Act] — PASS (100/100)

**Query:** What emergency appropriations did Division B of the CARES Act allocate for coronavirus health response and federal agency operations?

**Answer (194 chars):**

Division B of the CARES Act is the Emergency Appropriations division. Because the Division B appropriations amounts and account-by-account allocations aren’t present in the provided evidence,...

**Sources:** 17079e4e-5c47-4b0a-912c-70816ba7028a

---

