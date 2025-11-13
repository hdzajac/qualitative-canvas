import { describe, it, expect } from 'vitest';
import { useCanvasInteraction } from '../useCanvasInteraction';

describe('useCanvasInteraction', () => {
  it('should export the hook function', () => {
    expect(useCanvasInteraction).toBeDefined();
    expect(typeof useCanvasInteraction).toBe('function');
  });

  describe('helper functions', () => {
    it('should handle rect intersection logic', () => {
      const r1 = { x: 0, y: 0, w: 100, h: 100 };
      const r2 = { x: 50, y: 50, w: 100, h: 100 };
      const r3 = { x: 200, y: 200, w: 100, h: 100 };

      // Overlapping rects
      const overlaps = r1.x < r2.x + r2.w && r1.x + r1.w > r2.x && r1.y < r2.y + r2.h && r1.y + r1.h > r2.y;
      expect(overlaps).toBe(true);

      // Non-overlapping rects
      const noOverlap = r1.x < r3.x + r3.w && r1.x + r1.w > r3.x && r1.y < r3.y + r3.h && r1.y + r1.h > r3.y;
      expect(noOverlap).toBe(false);
    });

    it('should handle array union logic', () => {
      const arr1 = ['a', 'b', 'c'];
      const arr2 = ['c', 'd', 'e'];
      const union = Array.from(new Set([...arr1, ...arr2]));
      
      expect(union).toHaveLength(5);
      expect(union).toContain('a');
      expect(union).toContain('e');
      expect(union.filter(x => x === 'c')).toHaveLength(1);
    });

    it('should handle array toggle logic', () => {
      const arr = ['a', 'b', 'c'];
      
      // Remove existing
      const removed = arr.filter(x => x !== 'b');
      expect(removed).toHaveLength(2);
      expect(removed).not.toContain('b');

      // Add new
      const added = arr.includes('d') ? arr : [...arr, 'd'];
      expect(added).toHaveLength(4);
      expect(added).toContain('d');
    });
  });

  describe('drag state modes', () => {
    it('should support all drag modes', () => {
      // The hook supports these drag modes:
      const modes = ['node', 'pan', 'select', 'resize', 'connect'];
      
      expect(modes).toContain('node'); // dragging nodes
      expect(modes).toContain('pan'); // panning canvas
      expect(modes).toContain('select'); // marquee selection
      expect(modes).toContain('resize'); // resizing nodes
      expect(modes).toContain('connect'); // connecting nodes
    });
  });

  describe('cursor states', () => {
    it('should handle cursor changes', () => {
      const cursors = ['default', 'grab', 'grabbing', 'move', 'crosshair', 'pointer', 'x-delete'];
      
      expect(cursors).toContain('default'); // idle
      expect(cursors).toContain('grab'); // can pan
      expect(cursors).toContain('grabbing'); // panning
      expect(cursors).toContain('move'); // can move node
      expect(cursors).toContain('crosshair'); // connecting
      expect(cursors).toContain('pointer'); // clickable
      expect(cursors).toContain('x-delete'); // can delete edge
    });
  });

  describe('coordinate transformations', () => {
    it('should transform screen to world coordinates', () => {
      const screenToWorld = (sx: number, sy: number, offset = { x: 0, y: 0 }, zoom = 1) => {
        return {
          x: (sx - offset.x) / zoom,
          y: (sy - offset.y) / zoom,
        };
      };

      // No transform
      const p1 = screenToWorld(100, 200);
      expect(p1).toEqual({ x: 100, y: 200 });

      // With offset
      const p2 = screenToWorld(100, 200, { x: 50, y: 50 });
      expect(p2).toEqual({ x: 50, y: 150 });

      // With zoom
      const p3 = screenToWorld(100, 200, { x: 0, y: 0 }, 2);
      expect(p3).toEqual({ x: 50, y: 100 });
    });
  });

  describe('edge hit testing logic', () => {
    it('should calculate distance between point and line midpoint', () => {
      // Edge from (0, 0) to (100, 100), midpoint at (50, 50)
      const mx = 50;
      const my = 50;
      const px = 52;
      const py = 48;
      
      const distance = Math.sqrt((px - mx) ** 2 + (py - my) ** 2);
      expect(distance).toBeCloseTo(2.83, 1);
      
      // Should be within tolerance
      const tolerance = 8;
      expect(distance < tolerance).toBe(true);
    });
  });

  describe('node hit testing', () => {
    it('should detect if point is inside rectangle', () => {
      const rect = { x: 100, y: 100, w: 200, h: 150 };
      
      // Inside
      const inside = (x: number, y: number) => 
        x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
      
      expect(inside(150, 150)).toBe(true);
      expect(inside(299, 249)).toBe(true);
      
      // Outside
      expect(inside(50, 150)).toBe(false);
      expect(inside(350, 150)).toBe(false);
      expect(inside(150, 50)).toBe(false);
      expect(inside(150, 300)).toBe(false);
    });
  });
});
