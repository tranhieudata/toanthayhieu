const fs = require('fs/promises');
const path = require('path');
const { Post, Comment, Reaction, Notification } = require('../models/Community');
const { localDay } = require('../utils/communityRules');

const imageDir = path.resolve(__dirname, '../../community-uploads');

async function deleteStory(story) {
  if (story.kind !== 'story') throw new Error('Only stories can be deleted by this service');
  if (story.image) {
    await fs.unlink(path.join(imageDir, path.basename(story.image))).catch(error => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
  await Promise.all([
    Comment.deleteMany({ post: story._id }),
    Reaction.deleteMany({ post: story._id }),
    Notification.deleteMany({ post: story._id }),
  ]);
  await Post.deleteOne({ _id: story._id, kind: 'story' });
}

// Delete files before records so failed disk operations can be retried next run.
async function cleanupExpiredStories(now = new Date()) {
  const stories = Post.find({ kind: 'story', expiresAt: { $lte: now } }).select('_id image kind').lean().cursor();
  for await (const story of stories) {
    try {
      await deleteStory(story);
    } catch (error) {
      console.error(`Could not clean up expired story ${story._id}:`, error.message);
    }
  }
}

function untilNextCleanup(now = new Date()) {
  const midnight = new Date(`${localDay(now)}T00:00:00+07:00`);
  return midnight.getTime() + 86400000 - now.getTime();
}

function startStoryCleanup() {
  let timer, stopped = false;
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try { await cleanupExpiredStories(); }
    catch (error) { console.error('Story cleanup failed:', error.message); }
    finally { running = false; }
  };
  const schedule = () => {
    if (stopped) return;
    timer = setTimeout(async () => {
      await run();
      schedule();
    }, untilNextCleanup());
    timer.unref();
  };
  // Catch up after downtime, then run at midnight in Vietnam regardless of VPS timezone.
  run().finally(schedule);
  return () => { stopped = true; clearTimeout(timer); };
}

module.exports = { cleanupExpiredStories, startStoryCleanup, untilNextCleanup, deleteStory };
