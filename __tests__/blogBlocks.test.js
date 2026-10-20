const { slugify, validateBlocks, toStoredBlocks } = require('../lib/utils/blogBlocks');

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

  it('rejects a missing or unknown type', () => {
    expect(validateBlocks([{ id: 'block-a', body: '' }])).toBe('Block 1 has an unknown type');
    expect(validateBlocks([{ id: 'block-a', type: 'video', url: 'x' }])).toBe(
      'Block 1 has an unknown type',
    );
  });

  it('accepts an images block whose images belong to the post, and an empty one', () => {
    const ownedImageIds = new Set(['12', '13']);

    expect(
      validateBlocks(
        [
          {
            id: 'block-a',
            type: 'images',
            images: [
              { imageId: '12', caption: 'Ridge' },
              { imageId: 13, caption: '' },
            ],
          },
          { id: 'block-b', type: 'images', images: [] },
        ],
        ownedImageIds,
      ),
    ).toBeNull();
  });

  it('rejects an image that does not belong to the post', () => {
    expect(
      validateBlocks(
        [{ id: 'block-a', type: 'images', images: [{ imageId: '99', caption: '' }] }],
        new Set(['12']),
      ),
    ).toBe('Block 1 image 1 is not an image uploaded to this post');
  });

  it('rejects images that are not a list, and a caption that is not text', () => {
    const ownedImageIds = new Set(['12']);

    expect(validateBlocks([{ id: 'block-a', type: 'images' }], ownedImageIds)).toBe(
      'Block 1 images must be a list',
    );
    expect(
      validateBlocks(
        [{ id: 'block-a', type: 'images', images: [{ imageId: '12', caption: null }] }],
        ownedImageIds,
      ),
    ).toBe('Block 1 image 1 caption must be text');
  });

  it('rejects a text body that is not a string', () => {
    expect(validateBlocks([{ id: 'block-a', type: 'text', body: 42 }])).toBe(
      'Block 1 text must be a string',
    );
    expect(validateBlocks([{ id: 'block-a', type: 'text' }])).toBe('Block 1 text must be a string');
  });
});

describe('toStoredBlocks', () => {
  it('keeps only the stored fields, dropping image URLs and anything extra', () => {
    expect(
      toStoredBlocks([
        { id: 'block-a', type: 'text', body: 'Trailhead.', extra: true },
        {
          id: 'block-b',
          type: 'images',
          images: [{ imageId: 12, caption: 'Ridge', imageUrl: 'https://cdn.example.com/a.jpg' }],
        },
      ]),
    ).toEqual([
      { id: 'block-a', type: 'text', body: 'Trailhead.' },
      { id: 'block-b', type: 'images', images: [{ imageId: '12', caption: 'Ridge' }] },
    ]);
  });
});
