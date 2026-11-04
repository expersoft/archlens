import { useMemo } from 'react';
import MarkdownIt from 'markdown-it';

// Raw HTML stays text (html: false) and markdown-it refuses javascript:/data: links: the report carries text the model
// and the base wrote.
const md = new MarkdownIt({ html: false, linkify: false, typographer: false });

/** Renders markdown as HTML, safely. Links open outside the GUI. */
export function Markdown({ text, className }: { text: string; className?: string }) {
  const html = useMemo(() => md.render(text).replace(/<a href=/g, '<a target="_blank" rel="noopener noreferrer" href='), [text]);
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
