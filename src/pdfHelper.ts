import { pdfjs } from 'react-pdf';
import { type ChunkInfo, getEmbeddingBatch } from './semanticSearch';

function chunkSentencesWithOverlap(text: string, maxChars: number = 600, overlapChars: number = 150): string[] {
  // Split by common sentence terminators or newlines but keep the terminator
  const sentences = text.match(/[^.!?\n]+[.!?\n]+/g) || [text];
  const chunks: string[] = [];
  let currentChunk = '';
  
  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i].trim().replace(/\s+/g, ' ');
    if (!sentence) continue;
    
    if (currentChunk.length + sentence.length > maxChars) {
      if (currentChunk.length > 50) chunks.push(currentChunk.trim());
      
      let overlapChunk = '';
      let j = i - 1;
      while (j >= 0 && overlapChunk.length < overlapChars) {
        overlapChunk = sentences[j].trim() + ' ' + overlapChunk;
        j--;
      }
      currentChunk = overlapChunk.trim() + ' ' + sentence;
    } else {
      currentChunk += (currentChunk ? ' ' : '') + sentence;
    }
  }
  if (currentChunk.length > 50) {
    chunks.push(currentChunk.trim());
  }
  // Deduplicate identical chunks just in case
  return Array.from(new Set(chunks));
}

export async function processPdfForSemanticSearch(pdfUrl: string, onProgress: (msg: string) => void): Promise<ChunkInfo[]> {
  onProgress('Loading PDF...');
  const loadingTask = pdfjs.getDocument(pdfUrl);
  const pdf = await loadingTask.promise;
  const numPages = pdf.numPages;
  const chunks: ChunkInfo[] = [];

  onProgress(`Extracting text from ${numPages} pages...`);
  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item: any) => item.str).join(' ');
    
    const pageChunks = chunkSentencesWithOverlap(pageText);
    for (const text of pageChunks) {
      chunks.push({ pageNumber: i, text, embedding: [] });
    }
  }

  // BATCH PROCESSING - drastically improves performance on MacOS
  const BATCH_SIZE = 16;
  onProgress(`Generating embeddings for ${chunks.length} chunks (Batched)...`);
  
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    onProgress(`Embedding batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(chunks.length / BATCH_SIZE)}...`);
    const batchChunks = chunks.slice(i, i + BATCH_SIZE);
    const texts = batchChunks.map(c => c.text);
    
    try {
      const embeddings = await getEmbeddingBatch(texts);
      for (let j = 0; j < batchChunks.length; j++) {
        batchChunks[j].embedding = embeddings[j];
      }
    } catch (err) {
      console.error("Batch embedding failed", err);
    }
  }

  onProgress('Indexing complete!');
  return chunks.filter(c => c.embedding && c.embedding.length > 0);
}
