// Accented letters keep their base letter ("Café" becomes "cafe"); every other
// run of non-alphanumerics collapses to a single dash.
const slugify = (title) =>
  title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const validateImages = (images, position, ownedImageIds) => {
  if (!Array.isArray(images)) return `${position} images must be a list`;

  for (const [index, image] of images.entries()) {
    const imagePosition = `${position} image ${index + 1}`;
    if (image === null || typeof image !== 'object' || Array.isArray(image)) {
      return `${imagePosition} must be an object`;
    }
    if (!ownedImageIds.has(String(image.imageId))) {
      return `${imagePosition} is not an image uploaded to this post`;
    }
    if (typeof image.caption !== 'string') return `${imagePosition} caption must be text`;
  }
  return null;
};

const validateBlocks = (blocks, ownedImageIds) => {
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

    if (block.type === 'text') {
      if (typeof block.body !== 'string') return `${position} text must be a string`;
    } else if (block.type === 'images') {
      const imagesError = validateImages(block.images, position, ownedImageIds);
      if (imagesError) return imagesError;
    } else {
      return `${position} has an unknown type`;
    }
  }
  return null;
};

// Only what the post needs is stored; image URLs are looked up on read.
const toStoredBlocks = (blocks) =>
  blocks.map((block) => {
    if (block.type !== 'images') return { id: block.id, type: 'text', body: block.body };
    const images = block.images.map((image) => ({
      imageId: String(image.imageId),
      caption: image.caption,
    }));
    return { id: block.id, type: 'images', images };
  });

module.exports = { slugify, validateBlocks, toStoredBlocks };
