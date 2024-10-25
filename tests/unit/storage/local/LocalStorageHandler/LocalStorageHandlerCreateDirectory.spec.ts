import { LocalStorageHandler } from '@/storage/local/LocalStorageHandler';
import { exists, isDirectory } from '@/storage/local/LocalStorageHandlerHelper';
import mockFS from 'mock-fs';
import { DirectoryDoesNotExistError } from '@/errors/DirectoryDoesNotExistError';
import { IsNotDirectoryError } from '@/errors/IsNotDirectoryError';

const handler = new LocalStorageHandler('/base');

describe('LocalStorageHandler->createDirectory', (): void => {
  afterEach(async (): Promise<void> => {
    mockFS.restore();
  });

  test('creates directory correctly (flat).', async (): Promise<void> => {
    mockFS({ '/base': {} });

    await handler.createDirectory('/test');

    expect(await exists('/base/test')).toBe(true);
    expect(await isDirectory('/base/test')).toBe(true);
  });

  test('creates directory correctly (recursive).', async (): Promise<void> => {
    mockFS({ '/base': {} });

    await handler.createDirectory('/test/sub', true);

    expect(await exists('/base/test/sub')).toBe(true);
    expect(await isDirectory('/base/test/sub')).toBe(true);
  });

  test('throws error if parent directory does not exist.', async (): Promise<void> => {
    mockFS({ '/base': {} });
    let error: Error | null = null;

    try {
      await handler.createDirectory('/test/sub');
    } catch (err: unknown) {
      error = err as Error;
    }

    expect(error).toBeInstanceOf(DirectoryDoesNotExistError);
    expect(error?.message).toBe('Directory /test does not exist.');
  });

  test('throws error if parent is not a directory.', async (): Promise<void> => {
    mockFS({ '/base/test': '' });
    let error: Error | null = null;

    try {
      await handler.createDirectory('/test/sub');
    } catch (err: unknown) {
      error = err as Error;
    }

    expect(error).toBeInstanceOf(IsNotDirectoryError);
    expect(error?.message).toBe('/test is not a directory.');
  });
});