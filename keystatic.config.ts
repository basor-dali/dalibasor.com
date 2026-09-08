import { collection, config, fields, singleton } from '@keystatic/core';
import { block, wrapper } from '@keystatic/core/content-components';

/**
 * Keystatic — the editing UI for everything that is words.
 *
 * This is a front-end onto the files that already exist, not a database. Every
 * field below maps to a frontmatter key in src/types/content.ts, and the body
 * is stored as ordinary MDX. Delete this file and the /keystatic route and the
 * archive is completely unaffected — which is the point.
 *
 * Storage is `local`: it writes directly to the working tree, so it only runs
 * on this machine and there is nothing to log into. See docs/CMS.md for
 * switching to GitHub-backed storage if you ever want to write from a phone.
 *
 * Photographs are NOT managed here. Thousands of binaries do not belong in Git.
 * Image fields take a Cloudinary public id — the same string the importer
 * writes into content/media/*.yml — and /admin/media is where files get
 * uploaded.
 */

/* ==========================================================================
   Shared field builders
   ========================================================================== */

/** A Cloudinary public id, not an upload. */
const mediaId = (label: string, description: string) =>
  fields.text({
    label,
    description,
    validation: { isRequired: false },
  });

const coverFields = {
  coverImage: mediaId(
    'Cover image',
    'A media public id, e.g. dalibasor/2026/serbia/img_0042. Upload it at /admin/media first.',
  ),
  coverAlt: fields.text({
    label: 'Cover alt text',
    description: 'What the photograph shows, for screen readers.',
    validation: { isRequired: false },
  }),
};

const placeholderField = fields.checkbox({
  label: 'Still a placeholder',
  description: 'Tick while this is scaffolding you have not written yet.',
  defaultValue: false,
});

const draftField = fields.checkbox({
  label: 'Draft',
  description: 'Visible while developing, hidden on the live site.',
  defaultValue: false,
});

/* ==========================================================================
   MDX components
   ==========================================================================
   These mirror src/components/mdx/components.tsx exactly. If you add one
   there, add it here too or it will not be insertable from the editor. */

const mdxComponents = {
  Figure: block({
    label: 'Photograph',
    description: 'A single image. Add bleed to break out past the text width.',
    schema: {
      src: fields.text({ label: 'Media public id', validation: { isRequired: true } }),
      alt: fields.text({ label: 'Alt text', validation: { isRequired: true } }),
      caption: fields.text({ label: 'Caption', validation: { isRequired: false } }),
      ratio: fields.text({
        label: 'Aspect ratio',
        description: 'e.g. 3 / 2. Leave blank for the default.',
        validation: { isRequired: false },
      }),
      bleed: fields.checkbox({ label: 'Full width', defaultValue: false }),
    },
  }),

  Row: wrapper({
    label: 'Row of photographs',
    description: 'Two or three side by side. Stacks on mobile.',
    schema: {
      caption: fields.text({ label: 'Caption for the row', validation: { isRequired: false } }),
    },
  }),

  Video: block({
    label: 'Video',
    description: 'Nothing downloads until it is played.',
    schema: {
      src: fields.text({ label: 'Media public id', validation: { isRequired: true } }),
      poster: fields.text({ label: 'Poster public id', validation: { isRequired: false } }),
      caption: fields.text({ label: 'Caption', validation: { isRequired: false } }),
      width: fields.integer({ label: 'Source width', defaultValue: 1920 }),
      height: fields.integer({ label: 'Source height', defaultValue: 1080 }),
    },
  }),

  Pull: wrapper({
    label: 'Pull quote',
    description: 'Loud and full width. Once per piece at most.',
    schema: {
      cite: fields.text({ label: 'Attribution', validation: { isRequired: false } }),
    },
  }),

  Note: wrapper({
    label: 'Note',
    description: 'A short aside in a quieter voice.',
    schema: {
      label: fields.text({ label: 'Label', defaultValue: 'Note' }),
    },
  }),

  Placeholder: wrapper({
    label: 'Placeholder',
    description: 'Scaffolding you intend to replace. Deliberately loud.',
    schema: {},
  }),
};

