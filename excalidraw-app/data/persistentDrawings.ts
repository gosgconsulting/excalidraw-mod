import {
  compressData,
  decompressData,
} from "@excalidraw/excalidraw/data/encode";
import { generateEncryptionKey } from "@excalidraw/excalidraw/data/encryption";
import { serializeAsJSON } from "@excalidraw/excalidraw/data/json";
import { restore } from "@excalidraw/excalidraw/data/restore";
import { isInitializedImageElement } from "@excalidraw/element";
import { t } from "@excalidraw/excalidraw/i18n";

import type { ImportedDataState } from "@excalidraw/excalidraw/data/types";
import type { ExcalidrawElement, FileId } from "@excalidraw/element/types";
import type {
  AppState,
  BinaryFileData,
  BinaryFiles,
} from "@excalidraw/excalidraw/types";

import { FILE_UPLOAD_MAX_BYTES } from "../app_constants";

import { encodeFilesForUpload } from "./FileManager";
import { saveFilesToBackend, loadFilesFromBackend } from "./backendFiles";

const API_BASE_URL =
  import.meta.env.VITE_APP_PERSISTENT_DRAWINGS_API_URL ||
  "http://localhost:4000/api";

/**
 * Converts binary data into base64 without spreading a large array.
 */
const uint8ArrayToBase64 = (bytes: Uint8Array): string => {
  const CHUNK_SIZE = 0x8000;
  let binaryString = "";

  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, i + CHUNK_SIZE);
    binaryString += String.fromCharCode(...chunk);
  }

  return btoa(binaryString);
};

export interface PersistentDrawingResult {
  slug: string;
  url: string;
  encryptionKey: string;
}

export interface CreatePersistentDrawingResult {
  success: boolean;
  data?: PersistentDrawingResult;
  errorMessage?: string;
}

export interface UpdatePersistentDrawingResult {
  success: boolean;
  errorMessage?: string;
}

export interface LoadPersistentDrawingResult {
  success: boolean;
  data?: ImportedDataState;
  encryptionKey?: string;
  errorMessage?: string;
}

/**
 * Check if a slug is available
 */
export const checkSlugAvailability = async (
  slug: string,
): Promise<{ available: boolean; error?: string }> => {
  try {
    // Validate slug format
    if (!/^[a-z0-9-]+$/.test(slug)) {
      return {
        available: false,
        error: "Slug can only contain lowercase letters, numbers, and hyphens",
      };
    }

    if (slug.length < 1 || slug.length > 100) {
      return {
        available: false,
        error: "Slug must be between 1 and 100 characters",
      };
    }

    const response = await fetch(`${API_BASE_URL}/drawings/${slug}/exists`);
    if (!response.ok) {
      throw new Error("Failed to check slug availability");
    }

    const json = await response.json();
    return { available: !json.exists };
  } catch (error: any) {
    console.error("[testing] Error checking slug availability", error);
    return {
      available: false,
      error: "Failed to check slug availability",
    };
  }
};

/**
 * Create a new persistent drawing
 */
