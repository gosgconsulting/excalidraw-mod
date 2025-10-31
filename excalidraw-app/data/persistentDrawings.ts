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
import { saveFilesToFirebase, loadFilesFromFirebase } from "./firebase";

const API_BASE_URL =
  import.meta.env.VITE_APP_PERSISTENT_DRAWINGS_API_URL ||
  "http://localhost:4000/api";

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
        serializeAsJSON(elements, appState, files, "database"),
      ),
      { encryptionKey },
    );

    // Convert to base64 for API
    const base64Data = btoa(
      String.fromCharCode(...new Uint8Array(payload.buffer)),
    );

    // Upload files to Firebase Storage
    const filesMap = new Map<FileId, BinaryFileData>();
    for (const element of elements) {
      if (isInitializedImageElement(element)) {
        const fileId = element.fileId;
        if (fileId && files[fileId]) {
          filesMap.set(fileId, files[fileId]);
        }
      }
    }

    const filesToUpload = await encodeFilesForUpload({
      files: filesMap,
      encryptionKey,
      maxBytes: FILE_UPLOAD_MAX_BYTES,
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

    // Save files to Firebase Storage
    try {
      await saveFilesToFirebase({
        prefix: `/files/persistentDrawings/${slug}`,
        files: filesToUpload,
      });
    } catch (firebaseError: any) {
      console.error("[testing] Error saving files to Firebase", firebaseError);
      // Return error but note that drawing was created in DB
      return {
        success: false,
        errorMessage: "Could not create persistent link",
      };
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
        serializeAsJSON(elements, appState, files, "database"),
      ),
      { encryptionKey },
    );

    // Convert to base64 for API
    const base64Data = btoa(
      String.fromCharCode(...new Uint8Array(payload.buffer)),
    );

    // Upload files to Firebase Storage
    const filesMap = new Map<FileId, BinaryFileData>();
    for (const element of elements) {
      if (isInitializedImageElement(element)) {
        const fileId = element.fileId;
        if (fileId && files[fileId]) {
          filesMap.set(fileId, files[fileId]);
        }
      }
    }

    const filesToUpload = await encodeFilesForUpload({
      files: filesMap,
      encryptionKey,
      maxBytes: FILE_UPLOAD_MAX_BYTES,
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

    // Save files to Firebase Storage
    try {
      await saveFilesToFirebase({
        prefix: `/files/persistentDrawings/${slug}`,
        files: filesToUpload,
      });
    } catch (firebaseError: any) {
      console.error("[testing] Error saving files to Firebase", firebaseError);
      // Return error but note that drawing was updated in DB
      return {
        success: false,
        errorMessage: "Could not update persistent link",
      };
    }

    return { success: true };
  } catch (error: any) {
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

    // Load files from Firebase Storage
    const fileIds: FileId[] = [];
    for (const element of restored.elements || []) {
      if (isInitializedImageElement(element) && element.fileId) {
        fileIds.push(element.fileId);
      }
    }

    let files: BinaryFiles = restored.files || {};
    if (fileIds.length > 0) {
      try {
        const { loadedFiles } = await loadFilesFromFirebase(
          `/files/persistentDrawings/${slug}`,
          json.encryption_key,
          fileIds,
        );

        // Merge loaded files into restored.files
        const filesObj: BinaryFiles = { ...files };
        loadedFiles.forEach((file) => {
          filesObj[file.id] = file;
        });
        files = filesObj;
      } catch (error: any) {
        console.error("[testing] Error loading files from Firebase", error);
        // Continue without files rather than failing completely
      }
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
