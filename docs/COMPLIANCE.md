# Compliance and clinical-readiness checklist

> **Status: research prototype (BIS586 mini project, Group 10).** This document is a working checklist, not legal advice. Every row marked *Decide* needs a human (guide, hospital, legal adviser) to confirm it. Regulations were last checked in **November 2026** and must be re-checked before any real use.

## 1. Intended use (what we claim, and what we do not)

| | |
|---|---|
| **Intended use** | Support a trained health worker and a doctor in **triaging** retinal photographs of people with diabetes: decide which photos are usable, and which patients should be seen by an eye specialist first. |
| **Intended users** | Nurses or screening operators at primary health centres; doctors who review the cases. |
| **What it is not** | Not a diagnosis. The AI result is supporting evidence; the **doctor's recorded decision is the clinical decision**. Not for use without a doctor review step. |
| **Required label on every AI screen** | "AI output is supporting evidence for the doctor and is not a diagnosis." (already shown) |

## 2. Medical-device regulation (India, CDSCO)

- Software used for diagnosis, prediction or monitoring is already a medical device under the **Medical Device Rules, 2017**. CDSCO's **draft guidance on medical device software (21 Oct 2025)** gives "AI-based software for detecting diseases" as an example of **Class C** (moderate-high risk).
- Class C/D software is licensed by CDSCO's **Central Licensing Authority**; the manufacturer must show a **quality management system**.
- *Decide:* check whether the guidance has been finalised, and confirm the class for a retinal triage tool with a doctor-in-the-loop.
- **Before any clinical use:** licence, QMS, post-market monitoring plan. **For the mini project:** state clearly that it is a research prototype used only on public datasets and test data.

## 3. Ethics

- Any study that uses **real patient photographs or records** needs approval from an **Institutional Ethics Committee** first. Follow the **ICMR Ethical Guidelines for Application of AI in Biomedical Research and Healthcare (2023)** (read the full PDF; this document did not summarise it).
- Public datasets used so far: EyePACS (training/test), APTOS 2019 (external validation). *Decide:* confirm their licences allow the way they were used and how they are cited.

## 4. Data protection (DPDP Act 2023 and DPDP Rules 2025)

The Rules were notified in November 2025 with obligations phased over about 12 to 18 months. *Decide:* confirm which obligations are in force on your date of use.

| Obligation (plain words) | What the system does today | Still to do |
|---|---|---|
| Tell people what is collected and why (**notice**) | Consent text at registration; public **/privacy** page (template) | Hospital's legal review of the wording |
| Get and record **consent** | Consent is recorded with **version, time and who recorded it** | Re-consent flow if the text changes |
| Collect only what is needed | Registration asks for name, date of birth, gender, mobile, optional history | Confirm each field is needed |
| **Security safeguards** | Roles and centre isolation on the server, hashed passwords, lockout, audit trail, encrypted transport (once HTTPS is set up) | HTTPS, encrypted backups, access reviews, security test |
| **Breach notification** | Audit and logs help find what happened | Written procedure (section 8) |
| Let people **see their data** | `GET /me/export` for patients (released reports only) | Button in the patient profile |
| **Correct or erase** on request | `python manage.py anonymize-patient` removes identity, images and notes | Written request process; retention rules (section 7) |
| Children's data | Not designed for under-18s | *Decide:* block registration under 18, or add guardian consent |
| Processors and cloud | Everything runs locally today | Contract with any hosting provider; check where data is stored |

## 5. What we cannot claim yet (clinical evidence)

| Evidence so far | Limitation |
|---|---|
| Internal test set: QWK 0.774, referable AUROC 0.941, sensitivity 0.914 / specificity 0.770 | Same source as training; retrospective |
| External set (APTOS, 3,662 images): AUROC 0.971, sensitivity 1.000, specificity 0.711 | Different grading convention and prevalence; model over-grades by about one level; ECE 0.140 (overconfident) |
| Quality gate and JPEG-compression robustness | Synthetic degradation, not real field photographs |

## 6. Clinical validation plan (for a future prospective study)

1. **Question:** at a primary health centre, does the tool find patients who need referral (sensitivity) without sending too many healthy patients (specificity)?
2. **Design:** consecutive adults with diabetes, photographed by nurses in routine conditions, **no case selection**. Report with the **STARD** checklist for diagnostic accuracy (and **TRIPOD+AI** for the model).
3. **Reference standard:** two independent ophthalmologists grade each image; a third adjudicates disagreements. Graders are **blind** to the AI result.
4. **Sample size:** choose it so the confidence interval around sensitivity is narrow enough to matter (for example, ±5 points); get a statistician to confirm.
5. **Metrics:** sensitivity, specificity, PPV/NPV at the site's prevalence, ungradable rate, uncertain rate, calibration, agreement with graders (quadratic kappa), all with 95% confidence intervals.
6. **Site recalibration:** refit the temperature and referral threshold on a held-out half of the site's data, then test on the other half.
7. **Safety:** log every case where the doctor overrides the AI and every missed referable case; review monthly.
8. **Subgroups:** age, sex, camera type, image-quality band.

## 7. Retention and deletion (policy to decide)

| Data | Proposed rule | Decide with |
|---|---|---|
| Patient identity and clinical record | Keep for the period the hospital's medical-records policy requires, then anonymise | Hospital, legal adviser |
| Retinal images and heatmaps | Same as the record; delete on a valid erasure request when no legal duty to keep them applies | Hospital, legal adviser |
| Audit trail | Keep (it holds IDs, not names); it proves who did what | Hospital |
| Backups | Keep 14 days; an erased patient disappears from backups as they expire | Technical lead |
| Logs | Keep 10 files of 10 MB; they hold no names or request bodies | Technical lead |

An erasure request is handled with `python manage.py anonymize-patient P001 --yes`. It blanks the name, mobile, history and notes, keeps only the birth year, deletes the images and heatmaps, and disables the login. De-identified counts for analytics remain.

## 8. Incident and breach procedure (fill in the contacts)

1. **Detect** (monitor alert, log review, a user report).
2. **Contain**: disable affected accounts (`manage.py deactivate`), rotate `JWT_SECRET` (this signs every user out), change storage credentials.
3. **Assess** with the audit trail and logs: what data, whose, since when.
4. **Notify** the affected people and the Data Protection Board as the Rules require. *Contact: [data protection officer / hospital administrator].*
5. **Record** what happened and what changed, and review within one week.

## 9. Open decisions (owner needed)

- [ ] Who is the **data fiduciary** (typically the health centre or hospital) and who is the **processor** (the software team)? Confirm with legal.
- [ ] Is this ever used on real patients? If yes: ethics approval, then CDSCO route.
- [ ] Final privacy-notice wording and contact details.
- [ ] Minimum age and guardian consent.
- [ ] Record-retention period.

## Sources checked (November 2026)
- DPDP Rules 2025 rollout: https://yourstory.com/2025/11/digital-personal-data-protection-dpdp-rules-2025-rollout-over-18-months
- CDSCO medical device software draft guidance: https://india-briefing.com/news/cdsco-draft-guidance-medical-software-40691.html
- CDSCO draft guidance (PDF): https://cdsco.gov.in/opencms/resources/UploadCDSCOWeb/2018/UploadPublic_NoticesFiles/Draft%20guidance%20document%20on%20Medical%20Device%20Software%2021%2010%202025.pdf
- ICMR AI ethical guidelines (2023): https://icmr.gov.in/ethical-guidelines-for-application-of-artificial-intelligence-in-biomedical-research-and-healthcare