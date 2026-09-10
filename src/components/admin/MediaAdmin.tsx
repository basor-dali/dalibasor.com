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

/** An album as the manifest stores it — everything the form can edit. */
type AlbumRecord = {
  slug: string;
  title?: string;
  subtitle?: string;
  date?: string;
  location?: string;
  note?: string;
  featured?: boolean;
  hidden?: boolean;
};

/** The album form's fields, all present so a save is a whole record. */
type AlbumForm = {
  title: string;
  subtitle: string;
  date: string;
  location: string;
  note: string;
  featured: boolean;
  hidden: boolean;
};

const EMPTY_ALBUM_FORM: AlbumForm = {
  title: '',
  subtitle: '',
  date: '',
  location: '',
  note: '',
  featured: false,
  hidden: false,
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
  hidden?: boolean;
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
  const [yearAlbums, setYearAlbums] = useState<AlbumRecord[]>([]);
  const [albumForm, setAlbumForm] = useState<AlbumForm>(EMPTY_ALBUM_FORM);
  const [busyAction, setBusyAction] = useState(false);
  const [albumNotice, setAlbumNotice] = useState<string | null>(null);
  const [albumOpen, setAlbumOpen] = useState(false);
  /** The slug being edited, or null while creating. */
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [newAlbumName, setNewAlbumName] = useState('');
  const [newYearOpen, setNewYearOpen] = useState(false);
  const [newYear, setNewYear] = useState('');
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
    const data = (await res.json()) as {
      items?: ManifestItem[];
      albums?: AlbumRecord[];
    };
    setItems(data.items ?? []);
    setYearAlbums(data.albums ?? []);
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
        if (album && albumForm.title) form.set('albumTitle', albumForm.title);

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
  }, [album, albumForm.title, loadItems, loadYears, queue, year]);

  /* --- years and albums -------------------------------------------------

     Everything here writes through /api/admin/media/manifest, which is the one
     place that edits a manifest, and then reloads rather than patching local
     state — the file on disk is the truth and guessing at it is how a CMS ends
     up disagreeing with the site it edits. */

  /** How many photographs are filed under an album, or under no album. */
  const countIn = useCallback(
    (slug: string | undefined) =>
      items.filter((item) => (item.album ?? undefined) === slug).length,
    [items],
  );

  /** Live preview of the address a typed album name will get. */
  const slugPreview = newAlbumName
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['\u2019]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const openAlbum = useCallback((entry: AlbumRecord | null) => {
    setAlbumNotice(null);
    setAlbumOpen(true);
    setEditingSlug(entry?.slug ?? null);
    setNewAlbumName('');
    setAlbumForm(
      entry
        ? {
            title: entry.title ?? '',
            subtitle: entry.subtitle ?? '',
            date: entry.date ?? '',
            location: entry.location ?? '',
            note: entry.note ?? '',
            featured: Boolean(entry.featured),
            hidden: Boolean(entry.hidden),
          }
        : EMPTY_ALBUM_FORM,
    );
  }, []);

  /** Every manifest write goes through here, so refreshing cannot be forgotten. */
  const writeManifest = useCallback(async (body: Record<string, unknown>) => {
    setBusyAction(true);
    setAlbumNotice(null);
    try {
      const res = await fetch('/api/admin/media/manifest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as Record<string, unknown>;
      if (!res.ok) {
        setAlbumNotice(String(data.error ?? 'That did not work.'));
        return null;
      }
      return data;
    } catch (error) {
      setAlbumNotice((error as Error).message);
      return null;
    } finally {
      setBusyAction(false);
    }
  }, []);

  const createYear = useCallback(async () => {
    if (!/^\d{4}$/.test(newYear)) {
      setAlbumNotice('A year is four digits.');
      return;
    }
    const data = await writeManifest({ action: 'create-year', year: newYear });
    if (!data) return;

    setNewYearOpen(false);
    setYear(newYear);
    setAlbum('');
    await loadYears();
    await loadItems(newYear);
    setAlbumNotice(
      data.created ? `Created ${String(data.file)}` : `${newYear} already existed.`,
    );
  }, [newYear, writeManifest, loadYears, loadItems]);

  const deleteYear = useCallback(async () => {
    if (!window.confirm(`Delete the manifest for ${year}? It has nothing in it.`)) return;

    const data = await writeManifest({ action: 'delete-year', year });
    if (!data) return;

    setAlbum('');
    setYear('');
    await loadYears();
    setAlbumNotice(`Deleted ${String(data.deleted)}`);
  }, [year, writeManifest, loadYears]);

  const saveAlbum = useCallback(async () => {
    const slug = editingSlug ?? newAlbumName.trim();
    if (!slug) {
      setAlbumNotice('Give the album a name.');
      return;
    }

    const data = await writeManifest({
      action: 'save-album',
      year,
      album: { slug, ...albumForm },
    });
    if (!data) return;

    // The server slugifies, so "Novi Sad 2019" comes back as novi-sad-2019.
    // Adopt it, or the next save would create a second album.
    const saved = String(data.slug ?? slug);
    setAlbum(saved);
    setEditingSlug(saved);
    setNewAlbumName('');
    await loadYears();
    await loadItems(year);
    setAlbumNotice(`${data.created ? 'Created' : 'Saved'} — ${String(data.href)}`);
  }, [editingSlug, newAlbumName, albumForm, year, writeManifest, loadYears, loadItems]);

  const toggleAlbumHidden = useCallback(
    async (entry: AlbumRecord) => {
      // The whole record is sent, so everything not being changed is preserved.
      const data = await writeManifest({
        action: 'save-album',
        year,
        album: {
          slug: entry.slug,
          title: entry.title ?? '',
          subtitle: entry.subtitle ?? '',
          date: entry.date ?? '',
          location: entry.location ?? '',
          note: entry.note ?? '',
          featured: Boolean(entry.featured),
          hidden: !entry.hidden,
        },
      });
      if (!data) return;

      await loadYears();
      await loadItems(year);
      setAlbumNotice(
        entry.hidden
          ? `${entry.title ?? entry.slug} is back on the site.`
          : `${entry.title ?? entry.slug} is hidden. Nothing was deleted.`,
      );
    },
    [year, writeManifest, loadYears, loadItems],
  );

  const deleteAlbum = useCallback(
    async (entry: AlbumRecord) => {
      const count = countIn(entry.slug);
      const warning =
        count > 0
          ? `Delete the album "${entry.title ?? entry.slug}"?\n\nIts ${count} photograph(s) are NOT deleted — they move to the everyday photographs for ${year}, and their files stay in the bucket.`
          : `Delete the empty album "${entry.title ?? entry.slug}"?`;

      if (!window.confirm(warning)) return;

      const data = await writeManifest({
        action: 'delete-album',
        year,
        album: { slug: entry.slug },
      });
      if (!data) return;

      if (album === entry.slug) setAlbum('');
      setAlbumOpen(false);
      await loadYears();
      await loadItems(year);
      setAlbumNotice(
        Number(data.moved) > 0
          ? `Album removed. ${String(data.moved)} photograph(s) moved to everyday.`
          : 'Album removed.',
      );
    },
    [album, countIn, year, writeManifest, loadYears, loadItems],
  );

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

      {/* --- where does it go --------------------------------------------
          A list you click rather than a slug you type. Everything about a year
          or an album is reachable from here: make one, rename it, put it away,
          take it out again. */}
      <section style={styles.card}>
        <div style={styles.cardHead}>
          <h2 style={{ ...styles.h2, margin: 0 }}>1 · Where does it go</h2>
          <span style={styles.hintInline}>
            /photos/{year || 'YYYY'}
            {album ? `/${album}` : ''}
          </span>
        </div>

        {/* --- years --- */}
        <div style={styles.label}>Year</div>
        <div style={styles.chips}>
          {years.map((entry) => (
            <button
              key={entry.year}
              type="button"
              onClick={() => setYear(String(entry.year))}
              style={String(entry.year) === year ? styles.chipOn : styles.chip}
            >
              {entry.year}
              <span style={styles.chipCount}>{entry.itemCount}</span>
            </button>
          ))}

          {newYearOpen ? (
            <span style={styles.inlineForm}>
              <input
                value={newYear}
                onChange={(e) =>
                  setNewYear(e.target.value.replace(/\D/g, '').slice(0, 4))
                }
                placeholder="2019"
                inputMode="numeric"
                autoFocus
                style={{ ...styles.input, width: 96 }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void createYear();
                  if (e.key === 'Escape') setNewYearOpen(false);
                }}
              />
              <button
                type="button"
                onClick={() => void createYear()}
                disabled={busyAction}
                style={styles.secondaryBtn}
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => setNewYearOpen(false)}
                style={styles.linkBtn}
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => {
                setNewYear('');
                setNewYearOpen(true);
              }}
              style={styles.chipAdd}
            >
              + Year
            </button>
          )}
        </div>

        {/* --- albums within the selected year --- */}
        {year ? (
          <>
            <div style={{ ...styles.label, marginTop: 24 }}>Albums in {year}</div>

            <ul style={styles.albumList}>
              <li style={album === '' ? styles.albumRowOn : styles.albumRow}>
                <button
                  type="button"
                  onClick={() => setAlbum('')}
                  style={styles.albumPick}
                >
                  <span style={styles.albumName}>Everyday</span>
                  <span style={styles.hintInline}>
                    {countIn(undefined)} · photographs not in an album
                  </span>
                </button>
              </li>

              {yearAlbums.map((entry) => (
                <li
                  key={entry.slug}
                  style={entry.slug === album ? styles.albumRowOn : styles.albumRow}
                >
                  <button
                    type="button"
                    onClick={() => setAlbum(entry.slug)}
                    style={styles.albumPick}
                  >
                    <span style={styles.albumName}>
                      {entry.title ?? entry.slug}
                      {entry.hidden ? <span style={styles.tag}>hidden</span> : null}
                      {entry.featured ? <span style={styles.tag}>featured</span> : null}
                    </span>
                    <span style={styles.hintInline}>
                      {countIn(entry.slug)} · {entry.slug}
                      {entry.date ? ` · ${entry.date}` : ''}
                    </span>
                  </button>

                  <span style={styles.albumRowActions}>
                    <button
                      type="button"
                      onClick={() => openAlbum(entry)}
                      style={styles.linkBtn}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void toggleAlbumHidden(entry)}
                      disabled={busyAction}
                      style={styles.linkBtn}
                    >
                      {entry.hidden ? 'Show' : 'Hide'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteAlbum(entry)}
                      disabled={busyAction}
                      style={styles.dangerBtn}
                    >
                      Delete
                    </button>
                  </span>
                </li>
              ))}
            </ul>

            <div style={styles.albumActions}>
              <button
                type="button"
                onClick={() => openAlbum(null)}
                style={styles.secondaryBtn}
              >
                + New album
              </button>

              {/* Only offered for a year with nothing in it. Deleting a manifest
                  that still describes photographs would leave their files in the
                  bucket with nothing left to say what they are. */}
              {yearAlbums.length === 0 && items.length === 0 ? (
                <button
                  type="button"
                  onClick={() => void deleteYear()}
                  disabled={busyAction}
                  style={styles.dangerBtn}
                >
                  Delete {year}
                </button>
              ) : null}

              {albumNotice ? <span style={styles.hintInline}>{albumNotice}</span> : null}
            </div>
          </>
        ) : null}

        {/* --- the album form, when creating or editing --- */}
        {albumOpen ? (
          <div style={styles.albumPanel}>
            <div style={styles.cardHead}>
              <h3 style={styles.h3}>
                {editingSlug ? `Editing · ${editingSlug}` : 'New album'}
              </h3>
              <button
                type="button"
                onClick={() => setAlbumOpen(false)}
                style={styles.linkBtn}
              >
                Close
              </button>
            </div>

            <div style={styles.row}>
              {editingSlug ? null : (
                <label style={styles.field}>
                  <span style={styles.label}>Name</span>
                  <input
                    value={newAlbumName}
                    onChange={(e) => setNewAlbumName(e.target.value)}
                    placeholder="Novi Sad"
                    autoFocus
                    style={styles.input}
                  />
                  <span style={styles.hintInline}>
                    Address: /photos/{year}/{slugPreview || '…'}
                  </span>
                </label>
              )}

              <label style={styles.field}>
                <span style={styles.label}>Title</span>
                <input
                  value={albumForm.title}
                  onChange={(e) => setAlbumForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Novi Sad"
                  style={styles.input}
                />
              </label>

              <label style={styles.field}>
                <span style={styles.label}>Subtitle</span>
                <input
                  value={albumForm.subtitle}
                  onChange={(e) =>
                    setAlbumForm((f) => ({ ...f, subtitle: e.target.value }))
                  }
                  placeholder="Summer 2019"
                  style={styles.input}
                />
              </label>

              <label style={styles.field}>
                <span style={styles.label}>Date</span>
                <input
                  value={albumForm.date}
                  onChange={(e) => setAlbumForm((f) => ({ ...f, date: e.target.value }))}
                  placeholder="2019-07"
                  style={styles.input}
                />
              </label>

              <label style={styles.field}>
                <span style={styles.label}>Location</span>
                <input
                  value={albumForm.location}
                  onChange={(e) =>
                    setAlbumForm((f) => ({ ...f, location: e.target.value }))
                  }
                  placeholder="Novi Sad, Serbia"
                  style={styles.input}
                />
              </label>
            </div>

            <label style={{ ...styles.field, flex: '1 1 100%', marginTop: 16 }}>
              <span style={styles.label}>Note</span>
              <textarea
                value={albumForm.note}
                onChange={(e) => setAlbumForm((f) => ({ ...f, note: e.target.value }))}
                placeholder="A line about this album. Yours to write — nothing writes it for you."
                rows={2}
                style={{ ...styles.input, resize: 'vertical', fontFamily: 'inherit' }}
              />
            </label>

            <div style={styles.albumActions}>
              <label style={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={albumForm.featured}
                  onChange={(e) =>
                    setAlbumForm((f) => ({ ...f, featured: e.target.checked }))
                  }
                />
                <span>Featured on the archive index</span>
              </label>

              <label style={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={albumForm.hidden}
                  onChange={(e) =>
                    setAlbumForm((f) => ({ ...f, hidden: e.target.checked }))
                  }
                />
                <span>Hidden from the site</span>
              </label>

              <button
                type="button"
                onClick={() => void saveAlbum()}
                disabled={busyAction}
                style={styles.secondaryBtn}
              >
                {busyAction ? 'Saving…' : editingSlug ? 'Save album' : 'Create album'}
              </button>
            </div>

            <p style={styles.hint}>
              Date orders albums within the year — <code>2019</code>, <code>2019-07</code>{' '}
              or a full date. Saving writes the whole record, so clearing a field removes
              it.
            </p>
          </div>
        ) : null}

        <p style={styles.hint}>
          {album
            ? `Uploads land at /photos/${year || 'YYYY'}/${album}`
            : `Uploads land in the everyday photographs for ${year || 'YYYY'}`}
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
                <th style={{ ...styles.th, width: 60, textAlign: 'center' }}>Hidden</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} style={item.hidden ? styles.rowHidden : undefined}>
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
                  {/* Hidden keeps the entry and the file exactly where they are
                      and takes the photograph off the site — out of the grid,
                      the lightbox, the counts, the search index and the feeds.
                      One frame you would rather nobody saw does not need to be
                      deleted to stop being on the internet. */}
                  <td style={{ ...styles.td, textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={Boolean(item.hidden)}
                      onChange={(e) => edit(item.id, 'hidden', e.target.checked)}
                      aria-label={`Hide ${item.id}`}
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
  hintInline: { fontSize: 12.5, opacity: 0.6, lineHeight: 1.6 },
  chips: { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  chip: {
    display: 'inline-flex',
    alignItems: 'baseline',
    gap: 8,
    padding: '8px 14px',
    borderRadius: 999,
    border: '1px solid #e2ddd6',
    background: '#fff',
    font: 'inherit',
    fontSize: 14,
    cursor: 'pointer',
  },
  chipOn: {
    display: 'inline-flex',
    alignItems: 'baseline',
    gap: 8,
    padding: '8px 14px',
    borderRadius: 999,
    border: '1px solid #1c1a19',
    background: '#1c1a19',
    color: '#fff',
    font: 'inherit',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  chipCount: { fontSize: 11.5, opacity: 0.65 },
  chipAdd: {
    padding: '8px 14px',
    borderRadius: 999,
    border: '1px dashed #c9c1b6',
    background: 'transparent',
    font: 'inherit',
    fontSize: 14,
    cursor: 'pointer',
    opacity: 0.75,
  },
  inlineForm: { display: 'inline-flex', alignItems: 'center', gap: 8 },
  albumList: { listStyle: 'none', margin: '8px 0 0', padding: 0 },
  albumRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    borderTop: '1px solid #efeae3',
    padding: '4px 0',
  },
  albumRowOn: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    borderTop: '1px solid #efeae3',
    padding: '4px 0',
    background: '#faf7f2',
  },
  albumPick: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
    alignItems: 'flex-start',
    padding: '10px 8px',
    border: 0,
    background: 'transparent',
    font: 'inherit',
    textAlign: 'left',
    cursor: 'pointer',
  },
  albumName: {
    fontSize: 14.5,
    fontWeight: 600,
    display: 'flex',
    gap: 8,
    alignItems: 'center',
  },
  albumRowActions: { display: 'flex', gap: 4, flexShrink: 0, paddingRight: 4 },
  tag: {
    fontSize: 10.5,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    padding: '2px 6px',
    borderRadius: 3,
    background: '#efeae3',
    opacity: 0.8,
  },
  rowHidden: { opacity: 0.45 },
  dangerBtn: {
    border: 0,
    background: 'transparent',
    font: 'inherit',
    fontSize: 12.5,
    color: '#b3261e',
    textDecoration: 'underline',
    cursor: 'pointer',
    padding: '6px 4px',
  },
  h3: { fontSize: 14, fontWeight: 650, margin: 0 },
  albumPanel: {
    marginTop: 20,
    paddingTop: 20,
    borderTop: '1px solid #e2ddd6',
  },
  albumActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    flexWrap: 'wrap',
    marginTop: 16,
  },
  checkbox: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 13,
    cursor: 'pointer',
  },
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
