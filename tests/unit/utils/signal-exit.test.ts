import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  onExit,
  _resetForTesting,
  type ExitCallback,
} from '../../../src/utils/signal-exit.js';

describe('signal-exit', () => {
  /** Spies for process.on / process.removeListener / process.kill */
  const processOnSpy = vi.spyOn(process, 'on');
  const processRemoveListenerSpy = vi.spyOn(process, 'removeListener');
  const processKillSpy = vi
    .spyOn(process, 'kill')
    .mockImplementation(() => true);

  beforeEach(() => {
    _resetForTesting();
    processOnSpy.mockClear();
    processRemoveListenerSpy.mockClear();
    processKillSpy.mockClear();
  });

  afterEach(() => {
    _resetForTesting();
  });

  // ── Registration ───────────────────────────────────────────────

  describe('onExit', () => {
    it('should register a callback and install process listeners', () => {
      const cb: ExitCallback = vi.fn();
      onExit(cb);

      // Should have registered exit + 3 signals = 4 calls
      const eventNames = processOnSpy.mock.calls.map((c) => c[0]);
      expect(eventNames).toContain('exit');
      expect(eventNames).toContain('SIGINT');
      expect(eventNames).toContain('SIGTERM');
      expect(eventNames).toContain('SIGHUP');
    });

    it('should return an unregister function', () => {
      const cb: ExitCallback = vi.fn();
      const unregister = onExit(cb);
      expect(typeof unregister).toBe('function');
    });

    it('should install listeners only once for multiple registrations', () => {
      const cb1: ExitCallback = vi.fn();
      const cb2: ExitCallback = vi.fn();
      onExit(cb1);
      const countAfterFirst = processOnSpy.mock.calls.length;
      onExit(cb2);
      // No additional process.on calls after second registration
      expect(processOnSpy.mock.calls.length).toBe(countAfterFirst);
    });
  });

  // ── Unregister ─────────────────────────────────────────────────

  describe('unregister', () => {
    it('should remove the callback so it does not fire on exit', () => {
      const cb: ExitCallback = vi.fn();
      const unregister = onExit(cb);
      unregister();

      // Simulate exit event
      const exitHandler = processOnSpy.mock.calls.find(
        (c) => c[0] === 'exit',
      )?.[1] as ((code: number) => void) | undefined;
      expect(exitHandler).toBeDefined();
      exitHandler!(0);

      expect(cb).not.toHaveBeenCalled();
    });

    it('should be safe to call unregister multiple times', () => {
      const cb: ExitCallback = vi.fn();
      const unregister = onExit(cb);
      unregister();
      // Second call should not throw
      expect(() => unregister()).not.toThrow();
    });
  });

  // ── Process exit event ─────────────────────────────────────────

  describe('process exit event', () => {
    it('should call the callback with (code, null) on exit', () => {
      const cb: ExitCallback = vi.fn();
      onExit(cb);

      const exitHandler = processOnSpy.mock.calls.find(
        (c) => c[0] === 'exit',
      )?.[1] as (code: number) => void;
      exitHandler(42);

      expect(cb).toHaveBeenCalledOnce();
      expect(cb).toHaveBeenCalledWith(42, null);
    });

    it('should pass code 0 for normal exit', () => {
      const cb: ExitCallback = vi.fn();
      onExit(cb);

      const exitHandler = processOnSpy.mock.calls.find(
        (c) => c[0] === 'exit',
      )?.[1] as (code: number) => void;
      exitHandler(0);

      expect(cb).toHaveBeenCalledWith(0, null);
    });
  });

  // ── Exactly-once guarantee ─────────────────────────────────────

  describe('exactly-once execution', () => {
    it('should run callbacks only once even if exit fires twice', () => {
      const cb: ExitCallback = vi.fn();
      onExit(cb);

      const exitHandler = processOnSpy.mock.calls.find(
        (c) => c[0] === 'exit',
      )?.[1] as (code: number) => void;

      exitHandler(0);
      exitHandler(1);

      expect(cb).toHaveBeenCalledOnce();
    });

    it('should not run callbacks if signal fires after exit', () => {
      const cb: ExitCallback = vi.fn();
      onExit(cb);

      const exitHandler = processOnSpy.mock.calls.find(
        (c) => c[0] === 'exit',
      )?.[1] as (code: number) => void;
      const sigHandler = processOnSpy.mock.calls.find(
        (c) => c[0] === 'SIGINT',
      )?.[1] as (signal: NodeJS.Signals) => void;

      exitHandler(0);
      sigHandler('SIGINT');

      expect(cb).toHaveBeenCalledOnce();
    });
  });

  // ── Multiple callbacks ─────────────────────────────────────────

  describe('multiple callbacks', () => {
    it('should fire all registered callbacks on exit', () => {
      const cb1: ExitCallback = vi.fn();
      const cb2: ExitCallback = vi.fn();
      const cb3: ExitCallback = vi.fn();
      onExit(cb1);
      onExit(cb2);
      onExit(cb3);

      const exitHandler = processOnSpy.mock.calls.find(
        (c) => c[0] === 'exit',
      )?.[1] as (code: number) => void;
      exitHandler(1);

      expect(cb1).toHaveBeenCalledOnce();
      expect(cb2).toHaveBeenCalledOnce();
      expect(cb3).toHaveBeenCalledOnce();
    });

    it('should not fire unregistered callbacks among multiple', () => {
      const cb1: ExitCallback = vi.fn();
      const cb2: ExitCallback = vi.fn();
      onExit(cb1);
      const unregister2 = onExit(cb2);
      unregister2();

      const exitHandler = processOnSpy.mock.calls.find(
        (c) => c[0] === 'exit',
      )?.[1] as (code: number) => void;
      exitHandler(0);

      expect(cb1).toHaveBeenCalledOnce();
      expect(cb2).not.toHaveBeenCalled();
    });
  });

  // ── Bounded callbacks ──────────────────────────────────────────

  describe('max callbacks bound', () => {
    it('should throw when exceeding 100 callbacks', () => {
      for (const _ of Array.from({ length: 100 })) {
        onExit(vi.fn());
      }

      expect(() => onExit(vi.fn())).toThrow(
        'signal-exit: maximum of 100 callbacks exceeded',
      );
    });

    it('should allow registering after unregistering when at limit', () => {
      const unregisters: Array<() => void> = [];
      for (const _ of Array.from({ length: 100 })) {
        unregisters.push(onExit(vi.fn()));
      }

      // Unregister one
      unregisters[0]();

      // Should now allow one more
      expect(() => onExit(vi.fn())).not.toThrow();
    });
  });

  // ── Signal handling ────────────────────────────────────────────

  describe('signal handling', () => {
    it('should call callback with (null, signal) on SIGINT', () => {
      const cb: ExitCallback = vi.fn();
      onExit(cb);

      const sigHandler = processOnSpy.mock.calls.find(
        (c) => c[0] === 'SIGINT',
      )?.[1] as (signal: NodeJS.Signals) => void;
      sigHandler('SIGINT');

      expect(cb).toHaveBeenCalledWith(null, 'SIGINT');
    });

    it('should call callback with (null, signal) on SIGTERM', () => {
      const cb: ExitCallback = vi.fn();
      onExit(cb);

      const sigHandler = processOnSpy.mock.calls.find(
        (c) => c[0] === 'SIGTERM',
      )?.[1] as (signal: NodeJS.Signals) => void;
      sigHandler('SIGTERM');

      expect(cb).toHaveBeenCalledWith(null, 'SIGTERM');
    });

    it('should call callback with (null, signal) on SIGHUP', () => {
      const cb: ExitCallback = vi.fn();
      onExit(cb);

      const sigHandler = processOnSpy.mock.calls.find(
        (c) => c[0] === 'SIGHUP',
      )?.[1] as (signal: NodeJS.Signals) => void;
      sigHandler('SIGHUP');

      expect(cb).toHaveBeenCalledWith(null, 'SIGHUP');
    });

    it('should remove its own listener and re-emit the signal', () => {
      const cb: ExitCallback = vi.fn();
      onExit(cb);

      const sigHandler = processOnSpy.mock.calls.find(
        (c) => c[0] === 'SIGTERM',
      )?.[1] as (signal: NodeJS.Signals) => void;
      sigHandler('SIGTERM');

      expect(processRemoveListenerSpy).toHaveBeenCalledWith(
        'SIGTERM',
        sigHandler,
      );
      expect(processKillSpy).toHaveBeenCalledWith(process.pid, 'SIGTERM');
    });
  });

  // ── _resetForTesting ───────────────────────────────────────────

  describe('_resetForTesting', () => {
    it('should clear state so new callbacks can be registered fresh', () => {
      const cb: ExitCallback = vi.fn();
      onExit(cb);

      // Trigger exit so cleanupDone = true
      const exitHandler = processOnSpy.mock.calls.find(
        (c) => c[0] === 'exit',
      )?.[1] as (code: number) => void;
      exitHandler(0);

      expect(cb).toHaveBeenCalledOnce();

      // Reset
      _resetForTesting();
      processOnSpy.mockClear();

      // Should be able to register and fire again
      const cb2: ExitCallback = vi.fn();
      onExit(cb2);

      const exitHandler2 = processOnSpy.mock.calls.find(
        (c) => c[0] === 'exit',
      )?.[1] as (code: number) => void;
      exitHandler2(0);

      expect(cb2).toHaveBeenCalledOnce();
    });

    it('should remove process listeners on reset', () => {
      onExit(vi.fn());
      processRemoveListenerSpy.mockClear();

      _resetForTesting();

      // Should remove exit + 3 signals = 4 removeListener calls
      const eventNames = processRemoveListenerSpy.mock.calls.map(
        (c) => c[0],
      );
      expect(eventNames).toContain('exit');
      expect(eventNames).toContain('SIGINT');
      expect(eventNames).toContain('SIGTERM');
      expect(eventNames).toContain('SIGHUP');
    });
  });
});
