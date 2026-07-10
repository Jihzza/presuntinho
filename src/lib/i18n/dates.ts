// Helpers de datas partilhados pelas vistas de calendário/semana.
//
// O CLDR de pt-PT NÃO abrevia weekday:'short' — devolve "segunda",
// "terça", … — pelo que qualquer célula estreita clipa o texto
// ("SEGU", "QUINT"). Em alfabeto latino cortamos a 3 letras
// (SEG/TER/QUA/QUI/SEX/SÁB/DOM, LUN/MAR/…); noutros alfabetos (ar)
// mantemos o short do Intl, que já é a forma canónica.

/** Etiqueta curta e estável do dia da semana (máx. 3 letras em latim). */
export function weekdayShort(day: Date, locale: string): string {
  const s = day.toLocaleDateString(locale, { weekday: 'short' }).replace(/\.$/, '');
  return /^[\p{Script=Latin}\s'-]+$/u.test(s) && s.length > 4 ? s.slice(0, 3) : s;
}
