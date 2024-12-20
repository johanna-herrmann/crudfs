const testUser = {
  username: 'testUser',
  hashVersion: 'v1',
  salt: 'testSalt',
  hash: 'testHash',
  admin: false,
  ownerId: 'testOwnerId',
  meta: { testProp: 'testValue' }
};

const testFile = {
  path: 'test/path',
  owner: 'testOwner',
  realName: 'testRealName',
  meta: { testProp: 'testValue' }
};

export { testUser, testFile };
