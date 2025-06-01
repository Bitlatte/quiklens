export interface ShortcutConfigItem {
  id: string; // Unique identifier for the action (e.g., 'undo', 'redo', 'openFile')
  name: string; // User-friendly name for display or customization UI
  key: string; // The main key (e.g., 'Z', 'O', 'S'). Will be matched case-insensitively.
  metaOrCtrl: boolean; // True if EITHER Meta (Cmd on Mac) OR Ctrl should be pressed
  shift?: boolean; // True if Shift key should be pressed (defaults to false)
  alt?: boolean; // True if Alt key should be pressed (defaults to false)
  preventDefault?: boolean; // Whether to call event.preventDefault() (defaults to true for most actions)
}

// This array holds the default global shortcuts.
// In the future, this could be loaded from user settings.
export const globalShortcutConfig: ShortcutConfigItem[] = [
  {
    id: 'undo',
    name: 'Undo',
    key: 'Z', // Corresponds to event.key 'z' or 'Z'
    metaOrCtrl: true,
    shift: false, // Cmd/Ctrl + Z
    preventDefault: true,
  },
  {
    id: 'redo',
    name: 'Redo',
    key: 'Z',
    metaOrCtrl: true,
    shift: true, // Cmd/Ctrl + Shift + Z
    preventDefault: true,
  },
  {
    id: 'openFile',
    name: 'Open File',
    key: 'O',
    metaOrCtrl: true,
    preventDefault: true,
  },
  {
    id: 'exportFile',
    name: 'Export File',
    key: 'E',
    metaOrCtrl: true,
    shift: true,
  }
];
