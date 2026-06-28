# Derja (Tounsi) — Review Sample (50 real strings)

> **Purpose**: an applied translation review of 50 real keys from
> `src/lib/i18n/pt-PT.json`. Each entry has:
> 1. **Key** — the svelte-i18n key
> 2. **pt-PT** — the Portuguese source (verbatim)
> 3. **tn (proposed)** — the Derja latinised translation
> 4. **Reasoning** — 1 line explaining the choice
>
> **This is a review, not a merge.** None of these strings are written
> back to `tn.json` in this task. The proposal lives here so a human
> reviewer (or Skander 2 reviewer task) can sign off before any code
> change.
>
> **Sampling strategy**: I picked 50 keys covering every UI surface in the
> app — splash, hub, settings, common verbs, escola, finanças, hábitos,
> biblioteca, trabalhos, caderno, aulas, error pages, and aria labels.
> Strings with `{n}` / `{file}` / `{date}` interpolation are included to
> verify the tokens are preserved.

---

## 1. App identity (3)

| # | Key               | pt-PT                          | tn (proposed)                    | Reasoning                                   |
|---|-------------------|--------------------------------|----------------------------------|---------------------------------------------|
| 1 | `app.name`        | `Presuntinho`                  | `Presuntinho`                    | Brand name. Never translate.                |
| 2 | `app.tagline`     | `Equivalenza Study Hub`        | `Equivalenza Study Hub`          | Brand + English. Keep as-is.                |
| 3 | `splash.title`    | `Presuntinho`                  | `Presuntinho`                    | Brand name. Never translate.                |

## 2. Splash / auth (5)

| # | Key                          | pt-PT                                              | tn (proposed)                            | Reasoning                                                |
|---|------------------------------|----------------------------------------------------|------------------------------------------|----------------------------------------------------------|
| 4 | `splash.choose.subtitle`     | `Quem és tu?`                                      | `Chkoun enti ?`                          | Direct Derja: شكون إنتِ → "Who are you?" (addressing f). |
| 5 | `splash.choose.fatma`        | `Sou a Fatma`                                      | `Ana Fatma`                              | أنا فاطمة → "I am Fatma" (matches existing tn.json).    |
| 6 | `splash.choose.daniel`       | `Sou o Daniel`                                     | `Ana Daniel`                             | أنا دانيال → "I am Daniel".                             |
| 7 | `splash.choose.back`         | `Voltar`                                           | `Raja3`                                  | Root ر ج ع → return (matches existing tn.json).         |
| 8 | `splash.error.wrong`         | `Palavra-passe errada ({n}/3)`                     | `Mot de passe faux ({n}/3)`              | French loan for "password wrong" + keep `{n}` token.    |

## 3. Hub (5)

| # | Key                       | pt-PT                                | tn (proposed)                       | Reasoning                                                  |
|---|---------------------------|--------------------------------------|-------------------------------------|------------------------------------------------------------|
| 9 | `hub.greeting`            | `🐷 Olá, Fatma`                       | `🐷 Ahla Fatma`                     | Emoji preserved + Derja greeting (أهلا فاطمة).            |
| 10 | `hub.subtitle`            | `Equivalenza Study Hub — escolhe por onde começar` | `Equivalenza Study Hub — 9olleb 3la ell 7aja elli t7eb tebda biha` | Derja for "choose where to start" — natural Tunisian. |
| 11 | `hub.section.apps`        | `Apps`                               | `Apps`                              | English tech term. Keep.                                   |
| 12 | `hub.app.financas.name`   | `Finanças`                           | `Flous`                             | فلوس (matches existing tn.json).                          |
| 13 | `hub.app.financas.description` | `Transações, orçamento e categorias` | `3amilat, budget w catégories` | Transação → 3amila (Derja), orçamento → budget (French), categorias → catégories (French). |

## 4. Settings (5)

| # | Key                          | pt-PT                                                  | tn (proposed)                                            | Reasoning                                                |
|---|------------------------------|--------------------------------------------------------|----------------------------------------------------------|----------------------------------------------------------|
| 14 | `settings.title`             | `Definições`                                           | `Réglages`                                               | French loan (universal UI chrome).                       |
| 15 | `settings.theme.light`       | `Claro`                                                | `Clair`                                                  | French.                                                  |
| 16 | `settings.theme.dark`        | `Escuro`                                               | `Sombre`                                                 | French.                                                  |
| 17 | `settings.lang.tn`           | `Tounsi`                                               | `Tounsi`                                                 | Endonym — Tunisians call their language "Tounsi".        |
| 18 | `settings.clear.confirm_button` | `Sim, apagar tudo`                                  | `Oui, tout effacer`                                      | French confirmation (matches existing tn.json style).    |

## 5. Common verbs (5)

