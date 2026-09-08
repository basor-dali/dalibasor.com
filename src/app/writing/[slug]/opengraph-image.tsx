import { ImageResponse } from 'next/og';
import { getPost, getPostSlugs } from '@/lib/content';
import { site } from '@/lib/site';
import { formatDate, truncate } from '@/lib/utils';

/**
 * The per-article social card.
 *
 * Same constraints as the site card: no font is fetched or imported, so the
 * build works with the network unplugged. The title does the work; the ember
 * rule above it and the band below it are the only ornament.
 */

export const runtime = 'nodejs';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = `An essay by ${site.name}`;

export function generateStaticParams(): { slug: string }[] {
  return getPostSlugs().map((slug) => ({ slug }));
}

/* The tokens, spelled out — satori has no stylesheet to read them from. */
const GROUND = '#0c0b0a';
const WHITE = '#fbf8f3';
const IVORY = '#ede7dd';
const MUTE = '#6e6862';
const LINE = '#232120';
const EMBER = '#d2673f';

/** Long titles step down through fixed sizes rather than being cut off. */
function titleSize(length: number): number {
  if (length <= 20) return 92;
  if (length <= 40) return 74;
  if (length <= 68) return 60;
  return 50;
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPost(slug);

  const title = truncate(post?.title ?? site.name, 96);
  const dateLabel = post ? formatDate(post.date).toUpperCase() : '';
  const tagLabel = post
    ? post.tags.slice(0, 4).join('   ·   ').toUpperCase() ||
      `${post.readingMinutes} MIN READ`
    : '';

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: GROUND,
      }}
    >
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '70px 84px 60px',
        }}
      >
        {/* --- section and date --------------------------------------- */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 21,
            letterSpacing: '0.3em',
            color: MUTE,
          }}
        >
          <div style={{ display: 'flex' }}>WRITING</div>
          <div style={{ display: 'flex' }}>{dateLabel}</div>
        </div>

        {/* --- the title ---------------------------------------------- */}
        <div style={{ display: 'flex', flexDirection: 'column', paddingRight: 40 }}>
          <div
            style={{
              display: 'flex',
              width: 88,
              height: 3,
              backgroundColor: EMBER,
              marginBottom: 36,
            }}
          />
          <div
            style={{
              display: 'flex',
              fontSize: titleSize(title.length),
              lineHeight: 1.06,
              letterSpacing: '-0.04em',
              color: WHITE,
            }}
          >
            {title}
          </div>
        </div>

        {/* --- tags and the mark -------------------------------------- */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              display: 'flex',
              width: '100%',
              height: 1,
              backgroundColor: LINE,
              marginBottom: 26,
            }}
          />
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: 19,
              letterSpacing: '0.24em',
            }}
          >
            <div style={{ display: 'flex', color: MUTE }}>{tagLabel}</div>
            <div style={{ display: 'flex', color: IVORY }}>{site.name.toUpperCase()}</div>
          </div>
        </div>
      </div>

      {/* --- the signature band --------------------------------------- */}
      <div
        style={{ display: 'flex', width: '100%', height: 7, backgroundColor: EMBER }}
      />
    </div>,
    { ...size },
  );
}
