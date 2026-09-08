import { makePage } from '@keystatic/next/ui/app';
import config from '../../../../keystatic.config';

/**
 * The Keystatic admin UI.
 *
 * Lives outside the site's chrome — SiteChrome checks the pathname and skips
 * the navigation and footer for /keystatic and /admin, so the editor gets a
 * clean shell instead of a dark editorial page wrapped around it.
 */
export default makePage(config);
