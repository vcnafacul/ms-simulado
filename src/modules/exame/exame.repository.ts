import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Exame } from "./exame.schema";
import { BaseRepository } from "src/shared/base/base.repository";

@Injectable()
export class ExameRepository extends BaseRepository<Exame> {
  constructor(
    @InjectModel('Exame') model: Model<Exame>
  ) { 
    super(model);
  }
}