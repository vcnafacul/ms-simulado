import { buildLayout } from '../layout/cartao-layout';
import { buildTemplateJson } from './template-json.builder';

describe('buildTemplateJson', () => {
  it('emite pageDimensions, bubbleDimensions e CropOnMarkers', () => {
    const { templateJson } = buildTemplateJson(buildLayout(90));
    expect(templateJson.pageDimensions).toEqual([2480, 3508]);
    expect(templateJson.bubbleDimensions).toEqual([60, 60]);
    expect(templateJson.preProcessors[0].name).toBe('CropOnMarkers');
    expect(templateJson.preProcessors[0].options.relativePath).toBe(
      'omr_marker.png',
    );
  });

  it('fieldBlocks: matricula + respostas_c1..c3 com origin/gaps do layout', () => {
    const layout = buildLayout(90);
    const { templateJson } = buildTemplateJson(layout);
    expect(Object.keys(templateJson.fieldBlocks).sort()).toEqual([
      'matricula',
      'respostas_c1',
      'respostas_c2',
      'respostas_c3',
    ]);
    const mat = templateJson.fieldBlocks.matricula;
    const layoutMat = layout.fieldBlocks.find((b) => b.key === 'matricula')!;
    expect(mat.origin).toEqual(layoutMat.origin);
    expect(mat.labelsGap).toBe(layoutMat.labelsGap);
    expect(mat.bubblesGap).toBe(layoutMat.bubblesGap);
  });

  it('config.json força show_image_level 0 (headless)', () => {
    const { configJson } = buildTemplateJson(buildLayout(90));
    expect(configJson.outputs.show_image_level).toBe(0);
  });

  it('consistência: expansão OMRChecker ≡ LayoutModel.bubbleCenter', () => {
    const layout = buildLayout(90);
    const { templateJson } = buildTemplateJson(layout);

    const mat = templateJson.fieldBlocks.matricula;
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 10; j++) {
        const expanded = {
          x: mat.origin[0] + i * mat.labelsGap,
          y: mat.origin[1] + j * mat.bubblesGap,
        };
        expect(layout.bubbleCenter('matricula', i, j)).toEqual(expanded);
      }
    }
    const c1 = templateJson.fieldBlocks.respostas_c1;
    for (let i = 0; i < 30; i++) {
      for (let j = 0; j < 5; j++) {
        const expanded = {
          x: c1.origin[0] + j * c1.bubblesGap,
          y: c1.origin[1] + i * c1.labelsGap,
        };
        expect(layout.bubbleCenter('respostas_c1', i, j)).toEqual(expanded);
      }
    }
  });
});
