import { pipeline, env } from '@xenova/transformers';

// Tell transformers to use the browser cache
env.allowLocalModels = false;
env.useBrowserCache = true;

// Optimize WASM threads for Apple Silicon
if (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) {
  // @ts-ignore
  env.backends.onnx.wasm.numThreads = Math.max(1, navigator.hardwareConcurrency - 1);
}

let extractor: any = null;

export async function initModel(onProgress?: (progress: any) => void) {
  if (!extractor) {
    try {
      // Attempt to load with WebGPU hardware acceleration
      extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
        progress_callback: onProgress,
        // @ts-ignore - WebGPU device option might not exist in older TS typings
        device: 'webgpu',
        dtype: 'fp32'
      });
      console.log("Transformers.js initialized with WebGPU.");
    } catch (e) {
      console.warn('WebGPU not supported or failed, falling back to CPU (WASM).', e);
      extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
        progress_callback: onProgress
      });
    }
  }
  return extractor;
}

export async function getEmbedding(text: string): Promise<number[]> {
  if (!extractor) await initModel();
  const output = await extractor(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

export async function getEmbeddingBatch(texts: string[]): Promise<number[][]> {
  if (!texts.length) return [];
  if (!extractor) await initModel();
  
  // Transformers.js natively supports batching when passed an array of strings
  const output = await extractor(texts, { pooling: 'mean', normalize: true });
  
  const batchSize = texts.length;
  const embeddingSize = output.dims[1];
  const embeddings: number[][] = [];
  const data = output.data;
  
  for (let i = 0; i < batchSize; i++) {
    const start = i * embeddingSize;
    const end = start + embeddingSize;
    embeddings.push(Array.from(data.subarray(start, end)));
  }
  
  return embeddings;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export interface ChunkInfo {
  pageNumber: number;
  text: string;
  embedding: number[];
}

// Global cache for the current document
export let documentChunks: ChunkInfo[] = [];

export function setDocumentChunks(chunks: ChunkInfo[]) {
  documentChunks = chunks;
}

export async function searchDocument(query: string, topK: number = 5): Promise<ChunkInfo[]> {
  if (documentChunks.length === 0) return [];
  const queryEmbedding = await getEmbedding(query);
  
  const scoredChunks = documentChunks.map(chunk => ({
    ...chunk,
    score: cosineSimilarity(queryEmbedding, chunk.embedding)
  }));
  
  scoredChunks.sort((a, b) => b.score - a.score);
  return scoredChunks.slice(0, topK);
}
