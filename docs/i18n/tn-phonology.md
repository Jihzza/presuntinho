# Derja (Tounsi) — Phonology & Latinization Rules

> **Audience**: anyone localising `src/lib/i18n/tn.json` for Presuntinho V4.
> **Goal**: a single source of truth for how Tunisian Arabic ("Derja" / "Tounsi")
> is written in **Latin script only**. NEVER use Arabic script (`ar.json`
> already covers that).
>
> The latinization follows the convention already used in `tn.json` (e.g.
> `"nav.habitos": "3adot"`, `"nav.financas.aria": "Finances — dépenses w7 comptes"`).
> This document formalises and extends it.

---

## 1. Core principle

Write Derja as a Tunisan would type it on a phone keyboard: Latin letters +
digits. No diacritics, no special Unicode. The result must be:

1. **Pronounceable** by any Tunisian reader without explanation.
2. **Typeable** on a QWERTY / AZERTY / Arabic smartphone keyboard without
   switching layouts.
3. **Distinct** from Portuguese (`pt-PT`) and French (`fr`) translations —
   it must feel Tunisian, not Maghrebi-French.

---

## 2. Consonant digraphs (fixed table)

These are the canonical mappings. They mirror the existing `tn.json` strings
and match the convention used in Tunisian social media (Facebook, Instagram,
SMS).

| Arabic letter | Name   | Latin token | Notes                                     |
|---------------|--------|-------------|-------------------------------------------|
| ق             | qaf    | **9**       | Most distinctive Derja letter. Always `9`, never `q` (preserves "tounsi look"). |
| ح             | haa    | **7**       | Pharyngeal H. `7` in the middle of words. |
| ع             | 3ayn   | **3**       | Pharyngeal voiced. `3` in the middle of words. |
| غ             | ghain  | **gh**      | Velar fricative. Always the digraph `gh`, never `g` alone. |
| خ             | khaa   | **kh**      | Velar fricative. Always the digraph `kh`, never `k` alone. |
| ش             | shiin  | **ch**      | Always `ch` in Derja (not `sh`). Distinguishes from Moroccan `sh`. |
| ث             | thaa   | **th**      | As in English "think". Tunisian speakers usually realise it as `t` or `s` — keep `th` only when faithful to source. |
| ذ             | dhaal  | **dh**      | Voiced th, as in English "this". |
| ص             | saad   | **s**       | No special mark. Context disambiguates (emphatic vs plain). |
| ض             | daad   | **d**       | No special mark. |
| ط             | taa    | **t**       | No special mark. |
| ظ             | dhaa   | **dh** or **z** | Tunisian often realises as `z`. Prefer `z` for colloquial. |
| ج             | jiim   | **j**       | French-influenced Tunisian: `j` (not `dj`). |
| ي             | yaa    | **i** or **y** | Use `i` for long vowel, `y` only for diphthongs / loanwords. |
| و             | waaw   | **ou** or **w** | `ou` for long vowel cluster, `w` for the consonant glide. |

The **six mandatory tokens** listed in the task body are:
`9`, `7`, `3`, `ch`, `gh`, `kh`. Everything else uses standard Latin.

### Why digits for emphatic/pharyngeals?

Because no clean Latin letter exists for ق / ح / ع without ugly diacritics.
Using digits makes the text immediately recognisable as Derja to a Tunisian
reader (the same convention is used by the Tunisian rap scene, political
accounts, and SMS between friends). It also keeps the file UTF-8 trivial.

---

## 3. Vowels

Tunisian Arabic has a vowel system much smaller than Classical Arabic's
three. Derja latinization drops vowel diacritics almost entirely.

| Arabic short | Latin | Example              | Notes                          |
|--------------|-------|----------------------|--------------------------------|
| ـَـ (fatha)   | `a`   | كتب → **kteb**       | Schwa `ə` is common, written `a` or dropped. |
| ـِـ (kasra)   | `i`   | كبير → **kbir**      | Also written `e` in some words. |
| ـُـ (damma)   | `ou` (long) / `u` | نوم → **noum** | Long `ou`; short `u` only in clusters. |
| ا (alif)     | `a` or `aa` | باب → **bab** / **baab** | Prefer short `a` to avoid clutter. |
| و (alif maqsura context) | `ou` | يوم → **youm** | |
| ي (long ii)  | `i`   | كبير → **kbir**      | Long, no doubling needed. |

