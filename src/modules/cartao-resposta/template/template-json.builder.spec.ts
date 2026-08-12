import { buildLayout } from '../layout/cartao-layout';
import { buildTemplateJson } from './template-json.builder';

describe('buildTemplateJson', () => {
  it('emite pageDimensions, bubbleDimensions e CropOnMarkers', () => {
    const { templateJson } = buildTemplateJson(buildLayout(90));
    expect(templateJson.pageDimensions).toEqual([2160, 3188]); // caixa dos centros de marker
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
    // origin do template = centro − centroMarkerTL(near=160) − bubbleDim/2(30)
    expect(mat.origin).toEqual([
      layoutMat.origin[0] - 160 - 30,
      layoutMat.origin[1] - 160 - 30,
    ]);
    expect(mat.labelsGap).toBe(layoutMat.labelsGap);
    expect(mat.bubblesGap).toBe(layoutMat.bubblesGap);
  });

  it('pageDimensions = caixa dos centros de marker (A4 − 2·near)', () => {
    const { templateJson } = buildTemplateJson(buildLayout(90));
    expect(templateJson.pageDimensions).toEqual([2480 - 320, 3508 - 320]);
  });

  it('config.json força show_image_level 0 (headless)', () => {
    const { configJson } = buildTemplateJson(buildLayout(90));
    expect(configJson.outputs.show_image_level).toBe(0);
  });

  // O centro de amostragem do OMRChecker no espaço normalizado pelos markers
  // (origin_topleft + índices·gaps + bubbleDim/2) + centroMarkerTL(near) tem que coincidir
  // com o centro visual A4 que o PDF desenha (LayoutModel.bubbleCenter).
  it('consistência: centro de amostragem OMRChecker (+near) ≡ LayoutModel.bubbleCenter', () => {
    const layout = buildLayout(90);
    const { templateJson } = buildTemplateJson(layout);
    const halfW = layout.page.bubbleWidthPx / 2;
    const halfH = layout.page.bubbleHeightPx / 2;
    const near = layout.page.markerInsetPx + layout.page.markerSizePx / 2;

    const mat = templateJson.fieldBlocks.matricula;
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 10; j++) {
        const sampleCenter = {
          x: mat.origin[0] + i * mat.labelsGap + halfW + near,
          y: mat.origin[1] + j * mat.bubblesGap + halfH + near,
        };
        expect(layout.bubbleCenter('matricula', i, j)).toEqual(sampleCenter);
      }
    }
    const c1 = templateJson.fieldBlocks.respostas_c1;
    for (let i = 0; i < 30; i++) {
      for (let j = 0; j < 5; j++) {
        const sampleCenter = {
          x: c1.origin[0] + j * c1.bubblesGap + halfW + near,
          y: c1.origin[1] + i * c1.labelsGap + halfH + near,
        };
        expect(layout.bubbleCenter('respostas_c1', i, j)).toEqual(sampleCenter);
      }
    }
  });
});
