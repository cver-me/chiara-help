/*
  Audio Transcription Processor
  This pub/sub function is triggered when a message is published to the "audio-transcription-jobs" topic.
  It handles the audio transcription process with optimized performance:
  1. Retrieves the audio file from Storage.
  2. For files under 25MB: Transcribes directly using the DeepInfra (Whisper) API, auto-detecting the language.
  3. For larger files (> 25MB):
     - Intelligently splits audio into optimal-sized chunks (~25MB) with overlap (10 seconds).
     - Transcribes each chunk using the DeepInfra (Whisper) API (auto-detecting language).
     - Merges transcriptions by identifying and handling text overlap between chunks.
  4. Enhances the merged transcription using Google Gemini API with a structured prompt to generate lecture notes.
  5. Saves the final lecture notes as a Markdown file to Firebase Storage.
  6. Updates the corresponding Firestore document with the status, path to the notes, and metadata.
*/

/* global process */
import { onMessagePublished } from "firebase-functions/v2/pubsub";
import { getStorage } from "firebase-admin/storage";
import { getFirestore } from "firebase-admin/firestore";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import ffmpeg from "fluent-ffmpeg";
import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";
import fs from "fs";
import { createReadStream } from "fs";
import {
  initLangfuse,
  createTrace,
  tracedGenerativeAI,
  tracedGenerativeAIChunked,
  tracedWhisperTranscription,
  flushTraces,
} from "../../utils/observability.js";

dotenv.config();

// Initialize DeepInfra client for transcription
const deepinfraClient = new OpenAI({
  apiKey: process.env.DEEPINFRA_API_KEY,
  baseURL: "https://api.deepinfra.com/v1/openai",
});

// Initialize Google Gemini API client for enhancement
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Check for required API keys
if (!process.env.DEEPINFRA_API_KEY) {
  throw new Error("DEEPINFRA_API_KEY environment variable is required");
}

if (!process.env.GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY environment variable is required");
}

// Constants
const MAX_TEXT_CHUNK_SIZE = 20000; // For Gemini's 8K token OUTPUT limit (~4K tokens for response)
const OVERLAP_SIZE = 500; // overlap between text chunks
const AUDIO_CHUNK_OVERLAP_SEC = 10; // 10 seconds overlap
const MAX_DIRECT_PROCESSING_SIZE = 25 * 1024 * 1024; // 25MB - safe limit for direct processing

// Helper: Split text into chunks for processing (for Groq enhancement)
/**
 * Splits the provided text into chunks for processing with overlap.
 * @param {string} text - The input text.
 * @returns {string[]} Array of text chunks.
 */
const splitTextIntoChunks = (text) => {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = start + MAX_TEXT_CHUNK_SIZE;
    if (end < text.length) {
      // Extend back by an overlap to maintain context
      end = Math.min(text.length, end + OVERLAP_SIZE);
    }
    chunks.push(text.slice(start, end));
    start += MAX_TEXT_CHUNK_SIZE;
  }
  return chunks;
};

// Helper: Enhance transcription using Groq-like processing
/**
 * Enhances the transcription text using a Groq-like API simulation.
 * @param {string} text - Raw transcription text.
 * @param {string} courseId - ID of the course.
 * @param {string} language - Language of the transcription.
 * @returns {Promise<string>} Enhanced lecture notes in markdown format.
 */