### Vowel-dropping rule

Tunisian tends to drop short vowels in casual writing. **Keep the dropped
vowels in formal UI strings** so the meaning is unambiguous, but drop them in
chat-like / placeholder text.

- Formal: "Bem-vindo" → **"Mer7ba bik"** (keep the `-a`)
- Casual: "Tens de…" → **"Lazem…"** (drop the `-em`)

---

## 4. Numbers and quantifiers

Keep Arabic digits for **numbers inside UI strings** (matches what Tunisians
expect on screens: "5 lições" reads more naturally than "cinco lições"). For
quantities you write out, French numerals are common in TN (`trois`, `sept`)
but you may use either.

| Derja   | Meaning   | Latin |
|---------|-----------|-------|
| واحد    | one       | `wa7ed` |
| جوج    | two       | `jouj` (or `jouj`) |
| ثلاثة   | three     | `tlata` |
| أربعة   | four      | `arba3a` |
| خمسة    | five      | `khamsa` |
| ستة     | six       | `setta` |
| سبعة    | seven     | `sba3a` |

---

## 5. Loanword policy

Derja freely absorbs from French (colonial), Italian, Turkish, Berber, and
modern English. The policy for Presuntinho is:

1. **French loanwords** → keep French spelling (the user understands it).
   Example: *"Devoirs"* (homework), *"Bibliothèque"*, *"Boutique"*.
   Don't over-transliterate: **`"hub.app.escola.name": "L'ecole"`** (no
   arabicisation) is the correct level of fidelity.
2. **English tech terms** → keep English. *"Bookmark"*, *"streak"*, *"XP"*,
   *"badge"*, *"setup"*, *"toast"*, *"offline"*. Tunisians use these daily.
3. **Arabic/Standard Arabic** for UI concepts → transliterate with the
   consonant table above (drop short vowels where natural):
   *"Transação"* → **"3amila"** (root عمل)
   *"Despesa"* → **"kharch"**
   *"Receita"* → **"dkhoul"**
   *"Hábito"* → **"3ada"**
   *"Tarefa"* → **"khedma"**
4. **Portuguese (pt-PT)** → **NEVER** keep Portuguese words. Always map to
   Derja, French-loan, or English. (This is the main failure mode — `pt-PT`
   translators reaching for cognates like "transação" instead of "3amila".)

---

## 6. Negation and particles

| Particle | Latin | Example                                    |
|----------|-------|--------------------------------------------|
| نحب      | `n7eb` | I want / I love → **n7eb** (1st person)   |
| ما نحبش  | `ma n7ebch` | I don't want → **ma n7ebch** (negator `ch` suffix) |
| باش      | `bech` | in order to / future marker → **bech**    |
| لازم     | `lazem` | must → **lazem**                       |
| كان      | `ken` | was / if → **ken**                         |
| على      | `3ala` | on / at → **3ala**                         |
| هذا      | `hadha` (m) / **hadhi** (f) | this |
| هذاك     | **hadhak** | that (m)                               |
| اللي     | `elli` | that / which → **elli**                    |
| توا      | `tawa` / `daba` | now (Tunis `daba` is most common) |

The **`-ch` suffix** is the universal Derja negator. Attach it to verbs
rather than writing "ma" + verb:
- *"Não guardar"* → **"Mat-sauvegardich"** (root حفظ → `7afdh` → `hafdh` →
  verb form `sauvegardich` is wrong: use **"Ne sauvegarde pas"** or full
  Derja **"Ne saves pas / La tsauvegardich"**). When in doubt, prefer
  the French "Ne…pas" construction — every Tunisian understands it.

---

## 7. Pronouns and address forms

| Person | Latin | Notes                                       |
|--------|-------|---------------------------------------------|
| أنا    | `ana` | I                                          |
| إنتِ   | `enti` | you (f, singular) — used for Fatma         |
| إنتَ   | `enta` | you (m, singular)                          |
| هو     | `howa` | he                                         |
| هي     | `hiya` | she                                        |
| احنا   | `7ana` | we                                         |
| هوما   | `houma` | they                                      |

**Default to `enti` when addressing Fatma.** The product is for her; the UI
should feel intimate.

---

## 8. Capitalisation and punctuation

- **Lowercase only** for Derja content. Even sentence-initial words stay
  lowercase. (Matches Tunisian social-media style.)
