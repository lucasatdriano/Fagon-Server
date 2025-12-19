import type * as sharp from 'sharp';
import type { Job } from 'bull';

enum ImageJobType {
  RESIZE = 'resize-image',
  COMPRESS = 'compress-image',
  CONVERT = 'convert-image',
}

interface ResizeImageData {
  inputPath: string;
  outputPath: string;
  width: number;
  height?: number;
  options?: sharp.ResizeOptions;
}

interface CompressImageData {
  inputPath: string;
  outputPath: string;
  quality: number;
}

interface ConvertImageData {
  inputPath: string;
  outputPath: string;
  format: keyof sharp.FormatEnum;
}

export interface ResizeImageJob extends Job<ResizeImageData> {
  name: ImageJobType.RESIZE;
}

export interface CompressImageJob extends Job<CompressImageData> {
  name: ImageJobType.COMPRESS;
}

export interface ConvertImageJob extends Job<ConvertImageData> {
  name: ImageJobType.CONVERT;
}

function isValidImageJobType(name: string): name is ImageJobType {
  return Object.values(ImageJobType).includes(name as ImageJobType);
}

export function isResizeJob(job: Job): job is ResizeImageJob {
  return isValidImageJobType(job.name) && job.name === ImageJobType.RESIZE;
}

export function isCompressJob(job: Job): job is CompressImageJob {
  return isValidImageJobType(job.name) && job.name === ImageJobType.COMPRESS;
}

export function isConvertJob(job: Job): job is ConvertImageJob {
  return isValidImageJobType(job.name) && job.name === ImageJobType.CONVERT;
}
