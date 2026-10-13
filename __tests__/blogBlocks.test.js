const { slugify, validateBlocks, excerptFromBlocks } = require('../lib/utils/blogBlocks');

describe('slugify', () => {
  it('lowercases and joins words with single dashes', () => {
    expect(slugify('Sunrise on the Ridge')).toBe('sunrise-on-the-ridge');
  });

  it('collapses punctuation and repeated spaces into one dash', () => {
    expect(slugify("M31: Andromeda's   Core, Take 2")).toBe('m31-andromeda-s-core-take-2');
  });

  it('keeps the base letter of accented characters', () => {
    expect(slugify('Café Crème at Mt. Rainier')).toBe('cafe-creme-at-mt-rainier');
  });

  it('trims leading and trailing dashes', () => {
    expect(slugify('  --Hello, world!--  ')).toBe('hello-world');
  });

  it('returns an empty string when nothing alphanumeric remains', () => {
    expect(slugify('!!! 🌌 ???')).toBe('');
  });
});

describe('validateBlocks', () => {
  it('accepts an empty list', () => {
    expect(validateBlocks([])).toBeNull();
  });

  it('accepts text blocks, including an empty body', () => {
    expect(
      validateBlocks([
        { id: 'block-a', type: 'text', body: 'Trailhead at dawn.' },
        { id: 'block-b', type: 'text', body: '' },
      ]),
    ).toBeNull();
  });

  it('rejects anything that is not a list', () => {
    expect(validateBlocks(undefined)).toBe('Blocks must be a list');
    expect(validateBlocks({ id: 'block-a', type: 'text', body: '' })).toBe('Blocks must be a list');
  });

  it('rejects a block that is not an object, naming its position', () => {
    expect(validateBlocks([{ id: 'block-a', type: 'text', body: '' }, 'loose text'])).toBe(
      'Block 2 must be an object',
    );
    expect(validateBlocks([null])).toBe('Block 1 must be an object');
  });

  it('rejects a missing or empty id', () => {
    expect(validateBlocks([{ type: 'text', body: '' }])).toBe('Block 1 needs an id');
    expect(validateBlocks([{ id: '', type: 'text', body: '' }])).toBe('Block 1 needs an id');
  });

  it('rejects a repeated id', () => {
    expect(
      validateBlocks([
        { id: 'block-a', type: 'text', body: 'one' },
        { id: 'block-a', type: 'text', body: 'two' },
      ]),
    ).toBe('Block 2 repeats the id of an earlier block');
  });

  it('rejects a missing or unknown type, including images until image upload exists', () => {
    expect(validateBlocks([{ id: 'block-a', body: '' }])).toBe('Block 1 has an unknown type');
    expect(validateBlocks([{ id: 'block-a', type: 'images', images: [] }])).toBe(
      'Block 1 has an unknown type',
    );
  });

  it('rejects a text body that is not a string', () => {
    expect(validateBlocks([{ id: 'block-a', type: 'text', body: 42 }])).toBe(
      'Block 1 text must be a string',
    );
    expect(validateBlocks([{ id: 'block-a', type: 'text' }])).toBe('Block 1 text must be a string');
  });
});

describe('excerptFromBlocks', () => {
  const textBlock = (body) => ({ id: 'block', type: 'text', body });

  it('is empty when there is no text', () => {
    expect(excerptFromBlocks([])).toBe('');
    expect(excerptFromBlocks([textBlock('   ')])).toBe('');
  });

  it('uses the first text block that has content', () => {
    expect(
      excerptFromBlocks([textBlock(''), textBlock('Second block.'), textBlock('Third.')]),
    ).toBe('Second block.');
  });

  it('strips Markdown to plain text, keeping link text and snake_case', () => {
    const body = [
      '## Day one',
      '',
      'We hit the **ridge** at [sunrise](https://example.com). Checked `published_at`.',
      '',
      '```js',
      'const hidden = true;',
      '```',
      '- tent',
      '> a quote',
    ].join('\n');

    expect(excerptFromBlocks([textBlock(body)])).toBe(
      'Day one We hit the ridge at sunrise. Checked published_at. tent a quote',
    );
  });

  it('cuts long text at a word boundary and marks the cut', () => {
    const excerpt = excerptFromBlocks([textBlock('glass '.repeat(60))]);

    expect(excerpt.length).toBeLessThanOrEqual(201);
    expect(excerpt.endsWith('glass…')).toBe(true);
  });
});
