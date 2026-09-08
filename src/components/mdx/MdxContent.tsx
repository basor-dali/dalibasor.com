import { MDXRemote } from 'next-mdx-remote/rsc';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import rehypePrettyCode from 'rehype-pretty-code';
import rehypeSlug from 'rehype-slug';
import remarkGfm from 'remark-gfm';
import { mdxComponents } from './components';

/**
 * MDX rendering.
 *
 * Compiled on the server, at build time, with no client runtime. Everything a
 * post can contain is a server component unless it genuinely needs interaction.
 */

const prettyCodeOptions = {
  // Warm greys on a near-black ground; the accent stays reserved for the site.
  theme: 'vesper',
  keepBackground: false,
  defaultLang: 'text',
} as const;

export function MdxContent({ source }: { source: string }) {
  return (
    <MDXRemote
      source={source}
      components={mdxComponents}
      options={{
        parseFrontmatter: false,
        mdxOptions: {
          remarkPlugins: [remarkGfm],
          rehypePlugins: [
            rehypeSlug,
            [
              rehypeAutolinkHeadings,
              {
                behavior: 'append',
                properties: {
                  className: ['heading-anchor'],
                  ariaHidden: true,
                  tabIndex: -1,
                },
                content: { type: 'text', value: '#' },
              },
            ],
            [rehypePrettyCode, prettyCodeOptions],
          ],
        },
      }}
    />
  );
}
