// Accented letters keep their base letter ("Café" becomes "cafe"); every other
// run of non-alphanumerics collapses to a single dash.
const slugify = (title) =>
  title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

module.exports = { slugify };
