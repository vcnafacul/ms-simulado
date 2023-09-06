// import { type Request, type Response } from 'express'
// import { ITipoSimuladoDTO } from '../DTOs/SimuladoDTO'
// import TipoSimuladoService from '../services/TipoSimuladoService'

// class TiposSimuladoController {
//   public async post (req: Request, res: Response): Promise<Response> {
//     try {
//       const tipoS = await TipoSimuladoService.Add(req.body as ITipoSimuladoDTO)
//       return res.json(tipoS)
//     } catch (err: any) {
//       return res.status(400).json(`Erro ao cadastra Tipo de Simulado. Erro: ${err.message}`)
//     }
//   }

//   public async getall (req: Request, res: Response): Promise<Response> {
//     try {
//       return res.json(await TipoSimuladoService.GetAll())
//     } catch (err: any) {
//       return res.status(400).json(err.message)
//     }
//   }

//   public async getById (req: Request, res: Response): Promise<Response> {
//     try {
//       return res.json(await TipoSimuladoService.GetById(req.params.id))
//     } catch (err: any) {
//       return res.status(400).json(`Não há nenhum Tipo de Simulado com id: ${req.params.id}. Erro: ${err.message}`)
//     }
//   }

//   public async delete (req: Request, res: Response): Promise<Response> {
//     try {
//       return res.json(await TipoSimuladoService.Delete(req.params.id))
//     } catch (err: any) {
//       return res.status(400).json(`Não há nenhum Tipo de Simulado com id: ${req.params.id}. Erro: ${err.message}`)
//     }
//   }
// }

// export default new TiposSimuladoController()
