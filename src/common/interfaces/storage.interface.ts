import { Readable } from 'stream';

interface FileMetadata {
  contentType: string;
  contentLength: number;
  originalName: string;
  [key: string]: unknown;
}

export interface FileStreamResult {
  stream: Readable;
  metadata: FileMetadata;
}

export interface FileBufferResult {
  buffer: Buffer;
  metadata: FileMetadata;
}
