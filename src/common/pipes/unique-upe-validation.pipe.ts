import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import { UniqueUpeValidatorService } from '../validation/unique-upe-validation.service';
import { CreateProjectDto } from '../../modules/projects/dto/create-project.dto';

@Injectable()
export class UniqueUpeValidationPipe implements PipeTransform {
  constructor(private validator: UniqueUpeValidatorService) {}

  async transform(value: CreateProjectDto): Promise<CreateProjectDto> {
    if (!value.upeCode || !value.projectType) {
      return value;
    }

    const isValid = await this.validator.validateUniqueUpe(
      value.upeCode,
      value.projectType,
    );

    if (!isValid) {
      throw new BadRequestException(
        'Já existe um projeto do mesmo tipo com o mesmo código de UPE',
      );
    }

    return value;
  }
}
