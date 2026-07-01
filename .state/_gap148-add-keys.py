"""gap-148 — Add 13 secrets.* i18n keys × 5 locales = 65 entries.

Then audit parity and produce patch for /secrets/+page.svelte.
"""
import json
from pathlib import Path

LOCALES = ["pt-PT", "en", "tn", "fr", "ar"]
BASE = Path("src/lib/i18n")

# 13 new keys to add under "secrets." namespace.
# Each value is per-locale (PT-EN-TN-FR-AR).
NEW_KEYS = {
    "secrets.counter.discovered": {
        "pt-PT": "{discovered} / {total} descobertos",
        "en":     "{discovered} / {total} discovered",
        "tn":     "{discovered} / {total} decouverts",
        "fr":     "{discovered} / {total} découverts",
        "ar":     "{discovered} / {total} مكتشفة",
    },
    "secrets.error.loadFailed": {
        "pt-PT": "⚠️ Não foi possível ler o estado: {error}",
        "en":     "⚠️ Couldn't read state: {error}",
        "tn":     "⚠️ Impossible de lire l'état: {error}",
        "fr":     "⚠️ Impossible de lire l'état : {error}",
        "ar":     "⚠️ تعذّرت قراءة الحالة: {error}",
    },
    "secrets.findAll.title": {
        "pt-PT": "🗝️ Encontra-os todos",
        "en":     "🗝️ Find them all",
        "tn":     "🗝️ Trouvez-les tous",
        "fr":     "🗝️ Trouvez-les tous",
        "ar":     "🗝️ اعثر عليها كلها",
    },
    "secrets.findAll.body": {
        "pt-PT": "Clica, escreve e explora. Alguns segredos recompensam-te instantaneamente; outros revelam-se quando fores mais fundo. Cada descoberta fica guardada no teu browser — fecha a página e o teu progresso persiste.",
        "en":     "Click, type, and explore. Some secrets reward you instantly; others reveal themselves when you go deeper. Each discovery is saved in your browser — close the page and your progress persists.",
        "tn":     "Clique, écrivez et explorez. Certains secrets vous récompensent instantanément ; d'autres se révèlent quand vous allez plus loin. Chaque découverte est sauvegardée dans votre navigateur — fermez la page et votre progression persiste.",
        "fr":     "Cliquez, écrivez et explorez. Certains secrets vous récompensent instantanément ; d'autres se révèlent quand vous allez plus loin. Chaque découverte est sauvegardée dans votre navigateur — fermez la page et votre progression persiste.",
        "ar":     "انقر واكتب واستكشف. بعض الأسرار تكافئك فورًا؛ وأخرى تكشف عن نفسها عندما تتعمّق أكثر. كل اكتشاف يُحفظ في متصفحك — أغلق الصفحة ويبقى تقدّمك محفوظًا.",
    },
    "secrets.tiers.counter": {
        "pt-PT": "{unlocked} / {total} desbloqueados",
        "en":     "{unlocked} / {total} unlocked",
        "tn":     "{unlocked} / {total} débloqués",
        "fr":     "{unlocked} / {total} débloqués",
        "ar":     "{unlocked} / {total} مفتوحة",
    },
    "secrets.tiers.help": {
        "pt-PT": "Clica no ❤️ no Hub para subir os tiers. Cada tier recompensa-te com XP e confetti.",
        "en":     "Click the ❤️ on the Hub to climb tiers. Each tier rewards you with XP and confetti.",
        "tn":     "Cliquez sur le ❤️ dans le Hub pour monter les niveaux. Chaque niveau vous récompense avec de l'XP et des confettis.",
        "fr":     "Cliquez sur le ❤️ dans le Hub pour monter les niveaux. Chaque niveau vous récompense avec de l'XP et des confettis.",
        "ar":     "انقر على ❤️ في الـ Hub لتصعد المستويات. كل مستوى يكافئك بـ XP وأوراق احتفال.",
    },
    "secrets.tiers.yourClicks": {
        "pt-PT": "Tuas cliques: {count}",
        "en":     "Your clicks: {count}",
        "tn":     "Vos clics : {count}",
        "fr":     "Vos clics : {count}",
        "ar":     "نقراتك: {count}",
    },
    "secrets.tiers.aria": {
        "pt-PT": "{at} cliques: {msg} — {status}",
        "en":     "{at} clicks: {msg} — {status}",
        "tn":     "{at} clics : {msg} — {status}",
        "fr":     "{at} clics : {msg} — {status}",
        "ar":     "{at} نقرات: {msg} — {status}",
    },
    "secrets.badges.counter": {
        "pt-PT": "{unlocked} / {total} desbloqueados",
        "en":     "{unlocked} / {total} unlocked",
        "tn":     "{unlocked} / {total} débloqués",
        "fr":     "{unlocked} / {total} débloqués",
        "ar":     "{unlocked} / {total} مفتوحة",
    },
    "secrets.badges.body": {
        "pt-PT": "15 conquistas para coleccionar. As bloqueadas ficam a cinzento até as desbloqueares.",
        "en":     "15 achievements to collect. Locked ones stay grayscale until you unlock them.",
        "tn":     "15 succès à collectionner. Ceux qui sont verrouillés restent en niveaux de gris jusqu'à ce que vous les débloquiez.",
        "fr":     "15 succès à collectionner. Ceux qui sont verrouillés restent en niveaux de gris jusqu'à ce que vous les débloquiez.",
        "ar":     "15 إنجازات لجمعها. تبقى المقفلة رمادية حتى تفتحها.",
    },
    "secrets.badge.lockedAria": {
        "pt-PT": "Conquistado {name}: bloqueado.",
        "en":     "Earned {name}: locked.",
        "tn":     "Gagné {name} : verrouillé.",
        "fr":     "Gagné {name} : verrouillé.",
        "ar":     "مكسوب {name}: مقفل.",
    },
    "secrets.badge.aria": {
        "pt-PT": "Distintivo {name}",
        "en":     "Badge {name}",
        "tn":     "Badge {name}",
        "fr":     "Badge {name}",
        "ar":     "شارة {name}",
    },
    "secrets.status.unlocked": {
        "pt-PT": "Desbloqueado",
        "en":     "Unlocked",
        "tn":     "Débloqué",
        "fr":     "Débloqué",
        "ar":     "مفتوح",
    },
}

