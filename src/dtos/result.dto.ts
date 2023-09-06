export class ResultDto{
    constructor(
        public message: string,
        public success: boolean,
        public data: any,
        public error:any[],
    ) {}
}