const enhanceTranscription = async (
  singleTextChunk,
  courseId,
  language,
  parentTrace,
  userId,
  docId,
  model,
  chunkMetadata = {}
) => {
  try {
    console.log(
      "DEBUG: Enhancing single text chunk with Gemini, input length:",
      singleTextChunk.length
    );

    const prompt = `Sei un assistente che trasforma trascrizioni di lezioni universitarie in appunti ben organizzati e fedeli al contenuto.
    
      **Regole Fondamentali:**
    
      * **Conservazione del contenuto tecnico:** Mantieni TUTTO il contenuto tecnico e scientifico della trascrizione, senza sintetizzarlo o abbreviarlo. L'obiettivo è organizzare e pulire il testo, non riassumerlo. Se sono presenti esempi che possono aiutare lo studente a comprendere l'argomento, mantienili. Se non c'è contenuto tecnico o scientifico, DEVI RESTITUIRE UNA STRINGA VUOTA - NON SCRIVERE MESSAGGI DI SCUSE O SPIEGAZIONI.
      
      * **Pertinenza - Contenuti da rimuovere SEMPRE:**
        1. ELIMINA SEMPRE qualsiasi riferimento a:
           - Docenti e loro organizzazione (nomi, sostituzioni, impegni)
           - Introduzioni non tecniche ("oggi parleremo di...")
           - Riferimenti temporali ("nella lezione odierna...")
           - Organizzazione della lezione
        2. Inizia SEMPRE direttamente con il titolo dell'argomento e il contenuto tecnico
        3. MANTIENI la completezza delle informazioni tecniche e scientifiche
      
      * **Correzione:** Correggi errori grammaticali, ortografici e concettuali causati da trascrizioni automatiche, rendendo il testo chiaro, accurato e leggibile.
      
      * **Fedeltà al contenuto:** Non introdurre informazioni non presenti nella trascrizione. Non semplificare eccessivamente o aggiungere dettagli estranei.
      
      * **Organizzazione:** Organizza il testo in paragrafi chiari e strutturati, con titoli coerenti e attinenti agli argomenti trattati. Se necessario, usa bullet point o elenchi.
      
      * **Incertezze:** Evidenzia eventuali parti incomplete o ambigue con [??], senza mai aggiungere informazioni inventate o dedotte.
      
      * **Formattazione:**
        * Usa # per titoli principali di sezione
        * Usa ## per sottosezioni e argomenti correlati
        * Evidenzia concetti chiave in **grassetto**
        * Usa *corsivo* per terminologia tecnica specialistica
        * Utilizza elenchi puntati per serie di elementi correlati
        * Mantieni la spaziatura tra paragrafi per una migliore leggibilità
        * Per espressioni matematiche:
          * Usa $...$ per formule inline (es: $E = mc^2$)
          * Usa $$...$$ per formule su riga separata, esempio:
            $$E = mc^2$$
          * NON usare \\(...\\) o \\[...\\] per le formule
        * **Grafici/Diagrammi:** Inserisci [Grafico: breve descrizione del contenuto]
        * **Citazioni:** Conserva riferimenti ad autori e anni se menzionati
        * **Dati numerici:** Mantieni unità di misura e valori originali
        * **Terminologia tecnica:** Preserva i termini specialistici senza semplificazioni
        * **IMPORTANTE:** NON racchiudere il testo in blocchi di codice (\`\`\`). Il testo deve essere formattato direttamente in markdown.
    
      **Gestione Casi Particolari:**
      * Segnala audio non chiaro o parti incomprensibili con [Audio poco chiaro]
      * Marca concetti potenzialmente errati con [Verificare: descrizione del dubbio]
      * Per digressioni rilevanti usa la notazione [Nota: contenuto pertinente]
      * In caso di riferimenti a materiale visivo non trascritto, indica [Riferimento a materiale visivo]
      
      **Esempi pratici:**
      
      1. **Esempio di inizio corretto:**
         * Input: "La lezione viene condotta dalla dott.ssa Aragona. Oggi parleremo del sistema nervoso, che è fondamentale per il nostro organismo..."
         * Output:
         # Il Sistema Nervoso
    
         Il sistema nervoso è un sistema fondamentale per l'organismo...
      
      2. **Correzione errore concettuale:**
         * Input: "I neutroni, essendo particelle cariche negativamente, ruotano attorno al nucleo dell'atomo."
         * Output: "Gli elettroni, essendo particelle cariche negativamente, ruotano attorno al nucleo dell'atomo."
      
      3. **Gestione contenuti speciali:**
         * Input: "Come potete vedere da questa immagine, il grafico mostra l'andamento della reazione nel tempo, con K che vale 3,5 mol/secondo secondo l'equazione di Arrhenius che abbiamo visto..."
         * Output:
         "[Grafico: andamento temporale della reazione]
    
         La costante cinetica *K* = 3,5 mol/s, secondo l'*equazione di Arrhenius* precedentemente discussa..."
    
      4. **Esempio di contenuto non tecnico:**
         * Input: "Buongiorno ragazzi, oggi sostituisco il professor Rossi che è malato. Prima di iniziare volevo dirvi che la prossima settimana..."
         * Output: "" (stringa vuota - il testo non contiene contenuto tecnico)
         * Spiegazione: Questo esempio mostra come gestire testo senza contenuto tecnico. In questi casi, restituisci una stringa vuota senza alcun messaggio aggiuntivo.
    
      **Ricorda:**
      * Mantieni sempre la precisione scientifica del contenuto
      * Non alterare il significato delle spiegazioni
      * Preserva la complessità originale degli argomenti
      * Segnala sempre eventuali ambiguità o incertezze
      * Organizza il contenuto in modo logico e sequenziale
      * Se non c'è materiale utile a creare appunti per la lezione, non scrivere niente. Non dire "Mi dispiace, ma il testo fornito non contiene contenuti tecnici o scientifici..."
      
      * L'OUTPUT DEVE ESSERE IN LINGUA ${language === "en" ? "Inglese" : "Italiana"}

      TRASCRIZIONE:
      ${singleTextChunk}`;

    console.log("DEBUG: Calling tracedGenerativeAI for enhancement");

    const result = await tracedGenerativeAI({
      model,
      prompt,
      functionName: "audioEnhancement",
      userId,
      documentId: docId,
      metadata: {
        courseId,
        language,
        ...chunkMetadata,
      },
      parentTrace,
    });

    console.log("DEBUG: Gemini enhancement response received for chunk:", {
      response_length: result.text.length,
      traceId: result.traceId,
    });

    return result.text;
  } catch (error) {
    console.error("Error enhancing single text chunk:", {
      error_name: error.name,
      error_message: error.message,
      error_stack: error.stack,
    });
    throw error;
  }
};

