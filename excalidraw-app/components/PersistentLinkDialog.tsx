import React, { useState, useRef, useEffect } from "react";
import { copyTextToSystemClipboard } from "@excalidraw/excalidraw/clipboard";
import { useCopyStatus } from "@excalidraw/excalidraw/hooks/useCopiedIndicator";
import { Dialog } from "@excalidraw/excalidraw/components/Dialog";
import { FilledButton } from "@excalidraw/excalidraw/components/FilledButton";
import { TextField } from "@excalidraw/excalidraw/components/TextField";
import { Button } from "@excalidraw/excalidraw/components/Button";
import { copyIcon } from "@excalidraw/excalidraw/components/icons";

import { checkSlugAvailability } from "../data/persistentDrawings";

export type PersistentLinkDialogProps = {
  slug: string;
  url: string;
  onCloseRequest: () => void;
  setErrorMessage: (error: string) => void;
};

export const PersistentLinkDialog = ({
  slug,
  url,
  onCloseRequest,
  setErrorMessage,
}: PersistentLinkDialogProps) => {
  const [, setJustCopied] = useState(false);
  const timerRef = useRef<number>(0);
  const ref = useRef<HTMLInputElement>(null);
  const { onCopy, copyStatus } = useCopyStatus();

  const copyLink = async () => {
    try {
      await copyTextToSystemClipboard(url);
    } catch (e) {
      setErrorMessage("Failed to copy link to clipboard");
    }
    setJustCopied(true);

    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
    }

    timerRef.current = window.setTimeout(() => {
      setJustCopied(false);
    }, 3000);

    ref.current?.select();
  };

  return (
    <Dialog onCloseRequest={onCloseRequest} title={false} size="small">
      <div className="PersistentLinkDialog" style={{ padding: "1rem" }}>
        <h3>Persistent Link</h3>
        <div
          className="PersistentLinkDialog__linkRow"
          style={{
            display: "flex",
            gap: "0.5rem",
            marginBottom: "1rem",
            alignItems: "flex-end",
          }}
        >
          <TextField
            ref={ref}
            label="Link"
            readonly
            fullWidth
            value={url}
            selectOnRender
          />
          <FilledButton
            size="large"
            label="Copy Link"
            icon={copyIcon}
            status={copyStatus}
            onClick={() => {
              onCopy();
              copyLink();
            }}
          />
        </div>
        <div
          className="PersistentLinkDialog__description"
          style={{ fontSize: "0.875rem", color: "#666" }}
        >
          🔒 This link will always show the latest version of your drawing.
          Share it and updates will be visible to anyone who opens it.
        </div>
      </div>
    </Dialog>
  );
};

export type CreatePersistentLinkDialogProps = {
  initialSlug?: string;
  onCloseRequest: () => void;
  onCreate: (slug: string) => void;
  setErrorMessage: (error: string) => void;
};

export const CreatePersistentLinkDialog = ({
  initialSlug = "",
  onCloseRequest,
  onCreate,
  setErrorMessage,
}: CreatePersistentLinkDialogProps) => {
  const [slug, setSlug] = useState(initialSlug);
  const [isChecking, setIsChecking] = useState(false);
  const [slugError, setSlugError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const validateAndCheckSlug = async (value: string) => {
    const normalized = value.toLowerCase().trim().replace(/\s+/g, "-");

    if (!normalized) {
      setSlugError(null);
      return false;
    }

    if (!/^[a-z0-9-]+$/.test(normalized)) {
      setSlugError(
        "Slug can only contain lowercase letters, numbers, and hyphens",
      );
      return false;
    }

    if (normalized.length < 1 || normalized.length > 100) {
      setSlugError("Slug must be between 1 and 100 characters");
      return false;
    }

    setIsChecking(true);
    setSlugError(null);

    try {
      const result = await checkSlugAvailability(normalized);
      if (result.error) {
        setSlugError(result.error);
        return false;
      }
      if (!result.available) {
        setSlugError("This slug is already taken. Please choose another.");
        return false;
      }
      setSlugError(null);
      return true;
    } catch (error) {
      setSlugError("Failed to check slug availability");
      return false;
    } finally {
      setIsChecking(false);
    }
  };

  useEffect(() => {
    // Debounce slug validation
    const timer = setTimeout(() => {
      if (slug) {
        validateAndCheckSlug(slug);
      } else {
        setSlugError(null);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [slug]);

  const handleCreate = async () => {
    const normalized = slug.toLowerCase().trim().replace(/\s+/g, "-");

    if (!normalized) {
      setSlugError("Slug is required");
      return;
    }

    const isValid = await validateAndCheckSlug(normalized);
    if (!isValid) {
      return;
    }

    setIsCreating(true);
    try {
      onCreate(normalized);
    } catch (error) {
      setErrorMessage("Failed to create persistent link");
    } finally {
      setIsCreating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !isCreating && !slugError) {
      handleCreate();
    }
  };

  return (
    <Dialog
      onCloseRequest={onCloseRequest}
      title="Create Persistent Link"
      size="small"
    >
      <div className="CreatePersistentLinkDialog" style={{ padding: "1rem" }}>
        <div style={{ marginBottom: "1rem" }}>
          <TextField
            label="Slug (URL-friendly name)"
            placeholder="my-drawing"
            value={slug}
            onChange={(value) => setSlug(value)}
            onKeyDown={handleKeyDown}
          />
          {isChecking && (
            <div
              style={{
                fontSize: "0.875rem",
                color: "#666",
                marginTop: "0.25rem",
              }}
            >
              Checking availability...
            </div>
          )}
          {slugError && (
            <div
              style={{
                fontSize: "0.875rem",
                color: "#d32f2f",
                marginTop: "0.25rem",
              }}
            >
              {slugError}
            </div>
          )}
          {!slugError && !isChecking && slug && (
            <div
              style={{
                fontSize: "0.875rem",
                color: "#2e7d32",
                marginTop: "0.25rem",
              }}
            >
              ✓ Available
            </div>
          )}
        </div>
        <div
          style={{
            fontSize: "0.875rem",
            color: "#666",
            marginBottom: "1rem",
          }}
        >
          Your drawing will be accessible at:{" "}
          <code>/d/{slug || "your-slug"}</code>
        </div>
        <div
          style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}
        >
          <Button onSelect={onCloseRequest}>Cancel</Button>
          <FilledButton
            onClick={() => {
              if (!slug || !!slugError || isChecking || isCreating) {
                return;
              }
              handleCreate();
            }}
            label={isCreating ? "Creating..." : "Create Link"}
            status={isCreating ? "loading" : null}
          />
        </div>
      </div>
    </Dialog>
  );
};
