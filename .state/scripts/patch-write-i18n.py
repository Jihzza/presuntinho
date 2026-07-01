#!/usr/bin/env python3
"""One-shot: add i18n keys for /write/ page TIPS + h1 + CTA to all 5 locales.
Idempotent — re-running overwrites the same keys.
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

TIPS = {
    'variation': {
        'pt-PT': {
            'icon': '✍️',
            'title': 'Variação de frases',
            'problem': 'O problema: texto de IA tende a ter comprimento uniforme de frase e transições previsíveis ("Moreover,", "Furthermore,", "Additionally,").',
            'fix': 'A solução:',
            'points': [
                'Alterna comprimentos: frases curtas e diretas. Depois mais longas com subordinação. Depois médias.',
                'Começa de formas diferentes: às vezes com "eu", às vezes com uma pergunta, às vezes com uma cláusula.',
                'Evita empilhar 3+ "Moreover-Furthermore-Additionally" no mesmo parágrafo.'
            ]
        },
        'en': {
            'icon': '✍️',
            'title': 'Sentence variation',
            'problem': 'The problem: AI text tends to have uniform sentence length and predictable transitions ("Moreover,", "Furthermore,", "Additionally,").',
            'fix': 'The fix:',
            'points': [
                'Vary lengths: short and direct sentences. Then longer with subordination. Then medium.',
                'Start in different ways: sometimes with "I", sometimes with a question, sometimes with a clause.',
                'Avoid stacking 3+ "Moreover-Furthermore-Additionally" in the same paragraph.'
            ]
        },
        'fr': {
            'icon': '✍️',
            'title': 'Variation des phrases',
            'problem': 'Le problème: les textes d\'IA ont tendance à avoir une longueur uniforme de phrase et des transitions prévisibles ("Moreover,", "Furthermore,", "Additionally,").',
            'fix': 'La solution:',
            'points': [
                'Alterne les longueurs: phrases courtes et directes. Puis plus longues avec subordination. Puis moyennes.',
                'Commencez différemment: parfois par "je", parfois par une question, parfois par une proposition.',
                'Évitez d\'empiler 3+ "Moreover-Furthermore-Additionally" dans le même paragraphe.'
            ]
        },
        'ar': {
            'icon': '✍️',
            'title': 'تنويع الجمل',
            'problem': 'المشكلة: النصوص المكتوبة بالذكاء الاصطناعي تميل إلى طول جملة موحد وانتقالات متوقعة ("Moreover,", "Furthermore,", "Additionally,").',
            'fix': 'الحل:',
            'points': [
                'تنويع الأطوال: جمل قصيرة ومباشرة. ثم أطول مع التابعية. ثم متوسطة.',
                'ابدأ بطرق مختلفة: أحياناً بـ "أنا"، أحياناً بسؤال، أحياناً بعبارة اعتراضية.',
                'تجنب تكديس 3+ من "Moreover-Furthermore-Additionally" في نفس الفقرة.'
            ]
        },
        'tn': {
            'icon': '✍️',
            'title': 'Variations fel phrases',
            'problem': 'El problem: text mta3 IA tendi ykoun andou longueur uniforme fel phrases w transitions previsibles ("Moreover,", "Furthermore,", "Additionally,").',
            'fix': 'El fix:',
            'points': [
                'Badel les longueurs: phrases courtes w directes. Ba3d plus longues bin subordinations. Ba3d moyennes.',
                'Bda b toroq mokhtalfa: har marra b "ana", har marra b so2al, har marra b clause.',
                'Eviti t t3od 3+ "Moreover-Furthermore-Additionally" fel nafs el paragraph.'
            ]
        }
    },
    'voice': {
        'pt-PT': {
            'icon': '🗣️',
            'title': 'Voz pessoal',
            'problem': None,
            'fix': None,
            'points': [
                'Usa contrações: não, é, estou, vamos',
                'Tens opiniões: "parece-me marcante", "o que me chamou a atenção foi..."',
                'Acrescenta a tua leitura: "isto sugere..." ou "a implicação parece ser..."',
                'Usa a primeira pessoa quando faz sentido: "eu recomendaria..."'
            ]
        },
        'en': {
            'icon': '🗣️',
            'title': 'Personal voice',
            'problem': None, 'fix': None,
            'points': [
                'Use contractions: don\'t, isn\'t, I\'m, let\'s',
                'Have opinions: "what strikes me is", "what caught my attention was..."',
                'Add your reading: "this suggests..." or "the implication seems to be..."',
                'Use first person when it fits: "I would recommend..."'
            ]
        },
        'fr': {
            'icon': '🗣️',
            'title': 'Voix personnelle',
            'problem': None, 'fix': None,
            'points': [
                'Utilisez des contractions: pas, c\'est, je suis, on va',
                'Ayez des opinions: "ce qui me frappe", "ce qui a attiré mon attention..."',
                'Ajoutez votre lecture: "cela suggère..." ou "l\'implication semble être..."',
                'Utilisez la première personne quand ça convient: "je recommanderais..."'
            ]
        },
        'ar': {
            'icon': '🗣️',
            'title': 'الصوت الشخصي',
            'problem': None, 'fix': None,
            'points': [
                'استخدم الاختصارات: لا، هو، أنا ذاهب، هيا',
                'عندك آراء: "يبدو لي لافتاً"، "ما لفت انتباهي هو..."',
                'أضف قراءتك: "هذا يوحي بـ..." أو "التبعات تبدو أنها..."',
                'استخدم ضمير المتكلم عندما يناسب: "أوصي بـ..."'
            ]
        },
        'tn': {
            'icon': '🗣️',
            'title': 'El voix personnelle',
            'problem': None, 'fix': None,
            'points': [
                'Estamel contractions: la, houa, ana nemshi, ya5dem',
                '3andek arayes: "yebdou li marrant", "elli 3yeb attention mta3i houa..."',
                'Zid el qra2a mta3ek: "hatha yesugger..." wala "el implication yebdou..."',
                'Estamel el personne loula ki yemchi: "ana n9oul elli..."'
            ]
        }
    },
    'buzzwords': {
        'pt-PT': {
            'icon': '🚫',
            'title': 'Buzzwords a evitar',
            'problem': 'A IA adora estes. Os humanos usam-nos com parcimónia:',
            'fix': None,
            'points': [
                '"delve into", "tapestry", "vibrant", "robust", "leverage" (usa "usar")',
                '"em conclusão", "em resumo", "para resumir"',
                '"É importante notar que..."',
                '"navegar pelas complexidades", "no mundo acelerado de hoje"'
            ]
        },
        'en': {
            'icon': '🚫',
            'title': 'Buzzwords to avoid',
            'problem': 'AI loves these. Humans use them sparingly:',
            'fix': None,
            'points': [
                '"delve into", "tapestry", "vibrant", "robust", "leverage" (use "use")',
                '"in conclusion", "in summary", "to summarize"',
                '"It is important to note that..."',
                '"navigate the complexities", "in today\'s fast-paced world"'
            ]
        },
        'fr': {
            'icon': '🚫',
            'title': 'Buzzwords à éviter',
            'problem': 'L\'IA les adore. Les humains les utilisent avec parcimonie:',
            'fix': None,
            'points': [
                '"delve into", "tapestry", "vibrant", "robust", "leverage" (utilisez "utiliser")',
                '"en conclusion", "en résumé", "pour résumer"',
                '"Il est important de noter que..."',
                '"naviguer dans les complexités", "dans le monde actuel"'
            ]
        },
        'ar': {
            'icon': '🚫',
            'title': 'كلمات فارغة تجنبها',
            'problem': 'الذكاء الاصطناعي يحبها. البشر يستخدمونها بقلة:',
            'fix': None,
            'points': [
                '"delve into", "tapestry", "vibrant", "robust", "leverage" (استخدم "يستخدم")',
                '"في الختام"، "باختصار"، "للتلخيص"',
                '"من المهم ملاحظة أن..."',
                '"التنقل في التعقيدات"، "في عالم اليوم سريع الخطى"'
            ]
        },
        'tn': {
            'icon': '🚫',
            'title': 'Buzzwords elli lazem t7ebhom',
            'problem': 'El IA t7ebhom. El nas yeset3mlohom b qell:',
            'fix': None,
            'points': [
                '"delve into", "tapestry", "vibrant", "robust", "leverage" (estamel "yesta3mel")',
                '"fel khetam", "b ikhtissar", "bech njemmel"',
                '"Mhem n7ebou nlawrou elli..."',
                '"Navigation fel complexités", "fel 3alem el youm rapide"'
            ]
        }
    },
    'examples': {
        'pt-PT': {
            'icon': '💎',
            'title': 'Exemplos específicos',
            'problem': 'Substitui generalidades por detalhes concretos do caso:',
            'fix': None,
            'points': [
                '❌ "A marca perdeu quota de mercado."',
                '✅ "As vendas a retalho em Espanha caíram de €22M para €14M entre 2018 e 2023."',
                '❌ "A satisfação do cliente é baixa."',
                '✅ "Um NPS de 17 coloca a Equivalenza bem abaixo da Druni (56) e da Primor (46)."'
            ]
        },
        'en': {
            'icon': '💎',
            'title': 'Specific examples',
            'problem': 'Replace generalities with concrete case details:',
            'fix': None,
            'points': [
                '❌ "The brand lost market share."',
                '✅ "Retail sales in Spain dropped from €22M to €14M between 2018 and 2023."',
                '❌ "Customer satisfaction is low."',
                '✅ "An NPS of 17 places Equivalenza well below Druni (56) and Primor (46)."'
            ]
        },
        'fr': {
            'icon': '💎',
            'title': 'Exemples spécifiques',
            'problem': 'Remplacez les généralités par des détails concrets du cas:',
            'fix': None,
            'points': [
                '❌ "La marque a perdu des parts de marché."',
                '✅ "Les ventes au détail en Espagne sont passées de 22M€ à 14M€ entre 2018 et 2023."',
                '❌ "La satisfaction client est faible."',
                '✅ "Un NPS de 17 place Equivalenza bien en dessous de Druni (56) et Primor (46)."'
            ]
        },
        'ar': {
            'icon': '💎',
            'title': 'أمثلة محددة',
            'problem': 'استبدل العموميات بتفاصيل محددة من الحالة:',
            'fix': None,
            'points': [
                '❌ "العلامة التجارية فقدت حصة في السوق."',
                '✅ "انخفضت مبيعات التجزئة في إسبانيا من 22 مليون يورو إلى 14 مليون يورو بين 2018 و2023."',
                '❌ "رضا العملاء منخفض."',
                '✅ "NPS قدره 17 يضع Equivalenza أقل بكثير من Druni (56) وPrimor (46)."'
            ]
        },
        'tn': {
            'icon': '💎',
            'title': 'Exemples spécifiques',
            'problem': 'Bdel el généralités b détails concrets mel cas:',
            'fix': None,
            'points': [
                '❌ "El marque khsrat quota fel marché."',
                '✅ "El ventes au détail fel Espanya n9os mel €22M lel €14M bin 2018 w 2023."',
                '❌ "El satisfaction du client basse."',
                '✅ "NPS mta3 17 y7ot Equivalenza t7t Druni (56) w Primor (46) b kther."'
            ]
        }
    },
    'hedging': {
        'pt-PT': {
            'icon': '🤔',
            'title': 'Hedging (precaução)',
            'problem': 'Incerteza estratégica torna o texto mais humano:',
            'fix': None,
            'points': [
                '"Parece que..."',
                '"Isto pode sugerir..."',
                '"Pode-se argumentar que..."',
                '"Talvez o fator mais importante seja..."'
            ]
        },
        'en': {
            'icon': '🤔',
            'title': 'Hedging',
            'problem': 'Strategic uncertainty makes the text feel more human:',
            'fix': None,
            'points': [
                '"It seems that..."',
                '"This may suggest..."',
                '"One could argue that..."',
                '"Perhaps the most important factor is..."'
            ]
        },
        'fr': {
            'icon': '🤔',
            'title': 'Hedging (nuance)',
            'problem': 'L\'incertitude stratégique rend le texte plus humain:',
            'fix': None,
            'points': [
                '"Il semble que..."',
                '"Cela peut suggérer..."',
                '"On pourrait argumenter que..."',
                '"Peut-être que le facteur le plus important est..."'
            ]
        },
        'ar': {
            'icon': '🤔',
            'title': 'التخفيف (الحذر)',
            'problem': 'التردد الاستراتيجي يجعل النص يبدو أكثر بشرياً:',
            'fix': None,
            'points': [
                '"يبدو أن..."',
                '"قد يشير هذا إلى..."',
                '"يمكن الجدال بأن..."',
                '"ربما أهم عامل هو..."'
            ]
        },
        'tn': {
            'icon': '🤔',
            'title': 'Hedging (precaução)',
            'problem': 'El incertitude stratégique y3amel el text yebda akther insani:',
            'fix': None,
            'points': [
                '"Yebdou elli..."',
                '"Hatha yemken ysugger..."',
                '"N9oulou elli..."',
                '"Pe3t-ebarre él akther mhem factor houa..."'
            ]
        }
    }
}

HEAD = {
    'pt-PT': '✍️ Tips de Escrita & Anti-Detecção de IA',
    'en':    '✍️ Writing Tips & Anti-AI Detection',
    'fr':    '✍️ Astuces d\'écriture & Anti-détection IA',
    'ar':    '✍️ نصائح الكتابة ومقاومة كشف الذكاء الاصطناعي',
    'tn':    '✍️ Tips mta3 el Kteb w Anti-AI Detection'
}

CTA = {
    'pt-PT': 'Seguinte: Lições em PT →',
    'en':    'Next: Lessons in PT →',
    'fr':    'Suivant: Leçons en PT →',
    'ar':    'التالي: دروس بالبرتغالية →',
    'tn':    'El jay: Doureb fel PT →'
}

LOCALES = ['pt-PT', 'en', 'tn', 'fr', 'ar']

results = []
for loc in LOCALES:
    path = os.path.join(ROOT, 'src', 'lib', 'i18n', f'{loc}.json')
    with open(path, encoding='utf-8') as f:
        d = json.load(f)

    d['write.head.h1'] = HEAD[loc]
    d['write.cta.next'] = CTA[loc]

    for slug in ['variation', 'voice', 'buzzwords', 'examples', 'hedging']:
        tip = TIPS[slug][loc]
        d[f'write.tips.{slug}.icon']   = tip['icon']
        d[f'write.tips.{slug}.title']  = tip['title']
        d[f'write.tips.{slug}.problem'] = tip['problem'] if tip['problem'] else ''
        d[f'write.tips.{slug}.fix']    = tip['fix'] if tip['fix'] else ''
        d[f'write.tips.{slug}.points'] = tip['points']

    with open(path, 'w', encoding='utf-8') as f:
        json.dump(d, f, ensure_ascii=False, indent=2)
    results.append((loc, len(d)))

for loc, n in results:
    print(f'{loc}: {n} keys')
print('OK')
