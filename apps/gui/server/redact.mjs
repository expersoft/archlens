// What leaves the server in an error message must not describe this machine.

const last = path => path.replace(/[\\/]+$/, '').split(/[\\/]/).at(-1);

/**
 * Text with absolute paths of this machine cut down to their last name (`/srv/bases/loja/model.json` → `model.json`):
 * the message still says which file, not where the server keeps it. URLs, relative paths and ids stay as they are.
 */
export const hideMachinePaths = text => String(text)
  .replace(/(?<![\w:/.@-])\/(?:[^\s'"`:/]+\/)+[^\s'"`:/]*/g, last)
  .replace(/(?<!\w)[A-Za-z]:\\(?:[^\s'"`:\\]+\\)*[^\s'"`:\\]*/g, last);
