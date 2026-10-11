/**
 * What a piece of writing links to.
 *
 * "Mentioned in" is read from the links in the source, so the reader of
 * those links has to find every way one is written, and nothing that only
 * looks like one.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { normalizePath, outboundLinks } from '../../src/lib/links.ts';

describe('what a piece of writing links to', () => {
  const SITE = 'https://dalibasor.com';

  it('finds every way a link is written', () => {
    const { paths, media } = outboundLinks(
      [
        'As I said [before](/writing/lawnmowers-are-hard/), and [here](/notes/x#top "t").',
        '<a href="/projects/remow">ReMow</a> and <Link href={"/years/2021"}>2021</Link>',
        'Also https://dalibasor.com/places/belgrade-serbia?x=1 and <https://dalibasor.com/now/2026-09>.',
        '<Figure src="2019-serbia-0003" alt="" />',
      ].join('\n'),
      SITE,
    );
    assert.deepEqual(paths, [
      '/notes/x',
      '/now/2026-09',
      '/places/belgrade-serbia',
      '/projects/remow',
      '/writing/lawnmowers-are-hard',
      '/years/2021',
    ]);
    assert.deepEqual(media, ['2019-serbia-0003']);
  });

  it('ignores what only looks like a link', () => {
    const { paths } = outboundLinks(
      [
        '![a photograph](/media/x.jpg)',
        '`[not a link](/writing/code)`',
        '```\n[nor this](/writing/fenced)\n```',
        '[elsewhere](https://example.com/writing/x) and [protocol-relative](//cdn.example/x)',
      ].join('\n'),
      SITE,
    );
    assert.deepEqual(paths, []);
  });

  it('reduces an address to its page', () => {
    assert.equal(normalizePath('/writing/x/?a=1#b'), '/writing/x');
    assert.equal(normalizePath('/'), '/');
    assert.equal(normalizePath('mailto:a@b.c'), undefined);
  });
});
