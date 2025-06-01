"use client";

import React from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FileDown, FileImage, Undo2, Redo2 } from 'lucide-react';
import { globalShortcutConfig, ShortcutConfigItem } from '@/lib/shortcuts'; // Import shortcut config
import { useIsMacOs } from '@/lib/os-utils'; // Import OS detection utility

interface TopBarProps {
  onOpenFileClick: () => void;
  onExportClick: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  canExport: boolean;
}

// Helper function to find a shortcut by its ID
const findShortcut = (id: string): ShortcutConfigItem | undefined => {
  return globalShortcutConfig.find(sc => sc.id === id);
};

// Helper function to format the shortcut string
const formatShortcut = (shortcut: ShortcutConfigItem | undefined, isMac: boolean): string => {
  if (!shortcut) return "";

  let parts: string[] = [];
  if (shortcut.metaOrCtrl) {
    parts.push(isMac ? "⌘" : "Ctrl");
  }
  if (shortcut.alt) {
    parts.push(isMac ? "⌥" : "Alt");
  }
  if (shortcut.shift) {
    parts.push(isMac ? "⇧" : "Shift");
  }
  parts.push(shortcut.key.toUpperCase());

  return parts.join(isMac ? "" : "+"); // Mac typically doesn't use '+' between modifiers and key
};

export function TopBar({ onOpenFileClick, onExportClick, onUndo, onRedo, canUndo, canRedo, canExport }: TopBarProps) {
  const isMac = useIsMacOs();

  const undoShortcut = findShortcut('undo');
  const redoShortcut = findShortcut('redo'); // Primary redo
  const openFileShortcut = findShortcut('openFile');
  const exportFileShortcut = findShortcut('exportFile');

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background p-4 sm:static sm:h-auto sm:border-0 sm:bg-transparent sm:p-6">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold">QuikLens</h1>
      </div>

      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">File</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={onOpenFileClick}>
              <FileImage className="mr-2 h-4 w-4" />
              Open Image
              {openFileShortcut && <DropdownMenuShortcut>{formatShortcut(openFileShortcut, isMac)}</DropdownMenuShortcut>}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onExportClick} disabled={!canExport}>
              <FileDown className="mr-2 h-4 w-4"/>
              Export Image
              {exportFileShortcut && <DropdownMenuShortcut>{formatShortcut(exportFileShortcut, isMac)}</DropdownMenuShortcut>}
            </DropdownMenuItem>
            {/* Add more items: Save Project, etc. */}
          </DropdownMenuContent>
        </DropdownMenu>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">Edit</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={onUndo} disabled={!canUndo} title="Undo">
              <Undo2 className="h-4 w-4" />
              Undo
              {undoShortcut && <DropdownMenuShortcut>{formatShortcut(undoShortcut, isMac)}</DropdownMenuShortcut>}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onRedo} disabled={!canRedo} title="Redo">
              <Redo2 className="h-4 w-4" />
              Redo
              {redoShortcut && <DropdownMenuShortcut>{formatShortcut(redoShortcut, isMac)}</DropdownMenuShortcut>}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}