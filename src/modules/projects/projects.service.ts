import {
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { SearchProjectDto } from './dto/search-project.dto';
import { Prisma } from '@prisma/client';
import { LogHelperService } from '../logs/log-helper.service';
import { AgencyService } from '../agencies/agencies.service';
import { EngineerService } from '../engineers/engineers.service';
import { PavementService } from '../pavements/pavements.service';
import { PathologyService } from '../pathologies/pathologies.service';

@Injectable()
export class ProjectService {
  constructor(
    private prisma: PrismaService,
    private agencyService: AgencyService,
    private engineerService: EngineerService,
    @Inject(forwardRef(() => PavementService))
    private pavementService: PavementService,
    @Inject(forwardRef(() => PathologyService))
    private pathologyService: PathologyService,
    private logHelper: LogHelperService,
  ) {}

  async create(
    createProjectDto: CreateProjectDto,
    currentUser: { sub: string; role: string },
  ) {
    const {
      agencyId,
      engineerId,
      pavements,
      upeCode,
      projectType,
      ...projectData
    } = createProjectDto;

    if (currentUser.role === 'vistoriador') {
      throw new ForbiddenException(
        'Vistoriadores não têm permissão para criar projeto',
      );
    }

    const existingProject = await this.prisma.project.findFirst({
      where: {
        upeCode,
        projectType,
      },
    });

    if (existingProject) {
      throw new ForbiddenException(
        `Já existe um projeto do mesmo tipo com o mesmo código de UPE`,
      );
    }

    await this.validateRelationsExist(agencyId, engineerId);

    const project = await this.prisma.project.create({
      data: {
        ...projectData,
        projectType,
        upeCode,
        status: 'aguardando_vistoria',
        agency: { connect: { id: agencyId } },
        engineer: { connect: { id: engineerId } },
      },
      include: this.projectIncludes(),
    });

    if (pavements?.length) {
      for (const p of pavements) {
        await this.pavementService.create({
          pavement: p.pavement,
          projectId: project.id,
        });
      }
    }

    await this.logHelper.createLog(
      currentUser.sub,
      'CREATE',
      'Project',
      project.id,
    );

    return this.prisma.project.findUnique({
      where: { id: project.id },
      include: this.projectIncludes(),
    });
  }

  async findAll(
    { page, limit }: { page: number; limit: number },
    currentUser?: { role: string },
  ) {
    if (currentUser?.role === 'vistoriador') {
      throw new ForbiddenException(
        'Vistoriadores não têm permissão para listar projetos',
      );
    }

    const skip = (page - 1) * limit;
    const [projects, total] = await this.findAllProjectsPaginated(skip, limit);

    return {
      projects,
      meta: {
        resource: {
          total: total,
          page: page,
          limit: limit,
          totalPages: Math.ceil(Number(total) / limit),
        },
      },
    };
  }

  async search(params: SearchProjectDto, currentUser?: { role: string }) {
    const {
      projectType,
      upeCode,
      inspectorName,
      engineerName,
      agencyNumber,
      state,
      city,
      page = 1,
      limit = 10,
    } = params;

    if (currentUser?.role === 'vistoriador') {
      throw new ForbiddenException(
        'Vistoriadores não têm permissão para pesquisar projetos',
      );
    }

    const skip = (page - 1) * limit;
    const orFilters: Prisma.ProjectWhereInput[] = [];

    if (projectType) {
      orFilters.push({ projectType: { equals: projectType } });
    }

    if (upeCode && !isNaN(Number(upeCode))) {
      orFilters.push({ upeCode: { equals: Number(upeCode) } });
    }

    if (inspectorName) {
      orFilters.push({
        inspectorName: { contains: inspectorName, mode: 'insensitive' },
      });
    }

    if (engineerName) {
      orFilters.push({
        engineer: { name: { startsWith: engineerName, mode: 'insensitive' } },
      });
    }

    if (agencyNumber) {
      orFilters.push({
        agency: { agencyNumber: { equals: Number(agencyNumber) } },
      });
    }

    if (state) {
      orFilters.push({
        agency: { state: { startsWith: state, mode: 'insensitive' } },
      });
    }

    if (city) {
      orFilters.push({
        agency: { city: { startsWith: city, mode: 'insensitive' } },
      });
    }

    const whereClause = orFilters.length > 0 ? { OR: orFilters } : {};

    const [projects, total] = await Promise.all([
      this.prisma.project.findMany({
        where: whereClause,
        skip,
        take: limit,
        include: this.projectIncludes(),
        orderBy: {
          createdAt: 'desc',
        },
      }),
      this.prisma.project.count({ where: whereClause }),
    ]);

    return {
      projects: projects,
      meta: {
        resource: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
    };
  }

  async findOne(id: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: this.projectIncludes(),
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    return project;
  }

  async update(
    id: string,
    updateProjectDto: UpdateProjectDto,
    currentUser: { sub: string },
  ) {
    await this.findOne(id);

    const { pavements, ...projectData } = updateProjectDto;
    const updateData: Prisma.ProjectUpdateInput = { ...projectData };

    if (pavements) {
      const existingPavements = await this.pavementService.findByProject(id);
      const existingPavementValues = existingPavements.map((p) => p.pavement);

      const newPavements = pavements.filter(
        (p) => !existingPavementValues.includes(p.pavement),
      );

      const pavementsToRemove = existingPavements.filter(
        (p) => !pavements.some((np) => np.pavement === p.pavement),
      );

      const pavementsToUpdate = pavements.filter(
        (p) =>
          existingPavementValues.includes(p.pavement) &&
          (p.height !== undefined || p.area !== undefined),
      );

      await Promise.all([
        ...newPavements.map((p) =>
          this.pavementService.create({
            pavement: p.pavement,
            projectId: id,
          }),
        ),
        ...pavementsToRemove.map((p) => this.pavementService.remove(p.id)),
        ...pavementsToUpdate.map((p) => {
          const existingPavement = existingPavements.find(
            (ep) => ep.pavement === p.pavement,
          );

          if (!existingPavement) {
            throw new NotFoundException(
              `Pavement ${p.pavement} not found for update`,
            );
          }

          const updateData: { area?: number; height?: number } = {};

          if (p.area !== undefined) {
            updateData.area = p.area;
          }

          if (p.height !== undefined) {
            updateData.height = p.height;
          }

          return this.pavementService.update(existingPavement.id, updateData);
        }),
      ]);
    }

    const updatedProject = await this.prisma.project.update({
      where: { id },
      data: updateData,
      include: this.projectIncludes(),
    });

    await this.logHelper.createLog(currentUser.sub, 'UPDATE', 'Project', id);

    return updatedProject;
  }

  async remove(id: string, currentUser: { sub: string; role: string }) {
    if (currentUser.role === 'vistoriador') {
      throw new ForbiddenException(
        'Vistoriadores não têm permissão para deletar projeto',
      );
    }

    await this.findOne(id);

    const project = await this.prisma.project.update({
      where: { id },
      data: { status: 'cancelado' },
    });

    await this.logHelper.createLog(currentUser.sub, 'CANCEL', 'Project', id);

    return project;
  }

  async getProjectPavements(projectId: string) {
    await this.findOne(projectId);
    return this.pavementService.findByProject(projectId);
  }

  async getProjectPathologies(
    { page, limit }: { page: number; limit: number },
    projectId: string,
  ) {
    await this.findOne(projectId);
    return this.pathologyService.findAll({ page, limit }, projectId);
  }

  private projectIncludes() {
    return {
      agency: true,
      engineer: true,
      pavements: true,
      location: {
        include: {
          photo: true,
          materialFinishing: true,
        },
      },
    };
  }

  async findAllProjectsPaginated(skip: number, take: number) {
    const [projects, total] = await Promise.all([
      this.prisma.project.findMany({
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: this.projectIncludes(),
      }),
      this.prisma.project.count(),
    ]);

    return [projects, total];
  }

  private async validateRelationsExist(agencyId: string, engineerId: string) {
    await Promise.all([
      this.agencyService.validateAgencyExists(agencyId),
      this.engineerService.validateEngineerExists(engineerId),
    ]);
  }

  async validateProjectExists(projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }
  }
}
