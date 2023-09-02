import { Body, Controller, HttpException, HttpStatus, Param, Get, Post, UseInterceptors } from '@nestjs/common';
import { lastValueFrom } from 'rxjs';

@Controller('v1/exame')
export class ExameController {
  constructor(
    private readonly service: AddressService,
  ) { }

  public async getall (req: Request, res: Response): Promise<Response> {
    const exames = await Exame.find()
    return res.status(200).json(exames)
  }

  public async getById (req: Request, res: Response): Promise<Response> {
    try {
      return res.status(200).json(await Exame.findById(req.params.id))
    } catch (err: any) {
      return res.status(400).json(`Não há nenhum exame com id: ${req.params.id}`)
    }
  }

  public async post (req: Request, res: Response): Promise<Response> {
    try {
      const exame = await Exame.create(req.body)
      return res.status(200).json(exame)
    } catch (err: any) {
      return res.status(400).json(err.message)
    }
  }

  public async delete (req: Request, res: Response): Promise<Response> {
    try {
      const remove = await Exame.deleteOne({ _id: req.params.id })
      return res.status(200).json(remove.deletedCount > 0)
    } catch (err: any) {
      return res.status(400).json(`Não há nenhum exame com id: ${req.params.id}. Error: ${err.message}`)
    }
  }
}
