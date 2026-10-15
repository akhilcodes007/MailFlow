/**
 * src/scripts/backup.js
 * Creates a JSON snapshot of the existing database collections:
 * users, campaigns, suppressions, webhookevents.
 * Run with: node src/scripts/backup.js
 */
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { connectDB } = require('../config/database');

async function runBackup() {
  console.log('[BACKUP] Connecting to database...');
  await connectDB();

  const db = mongoose.connection.db;
  const collections = ['users', 'campaigns', 'suppressions', 'webhookevents'];
  const snapshot = {
    timestamp: new Date().toISOString(),
    collections: {},
  };

  for (const colName of collections) {
    try {
      const docs = await db.collection(colName).find({}).toArray();
      snapshot.collections[colName] = docs;
      console.log(`[BACKUP] Captured ${docs.length} records from '${colName}'`);
    } catch (err) {
      console.warn(`[BACKUP] Warning reading collection '${colName}':`, err.message);
      snapshot.collections[colName] = [];
    }
  }

  const backupDir = path.join(__dirname, '../../backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const filename = `backup-${Date.now()}.json`;
  const backupPath = path.join(backupDir, filename);
  fs.writeFileSync(backupPath, JSON.stringify(snapshot, null, 2), 'utf8');

  console.log(`[BACKUP] ✅ Backup saved successfully to: ${backupPath}`);
  await mongoose.disconnect();
}

runBackup().catch((err) => {
  console.error('[BACKUP] ❌ Backup failed:', err.message);
  process.exit(1);
});
