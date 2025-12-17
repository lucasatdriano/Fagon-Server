import {
  BadRequestException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { SupabaseClient } from '@supabase/supabase-js';
import { InjectSupabaseClient } from 'nestjs-supabase-js';
import { LocationService } from '../locations/locations.service';
import { ProjectService } from '../projects/projects.service';
import sharp from 'sharp';
import { UploadResponseDto } from './dto/upload-photo.dto';
import { UploadStatusResponseDto } from './dto/upload-status-response.dto';

interface ProcessCacheItem {
  processId: string;
  message: string;
  fileCount: number;
  locationId: string;
  estimatedTime: string;
  status: 'processing' | 'completed' | 'failed';
  startTime: Date;
  completedPhotos: number;
  totalPhotos: number;
  results: Array<{
    id: string;
    name: string;
    filePath: string;
    photoNumber: number;
    locationName: string;
    sizeKB: number;
  }>;
  errors: Array<{
    photoIndex: number;
    fileName: string;
    error: string;
  }>;
  endTime?: Date;
  durationMs?: number;
  error?: string;
}

@Injectable()
export class PhotoService {
  private readonly logger = new Logger(PhotoService.name);
  private processCache = new Map<string, ProcessCacheItem>();

  constructor(
    private prisma: PrismaService,
    private storageService: StorageService,
    @Inject(forwardRef(() => LocationService))
    private locationService: LocationService,
    @Inject(forwardRef(() => ProjectService))
    private projectService: ProjectService,
    @InjectSupabaseClient() private supabase: SupabaseClient,
  ) {}

  // ========== UPLOAD ASSÍNCRONO ==========

  startUploadProcess(
    files: Express.Multer.File[],
    locationId: string,
  ): Promise<UploadResponseDto> {
    this.logger.log(`📤 Iniciando upload para location: ${locationId}`);

    // Validação básica
    if (!files || files.length === 0) {
      throw new BadRequestException('Nenhum arquivo enviado');
    }

    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    const invalidFiles = files.filter(
      (file) =>
        file.size > MAX_FILE_SIZE || !file.mimetype?.startsWith('image/'),
    );

    if (invalidFiles.length > 0) {
      throw new BadRequestException(
        'Arquivos inválidos: tamanho máximo 10MB e apenas imagens',
      );
    }

    // Gera ID do processo
    const processId = Date.now().toString();
    this.logger.log(`🆔 Process ID gerado: ${processId}`);

    // Cria resposta
    const response = new UploadResponseDto(
      processId,
      `Upload recebido. Processando ${files.length} foto(s) em background...`,
      files.length,
      locationId,
    );

    // Salva no cache
    const cacheItem: ProcessCacheItem = {
      ...response,
      startTime: new Date(),
      completedPhotos: 0,
      totalPhotos: files.length,
      status: 'processing',
      results: [],
      errors: [],
    };
    this.processCache.set(processId, cacheItem);

    // Processa em background
    this.processUploadInBackground(files, locationId, processId).catch(
      (error: Error) => {
        this.logger.error(`❌ Erro no processamento ${processId}:`, error);
        const process = this.processCache.get(processId);
        if (process) {
          process.status = 'failed';
          process.error = error.message;
          this.processCache.set(processId, process);
        }
      },
    );

    return Promise.resolve(response);
  }

  private async processUploadInBackground(
    files: Express.Multer.File[],
    locationId: string,
    processId: string,
  ): Promise<void> {
    this.logger.log(`🔄 Processamento background ${processId} iniciado`);

    try {
      // Valida location
      const locationExists = await this.validateLocationExists(locationId);
      if (!locationExists) {
        throw new BadRequestException(
          `Localização ${locationId} não encontrada`,
        );
      }

      // Processa uma foto por vez
      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        try {
          const result = await this.processSinglePhoto(
            file,
            locationId,
            i,
            files.length,
          );

          // Atualiza cache
          const process = this.processCache.get(processId);
          if (process) {
            process.completedPhotos++;
            process.results.push(result);
            this.processCache.set(processId, process);
          }

          // Pausa entre fotos para free tier
          if (i < files.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        } catch (photoError) {
          const errorMessage =
            photoError instanceof Error
              ? photoError.message
              : 'Erro desconhecido';

          // Atualiza erro no cache
          const process = this.processCache.get(processId);
          if (process) {
            process.errors.push({
              photoIndex: i,
              fileName: file.originalname,
              error: errorMessage,
            });
            process.completedPhotos++;
            this.processCache.set(processId, process);
          }
        }
      }

      // Finaliza processo
      const process = this.processCache.get(processId);
      if (process) {
        process.status = 'completed';
        process.endTime = new Date();
        process.durationMs =
          process.endTime.getTime() - process.startTime.getTime();
        this.processCache.set(processId, process);
        this.logger.log(`🎉 Processamento ${processId} concluído`);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Erro desconhecido';
      this.logger.error(
        `💥 Erro fatal no processamento ${processId}:`,
        errorMessage,
      );
      throw error;
    }
  }

  getUploadStatus(processId: string): UploadStatusResponseDto {
    const process = this.processCache.get(processId);

    if (!process) {
      throw new NotFoundException(`Processo ${processId} não encontrado`);
    }

    return {
      processId,
      status: process.status,
      message:
        process.status === 'processing'
          ? `Processando... ${process.completedPhotos}/${process.totalPhotos} fotos`
          : process.status === 'completed'
            ? `Processamento concluído! ${process.results.length} foto(s) salvas`
            : `Processamento falhou: ${process.error || 'Erro desconhecido'}`,
      progress: {
        completed: process.completedPhotos,
        total: process.totalPhotos,
        percentage: Math.round(
          (process.completedPhotos / process.totalPhotos) * 100,
        ),
      },
      results: process.results,
      errors: process.errors,
      startTime: process.startTime,
      endTime: process.endTime,
      durationMs: process.durationMs,
    };
  }

  // ========== PROCESSAMENTO INDIVIDUAL ==========

  async processSinglePhoto(
    file: Express.Multer.File,
    locationId: string,
    index: number,
    totalFiles: number,
  ) {
    this.logger.debug(`🖼️ Processando foto ${index + 1}/${totalFiles}`);

    // Busca localização e projeto
    const location = await this.prisma.location.findUnique({
      where: { id: locationId },
      include: {
        project: {
          include: {
            agency: true,
          },
        },
      },
    });

    if (!location?.project) {
      throw new NotFoundException('Projeto não encontrado');
    }

    // Busca última foto para numeração
    const lastPhoto = await this.prisma.photo.findFirst({
      where: { locationId },
      orderBy: { name: 'desc' },
    });

    let lastPhotoNumber = 0;
    if (lastPhoto?.name) {
      const match = lastPhoto.name.match(/Foto(\d+)/);
      if (match) {
        lastPhotoNumber = parseInt(match[1], 10);
      }
    }

    const photoNumber = lastPhotoNumber + index + 1;
    const timestamp = Date.now();

    // Upload para storage
    const uniqueFileName = `${location.project.projectType}-${location.project.agency.agencyNumber}-${timestamp}-${index}.jpg`;
    const uploadResult = await this.storageService.uploadFile({
      originalname: uniqueFileName,
      buffer: file.buffer,
      mimetype: file.mimetype || 'image/jpeg',
      size: file.size,
    });

    // Salva no banco
    const photoName = `Foto${photoNumber}-${location.name}`;
    const savedPhoto = await this.prisma.photo.create({
      data: {
        name: photoName,
        locationId,
        filePath: uploadResult.key,
        selectedForPdf: false,
      },
    });

    return {
      id: savedPhoto.id,
      name: savedPhoto.name || photoName,
      filePath: savedPhoto.filePath,
      photoNumber,
      locationName: location.name,
      sizeKB: Math.round(file.size / 1024),
    };
  }

  // ========== MÉTODOS EXISTENTES ==========

  async uploadPhotos(files: Express.Multer.File[], locationId: string) {
    this.logger.log(`🚀 Upload síncrono para location: ${locationId}`);

    // Validação
    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    const invalidFiles = files.filter(
      (file) =>
        file.size > MAX_FILE_SIZE || !file.mimetype?.startsWith('image/'),
    );

    if (invalidFiles.length > 0) {
      throw new BadRequestException(
        'Arquivos inválidos: tamanho máximo 10MB e apenas imagens são permitidas',
      );
    }

    // Busca localização
    const location = await this.prisma.location.findUnique({
      where: { id: locationId },
      include: { project: { include: { agency: true } } },
    });

    if (!location?.project) {
      throw new NotFoundException('Projeto não encontrado');
    }

    // Busca última foto
    const lastPhoto = await this.prisma.photo.findFirst({
      where: { locationId },
      orderBy: { name: 'desc' },
    });

    let lastPhotoNumber = 0;
    if (lastPhoto?.name) {
      const match = lastPhoto.name.match(/Foto(\d+)/);
      if (match) {
        lastPhotoNumber = parseInt(match[1], 10);
      }
    }

    const project = location.project;

    // Processa todas as fotos
    const uploadedPhotos = await Promise.all(
      files.map(async (file, index) => {
        const photoNumber = lastPhotoNumber + index + 1;
        const timestamp = Date.now();

        const uniqueFileName = `${project.projectType}-${project.agency.agencyNumber}-${timestamp}-${index}-${file.originalname}`;

        const uploadResult = await this.storageService.uploadFile({
          originalname: uniqueFileName,
          buffer: file.buffer,
          mimetype: file.mimetype || 'image/jpeg',
          size: file.size,
        });

        const photoName = `Foto${photoNumber}-${location.name}`;
        return this.prisma.photo.create({
          data: {
            name: photoName,
            locationId,
            filePath: uploadResult.key,
            selectedForPdf: false,
          },
        });
      }),
    );

    this.logger.log(
      `✅ Upload síncrono concluído: ${uploadedPhotos.length} fotos`,
    );
    return uploadedPhotos;
  }

  async getPhotoById(id: string) {
    const photo = await this.prisma.photo.findUnique({
      where: { id },
    });

    if (!photo) {
      throw new NotFoundException('Foto não encontrada');
    }

    return photo;
  }

  async getPhotosByLocation(locationId: string, includeSignedUrl = false) {
    const photos = await this.prisma.photo.findMany({
      where: { locationId },
      include: {
        location: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (includeSignedUrl) {
      return Promise.all(
        photos.map(async (photo) => ({
          ...photo,
          name: photo.name || 'Foto sem nome',
          signedUrl: await this.storageService.getSignedUrl(photo.filePath),
        })),
      );
    }

    return photos.map((photo) => ({
      ...photo,
      name: photo.name || 'Foto sem nome',
    }));
  }

  async updatePhoto(
    id: string,
    selectedForPdf: boolean | undefined,
    currentUser?: { role: string },
  ) {
    if (currentUser?.role === 'vistoriador') {
      throw new ForbiddenException(
        'Vistoriadores não têm permissão para atualizar foto',
      );
    }

    const photo = await this.prisma.photo.update({
      where: { id },
      data: { selectedForPdf },
      include: {
        location: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return {
      ...photo,
      name: photo.name || 'Foto sem nome',
      url: await this.storageService.getSignedUrl(photo.filePath),
    };
  }

  async rotatePhoto(
    id: string,
    rotation: number,
    currentUser?: { role: string },
  ) {
    if (currentUser?.role === 'vistoriador') {
      throw new ForbiddenException(
        'Vistoriadores não têm permissão para rotacionar fotos',
      );
    }

    const existingPhoto = await this.getPhotoById(id);

    if (!existingPhoto.filePath) {
      throw new BadRequestException(
        'Caminho do arquivo não encontrado no banco de dados',
      );
    }

    const fileBuffer = await this.storageService.getFileBuffer(
      existingPhoto.filePath,
    );

    let rotatedImage = sharp(fileBuffer.buffer);

    if (rotation !== 0) {
      rotatedImage = rotatedImage.rotate(rotation);
    }

    const rotatedBuffer = await rotatedImage.jpeg({ quality: 90 }).toBuffer();

    await this.storageService.deleteFile(existingPhoto.filePath);

    const location = await this.locationService.validateLocationExists(
      existingPhoto.locationId,
    );
    const project = await this.projectService.findOne(location.projectId);

    const uploadResult = await this.storageService.uploadFile({
      originalname: `${project.projectType}-${project.agency.agencyNumber}-rotated-${Date.now()}.jpg`,
      buffer: rotatedBuffer,
      mimetype: 'image/jpeg',
      size: rotatedBuffer.length,
    });

    const updatedPhoto = await this.prisma.photo.update({
      where: { id },
      data: {
        filePath: uploadResult.key,
      },
      include: {
        location: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return {
      ...updatedPhoto,
      name: updatedPhoto.name || 'Foto sem nome',
      url: await this.storageService.getSignedUrl(updatedPhoto.filePath),
    };
  }

  async deletePhoto(id: string, currentUser?: { role: string }) {
    if (currentUser?.role === 'vistoriador') {
      throw new ForbiddenException(
        'Vistoriadores não têm permissão para deletar foto',
      );
    }

    const photo = await this.prisma.photo.findUnique({ where: { id } });
    if (!photo) {
      throw new NotFoundException('Foto não encontrada');
    }

    await this.storageService.deleteFile(photo.filePath);
    await this.prisma.photo.delete({ where: { id } });

    return { success: true, message: 'Foto deletada com sucesso' };
  }

  async validateLocationExists(locationId: string): Promise<boolean> {
    const location = await this.prisma.location.findUnique({
      where: { id: locationId },
      select: { id: true },
    });
    return !!location;
  }

  // Limpeza automática de processos antigos
  cleanupOldProcesses(): { cleanedCount: number } {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    let cleanedCount = 0;

    for (const [processId, process] of this.processCache.entries()) {
      if (process.startTime.getTime() < oneHourAgo) {
        this.processCache.delete(processId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logger.log(`🧹 Limpou ${cleanedCount} processos antigos`);
    }

    return { cleanedCount };
  }
}
