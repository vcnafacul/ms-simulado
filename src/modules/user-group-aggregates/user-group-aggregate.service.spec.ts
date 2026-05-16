import { NotFoundException, BadRequestException } from '@nestjs/common';
import { UserGroupAggregateService } from './user-group-aggregate.service';
import { UserGroupAggregateRepository } from './user-group-aggregate.repository';
import { CalculateAggregateDtoInput } from './dtos/calculate-aggregate.dto.input';
import { AggregatePayload } from './user-group-aggregate.repository';

const makeRepository = (): jest.Mocked<UserGroupAggregateRepository> =>
  ({
    listByGroup: jest.fn(),
    findOneByMonth: jest.fn(),
    aggregateMonth: jest.fn(),
    upsert: jest.fn(),
  }) as any;

const makeAggregatePayload = (): AggregatePayload => ({
  geral: 80,
  totalAttempts: 5,
  totalAttemptsCompleted: 3,
  studentsWithAtLeastOneCompletedAttempt: 2,
  materias: [],
});

describe('UserGroupAggregateService', () => {
  let service: UserGroupAggregateService;
  let repository: jest.Mocked<UserGroupAggregateRepository>;

  beforeEach(() => {
    repository = makeRepository();
    service = new UserGroupAggregateService(repository);
  });

  describe('list', () => {
    it('calls listByGroup with correct args and returns result', async () => {
      const expected = [{ groupId: 'g1', groupType: 'class', month: '2026-04' }];
      repository.listByGroup.mockResolvedValue(expected as any);

      const result = await service.list('g1', 'class');

      expect(repository.listByGroup).toHaveBeenCalledWith('g1', 'class');
      expect(result).toBe(expected);
    });
  });

  describe('findByMonth', () => {
    it('returns the doc when found', async () => {
      const doc = { groupId: 'g1', groupType: 'class', month: '2026-04' };
      repository.findOneByMonth.mockResolvedValue(doc as any);

      const result = await service.findByMonth('g1', 'class', '2026-04');

      expect(repository.findOneByMonth).toHaveBeenCalledWith('g1', 'class', '2026-04');
      expect(result).toBe(doc);
    });

    it('throws NotFoundException when doc not found', async () => {
      repository.findOneByMonth.mockResolvedValue(null);

      await expect(service.findByMonth('g1', 'class', '2026-04')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('calculate', () => {
    const baseInput: CalculateAggregateDtoInput = {
      groupId: 'g1',
      groupType: 'class',
      month: '2026-04',
      monthStart: '2026-04-01T00:00:00.000Z',
      monthEnd: '2026-04-30T23:59:59.999Z',
      userIds: ['u1', 'u2'],
    };

    it('happy path — calls aggregateMonth then upsert and returns upserted doc', async () => {
      const payload = makeAggregatePayload();
      repository.aggregateMonth.mockResolvedValue({ payload });
      const upserted = { groupId: 'g1', month: '2026-04', payload };
      repository.upsert.mockResolvedValue(upserted as any);

      const result = await service.calculate(baseInput);

      expect(repository.aggregateMonth).toHaveBeenCalledWith({
        userIds: baseInput.userIds,
        monthStart: new Date(baseInput.monthStart),
        monthEnd: new Date(baseInput.monthEnd),
      });
      expect(repository.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          groupId: 'g1',
          groupType: 'class',
          month: '2026-04',
          userIds: ['u1', 'u2'],
          payload,
          sourceHistoricoCount: payload.totalAttempts,
        }),
      );
      expect(result).toBe(upserted);
    });

    it('empty userIds — does not throw BadRequestException', async () => {
      const emptyPayload = makeAggregatePayload();
      emptyPayload.totalAttempts = 0;
      repository.aggregateMonth.mockResolvedValue({ payload: emptyPayload });
      repository.upsert.mockResolvedValue({ groupId: 'g1' } as any);

      const inputWithEmpty: CalculateAggregateDtoInput = {
        ...baseInput,
        userIds: [],
      };

      await expect(service.calculate(inputWithEmpty)).resolves.toBeDefined();
      expect(repository.aggregateMonth).toHaveBeenCalled();
    });

    it('throws BadRequestException when monthStart is after monthEnd', async () => {
      const badInput: CalculateAggregateDtoInput = {
        ...baseInput,
        monthStart: '2026-05-01T00:00:00.000Z',
        monthEnd: '2026-04-01T00:00:00.000Z',
      };

      await expect(service.calculate(badInput)).rejects.toThrow(BadRequestException);
      expect(repository.aggregateMonth).not.toHaveBeenCalled();
    });
  });
});
