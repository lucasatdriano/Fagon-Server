import { Module } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { MaterialFinishingService } from './material-finishings.service';
import { MaterialFinishingController } from './material-finishings.controller';

@Module({
  controllers: [MaterialFinishingController],
  providers: [MaterialFinishingService, PrismaService],
})
export class MaterialFinishingModule {}
