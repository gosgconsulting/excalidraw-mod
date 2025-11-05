import express from "express";

import { query } from "../db";
import { validateSlug, validateRequest } from "../middleware/validation";

import type { Request, Response } from "express";

const router = express.Router();

// Upload files for a drawing
router.post(
  "/:slug/files",
  validateSlug,
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const { slug } = req.params;
      const { files, encryption_key } = req.body;

      if (!Array.isArray(files) || files.length === 0) {
        return res.status(400).json({ error: "Files array is required" });
      }

      if (!encryption_key) {
        return res.status(400).json({ error: "Encryption key is required" });
      }

      // Verify drawing exists
      const drawingExists = await query<{ exists: boolean }>(
        "SELECT EXISTS(SELECT 1 FROM drawings WHERE slug = $1) as exists",
        [slug],
      );

      if (!drawingExists[0].exists) {
        return res.status(404).json({ error: "Drawing not found" });
      }

      const savedFiles: string[] = [];
      const erroredFiles: string[] = [];

      // Process each file
      for (const file of files) {
        try {
          const { id, buffer } = file;

          if (!id || !buffer) {
            erroredFiles.push(id || "unknown");
            continue;
          }

          // Convert base64 buffer to Uint8Array then to Buffer
          const fileBuffer = Buffer.from(buffer, "base64");

          // Check if file already exists (upsert)
          const existing = await query<{ id: string }>(
            "SELECT id FROM files WHERE drawing_slug = $1 AND file_id = $2",
            [slug, id],
          );

          if (existing.length > 0) {
            // Update existing file
            await query(
              `UPDATE files 
               SET encrypted_data = $1, 
                   encryption_key = $2,
                   updated_at = NOW()
               WHERE drawing_slug = $3 AND file_id = $4`,
              [fileBuffer, encryption_key, slug, id],
            );
          } else {
            // Insert new file
            await query(
              `INSERT INTO files (drawing_slug, file_id, encrypted_data, encryption_key)
               VALUES ($1, $2, $3, $4)`,
              [slug, id, fileBuffer, encryption_key],
            );
          }

          savedFiles.push(id);
        } catch (error: any) {
          console.error(
            `[testing] Error saving file ${file.id || "unknown"}:`,
            error,
          );
          erroredFiles.push(file.id || "unknown");
        }
      }

      res.json({
        savedFiles,
        erroredFiles,
      });
    } catch (error: any) {
      console.error("[testing] Error uploading files", error);
      res.status(500).json({ error: "Failed to upload files" });
    }
  },
);

// Get a single file by fileId
router.get(
  "/:slug/files/:fileId",
  validateSlug,
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const { slug, fileId } = req.params;

      const results = await query<{
        encrypted_data: Buffer;
        encryption_key: string;
      }>(
        `SELECT encrypted_data, encryption_key 
         FROM files 
         WHERE drawing_slug = $1 AND file_id = $2`,
        [slug, fileId],
      );

      if (results.length === 0) {
        return res.status(404).json({ error: "File not found" });
      }

      const file = results[0];

      // Convert buffer to base64
      const base64Data = file.encrypted_data.toString("base64");

      res.json({
        id: fileId,
        buffer: base64Data,
        encryption_key: file.encryption_key,
      });
    } catch (error: any) {
      console.error("[testing] Error fetching file", error);
      res.status(500).json({ error: "Failed to fetch file" });
    }
  },
);

// Get all files for a drawing
router.get(
  "/:slug/files",
  validateSlug,
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const { slug } = req.params;
      const { fileIds } = req.query;

      let queryText = `SELECT file_id, encrypted_data, encryption_key 
                       FROM files 
                       WHERE drawing_slug = $1`;
      const params: any[] = [slug];

      // If fileIds are provided, filter by them
      if (fileIds) {
        const fileIdArray = Array.isArray(fileIds)
          ? fileIds
          : fileIds.toString().split(",");
        queryText += ` AND file_id = ANY($2)`;
        params.push(fileIdArray);
      }

      const results = await query<{
        file_id: string;
        encrypted_data: Buffer;
        encryption_key: string;
      }>(queryText, params);

      const files = results.map((file) => ({
        id: file.file_id,
        buffer: file.encrypted_data.toString("base64"),
        encryption_key: file.encryption_key,
      }));

      res.json({ files });
    } catch (error: any) {
      console.error("[testing] Error fetching files", error);
      res.status(500).json({ error: "Failed to fetch files" });
    }
  },
);

export default router;
