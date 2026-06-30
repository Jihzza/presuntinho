// Server-side load for /aulas.
//
// Aggregates every lesson JSON under static/lessons/<course>/*.json into
// a single timeline. We intentionally do NOT duplicate content: only
// metadata (id, title, courseSlug, description hint, audio refs, course
// icon/color, quizSlug hint) is returned to the client. Full lesson
// content continues to live in /static/lessons/ and is fetched on
// demand when the user opens a lesson at /escola/licao/....
//
// The course registry (icon / color / display title) is sourced from
// the same hardcoded catalogue used by /escola — it is the source of
// truth for branding until a /static/courses.json exists. If a course
// directory under /static/lessons/ is missing from this map (e.g. a new
// course ships before the escola page is updated) we still list its
// lessons using the directory slug as the fallback label.
//
// Runs in Node (SvelteKit server hook) — `fs` is safe here.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export interface CourseMeta {
  slug: string;
  title: string;
  icon: string;
  color: string;
}

export interface LessonMeta {
  /** Unique id across the entire app: "<courseSlug>/<lessonId>". */
  id: string;
  /** Slug of the parent course. */
  courseSlug: string;
  /** Display title (from the lesson JSON, or a slug→Title fallback). */
  title: string;
  /** First ~140 chars of the lesson's lead text — used as card description. */
  description: string;
  /** Path to the lesson audio (empty string when none). */
  audio: string;
  /** Human-friendly label for the audio ("Audio walkthrough (PT)" etc). */
  audioLabel: string;
  /** Stable order within the parent course (alphabetical, matches repo layout). */
  order: number;
}

export interface CourseBucket {
  meta: CourseMeta;
  lessons: LessonMeta[];
}

const LESSONS_DIR = 'static/lessons';

// Display catalogue for the 13 BA courses currently shipped under
// static/lessons/. Mirrors src/routes/escola/+page.svelte's COURSES
// array (which is the source of truth on the client). Keep in sync
// when a new course is added — the aggregator falls back gracefully
// when a course has no entry here, but icon/color are only available
// when listed below.
const COURSE_META: Record<string, CourseMeta> = {
  equivalenza: { slug: 'equivalenza', title: 'Equivalenza', icon: '🌸', color: '#ec4899' },
  portugues: { slug: 'portugues', title: 'Português', icon: '🇵🇹', color: '#10b981' },
  'marketing-digital': { slug: 'marketing-digital', title: 'Marketing Digital', icon: '📱', color: '#06b6d4' },
  branding: { slug: 'branding', title: 'Branding', icon: '✨', color: '#a855f7' },
  estrategia: { slug: 'estrategia', title: 'Estratégia', icon: '🧭', color: '#f97316' },
  'estrategia-corporativa': { slug: 'estrategia-corporativa', title: 'Estratégia Corporativa', icon: '🧭', color: '#f97316' },
  'gestao-financeira': { slug: 'gestao-financeira', title: 'Gestão Financeira', icon: '💰', color: '#059669' },
  contabilidade: { slug: 'contabilidade', title: 'Contabilidade', icon: '📊', color: '#2563eb' },
  microeconomia: { slug: 'microeconomia', title: 'Microeconomia', icon: '📉', color: '#dc2626' },
  'recursos-humanos': { slug: 'recursos-humanos', title: 'Recursos Humanos', icon: '👥', color: '#7c3aed' },
  'comportamento-organizacional': { slug: 'comportamento-organizacional', title: 'Comportamento Organizacional', icon: '🧠', color: '#6d28d9' },
  macroeconomia: { slug: 'macroeconomia', title: 'Macroeconomia', icon: '🌍', color: '#0ea5e9' },
  'marketing-estrategico': { slug: 'marketing-estrategico', title: 'Marketing Estratégico', icon: '🎯', color: '#e11d48' },
    'etica-negocios': { slug: 'etica-negocios', title: 'Ética nos Negócios', icon: '⚖️', color: '#16a34a' },
    'direito-empresarial': { slug: 'direito-empresarial', title: 'Direito Empresarial', icon: '⚖️', color: '#7e22ce' },
    'analise-financeira': { slug: 'analise-financeira', title: 'Análise Financeira', icon: '📈', color: '#0d9488' },
    'comportamento-do-consumidor': { slug: 'comportamento-do-consumidor', title: 'Comportamento do Consumidor', icon: '🛍️', color: '#db2777' },
    'pesquisa-de-marketing': { slug: 'pesquisa-de-marketing', title: 'Pesquisa de Marketing', icon: '🔬', color: '#7c3aed' },
    'gestao-mudanca': { slug: 'gestao-mudanca', title: 'Gestão da Mudança Organizacional', icon: '🔄', color: '#14b8a6' },
    'negociacao': { slug: 'negociacao', title: 'Técnicas de Negociação Empresarial', icon: '🤝', color: '#0369a1' },
    'introducao-ao-direito': { slug: 'introducao-ao-direito', title: 'Introdução ao Direito', icon: '⚖️', color: '#7c2d12' },
    'logistica': { slug: 'logistica', title: 'Logística', icon: '🚚', color: '#0f766e' },
    'sistemas-de-informacao': { slug: 'sistemas-de-informacao', title: 'Sistemas de Informação', icon: '💻', color: '#1e40af' },
    'inovacao-empreendedorismo': { slug: 'inovacao-empreendedorismo', title: 'Inovação e Empreendedorismo', icon: '💡', color: '#ca8a04' },
    'international-business': { slug: 'international-business', title: 'International Business', icon: '🌐', color: '#2563eb' },
    'supply-chain': { slug: 'supply-chain', title: 'Supply Chain Management', icon: '📦', color: '#b45309' },
    'data-analytics': { slug: 'data-analytics', title: 'Data Analytics for Business', icon: '📊', color: '#7c3aed' },
    'project-management': { slug: 'project-management', title: 'Project Management', icon: '📋', color: '#0d9488' },
    'gestao-financeira-empresarial': { slug: 'gestao-financeira-empresarial', title: 'Gestão Financeira Empresarial', icon: '💼', color: '#0e7490' },
    'contabilidade-gerencial': { slug: 'contabilidade-gerencial', title: 'Contabilidade Gerencial', icon: '📊', color: '#b91c1c' },
    empreendedorismo: { slug: 'empreendedorismo', title: 'Empreendedorismo e Plano de Negócios', icon: '🚀', color: '#e11d48' },
    'gestao-qualidade': { slug: 'gestao-qualidade', title: 'Gestão da Qualidade Total', icon: '🎯', color: '#0ea5e9' },
    'lideranca-coaching': { slug: 'lideranca-coaching', title: 'Liderança e Coaching', icon: '🧭', color: '#1e3a8a' },
    'gestao-operacoes': { slug: 'gestao-operacoes', title: 'Gestão de Operações', icon: '⚙️', color: '#0891b2' },
    'analise-investimentos': { slug: 'analise-investimentos', title: 'Análise de Investimentos', icon: '💰', color: '#059669' },
    'gestao-inovacao': { slug: 'gestao-inovacao', title: 'Gestão da Inovação e Tecnologia', icon: '💡', color: '#ca8a04' },
      'comercio-internacional': { slug: 'comercio-internacional', title: 'Comércio Internacional', icon: '🌐', color: '#0e7490' },
      'marketing-internacional': { slug: 'marketing-internacional', title: 'Marketing Internacional', icon: '🌍', color: '#0ea5e9' }
        };

