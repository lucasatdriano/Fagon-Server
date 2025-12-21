import { forwardRef, Module } from '@nestjs/common';
import { ProjectService } from './projects.service';
import { ProjectController } from './projects.controller';
import { PavementModule } from '../pavements/pavements.module';
import { AgencyModule } from '../agencies/agencies.module';
import { EngineerModule } from '../engineers/engineers.module';
import { LogModule } from '../logs/logs.module';
import { PathologyModule } from '../pathologies/pathologies.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { UniqueUpeValidationPipe } from 'src/common/pipes/unique-upe-validation.pipe';
import { UniqueUpeValidatorService } from 'src/common/validation/unique-upe-validation.service';

@Module({
  imports: [
    PrismaModule,
    AgencyModule,
    EngineerModule,
    forwardRef(() => PavementModule),
    forwardRef(() => PathologyModule),
    LogModule,
  ],
  controllers: [ProjectController],
  providers: [
    ProjectService,
    UniqueUpeValidatorService,
    UniqueUpeValidationPipe,
  ],
  exports: [ProjectService],
})
export class ProjectModule {}
