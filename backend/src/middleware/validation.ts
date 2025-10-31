import { body, param, validationResult } from "express-validator";

import type { Request, Response, NextFunction } from "express";

export const validateSlug = [
  param("slug")
    .isString()
    .isLength({ min: 1, max: 100 })
    .matches(/^[a-z0-9-]+$/)
    .withMessage(
      "Slug must be 1-100 characters, alphanumeric and hyphens only (lowercase)",
    ),
];

export const validateCreateDrawing = [
  body("slug")
    .isString()
    .isLength({ min: 1, max: 100 })
    .matches(/^[a-z0-9-]+$/)
    .withMessage(
      "Slug must be 1-100 characters, alphanumeric and hyphens only (lowercase)",
    ),
  body("encrypted_data")
    .isString()
    .notEmpty()
    .withMessage("encrypted_data is required"),
  body("encryption_key")
    .isString()
    .notEmpty()
    .withMessage("encryption_key is required"),
];

export const validateUpdateDrawing = [
  body("encrypted_data")
    .isString()
    .notEmpty()
    .withMessage("encrypted_data is required"),
  body("encryption_key")
    .isString()
    .notEmpty()
    .withMessage("encryption_key is required"),
];

export const validateRequest = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};