/** Turn "blue-ocean-strategy" → "Blue Ocean Strategy". */
function humanise(slug: string): string {
  return slug
    .replace(/\.json$/, '')
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Extract a short description from the lesson's sections. */
function extractDescription(raw: unknown): string {
  if (!raw || typeof raw !== 'object') return '';
  const sections = (raw as { sections?: unknown }).sections;
  if (!Array.isArray(sections)) return '';
  for (const section of sections) {
    if (!section || typeof section !== 'object') continue;
    const s = section as Record<string, unknown>;
    const content = typeof s.content === 'string' ? s.content : '';
    const text = typeof s.text === 'string' ? s.text : '';
    const body = (content || text).trim();
    if (body.length > 0) {
      // Trim to a sentence-ish chunk for card previews.
      const flat = body.replace(/\s+/g, ' ');
      if (flat.length <= 140) return flat;
      const cut = flat.slice(0, 140);
      const lastSpace = cut.lastIndexOf(' ');
      return `${(lastSpace > 80 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
    }
  }
  return '';
}

function loadCourse(courseDir: string, courseSlug: string): CourseBucket | null {
  let entries: string[];
  try {
    entries = readdirSync(courseDir);
  } catch {
    return null;
  }
  const jsonFiles = entries.filter((f) => f.endsWith('.json')).sort();
  if (jsonFiles.length === 0) return null;

  const lessons: LessonMeta[] = [];
  for (let i = 0; i < jsonFiles.length; i++) {
    const file = jsonFiles[i];
    const path = join(courseDir, file);
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(path, 'utf-8'));
    } catch {
      // Skip corrupt / non-JSON files rather than blowing up the whole
      // page — the aggregator is best-effort across 70 files.
      continue;
    }
    if (!raw || typeof raw !== 'object') continue;
    const obj = raw as Record<string, unknown>;
    const lessonId = typeof obj.id === 'string' && obj.id.length > 0 ? obj.id : file.replace(/\.json$/, '');
    const title = typeof obj.title === 'string' && obj.title.length > 0 ? obj.title : humanise(lessonId);
    lessons.push({
      id: `${courseSlug}/${lessonId}`,
      courseSlug,
      title,
      description: extractDescription(obj),
      audio: typeof obj.audio === 'string' ? obj.audio : '',
      audioLabel: typeof obj.audioLabel === 'string' ? obj.audioLabel : '',
      order: i
    });
  }

  const meta: CourseMeta =
    COURSE_META[courseSlug] ?? {
      slug: courseSlug,
      title: humanise(courseSlug),
      icon: '📘',
      color: '#64748b'
    };

  return { meta, lessons };
}

export const load = () => {
  let courseDirs: string[];
  try {
    courseDirs = readdirSync(LESSONS_DIR);
  } catch {
    return { courses: [] as CourseBucket[] };
  }

  // Stable order: keep COURSE_META declaration order, then append
  // unknown courses alphabetically so new ones still show up
  // predictably.
  const knownOrder = Object.keys(COURSE_META);
  const knownSet = new Set(knownOrder);
  const sorted = [
    ...knownOrder.filter((s) => courseDirs.includes(s)),
    ...courseDirs.filter((s) => !knownSet.has(s)).sort()
  ];

  const courses: CourseBucket[] = [];
  for (const slug of sorted) {
    const bucket = loadCourse(join(LESSONS_DIR, slug), slug);
    if (bucket) courses.push(bucket);
  }

  return { courses };
};
