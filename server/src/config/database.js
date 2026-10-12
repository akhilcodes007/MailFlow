/**
 * src/config/database.js
 * Mongoose connection with reconnect logic and graceful shutdown.
 */
'use strict';

const mongoose = require('mongoose');

let isConnected = false;

async function connectDB() {
  if (isConnected) return;

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not defined');

  try {
    await mongoose.connect(uri, {
      // Mongoose 8 has sensible defaults; these are explicit for clarity
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });

    isConnected = true;
    console.log(`[DB] Connected to MongoDB Atlas: ${sanitizeUri(uri)}`);

    mongoose.connection.on('disconnected', () => {
      isConnected = false;
      console.warn('[DB] MongoDB disconnected');
    });

    mongoose.connection.on('reconnected', () => {
      isConnected = true;
      console.log('[DB] MongoDB reconnected');
    });
  } catch (err) {
    console.error('[DB] Connection failed:', err.message);
    throw err;
  }
}

/** Returns current connection state without exposing credentials. */
function getConnectionStatus() {
  const states = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
    99: 'uninitialized',
  };
  return {
    state: states[mongoose.connection.readyState] ?? 'unknown',
    readyState: mongoose.connection.readyState,
  };
}

/** Strips credentials from a MongoDB URI for safe logging. */
function sanitizeUri(uri) {
  try {
    const url = new URL(uri);
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    return '<invalid URI>';
  }
}

module.exports = { connectDB, getConnectionStatus };
