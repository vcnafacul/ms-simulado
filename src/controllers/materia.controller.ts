// import { type Request, type Response } from 'express'
// import Materia from '../schemas/Materia'

// class MateriaController {
//   public async getall (req: Request, res: Response): Promise<Response> {
//     const materias = await Materia.find()
//     return res.json(materias)
//   }

//   public async getById (req: Request, res: Response): Promise<Response> {
//     try {
//       return res.json(await Materia.findById(req.params.id))
//     } catch (err: any) {
//       return res.status(400).json(`Não há nenhuma materia com id: ${req.params.id}`)
//     }
//   }

//   public async post (req: Request, res: Response): Promise<Response> {
//     try {
//       const materia = await Materia.create(req.body)
//       return res.json(materia)
//     } catch (err: any) {
//       return res.status(400).json(err.message)
//     }
//   }

//   public async delete (req: Request, res: Response): Promise<Response> {
//     try {
//       const remove = await Materia.deleteOne({ _id: req.params.id })
//       return res.json(remove.deletedCount > 0)
//     } catch (err: any) {
//       return res.status(400).json(`Não há nenhuma materia com id: ${req.params.id}. Error: ${err.message}`)
//     }
//   }
// }

// export default new MateriaController()
