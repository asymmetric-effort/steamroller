import { createCalculator, sum, average } from './medium-module.js';

export const fibonacci = (n) => {
  if (n <= 1) return n;
  let a = 0, b = 1;
  for (let i = 2; i <= n; i++) {
    const temp = b;
    b = a + b;
    a = temp;
  }
  return b;
};

export const factorial = (n) => {
  let result = 1;
  for (let i = 2; i <= n; i++) {
    result *= i;
  }
  return result;
};

export const isPrime = (n) => {
  if (n < 2) return false;
  if (n === 2) return true;
  if (n % 2 === 0) return false;
  for (let i = 3; i * i <= n; i += 2) {
    if (n % i === 0) return false;
  }
  return true;
};

export const quickSort = (arr) => {
  const stack = [[0, arr.length - 1]];
  while (stack.length > 0) {
    const [low, high] = stack.pop();
    if (low >= high) continue;
    const pivot = arr[high];
    let i = low - 1;
    for (let j = low; j < high; j++) {
      if (arr[j] <= pivot) {
        i++;
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
    }
    [arr[i + 1], arr[high]] = [arr[high], arr[i + 1]];
    const pi = i + 1;
    stack.push([low, pi - 1]);
    stack.push([pi + 1, high]);
  }
  return arr;
};

export const deepClone = (obj) => {
  if (obj === null || typeof obj !== 'object') return obj;
  const stack = [{ source: obj, target: Array.isArray(obj) ? [] : {} }];
  const root = stack[0].target;
  while (stack.length > 0) {
    const { source, target } = stack.pop();
    for (const key of Object.keys(source)) {
      const val = source[key];
      if (val !== null && typeof val === 'object') {
        const child = Array.isArray(val) ? [] : {};
        target[key] = child;
        stack.push({ source: val, target: child });
      } else {
        target[key] = val;
      }
    }
  }
  return root;
};

export const mathUtils = {
  fibonacci,
  factorial,
  isPrime,
  createCalculator,
  sum,
  average,
  quickSort,
  deepClone,
};
