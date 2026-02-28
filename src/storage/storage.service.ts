import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { FileUpload, StorageResult } from './types/file-upload.type';
import { SupabaseClient } from '@supabase/supabase-js';
import { ConfigService } from '@nestjs/config';
import { InjectSupabaseClient } from 'nestjs-supabase-js';
import { Readable } from 'stream';
import {
  FileBufferResult,
  FileStreamResult,
} from '../common/interfaces/storage.interface';
import sharp from 'sharp';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly bucketName: string;
  private readonly MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

  constructor(
    @InjectSupabaseClient() private supabase: SupabaseClient,
    private config: ConfigService,
  ) {
    this.bucketName = this.config.getOrThrow<string>('SUPABASE_STORAGE_BUCKET');
    this.logger.log(
      `🪣 Storage Service inicializado com bucket: ${this.bucketName}`,
    );
  }

  async uploadFile(file: FileUpload, bucket?: string): Promise<StorageResult> {
    const targetBucket = bucket || this.bucketName;
    this.logger.debug(`📤 Iniciando upload para bucket: ${targetBucket}`);

    try {
      this.logger.debug('🔍 Validando upload...');
      await this.validateUpload(file, targetBucket);
      this.logger.debug('✅ Validação concluída');

      let uploadBuffer = file.buffer;
      const originalSize = file.buffer.length;

      if (
        file.mimetype.startsWith('image/') &&
        file.buffer.length < 5 * 1024 * 1024
      ) {
        this.logger.debug('🖼️ Otimizando imagem...');
        try {
          const format = this.getOriginalFormat(file.mimetype);
          this.logger.debug(`📐 Formatando para: ${format}`);

          uploadBuffer = await this.optimizeImage(file.buffer, {
            quality: 80,
            width: 1200,
            format: format,
          });

          this.logger.debug(`📊 Otimização concluída:`, {
            originalSize: `${(originalSize / 1024 / 1024).toFixed(2)}MB`,
            optimizedSize: `${(uploadBuffer.length / 1024 / 1024).toFixed(2)}MB`,
            reduction: `${((1 - uploadBuffer.length / originalSize) * 100).toFixed(1)}%`,
          });
        } catch (optimizeError) {
          this.logger.warn(
            '⚠️ Erro na otimização, usando original:',
            optimizeError,
          );
          uploadBuffer = file.buffer;
        }
      } else {
        this.logger.debug(
          `📦 Arquivo não otimizado (${file.mimetype}, ${(originalSize / 1024 / 1024).toFixed(2)}MB)`,
        );
      }

      const filePath = this.generateFilePath(file);
      this.logger.debug(`📝 Caminho gerado: ${filePath}`);

      this.logger.debug('🚀 Enviando para Supabase Storage...');
      const { error } = await this.supabase.storage
        .from(targetBucket)
        .upload(filePath, uploadBuffer, {
          contentType: file.mimetype,
          upsert: false,
        });

      if (error) {
        this.logger.error('❌ Erro no upload do Supabase:', error);
        throw new Error(`Upload failed: ${error.message}`);
      }

      this.logger.debug(
        '✅ Upload Supabase concluído, gerando URL assinada...',
      );
      const signedUrl = await this.getSignedUrl(filePath);

      const result: StorageResult = {
        url: signedUrl,
        key: filePath,
        metadata: {
          size: uploadBuffer.length,
          mimetype: file.mimetype,
          uploadedAt: new Date(),
        },
      };

      this.logger.log(
        `🎉 Upload concluído: ${filePath} (${(uploadBuffer.length / 1024 / 1024).toFixed(2)}MB)`,
      );
      return result;
    } catch (error: unknown) {
      this.logger.error('💥 Erro no uploadFile:', error);
      this.handleUploadError(error);
    }
  }

  private async validateUpload(file: FileUpload, bucket: string) {
    this.logger.debug(`🔐 Verificando existência do bucket: ${bucket}`);
    const { data: bucketExists, error: bucketError } =
      await this.supabase.storage.getBucket(bucket);

    if (bucketError || !bucketExists) {
      this.logger.error(`❌ Bucket não encontrado: ${bucket}`, bucketError);
      throw new Error(
        `Bucket "${bucket}" não encontrado. Crie-o no painel do Supabase.`,
      );
    }
    this.logger.debug('✅ Bucket validado');

    if (!file.buffer || file.buffer.length === 0) {
      this.logger.error('❌ Arquivo vazio recebido');
      throw new Error('Arquivo vazio');
    }

    if (file.size > this.MAX_FILE_SIZE) {
      this.logger.error(`❌ Arquivo muito grande:`, {
        fileSize: file.size,
        maxSize: this.MAX_FILE_SIZE,
        fileName: file.originalname,
      });
      throw new Error(
        `Tamanho do arquivo excede o limite de ${this.MAX_FILE_SIZE} bytes`,
      );
    }

    const allowedMimeTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/pdf',
      'image/heic',
      'image/heif',
      'image/heic-sequence',
      'image/heif-sequence',
    ];

    if (!allowedMimeTypes.includes(file.mimetype)) {
      this.logger.error(`❌ Tipo de arquivo não permitido:`, {
        mimetype: file.mimetype,
        allowedTypes: allowedMimeTypes,
        fileName: file.originalname,
      });
      throw new Error(
        'Tipo de arquivo não suportado. São permitidos: JPEG, PNG, GIF, WEBP, PDF, HEIC/HEIF',
      );
    }

    this.logger.debug('✅ Validações de arquivo concluídas');
  }

  private generateFilePath(file: FileUpload): string {
    const getExtension = (): string => {
      const typeMap: Record<string, string> = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/gif': 'gif',
        'image/webp': 'webp',
        'image/heic': 'heic',
        'image/heif': 'heif',
        'application/pdf': 'pdf',
      };
      return typeMap[file.mimetype] ?? 'bin';
    };

    const originalName = file.originalname ?? `file-${Date.now()}`;
    const sanitizedName = originalName
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9._-]/g, '-')
      .replace(/\.[^/.]+$/, '')
      .substring(0, 100);

    const fileExt =
      file.originalname?.split('.').pop()?.toLowerCase() ?? getExtension();
    const folder = file.mimetype.startsWith('image/') ? 'Images' : 'Pdfs';

    return `${folder}/${Date.now()}-${sanitizedName}.${fileExt}`;
  }

  private getOriginalFormat(mimetype: string): keyof sharp.FormatEnum {
    const formatMap: Record<string, keyof sharp.FormatEnum> = {
      'image/jpeg': 'jpeg',
      'image/jpg': 'jpeg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp',
      'image/heif': 'heif',
    };

    return formatMap[mimetype] || 'jpeg';
  }

  private async optimizeImage(
    buffer: Buffer,
    options: {
      quality: number;
      width?: number;
      height?: number;
      format?: keyof sharp.FormatEnum;
    },
  ): Promise<Buffer> {
    try {
      const image = sharp(buffer);

      try {
        const metadata = await image.metadata();
        if (!metadata.width || !metadata.height) {
          throw new Error('Imagem com dimensões inválidas');
        }
      } catch {
        console.warn('⚠️ Imagem com metadata inválida, usando original');
        return buffer;
      }

      return await image
        .rotate()
        .resize(options.width, options.height, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .toFormat(options.format || 'jpeg', {
          quality: options.quality,
        })
        .toBuffer();
    } catch {
      console.warn('❌ Erro na otimização, usando original');
      return buffer;
    }
  }

  private handleUploadError(error: unknown): never {
    if (error instanceof Error) {
      console.error('Storage upload error:', error);
      throw new Error(`Falha no armazenamento: ${error.message}`);
    }
    throw new Error('Ocorreu um erro desconhecido durante o upload');
  }

  async getFileStream(
    filePath: string,
    bucket?: string,
  ): Promise<FileStreamResult> {
    const targetBucket = bucket || this.bucketName;

    try {
      const { data: downloadData, error: downloadError } =
        await this.supabase.storage.from(targetBucket).download(filePath);

      if (downloadError || !downloadData) {
        throw new NotFoundException(`Arquivo não encontrado: ${filePath}`);
      }

      const stream = new Readable();
      stream.push(Buffer.from(await downloadData.arrayBuffer()));
      stream.push(null);

      return {
        stream,
        metadata: {
          contentType: 'application/octet-stream',
          contentLength: downloadData.size,
          originalName: filePath.split('/').pop() || 'file',
        },
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new Error(
        `Erro ao obter o arquivo: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
      );
    }
  }

  async getFileBuffer(
    filePath: string,
    bucket?: string,
  ): Promise<FileBufferResult> {
    const targetBucket = bucket || this.bucketName;
    this.logger.debug(
      `📥 Buscando arquivo: ${filePath} do bucket: ${targetBucket}`,
    );

    try {
      const { data, error } = await this.supabase.storage
        .from(targetBucket)
        .download(filePath);

      if (error) {
        this.logger.error('❌ Erro do Supabase ao baixar:', {
          filePath,
          error: error.message,
        });
        throw new Error(`Falha ao baixar arquivo: ${error.message}`);
      }

      if (!data) {
        this.logger.error('❌ Nenhum dado retornado do Supabase:', filePath);
        throw new Error('Nenhum dado retornado do Supabase');
      }

      const buffer = Buffer.from(await data.arrayBuffer());
      this.logger.debug(
        `✅ Arquivo baixado: ${filePath} (${buffer.length} bytes)`,
      );

      const fileName = filePath.split('/').pop() || 'file.jpg';

      return {
        buffer,
        metadata: {
          contentType: 'image/jpeg',
          contentLength: buffer.length,
          originalName: fileName,
        },
      };
    } catch (error) {
      this.logger.error('💥 Erro crítico no getFileBuffer:', {
        filePath,
        bucket: targetBucket,
        error,
      });
      throw error;
    }
  }

  async getSignedUrl(
    filePath: string,
    bucket?: string,
    expiresIn = 60 * 60 * 24 * 7, // 7d
  ): Promise<string> {
    const targetBucket = bucket || this.bucketName;

    const { data: signedUrlData, error } = await this.supabase.storage
      .from(targetBucket)
      .createSignedUrl(filePath, expiresIn);

    if (error || !signedUrlData?.signedUrl) {
      throw new Error(`Erro ao gerar URL assinada: ${error?.message}`);
    }

    return signedUrlData.signedUrl;
  }

  async deleteFile(filePath: string, bucket?: string): Promise<void> {
    const targetBucket = bucket || this.bucketName;

    const { error } = await this.supabase.storage
      .from(targetBucket)
      .remove([filePath]);

    if (error) {
      throw new Error(`Failed to delete file: ${error.message}`);
    }
  }

  getFileUrl(filePath: string, bucket?: string): string {
    const targetBucket = bucket || this.bucketName;

    const {
      data: { publicUrl },
    } = this.supabase.storage.from(targetBucket).getPublicUrl(filePath);

    if (!publicUrl) {
      throw new Error('Failed to get public URL');
    }

    return publicUrl;
  }
}
