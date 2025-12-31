import {
  BadRequestException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { LocationService } from '../locations/locations.service';
import { ProjectService } from '../projects/projects.service';
import sharp from 'sharp';
import { Photo } from '@prisma/client';

@Injectable()
export class PhotoService {
  constructor(
    private prisma: PrismaService,
    private storageService: StorageService,
    @Inject(forwardRef(() => LocationService))
    private locationService: LocationService,
    @Inject(forwardRef(() => ProjectService))
    private projectService: ProjectService,
  ) {}

  async uploadPhotos(files: Express.Multer.File[], locationId: string) {
    const location =
      await this.locationService.validateLocationExists(locationId);

    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    const invalidFiles = files.filter(
      (file) =>
        file.size > MAX_FILE_SIZE || !file.mimetype?.startsWith('image/'),
    );

    if (invalidFiles.length > 0) {
      throw new BadRequestException(
        `Arquivos inválidos: tamanho máximo 10MB e apenas imagens são permitidas`,
      );
    }

    const allPhotos = await this.prisma.photo.findMany({
      where: { locationId },
      select: { name: true },
    });

    let maxPhotoNumber = 0;
    allPhotos.forEach((photo) => {
      if (photo.name) {
        const match = photo.name.match(/Foto(\d+)/);
        if (match) {
          const num = parseInt(match[1]);
          if (num > maxPhotoNumber) {
            maxPhotoNumber = num;
          }
        }
      }
    });

    const project = await this.projectService.findOne(location.projectId);
    const uploadedPhotos: Photo[] = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        console.log(`🔄 Processando arquivo ${i + 1}:`, {
          name: file.originalname,
          size: file.size,
          mimetype: file.mimetype,
        });

        maxPhotoNumber++;

        const timestamp = Date.now();
        const uniqueFileName = `${project.projectType}-${project.agency.agencyNumber}-${timestamp}-${i}-${file.originalname}`;

        const uploadResult = await this.storageService.uploadFile({
          originalname: uniqueFileName,
          buffer: file.buffer,
          mimetype: file.mimetype || 'image/jpeg',
          size: file.size,
        });

        const photoName = `Foto${maxPhotoNumber}-${location.name}`;

        const newPhoto = await this.prisma.photo.create({
          data: {
            name: photoName,
            locationId,
            filePath: uploadResult.key,
            selectedForPdf: false,
          },
        });

        uploadedPhotos.push(newPhoto);
      }

      return uploadedPhotos;
    } catch (error) {
      console.error('Upload error:', error);
      throw new InternalServerErrorException('Falha ao fazer upload das fotos');
    }
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
          signedUrl: await this.storageService.getSignedUrl(photo.filePath),
        })),
      );
    }

    return photos;
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

    try {
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
        url: await this.storageService.getSignedUrl(updatedPhoto.filePath),
      };
    } catch (error) {
      console.error('Erro detalhado ao rotacionar foto:', error);
    }
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
