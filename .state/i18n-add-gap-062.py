#!/usr/bin/env python3
"""Add 6 new i18n keys × 5 locales for gap-062 (EasterEggsCard + agente PT strings).

Keys:
- easterEggs.aria.unlocked: "Segredo descoberto"
- easterEggs.aria.locked: "Segredo por descobrir"
- agente.aria.gravar: "Gravar áudio"
- agente.aria.parar_gravacao: "Parar gravação"
- agente.error.send_failed: "Desculpa, tive um erro a processar a mensagem."
- easterEggs.status.unlocked: "🔓 UNLOCKED"
- easterEggs.status.locked: "🔒 LOCKED"
"""
import json
from pathlib import Path

BASE = Path("src/lib/i18n")

TRANSLATIONS = {
    "pt-PT": {
        "easterEggs.aria.unlocked": "Segredo descoberto",
        "easterEggs.aria.locked": "Segredo por descobrir",
        "agente.aria.gravar": "Gravar áudio",
        "agente.aria.parar_gravacao": "Parar gravação",
        "agente.error.send_failed": "Desculpa, tive um erro a processar a mensagem.",
        "easterEggs.status.unlocked": "🔓 DESCOBERTO",
        "easterEggs.status.locked": "🔒 POR DESCOBRIR",
    },
    "en": {
        "easterEggs.aria.unlocked": "Secret discovered",
        "easterEggs.aria.locked": "Secret undiscovered",
        "agente.aria.gravar": "Record audio",
        "agente.aria.parar_gravacao": "Stop recording",
        "agente.error.send_failed": "Sorry, I had an error processing the message.",
        "easterEggs.status.unlocked": "🔓 UNLOCKED",
        "easterEggs.status.locked": "🔒 LOCKED",
    },
    "fr": {
        "easterEggs.aria.unlocked": "Secret découvert",
        "easterEggs.aria.locked": "Secret non découvert",
        "agente.aria.gravar": "Enregistrer l'audio",
        "agente.aria.parar_gravacao": "Arrêter l'enregistrement",
        "agente.error.send_failed": "Désolé, j'ai eu une erreur en traitant le message.",
        "easterEggs.status.unlocked": "🔓 DÉCOUVERT",
        "easterEggs.status.locked": "🔒 À DÉCOUVRIR",
    },
    "ar": {
        "easterEggs.aria.unlocked": "تم اكتشاف السر",
        "easterEggs.aria.locked": "السر لم يُكتشف بعد",
        "agente.aria.gravar": "تسجيل الصوت",
        "agente.aria.parar_gravacao": "إيقاف التسجيل",
        "agente.error.send_failed": "آسف، حدث خطأ أثناء معالجة الرسالة.",
        "easterEggs.status.unlocked": "🔓 مكتشف",
        "easterEggs.status.locked": "🔒 غير مكتشف",
    },
    "tn": {
        "easterEggs.aria.unlocked": "Secret descoberto",
        "easterEggs.aria.locked": "Secret ainda não descoberto",
        "agente.aria.gravar": "Gravar áudio",
        "agente.aria.parar_gravacao": "Parar gravação",
        "agente.error.send_failed": "Desculpa, tive um erro a processar a mensagem.",
        "easterEggs.status.unlocked": "🔓 DESCOBERTO",
        "easterEggs.status.locked": "🔒 POR DESCOBRIR",
    },
}

ALPHA_ORDER = ["ar", "en", "fr", "pt-PT", "tn"]

for locale in ALPHA_ORDER:
    fp = BASE / f"{locale}.json"
    obj = json.loads(fp.read_text(encoding="utf-8"))
    keys = TRANSLATIONS[locale]
    for k, v in keys.items():
        if k in obj:
            print(f"SKIP {locale}: {k} already present")
        else:
            obj[k] = v
            print(f"+ {locale}: {k}")
    fp.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("DONE")