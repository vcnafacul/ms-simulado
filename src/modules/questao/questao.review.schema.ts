import { Prop } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { BaseSchema } from 'src/shared/base/base.schema';

export class QuestaoReview extends BaseSchema {
  @Prop({ required: false, default: false })
  @ApiProperty()
  public provaClassification: boolean;

  @Prop({ required: false, default: false })
  @ApiProperty()
  public subjectClassification: boolean;

  @Prop({ required: false, default: false })
  @ApiProperty()
  public textClassification: boolean;

  @Prop({ required: false, default: false })
  @ApiProperty()
  public imageClassfication: boolean;

  @Prop({ required: false, default: false })
  @ApiProperty()
  public alternativeClassfication: boolean;

  @Prop({ required: false, default: false })
  @ApiProperty()
  public reported: boolean;
}
