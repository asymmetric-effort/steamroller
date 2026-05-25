import { add, subtract } from './small-module.js';

export class Calculator {
  constructor(initial = 0) {
    this.value = initial;
  }

  add(n) { this.value = add(this.value, n); return this; }
  subtract(n) { this.value = subtract(this.value, n); return this; }
  multiply(n) { this.value *= n; return this; }
  divide(n) { if (n !== 0) this.value /= n; return this; }
  reset() { this.value = 0; return this; }
  getResult() { return this.value; }
}

export const createCalculator = (initial) => new Calculator(initial);

export const sum = (numbers) => {
  let result = 0;
  for (let i = 0; i < numbers.length; i++) {
    result = add(result, numbers[i]);
  }
  return result;
};

export const average = (numbers) => {
  if (numbers.length === 0) return 0;
  return sum(numbers) / numbers.length;
};
