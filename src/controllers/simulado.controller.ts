// import { type Request, type Response } from 'express'
// import SimuladoService from "../services/SimuladoService"
// import { IRespostaimuladoDTO } from '../DTOs/RespostaSimluadoDTO'
// import { ISimuladoInput } from '../types/Simulado/Input/ISimuladoInput'

// class SimuladoController {
//   public async create(req: Request, res: Response):  Promise<Response> {
//     try {
//       const body = req.body as ISimuladoInput
//       const IdSimulado = await SimuladoService.Create(body.tipo)
//       if(IdSimulado == 0) {
//         throw new Error("Erro ao gerar Simulado")
//       }
//       return res.status(201).send(IdSimulado)
//     } catch (error) {
//       console.error(error)
//       return res.status(500).json(error)
//     }
//   }

//   public async getDefaults(req: Request, res: Response) :  Promise<Response> {
//     try {
//       return res.status(200).json(await SimuladoService.GetDefaults())
//     } catch (error) {
//       return res.status(500).send(error)
//     }
//   }

//   public async getall (req: Request, res: Response): Promise<Response> {
//     return res.json(await SimuladoService.GetAllAtivos())
//   }

//   public async getById (req: Request, res: Response): Promise<Response> {
//     try {
//       return res.json(await SimuladoService.GetById(req.params.id))
//     } catch (err: any) {
//       return res.status(400).json(`Não há nenhum Simulado com id: ${req.params.id}. Erro: ${err.message}`)
//     }
//   }

//   public async delete (req: Request, res: Response): Promise<Response> {
//     try {
//       return res.json(await SimuladoService.Delete(req.params.id))
//     } catch (err: any) {
//       return res.status(400).json(`Erro ao tentar deletar Simulado: ${req.params.id}. Erro: ${err.message}`)
//     }
//   }

//   public async getToAnswer (req: Request, res: Response): Promise<Response> {
//     try {
//       return res.json(await SimuladoService.GetToAnswer(req.params.simuladoId, Number.parseInt(req.params.userId)))
//     } catch (err: any) {
//       return res.status(400).json(`Não há nenhum Simulado com id: ${req.params.id}. Erro: ${err.message}`)
//     }
//   }

//   public async postAnswer (req: Request, res: Response): Promise<Response> {
//     try {
//       return res.json(await SimuladoService.ReceiveAnswers(req.body as IRespostaimuladoDTO))
//     } catch (err: any) {
//       return res.status(400).json(`Erro ao gerar relatorio: ${req.params.id}. Erro: ${err.message}`)
//     }
//   }

//   public async hasSimuladoActive(req: Request, res: Response): Promise<Response> {
//     try {
//       return res.json(await SimuladoService.HasSimuladoActive(req.params.simuladoId, Number.parseInt(req.params.userId)));
//     } catch (err: any) {
//       return res.status(400).json(`Não há nenhum Simulado com id: ${req.params.id}. Erro: ${err.message}`)
//     }
//   }
// }

// export default new SimuladoController()