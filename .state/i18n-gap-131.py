#!/usr/bin/env python3
"""gap-131: add gestao-risco i18n keys to 5 locales (en, es, fr, ar, tn)."""
import json
from pathlib import Path

ROOT = Path("src/lib/i18n")

EN = {
    "routes.aulas.curso.gestao-risco.tagline": "Business Administration · ISO 31000, COSO ERM, Basel III and TCFD — identify, analyse and respond to business risks",
    "routes.aulas.curso.gestao-risco.title": "Risk Management",
    "routes.escola.curso.gestao-risco.description": "Risk management applied to business management: fundamentals (Knight's definition of risk, strategic/operational/financial/compliance typology, appetite vs tolerance), identification and analysis (brainstorming, Delphi, SWOT, scenario analysis, probability x impact matrices, heatmaps), response and mitigation (4T strategy - Tolerate, Treat, Transfer, Terminate - insurance, hedging, diversification, BCP/DRP), and the main frameworks and standards (ISO 31000 with 5-step process, COSO ERM 2017 with 5 components and 20 principles, Basel III for credit/market/operational risk, and ESG/climate reporting via TCFD and CSRD).",
    "routes.escola.curso.gestao-risco.tagline": "Business Administration · ISO 31000, COSO ERM, Basel III and TCFD - identify, analyse and respond to business risks",
    "routes.escola.curso.gestao-risco.title": "Risk Management",
    "routes.escola.quiz.grq.title": "Quiz: Risk Management",
    "routes.escola.quiz.grq.description": "10 questions to test your knowledge of risk management: Knight's risk vs uncertainty, 4T response strategy, ISO 31000, COSO ERM, Basel III and TCFD."
}
ES = {
    "routes.aulas.curso.gestao-risco.tagline": "Business Administration - ISO 31000, COSO ERM, Basilea III y TCFD - identificar, analizar y responder a riesgos empresariales",
    "routes.aulas.curso.gestao-risco.title": "Gestion de Riesgo",
    "routes.escola.curso.gestao-risco.description": "Gestion de riesgo aplicada a la gestion empresarial: fundamentos (definicion de riesgo segun Knight, tipologia estrategia/operativa/financiera/cumplimiento, apetito vs tolerancia), identificacion y analisis (lluvia de ideas, Delphi, DAFO, analisis de escenarios, matrices probabilidad x impacto, mapas de calor), respuesta y mitigacion (estrategia 4T - Tolerar, Tratar, Transferir, Terminar - seguros, cobertura, diversificacion, BCP/DRP), y los principales marcos y normas (ISO 31000 con proceso en 5 etapas, COSO ERM 2017 con 5 componentes y 20 principios, Basilea III para riesgo de credito/mercado/operacional, y reporting ESG/clima via TCFD y CSRD).",
    "routes.escola.curso.gestao-risco.tagline": "Business Administration - ISO 31000, COSO ERM, Basilea III y TCFD - identificar, analizar y responder a riesgos empresariales",
    "routes.escola.curso.gestao-risco.title": "Gestion de Riesgo",
    "routes.escola.quiz.grq.title": "Cuestionario: Gestion de Riesgo",
    "routes.escola.quiz.grq.description": "10 preguntas para poner a prueba tus conocimientos de gestion de riesgo: riesgo vs incertidumbre segun Knight, estrategia 4T de respuesta, ISO 31000, COSO ERM, Basilea III y TCFD."
}
FR = {
    "routes.aulas.curso.gestao-risco.tagline": "Business Administration - ISO 31000, COSO ERM, Bale III et TCFD - identifier, analyser et repondre aux risques d'entreprise",
    "routes.aulas.curso.gestao-risco.title": "Gestion des Risques",
    "routes.escola.curso.gestao-risco.description": "Gestion des risques appliquee a la gestion d'entreprise: fondamentaux (definition du risque selon Knight, typologie strategique/operationnel/financier/conformite, appetit vs tolerance), identification et analyse (brainstorming, Delphi, SWOT, analyse de scenarios, matrices probabilite x impact, heatmaps), reponse et attenuation (strategie 4T - Tolerer, Traiter, Transferer, Terminer - assurances, couverture, diversification, PCA/PRA), et les principaux cadres et normes (ISO 31000 avec processus en 5 etapes, COSO ERM 2017 avec 5 composants et 20 principes, Bale III pour le risque de credit/marche/operationnel, et reporting ESG/climat via TCFD et CSRD).",
    "routes.escola.curso.gestao-risco.tagline": "Business Administration - ISO 31000, COSO ERM, Bale III et TCFD - identifier, analyser et repondre aux risques d'entreprise",
    "routes.escola.curso.gestao-risco.title": "Gestion des Risques",
    "routes.escola.quiz.grq.title": "Quiz : Gestion des Risques",
    "routes.escola.quiz.grq.description": "10 questions pour tester vos connaissances en gestion des risques : risque vs incertitude selon Knight, strategie 4T de reponse, ISO 31000, COSO ERM, Bale III et TCFD."
}
AR = {
    "routes.aulas.curso.gestao-risco.tagline": "ادارة اعمال - ISO 31000 و COSO ERM وبازل III و TCFD - تحديد المخاطر وتحليلها والاستجابة لها",
    "routes.aulas.curso.gestao-risco.title": "ادارة المخاطر",
    "routes.escola.curso.gestao-risco.description": "ادارة المخاطر المطبقة على ادارة الاعمال: الاساسيات (تعريف المخاطر حسب نايت، الانواع الاستراتيجية/التشغيلية/المالية/الامتثال، الشهية مقابل التحمل)، التحديد والتحليل (العصف الذهني ودلفي وتحليل SWOT وتحليل السيناريوهات ومصفوفات الاحتمالxالاثر)، الاستجابة والتخفيف (استراتيجية 4T - التحمل والمعالجة والنقل والانهاء - التأمين والتحوط والتنويع وخطط استمرارية الاعمال)، وابرز الاطار والمعايير (ISO 31000 بعملية من 5 خطوات، COSO ERM 2017 بـ 5 مكونات و20 مبدا، بازل III لمخاطر الائتمان/السوق/التشغيل، وابلاغ ESG/المناخ عبر TCFD وCSRD).",
    "routes.escola.curso.gestao-risco.tagline": "ادارة اعمال - ISO 31000 و COSO ERM وبازل III و TCFD - تحديد المخاطر وتحليلها والاستجابة لها",
    "routes.escola.curso.gestao-risco.title": "ادارة المخاطر",
    "routes.escola.quiz.grq.title": "اختبار: ادارة المخاطر",
    "routes.escola.quiz.grq.description": "10 اسئلة لاختبار معرفتك بادارة المخاطر: المخاطر مقابل عدم اليقين حسب نايت، استراتيجية الاستجابة 4T، ISO 31000، COSO ERM، بازل III وTCFD."
}
TN = {
    "routes.aulas.curso.gestao-risco.tagline": "ادارة اعمال - ISO 31000 و COSO ERM وبازل III و TCFD - تعرف المخاطر وحللها ورد عليها",
    "routes.aulas.curso.gestao-risco.title": "تسيير المخاطر",
    "routes.escola.curso.gestao-risco.description": "تسيير المخاطر في ادارة الاعمال: الاساسيات (تعريف الخطر حسب نايت، الانواع استراتيجية/تشغيلية/مالية/امتثال، الشهية مقابل التحمل)، التعرف والتحليل (العصف الذهني ودلفي وSWOT وتحليل السيناريوهات ومصفوفات الاحتمالxالاثر)، الرد والتخفيف (استراتيجية 4T - تحمل، عالج، حول، انه - التأمين والتحوط والتنويع وخطط استمرارية الاعمال)، وابرز الاطار (ISO 31000 بعملية 5 مراحل، COSO ERM 2017 بـ5 مكونات و20 مبدا، بازل III لمخاطر الائتمان/السوق/التشغيل، وتقارير ESG/المناخ عبر TCFD وCSRD).",
    "routes.escola.curso.gestao-risco.tagline": "ادارة اعمال - ISO 31000 و COSO ERM وبازل III و TCFD - تعرف المخاطر وحللها ورد عليها",
    "routes.escola.curso.gestao-risco.title": "تسيير المخاطر",
    "routes.escola.quiz.grq.title": "اختبار: تسيير المخاطر",
    "routes.escola.quiz.grq.description": "10 اسئلة لاختبار معرفتك بتسيير المخاطر: الخطر مقابل عدم اليقين حسب نايت، استراتيجية الرد 4T، ISO 31000، COSO ERM، بازل III وTCFD."
}

