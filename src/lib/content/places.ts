import 'server-only';

import type {
  MediaItem,
  NoteSummary,
  NowSummary,
  PostSummary,
  ResolvedAlbum,
} from '@/types/content';
import { slugify } from '@/lib/utils';
import { once } from './fs';
import { getAllAlbums, getAllMediaItems } from './media';
import { getNotes } from './notes';
import { getNowEntries } from './now';
import { getPosts } from './writing';

/**
 * Places, from the locations written down by hand.
 *
 * Every place here was typed: an essay's "written in", an album's or a
 * photograph's location, where a note or a Now entry was written from. Nothing comes
 * from GPS, which is stripped before a photograph leaves the machine and is
 * never published — so this index can only ever be as specific as you chose
 * to be.
 *
 * A place is its spelling, slugged: "Belgrade, Serbia" and "Belgrade" are two
 * places until they are written the same way. Placeholders and drafts do not
 * count, the same as everywhere else that lists things.
 */

export type Place = {
  slug: string;
  /** The spelling used most often. */
  name: string;
  href: string;
  /** Years with anything from here, oldest first. */
  years: number[];
  posts: PostSummary[];
  albums: ResolvedAlbum[];
  /** Photographs from here that are not in one of `albums`, newest first. */
  photos: MediaItem[];
  now: NowSummary[];
  notes: NoteSummary[];
  /** Essays + notes + albums + loose photographs + Now entries. */
  total: number;
};

const places = once((): Map<string, Place> => {
  type Building = Place & { spellings: Map<string, number> };
  const map = new Map<string, Building>();

  const at = (raw: string | undefined, year: number): Building | undefined => {
    const name = raw?.replace(/\s+/g, ' ').trim();
    const slug = name ? slugify(name) : '';
    if (!name || !slug) return undefined;
    let place = map.get(slug);
    if (!place) {
      place = {
        slug,
        name,
        href: `/places/${slug}`,
        years: [],
        posts: [],
        albums: [],
        photos: [],
        now: [],
        notes: [],
        total: 0,
        spellings: new Map(),
      };
      map.set(slug, place);
    }
    place.spellings.set(name, (place.spellings.get(name) ?? 0) + 1);
    if (!place.years.includes(year)) place.years.push(year);
    return place;
  };

  for (const post of getPosts()) {
    if (!post.placeholder) at(post.location, post.year)?.posts.push(post);
  }
  for (const album of getAllAlbums()) {
    at(album.location, album.year)?.albums.push(album);
  }
  for (const item of getAllMediaItems()) {
    const place = at(item.location, item.year);
    // A photograph in an album from the same place is already counted there.
    const inAlbum = place?.albums.some(
      (album) => album.year === item.year && album.slug === item.album,
    );
    if (place && !inAlbum) place.photos.push(item);
  }
  for (const note of getNotes()) {
    at(note.location, note.year)?.notes.push(note);
  }
  for (const now of getNowEntries()) {
    if (!now.placeholder) at(now.location, now.year)?.now.push(now);
  }

  const out = new Map<string, Place>();
  for (const { spellings, ...place } of map.values()) {
    const name = [...spellings.entries()].sort((a, b) => b[1] - a[1])[0]![0];
    place.years.sort((a, b) => a - b);
    place.photos.sort((a, b) => (b.capturedAt ?? '').localeCompare(a.capturedAt ?? ''));
    place.total =
      place.posts.length +
      place.notes.length +
      place.albums.length +
      place.photos.length +
      place.now.length;
    out.set(place.slug, { ...place, name });
  }
  return out;
});

/** Every place, alphabetically. */
export function getPlaces(): Place[] {
  return [...places().values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function getPlace(slug: string): Place | undefined {
  return places().get(slug);
}

/** The page for a written location, when it has one. */
export function placeHref(location: string | undefined): string | undefined {
  const name = location?.replace(/\s+/g, ' ').trim();
  return name ? places().get(slugify(name))?.href : undefined;
}

/** "3 essays · 2 albums · 41 photographs · 1 Now entry" */
export function placeCounts(place: Place): string[] {
  const parts: string[] = [];
  const count = (n: number, one: string, many = `${one}s`) =>
    n > 0 ? parts.push(`${n} ${n === 1 ? one : many}`) : 0;
  count(place.posts.length, 'essay');
  count(place.notes.length, 'note');
  count(place.albums.length, 'album');
  count(place.photos.length, 'photograph');
  count(place.now.length, 'Now entry', 'Now entries');
  return parts;
}
