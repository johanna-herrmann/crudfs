import { v4 } from 'uuid';
import { loadDb, closeDb } from '@/database/db';
import { versions, current } from './passwordHashing/versions';
import Database from '@/types/Database';
import { extractUsername, issueToken, verifyToken } from './jwt';
import { countAttempt, handleLocking, resetAttempts } from './locking';
import User from '@/types/User';

const invalidCredentials = 'INVALID_CREDENTIALS';
const lockedExceeded = 'ATTEMPTS_EXCEEDED';

const updateHash = async function (db: Database, username: string, password: string): Promise<void> {
  const hashVersion = current.version;
  const [salt, hash] = await current.hashPassword(password);
  await db.updateHash(username, hashVersion, salt, hash);
};

const authenticate = async function (db: Database, username: string, password: string): Promise<boolean> {
  const user = await db.getUser(username);
  if (!user) {
    await countAttempt(db, username);
    return false;
  }
  const { hashVersion, salt, hash } = user;
  const hashing = versions[hashVersion];
  const valid = await hashing.checkPassword(password, salt, hash);
  if (!valid) {
    await countAttempt(db, username);
    return false;
  }
  if (hashing.version !== current.version) {
    await updateHash(db, username, password);
  }
  await resetAttempts(db, username);
  return true;
};

const authorize = async function (db: Database, jwt: string | null): Promise<User | null> {
  const valid = verifyToken(jwt);
  if (!valid) {
    return null;
  }
  const username = extractUsername(jwt as string);
  return await db.getUser(username);
};

const register = async function (username: string, password: string, admin: boolean, meta: Record<string, unknown>): Promise<boolean> {
  try {
    const db = await loadDb();
    const exists = await db.userExists(username);
    if (exists) {
      return false;
    }
    const ownerId = v4();
    const hashVersion = current.version;
    const [salt, hash] = await current.hashPassword(password);
    const user = { username, hashVersion, salt, hash, ownerId, admin: admin, meta };
    await db.addUser(user);
  } finally {
    await closeDb();
  }
  return true;
};

const login = async function (username: string, password: string): Promise<string> {
  try {
    const db = await loadDb();
    const locked = await handleLocking(db, username);
    if (locked) {
      return lockedExceeded;
    }
    const authenticated = await authenticate(db, username, password);
    return authenticated ? issueToken(username) : invalidCredentials;
  } finally {
    await closeDb();
  }
};

const getLoggedInUser = async function (jwt: string | null): Promise<User | null> {
  try {
    const db = await loadDb();
    return await authorize(db, jwt);
  } finally {
    await closeDb();
  }
};

export { register, login, getLoggedInUser, invalidCredentials, lockedExceeded };
