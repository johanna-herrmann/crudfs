import Database from '@/types/Database';
import PgDbConf from '@/types/PgDbConf';
import FailedLoginAttempts from '@/types/FailedLoginAttempts';
import User from '@/types/User';
import { Client } from 'pg';
import { getNewClient, connect, end, definingQuery, writingQuery, readingQuery } from './pgWrapper';

const createTableIfNotExists = async function (client: Client, table: string, ...fields: string[]): Promise<void> {
  await definingQuery(client, `CREATE TABLE IF NOT EXISTS ${table}(${fields.join(', ')})`);
};

const createUserTableIfNotExists = async function (client: Client) {
  createTableIfNotExists(
    client,
    'user_',
    'username text',
    'hashVersion text',
    'salt text',
    'hash text',
    'admin Boolean',
    'sectionId text',
    'meta JSON'
  );
};

const createJwtKeyTableIfNotExists = async function (client: Client) {
  createTableIfNotExists(client, 'jwtKey', 'key text');
};

const createFailedLoginAttemptsTableIfNotExists = async function (client: Client) {
  createTableIfNotExists(client, 'FailedLoginAttempts', 'username text', 'attempts int');
};

class PostgresDatabase implements Database {
  private readonly conf: PgDbConf;
  private client: Client | null = null;

  constructor(conf: PgDbConf) {
    this.conf = conf;
  }

  public getConf(): PgDbConf {
    return this.conf;
  }

  public async open(): Promise<void> {
    this.client = getNewClient(this.conf);
    await connect(this.client);
    await createUserTableIfNotExists(this.client);
    await createJwtKeyTableIfNotExists(this.client);
    await createFailedLoginAttemptsTableIfNotExists(this.client);
  }

  public async close(): Promise<void> {
    await end(this.client);
  }

  public async addUser({ username, hashVersion, salt, hash, admin, sectionId, meta }: User): Promise<void> {
    const query = 'INSERT INTO user_(username, hashVersion, salt, hash, admin, sectionId, meta) VALUES($1, $2, $3, $4, $5, $6, $7)';
    const values = [username, hashVersion, salt, hash, admin, sectionId, JSON.stringify(meta)];
    await writingQuery(this.client, query, values);
  }

  public async changeUsername(oldUsername: string, newUsername: string): Promise<void> {
    const query = 'UPDATE user_ SET username=$1 WHERE username=$2';
    const values = [newUsername, oldUsername];
    await writingQuery(this.client, query, values);
  }

  public async updateHash(username: string, hashVersion: string, salt: string, hash: string): Promise<void> {
    const query = 'UPDATE user_ SET hashVersion=$1, salt=$2, hash=$3 WHERE username=$4';
    const values = [hashVersion, salt, hash, username];
    await writingQuery(this.client, query, values);
  }

  public async makeUserAdmin(username: string): Promise<void> {
    const query = 'UPDATE user_ SET admin=$1 WHERE username=$2';
    const values = [true, username];
    await writingQuery(this.client, query, values);
  }

  public async makeUserNormalUser(username: string): Promise<void> {
    const query = 'UPDATE user_ SET admin=$1 WHERE username=$2';
    const values = [false, username];
    await writingQuery(this.client, query, values);
  }

  public async modifyMeta(username: string, meta?: Record<string, unknown>): Promise<void> {
    const query = 'UPDATE user_ SET meta=$1 WHERE username=$2';
    const values = [meta ? JSON.stringify(meta) : '{}', username];
    await writingQuery(this.client, query, values);
  }

  public async removeUser(username: string): Promise<void> {
    const query = 'DELETE FROM user_ WHERE username=$1';
    const values = [username];
    await writingQuery(this.client, query, values);
  }

  public async getUser(username: string): Promise<User | null> {
    const query = 'SELECT * FROM user_ WHERE username=$1';
    const values = [username];
    const result = await readingQuery<User>(this.client, query, values);
    if (!result || result.rowCount !== 1) {
      return null;
    }
    return result.rows[0];
  }

  public async addJwtKeys(...keys: string[]): Promise<void> {
    for (const key of keys) {
      const query = 'INSERT INTO jwtKey(key) VALUES($1)';
      const values = [key];
      await writingQuery(this.client, query, values);
    }
  }

  public async getJwtKeys(): Promise<string[]> {
    const query = 'SELECT * FROM jwtKey';
    const result = await readingQuery<{ key: string }>(this.client, query);
    return result ? result.rows.map((row) => row.key) : [];
  }

  public async countLoginAttempt(username: string): Promise<void> {
    const attempts = await this.getLoginAttempts(username);
    if (attempts === 0) {
      await writingQuery(this.client, 'INSERT INTO failedLoginAttempts(username, attempts) VALUES($1, $2)', [username, 1]);
      return;
    }
    await writingQuery(this.client, 'UPDATE failedLoginAttempts SET attempts=$1 WHERE username=$2', [attempts + 1, username]);
  }

  public async getLoginAttempts(username: string): Promise<number> {
    const query = 'SELECT * FROM failedLoginAttempts WHERE username=$1';
    const values = [username];
    const result = await readingQuery<FailedLoginAttempts>(this.client, query, values);
    const attempts = result?.rows[0];
    return attempts ? attempts.attempts : 0;
  }

  public async removeLoginAttempts(username: string): Promise<void> {
    const query = 'DELETE FROM failedLoginAttempts WHERE username=$1';
    const values = [username];
    await writingQuery(this.client, query, values);
  }
}

export { PostgresDatabase };
