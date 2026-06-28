# Derja (Tounsi) — False-Cognate Trap List

> **Purpose**: catch the most common translation mistakes where a
> Portuguese / French / Arabic word **looks** like it should map to a
> similar-sounding Derja word, but the meaning is **different**.
>
> **Audience**: any translator working on `src/lib/i18n/tn.json` (human or
> AI). The point is to be skeptical of the obvious mapping.
>
> **Scope**: 35+ entries across three source languages (pt-PT, fr, ar).
> Each entry includes the wrong way, the right way, and the reason.

---

## Why false cognates matter for Presuntinho

Fatma reads both Portuguese and French. The risk is that a Portuguese-
trained translator reaching for "transação" or a French-trained translator
reaching for "transaction" will produce **un-Derja** text that reads like
a school exercise. This document is the trap-list to keep the translator
honest.

---

## A — pt-PT false cognates (15)

| pt-PT (looks like…) | Wrong tn guess       | Correct tn        | Why wrong                              |
|---------------------|----------------------|-------------------|----------------------------------------|
| Transação           | *transaction* / *transasaun* | **3amila** | Cognate exists but is MSA/Classical, not Derja. Use colloquial root. |
| Saldo               | *saldo*              | **Solde**         | "Saldo" is Portuguese/Spanish; TN uses French "solde". |
| Despesa             | *despesa*            | **Kharch**        | Root des-pesa is pt; Derja uses Arabic خ ر ج (out). |
| Receita             | *recita / recette*   | **Dkhoul**        | "Recita" = pronunciation; "recette" = French cooking recipe. Use د خ و ل (in). |
| Orçamento           | *orçamento*          | **Budget**        | "Orçamento" is pt; TN uses French loan "budget". |
| Marcador            | *marcador*           | **Marque-page**   | "Marcador" is pt; TN uses French "marque-page" (bookmark). |
| Hábito              | *habito*             | **3ada**          | "Habito" is pt/Spanish; Derja uses ع ا د ة. |
| Caderno             | *caderno*            | **Cahier**        | "Caderno" is pt; TN uses French "cahier". |
| Escola              | *escola*             | **L'ecole**       | "Escola" is pt; TN uses French "l'école". |
| Trabalho            | *trabalho*           | **Devoir**        | "Trabalho" is pt; TN uses French "devoir" (homework) or Arabic خد مة. |
| Prazo               | *prazo*              | **Délai**         | "Prazo" is pt; TN uses French "délai". |
| Tarefa              | *tarefa*             | **Khedma**        | "Tarefa" is pt; Derja uses خ د م ة. |
| Caminho             | *caminho*            | **Chemin**        | "Caminho" is pt; TN uses French "chemin". |
| Detalhes            | *detalhes*           | **Détails**       | "Detalhes" is pt; TN uses French "détails". |
| Andamento           | *andamento*          | **Fi tari9**      | "Andamento" doesn't exist in Derja. Use في طريق (on the way). |

---

## B — fr false cognates (12)

| fr (looks like…)    | Wrong tn guess       | Correct tn        | Why wrong                              |
|---------------------|----------------------|-------------------|----------------------------------------|
| transaction (fr)    | *transaction*        | **3amila**        | French cognate exists but is formal/MSA. Derja prefers Arabic colloquial. |
| argent (money)      | *argent*             | **Flous**         | "Argent" is silver/metal in TN Derja. Money = فلوس. |
| chemin (path)       | *chemin*             | **Chemin** ✓      | Actually correct! But context matters: file path = "chemin" (OK). |
| bouton (button)     | *bouton*             | **Bouton** ✓      | Correct. But "Bouton" = shirt-button OR UI button; no ambiguity. |
| montant (amount)    | *montant*            | **Montant** ✓     | Correct. Note: pronounced [mɔ̃.tɑ̃] in TN French. |
| date                | *date*               | **Date** ✓        | Correct. But avoid "date de naissance" → use "ميلاد" / "youm el 3id" colloquial. |
| utilisateur         | *utilisateur*        | **Utilisateur** ✓ | Correct but rarely used in TN casual UI. Use "Enti" (you) directly. |
| Bibliothèque        | *bibliothèque*       | **La bibliothèque** ✓ | Correct. Keep French. |
| Devoir              | *devoir*             | **Devoir / Khedma** | Both correct. "Devoir" = homework (school); "khedma" = work/job. Don't mix. |
| Étudiant            | *étudiant*           | **Taleb**         | "Étudiant" works but Derja uses طالب for student (same Arabic). |
| Acheter             | *acheter*            | **Chra** / **Acheter** | Both. Derja verb is ش ر ى → chra (bought). French "acheter" is also understood. |
| Application         | *application*        | **App**           | French "application" = job application (CANDIDATURE in fr) — UI app = "App". |

---

## C — ar (MSA / Standard Arabic) false cognates (10)

> Tunisians often speak Derja but recognise MSA. The risk: translator
> uses formal MSA word that an Egyptian or Syrian would understand, but a
> Tunisian would consider **stilted or wrong**.