/**
 * Get audio duration using ffprobe
 * @param {string} filePath - Path to the audio file
 * @returns {Promise<number>} Audio duration in seconds
 */
const getAudioDuration = (filePath) => {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        return reject(
          new Error(`Failed to get audio duration: ${err.message}`)
        );
      }

      const duration = metadata.format.duration;
      if (!duration || duration === "N/A") {
        console.warn(
          `DEBUG: Could not determine audio duration for ${filePath}. Using estimated duration.`
        );
        // Estimate duration based on file size and bit rate
        const fileSize = metadata.format.size || fs.statSync(filePath).size;
        const estimatedDuration = fileSize / (16 * 1024); // Assuming 16KB/s for 128kbps audio
        return resolve(estimatedDuration);
      }

      resolve(parseFloat(duration));
    });
  });
};

/**
 * Split audio into chunks ensuring each chunk is under the size limit
 * @param {string} audioPath - Path to audio file
 * @param {number} fileSize - Size of the file in bytes
 * @param {number} durationSec - Duration of the audio in seconds
 * @param {number} overlapSec - Overlap between chunks in seconds
 * @returns {Promise<Array>} Array of objects with chunk paths and start times
 */
const createAudioChunks = async (
  audioPath,
  fileSize,
  durationSec,
  overlapSec = AUDIO_CHUNK_OVERLAP_SEC
) => {
  console.log(
    `DEBUG: Creating audio chunks with size limit of ${(MAX_DIRECT_PROCESSING_SIZE / (1024 * 1024)).toFixed(2)}MB`
  );

  // Calculate how many chunks we need based on size
  // Add a 15% safety margin for request overhead
  const adjustedMaxChunkSize = MAX_DIRECT_PROCESSING_SIZE * 0.85;
  const minChunkCount = Math.ceil(fileSize / adjustedMaxChunkSize);

  // Calculate chunk duration based on file size to ensure chunks are within limit
  const chunkLengthSec = Math.floor(durationSec / minChunkCount);
  console.log(
    `DEBUG: Size-based chunking: ${minChunkCount} chunks of ~${chunkLengthSec}s each to stay under ${(adjustedMaxChunkSize / (1024 * 1024)).toFixed(2)}MB per chunk`
  );

  // Calculate number of chunks with overlap
  const effectiveChunkLength = chunkLengthSec - overlapSec;
  const chunkCount = Math.ceil(durationSec / effectiveChunkLength);
  console.log(`DEBUG: With overlap: Will create ${chunkCount} chunks`);

  const chunkPaths = [];

  // Create each chunk with FFmpeg
  for (let i = 0; i < chunkCount; i++) {
    const startSec = i * effectiveChunkLength;
    const durationToExtract = Math.min(chunkLengthSec, durationSec - startSec);
    const outputPath = `/tmp/chunk-${i + 1}-${uuidv4()}.mp3`;

    console.log(
      `DEBUG: Processing chunk ${i + 1}/${chunkCount} (${startSec.toFixed(2)}s to ${(startSec + durationToExtract).toFixed(2)}s)`
    );

    await new Promise((resolve, reject) => {
      ffmpeg(audioPath)
        .setStartTime(startSec)
        .setDuration(durationToExtract)
        .outputOptions(["-c:a", "copy"]) // Fast copy without re-encoding
        .on("end", () => {
          resolve();
        })
        .on("error", (err) => {
          console.error(
            `DEBUG: Error processing chunk ${i + 1}: ${err.message}`
          );
          reject(err);
        })
        .save(outputPath);
    });

    // Verify chunk size is within limit
    const chunkStats = fs.statSync(outputPath);
    const chunkSize = chunkStats.size;
    console.log(
      `DEBUG: Chunk ${i + 1} size: ${(chunkSize / (1024 * 1024)).toFixed(2)}MB`
    );

    if (chunkSize > MAX_DIRECT_PROCESSING_SIZE) {
      console.warn(
        `WARNING: Chunk ${i + 1} exceeds size limit (${(chunkSize / (1024 * 1024)).toFixed(2)}MB > ${(MAX_DIRECT_PROCESSING_SIZE / (1024 * 1024)).toFixed(2)}MB)`
      );

      // Try to re-encode at a lower bitrate to reduce file size
      console.log(
        `DEBUG: Attempting to reduce file size with re-encoding for chunk ${i + 1}`
      );
      const reEncodedPath = `${outputPath}.reduced.mp3`;

      await new Promise((resolve, reject) => {
        ffmpeg(outputPath)
          .audioCodec("libmp3lame")
          .audioBitrate("24k")
          .audioFrequency(16000)
          .audioChannels(1)
          .on("end", () => {
            console.log(`DEBUG: Successfully re-encoded chunk ${i + 1}`);
            resolve();
          })
          .on("error", (err) => {
            console.error(
              `DEBUG: Error re-encoding chunk ${i + 1}: ${err.message}`
            );
            reject(err);
          })
          .save(reEncodedPath);
      });

      // Check if re-encoding helped
      const reEncodedStats = fs.statSync(reEncodedPath);
      const reEncodedSize = reEncodedStats.size;
      console.log(
        `DEBUG: Re-encoded chunk ${i + 1} size: ${(reEncodedSize / (1024 * 1024)).toFixed(2)}MB`
      );

      // Delete the original chunk file
      fs.unlinkSync(outputPath);

      // Use the re-encoded file instead
      chunkPaths.push({
        path: reEncodedPath,
        startTime: startSec * 1000,
        index: i,
        size: reEncodedSize,
        durationSeconds: durationToExtract,
      });
    } else {
      chunkPaths.push({
        path: outputPath,
        startTime: startSec * 1000,
        index: i,
        size: chunkSize,
        durationSeconds: durationToExtract,
      });
    }
  }

  return chunkPaths;
};

