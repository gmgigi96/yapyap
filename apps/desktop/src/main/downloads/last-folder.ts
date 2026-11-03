import { Type } from 'typebox';
import { readChecked, type TextFile } from '../support/atomic-write.ts';

const FileSchema = Type.Object({ lastFolder: Type.String() });

export interface LastFolder {
  readonly get: () => string | undefined;
  readonly set: (folder: string) => void;
}

/** Where the user last saved a download they were asked about (#74). */
export function lastFolderIn(file: TextFile): LastFolder {
  let folder = readChecked(file, FileSchema)?.lastFolder;
  return {
    get: () => folder,
    set: (next) => {
      folder = next;
      file.write(JSON.stringify({ lastFolder: next }));
    },
  };
}
