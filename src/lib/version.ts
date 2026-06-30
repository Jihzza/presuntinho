/**
 * Single source of truth for the app version.
 *
 * Centralised here (gap-115) so the Definições "About" card and any
 * other surface that shows the version reads from one constant instead
 * of letting `new Date()` masquerade as a build identifier.
 *
 * Update rule: bump this whenever `package.json` is bumped.  We don't
 * import from `package.json` directly because `$lib` code must compile
 * at build time without filesystem access — keeping a literal here is
 * the simplest and most reliable contract.
 *
 * Kept as a string export named `VERSION` (UPPER_SNAKE) by convention
 * for build / runtime constants.
 */
export const VERSION = '6.0.3';

/** Repository URL — also used by the Definições "About" card. */
export const REPO_URL = 'https://github.com/Jihzza/presuntinho';
