import { type Request, type Response } from 'express'
import { IQuestaoDTO } from '../DTOs/QuestaoDTO'
import QuestaoService from '../services/QuestaoService'

class QuestaoController {
  public async post (req: Request, res: Response): Promise<Response> {
    try {
      const questoe = await QuestaoService.Add(req.body as IQuestaoDTO)
      return res.status(200).json(questoe)
    } catch (err: any) {
      return res.status(400).json(err.message)
    }
  }

  public async getall (req: Request, res: Response): Promise<Response> {
    try {
      return res.json(await QuestaoService.GetAll())
    } catch (err: any) {
      return res.status(400).json(err.message)
    }
  }

  public async getById (req: Request, res: Response): Promise<Response> {
    try {
      return res.json(await QuestaoService.GetById(req.params.id))
    } catch (err: any) {
      return res.status(400).json(`Não há nenhuma questao com id: ${req.params.id}`)
    }
  }

  public async delete (req: Request, res: Response): Promise<Response> {
    try {
      return res.json(await QuestaoService.Delete(req.params.id))
    } catch (err: any) {
      return res.status(400).json(err.message)
    }
  }
}

export default new QuestaoController()