/**
 * Transcribe a single audio file using Groq API
 * @param {string} filePath - Path to the audio file
 * @param {string} language - Language code
 * @returns {Promise<Object>} Transcription result
 */
const transcribeFile = async (
  filePath,
  language,
  parentTrace,
  userId,
  docId,
  functionNameSuffix,
  audioDurationSeconds
) => {
  console.log(`DEBUG: Transcribing file: ${filePath}`);

  try {
    // Check file size before transcribing
    const fileStats = fs.statSync(filePath);
    const fileSize = fileStats.size;
    const fileSizeMB = (fileSize / (1024 * 1024)).toFixed(2);

    if (fileSize > MAX_DIRECT_PROCESSING_SIZE) {
      throw new Error(
        `File too large for transcription: ${fileSizeMB}MB > ${(MAX_DIRECT_PROCESSING_SIZE / (1024 * 1024)).toFixed(2)}MB limit`
      );
    }

    // Create read stream from file
    const fileStream = createReadStream(filePath);

    // Prepare API call with detailed logging
    console.log("DEBUG: Calling DeepInfra transcription API with params:", {
      model: "openai/whisper-large-v3-turbo",
      language,
      file_size: fileSizeMB + "MB",
    });

    const whisperResponse = await tracedWhisperTranscription({
      deepinfraClient,
      fileStream,
      language,
      functionName: `whisperTranscription-${functionNameSuffix}`,
      userId,
      documentId: docId,
      metadata: {
        fileInfo: {
          fileName: filePath.split("/").pop(),
          fileSizeMB: parseFloat(fileSizeMB),
        },
        sourceFileSize: fileSize, // original bytes
        audioDurationSeconds, // Pass duration here
      },
      parentTrace,
    });

    console.log("DEBUG: Transcription response received:", {
      text_preview: whisperResponse.text.substring(0, 100) + "...",
      text_length: whisperResponse.text.length,
      segments: whisperResponse.segments
        ? whisperResponse.segments.length
        : "No segments",
    });

    return whisperResponse; // contains { text, segments, traceId, generationId }
  } catch (error) {
    console.error("Error transcribing file:", {
      error_name: error.name,
      error_message: error.message,
      error_type: error.type,
      error_status: error.status,
      error_code: error.code,
      cause: error.cause ? JSON.stringify(error.cause) : "No cause details",
      stack: error.stack,
    });
    throw error;
  }
};

