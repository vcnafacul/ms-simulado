import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import { ContentFileHistoryService } from '../content-file-history/content-file-history.service';
import { ContentRepository } from '../content/content.repository';
import { AdjustmentProposalRepository } from './adjustment-proposal.repository';
import { AdjustmentProposalService } from './adjustment-proposal.service';
import { ProposalStatus } from './enums/proposal-status.enum';

/**
 * Aprovar uma proposta troca o arquivo e registra quem FEZ o material.
 *
 * ⚠️ Gravava `reviewedBy` em `lastEditedBy`: a tela dizia "Última edição por
 * <quem aprovou>", como se o revisor tivesse escrito o material. O histórico
 * já estava certo (`uploadedBy = author`); era o `Content` que mentia.
 */
describe('AdjustmentProposalService#review — aprovação', () => {
  const session = {
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    abortTransaction: jest.fn(),
    endSession: jest.fn(),
  };
  const proposta = {
    _id: new Types.ObjectId(),
    content: String(new Types.ObjectId()),
    file: new Types.ObjectId(),
    author: 'autora',
    status: ProposalStatus.Pending,
  };
  const conteudo: Record<string, unknown> = { _id: proposta.content };
  const proposalRepo = {
    getById: jest.fn().mockResolvedValue(proposta),
    startSession: jest.fn().mockResolvedValue(session),
    update: jest.fn(),
  };
  const contentRepo = {
    getById: jest.fn().mockResolvedValue(conteudo),
    update: jest.fn(),
  };
  const historico = { create: jest.fn() };
  let service: AdjustmentProposalService;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      providers: [
        AdjustmentProposalService,
        { provide: AdjustmentProposalRepository, useValue: proposalRepo },
        { provide: ContentRepository, useValue: contentRepo },
        { provide: ContentFileHistoryService, useValue: historico },
      ],
    }).compile();
    service = mod.get(AdjustmentProposalService);
  });

  it('⚠️ lastEditedBy = autor da proposta; reviewedBy só na proposta', async () => {
    await service.review(String(proposta._id), {
      status: ProposalStatus.Approved,
      reviewedBy: 'revisor',
    });

    const salvo = contentRepo.update.mock.calls[0][0];
    expect(salvo.lastEditedBy).toBe('autora');
    expect(String(salvo.file)).toBe(String(proposta.file));
    expect(proposalRepo.update.mock.calls[0][0]).toMatchObject({
      status: ProposalStatus.Approved,
      reviewedBy: 'revisor',
    });
    expect(historico.create).toHaveBeenCalledWith(
      expect.objectContaining({ uploadedBy: 'autora' }),
    );
    expect(session.commitTransaction).toHaveBeenCalled();
    expect(proposalRepo.update.mock.calls[0][0].reviewedAt).toBeInstanceOf(Date);
  });

  it('recusar também grava reviewedBy e reviewedAt, sem tocar o conteúdo', async () => {
    contentRepo.update.mockClear();
    proposalRepo.update.mockClear();
    proposalRepo.getById.mockResolvedValueOnce({
      ...proposta,
      status: ProposalStatus.Pending,
    });

    await service.review(String(proposta._id), {
      status: ProposalStatus.Rejected,
      reviewedBy: 'revisor',
    });

    expect(contentRepo.update).not.toHaveBeenCalled();
    expect(proposalRepo.update.mock.calls[0][0]).toMatchObject({
      status: ProposalStatus.Rejected,
      reviewedBy: 'revisor',
    });
    expect(proposalRepo.update.mock.calls[0][0].reviewedAt).toBeInstanceOf(Date);
  });
});