PER_LOCALE = {"en.json": EN, "fr.json": FR, "ar.json": AR, "tn.json": TN}

pt = json.loads((ROOT / "pt-PT.json").read_text(encoding="utf-8"))

# Get the gestao-risco keys from pt-PT to know what to add
pt_keys_to_add = [k for k in [
    "routes.aulas.curso.gestao-risco.tagline",
    "routes.aulas.curso.gestao-risco.title",
    "routes.escola.curso.gestao-risco.description",
    "routes.escola.curso.gestao-risco.tagline",
    "routes.escola.curso.gestao-risco.title",
] if any(k.split(".")[-1] in str(pt) for k in [k])]

# Just add what each locale is missing
def get_nested(d, path):
    cur = d
    for p in path.split("."):
        if isinstance(cur, dict) and p in cur:
            cur = cur[p]
        else:
            return None
    return cur

def set_nested(d, path, val):
    parts = path.split(".")
    cur = d
    for p in parts[:-1]:
        cur = cur.setdefault(p, {})
    cur[parts[-1]] = val

# Add all 7 keys to each non-pt locale
for fname, keys in PER_LOCALE.items():
    p = ROOT / fname
    d = json.loads(p.read_text(encoding="utf-8"))
    added = 0
    for k, v in keys.items():
        if get_nested(d, k) is None:
            set_nested(d, k, v)
            added += 1
    p.write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"  {fname}: +{added} keys")

# Verify - count gestao-risco.* keys in each locale
print("\n--- gestao-risco key counts ---")
gr_keys = [
    "routes.aulas.curso.gestao-risco.title",
    "routes.aulas.curso.gestao-risco.tagline",
    "routes.escola.curso.gestao-risco.title",
    "routes.escola.curso.gestao-risco.tagline",
    "routes.escola.curso.gestao-risco.description",
    "routes.escola.quiz.grq.title",
    "routes.escola.quiz.grq.description",
]
for fname in ["pt-PT.json", "en.json", "fr.json", "ar.json", "tn.json"]:
    d = json.loads((ROOT / fname).read_text(encoding="utf-8"))
    have = sum(1 for k in gr_keys if get_nested(d, k) is not None)
    print(f"  {fname}: {have}/{len(gr_keys)} gestao-risco keys")
print("DONE")
