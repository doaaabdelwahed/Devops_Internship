import { Test } from '@nestjs/testing';
import { AppController } from './app.controller';

describe('AppController', () => {
  let controller: AppController;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AppController],
    }).compile();
    controller = moduleRef.get(AppController);
  });

  it('GET /health returns status ok', () => {
    const res = controller.getHealth();
    expect(res.status).toBe('ok');
    expect(res.service).toBe('backend');
    expect(() => new Date(res.timestamp).toISOString()).not.toThrow();
  });

  it('GET /info returns NestJS service info', () => {
    const res = controller.getInfo();
    expect(res.service).toBe('backend');
    expect(res.framework).toBe('NestJS');
    expect(res.runtime).toBe(process.version);
  });
});
