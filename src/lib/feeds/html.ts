import 'server-only';

import { toHtml } from 'hast-util-to-html';
import remarkGfm from 'remark-gfm';
import remarkMdx from 'remark-mdx';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import type { MediaItem } from '@/types/content';
import { findMediaByRef } from '@/lib/content';
import { mediaAlt, mediaProvider, responsiveVideo } from '@/lib/media';
import { absoluteUrl } from '@/lib/metadata';
import { escapeXml } from './xml';

/**
 * An entry's body as plain HTML, for a feed reader.
 *
 * The feeds used to carry a 320-character excerpt, because the body is MDX
 * with the site's own components in it and "would not survive the trip".
 * Most personal sites worth subscribing to ship the whole text — thirteen of
 * the nineteen feeds sampled for the 2026 audit did — and with no analytics
 * here there is no reason to make anyone click through to read.
 *
 * So the components are translated rather than dropped, into the HTML a feed
 * reader already knows how to show:
 *
 *   <Figure>       a <figure> with the photograph's JPEG and its caption
 *   <Row>          its figures, one after another
 *   <Video>        the poster frame, linked to the entry, captioned as video
 *   <Pull>         a <blockquote>
 *   <Note>         an <aside> led by its label
 *   <Placeholder>  nothing — scaffolding is not news
 *
 * Every relative link and image becomes absolute, because a feed is read on
 * somebody else's site. No React, no client runtime: MDX is parsed to a
 * syntax tree and the tree is written out as HTML.
 */

type Hast = {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: Hast[];
  value?: string;
};

type JsxNode = {
  type: 'mdxJsxFlowElement' | 'mdxJsxTextElement';
  name: string | null;
  attributes: { type: string; name?: string; value?: unknown }[];
  children: unknown[];
};

type HandlerState = { all: (node: unknown) => Hast[] };

const el = (tagName: string, properties: Record<string, unknown>, children: Hast[] = []): Hast => ({
  type: 'element',
  tagName,
  properties,
  children,
});
const text = (value: string): Hast => ({ type: 'text', value });

/** Plain HTML elements allowed through as themselves. Anything else keeps its children only. */
const PASS_THROUGH = new Set(['br', 'em', 'strong', 'sup', 'sub', 'small', 'kbd', 'abbr', 'span']);

/** Attribute values as strings or flags. Expressions arrive as their source. */
function attributesOf(node: JsxNode): Record<string, string | true> {
  const out: Record<string, string | true> = {};
  for (const attribute of node.attributes ?? []) {
    if (attribute.type !== 'mdxJsxAttribute' || !attribute.name) continue;
    const value = attribute.value;
    if (value === null || value === undefined) out[attribute.name] = true;
    else if (typeof value === 'string') out[attribute.name] = value;
    else if (typeof value === 'object' && 'value' in value) {
      // `width={1920}` — keep the literal, drop anything that is code.
      const source = String((value as { value: unknown }).value).trim();
      if (/^-?\d+(\.\d+)?$/.test(source) || /^(['"]).*\1$/.test(source)) {
        out[attribute.name] = source.replace(/^(['"])(.*)\1$/, '$2');
      }
    }
  }
  return out;
}

function str(value: string | true | undefined): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/** The single JPEG every provider can serve, at a width a reader will show. */
function imageFor(publicId: string, item: MediaItem | undefined): string {
  return mediaProvider().imageUrl(item?.publicId ?? publicId, {
    width: 1200,
    fit: 'fit',
    availableWidths: item?.variants,
  });
}

function figure(media: Hast, caption: string | undefined): Hast {
  return el('figure', {}, caption ? [media, el('figcaption', {}, [text(caption)])] : [media]);
}

function translate(state: HandlerState, node: JsxNode, entryUrl: string): Hast | Hast[] | undefined {
  const attributes = attributesOf(node);
  const name = node.name ?? '';

  switch (name) {
    case 'Figure': {
      const src = str(attributes.src);
      if (!src) return undefined;
      const item = findMediaByRef(src);
      const img = el('img', {
        src: imageFor(src, item),
        alt: str(attributes.alt) ?? (item ? mediaAlt(item) : ''),
        ...(item ? { width: item.width, height: item.height } : {}),
      });
      return figure(img, str(attributes.caption));
    }

    case 'Row': {
      const caption = str(attributes.caption);
      const figures = state.all(node);
      return caption ? [...figures, el('p', {}, [el('em', {}, [text(caption)])])] : figures;
    }

    case 'Video': {
      const src = str(attributes.src);
      if (!src) return undefined;
      const known = findMediaByRef(src);
      const video = responsiveVideo(
        known ?? {
          publicId: src,
          width: Number(attributes.width) || 1920,
          height: Number(attributes.height) || 1080,
          poster: str(attributes.poster),
        },
        { posterWidth: 1200 },
      );
      const caption = str(attributes.caption);
      const poster = el('a', { href: entryUrl }, [
        el('img', { src: video.poster, alt: caption ? `Video: ${caption}` : 'Video' }),
      ]);
      return figure(poster, `${caption ? `${caption} — ` : ''}a video, playable on the site.`);
    }

    case 'Pull':
      return el('blockquote', {}, state.all(node));

    case 'Note':
      return el('aside', {}, [
        el('p', {}, [el('strong', {}, [text(str(attributes.label) ?? 'Note')])]),
        ...state.all(node),
      ]);

    case 'Placeholder':
      return undefined;

    default:
      if (PASS_THROUGH.has(name)) return el(name, {}, state.all(node));
      return state.all(node);
  }
}

/** Relative addresses resolved against the site, and in-page ones against the entry. */
function absolutize(node: Hast, entryUrl: string): void {
  const properties = node.properties;
  if (properties) {
    for (const key of ['href', 'src'] as const) {
      const value = properties[key];
      if (typeof value !== 'string') continue;
      if (value.startsWith('#')) properties[key] = `${entryUrl}${value}`;
      else if (value.startsWith('/') && !value.startsWith('//')) properties[key] = absoluteUrl(value);
    }
  }
  for (const child of node.children ?? []) absolutize(child, entryUrl);
}

export function feedHtml(body: string, entryUrl: string): string {
  const handle = (state: HandlerState, node: JsxNode) => translate(state, node, entryUrl);

  try {
    const processor = unified()
      .use(remarkParse)
      .use(remarkMdx)
      .use(remarkGfm)
      .use(remarkRehype, {
        handlers: {
          mdxJsxFlowElement: handle,
          mdxJsxTextElement: handle,
          // Comments and code expressions — `{/* … */}` — are not prose.
          mdxFlowExpression: () => undefined,
          mdxTextExpression: () => undefined,
          mdxjsEsm: () => undefined,
        } as never,
      });

    const tree = processor.runSync(processor.parse(body)) as unknown as Hast;
    absolutize(tree, entryUrl);
    return toHtml(tree as never);
  } catch {
    // The page itself would have failed to build on MDX this broken, so this
    // is a last resort: the text, escaped, rather than a feed that will not
    // parse.
    return `<p>${escapeXml(body.replace(/\s+/g, ' ').slice(0, 2000))}</p>`;
  }
}
