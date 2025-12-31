import {
  Controller,
  Get,
  Post,
  UseInterceptors,
  Param,
  Delete,
  ParseUUIDPipe,
  Body,
  UploadedFiles,
  BadRequestException,
  Query,
  Put,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import {
  CurrentUser,
  RequireAuth,
} from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ROLES } from '../../common/constants/roles.constant';
import { PathologyPhotoResponseDto } from './dto/response-pathology-photo.dto';
import { PathologyPhotoService } from './pathology-photos.service';
import { StorageService } from '../../storage/storage.service';
import { JwtPayload } from '../../common/interfaces/jwt.payload.interface';
import { RotatePathologyPhotoDto } from './dto/rotate-pathology-photo.dto';

@ApiTags('Pathology Photos')
@ApiBearerAuth()
@RequireAuth()
@Roles(ROLES.ADMIN, ROLES.FUNCIONARIO, ROLES.VISTORIADOR)
@Controller('pathology-photos')
export class PathologyPhotoController {
  constructor(
    private readonly pathologyPhotoService: PathologyPhotoService,
    private readonly storageService: StorageService,
  ) {}

  @Post('upload/:pathologyId')
  @UseInterceptors(FilesInterceptor('files', 10))
  @ApiOperation({ summary: 'Faz upload de fotos para uma patologia' })
  @ApiResponse({
    status: 201,
    type: [PathologyPhotoResponseDto],
    description: 'Fotos da patologia enviadas com sucesso',
  })
  async uploadPhotos(
    @UploadedFiles() files: Express.Multer.File[],
    @Param('pathologyId', ParseUUIDPipe) pathologyId: string,
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('Nenhum arquivo enviado');
    }

    return this.pathologyPhotoService.uploadPhotos(files, pathologyId);
  }

  @Get('pathology/:pathologyId')
  @ApiOperation({ summary: 'Lista fotos de uma patologia' })
  @ApiResponse({
    status: 200,
    type: [PathologyPhotoResponseDto],
    description: 'Lista de fotos da patologia',
  })
  async getPhotosByPathology(
    @Param('pathologyId', ParseUUIDPipe) pathologyId: string,
    @Query('signed') signed: string,
  ) {
    return this.pathologyPhotoService.getPhotosByPathology(
      pathologyId,
      signed === 'true',
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtém uma foto específica da patologia' })
  @ApiResponse({
    status: 200,
    type: PathologyPhotoResponseDto,
    description: 'Foto da patologia encontrada',
  })
  async getPhotoById(@Param('id', ParseUUIDPipe) id: string) {
    return this.pathologyPhotoService.getPhotoById(id);
  }

  @Get(':id/signed-url')
  @ApiOperation({ summary: 'Obtém URL assinada para uma foto de patologia' })
  @ApiResponse({
    status: 200,
    description: 'URL assinada gerada com sucesso',
    schema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
      },
    },
  })
  async getSignedUrl(@Param('id', ParseUUIDPipe) id: string) {
    const photo = await this.pathologyPhotoService.getPhotoById(id);
    const signedUrl = await this.storageService.getSignedUrl(photo.filePath);
    return { url: signedUrl };
  }

  @Put(':id/rotate')
  @Roles(ROLES.ADMIN, ROLES.FUNCIONARIO)
  @ApiOperation({ summary: 'Rotaciona uma foto da patologia' })
  @ApiResponse({
    status: 200,
    type: PathologyPhotoResponseDto,
    description: 'Foto da patologia rotacionada com sucesso',
  })
  async rotatePhoto(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() rotatePathologyPhotoDto: RotatePathologyPhotoDto,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return this.pathologyPhotoService.rotatePhoto(
      id,
      rotatePathologyPhotoDto.rotation,
      currentUser,
    );
  }

  @Delete(':id')
  @Roles(ROLES.ADMIN, ROLES.FUNCIONARIO)
  @ApiOperation({ summary: 'Remove uma foto de patologia' })
  @ApiResponse({
    status: 200,
    description: 'Foto removida com sucesso',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
      },
    },
  })
  async deletePhoto(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return this.pathologyPhotoService.deletePhoto(id, currentUser);
  }
}
