// Accented letters keep their base letter ("Café" becomes "cafe"); every other
// run of non-alphanumerics collapses to a single dash.
const slugify = (title) =>
  title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const validateBlocks = (blocks) => {
  if (!Array.isArray(blocks)) return 'Blocks must be a list';

  const seenIds = new Set();
  for (const [index, block] of blocks.entries()) {
    const position = `Block ${index + 1}`;
    if (block === null || typeof block !== 'object' || Array.isArray(block)) {
      return `${position} must be an object`;
    }
    if (typeof block.id !== 'string' || !block.id) {
      return `${position} needs an id`;
    }
    if (seenIds.has(block.id)) return `${position} repeats the id of an earlier block`;
    seenIds.add(block.id);

    if (block.type !== 'text') return `${position} has an unknown type`;
    if (typeof block.body !== 'string') return `${position} text must be a string`;
  }
  return null;
};

const EXCERPT_LENGTH = 200;

const excerptFromBlocks = (blocks) => {
  const firstText = blocks.find((block) => block.type === 'text' && block.body.trim());
  if (!firstText) return '';

  const plainText = firstText.body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')
    .replace(/\*+|~~|`/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (plainText.length <= EXCERPT_LENGTH) return plainText;
  const cut = plainText.slice(0, EXCERPT_LENGTH);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
};

module.exports = { slugify, validateBlocks, excerptFromBlocks };
