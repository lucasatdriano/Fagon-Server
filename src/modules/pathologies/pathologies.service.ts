import {
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { LogHelperService } from '../logs/log-helper.service';
import { CreatePathologyDto } from '../pathologies/dto/create-pathology.dto';
import { SearchPathologyDto } from '../pathologies/dto/search-pathology.dto';
import { UpdatePathologyDto } from '../pathologies/dto/update-pathology.dto';
import { PathologyPhotoService } from '../pathology-photos/pathology-photos.service';
import { StorageService } from 'src/storage/storage.service';

@Injectable()
export class PathologyService {
  constructor(
    private prisma: PrismaService,
    private logHelper: LogHelperService,
    @Inject(forwardRef(() => PathologyPhotoService))
    private pathologyPhotoService: PathologyPhotoService,
    private storageService: StorageService,
  ) {}

  async create(
    createPathologyDto: Omit<CreatePathologyDto, 'photos'> & {
      photos?: Express.Multer.File[];
    },
    userId: string,
  ) {
    const { photos, ...pathologyData } = createPathologyDto;

    const pathology = await this.prisma.pathology.create({
      data: {
        ...pathologyData,
        recordDate: new Date(),
      },
      include: {
        project: true,
        location: true,
      },
    });

    if (photos?.length) {
      await this.pathologyPhotoService.uploadPhotos(photos, pathology.id);
    }

    await this.logHelper.createLog(userId, 'CREATE', 'Pathology', pathology.id);

    return pathology;
  }

  async findAll(
    { page, limit }: { page: number; limit: number },
    projectId?: string,
  ) {
    const skip = (page - 1) * limit;
    const where: Prisma.PathologyWhereInput = projectId ? { projectId } : {};

    const [pathologies, total] = await this.findAllPathologiesPaginated(
      skip,
      limit,
      where,
    );

    return {
      pathologies,
      meta: {
        resource: {
          total: Number(total),
          page: page,
          limit: limit,
          totalPages: Math.ceil(Number(total) / limit),
        },
      },
    };
  }

  async search(searchPathologyDto: SearchPathologyDto) {
    const {
      title,
      description,
      startDate,
      endDate,
      page = 1,
      limit = 10,
    } = searchPathologyDto;

    const skip = (page - 1) * limit;
    const where: Prisma.PathologyWhereInput = {};

    if (title) where.title = { contains: title, mode: 'insensitive' };
    if (description)
      where.description = { contains: description, mode: 'insensitive' };
    if (startDate || endDate) {
      where.recordDate = {
        gte: startDate ? new Date(startDate) : undefined,
        lte: endDate ? new Date(endDate) : undefined,
      };
    }

    const [pathologies, total] = await this.findAllPathologiesPaginated(
      skip,
      limit,
      where,
    );

    return {
      pathologies: pathologies,
      meta: {
        resource: {
          total: Number(total),
          page,
          limit,
          totalPages: Math.ceil(Number(total) / limit),
        },
      },
    };
  }

  async findOne(id: string) {
    const pathology = await this.prisma.pathology.findUnique({
      where: { id },
      include: {
        project: true,
        location: true,
        pathologyPhoto: true,
      },
    });

    if (!pathology) {
      throw new NotFoundException('Patologia não encontrada');
    }

    return pathology;
  }

  async update(
    id: string,
    updatePathologyDto: UpdatePathologyDto,
    userId: string,
  ) {
    const pathology = await this.prisma.pathology.update({
      where: { id },
      data: {
        ...updatePathologyDto,
      },
      include: {
        project: true,
        location: true,
      },
    });

    await this.logHelper.createLog(userId, 'UPDATE', 'Pathology', pathology.id);

    return pathology;
  }

  async remove(id: string, currentUser: { sub: string; role: string }) {
    if (currentUser.role === 'vistoriador') {
      throw new ForbiddenException(
        'Vistoriadores não têm permissão para deletar patologia',
      );
    }

    const pathology = await this.findOne(id);

    const photos = await this.prisma.pathologyPhoto.findMany({
      where: { pathologyId: id },
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

    await this.prisma.pathologyPhoto.deleteMany({
      where: { pathologyId: id },
    });

    await this.prisma.pathology.delete({ where: { id } });

    await this.logHelper.createLog(
      currentUser.sub,
      'DELETE',
      'Pathology',
      pathology.id,
    );

    return;
  }

  async findAllPathologiesPaginated(
    skip: number,
    take: number,
    whereClause?: Prisma.PathologyWhereInput,
  ) {
    const [pathologies, total] = await Promise.all([
      this.prisma.pathology.findMany({
        where: whereClause,
        skip,
        take,
        include: {
          project: true,
          location: true,
          pathologyPhoto: true,
        },
        orderBy: [{ recordDate: 'desc' }, { id: 'asc' }],
        distinct: ['id'],
      }),
      this.prisma.pathology.count({ where: whereClause }),
    ]);

    return [pathologies, total];
  }

  async findAllPathologiesByProjectPaginated(
    projectId: string,
    skip: number,
    take: number,
  ) {
    const where: Prisma.PathologyWhereInput = projectId ? { projectId } : {};
    return this.findAllPathologiesPaginated(skip, take, where);
  }
}
