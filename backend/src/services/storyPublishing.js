const { Post } = require('../models/Community');

async function publishLegacyStories() {
  return Post.updateMany({ kind: 'story', status: 'pending', expiresAt: { $gt: new Date() } }, { $set: { status: 'approved' } });
}

// Migrate once per backend process before handling community requests.
// Retry after a database error rather than keeping a rejected promise forever.
let migration;
function ensureStoryPublishing() {
  if (!migration) migration = publishLegacyStories().catch(error => { migration = null; throw error; });
  return migration;
}

module.exports = { publishLegacyStories, ensureStoryPublishing };
