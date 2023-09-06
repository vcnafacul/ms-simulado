// import { type Request, type Response } from 'express'
// import Frente from '../schemas/Frente'

// class FrenteController {
//   public async getall (req: Request, res: Response): Promise<Response> {
//     const frentes = await Frente.find()
//     return res.json(frentes)
//   }

//   public async getById (req: Request, res: Response): Promise<Response> {
//     try {
//       return res.json(await Frente.findById(req.params.id))
//     } catch (err: any) {
//       return res.status(400).json(`Não há nenhuma frente com id: ${req.params.id}`)
//     }
//   }

//   public async post (req: Request, res: Response): Promise<Response> {
//     try {
//       const frente = await Frente.create(req.body)
//       return res.json(frente)
//     } catch (err: any) {
//       return res.status(400).json(err.message)
//     }
//   }

//   public async delete (req: Request, res: Response): Promise<Response> {
//     try {
//       const remove = await Frente.deleteOne({ _id: req.params.id })
//       return res.json(remove.deletedCount > 0)
//     } catch (err: any) {
//       return res.status(400).json(`Não há nenhuma frente com id: ${req.params.id}. Error: ${err.message}`)
//     }
//   }
// }

// export default new FrenteController()