# Update all 5 locales
for loc in LOCALES:
    path = BASE / f"{loc}.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    for key, val in NEW_KEYS.items():
        data[key] = val[loc]
    # Write back with 2-space indent + trailing newline + ensure_ascii=False
    path.write_text(
        json.dumps(data, indent=2, ensure_ascii=False, sort_keys=False) + "\n",
        encoding="utf-8"
    )
    print(f"[ok] {loc}: {len(NEW_KEYS)} keys added")

# Now audit
print("\n=== PARITY CHECK ===")
pt = json.loads((BASE / "pt-PT.json").read_text(encoding="utf-8"))
pt_keys = set()
def walk(o, prefix=""):
    if isinstance(o, dict):
        for k, v in o.items():
            walk(v, prefix + k + ".")
    else:
        pt_keys.add(prefix[:-1])
walk(pt)
print(f"PT total: {len(pt_keys)}")
total_missing = 0
for loc in LOCALES[1:]:
    d = json.loads((BASE / f"{loc}.json").read_text(encoding="utf-8"))
    this_keys = set()
    def wloc(o, prefix=""):
        if isinstance(o, dict):
            for k, v in o.items():
                wloc(v, prefix + k + ".")
        else:
            this_keys.add(prefix[:-1])
    wloc(d)
    missing = sorted(pt_keys - this_keys)
    extra = this_keys - pt_keys
    print(f"  {loc:6}: parity={len(this_keys)}/{len(pt_keys)} missing={len(missing)} extra={len(extra)}")
    total_missing += len(missing)
print(f"TOTAL MISSING: {total_missing}")