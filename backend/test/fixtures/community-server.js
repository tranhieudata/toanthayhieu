// Separate backend process used to verify shared realtime delivery, never the application DB.
const mongoose = require('mongoose');
const express = require('express');
async function start() {
  const database = process.env.COMMUNITY_TEST_DB;
  if (!/^community_test_\d+_\d+$/.test(database || '')) throw new Error('An isolated test database is required');
  await mongoose.connect(`mongodb://127.0.0.1:27017/${database}`, { serverSelectionTimeoutMS: 3000 });
  const app = express(); app.use(express.json());
  app.use('/api/community', require('../../src/routes/community'));
  const server = app.listen(0, '127.0.0.1', () => process.send({ port: server.address().port }));
  process.on('message', async message => {
    if (message === 'shutdown') {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
      await mongoose.disconnect(); process.exit(0);
    }
  });
}
start().catch(err => { console.error(err); process.exit(1); });
