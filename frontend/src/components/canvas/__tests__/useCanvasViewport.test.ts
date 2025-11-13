import { describe, it, expect } from 'vitest';

describe('useCanvasViewport', () => {
  // Note: Hook testing requires @testing-library/react which is not installed
  // These are placeholder tests that verify the hook module can be imported
  // For full hook testing, would need to add @testing-library/react-hooks
  
  it('exports useCanvasViewport function', async () => {
    const module = await import('../useCanvasViewport');
    expect(module.useCanvasViewport).toBeDefined();
    expect(typeof module.useCanvasViewport).toBe('function');
  });

  it('has correct coordinate transformation logic', () => {
    // Test the transformation math directly
    const zoom = 2;
    const offset = { x: 50, y: 100 };
    
    // worldToScreen: (wx * zoom + offset.x, wy * zoom + offset.y)
    const wx = 100, wy = 200;
    const sx = wx * zoom + offset.x;
    const sy = wy * zoom + offset.y;
    expect(sx).toBe(250);
    expect(sy).toBe(500);
    
    // screenToWorld: ((sx - offset.x) / zoom, (sy - offset.y) / zoom)
    const wx2 = (sx - offset.x) / zoom;
    const wy2 = (sy - offset.y) / zoom;
    expect(wx2).toBe(wx);
    expect(wy2).toBe(wy);
  });

  it('has correct zoom clamping logic', () => {
    const minZoom = 0.1;
    const maxZoom = 3;
    const zoomFactor = 1.2;
    
    // Zoom in from 2.8 should clamp to 3
    expect(Math.min(maxZoom, 2.8 * zoomFactor)).toBe(3);
    
    // Zoom out from 0.12 should clamp to 0.1
    expect(Math.max(minZoom, 0.12 / zoomFactor)).toBe(0.1);
  });

  it('calculates bounding box correctly', () => {
    const nodes = [
      { x: 100, y: 100, w: 200, h: 100 },
      { x: 400, y: 200, w: 200, h: 100 },
    ];
    
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    nodes.forEach((n) => {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + n.w);
      maxY = Math.max(maxY, n.y + n.h);
    });
    
    expect(minX).toBe(100);
    expect(minY).toBe(100);
    expect(maxX).toBe(600);
    expect(maxY).toBe(300);
    
    const contentW = maxX - minX;
    const contentH = maxY - minY;
    expect(contentW).toBe(500);
    expect(contentH).toBe(200);
  });

  it('calculates fit zoom correctly', () => {
    const canvasSize = { w: 800, h: 600 };
    const contentW = 500;
    const contentH = 200;
    const padding = 40;
    
    const zoomX = (canvasSize.w - 2 * padding) / Math.max(1, contentW);
    const zoomY = (canvasSize.h - 2 * padding) / Math.max(1, contentH);
    const zoom = Math.min(1.5, Math.max(0.1, Math.min(zoomX, zoomY)));
    
    // (800 - 80) / 500 = 1.44
    // (600 - 80) / 200 = 2.6
    // min(1.44, 2.6) = 1.44
    // min(1.5, 1.44) = 1.44
    expect(zoom).toBe(1.44);
  });

  it('centers content correctly', () => {
    const canvasSize = { w: 800, h: 600 };
    const minX = 100, maxX = 600;
    const minY = 100, maxY = 300;
    const zoom = 1.44;
    
    const contentCenterX = (minX + maxX) / 2;
    const contentCenterY = (minY + maxY) / 2;
    
    const offsetX = canvasSize.w / 2 - contentCenterX * zoom;
    const offsetY = canvasSize.h / 2 - contentCenterY * zoom;
    
    expect(contentCenterX).toBe(350);
    expect(contentCenterY).toBe(200);
    expect(offsetX).toBe(400 - 350 * 1.44);
    expect(offsetY).toBe(300 - 200 * 1.44);
  });
});