const body = fields.mdx({
  label: 'Body',
  description: 'Rough is fine. Nothing here needs tidying up.',
  options: {
    image: false, // images come from the media archive, not the repo
  },
  components: mdxComponents,
});

/* ==========================================================================
   Config
   ========================================================================== */

export default config({
  storage: { kind: 'local' },

  ui: {
    brand: { name: 'Dali Basor' },
    navigation: {
      Words: ['writing', 'projects'],
      Life: ['now', 'about'],
    },
  },

  collections: {
    /* --- writing --------------------------------------------------------- */
    writing: collection({
      label: 'Writing',
      // `**` so posts filed under a year folder stay editable. A new entry can
      // be created as `2026/getting-strong-again` to keep that habit, or as a
      // bare slug — the site reads the year from the date either way.
      path: 'content/writing/**',
      slugField: 'title',
      format: { contentField: 'body' },
      entryLayout: 'content',
      columns: ['title', 'date'],
      parseSlugForSort: (slug) => slug,
      schema: {
        title: fields.slug({
          name: { label: 'Title', validation: { isRequired: true } },
          slug: {
            label: 'URL slug',
            description:
              'Permanent. Changing it after publishing breaks every link to the post.',
          },
        }),
        date: fields.date({
          label: 'Date',
          validation: { isRequired: true },
          defaultValue: { kind: 'today' },
        }),
        subtitle: fields.text({
          label: 'Subtitle',
          description: 'Optional editorial line under the title.',
          validation: { isRequired: false },
        }),
        tags: fields.array(fields.text({ label: 'Tag' }), {
          label: 'Tags',
          description: 'Free text. Tag pages are generated from whatever you use.',
          itemLabel: (props) => props.value,
        }),
        ...coverFields,
        coverShape: fields.select({
          label: 'Cover shape',
          description: 'How listings should crop the cover.',
          options: [
            { label: 'Wide', value: 'wide' },
            { label: 'Tall', value: 'tall' },
            { label: 'Square', value: 'square' },
          ],
          defaultValue: 'wide',
        }),
        location: fields.text({
          label: 'Location',
          description: 'Broad, e.g. Belgrade, Serbia.',
          validation: { isRequired: false },
        }),
        excerpt: fields.text({
          label: 'Excerpt',
          description: 'Optional on purpose. Nothing requires one.',
          multiline: true,
          validation: { isRequired: false },
        }),
        featured: fields.checkbox({
          label: 'Featured',
          description: 'Promote on the homepage and archive.',
          defaultValue: false,
        }),
        draft: draftField,
        placeholder: placeholderField,
        body,
      },
    }),

    /* --- projects -------------------------------------------------------- */
    projects: collection({
      label: 'Projects',
      path: 'content/projects/*',
      slugField: 'title',
      format: { contentField: 'body' },
      entryLayout: 'content',
      columns: ['title', 'status'],
      schema: {
        title: fields.slug({
          name: { label: 'Title', validation: { isRequired: true } },
          slug: { label: 'URL slug', description: 'Permanent.' },
        }),
        status: fields.select({
          label: 'Status',
          description: 'Abandoned is a real status, not a failure to hide.',
          options: [
            { label: 'Building', value: 'building' },
            { label: 'Experiment', value: 'experiment' },
            { label: 'Finished', value: 'finished' },
            { label: 'Paused', value: 'paused' },
            { label: 'Abandoned', value: 'abandoned' },
          ],
          defaultValue: 'building',
        }),
        startDate: fields.text({
          label: 'Start date',
          description: 'YYYY, YYYY-MM or YYYY-MM-DD.',
          validation: { isRequired: true },
        }),
        endDate: fields.text({
          label: 'End date',
          description: 'Only once it has actually stopped.',
          validation: { isRequired: false },
        }),
        description: fields.text({
          label: 'Description',
          description: 'One or two lines, shown in listings.',
          multiline: true,
          validation: { isRequired: false },
        }),
        technologies: fields.array(fields.text({ label: 'Technology' }), {
          label: 'Technologies',
          itemLabel: (props) => props.value,
        }),
        collaborators: fields.array(fields.text({ label: 'Name' }), {
          label: 'Collaborators',
          itemLabel: (props) => props.value,
        }),
        ...coverFields,
        gallery: fields.array(
          fields.object({
            publicId: fields.text({ label: 'Media public id', validation: { isRequired: true } }),
            type: fields.select({
              label: 'Type',
              options: [
                { label: 'Image', value: 'image' },
                { label: 'Video', value: 'video' },
              ],
              defaultValue: 'image',
            }),
            alt: fields.text({ label: 'Alt text', validation: { isRequired: false } }),
            caption: fields.text({ label: 'Caption', validation: { isRequired: false } }),
            width: fields.integer({ label: 'Width', validation: { isRequired: false } }),
            height: fields.integer({ label: 'Height', validation: { isRequired: false } }),
          }),
          {
            label: 'Gallery',
            description: 'Upload at /admin/media, then paste the public ids here.',
            itemLabel: (props) => props.fields.publicId.value || 'Item',
          },
        ),
        links: fields.array(
          fields.object({
            label: fields.text({ label: 'Label', validation: { isRequired: true } }),
            href: fields.url({ label: 'URL', validation: { isRequired: true } }),
          }),
          { label: 'Links', itemLabel: (props) => props.fields.label.value || 'Link' },
        ),
        relatedWriting: fields.array(
          fields.relationship({ label: 'Post', collection: 'writing' }),
          {
            label: 'Related writing',
            itemLabel: (props) => props.value ?? 'Post',
          },
        ),
        featured: fields.checkbox({ label: 'Featured', defaultValue: false }),
        order: fields.integer({
          label: 'Manual order',
          description: 'Higher sorts first, overriding status ordering.',
          defaultValue: 0,
        }),
        draft: draftField,
        placeholder: placeholderField,
        body,
      },
    }),

    /* --- now ------------------------------------------------------------- */
    now: collection({
      label: 'Now',
      path: 'content/now/*',
      slugField: 'period',
      format: { contentField: 'body' },
      entryLayout: 'content',
      columns: ['period', 'location'],
      // Newest first — this list becomes the timeline of a life.
      parseSlugForSort: (slug) => slug,
      schema: {
        period: fields.slug({
          name: {
            label: 'Period',
            description: 'YYYY-MM. This is also the filename and the permanent URL.',
            validation: { isRequired: true },
          },
          slug: { label: 'URL segment' },
        }),
        title: fields.text({
          label: 'Heading',
          description: 'e.g. September 2026. Derived from the period if left blank.',
          validation: { isRequired: false },
        }),
        location: fields.text({
          label: 'Location',
          validation: { isRequired: false },
        }),
        date: fields.date({
          label: 'Written on',
          defaultValue: { kind: 'today' },
          validation: { isRequired: false },
        }),
        ...coverFields,
        draft: draftField,
        placeholder: placeholderField,
        body,
      },
    }),
  },

  singletons: {
    /* --- about ----------------------------------------------------------- */
    about: singleton({
      label: 'About',
      path: 'content/pages/about',
      format: { contentField: 'body' },
      entryLayout: 'content',
      schema: {
        title: fields.text({ label: 'Title', defaultValue: 'About' }),
        subtitle: fields.text({
          label: 'Subtitle',
          validation: { isRequired: false },
        }),
        ...coverFields,
        timeline: fields.array(
          fields.object({
            when: fields.text({
              label: 'When',
              description: 'Free text: 1993, 2011, 2019 — now.',
              validation: { isRequired: true },
            }),
            what: fields.text({ label: 'What', validation: { isRequired: true } }),
            where: fields.text({ label: 'Where', validation: { isRequired: false } }),
          }),
          {
            label: 'Timeline',
            description: 'Leave empty and the timeline disappears from the page.',
            itemLabel: (props) =>
              [props.fields.when.value, props.fields.what.value].filter(Boolean).join(' — '),
          },
        ),
        placeholder: placeholderField,
        body,
      },
    }),
  },
});
