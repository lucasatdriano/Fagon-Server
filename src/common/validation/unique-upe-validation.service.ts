import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ProjectType } from '@prisma/client';

@Injectable()
export class UniqueUpeValidatorService {
  constructor(private prisma: PrismaService) {}

  async validateUniqueUpe(
    upeCode: number,
    projectType: string,
  ): Promise<boolean> {
    const existingProject = await this.prisma.project.findFirst({
      where: {
        upeCode,
        projectType: projectType as ProjectType,
      },
    });

    return !existingProject;
  }
}
