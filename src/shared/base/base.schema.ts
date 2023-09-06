import { Prop, Schema } from "@nestjs/mongoose";

@Schema({timestamps:true})
export class BaseSchema {
    public _id: string;

    // @Prop()
    // public createdAt: Date;

    // @Prop()
    // public updatedAt: Date;

    @Prop()
    public deleted: boolean;
}