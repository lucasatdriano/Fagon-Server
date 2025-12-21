import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { CreateStateLawDto } from './dto/create-state-law.dto';
import { UpdateStateLawDto } from './dto/update-state-law.dto';
import { normalizeString } from 'src/common/utils/normalize-string.utils';

@Injectable()
export class StateLawService {
  constructor(private prisma: PrismaService) {}

  async create(createStateLawDto: CreateStateLawDto) {
    const stateLaw = await this.prisma.stateLaw.create({
      data: {
        ...createStateLawDto,
        stateNormalized: normalizeString(createStateLawDto.state),
      },
    });

    return stateLaw;
  }

  async findAll(params: { state?: string; active?: boolean }) {
    const where: Prisma.StateLawWhereInput = {};
    if (params.state) where.state = params.state;
    if (params.active !== undefined) where.active = params.active;

    return this.prisma.stateLaw.findMany({
      where,
      orderBy: {
        state: 'asc',
      },
    });
  }

  async findOne(id: string) {
    const stateLaw = await this.prisma.stateLaw.findUnique({
      where: { id },
    });

    if (!stateLaw) {
      throw new NotFoundException('Legislação estadual não encontrada');
    }

    return stateLaw;
  }

  async findByState(state: string) {
    const normalizedState = normalizeString(state);

    const stateLaw = await this.prisma.stateLaw.findFirst({
      where: {
        stateNormalized: normalizedState,
      },
    });

    if (!stateLaw) {
      throw new NotFoundException(
        `Legislação estadual para o estado ${state} não encontrada`,
      );
    }

    return stateLaw;
  }

  async update(id: string, updateStateLawDto: UpdateStateLawDto) {
    const data = { ...updateStateLawDto };

    if (updateStateLawDto.state) {
      data.stateNormalized = normalizeString(updateStateLawDto.state);
    }

    const stateLaw = await this.prisma.stateLaw.update({
      where: { id },
      data,
    });

    return stateLaw;
  }

  async remove(id: string) {
    const stateLaw = await this.prisma.stateLaw.delete({
      where: { id },
    });

    return stateLaw;
  }
}
