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
import { PathologyService } from '../pathologies/pathologies.service';
import { ProjectService } from '../projects/projects.service';
import sharp from 'sharp';
import { PathologyPhoto } from '@prisma/client';

@Injectable()
export class PathologyPhotoService {
  constructor(
    private prisma: PrismaService,
    private storageService: StorageService,
    @Inject(forwardRef(() => PathologyService))
    private pathologyService: PathologyService,
    @Inject(forwardRef(() => ProjectService))
    private projectService: ProjectService,
  ) {}

  async uploadPhotos(files: Express.Multer.File[], pathologyId: string) {
    const pathology = await this.pathologyService.findOne(pathologyId);

    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB (igual ao PhotoService)
    const invalidFiles = files.filter(
      (file) =>
        file.size > MAX_FILE_SIZE || !file.mimetype?.startsWith('image/'),
    );

    if (invalidFiles.length > 0) {
      throw new BadRequestException(
        `Arquivos inválidos: tamanho máximo 10MB e apenas imagens são permitidas`,
      );
    }

    const allPhotos = await this.prisma.pathologyPhoto.findMany({
      where: { pathologyId },
      select: { name: true },
    });

    let maxPhotoNumber = 0;
    allPhotos.forEach((photo) => {
      if (photo.name) {
        const match = photo.name.match(/Foto-Patologia(\d+)/);
        if (match) {
          const num = parseInt(match[1]);
          if (num > maxPhotoNumber) {
            maxPhotoNumber = num;
          }
        }
      }
    });

    const project = await this.projectService.findOne(pathology.projectId);
    const uploadedPhotos: PathologyPhoto[] = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        console.log(`🔄 Processando arquivo de patologia ${i + 1}:`, {
          name: file.originalname,
          size: file.size,
          mimetype: file.mimetype,
        });

        maxPhotoNumber++;

        const timestamp = Date.now();
        const uniqueFileName = `patologia-${project.projectType}-${project.agency.agencyNumber}-${timestamp}-${i}-${file.originalname}`;

        const uploadResult = await this.storageService.uploadFile({
          originalname: uniqueFileName,
          buffer: file.buffer,
          mimetype: file.mimetype || 'image/jpeg',
          size: file.size,
        });

        const photoName = `Foto-Patologia${maxPhotoNumber}-${pathology.referenceLocation}`;

        const newPhoto = await this.prisma.pathologyPhoto.create({
          data: {
            name: photoName,
            pathologyId,
            filePath: uploadResult.key,
          },
          include: {
            pathology: {
              include: {
                project: {
                  select: {
                    id: true,
                    upeCode: true,
                  },
                },
                location: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
        });

        uploadedPhotos.push(newPhoto);
      }

      return uploadedPhotos;
    } catch (error) {
      console.error('Upload error (patologia):', error);
      throw new InternalServerErrorException(
        'Falha ao fazer upload das fotos da patologia',
      );
    }
  }

  async getPhotoById(id: string) {
    const photo = await this.prisma.pathologyPhoto.findUnique({
      where: { id },
      include: {
        pathology: {
          include: {
            project: {
              select: {
                id: true,
                upeCode: true,
              },
            },
            location: {
              select: {
                id: true,
                name: true,
                locationType: true,
              },
            },
          },
        },
      },
    });

    if (!photo) {
      throw new NotFoundException('Foto da patologia não encontrada');
    }

    return photo;
  }

  async getPhotosByPathology(pathologyId: string, includeSignedUrl = false) {
    const photos = await this.prisma.pathologyPhoto.findMany({
      where: { pathologyId },
      include: {
        pathology: {
          include: {
            project: {
              select: {
                id: true,
                upeCode: true,
              },
            },
            location: {
              select: {
                id: true,
                name: true,
                locationType: true,
              },
            },
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

  async rotatePhoto(
    id: string,
    rotation: number,
    currentUser?: { role: string },
  ) {
    if (currentUser?.role === 'vistoriador') {
      throw new ForbiddenException(
        'Vistoriadores não têm permissão para rotacionar fotos da patologia',
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

      const pathology = await this.pathologyService.findOne(
        existingPhoto.pathologyId,
      );
      const project = await this.projectService.findOne(pathology.projectId);

      const uploadResult = await this.storageService.uploadFile({
        originalname: `patologia-${project.projectType}-${project.agency.agencyNumber}-rotated-${Date.now()}.jpg`,
        buffer: rotatedBuffer,
        mimetype: 'image/jpeg',
        size: rotatedBuffer.length,
      });

      const updatedPhoto = await this.prisma.pathologyPhoto.update({
        where: { id },
        data: {
          filePath: uploadResult.key,
        },
        include: {
          pathology: {
            include: {
              project: {
                select: {
                  id: true,
                  upeCode: true,
                },
              },
              location: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      });

      return {
        ...updatedPhoto,
        url: await this.storageService.getSignedUrl(updatedPhoto.filePath),
      };
    } catch (error) {
      console.error('Erro detalhado ao rotacionar foto da patologia:', error);
      throw new InternalServerErrorException(
        'Falha ao rotacionar foto da patologia',
      );
    }
  }

  async deletePhoto(id: string, currentUser?: { role: string }) {
    if (currentUser?.role === 'vistoriador') {
      throw new ForbiddenException(
        'Vistoriadores não têm permissão para deletar foto da patologia',
      );
    }

    const photo = await this.prisma.pathologyPhoto.findUnique({
      where: { id },
      include: {
        pathology: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });

    if (!photo) {
      throw new NotFoundException('Foto da patologia não encontrada');
    }

    await this.storageService.deleteFile(photo.filePath);
    await this.prisma.pathologyPhoto.delete({ where: { id } });

    return {
      success: true,
      message: 'Foto da patologia deletada com sucesso',
      deletedPhoto: photo,
    };
  }
}
