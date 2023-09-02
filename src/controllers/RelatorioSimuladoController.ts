import { type Request, type Response } from 'express'
import RelatorioSimuladoService from '../services/RelatorioSimuladoService'

class SimuladoRelatorioController {
  public async get (req: Request, res: Response): Promise<Response> {
    try {
      return res.json(await RelatorioSimuladoService.GetById(req.params.id))
    } catch (err: any) {
      return res.status(400).json(`Não há nenhum Relatório de Simulado com id: ${req.params.id}. Erro: ${err.message}`)
    }
  }

  public async getAll (req: Request, res: Response): Promise<Response> {
    return res.json(await RelatorioSimuladoService.GetAll())
  }

}

export default new SimuladoRelatorioController()