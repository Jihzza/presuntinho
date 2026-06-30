import json, sys
# Insert gestao-risco 4 keys into en/tn/fr/ar routes.escola.curso.*
# PT already has them. Add 4 keys (description, tagline, title under escola + title under aulas)
locales = {
    "en": {
        "routes.escola.curso.gestao-risco.description": "Enterprise risk management applied to business: foundations (Knight's definition of risk, strategic/operational/financial/compliance typology, appetite vs tolerance), identification and analysis (brainstorming, Delphi, SWOT, scenario analysis, probability×impact matrices, heatmaps), response and mitigation (4T strategy — Tolerate, Treat, Transfer, Terminate — insurance, hedging, diversification, BCP/DRP), and the main frameworks and standards (ISO 31000 with a 5-step process, COSO ERM 2017 with 5 components and 20 principles, Basel III for credit/market/operational risk, and ESG/climate reporting via TCFD and CSRD).",
        "routes.escola.curso.gestao-risco.tagline": "Business Administration · ISO 31000, COSO ERM, Basel III and TCFD — identify, analyse and respond to enterprise risks",
        "routes.escola.curso.gestao-risco.title": "Risk Management",
        "routes.aulas.curso.gestao-risco.tagline": "Business Administration · ISO 31000, COSO ERM, Basel III and TCFD — identify, analyse and respond to enterprise risks",
        "routes.aulas.curso.gestao-risco.title": "Risk Management",
    },
    "tn": {
        "routes.escola.curso.gestao-risco.description": "Tadhbir l-moukhatarat moutabbaq 3la l-idara: assasiyyat (ta3rif l-moukhatara 3la Knight, tansiq strategik/3amaliyat/mali/ilmoutabiq, l-chahwa vs tassahul), t-tachkhis w t-tahlil (brainstorming, Delphi, SWOT, tahlil l-sinariouhat, matarat l-ihtimal×l-athar, heatmaps), radd w tkhfif (istratijia 4T — Tolerate, Treat, Transfer, Terminate — ta3min, hedging, tanawou3, BCP/DRP), w l-frameworks w lwouaris l-ra2isiyya (ISO 31000 bi 5 marhalaat, COSO ERM 2017 bi 5 3ounasir w 20 mabda, Basileia III li moukhatirat l-i3timan/souq/3amaliyat, w ta9rir ESG/clima 3an tari9 TCFD w CSRD).",
        "routes.escola.curso.gestao-risco.tagline": "Business Administration · ISO 31000, COSO ERM, Basileia III w TCFD — tachkhis, tahlil w radd lil-moukhatirat",
        "routes.escola.curso.gestao-risco.title": "Tadhbir l-Moukhatarat",
        "routes.aulas.curso.gestao-risco.tagline": "Business Administration · ISO 31000, COSO ERM, Basileia III w TCFD — tachkhis, tahlil w radd lil-moukhatirat",
        "routes.aulas.curso.gestao-risco.title": "Tadhbir l-Moukhatarat",
    },
    "fr": {
        "routes.escola.curso.gestao-risco.description": "Gestion des risques appliquée au management d'entreprise : fondamentaux (définition du risque selon Knight, typologie stratégique/opérationnel/financier/conformité, appétit vs tolérance), identification et analyse (brainstorming, Delphi, SWOT, analyse de scénarios, matrices probabilité×impact, heatmaps), réponse et atténuation (stratégie 4T — Tolerate, Treat, Transfer, Terminate — assurances, hedging, diversification, BCP/DRP), et les principaux cadres et normes (ISO 31000 avec processus en 5 étapes, COSO ERM 2017 avec 5 composants et 20 principes, Bâle III pour les risques de crédit/marché/opérationnels, et reporting ESG/climatique via TCFD et CSRD).",
        "routes.escola.curso.gestao-risco.tagline": "Business Administration · ISO 31000, COSO ERM, Bâle III et TCFD — identifier, analyser et répondre aux risques d'entreprise",
        "routes.escola.curso.gestao-risco.title": "Gestion des Risques",
        "routes.aulas.curso.gestao-risco.tagline": "Business Administration · ISO 31000, COSO ERM, Bâle III et TCFD — identifier, analyser et répondre aux risques d'entreprise",
        "routes.aulas.curso.gestao-risco.title": "Gestion des Risques",
    },
    "ar": {
        "routes.escola.curso.gestao-risco.description": "إدارة المخاطر المطبقة على إدارة الأعمال: الأسس (تعريف المخاطر وفق نايت، التصنيف الاستراتيجي/التشغيلي/المالي/الامتثال، الشهية مقابل التحمل)، التحديد والتحليل (العصف الذهني، دلفي، SWOT، تحليل السيناريوهات، مصفوفات الاحتمال×الأثر، الخرائط الحرارية)، الاستجابة والتخفيف (استراتيجية 4T — التحمل، المعالجة، التحويل، الإنهاء — التأمين، التحوط، التنويع، BCP/DRP)، والأطر والمعايير الرئيسية (ISO 31000 بعملية من 5 خطوات، COSO ERM 2017 بـ 5 مكونات و20 مبدأ، بازل III لمخاطر الائتمان/السوق/العمليات، وإبلاغ ESG/المناخ عبر TCFD وCSRD).",
        "routes.escola.curso.gestao-risco.tagline": "إدارة الأعمال · ISO 31000، COSO ERM، بازل III وTCFD — تحديد وتحليل والاستجابة لمخاطر المؤسسة",
        "routes.escola.curso.gestao-risco.title": "إدارة المخاطر",
        "routes.aulas.curso.gestao-risco.tagline": "إدارة الأعمال · ISO 31000، COSO ERM، بازل III وTCFD — تحديد وتحليل والاستجابة لمخاطر المؤسسة",
        "routes.aulas.curso.gestao-risco.title": "إدارة المخاطر",
    },
}

base = r"C:\Users\rafaa\Documents\GitHub\presuntinho\src\lib\i18n"
for loc, keys in locales.items():
    path = f"{base}\\{loc}.json"
    with open(path, encoding='utf-8') as f:
        data = json.load(f)
    before = len(data)
    for k, v in keys.items():
        if k in data:
            print(f"  [skip-existing] {loc} {k}")
            continue
        data[k] = v
    after = len(data)
    # Write back preserving JSON formatting
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write('\n')
    print(f"{loc}: +{after-before} keys (now {after})")

# Verify parity
pt = json.load(open(f"{base}\\pt-PT.json", encoding='utf-8'))
pt_keys = set(pt.keys())
for loc in ['en','tn','fr','ar']:
    o = json.load(open(f"{base}\\{loc}.json", encoding='utf-8'))
    diff = pt_keys.symmetric_difference(set(o.keys()))
    print(f"{loc} symmetric diff vs pt-PT: {len(diff)} ({sorted(diff)[:5]})")