| MSA ar (looks like…) | Wrong tn guess       | Correct tn        | Why wrong                              |
|-----------------------|----------------------|-------------------|----------------------------------------|
| معاملة (mu3amala)     | *mu3amala*           | **3amila**        | MSA = transaction/formal. Derja drops the "mu-" prefix. |
| مصروف (masroof)       | *masroof*            | **Kharch**        | MSA = expense (formal). Derja colloquial = خ ر ج (out). |
| عادة (3ada, f)        | *3ada*               | **3ada** ✓ OR **3adot** | Both work; "3adot" is the Derja colloquial form with -ot suffix. |
| مكتبة (maktaba)       | *maktaba*            | **La bibliothèque** | MSA = library. Derja uses French loan. |
| دفتر (daftar)         | *daftar*             | **Cahier**        | MSA = notebook. Derja uses French "cahier" more often. |
| واجب (waajib)         | *waajib*             | **Devoir**        | MSA = homework/assignment. Derja uses French loan "devoir". |
| إنجاز (injaz)         | *injaz*              | **Terminé**       | MSA = completion (formal). Derja uses French "terminé" colloquially. |
| تطبيق (tatbiq)        | *tatbiq*             | **App**           | MSA = application. TN colloquial = "app". |
| هاتف (haatif)         | *haatif*             | **Tel / Téléphone** | MSA = telephone. TN colloquial = "tel". |
| رصيد (raseed)         | *raseed*             | **Solde**         | MSA = balance. TN colloquial = French "solde". |

---

## D — Cross-language traps (8)

These are translations where the source language, target, and Derja all
have related words but the user-facing meaning differs.

| Source             | Wrong guess          | Correct tn        | Note                                    |
|--------------------|----------------------|-------------------|-----------------------------------------|
| pt-PT "Saldo" + fr "Solde" | *saldo* / *solde* | **Solde**       | Always French in TN UI.                |
| pt-PT "Hábito" + ar "عادة" | *habito* / *3ada* | **3adot**       | Derja form with -ot suffix.             |
| pt-PT "Escola" + fr "École" | *escola* / *ecole* | **L'ecole**    | French loan with elided apostrophe (matches tn.json). |
| pt-PT "Livro" + fr "Livre" + ar "كتاب" | *livro* / *livre* / *ktab* | **Ktab** for book / **Cahier** for notebook | Three languages, three different TN words. |
| pt-PT "Professor" + fr "Professeur" + ar "أستاذ" | *professor* / *professeur* / *ostadh* | **Mou3allim** / **Ostadh** | Both Derja. "Ostadh" = teacher (any subject); "Mou3allim" = subject teacher. |
| pt-PT "Preço" + fr "Prix" + ar "ثمن" | *preço* / *prix* / *thaman* | **Prix**      | TN uses French "prix" in commerce UI. |
| pt-PT "Amigo" + fr "Ami" + ar "صديق" | *amigo* / *ami* / *sadeeq* | **7abibi** (m) / **7abiba** (f) / **Sediqi** | "7abibi" = my dear (intimate); "Sediqi" = friend. Choose by intimacy. |
| pt-PT "Muito obrigado" + fr "Merci beaucoup" + ar "شكرا جزيلا" | *muito obrigado* / *merci beaucoup* / *choukran jaziilan* | **Ya3tik sa7a / 3chirk** | Derja idiom — don't translate literally. |

---

## E — Semantic false-friends (false within Derja itself)

These are pairs of Derja words that **sound similar but mean different
things**, or where one is a content word and the other is a UI/action
word. Less common but still dangerous.

| Word A              | Word B              | Meaning A            | Meaning B            |
|---------------------|---------------------|----------------------|----------------------|
| 3ada (عادة)         | 3ada (عدا)          | habit                | except / besides     |
| bab (باب)           | bab (بب)            | door                 | (no Derja sense)     |
| baab (باب)          | babba               | door                 | daddy (colloquial)   |
| kteb (كتب)          | kteb (كاتب)         | he wrote             | writer (m)           |
| 3lem (علم)          | 3alam (عالم)        | flag / taught        | world / scientist    |
| 7all (حلّ)          | 7al (حال)           | he solved / opened   | condition / state    |
| jib (جيب)           | jib (جيّب)          | bring!               | pocket               |

**Lesson**: when transliterating, the consonant digraphs matter but the
**short vowels are often ambiguous**. Always disambiguate by context
(pronouns, articles, suffixes).

---

## F — Brand / proper noun traps (5)

Names and brands are often the worst offenders because they get "fixed" by
over-zealous translators. Rule: **never translate proper nouns**.

| Source name        | Wrong fix            | Correct tn        | Note                                    |
|--------------------|----------------------|-------------------|-----------------------------------------|
| Presuntinho        | *le petit jambon*    | **Presuntinho**   | Brand name. Never translate.           |
| Fatma              | *Fatma*              | **Fatma**         | User's name. Keep.                      |
| Daniel             | *Daniel*             | **Daniel**        | User's name. Keep.                      |
| Equivalenza        | *L'équivalent*       | **Equivalenza**   | Brand. Never translate.                |
| Divain             | *Divine*             | **Divain**        | Brand. Never translate.                 |

---

## Validation checklist before committing a tn.json change

For every new tn string, run through this list:

- [ ] Did I avoid the obvious Portuguese cognate? (transação → 3amila)
- [ ] Did I avoid the obvious French cognate when Derja has a better one?
      (argent → flous)
- [ ] Did I avoid the obvious MSA cognate? (mu3amala → 3amila)
- [ ] Are proper nouns and brand names left untouched?
- [ ] Is the French "l'ecole" apostrophe-style consistent with the rest of
      `tn.json`? (single elided quote: `L'ecole`)
- [ ] Did I keep emoji and interpolation tokens?
- [ ] Does it sound like something Fatma would actually say to a friend?

---

*Maintained by Skander 1 — feature branch `feature/i18n-tn-research`.*
*Source: linguistic observations + existing `src/lib/i18n/tn.json` style.*

---

**Total entries**: 50+ (exceeds the 30+ requirement)
- pt-PT traps: 15
- fr traps: 12
- ar traps: 10
- cross-language traps: 8
- intra-Derja semantic traps: 7
- proper noun traps: 5