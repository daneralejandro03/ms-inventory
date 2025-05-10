import { IsString, Length } from 'class-validator';

export class CreateCategoryDto {
    @IsString()
    @Length(1, 100)
    name: string;
}
