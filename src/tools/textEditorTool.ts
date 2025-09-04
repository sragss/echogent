import { anthropic } from '@ai-sdk/anthropic';

export const textEditorTool = anthropic.tools.textEditor_20250429({
  execute: async ({
    command,
    path,
    file_text,
    insert_line,
    new_str,
    old_str,
    view_range,
  }) => {
    try {
      const file = Bun.file(path);
      
      switch (command) {
        case 'view': {
          if (!(await file.exists())) {
            return `Error: File or directory '${path}' does not exist.`;
          }
          
          const stat = await file.stat();
          if (stat.isDirectory()) {
            const entries = [];
            for await (const entry of new Bun.Glob('*').scan(path)) {
              const fullPath = `${path}/${entry}`;
              const entryFile = Bun.file(fullPath);
              const entryStat = await entryFile.stat();
              entries.push(`${entryStat.isDirectory() ? 'd' : '-'} ${entry}`);
            }
            return `Directory listing for '${path}':\n${entries.join('\n')}`;
          }
          
          const content = await file.text();
          const lines = content.split('\n');
          
          if (view_range && view_range.length === 2) {
            const [start, end] = view_range;
            if (start == null || end == null) {
              return `Error: view_range must provide start and end numbers.`;
            }
            const selectedLines = lines.slice(Math.max(0, start - 1), Math.min(lines.length, end));
            return selectedLines.map((line, i) => `${start + i}: ${line}`).join('\n');
          }
          
          return lines.map((line, i) => `${i + 1}: ${line}`).join('\n');
        }
        
        case 'create': {
          if (await file.exists()) {
            return `Error: File '${path}' already exists.`;
          }
          
          if (!file_text) {
            return `Error: file_text is required for create command.`;
          }
          
          await Bun.write(path, file_text);
          return `File '${path}' created successfully.`;
        }
        
        case 'str_replace': {
          if (!old_str || !new_str) {
            return `Error: Both old_str and new_str are required for str_replace command.`;
          }
          
          if (!(await file.exists())) {
            return `Error: File '${path}' does not exist.`;
          }
          
          const content = await file.text();
          if (!content.includes(old_str)) {
            return `Error: String '${old_str}' not found in file '${path}'.`;
          }
          
          const newContent = content.replace(old_str, new_str);
          await Bun.write(path, newContent);
          return `String replacement completed in '${path}'.`;
        }
        
        case 'insert': {
          if (!new_str || insert_line === undefined) {
            return `Error: Both new_str and insert_line are required for insert command.`;
          }
          
          if (!(await file.exists())) {
            return `Error: File '${path}' does not exist.`;
          }
          
          const content = await file.text();
          const lines = content.split('\n');
          
          if (insert_line < 0 || insert_line > lines.length) {
            return `Error: insert_line ${insert_line} is out of range. File has ${lines.length} lines.`;
          }
          
          lines.splice(insert_line, 0, new_str);
          const newContent = lines.join('\n');
          await Bun.write(path, newContent);
          return `Line inserted at line ${insert_line + 1} in '${path}'.`;
        }
        
        default:
          return `Error: Unknown command '${command}'. Supported commands: view, create, str_replace, insert.`;
      }
    } catch (error) {
      return `Error: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
});