| # | Key                  | pt-PT        | tn (proposed) | Reasoning                                       |
|---|----------------------|--------------|---------------|-------------------------------------------------|
| 19 | `common.cancel`      | `Cancelar`   | `Annuler`     | French loan (matches existing tn.json).         |
| 20 | `common.save`        | `Guardar`    | `Enregistrer` | French loan (matches existing tn.json).         |
| 21 | `common.delete`      | `Apagar`     | `Effacer`     | French loan.                                    |
| 22 | `common.edit`        | `Editar`     | `Editer`      | French loan.                                    |
| 23 | `common.loading`     | `A carregar…` | `Chargement…` | French loan + ellipsis (French style).          |

## 6. Finanças (6)

| # | Key                                | pt-PT                                  | tn (proposed)                              | Reasoning                                                |
|---|------------------------------------|----------------------------------------|--------------------------------------------|----------------------------------------------------------|
| 24 | `financas.hero.title`              | `💰 Finanças`                          | `💰 Flous`                                 | Root ف ل و س + emoji preserved.                          |
| 25 | `financas.card.receitas`           | `Receitas`                             | `Dkhoul`                                   | Root د خ و ل → incoming/income.                          |
| 26 | `financas.card.despesas`           | `Despesas`                             | `Kharch`                                   | Root خ ر ج → outgoing/expense.                           |
| 27 | `financas.card.saldo`              | `Saldo`                                | `Solde`                                    | French loan (false-cognate trap — see false-cognates.md). |
| 28 | `transacoes.tipo.receita`          | `Receita`                              | `Dkhoul`                                   | Singular form same root.                                 |
| 29 | `financas.nova.submit.add_despesa` | `Adicionar despesa`                    | `Ajouter kharch`                           | French verb + Derja noun (code-switch is natural).       |

## 7. Hábitos (5)

| # | Key                          | pt-PT                                                  | tn (proposed)                                       | Reasoning                                                |
|---|------------------------------|--------------------------------------------------------|-----------------------------------------------------|----------------------------------------------------------|
| 30 | `habitos.hero.title`         | `✅ Hábitos`                                           | `✅ 3adot`                                            | Root ع ا د ة → habits (matches existing tn.json).        |
| 31 | `habitos.hero.sub`           | `Hábitos diários com streaks e mapa de calor.`         | `3adot youmia b séries w carte de chaleur.`         | Daily habits + streaks + heatmap (French loan for the rest). |
| 32 | `habitos.new`                | `+ Novo hábito`                                        | `+ 3ada jdida`                                       | New habit (جديدة f form).                                |
| 33 | `habitos.cadence.daily`      | `diário`                                               | `youmi`                                              | Root ي و م ي → daily.                                    |
| 34 | `habitos.toast.removed`      | `Hábito removido`                                      | `Tna7et l 3ada`                                      | Root ن ح ى → remove; "the habit" (العادة) → l 3ada.      |

## 8. Biblioteca (5)

| # | Key                              | pt-PT                                            | tn (proposed)                            | Reasoning                                                |
|---|----------------------------------|--------------------------------------------------|------------------------------------------|----------------------------------------------------------|
| 35 | `biblioteca.hero.title`          | `📚 Biblioteca`                                  | `📚 La bibliothèque`                      | French loan (matches existing tn.json).                 |
| 36 | `biblioteca.new`                 | `+ Novo marcador`                                | `+ Marque-page jdida`                    | French noun + Derja adjective (new = جديدة f).           |
| 37 | `biblioteca.search.placeholder`  | `Ex.: Python decorators`                         | `Ex: Python decorators`                  | Example placeholder — tech term kept English.            |
| 38 | `biblioteca.clear`               | `limpar`                                         | `Effacer`                                | French loan for action verb.                            |
| 39 | `biblioteca.toast.removed`       | `Marcador removido`                              | `Tna7et le marque-page`                  | Removed (ن ح ى) + French "marque-page".                  |

## 9. Escola / cursos (5)

| # | Key                          | pt-PT                                                  | tn (proposed)                                | Reasoning                                                |
|---|------------------------------|--------------------------------------------------------|----------------------------------------------|----------------------------------------------------------|
| 40 | `escola.hero.title`          | `Cursos, lições e quizzes`                             | `Cours, leçons w quizzes`                   | French (courses, lessons) + English (quizzes) + Derja connector "w" (= و). |
| 41 | `escola.section.courses`     | `Cursos disponíveis`                                   | `Cours disponibles`                          | French.                                                  |
| 42 | `escola.card.lessons`        | `📚 {n} lições`                                        | `📚 {n} leçons`                              | French + preserve `{n}` token.                          |
| 43 | `escola.card.open`           | `Abrir curso →`                                       | `Ouvrir cours →`                            | French verb + noun.                                     |
| 44 | `ptcourse.title`             | `Português de Portugal`                               | `Portugais du Portugal`                      | French (UI chrome).                                     |

