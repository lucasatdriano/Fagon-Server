import {
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { LogHelperService } from '../logs/log-helper.service';
import { Prisma } from '@prisma/client';
import { PavementService } from '../pavements/pavements.service';
import { MaterialFinishingService } from '../material-finishings/material-finishings.service';
import { ProjectService } from '../projects/projects.service';
import { StorageService } from 'src/storage/storage.service';

@Injectable()
export class LocationService {
  constructor(
    private prisma: PrismaService,
    private storageService: StorageService,
    @Inject(forwardRef(() => ProjectService))
    private projectService: ProjectService,
    @Inject(forwardRef(() => PavementService))
    private pavementService: PavementService,
    private materialFinishingService: MaterialFinishingService,
    private logHelper: LogHelperService,
  ) {}

  async create(createLocationDto: CreateLocationDto, userId: string) {
    const { projectId, ...locationData } = createLocationDto;

    await this.projectService.validateProjectExists(projectId);

    const location = await this.prisma.location.create({
      data: {
        ...locationData,
        project: { connect: { id: projectId } },
      },
    });

    await this.logHelper.createLog(userId, 'CREATE', 'Location', location.id);

    return location;
  }

  async findByProject(projectId: string) {
    await this.projectService.validateProjectExists(projectId);

    return this.prisma.location.findMany({
      where: { projectId },
      include: {
        pavement: true,
        materialFinishing: true,
        photo: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findByPavement(pavementId: string) {
    await this.pavementService.validatePavementExists(pavementId);

    return this.prisma.location.findMany({
      where: { pavementId },
      include: {
        pavement: true,
        materialFinishing: true,
        photo: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: string) {
    const location = await this.prisma.location.findUnique({
      where: { id },
      include: {
        pavement: true,
        materialFinishing: true,
        photo: true,
      },
    });

    if (!location) {
      throw new NotFoundException('Location not found');
    }

    return location;
  }

  async update(
    id: string,
    updateLocationDto: UpdateLocationDto,
    userId: string,
  ) {
    const location = await this.findOne(id);

    const { pavementId, finishes, height, projectId, ...locationData } =
      updateLocationDto;

    try {
      const updateData: Prisma.LocationUpdateInput = {
        ...locationData,
        project: projectId ? { connect: { id: projectId } } : undefined,
      };

      if (pavementId) {
        await this.pavementService.validatePavementExists(pavementId);
        updateData.pavement = { connect: { id: pavementId } };
      }

      if (height !== undefined) {
        updateData.height = height;
      }

      const updatedLocation = await this.prisma.location.update({
        where: { id },
        data: updateData,
        include: {
          materialFinishing: true,
          pavement: true,
          photo: true,
        },
      });

      if (pavementId && height !== undefined && height !== null) {
        await this.pavementService.updatePavementHeight(pavementId, height);
      } else if (height !== undefined && height !== null && location.pavement) {
        await this.pavementService.updatePavementHeight(
          location.pavement.id,
          height,
        );
      }

      if (finishes) {
        await this.materialFinishingService
          .createBulk(id, finishes)
          .catch((error) => {
            console.error('Finishes update failed:', error);
            throw new Error(`Falha ao atualizar acabamentos: ${error.message}`);
          });
      }

      await this.logHelper.createLog(userId, 'UPDATE_LOCATION', 'Location', id);

      return updatedLocation;
    } catch (error) {
      console.error('Location update error:', error);
      throw new InternalServerErrorException('Falha ao atualizar localização');
    }
  }

  async remove(id: string, currentUser: { sub: string; role: string }) {
    if (currentUser.role === 'vistoriador') {
      throw new ForbiddenException(
        'Vistoriadores não têm permissão para deletar localização',
      );
    }

    const location = await this.findOne(id);

    const photos = await this.prisma.photo.findMany({
      where: { locationId: id },
    });

    await Promise.all(
      photos.map((photo) =>
        this.storageService
          .deleteFile(photo.filePath)
          .catch((e) =>
            console.error(`Erro ao deletar arquivo ${photo.filePath}:`, e),
          ),
      ),
    );

    await this.prisma.photo.deleteMany({
      where: { locationId: id },
    });

    await this.prisma.materialFinishing.deleteMany({
      where: { locationId: id },
    });

    const deletedLocation = await this.prisma.location.delete({
      where: { id },
    });

    if (location.pavement) {
      const locations = await this.findByPavement(location.pavement.id);
      const otherLocations = locations.filter((l) => l.id !== id);

      if (otherLocations.length > 0) {
        const maxHeight = Math.max(...otherLocations.map((l) => l.height || 0));
        await this.pavementService.update(location.pavement.id, {
          height: maxHeight,
        });
      } else {
        await this.pavementService.update(location.pavement.id, { height: 0 });
      }
    }

    await this.logHelper.createLog(currentUser.sub, 'DELETE', 'Location', id);

    return deletedLocation;
  }

  async validateLocationExists(locationId: string) {
    const location = await this.prisma.location.findUnique({
      where: { id: locationId },
    });

    if (!location) {
      throw new NotFoundException('Location not found');
    }

    return location;
  }
}