/**
 * Find the longest common subsequence between two strings
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {string} Longest common subsequence
 */
const findLongestCommonSubsequence = (str1, str2) => {
  if (!str1 || !str2) return "";

  // Tokenize into words for better matching
  const words1 = str1.split(/\s+/);
  const words2 = str2.split(/\s+/);

  // Build LCS matrix
  const matrix = Array(words1.length + 1)
    .fill()
    .map(() => Array(words2.length + 1).fill(0));

  // Fill the matrix
  for (let i = 1; i <= words1.length; i++) {
    for (let j = 1; j <= words2.length; j++) {
      if (words1[i - 1] === words2[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1] + 1;
      } else {
        matrix[i][j] = Math.max(matrix[i - 1][j], matrix[i][j - 1]);
      }
    }
  }

  // Reconstruct the LCS
  const lcs = [];
  let i = words1.length,
    j = words2.length;

  while (i > 0 && j > 0) {
    if (words1[i - 1] === words2[j - 1]) {
      lcs.unshift(words1[i - 1]);
      i--;
      j--;
    } else if (matrix[i - 1][j] > matrix[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return lcs.join(" ");
};

/**
 * Merge transcriptions from multiple chunks with overlap handling
 * @param {Array} results - Array of transcription results with start times
 * @returns {string} Merged transcription
 */
const mergeTranscriptions = (results) => {
  console.log("DEBUG: Merging transcriptions from chunks");

  if (results.length === 1) {
    return results[0].result.text;
  }

  // Sort results by start time to ensure correct order
  results.sort((a, b) => a.startTime - b.startTime);

  let mergedText = "";

  for (let i = 0; i < results.length; i++) {
    const currentChunk = results[i].result.text;

    if (i === 0) {
      // For the first chunk, take it all
      mergedText = currentChunk;
    } else {
      // For subsequent chunks, find overlap with previous text and merge
      const prevText = mergedText;

      // Take the last part of previous text (enough to find overlap)
      const prevChunkEnd = prevText.slice(-1000); // Take last 1000 chars as potential overlap

      // Take the beginning of current chunk
      const currentChunkStart = currentChunk.slice(0, 1000); // Take first 1000 chars

      // Find the longest common subsequence as the overlap
      const overlap = findLongestCommonSubsequence(
        prevChunkEnd,
        currentChunkStart
      );

      if (overlap && overlap.length > 10) {
        // Only consider meaningful overlaps
        console.log(
          `DEBUG: Found overlap between chunks ${i - 1} and ${i}: "${overlap.substring(0, 30)}..."`
        );

        // Find the position of overlap in previous text
        const overlapPosInPrev = prevText.lastIndexOf(overlap);

        // Find the position of overlap in current text
        const overlapPosInCurrent = currentChunk.indexOf(overlap);

        // Merge by taking previous text up to overlap, then the overlap,
        // then the rest of current text after the overlap
        if (overlapPosInPrev !== -1 && overlapPosInCurrent !== -1) {
          mergedText =
            prevText.substring(0, overlapPosInPrev) +
            currentChunk.substring(overlapPosInCurrent);
        } else {
          // Fallback if overlap positions can't be found
          mergedText = prevText + " " + currentChunk;
        }
      } else {
        // If no significant overlap found, just concatenate with a space
        mergedText = prevText + " " + currentChunk;
      }
    }
  }

  return mergedText;
};

/**
 * Process audio through the optimized pipeline: download, chunk if needed, transcribe, merge
 * @param {string} storagePath - Path to audio file in storage
 * @param {string} userId - User ID
 * @param {string} docId - Document ID
 * @param {string} language - Language code
 * @returns {Promise<string>} Final transcription text
 */
const processAudioOptimized = async (
  storagePath,
  userId,
  docId,
  language,
  courseId,
  parentTrace
) => {
  console.log(`DEBUG: Starting optimized audio processing for ${storagePath}`);

  try {
    const storage = getStorage().bucket();
    const tempDir = `/tmp/${docId}`;

    // Create temp directory if it doesn't exist
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Download the original file
    const localFilePath = `${tempDir}/original.mp3`;
    await storage.file(storagePath).download({ destination: localFilePath });

    try {
      // Check file size to determine processing approach
      const fileStats = fs.statSync(localFilePath);
      const fileSize = fileStats.size;
      console.log(
        `DEBUG: File size: ${fileSize} bytes (${(fileSize / (1024 * 1024)).toFixed(2)}MB)`
      );

      let transcription;

      // If the file is small enough, process it directly without chunking
      if (fileSize <= MAX_DIRECT_PROCESSING_SIZE) {
        console.log(`DEBUG: File is small enough for direct processing`);

        // Transcribe the whole file at once
        const directResult = await transcribeFile(
          localFilePath,
          language,
          parentTrace,
          userId,
          docId,
          "direct",
          await getAudioDuration(localFilePath)
        );

        transcription = directResult.text;
        console.log(
          `DEBUG: Direct transcription complete, length: ${transcription.length}`
        );
      } else {
        console.log(
          `DEBUG: File is too large for direct processing, chunking required`
        );

        // Get audio duration for optimized chunking
        const durationSec = await getAudioDuration(localFilePath);
        console.log(`DEBUG: Audio duration: ${durationSec.toFixed(2)}s`);

        // Split into chunks with size-based chunking
        const chunks = await createAudioChunks(
          localFilePath,
          fileSize,
          durationSec
        );

        // Transcribe each chunk and store results
        const transcriptionResults = [];

        for (const [index, chunk] of chunks.entries()) {
          console.log(
            `Transcribing chunk ${index + 1}/${chunks.length} (${(chunk.size / (1024 * 1024)).toFixed(2)}MB)`
          );

          try {
            const transcription = await transcribeFile(
              chunk.path,
              language,
              parentTrace,
              userId,
              docId,
              `chunk${index + 1}of${chunks.length}`,
              chunk.durationSeconds
            );

            transcriptionResults.push({
              result: transcription,
              startTime: chunk.startTime,
              index: chunk.index,
            });
          } catch (error) {
            console.error(
              `Failed to transcribe chunk ${index + 1}: ${error.message}`
            );
            // Add empty result to maintain order
            transcriptionResults.push({
              result: { text: `[Failed to transcribe chunk ${index + 1}]` },
              startTime: chunk.startTime,
              index: chunk.index,
            });
          }
        }

        // Merge transcriptions
        transcription = mergeTranscriptions(transcriptionResults);
        console.log(
          `DEBUG: Merged chunked transcription length: ${transcription.length}`
        );

        // Clean up chunk files
        chunks.forEach((chunk) => {
          try {
            fs.unlinkSync(chunk.path);
          } catch (err) {
            console.warn(
              `Failed to delete temp chunk file ${chunk.path}: ${err.message}`
            );
          }
        });
      }

      // Enhance transcription
      console.log("DEBUG: Starting transcription enhancement");

      const textChunks = splitTextIntoChunks(transcription);
      let enhancedTranscription;
      const geminiModel = genAI.getGenerativeModel({
        model: "gemini-2.0-flash",
      });

      if (textChunks.length > 1) {
        console.log(
          `DEBUG: Enhancing ${textChunks.length} text chunks using tracedGenerativeAIChunked.`
        );
        const chunkedResults = await tracedGenerativeAIChunked({
          chunks: textChunks.map((chunkText, index) => ({
            text: chunkText,
            metadata: { chunkIndex: index + 1, totalChunks: textChunks.length },
          })),
          processingFunction: async (chunk, index, parentTraceFromChunker) => {
            // chunk here is { text: chunkText, metadata: {chunkIndex, totalChunks} }
            return enhanceTranscription(
              chunk.text,
              courseId,
              language,
              parentTraceFromChunker, // Use the trace provided by tracedGenerativeAIChunked for this specific chunk processing
              userId,
              docId,
              geminiModel,
              chunk.metadata // Pass along chunk-specific metadata
            );
          },
          functionName: "enhanceTranscriptionWithGeminiChunks",
          userId,
          documentId: docId,
          membershipTier: null, // Or fetch if available
          metadata: {
            courseId,
            language,
            totalInputTextLength: transcription.length,
          },
          parentTrace, // This is the main parentTrace for the whole audio processing job
        });
        // Assuming chunkedResults.results is an array of enhanced text strings
        enhancedTranscription = chunkedResults.results.join("\n\n---\n\n");
      } else {
        console.log("DEBUG: Enhancing single text chunk directly.");
        // Single chunk, call enhanceTranscription directly with the main parentTrace
        enhancedTranscription = await enhanceTranscription(
          transcription, // The full transcription is the single chunk
          courseId,
          language,
          parentTrace, // Main parent trace
          userId,
          docId,
          geminiModel,
          { chunkIndex: 1, totalChunks: 1 } // Metadata for single chunk
        );
      }

      // Clean up temp files
      try {
        fs.unlinkSync(localFilePath);
      } catch (err) {
        console.warn(`Failed to delete temp file: ${err.message}`);
      }

      return {
        enhancedTranscription,
      };
    } catch (error) {
      console.error("Error processing audio:", error);
      // Clean up temp file in case of error
      try {
        fs.unlinkSync(localFilePath);
      } catch (err) {
        /* ignore */
      }
      throw error;
    }
  } catch (error) {
    console.error("Error in processAudioOptimized:", error);
    throw error;
  }
};

// Main pub/sub function to process the audio lecture
export const processAudioTranscription = onMessagePublished(
  {
    topic: "audio-transcription-jobs",
    timeoutSeconds: 540, // 9 minutes timeout
    memory: "2GiB", // Increase memory for audio processing
  },
  async (event) => {
    let mainTrace = null; // Initialize mainTrace for Langfuse
    try {
      // Initialize Langfuse
      initLangfuse();

      // Extract the data from the Pub/Sub message
      const messageData = event.data.message.json;
      console.log("DEBUG: Received message data:", JSON.stringify(messageData));

      // Prevent excessive retries by checking message age
      // Discard events older than 3 hours (in milliseconds)
      const eventMaxAgeMs = 3 * 60 * 60 * 1000; // 3 hours
      const eventTimestamp = messageData.timestamp || Date.now();
      const eventAgeMs = Date.now() - eventTimestamp;

      if (eventAgeMs > eventMaxAgeMs) {
        console.log(
          `Dropping audio transcription event with age[ms]: ${eventAgeMs}, exceeds max age: ${eventMaxAgeMs}`
        );
        // This is important - we need to return without throwing an error
        // so Pub/Sub won't retry this message again
        return;
      }

      console.log(
        `Processing audio transcription event with age[ms]: ${eventAgeMs}`
      );

      const { userId, docId, courseId, storagePath, language } = messageData;

      if (!userId || !docId || !storagePath || !language) {
        console.error("DEBUG: Missing required message data:", {
          userId,
          docId,
          storagePath,
          language,
        });
        throw new Error("Missing required message data");
      }

      const firestore = getFirestore();
      const storage = getStorage().bucket();

      // Extract original filename from storage path
      const originalFileName = storagePath.split("/").pop();
      const fileNameWithoutExt = originalFileName
        .split(".")
        .slice(0, -1)
        .join(".");

      // Create markdown filename based on original audio filename
      const markdownFileName = `Transcription-${fileNameWithoutExt}.md`;
      // Store in the same folder structure as the source document
      const cleanMarkdownPath = `users/${userId}/docs/${docId}/smartstructure/${markdownFileName}`;

      console.log("DEBUG: Will save transcription as:", markdownFileName);

      console.log(
        "DEBUG: Attempting to download file from storage path:",
        storagePath
      );
      const file = storage.file(storagePath);

      console.log("DEBUG: Checking if file exists");
      const [exists] = await file.exists();
      if (!exists) {
        console.error("DEBUG: File does not exist in storage:", storagePath);
        // Update document with error
        await updateDocumentWithError(
          userId,
          docId,
          "Audio file not found in storage"
        );
        return;
      }

      // Get file metadata from Storage
      const [metadata] = await file.getMetadata();
      const fileSize = Number(metadata.size);
      console.log("DEBUG: File size:", fileSize);

      // Create a main trace for the entire operation
      mainTrace = createTrace("processAudioTranscription", userId, {
        docId,
        courseId,
        storagePath,
        language,
        trigger: "pubsub",
        functionName: "processAudioTranscription",
      });

      // Process the audio file with our optimized pipeline
      const { enhancedTranscription } = await processAudioOptimized(
        storagePath,
        userId,
        docId,
        language,
        courseId,
        mainTrace
      );

      // Use enhanced lecture notes directly as final output
      console.log(
        "DEBUG: Final markdown length:",
        enhancedTranscription.length
      );

      // Save the enhanced notes as a Markdown file
      await storage.file(cleanMarkdownPath).save(enhancedTranscription, {
        contentType: "text/markdown",
        metadata: {
          metadata: {
            userId,
            courseId,
            language,
            docId,
            docType: "lecture_transcription",
            authorType: "system",
          },
        },
      });
      console.log(`Lecture notes saved at: ${cleanMarkdownPath}`);

      // Update the document with transcription in smartStructure
      const docRef = firestore
        .collection("users")
        .doc(userId)
        .collection("docs")
        .doc(docId);

      console.log("DEBUG: Updating Firestore document");
      await docRef.update({
        smartStructure: {
          status: "completed",
          cleanMarkdownPath,
          processedAt: new Date(),
          fileSize: enhancedTranscription.length,
          type: "transcription",
        },
      });

      console.log("DEBUG: Audio transcription processing complete.");
    } catch (error) {
      console.error("Error processing audio transcription:", {
        error_name: error.name,
        error_message: error.message,
        error_stack: error.stack,
      });

      try {
        // Extract user and document IDs from the message if possible
        const messageData = event.data.message.json || {};
        const { userId, docId } = messageData;

        if (userId && docId) {
          // Update document with error status
          await updateDocumentWithError(
            userId,
            docId,
            error.message || "Unknown error during transcription"
          );
        }
      } catch (updateError) {
        console.error(
          "Error updating document with error status:",
          updateError
        );
      }

      // Re-throw the error to allow the configured retry behavior to handle it
      throw error;
    } finally {
      if (mainTrace) {
        await flushTraces(); // Ensure traces are flushed
      }
    }
  }
);

// Helper for updating document with error
async function updateDocumentWithError(userId, docId, errorMessage) {
  const firestore = getFirestore();
  const docRef = firestore
    .collection("users")
    .doc(userId)
    .collection("docs")
    .doc(docId);

  await docRef.update({
    smartStructure: {
      status: "error",
      error: errorMessage,
      updatedAt: new Date(),
      type: "transcription",
    },
  });

  console.log(`Updated document ${docId} with error status: ${errorMessage}`);
}
