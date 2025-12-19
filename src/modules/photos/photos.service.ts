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
import { LocationService } from '../locations/locations.service';
import { ProjectService } from '../projects/projects.service';
import sharp from 'sharp';
import { PhotoResponseDto } from './dto/response-photo.dto';

@Injectable()
export class PhotoService {
  private readonly logger = new Logger(PhotoService.name);

  constructor(
    private prisma: PrismaService,
    private storageService: StorageService,
    @Inject(forwardRef(() => LocationService))
    private locationService: LocationService,
    @Inject(forwardRef(() => ProjectService))
    private projectService: ProjectService,
  ) {}

  async uploadPhotos(files: Express.Multer.File[], locationId: string) {
    this.logger.log(`🚀 Upload para location: ${locationId}`);

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

    const location = await this.prisma.location.findUnique({
      where: { id: locationId },
      include: { project: { include: { agency: true } } },
    });

    if (!location?.project) {
      throw new NotFoundException('Projeto não encontrado');
    }

    const project = location.project;

    return await this.prisma.$transaction(async (tx) => {
      const lastPhoto = await tx.photo.findFirst({
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

      const uploadedPhotos: PhotoResponseDto[] = [];
      for (let index = 0; index < files.length; index++) {
        const file = files[index];
        const photoNumber = lastPhotoNumber + index + 1;
        const timestamp = Date.now();

        const uniqueFileName = `${project.projectType}-${project.agency.agencyNumber}-${timestamp}-${photoNumber}.jpg`;

        const uploadResult = await this.storageService.uploadFile({
          originalname: uniqueFileName,
          buffer: file.buffer,
          mimetype: file.mimetype || 'image/jpeg',
          size: file.size,
        });

        const photoName = `Foto${photoNumber}-${location.name.replace(/\s+/g, '_')}`;

        const savedPhoto = await tx.photo.create({
          data: {
            name: photoName,
            locationId,
            filePath: uploadResult.key,
            selectedForPdf: false,
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

        const photoResponse: PhotoResponseDto = {
          id: savedPhoto.id,
          name: savedPhoto.name || 'Foto',
          locationId: savedPhoto.locationId,
          filePath: savedPhoto.filePath,
          selectedForPdf: savedPhoto.selectedForPdf,
          location: savedPhoto.location,
        };

        uploadedPhotos.push(photoResponse);
      }

      this.logger.log(`✅ Upload concluído: ${uploadedPhotos.length} fotos`);
      return uploadedPhotos;
    });
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

    const existingPhoto = await this.prisma.photo.findUnique({
      where: { id },
    });

    if (!existingPhoto) {
      throw new NotFoundException('Foto não encontrada');
    }

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
}
