import { defineConfig } from 'vitest/config';
export default defineConfig({test:{environment:'node',include:['artifacts/full-finalization/ocorrencia-regression.test.ts'],fileParallelism:false,testTimeout:15000}});
