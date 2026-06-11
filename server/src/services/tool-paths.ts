import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface ImageMagickCommands {
  identify: string[];
  convert: string[];
}

type PopplerCommand = 'pdftoppm' | 'pdftotext' | 'pdfinfo';

const POPPLER_PATH_ENV_BY_COMMAND: Record<PopplerCommand, string> = {
  pdftoppm: 'PDFTOPPM_PATH',
  pdftotext: 'PDFTOTEXT_PATH',
  pdfinfo: 'PDFINFO_PATH',
};

function stripShellQuotes(value: string): string {
  return value.replace(/^['"]|['"]$/g, '');
}

function splitEnvPathList(value: string | undefined): string[] {
  return (value || '')
    .split(path.delimiter)
    .map((entry) => stripShellQuotes(entry.trim()))
    .filter(Boolean);
}

function executableName(command: string): string {
  if (process.platform !== 'win32' || command.toLowerCase().endsWith('.exe')) {
    return command;
  }
  return `${command}.exe`;
}

function toolPathCandidates(
  command: string,
  executableEnvNames: string[],
  directoryEnvNames: string[],
): string[] {
  const explicitPaths = executableEnvNames.flatMap((envName) => splitEnvPathList(process.env[envName]));
  const directoryPaths = directoryEnvNames.flatMap((envName) =>
    splitEnvPathList(process.env[envName]).map((directory) => path.join(directory, executableName(command))),
  );
  return [...explicitPaths, ...directoryPaths];
}

export function popplerCommandCandidates(command: PopplerCommand): string[] {
  return toolPathCandidates(command, [POPPLER_PATH_ENV_BY_COMMAND[command]], ['POPPLER_PATH']);
}

export function resolveCommand(command: string, candidates: string[] = []): string | null {
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  try {
    const locator = process.platform === 'win32' ? 'where' : 'which';
    const output = execFileSync(locator, [command], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return output.split(/\r?\n/).find(Boolean)?.trim() || null;
  } catch {
    return null;
  }
}

export function requireCommand(command: string, candidates: string[] = [], purpose = 'local execution'): string {
  const resolved = resolveCommand(command, candidates);
  if (!resolved) {
    throw new Error(`${command} is required for ${purpose} but was not found in PATH or configured tool paths`);
  }
  return resolved;
}

export function resolveImageMagickCommands(): ImageMagickCommands | null {
  const magickPath = resolveCommand(
    'magick',
    toolPathCandidates('magick', ['MAGICK_PATH'], ['IMAGEMAGICK_PATH']),
  );
  if (magickPath) {
    return {
      identify: [magickPath, 'identify'],
      convert: [magickPath],
    };
  }

  const identifyPath = resolveCommand(
    'identify',
    toolPathCandidates('identify', ['IDENTIFY_PATH'], ['IMAGEMAGICK_PATH']),
  );
  const convertPath = resolveCommand(
    'convert',
    toolPathCandidates('convert', ['CONVERT_PATH'], ['IMAGEMAGICK_PATH']),
  );
  if (!identifyPath || !convertPath) {
    return null;
  }

  return {
    identify: [identifyPath],
    convert: [convertPath],
  };
}

export function requireImageMagickCommands(purpose = 'local execution'): ImageMagickCommands {
  const commands = resolveImageMagickCommands();
  if (!commands) {
    throw new Error(`ImageMagick is required for ${purpose} but was not found in PATH or configured tool paths`);
  }
  return commands;
}
