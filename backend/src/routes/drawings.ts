import express from "express";

import { query } from "../db";
import {
  validateSlug,
  validateCreateDrawing,
  validateUpdateDrawing,
  validateRequest,
} from "../middleware/validation";

import type { Request, Response } from "express";

import type {
  CreateDrawingRequest,
  UpdateDrawingRequest,
  DrawingResponse,
} from "../types";

const router = express.Router();

// Check if slug exists
router.get(
  "/:slug/exists",
  validateSlug,
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const { slug } = req.params;
      const results = await query<{ exists: boolean }>(
        "SELECT EXISTS(SELECT 1 FROM drawings WHERE slug = $1) as exists",
        [slug],
      );
      res.json({ exists: results[0].exists });
    } catch (error: any) {
      console.error("[testing] Error checking slug existence", error);
      res.status(500).json({ error: "Failed to check slug availability" });
    }
  },
);

// Get drawing by slug
router.get(
  "/:slug",
  validateSlug,
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const { slug } = req.params;
      const results = await query<{
        id: string;
        slug: string;
        encrypted_data: Buffer;
        encryption_key: string;
        version: number;
        created_at: Date;
        updated_at: Date;
      }>(
        `SELECT id, slug, encrypted_data, encryption_key, version, created_at, updated_at 
         FROM drawings 
         WHERE slug = $1`,
        [slug],
      );

      if (results.length === 0) {
        return res.status(404).json({ error: "Drawing not found" });
      }

      const drawing = results[0];

      // Update last_accessed_at
      await query(
        "UPDATE drawings SET last_accessed_at = NOW() WHERE slug = $1",
        [slug],
      );

      const response: DrawingResponse = {
        id: drawing.id,
        slug: drawing.slug,
        encrypted_data: drawing.encrypted_data.toString("base64"),
        encryption_key: drawing.encryption_key,
        version: drawing.version,
        created_at: drawing.created_at.toISOString(),
        updated_at: drawing.updated_at.toISOString(),
      };

      res.json(response);
    } catch (error: any) {
      console.error("[testing] Error fetching drawing", error);
      res.status(500).json({ error: "Failed to fetch drawing" });
    }
  },
);

// Create new drawing
router.post(
  "/",
  validateCreateDrawing,
  validateRequest,
  async (req: Request<{}, {}, CreateDrawingRequest>, res: Response) => {
    try {
      const { slug, encrypted_data, encryption_key } = req.body;

      // Check if slug already exists
      const existing = await query<{ exists: boolean }>(
        "SELECT EXISTS(SELECT 1 FROM drawings WHERE slug = $1) as exists",
        [slug],
      );

      if (existing[0].exists) {
        return res.status(409).json({ error: "Slug already exists" });
      }

      // Convert base64 to buffer
      const encryptedBuffer = Buffer.from(encrypted_data, "base64");

      const results = await query<{
        id: string;
        slug: string;
        version: number;
        created_at: Date;
        updated_at: Date;
      }>(
        `INSERT INTO drawings (slug, encrypted_data, encryption_key, version)
         VALUES ($1, $2, $3, 1)
         RETURNING id, slug, version, created_at, updated_at`,
        [slug, encryptedBuffer, encryption_key],
      );

      const drawing = results[0];

      const response: DrawingResponse = {
        id: drawing.id,
        slug: drawing.slug,
        encrypted_data,
        encryption_key,
        version: drawing.version,
        created_at: drawing.created_at.toISOString(),
        updated_at: drawing.updated_at.toISOString(),
      };

      res.status(201).json(response);
    } catch (error: any) {
      console.error("[testing] Error creating drawing", error);
      if (error.code === "23505") {
        // Unique violation
        return res.status(409).json({ error: "Slug already exists" });
      }
      res.status(500).json({ error: "Failed to create drawing" });
    }
  },
);

// Update existing drawing
router.put(
  "/:slug",
  validateSlug,
  validateUpdateDrawing,
  validateRequest,
  async (
    req: Request<{ slug: string }, {}, UpdateDrawingRequest>,
    res: Response,
  ) => {
    try {
      const { slug } = req.params;
      const { encrypted_data, encryption_key } = req.body;

      // Convert base64 to buffer
      const encryptedBuffer = Buffer.from(encrypted_data, "base64");

      const results = await query<{
        id: string;
        slug: string;
        version: number;
        created_at: Date;
        updated_at: Date;
      }>(
        `UPDATE drawings 
         SET encrypted_data = $1, 
             encryption_key = $2, 
             version = version + 1,
             updated_at = NOW()
         WHERE slug = $3
         RETURNING id, slug, version, created_at, updated_at`,
        [encryptedBuffer, encryption_key, slug],
      );

      if (results.length === 0) {
        return res.status(404).json({ error: "Drawing not found" });
      }

      const drawing = results[0];

      const response: DrawingResponse = {
        id: drawing.id,
        slug: drawing.slug,
        encrypted_data,
        encryption_key,
        version: drawing.version,
        created_at: drawing.created_at.toISOString(),
        updated_at: drawing.updated_at.toISOString(),
      };

      res.json(response);
    } catch (error: any) {
      console.error("[testing] Error updating drawing", error);
      res.status(500).json({ error: "Failed to update drawing" });
    }
  },
);

export default router;
