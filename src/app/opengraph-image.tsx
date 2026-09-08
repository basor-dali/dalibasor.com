import { ImageResponse } from 'next/og';
import { primaryNav, site } from '@/lib/site';

/**
 * The site-wide social card.
 *
 * Deliberately built from nothing but the palette, scale and one ember band.
 * No font is fetched or imported — `next/og` ships its own default face, and
 * a build that reaches out to a font CDN is a build that fails offline. The
 * card therefore carries its weight through size, tracking and space, which
 * is how the rest of the site works anyway.
 */

export const runtime = 'nodejs';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = `${site.name} — ${site.descriptor}`;

/* The tokens, spelled out — satori has no stylesheet to read them from. */
const GROUND = '#0c0b0a';
const WHITE = '#fbf8f3';
const SOFT = '#b3aba2';
const MUTE = '#6e6862';
const LINE = '#232120';
const EMBER = '#d2673f';

export default function Image() {
  const sections = primaryNav.map((item) => item.label).join('   ·   ');

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
        {/* --- the mono meta line ------------------------------------- */}
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
          <div style={{ display: 'flex' }}>{site.domain.toUpperCase()}</div>
          <div style={{ display: 'flex' }}>{site.location.toUpperCase()}</div>
        </div>

        {/* --- the name ----------------------------------------------- */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              display: 'flex',
              width: 88,
              height: 3,
              backgroundColor: EMBER,
              marginBottom: 40,
            }}
          />
          <div
            style={{
              display: 'flex',
              fontSize: 132,
              lineHeight: 1,
              letterSpacing: '-0.05em',
              color: WHITE,
            }}
          >
            {site.name.toUpperCase()}
          </div>
          <div
            style={{
              display: 'flex',
              width: 800,
              marginTop: 32,
              fontSize: 29,
              lineHeight: 1.4,
              letterSpacing: '-0.01em',
              color: SOFT,
            }}
          >
            {site.descriptor}
          </div>
        </div>

        {/* --- what is in here ---------------------------------------- */}
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
              fontSize: 19,
              letterSpacing: '0.24em',
              color: MUTE,
            }}
          >
            {sections.toUpperCase()}
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
