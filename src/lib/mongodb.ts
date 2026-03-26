import { MongoClient, Db } from 'mongodb';
import { initializeDatabaseIndexes } from '@/lib/initDatabase';

if (!process.env.MONGODB_URI) {
  throw new Error('Please add your MongoDB URI to .env.local');
}

const uri = process.env.MONGODB_URI;
const options = {};

let client: MongoClient;
let clientPromise: Promise<MongoClient>;
let indexesInitPromise: Promise<void> | null = null;

if (process.env.NODE_ENV === 'development') {
  // In development mode, use a global variable so that the value
  // is preserved across module reloads caused by HMR (Hot Module Replacement).
  const globalWithMongo = global as typeof globalThis & {
    _mongoClientPromise?: Promise<MongoClient>;
  };

  if (!globalWithMongo._mongoClientPromise) {
    client = new MongoClient(uri, options);
    globalWithMongo._mongoClientPromise = client.connect();
  }
  clientPromise = globalWithMongo._mongoClientPromise;
} else {
  // In production mode, it's best to not use a global variable.
  client = new MongoClient(uri, options);
  clientPromise = client.connect();
}

export default clientPromise;

export const getDatabaseRaw = async (): Promise<Db> => {
  const client = await clientPromise;
  return client.db('leave-manager');
};

const ensureIndexesInitialized = async (): Promise<void> => {
  // Dev performance: skip automatic index initialization unless explicitly forced.
  // Index creation is still enabled in production.
  const forceDevIndexInit = process.env.FORCE_DEV_INDEX_INIT === 'true';
  if (process.env.NODE_ENV === 'development' && !forceDevIndexInit) {
    return;
  }

  if (!indexesInitPromise) {
    indexesInitPromise = initializeDatabaseIndexes().catch((error) => {
      // Keep startup resilient if index creation fails unexpectedly.
      console.error('Failed to initialize database indexes:', error);
    });
  }

  await indexesInitPromise;
};

export const getDatabase = async (): Promise<Db> => {
  await ensureIndexesInitialized();
  return getDatabaseRaw();
};

export const getClient = async (): Promise<MongoClient> => {
  await ensureIndexesInitialized();
  return await clientPromise;
};
