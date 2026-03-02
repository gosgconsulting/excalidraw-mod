import { decompressData } from "@excalidraw/excalidraw/data/encode";
import { MIME_TYPES } from "@excalidraw/common";

import type { FileId } from "@excalidraw/element/types";
import type {
  BinaryFileData,
  BinaryFileMetadata,
  DataURL,
} from "@excalidraw/excalidraw/types";

const API_BASE_URL =
  import.meta.env.VITE_APP_PERSISTENT_DRAWINGS_API_URL ||
  "http://localhost:4000/api";

const FILE_UPLOAD_BATCH_MAX_BYTES = 32 * 1024 * 1024; // 32 MiB

/**
 * Save files to backend API
 */
export const saveFilesToBackend = async ({
  slug,
  files,
  encryptionKey,
}: {
  slug: string;
  files: { id: FileId; buffer: Uint8Array }[];
  encryptionKey: string;
}) => {
  const erroredFiles: FileId[] = [];
  const savedFiles: FileId[] = [];

  // Convert Uint8Array buffers to base64 for API
  // Use a safer method that doesn't spread large arrays as function arguments
  const filesForUpload = files.map((file) => {
    const uint8Array = new Uint8Array(file.buffer);
    // Build binary string character by character to avoid function argument limits
    let binaryString = "";
    for (let i = 0; i < uint8Array.length; i++) {
      binaryString += String.fromCharCode(uint8Array[i]);
    }
    return {
      id: file.id,
      buffer: btoa(binaryString),
    };
  });

  const uploadBatch = async (batch: { id: FileId; buffer: string }[]) => {
    const response = await fetch(`${API_BASE_URL}/drawings/${slug}/files`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        files: batch,
        encryption_key: encryptionKey,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || "Failed to upload files");
    }

    const result = await response.json();
    savedFiles.push(...(result.savedFiles || []));
    erroredFiles.push(...(result.erroredFiles || []));
  };

  try {
    let currentBatch: { id: FileId; buffer: string }[] = [];
    let currentBatchSize = 0;

    for (const file of filesForUpload) {
      const fileSize = file.buffer.length;
      const exceedsCurrentBatchLimit =
        currentBatch.length > 0 &&
        currentBatchSize + fileSize > FILE_UPLOAD_BATCH_MAX_BYTES;

      if (exceedsCurrentBatchLimit) {
        await uploadBatch(currentBatch);
        currentBatch = [];
        currentBatchSize = 0;
      }

      currentBatch.push(file);
      currentBatchSize += fileSize;
    }

    if (currentBatch.length > 0) {
      await uploadBatch(currentBatch);
    }
  } catch (error: any) {
    // eslint-disable-next-line no-console
    console.error("[testing] Error saving files to backend", error);
    // If bulk upload fails, mark all as errored
    files.forEach((file) => {
      if (!savedFiles.includes(file.id)) {
        erroredFiles.push(file.id);
      }
    });
  }

  return { savedFiles, erroredFiles };
};

/**
 * Load files from backend API
 */
export const loadFilesFromBackend = async (
  slug: string,
  decryptionKey: string,
  fileIds: readonly FileId[],
) => {
  const loadedFiles: BinaryFileData[] = [];
  const erroredFiles = new Map<FileId, true>();

  if (fileIds.length === 0) {
    return { loadedFiles, erroredFiles };
  }

  try {
    // Fetch all files for this drawing
    const fileIdsParam = fileIds.join(",");
    const response = await fetch(
      `${API_BASE_URL}/drawings/${slug}/files?fileIds=${fileIdsParam}`,
    );

    if (!response.ok) {
      if (response.status === 404) {
        // Drawing not found, mark all files as errored
        fileIds.forEach((id) => {
          erroredFiles.set(id, true);
        });
        return { loadedFiles, erroredFiles };
      }
      throw new Error("Failed to fetch files");
    }

    const result = await response.json();
    const files = result.files || [];

    // Process each file
    await Promise.all(
      fileIds.map(async (fileId) => {
        try {
          const file = files.find((f: { id: string }) => f.id === fileId);

          if (!file) {
            erroredFiles.set(fileId, true);
            return;
          }

          // Convert base64 buffer back to Uint8Array
          const binaryString = atob(file.buffer);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }

          // Decompress and decrypt
          const { data, metadata } = await decompressData<BinaryFileMetadata>(
            bytes,
            {
              decryptionKey: file.encryption_key || decryptionKey,
            },
          );

          const dataURL = new TextDecoder().decode(data) as DataURL;

          loadedFiles.push({
            mimeType: metadata.mimeType || MIME_TYPES.binary,
            id: fileId,
            dataURL,
            created: metadata?.created || Date.now(),
            lastRetrieved: metadata?.created || Date.now(),
          });
        } catch (error: any) {
          // eslint-disable-next-line no-console
          console.error(`[testing] Error loading file ${fileId}:`, error);
          erroredFiles.set(fileId, true);
        }
      }),
    );
  } catch (error: any) {
    // eslint-disable-next-line no-console
    console.error("[testing] Error loading files from backend", error);
    // Mark all files as errored if request fails
    fileIds.forEach((id) => {
      erroredFiles.set(id, true);
    });
  }

  return { loadedFiles, erroredFiles };
};