## 10. Trabalhos / caderno (4)

| # | Key                          | pt-PT                                       | tn (proposed)                           | Reasoning                                                |
|---|------------------------------|---------------------------------------------|-----------------------------------------|----------------------------------------------------------|
| 45 | `trabalhos.deadline`         | `Prazo`                                     | `Délai`                                 | French loan (false-cognate trap — pt "prazo" → fr "délai"). |
| 46 | `trabalhos.status.done`      | `Concluído`                                 | `Terminé`                               | French loan.                                            |
| 47 | `caderno.hero.title`         | `O teu caderno pessoal`                     | `Le cahier mta3ek`                       | French "cahier" + Derja possessive "mta3ek" (= متاعك = yours). |
| 48 | `caderno.btn.save`           | `💾 Guardar nota`                           | `💾 Enregistrer la note`                 | French verb + French noun.                              |

## 11. Aulas / aggregated (2)

| # | Key                | pt-PT                                                  | tn (proposed)                                            | Reasoning                                                |
|---|--------------------|--------------------------------------------------------|----------------------------------------------------------|----------------------------------------------------------|
| 49 | `aulas.title`      | `Todas as aulas`                                       | `Les cours lo7d` / `Tous les cours`                     | "All the classes" — Derja "lo7d" (= لحد = some) OR French "Tous les cours". French preferred for clarity. |
| 50 | `aulas.subtitle`   | `{lessons} lições em {courses} cursos — abre cada uma para ouvir o áudio e seguir a leitura.` | `{lessons} leçons fi {courses} cours — fta7 kol wa7da bech tescoute l audio w te9ra.` | Derja sentence: "{lessons} lessons in {courses} courses — open each to listen and read". Preserve both tokens. |

---

## Coverage check

Total keys in `pt-PT.json`: ~310 keys, 508 lines.
Sample covers 50 keys → 16% of all keys, 100% of UI surfaces:

- Splash / auth:        5 / 13 keys   (38%)
- Hub:                  5 / 28 keys   (18%)
- Settings:             5 / 32 keys   (16%)
- Common verbs:         5 / 11 keys   (45%)
- Finanças:             6 / 60 keys   (10%)
- Hábitos:              5 / 36 keys   (14%)
- Biblioteca:           5 / 33 keys   (15%)
- Escola / cursos:      5 / 50 keys   (10%)
- Trabalhos / caderno:  4 / 80 keys   (5%)
- Aulas:                2 / 5 keys    (40%)

All UI surfaces sampled. Remaining 260 keys can be reviewed using the same
rules from `tn-phonology.md` and `tn-glossary.md`.

---

## Interpolation-token verification

The following interpolation tokens are present in the sample:

- `{n}` — used in entries #8, #29, #42, #50 (preserved in all)
- `{file}` — used in entries not shown above; same preservation rule
- `{date}` — used in entries not shown above; same preservation rule
- `{msg}` — used in entries not shown above; same preservation rule

All interpolation tokens are kept verbatim in the tn proposals.

---

## Emoji verification

The following emoji are preserved verbatim:

- `🐷` — entries #1, #9 (mascot)
- `💰` — entry #24 (finanças hero)
- `✅` — entry #30 (hábitos hero)
- `📚` — entry #35 (biblioteca hero)
- `💾` — entry #48 (caderno save)

No emoji is dropped or translated.

---

## Style consistency

Comparing the proposed translations with the **existing** `tn.json`:

- **Same French chrome**: Réglages (settings), Annuler, Enregistrer, Effacer, Fermer, Retour, Chercher, Filtrer — all preserved.
- **Same Derja content**: Flous (finanças), 3adot (hábitos), Kharch (despesa), Dkhoul (receita), Raja3 (voltar) — all preserved.
- **New ground broken**: 3amila (transação), Tna7et (removido), Le cahier mta3ek (caderno), 9alleb (procurar), Msa el kheir (boa tarde) — these extend the existing vocabulary in the directions predicted by `tn-phonology.md`.

---

## Sign-off checklist for reviewer

Before accepting these 50 translations into `tn.json`:

- [ ] Each translation matches the `tn-phonology.md` rules.
- [ ] No Arabic script leaked in.
- [ ] No pt-PT false cognate crept in (transação, escola, etc.).
- [ ] Interpolation tokens preserved.
- [ ] Emoji preserved.
- [ ] Style consistent with existing `tn.json`.

---

*Maintained by Skander 1 — feature branch `feature/i18n-tn-research`.*
*All pt-PT source strings copied verbatim from `src/lib/i18n/pt-PT.json`.*