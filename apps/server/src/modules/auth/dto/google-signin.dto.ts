import { IsString, IsNotEmpty, Length } from 'class-validator';

export class GoogleSigninDto {
  @IsString()
  @IsNotEmpty()
  @Length(20, 4096)
  idToken!: string;
}
