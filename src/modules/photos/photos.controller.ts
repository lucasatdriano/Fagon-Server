import {
  Controller,
  Get,
  Post,
  UseInterceptors,
  Param,
  Delete,
  ParseUUIDPipe,
  Body,
  Patch,
  UploadedFiles,
  Query,
  Put,
  Logger,
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
import { PhotoService } from './photos.service';
import { PhotoResponseDto } from './dto/response-photo.dto';
import { UpdatePhotoDto } from './dto/update-photo.dto';
import { StorageService } from '../../storage/storage.service';
import { JwtPayload } from '../../common/interfaces/jwt.payload.interface';
import { RotatePhotoDto } from './dto/rotate-photo.dto';

@ApiTags('Photos')
@ApiBearerAuth()
@RequireAuth()
@Roles(ROLES.ADMIN, ROLES.FUNCIONARIO, ROLES.VISTORIADOR)
@Controller('photos')
export class PhotoController {
  private readonly logger = new Logger(PhotoController.name);

  constructor(
    private readonly photoService: PhotoService,
    private readonly storageService: StorageService,
  ) {}

  @Post('upload/:locationId')
  @UseInterceptors(FilesInterceptor('files', 10))
  @ApiOperation({ summary: 'Upload de fotos' })
  @ApiResponse({
    status: 201,
    description: 'Fotos enviadas com sucesso',
    type: [PhotoResponseDto],
  })
  async uploadPhotos(
    @UploadedFiles() files: Express.Multer.File[],
    @Param('locationId') locationId: string,
  ): Promise<PhotoResponseDto[]> {
    const photos = await this.photoService.uploadPhotos(files, locationId);

    return Promise.all(
      photos.map(async (photo) => ({
        id: photo.id,
        name: photo.name || 'Foto sem nome',
        filePath: photo.filePath,
        selectedForPdf: photo.selectedForPdf,
        locationId: photo.locationId,
        signedUrl: await this.storageService.getSignedUrl(photo.filePath),
        location: {
          id: locationId,
          name: photo.location.name,
        },
      })),
    );
  }

  @Get('location/:locationId')
  @ApiOperation({ summary: 'Lista fotos de uma localização' })
  @ApiResponse({
    status: 200,
    type: [PhotoResponseDto],
    description: 'Lista de fotos',
  })
  async getPhotosByLocation(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Query('signed') signed: string,
  ): Promise<PhotoResponseDto[]> {
    return this.photoService.getPhotosByLocation(locationId, signed === 'true');
  }

  @Patch(':id')
  @Roles(ROLES.ADMIN, ROLES.FUNCIONARIO)
  @ApiOperation({ summary: 'Atualiza status de seleção para PDF' })
  @ApiResponse({
    status: 200,
    type: PhotoResponseDto,
    description: 'Foto atualizada',
  })
  async updatePhoto(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updatePhotoDto: UpdatePhotoDto,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<PhotoResponseDto> {
    return this.photoService.updatePhoto(
      id,
      updatePhotoDto.selectedForPdf,
      currentUser,
    );
  }

  @Put(':id/rotate')
  @Roles(ROLES.ADMIN, ROLES.FUNCIONARIO)
  @ApiOperation({ summary: 'Rotaciona uma foto' })
  @ApiResponse({
    status: 200,
    type: PhotoResponseDto,
    description: 'Foto rotacionada com sucesso',
  })
  async rotatePhoto(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() rotatePhotoDto: RotatePhotoDto,
    @CurrentUser() currentUser: JwtPayload,
  ): Promise<PhotoResponseDto> {
    return this.photoService.rotatePhoto(
      id,
      rotatePhotoDto.rotation,
      currentUser,
    );
  }

  @Delete(':id')
  @Roles(ROLES.ADMIN, ROLES.FUNCIONARIO)
  @ApiOperation({ summary: 'Remove uma foto' })
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
  ): Promise<{ success: boolean; message: string }> {
    return this.photoService.deletePhoto(id, currentUser);
  }
}
