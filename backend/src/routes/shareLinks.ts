import express from "express";

import { query } from "../db";

import type { Request, Response } from "express";
import type { ShareLinkResponse, ShareLinkFileItem } from "../types";

const router = express.Router();

// Create a new share link — accepts raw binary body (application/octet-stream)
router.post("/", async (req: Request, res: Response) => {
  try {
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ error: "Binary body is required" });
    }

    const results = await query<{ id: string }>(
      `INSERT INTO share_links (data) VALUES ($1) RETURNING id`,
      [req.body],
    );

    const response: ShareLinkResponse = { id: results[0].id };
    res.status(201).json(response);
  } catch (error: any) {
    console.error("[share] Error creating share link", error);
    res.status(500).json({ error: "Failed to create share link" });
  }
});

// Get share link data — returns raw binary (application/octet-stream)
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        id,
      )
    ) {
      return res.status(400).json({ error: "Invalid share link id" });
    }

    const results = await query<{ data: Buffer }>(
      `SELECT data FROM share_links WHERE id = $1`,
      [id],
    );

    if (results.length === 0) {
      return res.status(404).json({ error: "Share link not found" });
    }

    res.set("Content-Type", "application/octet-stream");
    res.send(results[0].data);
  } catch (error: any) {
    console.error("[share] Error fetching share link", error);
    res.status(500).json({ error: "Failed to fetch share link" });
  }
});

// Upload files for a share link
router.post("/:id/files", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { files } = req.body as { files: ShareLinkFileItem[] };

    if (!Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: "files array is required" });
    }

    // Verify share link exists
    const exists = await query<{ exists: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM share_links WHERE id = $1) as exists`,
      [id],
    );

    if (!exists[0].exists) {
      return res.status(404).json({ error: "Share link not found" });
    }

    const savedFiles: string[] = [];
    const erroredFiles: string[] = [];

    for (const file of files) {
      try {
        const { id: fileId, buffer } = file;

        if (!fileId || !buffer) {
          erroredFiles.push(fileId || "unknown");
          continue;
        }

        const fileBuffer = Buffer.from(buffer, "base64");

        await query(
          `INSERT INTO share_link_files (share_link_id, file_id, data)
           VALUES ($1, $2, $3)
           ON CONFLICT (share_link_id, file_id)
           DO UPDATE SET data = EXCLUDED.data`,
          [id, fileId, fileBuffer],
        );

        savedFiles.push(fileId);
      } catch (error: any) {
        console.error(
          `[share] Error saving file ${file.id || "unknown"}:`,
          error,
        );
        erroredFiles.push(file.id || "unknown");
      }
    }

    res.json({ savedFiles, erroredFiles });
  } catch (error: any) {
    console.error("[share] Error uploading share link files", error);
    res.status(500).json({ error: "Failed to upload files" });
  }
});

// Get a single file for a share link
router.get("/:id/files/:fileId", async (req: Request, res: Response) => {
  try {
    const { id, fileId } = req.params;

    const results = await query<{ data: Buffer }>(
      `SELECT data FROM share_link_files
       WHERE share_link_id = $1 AND file_id = $2`,
      [id, fileId],
    );

    if (results.length === 0) {
      return res.status(404).json({ error: "File not found" });
    }

    res.json({
      id: fileId,
      buffer: results[0].data.toString("base64"),
    });
  } catch (error: any) {
    console.error("[share] Error fetching share link file", error);
    res.status(500).json({ error: "Failed to fetch file" });
  }
});

export default router;
