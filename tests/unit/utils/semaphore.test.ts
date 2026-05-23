import { describe, it, expect } from 'vitest';
import { createSemaphore } from '../../../src/utils/semaphore.js';

describe('createSemaphore', () => {
  describe('validation', () => {
    it('throws for maxConcurrency of 0', () => {
      expect(() => createSemaphore(0)).toThrow(
        'maxConcurrency must be a positive integer, got 0',
      );
    });

    it('throws for negative maxConcurrency', () => {
      expect(() => createSemaphore(-1)).toThrow(
        'maxConcurrency must be a positive integer, got -1',
      );
    });

    it('throws for non-integer maxConcurrency', () => {
      expect(() => createSemaphore(1.5)).toThrow(
        'maxConcurrency must be a positive integer, got 1.5',
      );
    });

    it('throws for NaN maxConcurrency', () => {
      expect(() => createSemaphore(NaN)).toThrow(
        'maxConcurrency must be a positive integer, got NaN',
      );
    });
  });

  describe('acquire', () => {
    it('resolves immediately when slots are available', async () => {
      const sem = createSemaphore(2);
      await expect(sem.acquire()).resolves.toBeUndefined();
    });

    it('resolves immediately for multiple acquires within limit', async () => {
      const sem = createSemaphore(3);
      await sem.acquire();
      await sem.acquire();
      await expect(sem.acquire()).resolves.toBeUndefined();
    });

    it('blocks when all slots are taken', () => {
      const sem = createSemaphore(1);
      /* eslint-disable @typescript-eslint/no-floating-promises */
      sem.acquire(); // takes the slot
      /* eslint-enable @typescript-eslint/no-floating-promises */

      // Second acquire should not resolve yet
      const pending = sem.acquire();
      const resolved = { value: false };
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      pending.then(() => {
        resolved.value = true;
      });

      expect(resolved.value).toBe(false);
      expect(sem.pending).toBe(1);
    });
  });

  describe('release', () => {
    it('wakes the next waiting caller', async () => {
      const sem = createSemaphore(1);
      await sem.acquire();

      const order: number[] = [];

      const waiter = sem.acquire().then(() => {
        order.push(2);
      });

      order.push(1);
      sem.release();

      await waiter;
      expect(order).toEqual([1, 2]);
    });

    it('decrements current count when no waiters', async () => {
      const sem = createSemaphore(2);
      await sem.acquire();
      expect(sem.available).toBe(1);

      sem.release();
      expect(sem.available).toBe(2);
    });

    it('does not go below zero current count', () => {
      const sem = createSemaphore(1);
      // Release without acquiring — should clamp at 0
      sem.release();
      expect(sem.available).toBe(1);
    });
  });

  describe('pending and available', () => {
    it('reports correct available slots initially', () => {
      const sem = createSemaphore(3);
      expect(sem.available).toBe(3);
      expect(sem.pending).toBe(0);
    });

    it('decreases available after acquire', async () => {
      const sem = createSemaphore(3);
      await sem.acquire();
      expect(sem.available).toBe(2);
      expect(sem.pending).toBe(0);
    });

    it('tracks pending waiters correctly', async () => {
      const sem = createSemaphore(1);
      await sem.acquire();

      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      sem.acquire();
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      sem.acquire();

      expect(sem.pending).toBe(2);
      expect(sem.available).toBe(0);
    });
  });

  describe('concurrency enforcement', () => {
    it('enforces concurrency limit with multiple tasks', async () => {
      const sem = createSemaphore(3);
      const maxConcurrent = { value: 0 };
      const currentConcurrent = { value: 0 };
      const taskCount = 5;
      const completionOrder: number[] = [];

      const tasks = Array.from({ length: taskCount }, (_, i) => {
        return (async () => {
          await sem.acquire();
          currentConcurrent.value++;
          if (currentConcurrent.value > maxConcurrent.value) {
            maxConcurrent.value = currentConcurrent.value;
          }
          // Simulate async work
          await new Promise<void>((resolve) => {
            setTimeout(resolve, 10);
          });
          completionOrder.push(i);
          currentConcurrent.value--;
          sem.release();
        })();
      });

      await Promise.all(tasks);

      expect(maxConcurrent.value).toBeLessThanOrEqual(3);
      expect(completionOrder).toHaveLength(5);
    });

    it('processes waiters in FIFO order', async () => {
      const sem = createSemaphore(1);
      await sem.acquire();

      const order: number[] = [];

      const w1 = sem.acquire().then(() => {
        order.push(1);
        sem.release();
      });
      const w2 = sem.acquire().then(() => {
        order.push(2);
        sem.release();
      });
      const w3 = sem.acquire().then(() => {
        order.push(3);
        sem.release();
      });

      sem.release(); // wake first waiter

      await Promise.all([w1, w2, w3]);
      expect(order).toEqual([1, 2, 3]);
    });
  });
});
