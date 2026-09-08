'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The media importer, as a page.
 *
 * Pick a year and an album, drop a folder in, watch it go. Then edit captions,
 * locations and alt text in a table and save them back to the YAML.
 *
 * This is a tool, not part of the site, so it is styled plainly and in the
 * system font — it should look like an instrument panel, not like the archive.
 * It only exists in development; see src/lib/admin/guard.ts.
 */

/* ==========================================================================
   Types
   ========================================================================== */

type YearSummary = {
  year: number;
  albums: { slug: string; title: string }[];
  itemCount: number;
};

type ManifestItem = {
  id: string;
  type: 'image' | 'video';
  album?: string;
  publicId: string;
  width: number;
  height: number;
  caption?: string;
  alt?: string;
  location?: string;
  featured?: boolean;
  capturedAt?: string;
  lqip?: string;
  color?: string;
};

type QueueEntry = {
  key: string;
  file: File;
  status: 'waiting' | 'uploading' | 'uploaded' | 'duplicate' | 'failed';
  reason?: string;
  publicId?: string;
};

/** Three at a time: enough to saturate a home connection, few enough to read. */
const CONCURRENCY = 3;

const IMAGE_EXT = /\.(jpe?g|png|heic|heif|webp|avif|tiff?)$/i;
const VIDEO_EXT = /\.(mp4|mov|m4v|webm)$/i;

export type Destination = {
  name: 'r2' | 'cloudinary' | 'none';
  /** Public identifier for the backend — a bucket URL or a cloud name. */
  label: string | null;
  /** Whether the credentials to actually upload are present. */
  ready: boolean;
  missingHint: string;
};

