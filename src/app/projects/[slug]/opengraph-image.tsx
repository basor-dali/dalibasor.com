import { ImageResponse } from 'next/og';
import { getProject, getProjectSlugs, STATUS_LABELS } from '@/lib/content';
import { site } from '@/lib/site';
import { truncate } from '@/lib/utils';

/**
 * The per-project social card.
 *
 * Project pages are the links that get forwarded — "this is the thing I am
 * building" — and they unfurled with the generic site card. Same constraints
 * and the same composition as the essay card: no font fetched or imported, so
 * the build works with the network unplugged; the status and its period in
 * the top line, the name, and what it is made of along the foot.
 */

export const runtime = 'nodejs';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = `A project by ${site.name}`;

export function generateStaticParams(): { slug: string }[] {
  return getProjectSlugs().map((slug) => ({ slug }));
}

/* The tokens, spelled out — satori has no stylesheet to read them from. */
const GROUND = '#0c0b0a';
const WHITE = '#fbf8f3';
const IVORY = '#ede7dd';
const MUTE = '#6e6862';
const LINE = '#232120';
const EMBER = '#d2673f';

/** Long names step down through fixed sizes rather than being cut off. */
function titleSize(length: number): number {
  if (length <= 16) return 112;
  if (length <= 32) return 84;
  if (length <= 60) return 64;
  return 52;
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const project = getProject(slug);

  const title = truncate(project?.title ?? site.name, 90);
  const status = project
    ? `${STATUS_LABELS[project.status]}   ·   ${project.period}`.toUpperCase()
    : '';
  const live = project?.status === 'building' || project?.status === 'experiment';
  const made = project
    ? project.technologies.slice(0, 4).join('   /   ').toUpperCase()
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
        {/* --- section and status ------------------------------------- */}
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
          <div style={{ display: 'flex' }}>PROJECT</div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div
              style={{
                display: 'flex',
                width: 10,
                height: 10,
                borderRadius: 10,
                marginRight: 16,
                backgroundColor: live ? EMBER : MUTE,
              }}
            />
            {status}
          </div>
        </div>

        {/* --- the name -------------------------------------------------- */}
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
              lineHeight: 1.02,
              letterSpacing: '-0.045em',
              color: WHITE,
            }}
          >
            {title}
          </div>
        </div>

        {/* --- what it is made of, and the mark ---------------------------- */}
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
            <div style={{ display: 'flex', color: MUTE }}>{made}</div>
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
