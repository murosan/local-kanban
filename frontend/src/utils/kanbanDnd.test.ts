import { describe, expect, it } from 'vitest';
import { Column, Task } from '../types/task';
import {
  findColumnIdForItem,
  getTaskPosition,
  hasTaskPositionChanged,
  moveTaskInList,
  resolveCrossColumnInsertIndex,
} from './kanbanDnd';

const columns: Column[] = [
  { id: 'todo', name: 'Todo' },
  { id: 'doing', name: 'Doing' },
  { id: 'done', name: 'Done' },
];

const makeTask = (id: string, column_id: string): Task => ({
  id,
  title: id,
  column_id,
  rank: id,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
});

describe('kanbanDnd', () => {
  const baseTasks: Task[] = [
    makeTask('t1', 'todo'),
    makeTask('d1', 'doing'),
    makeTask('t2', 'todo'),
    makeTask('d2', 'doing'),
    makeTask('t3', 'todo'),
    makeTask('d3', 'doing'),
  ];

  describe('findColumnIdForItem', () => {
    it('returns column id when itemId matches a column', () => {
      expect(findColumnIdForItem('done', baseTasks, columns)).toBe('done');
    });

    it('returns task column_id when itemId matches a task', () => {
      expect(findColumnIdForItem('d2', baseTasks, columns)).toBe('doing');
    });

    it('returns undefined for unknown id', () => {
      expect(findColumnIdForItem('unknown', baseTasks, columns)).toBeUndefined();
    });
  });

  describe('moveTaskInList', () => {
    it('moves a task into another column between two tasks', () => {
      const moved = moveTaskInList(baseTasks, 't1', 'doing', 1);
      expect(moved.filter((t) => t.column_id === 'todo').map((t) => t.id)).toEqual(['t2', 't3']);
      expect(moved.filter((t) => t.column_id === 'doing').map((t) => t.id)).toEqual([
        'd1',
        't1',
        'd2',
        'd3',
      ]);
      expect(getTaskPosition(moved, 't1')).toEqual({
        columnId: 'doing',
        index: 1,
        prevId: 'd1',
        nextId: 'd2',
      });
    });

    it('moves a task to the top of another column', () => {
      const moved = moveTaskInList(baseTasks, 't2', 'doing', 0);
      expect(moved.filter((t) => t.column_id === 'doing').map((t) => t.id)).toEqual([
        't2',
        'd1',
        'd2',
        'd3',
      ]);
      expect(getTaskPosition(moved, 't2')).toEqual({
        columnId: 'doing',
        index: 0,
        prevId: '',
        nextId: 'd1',
      });
    });

    it('moves a task to the bottom of another column', () => {
      const moved = moveTaskInList(baseTasks, 't1', 'doing', 3);
      expect(moved.filter((t) => t.column_id === 'doing').map((t) => t.id)).toEqual([
        'd1',
        'd2',
        'd3',
        't1',
      ]);
      expect(getTaskPosition(moved, 't1')).toEqual({
        columnId: 'doing',
        index: 3,
        prevId: 'd3',
        nextId: '',
      });
    });

    it('moves a task into an empty column', () => {
      const moved = moveTaskInList(baseTasks, 't1', 'done', 0);
      expect(moved.filter((t) => t.column_id === 'done').map((t) => t.id)).toEqual(['t1']);
      expect(getTaskPosition(moved, 't1')).toEqual({
        columnId: 'done',
        index: 0,
        prevId: '',
        nextId: '',
      });
    });

    it('reorders a task within the same column down and up', () => {
      const movedDown = moveTaskInList(baseTasks, 't1', 'todo', 2);
      expect(movedDown.filter((t) => t.column_id === 'todo').map((t) => t.id)).toEqual([
        't2',
        't3',
        't1',
      ]);
      expect(movedDown.filter((t) => t.column_id === 'doing').map((t) => t.id)).toEqual([
        'd1',
        'd2',
        'd3',
      ]);

      const movedUp = moveTaskInList(baseTasks, 't3', 'todo', 0);
      expect(movedUp.filter((t) => t.column_id === 'todo').map((t) => t.id)).toEqual([
        't3',
        't1',
        't2',
      ]);
    });

    it('returns original array reference when moving to the exact same position', () => {
      const result = moveTaskInList(baseTasks, 't2', 'todo', 1);
      expect(result).toBe(baseTasks);
    });
  });

  describe('resolveCrossColumnInsertIndex', () => {
    const doingTasks = [makeTask('d1', 'doing'), makeTask('d2', 'doing'), makeTask('d3', 'doing')];

    it('inserts before over task when above its midpoint', () => {
      expect(
        resolveCrossColumnInsertIndex({
          overId: 'd2',
          overColumnTasks: doingTasks,
          isOverColumnContainer: false,
          isBelowOverItem: false,
        })
      ).toBe(1);
    });

    it('inserts after over task when below its midpoint', () => {
      expect(
        resolveCrossColumnInsertIndex({
          overId: 'd2',
          overColumnTasks: doingTasks,
          isOverColumnContainer: false,
          isBelowOverItem: true,
        })
      ).toBe(2);
    });

    it('inserts at 0 for empty column container', () => {
      expect(
        resolveCrossColumnInsertIndex({
          overId: 'done',
          overColumnTasks: [],
          isOverColumnContainer: true,
          isBelowOverItem: false,
        })
      ).toBe(0);
    });

    it('inserts at end for non-empty column container by default, or 0 when above items', () => {
      expect(
        resolveCrossColumnInsertIndex({
          overId: 'doing',
          overColumnTasks: doingTasks,
          isOverColumnContainer: true,
          isBelowOverItem: false,
        })
      ).toBe(3);

      expect(
        resolveCrossColumnInsertIndex({
          overId: 'doing',
          overColumnTasks: doingTasks,
          isOverColumnContainer: true,
          isBelowOverItem: false,
          isAboveColumnItems: true,
        })
      ).toBe(0);
    });
  });

  describe('hasTaskPositionChanged', () => {
    it('detects when a task returns to its original position after visiting another column', () => {
      const initialPos = getTaskPosition(baseTasks, 't2');
      const movedToDoing = moveTaskInList(baseTasks, 't2', 'doing', 1);
      expect(hasTaskPositionChanged(initialPos, getTaskPosition(movedToDoing, 't2'))).toBe(true);

      const movedBack = moveTaskInList(movedToDoing, 't2', 'todo', 1);
      expect(hasTaskPositionChanged(initialPos, getTaskPosition(movedBack, 't2'))).toBe(false);
    });

    it('detects when a task returns to the same column at a different position', () => {
      const initialPos = getTaskPosition(baseTasks, 't2');
      const movedToDoing = moveTaskInList(baseTasks, 't2', 'doing', 1);
      const movedBackDifferentIndex = moveTaskInList(movedToDoing, 't2', 'todo', 0);
      expect(
        hasTaskPositionChanged(initialPos, getTaskPosition(movedBackDifferentIndex, 't2'))
      ).toBe(true);
    });
  });
});
