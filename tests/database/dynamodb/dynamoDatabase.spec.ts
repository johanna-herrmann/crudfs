import { DynamoDatabase } from '@/database/dynamodb/DynamoDatabase';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { NativeAttributeValue } from '@aws-sdk/lib-dynamodb';
import { testUser, testFile } from '#/testItems';
import DbItem from '@/types/DbItem';
import PathParts from '@/types/PathParts';

type Item = DbItem & Record<string, string>;
type Tables = Record<string, Item[]>;
interface Credentials {
  accessKeyId: string;
  secretAccessKey: string;
}

const mocked_db: Tables = {
  user: [],
  jwtKey: [],
  failedLoginAttempts: [],
  file: []
};
let mocked_lastIndex: string | undefined;
const all = 'all';
const id = 'test-id';
const mocked_id = id;
let mocked_index = 0;

jest.mock('uuid', () => {
  const actual = jest.requireActual('uuid');
  return {
    ...actual,
    v4() {
      return mocked_id + mocked_index++;
    }
  };
});

jest.mock('@/database/dynamodb/dynamoDbHelper', () => {
  const all = 'all';
  const id = 'test-id';

  // noinspection JSUnusedGlobalSymbols - used outside
  return {
    async putItem(_client: DynamoDBClient, TableName: string, item: DbItem & Partial<PathParts>, withId?: boolean) {
      const key = withId ? { all, id } : { all };
      const fullItem = { ...item, ...key };
      mocked_db[TableName].push(fullItem as Item);
    },
    async updateItem(_client: DynamoDBClient, TableName: string, keyName: string, keyValue: string, Update: Record<string, NativeAttributeValue>) {
      const itemIndex = mocked_db[TableName].findIndex((item) => item.all === 'all' && item[keyName] === keyValue);

      if (itemIndex >= 0) {
        const item = mocked_db[TableName][itemIndex];
        mocked_db[TableName][itemIndex] = { ...item, ...Update };
      }
    },
    async deleteItem(_client: DynamoDBClient, TableName: string, keyName: string, keyValue: string) {
      const itemIndex = mocked_db[TableName].findIndex((item) => item.all === 'all' && item[keyName] === keyValue);

      if (itemIndex >= 0) {
        mocked_db[TableName].splice(itemIndex, 1);
      }
    },
    async loadItem<T extends DbItem>(_client: DynamoDBClient, TableName: string, keyName: string, keyValue: string, IndexName?: string) {
      mocked_lastIndex = IndexName;
      const item = mocked_db[TableName].find((item) => item.all === 'all' && item[keyName] === keyValue);

      if (!item) {
        return null;
      }

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id, all, ...payload } = item;

      return payload as unknown as T;
    },
    async loadId(_client: DynamoDBClient, TableName: string, keyName: string, keyValue: string, IndexName?: string) {
      mocked_lastIndex = IndexName;
      const item = mocked_db[TableName].find((item) => item.all === 'all' && item[keyName] === keyValue);

      if (!item) {
        return null;
      }

      return item.id ?? null;
    },
    async loadUsers(_client: DynamoDBClient, TableName: string) {
      const users = mocked_db[TableName];
      return users.map(({ username, admin }) => ({ username, admin }));
    },
    async loadFiles(_client: DynamoDBClient, TableName: string, folder: string) {
      const files = mocked_db[TableName].filter((item) => item.all === 'all' && item.folder === folder);
      return files.map((file) => file.filename);
    },
    async loadJwtKeys(_client: DynamoDBClient, TableName: string) {
      const keys = mocked_db[TableName];
      return keys.map(({ id, key }) => ({ id, key }));
    },
    async itemExists(_client: DynamoDBClient, TableName: string, keyName: string, keyValue: string, IndexName?: string) {
      mocked_lastIndex = IndexName;
      const item = mocked_db[TableName].find((item) => item.all === 'all' && item[keyName] === keyValue);
      return !!item;
    }
  };
});

