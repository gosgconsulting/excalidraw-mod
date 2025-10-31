import React from "react";
import { Card } from "@excalidraw/excalidraw/components/Card";
import { ToolButton } from "@excalidraw/excalidraw/components/ToolButton";
import { LinkIcon } from "@excalidraw/excalidraw/components/icons";

import type { NonDeletedExcalidrawElement } from "@excalidraw/element/types";
import type { BinaryFiles, UIAppState } from "@excalidraw/excalidraw/types";

export type PersistentLinkExportCardProps = {
  elements: readonly NonDeletedExcalidrawElement[];
  appState: UIAppState;
  files: BinaryFiles;
  persistentSlug: string | null;
  onExportToPersistentLink: (
    elements: readonly NonDeletedExcalidrawElement[],
    appState: UIAppState,
    files: BinaryFiles,
  ) => void;
};

export const PersistentLinkExportCard = ({
  elements,
  appState,
  files,
  persistentSlug,
  onExportToPersistentLink,
}: PersistentLinkExportCardProps) => {
  const isUpdateMode = !!persistentSlug;

  return (
    <Card color="blue">
      <div className="Card-icon">{LinkIcon}</div>
      <h2>
        {isUpdateMode ? "Update Persistent Link" : "Create Persistent Link"}
      </h2>
      <div className="Card-details">
        {isUpdateMode
          ? `Update your drawing at /d/${persistentSlug}. The link stays the same, but shows the latest version.`
          : "Create a shareable link that always shows the latest version of your drawing. Perfect for documentation or frequently updated designs."}
      </div>
      <ToolButton
        className="Card-button"
        type="button"
        title={isUpdateMode ? "Update Drawing" : "Create Persistent Link"}
        aria-label={isUpdateMode ? "Update Drawing" : "Create Persistent Link"}
        showAriaLabel={true}
        onClick={() => {
          onExportToPersistentLink(elements, appState, files);
        }}
      />
    </Card>
  );
};