export const createPersistentDrawing = async (
  slug: string,
  elements: readonly ExcalidrawElement[],
  appState: Partial<AppState>,
  files: BinaryFiles,
): Promise<CreatePersistentDrawingResult> => {
  try {
    const encryptionKey = await generateEncryptionKey("string");

    // Compress and encrypt the drawing data
    const payload = await compressData(
      new TextEncoder().encode(
        // Files are uploaded separately; keep drawing payload compact.
        serializeAsJSON(elements, appState, {}, "database"),
      ),
      { encryptionKey },
    );

    // Convert to base64 for API
    const base64Data = uint8ArrayToBase64(new Uint8Array(payload.buffer));

    // Collect and validate files for upload to backend
    // eslint-disable-next-line no-console
    console.log("[testing] Starting file collection", {
      totalElements: elements.length,
      filesParameterSize: Object.keys(files).length,
    });

    const filesMap = new Map<FileId, BinaryFileData>();
    const imageElementsCount = elements.filter((el) =>
      isInitializedImageElement(el),
    ).length;
    // eslint-disable-next-line no-console
    console.log("[testing] Found image elements", {
      count: imageElementsCount,
    });

    for (const element of elements) {
      if (isInitializedImageElement(element)) {
        const fileId = element.fileId;
        if (fileId) {
          if (files[fileId]) {
            const fileData = files[fileId];
            filesMap.set(fileId, fileData);
            const fileSize = fileData.dataURL
              ? new TextEncoder().encode(fileData.dataURL).length
              : 0;
            // eslint-disable-next-line no-console
            console.log("[testing] Collected file", {
              fileId,
              mimeType: fileData.mimeType,
              size: fileSize,
            });
          } else {
            // eslint-disable-next-line no-console
            console.warn(
              "[testing] Image element has fileId but file not found in files map",
              { fileId },
            );
          }
        }
      }
    }

    // eslint-disable-next-line no-console
    console.log("[testing] Files collected", {
      totalCollected: filesMap.size,
      expected: imageElementsCount,
    });

    if (filesMap.size === 0 && imageElementsCount > 0) {
      // eslint-disable-next-line no-console
      console.warn(
        "[testing] Warning: Found image elements but no files collected",
      );
    }

    const filesToUpload = await encodeFilesForUpload({
      files: filesMap,
      encryptionKey,
      maxBytes: FILE_UPLOAD_MAX_BYTES,
    });

    // eslint-disable-next-line no-console
    console.log("[testing] Files encoded for upload", {
      count: filesToUpload.length,
    });

    // Create drawing in database
    const response = await fetch(`${API_BASE_URL}/drawings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        slug,
        encrypted_data: base64Data,
        encryption_key: encryptionKey,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 409) {
        return {
          success: false,
          errorMessage: "Slug already exists",
        };
      }
      return {
        success: false,
        errorMessage: errorData.error || "Could not create persistent link",
      };
    }

    const json = await response.json();

    // Save files to backend API
    if (filesToUpload.length > 0) {
      // eslint-disable-next-line no-console
      console.log("[testing] Starting file upload to backend", {
        slug,
        fileCount: filesToUpload.length,
      });

      try {
        const uploadResult = await saveFilesToBackend({
          slug,
          files: filesToUpload,
          encryptionKey,
        });

        // eslint-disable-next-line no-console
        console.log("[testing] File upload results", {
          savedFiles: uploadResult.savedFiles.length,
          erroredFiles: uploadResult.erroredFiles.length,
          savedFileIds: uploadResult.savedFiles,
          erroredFileIds: uploadResult.erroredFiles,
        });

        if (uploadResult.erroredFiles.length > 0) {
          // eslint-disable-next-line no-console
          console.error(
            "[testing] Some files failed to upload",
            uploadResult.erroredFiles,
          );
          return {
            success: false,
            errorMessage: `Failed to upload ${
              uploadResult.erroredFiles.length
            } file(s): ${uploadResult.erroredFiles.join(", ")}`,
          };
        }

        if (uploadResult.savedFiles.length !== filesToUpload.length) {
          // eslint-disable-next-line no-console
          console.warn(
            "[testing] Mismatch between files to upload and saved files",
            {
              expected: filesToUpload.length,
              saved: uploadResult.savedFiles.length,
            },
          );
          return {
            success: false,
            errorMessage: "Not all files were uploaded successfully",
          };
        }

        // eslint-disable-next-line no-console
        console.log("[testing] All files uploaded successfully");
      } catch (backendError: any) {
        // eslint-disable-next-line no-console
        console.error("[testing] Error saving files to backend", backendError);
        // Return error but note that drawing was created in DB
        return {
          success: false,
          errorMessage: `Could not upload files to backend: ${
            backendError.message || "Unknown error"
          }`,
        };
      }
    } else {
      // eslint-disable-next-line no-console
      console.log("[testing] No files to upload");
    }

    const url = new URL(window.location.href);
    url.pathname = `/d/${slug}`;
    const urlString = url.toString();

    return {
      success: true,
      data: {
        slug: json.slug,
        url: urlString,
        encryptionKey,
      },
    };
  } catch (error: any) {
    console.error("[testing] Error creating persistent drawing", error);
    return {
      success: false,
      errorMessage: "Could not create persistent link",
    };
  }
};

/**
 * Update an existing persistent drawing
 */
export const updatePersistentDrawing = async (
  slug: string,
  elements: readonly ExcalidrawElement[],
  appState: Partial<AppState>,
  files: BinaryFiles,
  encryptionKey: string,
): Promise<UpdatePersistentDrawingResult> => {
  try {
    // Compress and encrypt the drawing data
    const payload = await compressData(
      new TextEncoder().encode(
        // Files are uploaded separately; keep drawing payload compact.
        serializeAsJSON(elements, appState, {}, "database"),
      ),
      { encryptionKey },
    );

    // Convert to base64 for API
    const base64Data = uint8ArrayToBase64(new Uint8Array(payload.buffer));

    // Collect and validate files for upload to backend
    // eslint-disable-next-line no-console
    console.log("[testing] Starting file collection (update)", {
      totalElements: elements.length,
      filesParameterSize: Object.keys(files).length,
    });

    const filesMap = new Map<FileId, BinaryFileData>();
    const imageElementsCount = elements.filter((el) =>
      isInitializedImageElement(el),
    ).length;
    // eslint-disable-next-line no-console
    console.log("[testing] Found image elements (update)", {
      count: imageElementsCount,
    });

    for (const element of elements) {
      if (isInitializedImageElement(element)) {
        const fileId = element.fileId;
        if (fileId) {
          if (files[fileId]) {
            const fileData = files[fileId];
            filesMap.set(fileId, fileData);
            const fileSize = fileData.dataURL
              ? new TextEncoder().encode(fileData.dataURL).length
              : 0;
            // eslint-disable-next-line no-console
            console.log("[testing] Collected file (update)", {
              fileId,
              mimeType: fileData.mimeType,
              size: fileSize,
            });
          } else {
            // eslint-disable-next-line no-console
            console.warn(
              "[testing] Image element has fileId but file not found in files map (update)",
              { fileId },
            );
          }
        }
      }
    }

    // eslint-disable-next-line no-console
    console.log("[testing] Files collected (update)", {
      totalCollected: filesMap.size,
      expected: imageElementsCount,
    });

    if (filesMap.size === 0 && imageElementsCount > 0) {
      // eslint-disable-next-line no-console
      console.warn(
        "[testing] Warning: Found image elements but no files collected (update)",
      );
    }

    const filesToUpload = await encodeFilesForUpload({
      files: filesMap,
      encryptionKey,
      maxBytes: FILE_UPLOAD_MAX_BYTES,
    });

    // eslint-disable-next-line no-console
    console.log("[testing] Files encoded for upload (update)", {
      count: filesToUpload.length,
    });

    // Update drawing in database
    const response = await fetch(`${API_BASE_URL}/drawings/${slug}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        encrypted_data: base64Data,
        encryption_key: encryptionKey,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 404) {
        return {
          success: false,
          errorMessage: "Drawing not found",
        };
      }
      return {
        success: false,
        errorMessage: errorData.error || "Could not update persistent link",
      };
    }

    // Save files to backend API
    if (filesToUpload.length > 0) {
      // eslint-disable-next-line no-console
      console.log("[testing] Starting file upload to backend (update)", {
        slug,
        fileCount: filesToUpload.length,
      });

      try {
        const uploadResult = await saveFilesToBackend({
          slug,
          files: filesToUpload,
          encryptionKey,
        });

        // eslint-disable-next-line no-console
        console.log("[testing] File upload results (update)", {
          savedFiles: uploadResult.savedFiles.length,
          erroredFiles: uploadResult.erroredFiles.length,
          savedFileIds: uploadResult.savedFiles,
          erroredFileIds: uploadResult.erroredFiles,
        });

        if (uploadResult.erroredFiles.length > 0) {
          // eslint-disable-next-line no-console
          console.error(
            "[testing] Some files failed to upload (update)",
            uploadResult.erroredFiles,
          );
          return {
            success: false,
            errorMessage: `Failed to upload ${
              uploadResult.erroredFiles.length
            } file(s): ${uploadResult.erroredFiles.join(", ")}`,
          };
        }

        if (uploadResult.savedFiles.length !== filesToUpload.length) {
          // eslint-disable-next-line no-console
          console.warn(
            "[testing] Mismatch between files to upload and saved files (update)",
            {
              expected: filesToUpload.length,
              saved: uploadResult.savedFiles.length,
            },
          );
          return {
            success: false,
            errorMessage: "Not all files were uploaded successfully",
          };
        }

        // eslint-disable-next-line no-console
        console.log("[testing] All files uploaded successfully (update)");
      } catch (backendError: any) {
        // eslint-disable-next-line no-console
        console.error(
          "[testing] Error saving files to backend (update)",
          backendError,
        );
        // Return error but note that drawing was updated in DB
        return {
          success: false,
          errorMessage: `Could not upload files to backend: ${
            backendError.message || "Unknown error"
          }`,
        };
      }
    } else {
      // eslint-disable-next-line no-console
      console.log("[testing] No files to upload (update)");
    }

    return { success: true };
  } catch (error: any) {
    // eslint-disable-next-line no-console
    console.error("[testing] Error updating persistent drawing", error);
    return {
      success: false,
      errorMessage: "Could not update persistent link",
    };
  }
};