describe('DynamoDatabase', (): void => {
  const fakeDate = new Date('2017-01-01');
  const fakeTime = fakeDate.getTime();

  beforeEach(async (): Promise<void> => {
    jest.useFakeTimers();
    jest.setSystemTime(fakeDate);
    mocked_index = 0;
  });

  afterEach(async (): Promise<void> => {
    mocked_db.user = [];
    mocked_db.jwtKey = [];
    mocked_db.failedLoginAttempts = [];
    mocked_db.file = [];
    mocked_lastIndex = undefined;
    jest.useRealTimers();
  });

  const newDb = function (): DynamoDatabase {
    return new DynamoDatabase('de', 'keyId', 'secretKey', 'user', 'jwtKey', 'failedLoginAttempts', 'file');
  };

  const prepareDbForUser = async function (): Promise<DynamoDatabase> {
    const db = newDb();
    await db.open();
    mocked_db.user.push({ ...testUser, all, id } as unknown as Item);
    return db;
  };

  const prepareDbForFile = async function (): Promise<DynamoDatabase> {
    const db = newDb();
    await db.open();
    mocked_db.file.push({ ...testFile, all, id } as unknown as Item);
    return db;
  };

  test('DynamoDatabase->constructor sets conf and tables correctly.', async (): Promise<void> => {
    const db = newDb();

    expect(db.getConfig().region).toBe('de');
    expect((db.getConfig().credentials as Credentials)?.accessKeyId).toBe('keyId');
    expect((db.getConfig().credentials as Credentials)?.secretAccessKey).toBe('secretKey');
    expect(db.getTableNames()).toEqual(['user', 'jwtKey', 'failedLoginAttempts', 'file']);
  });

  test('DynamoDatabase->open creates client correctly.', async (): Promise<void> => {
    const db = newDb();

    await db.open();

    expect(db.getClient()).toBeInstanceOf(DynamoDBClient);
  });

  test('DynamoDatabase->addUser adds user.', async (): Promise<void> => {
    const db = newDb();
    await db.open();

    await db.addUser(testUser);

    expect(mocked_db.user[0]).toEqual({ ...testUser, all, id });
    expect(mocked_lastIndex).toBeUndefined();
  });

  test('DynamoDatabase->changeUsername changes username.', async (): Promise<void> => {
    const db = await prepareDbForUser();

    await db.changeUsername(testUser.username, 'newName');

    expect((mocked_db.user[0] as Item).username).toBe('newName');
    expect(mocked_lastIndex).toBe('username-index');
  });

  test('DynamoDatabase->updateHash updates hash properties username.', async (): Promise<void> => {
    const db = await prepareDbForUser();

    await db.updateHash(testUser.username, 'newVersion', 'newSalt', 'newHash');

    expect((mocked_db.user[0] as Item).hashVersion).toBe('newVersion');
    expect((mocked_db.user[0] as Item).salt).toBe('newSalt');
    expect((mocked_db.user[0] as Item).hash).toBe('newHash');
    expect(mocked_lastIndex).toBe('username-index');
  });

  test('DynamoDatabase->makeUserAdmin makes user to an admin.', async (): Promise<void> => {
    const db = await prepareDbForUser();

    await db.makeUserAdmin(testUser.username);

    expect((mocked_db.user[0] as Item).admin).toBe(true);
    expect(mocked_lastIndex).toBe('username-index');
  });

  test('DynamoDatabase->makeUserNormalUser makes user to a normal user.', async (): Promise<void> => {
    const db = await prepareDbForUser();

    await db.makeUserNormalUser(testUser.username);

    expect((mocked_db.user[0] as Item).admin).toBe(false);
    expect(mocked_lastIndex).toBe('username-index');
  });

  test('DynamoDatabase->modifyUserMeta updates user meta data.', async (): Promise<void> => {
    const db = await prepareDbForUser();

    await db.modifyUserMeta(testUser.username, { k: 'v' });

    expect((mocked_db.user[0] as Item).meta).toEqual({ k: 'v' });
    expect(mocked_lastIndex).toBe('username-index');
  });

  test('DynamoDatabase->removeUser removes user.', async (): Promise<void> => {
    const db = await prepareDbForUser();

    await db.removeUser(testUser.username);

    expect(mocked_db.user[0]).toBeUndefined();
    expect(mocked_lastIndex).toBe('username-index');
  });

  test('DynamoDatabase->getUser gets user.', async (): Promise<void> => {
    const db = await prepareDbForUser();

    const user = await db.getUser(testUser.username);

    expect(user).toEqual(testUser);
    expect(mocked_lastIndex).toBe('username-index');
  });

  test('DynamoDatabase->getUsers gets users.', async (): Promise<void> => {
    const db = await prepareDbForUser();
    //mocked_db.user.push({ ...testUser, all, id } as unknown as Item);
    mocked_db.user.push({ ...testUser, username: 'user2', admin: true, all, id } as unknown as Item);

    const userList = await db.getUsers();

    expect(userList[0]).toEqual({ username: testUser.username, admin: false });
    expect(userList[1]).toEqual({ username: 'user2', admin: true });
  });

  test('DynamoDatabase->userExists returns true if user exists.', async (): Promise<void> => {
    const db = await prepareDbForUser();

    const exists = await db.userExists(testUser.username);

    expect(exists).toBe(true);
    expect(mocked_lastIndex).toBe('username-index');
  });

  test('DynamoDatabase->userExists returns false if user does not exist.', async (): Promise<void> => {
    const db = await prepareDbForUser();

    const exists = await db.userExists('other');

    expect(exists).toBe(false);
    expect(mocked_lastIndex).toBe('username-index');
  });

  test('DynamoDatabase->addJwtKeys adds keys.', async (): Promise<void> => {
    const db = newDb();
    await db.open();

    await db.addJwtKeys('key1', 'key2', 'key3');

    expect(mocked_db.jwtKey).toEqual([
      { all, id: id + 0, key: 'key1' },
      { all, id: id + 1, key: 'key2' },
      { all, id: id + 2, key: 'key3' }
    ]);
    expect(mocked_lastIndex).toBeUndefined();
  });

  test('DynamoDatabase->getJwtKeys gets keys.', async (): Promise<void> => {
    const db = newDb();
    await db.open();
    mocked_db.jwtKey = [
      { all, id: '1', key: 'key1' },
      { all, id: '2', key: 'key2' },
      { all, id: '3', key: 'key3' }
    ];

    const keys = await db.getJwtKeys();

    expect(keys[0]).toEqual({ id: '1', key: 'key1' });
    expect(keys[1]).toEqual({ id: '2', key: 'key2' });
    expect(keys[2]).toEqual({ id: '3', key: 'key3' });
    expect(mocked_lastIndex).toBeUndefined();
  });

  test('DynamoDatabase->countLoginAttempt creates new item with attempts=1.', async (): Promise<void> => {
    const db = newDb();
    await db.open();

    await db.countLoginAttempt(testUser.username);

    expect(mocked_db.failedLoginAttempts[0]).toEqual({ all, username: testUser.username, attempts: 1, lastAttempt: fakeTime });
    expect(mocked_lastIndex).toBeUndefined();
  });

  test('DynamoDatabase->countLoginAttempt increasing attempts in existing item.', async (): Promise<void> => {
    const db = newDb();
    await db.open();
    mocked_db.failedLoginAttempts[0] = { all, username: testUser.username, attempts: 1 } as unknown as Item;

    await db.countLoginAttempt(testUser.username);

    expect(mocked_db.failedLoginAttempts[0]?.attempts).toBe(2);
    expect(mocked_db.failedLoginAttempts[0]?.lastAttempt).toBe(fakeTime);
    expect(mocked_lastIndex).toBeUndefined();
  });

  test('DynamoDatabase->updateLastLoginAttempt updates lastAttempt only.', async (): Promise<void> => {
    const db = newDb();
    await db.open();
    mocked_db.failedLoginAttempts[0] = { all, username: testUser.username, attempts: 1 } as unknown as Item;
    jest.setSystemTime(new Date(42));

    await db.updateLastLoginAttempt(testUser.username);

    expect(mocked_db.failedLoginAttempts[0]?.attempts).toBe(1);
    expect(mocked_db.failedLoginAttempts[0]?.lastAttempt).toBe(42);
    expect(mocked_lastIndex).toBeUndefined();
  });

  test('DynamoDatabase->getLoginAttempts returns attempts if item exists.', async (): Promise<void> => {
    const db = newDb();
    await db.open();
    mocked_db.failedLoginAttempts[0] = { all, username: testUser.username, attempts: 2, lastAttempt: 5 } as unknown as Item;

    const attempts = await db.getLoginAttempts(testUser.username);

    expect(attempts?.attempts).toBe(2);
    expect(attempts?.lastAttempt).toBe(5);
    expect(mocked_lastIndex).toBeUndefined();
  });

  test('DynamoDatabase->getLoginAttempts returns 0 if no item exists.', async (): Promise<void> => {
    const db = newDb();
    await db.open();

    const attempts = await db.getLoginAttempts(testUser.username);

    expect(attempts).toBeNull();
    expect(mocked_lastIndex).toBeUndefined();
  });

  test('DynamoDatabase->removeLoginAttempts removes attempts item.', async (): Promise<void> => {
    const db = newDb();
    await db.open();
    mocked_db.failedLoginAttempts[0] = { all, username: testUser.username, attempts: 1 } as unknown as Item;

    await db.removeLoginAttempts(testUser.username);

    expect(mocked_db.failedLoginAttempts[0]).toBeUndefined();
    expect(mocked_lastIndex).toBeUndefined();
  });

  test('DynamoDatabase->addFile adds file.', async (): Promise<void> => {
    const db = newDb();
    await db.open();

    await db.addFile(testFile);

    expect(mocked_db.file[0]).toEqual({ ...testFile, all, id, folder: 'test', filename: 'path' });
    expect(mocked_lastIndex).toBeUndefined();
  });

  test('DynamoDatabase->moveFile changes path, keeping owner.', async (): Promise<void> => {
    const db = await prepareDbForFile();

    await db.moveFile(testFile.path, 'new/Path');

    expect(mocked_db.file[0]?.path).toBe('new/Path');
    expect(mocked_db.file[0]?.owner).toBe(testFile.owner);
    expect(mocked_db.file[0]?.folder).toBe('new');
    expect(mocked_db.file[0]?.filename).toBe('Path');
    expect(mocked_lastIndex).toBe('path-index');
  });

  test('DynamoDatabase->moveFile changes path, also changing owner.', async (): Promise<void> => {
    const db = await prepareDbForFile();

    await db.moveFile(testFile.path, 'newPath', 'newOwner');

    expect(mocked_db.file[0]?.path).toBe('newPath');
    expect(mocked_db.file[0]?.owner).toBe('newOwner');
    expect(mocked_lastIndex).toBe('path-index');
  });

  test('DynamoDatabase->modifyFileMeta modifies file meta data.', async (): Promise<void> => {
    const db = await prepareDbForFile();

    await db.modifyFileMeta(testFile.path, { k: 'v' });

    expect(mocked_db.file[0]?.meta).toEqual({ k: 'v' });
    expect(mocked_lastIndex).toBe('path-index');
  });

  test('DynamoDatabase->removeFile removes file.', async (): Promise<void> => {
    const db = await prepareDbForFile();

    await db.removeFile(testFile.path);

    expect(mocked_db.file[0]).toBeUndefined();
    expect(mocked_lastIndex).toBe('path-index');
  });

  test('DynamoDatabase->getFile gets file.', async (): Promise<void> => {
    const db = await prepareDbForFile();

    const file = await db.getFile(testFile.path);

    expect(file).toEqual(testFile);
    expect(mocked_lastIndex).toBe('path-index');
  });

  test('DynamoDatabase->listFilesInFolder lists files.', async (): Promise<void> => {
    const db = newDb();
    await db.open();
    mocked_db.file.push({ ...testFile, all, id, path: 'test/path2', folder: 'test', filename: 'path2' } as unknown as Item);
    mocked_db.file.push({ ...testFile, all, id, folder: 'test', filename: 'path' } as unknown as Item);
    mocked_db.file.push({ ...testFile, all, id, path: 'other/path', folder: 'other', filename: 'path' } as unknown as Item);

    const files = await db.listFilesInFolder('test');

    expect(files).toEqual(['path', 'path2']);
  });

  test('DynamoDatabase->fileExists returns true if file exists.', async (): Promise<void> => {
    const db = await prepareDbForFile();

    const exist = await db.fileExists(testFile.path);

    expect(exist).toEqual(true);
    expect(mocked_lastIndex).toBe('path-index');
  });

  test('DynamoDatabase->fileExists returns false if file does not exist.', async (): Promise<void> => {
    const db = await prepareDbForFile();

    const exist = await db.fileExists('other');

    expect(exist).toEqual(false);
    expect(mocked_lastIndex).toBe('path-index');
  });

  test('DynamoDatabase->close destroys client correctly.', async (): Promise<void> => {
    const db = newDb();
    await db.open();

    await db.close();

    expect(db.getClient()).toBeNull();
  });
});
