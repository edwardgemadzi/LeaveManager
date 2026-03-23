async function run() {
  try {
    // Load local env for one-off maintenance runs.
    // If env is already provided by the shell/CI, this is harmless.
    const dotenv = await import('dotenv');
    dotenv.config({ path: '.env.local' });
  } catch {
    // dotenv is optional at runtime; shell-provided env still works.
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is required');
    process.exit(1);
  }

  const { MongoClient } = await import('mongodb');
  const client = new MongoClient(uri);
  const parsedUri = new URL(uri);
  const dbNameFromUri = parsedUri.pathname.replace(/^\//, '').split('?')[0];
  const dbName = dbNameFromUri || process.env.MONGODB_DB_NAME || 'leave-manager';

  try {
    await client.connect();
    const db = client.db(dbName);
    console.log(`Using database: ${dbName}`);

    const operations = [
      { collection: 'users', field: 'teamId' },
      { collection: 'leaveRequests', field: 'userId' },
      { collection: 'leaveRequests', field: 'teamId' },
      { collection: 'teams', field: 'leaderId' },
      { collection: 'auditLogs', field: 'userId' },
      { collection: 'auditLogs', field: 'teamId' },
    ];

    for (const { collection, field } of operations) {
      const result = await db.collection(collection).updateMany(
        { [field]: { $type: 'objectId' } },
        [{ $set: { [field]: { $toString: `$${field}` } } }]
      );

      console.log(
        `[${collection}.${field}] matched=${result.matchedCount} modified=${result.modifiedCount}`
      );
    }

    console.log('Backfill complete.');
  } catch (error) {
    console.error('Backfill failed:', error);
    process.exitCode = 1;
  } finally {
    await client.close();
  }
}

run();