/**
 * Load a persistent drawing by slug
 */
export const loadPersistentDrawing = async (
  slug: string,
  localDataState?: ImportedDataState | null,
): Promise<LoadPersistentDrawingResult> => {
  try {
    const response = await fetch(`${API_BASE_URL}/drawings/${slug}`);

    if (!response.ok) {
      if (response.status === 404) {
        return {
          success: false,
          errorMessage: "Drawing not found",
        };
      }
      return {
        success: false,
        errorMessage: t("alerts.importBackendFailed"),
      };
    }

    const json = await response.json();

    // Decode base64 to Uint8Array
    const base64Data = json.encrypted_data;
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Decompress and decrypt
    const { data: decodedBuffer } = await decompressData(bytes, {
      decryptionKey: json.encryption_key,
    });

    const data: ImportedDataState = JSON.parse(
      new TextDecoder().decode(decodedBuffer),
    );

    // Restore the data with local state
    const restored = restore(
      data,
      localDataState?.appState,
      localDataState?.elements,
      {
        repairBindings: true,
        refreshDimensions: false,
        deleteInvisibleElements: true,
      },
    );

    // Load files from backend API
    const fileIds: FileId[] = [];
    for (const element of restored.elements || []) {
      if (isInitializedImageElement(element) && element.fileId) {
        fileIds.push(element.fileId);
      }
    }

    // eslint-disable-next-line no-console
    console.log("[testing] Starting file loading", {
      fileIdsCount: fileIds.length,
      fileIds,
    });

    let files: BinaryFiles = restored.files || {};
    if (fileIds.length > 0) {
      try {
        const { loadedFiles, erroredFiles } = await loadFilesFromBackend(
          slug,
          json.encryption_key,
          fileIds,
        );

        // eslint-disable-next-line no-console
        console.log("[testing] File loading results", {
          loadedFiles: loadedFiles.length,
          erroredFiles: erroredFiles.size,
          expected: fileIds.length,
          loadedFileIds: loadedFiles.map((f) => f.id),
          erroredFileIds: Array.from(erroredFiles.keys()),
        });

        if (loadedFiles.length !== fileIds.length) {
          // eslint-disable-next-line no-console
          console.warn("[testing] Mismatch between expected and loaded files", {
            expected: fileIds.length,
            loaded: loadedFiles.length,
            errored: erroredFiles.size,
          });
        }

        if (erroredFiles.size > 0) {
          // eslint-disable-next-line no-console
          console.warn(
            "[testing] Some files failed to load",
            Array.from(erroredFiles.keys()),
          );
        }

        // Merge loaded files into restored.files
        const filesObj: BinaryFiles = { ...files };
        loadedFiles.forEach((file) => {
          filesObj[file.id] = file;
          // eslint-disable-next-line no-console
          console.log("[testing] Loaded file", {
            fileId: file.id,
            mimeType: file.mimeType,
          });
        });
        files = filesObj;

        // eslint-disable-next-line no-console
        console.log("[testing] File loading completed", {
          totalFiles: Object.keys(files).length,
        });
      } catch (error: any) {
        // eslint-disable-next-line no-console
        console.error("[testing] Error loading files from backend", error);
        // Continue without files rather than failing completely
      }
    } else {
      // eslint-disable-next-line no-console
      console.log("[testing] No files to load");
    }

    return {
      success: true,
      data: {
        elements: restored.elements,
        appState: restored.appState,
        files,
      },
      encryptionKey: json.encryption_key,
    };
  } catch (error: any) {
    console.error("[testing] Error loading persistent drawing", error);
    return {
      success: false,
      errorMessage: t("alerts.importBackendFailed"),
    };
  }
};