export function MediaAdmin({ destination }: { destination: Destination }) {
  const [years, setYears] = useState<YearSummary[]>([]);
  const [year, setYear] = useState('');
  const [album, setAlbum] = useState('');
  const [albumTitle, setAlbumTitle] = useState('');
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<ManifestItem[]>([]);
  const [dirty, setDirty] = useState<Record<string, Partial<ManifestItem>>>({});
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>(
    'idle',
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  /* --- load the list of years ------------------------------------------ */
  const loadYears = useCallback(async () => {
    const res = await fetch('/api/admin/media/manifest');
    if (!res.ok) return;
    const data = (await res.json()) as { years: YearSummary[] };
    setYears(data.years ?? []);
    setYear(
      (current) => current || String(data.years?.[0]?.year ?? new Date().getFullYear()),
    );
  }, []);

  useEffect(() => {
    void loadYears();
  }, [loadYears]);

  /* --- load one year's items ------------------------------------------- */
  const loadItems = useCallback(async (target: string) => {
    if (!/^\d{4}$/.test(target)) return;
    const res = await fetch(`/api/admin/media/manifest?year=${target}`);
    if (!res.ok) return;
    const data = (await res.json()) as { items?: ManifestItem[] };
    setItems(data.items ?? []);
    setDirty({});
    setSaveState('idle');
  }, []);

  useEffect(() => {
    if (year) void loadItems(year);
  }, [year, loadItems]);

  /* --- uploading -------------------------------------------------------- */

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const accepted: QueueEntry[] = [];
    for (const file of Array.from(incoming)) {
      const ok = IMAGE_EXT.test(file.name) || VIDEO_EXT.test(file.name);
      accepted.push({
        key: `${file.name}-${file.size}-${file.lastModified}`,
        file,
        status: ok ? 'waiting' : 'failed',
        reason: ok ? undefined : 'Unsupported file type.',
      });
    }
    setQueue((current) => {
      const seen = new Set(current.map((entry) => entry.key));
      return [...current, ...accepted.filter((entry) => !seen.has(entry.key))];
    });
  }, []);

  const runQueue = useCallback(async () => {
    if (!/^\d{4}$/.test(year)) {
      setNotice('Pick a four digit year first.');
      return;
    }
    setBusy(true);
    setNotice(null);

    // A shared cursor over the queue: each worker takes the next waiting entry.
    const pending = queue.filter((entry) => entry.status === 'waiting');
    let cursor = 0;

    const worker = async () => {
      for (;;) {
        const index = cursor;
        cursor += 1;
        const entry = pending[index];
        if (!entry) return;

        setQueue((current) =>
          current.map((q) => (q.key === entry.key ? { ...q, status: 'uploading' } : q)),
        );

        const form = new FormData();
        form.set('file', entry.file);
        form.set('year', year);
        if (album) form.set('album', album);
        if (albumTitle) form.set('albumTitle', albumTitle);

        try {
          const res = await fetch('/api/admin/media/upload', {
            method: 'POST',
            body: form,
          });
          const data = (await res.json()) as {
            status?: QueueEntry['status'];
            reason?: string;
            error?: string;
            publicId?: string;
          };

          if (data.error) {
            setNotice(data.error);
            setQueue((current) =>
              current.map((q) =>
                q.key === entry.key ? { ...q, status: 'failed', reason: data.error } : q,
              ),
            );
            return; // a credential problem will fail every remaining file too
          }

          setQueue((current) =>
            current.map((q) =>
              q.key === entry.key
                ? {
                    ...q,
                    status: data.status ?? 'failed',
                    reason: data.reason,
                    publicId: data.publicId,
                  }
                : q,
            ),
          );
        } catch (error) {
          setQueue((current) =>
            current.map((q) =>
              q.key === entry.key
                ? { ...q, status: 'failed', reason: (error as Error).message }
                : q,
            ),
          );
        }
      }
    };

    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    setBusy(false);
    await loadYears();
    await loadItems(year);
  }, [album, albumTitle, loadItems, loadYears, queue, year]);

  /* --- editing ---------------------------------------------------------- */

  const edit = useCallback((id: string, field: keyof ManifestItem, value: unknown) => {
    setDirty((current) => ({ ...current, [id]: { ...current[id], [field]: value } }));
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
    );
    setSaveState('idle');
  }, []);

  const save = useCallback(async () => {
    const edits = Object.entries(dirty).map(([id, fields]) => ({ id, ...fields }));
    if (edits.length === 0) return;

    setSaveState('saving');
    try {
      const res = await fetch('/api/admin/media/manifest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, items: edits }),
      });
      setSaveState(res.ok ? 'saved' : 'error');
      if (res.ok) setDirty({});
    } catch {
      setSaveState('error');
    }
  }, [dirty, year]);

  const dirtyCount = Object.keys(dirty).length;
  const uploaded = queue.filter((q) => q.status === 'uploaded').length;
  const failed = queue.filter((q) => q.status === 'failed').length;
  const duplicates = queue.filter((q) => q.status === 'duplicate').length;
  const waiting = queue.filter((q) => q.status === 'waiting').length;

  const currentYear = years.find((y) => String(y.year) === year);

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.h1}>Media</h1>
        <p style={styles.sub}>
          Photographs and video, imported into{' '}
          <code>content/media/{year || 'YYYY'}.yml</code>.
          {destination.ready ? (
            <>
              {' '}
              Uploading to{' '}
              <strong>{destination.name === 'r2' ? 'R2' : 'Cloudinary'}</strong>
              {destination.label ? (
                <>
                  {' '}
                  — <code>{destination.label}</code>
                </>
              ) : null}
              .
            </>
          ) : (
            <strong style={{ color: '#b3261e' }}> {destination.missingHint}</strong>
          )}
        </p>
        <p style={styles.sub}>
          Your originals are never modified. GPS and device serials are stripped before
          anything is uploaded.
        </p>
      </header>

      {notice ? <div style={styles.notice}>{notice}</div> : null}

      {/* --- destination ------------------------------------------------ */}
      <section style={styles.card}>
        <h2 style={styles.h2}>1 · Where does it go</h2>
        <div style={styles.row}>
          <label style={styles.field}>
            <span style={styles.label}>Year</span>
            <input
              value={year}
              onChange={(e) => setYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="2019"
              inputMode="numeric"
              style={styles.input}
              list="known-years"
            />
            <datalist id="known-years">
              {years.map((y) => (
                <option key={y.year} value={y.year} />
              ))}
            </datalist>
          </label>

          <label style={styles.field}>
            <span style={styles.label}>Album</span>
            <input
              value={album}
              onChange={(e) => setAlbum(e.target.value)}
              placeholder="serbia — leave blank for everyday photos"
              style={styles.input}
              list="known-albums"
            />
            <datalist id="known-albums">
              {(currentYear?.albums ?? []).map((a) => (
                <option key={a.slug} value={a.slug}>
                  {a.title}
                </option>
              ))}
            </datalist>
          </label>

          <label style={styles.field}>
            <span style={styles.label}>Album title</span>
            <input
              value={albumTitle}
              onChange={(e) => setAlbumTitle(e.target.value)}
              placeholder="Only needed for a new album"
              style={styles.input}
            />
          </label>
        </div>
        <p style={styles.hint}>
          {album
            ? `Files will appear at /photos/${year || 'YYYY'}/${album}`
            : `Files will appear in the everyday photographs for ${year || 'YYYY'}`}
        </p>
      </section>

      {/* --- dropzone --------------------------------------------------- */}
      <section style={styles.card}>
        <h2 style={styles.h2}>2 · Drop the files</h2>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
          }}
          style={{
            ...styles.dropzone,
            borderColor: dragging ? '#a8432a' : '#c9c4bd',
            background: dragging ? '#fdf3ef' : '#fbfaf9',
          }}
        >
          <p style={{ margin: 0, fontSize: 15 }}>
            Drag photographs and video here, or{' '}
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              style={styles.linkBtn}
            >
              choose files
            </button>
            .
          </p>
          <p style={{ ...styles.hint, marginTop: 6 }}>
            JPEG, PNG, HEIC, WebP, AVIF, TIFF · MP4, MOV, M4V, WebM
          </p>
          <input
            ref={fileInput}
            type="file"
            multiple
            accept="image/*,video/*"
            onChange={(e) => e.target.files && addFiles(e.target.files)}
            style={{ display: 'none' }}
          />
        </div>

        {queue.length > 0 ? (
          <>
            <div style={styles.queueBar}>
              <span style={styles.hint}>
                {queue.length} file{queue.length === 1 ? '' : 's'}
                {uploaded ? ` · ${uploaded} uploaded` : ''}
                {duplicates ? ` · ${duplicates} already there` : ''}
                {failed ? ` · ${failed} failed` : ''}
              </span>
              <span style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setQueue([])}
                  disabled={busy}
                  style={styles.secondaryBtn}
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={runQueue}
                  disabled={busy || waiting === 0 || !destination.ready}
                  style={styles.primaryBtn}
                >
                  {busy
                    ? 'Uploading…'
                    : `Upload ${waiting} file${waiting === 1 ? '' : 's'}`}
                </button>
              </span>
            </div>

            <ul style={styles.queue}>
              {queue.map((entry) => (
                <li key={entry.key} style={styles.queueItem}>
                  <span
                    style={{ ...styles.dot, background: statusColor(entry.status) }}
                  />
                  <span style={styles.queueName}>{entry.file.name}</span>
                  <span style={styles.queueMeta}>
                    {entry.reason ?? entry.status}
                    {entry.status === 'waiting'
                      ? ` · ${formatBytes(entry.file.size)}`
                      : ''}
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </section>

      {/* --- metadata ---------------------------------------------------- */}
      <section style={styles.card}>
        <div style={styles.cardHead}>
          <h2 style={{ ...styles.h2, margin: 0 }}>3 · Captions and details</h2>
          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {saveState === 'saved' ? <span style={styles.hint}>Saved.</span> : null}
            {saveState === 'error' ? (
              <span style={{ ...styles.hint, color: '#b3261e' }}>Could not save.</span>
            ) : null}
            <button
              type="button"
              onClick={save}
              disabled={dirtyCount === 0 || saveState === 'saving'}
              style={styles.primaryBtn}
            >
              {saveState === 'saving'
                ? 'Saving…'
                : dirtyCount > 0
                  ? `Save ${dirtyCount} change${dirtyCount === 1 ? '' : 's'}`
                  : 'Saved'}
            </button>
          </span>
        </div>

        <p style={styles.hint}>
          Locations are typed by hand and always broad — coordinates are stripped at
          import and never published. Re-importing never overwrites anything you write
          here.
        </p>

        {items.length === 0 ? (
          <p style={{ ...styles.hint, marginTop: 16 }}>
            Nothing in {year || 'this year'} yet.
          </p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th} />
                <th style={styles.th}>Caption</th>
                <th style={styles.th}>Alt text</th>
                <th style={styles.th}>Location</th>
                <th style={{ ...styles.th, width: 70, textAlign: 'center' }}>Featured</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td style={styles.td}>
                    <div
                      style={{
                        ...styles.thumb,
                        backgroundColor: item.color ?? '#e8e4df',
                        backgroundImage: item.lqip ? `url(${item.lqip})` : undefined,
                      }}
                      title={`${item.id}\n${item.publicId}\n${item.width}×${item.height}`}
                    >
                      {item.type === 'video' ? (
                        <span style={styles.videoTag}>VIDEO</span>
                      ) : null}
                    </div>
                    <span style={styles.idLabel}>{item.album ?? 'everyday'}</span>
                  </td>
                  <td style={styles.td}>
                    <input
                      value={item.caption ?? ''}
                      onChange={(e) => edit(item.id, 'caption', e.target.value)}
                      placeholder="Your words"
                      style={styles.cellInput}
                    />
                  </td>
                  <td style={styles.td}>
                    <input
                      value={item.alt ?? ''}
                      onChange={(e) => edit(item.id, 'alt', e.target.value)}
                      placeholder="What it shows"
                      style={styles.cellInput}
                    />
                  </td>
                  <td style={styles.td}>
                    <input
                      value={item.location ?? ''}
                      onChange={(e) => edit(item.id, 'location', e.target.value)}
                      placeholder="Belgrade, Serbia"
                      style={styles.cellInput}
                    />
                  </td>
                  <td style={{ ...styles.td, textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={Boolean(item.featured)}
                      onChange={(e) => edit(item.id, 'featured', e.target.checked)}
                      aria-label={`Feature ${item.id}`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

/* ==========================================================================
   Bits
   ========================================================================== */

function statusColor(status: QueueEntry['status']): string {
  switch (status) {
    case 'uploaded':
      return '#2e7d32';
    case 'failed':
      return '#b3261e';
    case 'duplicate':
      return '#b7791f';
    case 'uploading':
      return '#a8432a';
    default:
      return '#c9c4bd';
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const styles: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1100, margin: '0 auto', padding: '40px 24px 96px' },
  header: { marginBottom: 28 },
  h1: { fontSize: 30, fontWeight: 650, letterSpacing: '-0.02em', margin: '0 0 8px' },
  h2: {
    fontSize: 14,
    fontWeight: 650,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    margin: '0 0 16px',
    opacity: 0.65,
  },
  sub: { margin: '0 0 4px', fontSize: 14, opacity: 0.75, lineHeight: 1.6 },
  card: {
    border: '1px solid #e2ddd6',
    borderRadius: 6,
    padding: 24,
    marginBottom: 20,
    background: '#fff',
  },
  cardHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  row: { display: 'flex', gap: 16, flexWrap: 'wrap' },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    flex: '1 1 220px',
    minWidth: 0,
  },
  label: {
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    opacity: 0.6,
  },
  input: {
    padding: '9px 11px',
    border: '1px solid #cfc9c2',
    borderRadius: 4,
    fontSize: 14,
    font: 'inherit',
    minWidth: 0,
  },
  cellInput: {
    width: '100%',
    padding: '7px 9px',
    border: '1px solid #ddd8d1',
    borderRadius: 4,
    fontSize: 13,
    font: 'inherit',
    minWidth: 0,
  },
  hint: { fontSize: 12.5, opacity: 0.6, margin: '12px 0 0', lineHeight: 1.6 },
  dropzone: {
    border: '2px dashed #c9c4bd',
    borderRadius: 6,
    padding: '40px 24px',
    textAlign: 'center',
    transition: 'background .2s, border-color .2s',
  },
  queueBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    marginTop: 20,
    flexWrap: 'wrap',
  },
  queue: {
    listStyle: 'none',
    margin: '12px 0 0',
    padding: 0,
    maxHeight: 260,
    overflowY: 'auto',
    border: '1px solid #eee9e2',
    borderRadius: 4,
  },
  queueItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '7px 12px',
    borderBottom: '1px solid #f2eee8',
    fontSize: 13,
  },
  queueName: {
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  queueMeta: { fontSize: 12, opacity: 0.6, flexShrink: 0 },
  dot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  table: { width: '100%', borderCollapse: 'collapse', marginTop: 16, fontSize: 13 },
  th: {
    textAlign: 'left',
    fontSize: 11,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    opacity: 0.55,
    padding: '0 8px 8px 0',
    fontWeight: 600,
  },
  td: {
    padding: '8px 8px 8px 0',
    borderTop: '1px solid #f0ebe4',
    verticalAlign: 'middle',
  },
  thumb: {
    width: 64,
    height: 44,
    borderRadius: 3,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    position: 'relative',
    flexShrink: 0,
  },
  videoTag: {
    position: 'absolute',
    bottom: 3,
    right: 3,
    fontSize: 8,
    letterSpacing: '0.08em',
    background: 'rgba(0,0,0,.6)',
    color: '#fff',
    padding: '1px 3px',
    borderRadius: 2,
  },
  idLabel: {
    display: 'block',
    fontSize: 10,
    opacity: 0.5,
    marginTop: 4,
    letterSpacing: '0.04em',
  },
  primaryBtn: {
    padding: '8px 14px',
    border: 0,
    borderRadius: 4,
    background: '#a8432a',
    color: '#fff',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    font: 'inherit',
  },
  secondaryBtn: {
    padding: '8px 14px',
    border: '1px solid #cfc9c2',
    borderRadius: 4,
    background: 'transparent',
    fontSize: 13,
    cursor: 'pointer',
    font: 'inherit',
  },
  linkBtn: {
    border: 0,
    background: 'none',
    padding: 0,
    font: 'inherit',
    color: '#a8432a',
    textDecoration: 'underline',
    cursor: 'pointer',
  },
  notice: {
    border: '1px solid #e6b8ad',
    background: '#fdf3ef',
    color: '#7a2f1c',
    padding: '12px 16px',
    borderRadius: 5,
    marginBottom: 20,
    fontSize: 14,
  },
};
