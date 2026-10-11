'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

/**
 * "Search the archive for …", guessed from the address that was not found.
 *
 * Addresses in an archive move, and the words in a dead one are usually the
 * best clue to where it went: /writing/getting-strong-agian is one search for
 * "getting strong agian" away from the essay. The 404 page is static, so the
 * address is read in the browser, after hydration, and the guess is offered
 * as a plain link — nothing is searched until it is followed.
 */
export function SearchFromPath({ className }: { className?: string }) {
  const [words, setWords] = useState('');

  useEffect(() => {
    let segment = '';
    try {
      segment = decodeURIComponent(
        window.location.pathname.split('/').filter(Boolean).pop() ?? '',
      );
    } catch {
      // A malformed escape in the address: offer the plain search instead.
    }
    const guess = segment
      .replace(/\.[a-z0-9]{1,5}$/i, '')
      .replace(/[-_+.]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60);

    // Deferred a tick: the server rendered the plain link.
    const id = setTimeout(() => {
      if (guess.length >= 3 && /\p{L}/u.test(guess)) setWords(guess);
    }, 0);
    return () => clearTimeout(id);
  }, []);

  return (
    <Link
      href={words ? `/search?q=${encodeURIComponent(words)}` : '/search'}
      className={className}
    >
      {words ? (
        <>
          Search the archive for <span className="text-ivory">“{words}”</span>
        </>
      ) : (
        'Search the archive'
      )}
      <span aria-hidden="true"> &rarr;</span>
    </Link>
  );
}
