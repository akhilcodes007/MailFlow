/**
 * src/config/database.js
 * Mongoose connection with reconnect logic and graceful shutdown.
 */
'use strict';

const mongoose = require('mongoose');

let connectionPromise = null;

async function connectDB() {
  // If already connected, return the existing connection
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  // If a connection attempt is already in flight, reuse that promise
  if (connectionPromise) {
    return connectionPromise;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    const err = new Error('MONGODB_URI is not defined');
    console.error('[DB] Connection error:', err.message);
    throw err;
  }

  const sanitized = sanitizeUri(uri);
  console.log(`[DB] Attempting connection to MongoDB Atlas: ${sanitized}`);

  connectionPromise = mongoose
    .connect(uri, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
    })
    .then((m) => {
      console.log(`[DB] Successfully connected to MongoDB Atlas: ${sanitized}`);
      return m.connection;
    })
    .catch((err) => {
      connectionPromise = null;
      console.error(`[DB] Connection failed to ${sanitized}:`, err.message);
      throw err;
    });

  return connectionPromise;
}

// Register connection lifecycle listeners once at module level
mongoose.connection.on('disconnected', () => {
  connectionPromise = null;
  console.warn('[DB] MongoDB disconnected');
});

mongoose.connection.on('reconnected', () => {
  console.log('[DB] MongoDB reconnected');
});

mongoose.connection.on('error', (err) => {
  console.error('[DB] MongoDB connection error:', err.message);
});

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

/** Strips credentials and query strings from a MongoDB URI for safe logging. */
function sanitizeUri(uri) {
  if (!uri || typeof uri !== 'string') return '<empty URI>';
  try {
    const url = new URL(uri);
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    // Fallback for replica-set URIs or strings with unencoded characters in credentials
    return uri
      .replace(/\/\/[^@]+@/, '//***:***@')
      .replace(/\?.*$/, '');
  }
}

module.exports = { connectDB, getConnectionStatus, sanitizeUri };
