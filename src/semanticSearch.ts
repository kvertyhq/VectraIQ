import { pipeline, env } from '@huggingface/transformers';

// @ts-ignore
env.allowLocalModels = false;
// @ts-ignore
env.useBrowserCache = false;
// @ts-ignore
env.backends.onnx.wasm.numThreads = 1;
let extractor: any = null;

export async function initModel(onProgress?: (progress: any) => void) {
  if (extractor) return extractor;

  try {
    extractor = await pipeline(
      'feature-extraction',
      'Xenova/all-MiniLM-L6-v2',
      { progress_callback: onProgress, device: 'webgpu', dtype: 'fp32' } as any
    );
    console.log('Model loaded on WebGPU.');
  } catch (e) {
    console.warn('WebGPU unavailable, falling back to CPU WASM.');
    try {
      extractor = await pipeline(
        'feature-extraction',
        'Xenova/all-MiniLM-L6-v2',
        { progress_callback: onProgress, dtype: 'fp32' } as any
      );
      console.log('Model loaded on CPU WASM.');
    } catch (fallbackErr) {
      extractor = null;
      console.error('Model load completely failed:', fallbackErr);
      throw new Error('Could not load embedding model. Please restart the app.');
    }
  }

  return extractor;
}

export async function getEmbedding(text: string): Promise<number[]> {
  if (!extractor) await initModel();
  const output = await extractor(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data as Float32Array);
}

export async function getEmbeddingBatch(texts: string[]): Promise<number[][]> {
  if (!texts.length) return [];
  if (!extractor) await initModel();

  const output = await extractor(texts, { pooling: 'mean', normalize: true });

  const batchSize = texts.length;
  const totalElements = (output.data as Float32Array).length;
  const embeddingSize = output.dims?.[1] ?? Math.floor(totalElements / batchSize);

  if (embeddingSize <= 0 || embeddingSize * batchSize !== totalElements) {
    console.error('Embedding shape mismatch:', { batchSize, totalElements, embeddingSize });
    throw new Error('Embedding batch shape invalid.');
  }

  const embeddings: number[][] = [];
  const data = output.data as Float32Array;

  for (let i = 0; i < batchSize; i++) {
    const start = i * embeddingSize;
    const end = start + embeddingSize;
    embeddings.push(Array.from(data.subarray(start, end)));
  }

  return embeddings;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    console.warn('cosineSimilarity: vector length mismatch', a.length, b.length);
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;

  return dotProduct / denom;
}

export interface ChunkInfo {
  pageNumber: number;
  text: string;
  embedding: number[];
}

let _documentChunks: ChunkInfo[] = [];

export function setDocumentChunks(chunks: ChunkInfo[]) {
  _documentChunks = chunks;
}

export function getDocumentChunks(): ChunkInfo[] {
  return _documentChunks;
}

export function clearDocumentChunks() {
  _documentChunks = [];
}

export async function searchDocument(query: string, topK: number = 5): Promise<ChunkInfo[]> {
  console.log('_documentChunks length:', _documentChunks.length)
  if (_documentChunks.length === 0) return [];

  const queryEmbedding = await getEmbedding(query);
  console.log('Query embedding length:', queryEmbedding.length)

  const scoredChunks = _documentChunks.map((chunk) => ({
    ...chunk,
    score: cosineSimilarity(queryEmbedding, chunk.embedding),
  }));

  scoredChunks.sort((a, b) => b.score - a.score);
  console.log('Top result score:', scoredChunks[0]?.score)
  return scoredChunks.slice(0, topK);
}