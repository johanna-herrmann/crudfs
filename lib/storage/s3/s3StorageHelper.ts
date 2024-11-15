import {
  S3Client,
  GetObjectCommand,
  GetObjectCommandInput,
  GetObjectCommandOutput,
  GetObjectAttributesCommand,
  GetObjectAttributesCommandInput,
  PutObjectCommandInput,
  PutObjectCommand,
  DeleteObjectCommand,
  DeleteObjectCommandInput,
  ListObjectsCommand,
  ListObjectsCommandInput
} from '@aws-sdk/client-s3';

const trim = function (path: string): string {
  return path.replace(/(^\/+|\/+$)/gu, '').trim();
};

const getObject = async function (client: S3Client, Bucket: string, Key: string): Promise<GetObjectCommandOutput> {
  const commandInput: GetObjectCommandInput = {
    Bucket,
    Key
  };
  const command = new GetObjectCommand(commandInput);
  return await client.send(command);
};

const listObjects = async function (client: S3Client, Bucket: string, Prefix: string): Promise<string[]> {
  const commandInput: ListObjectsCommandInput = {
    Bucket,
    Prefix
  };
  const items: string[] = [];
  let more = true;
  let marker: string | undefined;

  while (more) {
    commandInput.Marker = marker;
    const command = new ListObjectsCommand(commandInput);
    const result = await client.send(command);
    result.Contents?.forEach((content) => {
      if (content.Key) {
        items.push(content.Key);
      }
    });
    more = !!result.IsTruncated;
    if (more) {
      marker = result.NextMarker ?? items[items.length - 1];
    }
  }

  return items;
};

const getObjectBody = async function (client: S3Client, Bucket: string, Key: string): Promise<Buffer> {
  const result = await getObject(client, Bucket, trim(Key));
  const dataArray = await result.Body?.transformToByteArray();

  return Buffer.from(dataArray ?? new Uint8Array());
};

const putObject = async function (client: S3Client, Bucket: string, key: string, directory: boolean, Body?: Buffer): Promise<void> {
  const Key = trim(key);
  const commandInput: PutObjectCommandInput = {
    Bucket,
    Key: directory ? `${Key}/` : Key,
    Body: Body ?? Buffer.from('')
  };
  const command = new PutObjectCommand(commandInput);
  await client.send(command);
};

const deleteObject = async function (client: S3Client, Bucket: string, key: string, directory: boolean): Promise<void> {
  const Key = trim(key);
  const commandInput: DeleteObjectCommandInput = {
    Bucket,
    Key: directory ? `${Key}/` : Key
  };
  const command = new DeleteObjectCommand(commandInput);
  await client.send(command);
};

const exists = async function (client: S3Client, Bucket: string, Key: string): Promise<boolean> {
  const commandInput: GetObjectAttributesCommandInput = {
    Bucket,
    Key,
    ObjectAttributes: ['ObjectSize']
  };
  const command = new GetObjectAttributesCommand(commandInput);
  try {
    await client.send(command);
    return true;
  } catch (error: unknown) {
    if ((error as Error & { Code: string })?.Code === 'NoSuchKey') {
      return false;
    }
    throw error;
  }
};

export { trim, getObjectBody, putObject, deleteObject, listObjects, exists };