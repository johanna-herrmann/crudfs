import Storage from '@/types/Storage';
import fs from 'fs/promises';
import { exists } from './localStorageHelper';

class LocalStorage implements Storage {
  private readonly directory: string;

  public constructor(directory: string) {
    this.directory = `/${directory.replace(/(^\/+|\/+$)/gu, '')}`;
  }

  private resolvePath(name: string): string {
    return `${this.directory}/${name.replace('/', '')}`;
  }

  public getDirectory(): string {
    return this.directory;
  }

  public async writeFile(name: string, data: string | Buffer, encoding?: BufferEncoding): Promise<void> {
    await fs.writeFile(this.resolvePath(name), data, encoding);
  }

  public async readFile(name: string, encoding?: BufferEncoding): Promise<Buffer | string> {
    return await fs.readFile(this.resolvePath(name), encoding);
  }

  public async unlink(name: string): Promise<void> {
    await fs.unlink(this.resolvePath(name));
  }

  public async list(prefix: string): Promise<string[]> {
    const items = await fs.readdir(this.directory);
    return items.filter((item) => item.startsWith(prefix));
  }

  public async exists(name: string): Promise<boolean> {
    return await exists(this.resolvePath(name));
  }
}

export { LocalStorage, exists };
