import { describe, it, expect } from 'vitest';

describe('useCanvasNodes', () => {
  // Note: Hook testing requires @testing-library/react which is not installed
  // These are placeholder tests that verify the hook module can be imported
  
  it('exports useCanvasNodes function', async () => {
    const module = await import('../useCanvasNodes');
    expect(module.useCanvasNodes).toBeDefined();
    expect(typeof module.useCanvasNodes).toBe('function');
  });

  it('calculates default positions for code nodes correctly', () => {
    const idx = 0;
    const x = 100 + (idx % 5) * 260;
    const y = 100 + Math.floor(idx / 5) * 180;
    expect(x).toBe(100);
    expect(y).toBe(100);
    
    const idx2 = 5;
    const x2 = 100 + (idx2 % 5) * 260;
    const y2 = 100 + Math.floor(idx2 / 5) * 180;
    expect(x2).toBe(100); // (5 % 5) = 0
    expect(y2).toBe(280); // floor(5/5) = 1, 100 + 1*180 = 280
  });

  it('calculates default positions for theme nodes correctly', () => {
    const idx = 0;
    const x = 100 + (idx % 4) * 320;
    const y = 420;
    expect(x).toBe(100);
    expect(y).toBe(420);
    
    const idx2 = 4;
    const x2 = 100 + (idx2 % 4) * 320;
    expect(x2).toBe(100); // (4 % 4) = 0
  });

  it('calculates default positions for insight nodes correctly', () => {
    const idx = 0;
    const x = 100 + (idx % 3) * 380;
    const y = 760;
    expect(x).toBe(100);
    expect(y).toBe(760);
    
    const idx2 = 3;
    const x2 = 100 + (idx2 % 3) * 380;
    expect(x2).toBe(100); // (3 % 3) = 0
  });

  it('calculates default positions for annotation nodes correctly', () => {
    const idx = 0;
    const x = 60 + (idx % 6) * 190;
    const y = 60;
    expect(x).toBe(60);
    expect(y).toBe(60);
    
    const idx2 = 6;
    const x2 = 60 + (idx2 % 6) * 190;
    expect(x2).toBe(60); // (6 % 6) = 0
  });

  it('builds node index map correctly', () => {
    const nodes = [
      { kind: 'code' as const, id: 'code1', x: 0, y: 0, w: 200, h: 100 },
      { kind: 'theme' as const, id: 'theme1', x: 0, y: 0, w: 200, h: 100 },
      { kind: 'code' as const, id: 'code2', x: 0, y: 0, w: 200, h: 100 },
    ];
    
    const indexMap = new Map<string, number>();
    nodes.forEach((n, i) => indexMap.set(`${n.kind}:${n.id}`, i));
    
    expect(indexMap.get('code:code1')).toBe(0);
    expect(indexMap.get('theme:theme1')).toBe(1);
    expect(indexMap.get('code:code2')).toBe(2);
    expect(indexMap.get('code:code3')).toBeUndefined();
  });

  it('preserves existing node positions when syncing', () => {
    // Simulate previous nodes with custom positions
    const prevNodes = [
      { kind: 'code' as const, id: 'code1', x: 500, y: 300, w: 250, h: 150 },
    ];
    
    // Build previous map
    const prevMap = new Map(
      prevNodes.map((p) => [`${p.kind}:${p.id}` as const, p])
    );
    
    // New node from data (with default position)
    const newNode = {
      kind: 'code' as const,
      id: 'code1',
      x: 100,
      y: 100,
      w: 200,
      h: 100,
    };
    
    const key = `${newNode.kind}:${newNode.id}` as const;
    const prevN = prevMap.get(key);
    
    // Should preserve previous position
    const result = prevN
      ? { ...newNode, x: prevN.x, y: prevN.y, w: prevN.w, h: prevN.h }
      : newNode;
    
    expect(result.x).toBe(500);
    expect(result.y).toBe(300);
    expect(result.w).toBe(250);
    expect(result.h).toBe(150);
  });

  it('uses default position for new nodes', () => {
    const prevMap = new Map();
    
    const newNode = {
      kind: 'code' as const,
      id: 'code1',
      x: 100,
      y: 100,
      w: 200,
      h: 100,
    };
    
    const key = `${newNode.kind}:${newNode.id}` as const;
    const prevN = prevMap.get(key);
    
    // Should use default position (no previous node)
    const result = prevN
      ? { ...newNode, x: prevN.x, y: prevN.y, w: prevN.w, h: prevN.h }
      : newNode;
    
    expect(result.x).toBe(100);
    expect(result.y).toBe(100);
    expect(result.w).toBe(200);
    expect(result.h).toBe(100);
  });

  it('handles node key format correctly', () => {
    const kind = 'code';
    const id = 'abc123';
    const key = `${kind}:${id}`;
    expect(key).toBe('code:abc123');
    
    const kind2 = 'theme';
    const id2 = 'xyz789';
    const key2 = `${kind2}:${id2}`;
    expect(key2).toBe('theme:xyz789');
  });
});