- **No period** at the end of button labels or single-line messages.
- **Question mark `?` and exclamation `!`** as normal.
- **Em-dash `—`** is fine and matches French typography already in `tn.json`.
- **Curly braces `{n}`, `{file}`, `{date}`** — preserve as-is; they are
  svelte-i18n interpolation tokens. **Do not** translate the key names.

---

## 9. RTL handling

The `tn` locale is **LTR** (left-to-right). `<html dir="ltr">` is set in
`i18n/index.ts:50` and must stay LTR. Never mix Arabic script into a `tn`
string — that would require RTL context which `tn.json` does not have.

---

## 10. Quick-reference cheatsheet

| pt-PT              | tn latinizado                | Reasoning                              |
|--------------------|------------------------------|----------------------------------------|
| Olá                | Ahla / Sba7 el kheir        | Standard greeting                      |
| Obrigado           | Ya3tik sa7a                  | "May God give you health"              |
| Bem-vindo          | Mer7ba                       | Standard welcome (root رحب → r7b → 7) |
| Palavra-passe      | Kelmt el serr                | "Word of secrecy"                      |
| Escola             | Madrasa                      | School (loan from Arabic madrasa)      |
| Hábito             | 3ada                         | Root ع د → 3ada                        |
| Finanças           | Flous                        | Root فلوس → flous                      |
| Trabalho           | Khedma                       | Root خ د م → khedma                    |
| Despesa            | Kharch                       | Root خ ر ج → kharch                    |
| Receita            | Dkhoul                       | Root د خ ل → dkhoul                    |
| Marcador           | Marque-page / Marker         | French / English loan                  |
| Andamento          | Fi tari9                     | "On the way"                           |
| Erro               | Ghalta                       | Root غ ل ط → ghalta                    |
| Concluído          | Tamma / Kammel               | "It finished"                          |
| Pesquisar          | 9alleb                       | Root ق ل ب → search / flip             |

---

## 11. Examples from the existing `tn.json`

For sanity-check, here are existing strings and how the rules above explain
them:

```json
"hub.app.escola.name": "L'ecole"   ← French loan, dropped capital
"hub.app.financas.name": "Flous"   ← Arabic root, dropped short vowels
"nav.habitos": "3adot"             ← ع د ة → 3adot (feminine -a/-ot)
"nav.financas.aria": "Finances — dépenses w7 comptes"
                                     ← French expense + "w7" (= و + 7)
"splash.choose.subtitle": "Chkoun enti ?"
                                     ← Who are you? (شكون إنتِ)
"splash.choose.fatma": "Ana Fatma"  ← أنا فاطمة (I am Fatma)
"splash.choose.back": "Raja3"       ← رجع (come back) → 3 for 3ayn
"splash.placeholder": "Mot de passe"← French (universal in TN)
"common.save": "Enregistrer"        ← French (universal in TN)
"settings.clear.confirm_button": "Oui, tout effacer"
                                     ← French (universal in TN)
```

The pattern is clear: **UI chrome stays French** (the user-facing chrome
people read in apps), **content words go Derja** (the words people actually
speak). This is how Tunisians naturally code-switch.

---

## 12. Validation checklist (use before merging a tn.json change)

- [ ] No Arabic script characters (Unicode block `0600–06FF`).
- [ ] All `9`, `7`, `3`, `ch`, `gh`, `kh` tokens used where their Arabic
      source letters appear.
- [ ] No Portuguese words unless they're universally-understood loanwords
      ("OK", "FAQ", "menu" — and even those, prefer French in TN context).
- [ ] Interpolation tokens `{n}`, `{file}`, `{date}` preserved.
- [ ] Emoji (🐷, 🌸, 🛠️, 🔒, ❤️) preserved.
- [ ] All lowercase except proper nouns ("Fatma", "Daniel").
- [ ] French chrome (Bouton, Enregistrer, Annuler, Retour, Fermer) left
      in French — do not Derja-ise.

---

## 13. References for future contributors

- [Wikipedia: Tunisian Arabic](https://en.wikipedia.org/wiki/Tunisian_Arabic)
  — phonology and consonant inventory
- [Wikipedia: Derja numerals and pronouns](https://en.wikipedia.org/wiki/Tunisian_Arabic#Grammar)
- The existing `src/lib/i18n/tn.json` (read-only reference for style)
- `docs/architecture.md` § i18n — for the locale-switching architecture

---

*Maintained by Skander 1 — feature branch `feature/i18n-tn-research`.*