import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { textToBlocks, stripMarkdownInline } from './text';
import { htmlToBlocks } from './html';
import { decodeXml, extractPptx, parseNotes, parseSlide } from './pptx';
import { bodySize, linesFromItems, pageBlocks } from './pdf';
import { fitWithin } from './image';
import { kindOf } from './types';

describe('textToBlocks', () => {
  it('splits paragraphs and tracks Markdown heading paths', () => {
    const blocks = textToBlocks(
      '# Cells\n\nIntro text.\n\n## Membrane\n\nThe **membrane** controls entry.',
      's1',
      true,
    );
    expect(blocks.map((b) => b.kind)).toEqual(['heading', 'text', 'heading', 'text']);
    expect(blocks[3]!.text).toBe('The membrane controls entry.');
    expect(blocks[3]!.ref.headingPath).toEqual(['Cells', 'Membrane']);
  });
  it('keeps code fences intact', () => {
    const blocks = textToBlocks('Example:\n\n```js\nconst a = 1;\n\nconsole.log(a);\n```', 's', true);
    expect(blocks.at(-1)!.text).toContain('console.log(a);');
  });
  it('does not treat # as heading in plain text', () => {
    expect(textToBlocks('# not a heading', 's', false)[0]!.kind).toBe('text');
  });
  it('strips inline Markdown', () => {
    expect(stripMarkdownInline('See [the docs](http://x) and *this* and __that__')).toBe(
      'See the docs and this and that',
    );
  });
});

describe('htmlToBlocks', () => {
  it('keeps headings and flattens lists and tables', () => {
    const blocks = htmlToBlocks(
      '<h1>Finance</h1><p>Money basics.</p><ul><li>Save</li><li>Spend</li></ul><h2>Budget</h2><table><tr><td>A</td><td>B</td></tr></table>',
      'd1',
    );
    expect(blocks[0]).toMatchObject({ kind: 'heading', text: 'Finance', level: 1 });
    expect(blocks[1]!.text).toBe('Money basics.\n• Save\n• Spend');
    expect(blocks.at(-1)!.text).toBe('A | B');
    expect(blocks.at(-1)!.ref.headingPath).toEqual(['Finance', 'Budget']);
  });
});

const slide = (title: string, body: string) => `<?xml version="1.0"?><p:sld><p:cSld><p:spTree>
<p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>${title}</a:t></a:r></a:p></p:txBody></p:sp>
<p:sp><p:txBody><a:p><a:r><a:t>${body}</a:t></a:r><a:br/><a:r><a:t>line two</a:t></a:r></a:p></p:txBody></p:sp>
</p:spTree></p:cSld></p:sld>`;

describe('pptx', () => {
  it('decodes XML entities', () =>
    expect(decodeXml('a &amp; b &lt;c&gt; &#233; &#x41;')).toBe('a & b <c> é A'));

  it('parses slide title, body and notes', () => {
    expect(parseSlide(slide('Orbits', 'Planets move'))).toEqual({
      title: 'Orbits',
      body: ['Planets move\nline two'],
    });
    const notes = `<p:notes><p:sp><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:sp><p:sp><p:txBody><a:p><a:r><a:t>Speaker note</a:t></a:r></a:p></p:txBody></p:sp></p:notes>`;
    expect(parseNotes(notes)).toEqual(['Speaker note']);
  });

  it('extracts slides in presentation order with notes', async () => {
    const zip = new JSZip();
    zip.file('ppt/slides/slide1.xml', slide('First', 'one'));
    zip.file('ppt/slides/slide2.xml', slide('Second', 'two'));
    zip.file(
      'ppt/slides/_rels/slide1.xml.rels',
      '<Relationships><Relationship Id="rId2" Target="../notesSlides/notesSlide1.xml"/></Relationships>',
    );
    zip.file(
      'ppt/notesSlides/notesSlide1.xml',
      '<p:notes><p:sp><p:txBody><a:p><a:r><a:t>Remember this</a:t></a:r></a:p></p:txBody></p:sp></p:notes>',
    );
    zip.file(
      'ppt/presentation.xml',
      '<p:presentation><p:sldIdLst><p:sldId id="1" r:id="rId8"/><p:sldId id="2" r:id="rId7"/></p:sldIdLst></p:presentation>',
    );
    zip.file(
      'ppt/_rels/presentation.xml.rels',
      '<Relationships><Relationship Id="rId7" Target="slides/slide1.xml"/><Relationship Id="rId8" Target="slides/slide2.xml"/></Relationships>',
    );
    const data = await zip.generateAsync({ type: 'arraybuffer' });
    const { blocks, slides } = await extractPptx(data, 'p1');
    expect(slides).toBe(2);
    expect(blocks[0]).toMatchObject({ kind: 'heading', text: 'Second', ref: { slide: 1 } });
    expect(blocks.find((b) => b.text === 'Remember this')!.ref.slide).toBe(2);
  });

  it('rejects a file that is not a zip', async () => {
    await expect(extractPptx(new TextEncoder().encode('nope').buffer, 'x')).rejects.toMatchObject({
      code: 'CORRUPT',
    });
  });
});

describe('pdf text layout', () => {
  it('groups items into lines and detects headings by size', () => {
    const lines = linesFromItems([
      { str: 'Chapter 1', x: 0, y: 700, size: 24, eol: true },
      { str: 'The sun is ', x: 0, y: 650, size: 11, eol: false },
      { str: 'a star.', x: 50, y: 650.5, size: 11, eol: true },
      { str: 'It is hot and very bright indeed.', x: 0, y: 636, size: 11, eol: true },
    ]);
    expect(lines.map((l) => l.text)).toEqual([
      'Chapter 1',
      'The sun is a star.',
      'It is hot and very bright indeed.',
    ]);
    const body = bodySize(lines);
    expect(body).toBe(11);
    const blocks = pageBlocks(lines, body, 'f', 3);
    expect(blocks[0]).toMatchObject({ kind: 'heading', level: 1, text: 'Chapter 1' });
    expect(blocks[1]).toMatchObject({ kind: 'text', ref: { page: 3 } });
  });
});

describe('helpers', () => {
  it('fits images within the long edge', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
  it('detects file kinds', () => {
    expect(kindOf({ name: 'a.PDF', type: '' })).toBe('pdf');
    expect(kindOf({ name: 'deck.pptx', type: '' })).toBe('pptx');
    expect(kindOf({ name: 'n.md', type: '' })).toBe('markdown');
    expect(kindOf({ name: 'photo', type: 'image/jpeg' })).toBe('photo');
    expect(kindOf({ name: 'x.exe', type: '' })).toBeNull();
  });
});
