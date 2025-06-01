// components/custom/TopBar.tsx
"use client";

import React from 'react';
import Image from 'next/image';
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
import { ModeToggle } from '@/components/custom/ModeToggle';
import { useIsMacOs } from '@/lib/hooks/useIsMacOs';
import { useEditorStore } from '@/lib/store';

interface TopBarProps {
  onOpenFileClick: () => void;
  onExportClick: () => void;
}

// The findShortcut and formatShortcut helpers are no longer needed here
// as we will manually define the display strings for the few menu items.

export function TopBar({ onOpenFileClick, onExportClick }: TopBarProps) {
  const isMac = useIsMacOs();

  const canUndo = useEditorStore(state => state.canUndo());
  const canRedo = useEditorStore(state => state.canRedo());
  const canExport = useEditorStore(state => state.canExport());
  const undo = useEditorStore(state => state.undo);
  const redo = useEditorStore(state => state.redo);

  // Define shortcut display strings manually
  const openFileShortcutDisplay = isMac ? "⌘O" : "Ctrl+O";
  const exportFileShortcutDisplay = isMac ? "⇧⌘E" : "Ctrl+Shift+E"; // Shift+Cmd+E or Ctrl+Shift+E
  const undoShortcutDisplay = isMac ? "⌘Z" : "Ctrl+Z";
  const redoShortcutDisplay = isMac ? "⇧⌘Z" : "Ctrl+Shift+Z"; // Shift+Cmd+Z or Ctrl+Shift+Z

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background p-4 sm:static sm:h-auto sm:border-0 sm:bg-transparent sm:p-6">
      <div className="flex items-center gap-2">
        <Image src="/QuikLens.svg" alt="QuikLens" width={40} height={40} />
        <h1 className="text-3xl font-semibold">QuikLens</h1>
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
              <DropdownMenuShortcut>{openFileShortcutDisplay}</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onExportClick} disabled={!canExport}>
              <FileDown className="mr-2 h-4 w-4"/>
              Export Image
              <DropdownMenuShortcut>{exportFileShortcutDisplay}</DropdownMenuShortcut>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">Edit</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={undo} disabled={!canUndo} title="Undo">
              <Undo2 className="h-4 w-4" />
              Undo
              <DropdownMenuShortcut>{undoShortcutDisplay}</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={redo} disabled={!canRedo} title="Redo">
              <Redo2 className="h-4 w-4" />
              Redo
              <DropdownMenuShortcut>{redoShortcutDisplay}</DropdownMenuShortcut>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex ml-auto gap-2">
        <ModeToggle />
      </div>
    </header>
  );
}