import type { Framework } from '@vercel/frameworks';

/**
 * The supported list of workspace managers.
 *
 * This list is designed to work with the @see {@link detectFramework} function.
 *
 * @example
 *   import { workspaceManagers as frameworkList } from '@vercel/build-utils'
 *   import { detectFramework } from '@vercel/build-utils'
 *
 *   const fs = new GitDetectorFilesystem(...)
 *   detectFramwork({ fs, frameworkList }) // returns the 'slug' field if detected, otherwise null
 *
 * @todo Will be used by the detect-eligible-projects API endpoint for a given git url.
 */
export const workspaceManagers: Array<
  Omit<Framework, 'description' | 'logo' | 'settings' | 'getOutputDirName'>
> = [
  {
    name: 'Yarn',
    slug: 'yarn',
    detectors: {
      every: [
        {
          path: 'package.json',
          matchContent:
            '"workspaces":\\s*(?:\\[[^\\]]*]|{[^}]*"packages":[^}]*})',
        },
        {
          path: 'yarn.lock',
        },
      ],
    },
  },
  {
    name: 'pnpm',
    slug: 'pnpm',
    detectors: {
      every: [
        {
          path: 'pnpm-workspace.yaml',
        },
      ],
    },
  },
  {
    name: 'npm',
    slug: 'npm',
    detectors: {
      every: [
        {
          path: 'package.json',
          matchContent:
            '"workspaces":\\s*(?:\\[[^\\]]*]|{[^}]*"packages":[^}]*})',
        },
        {
          path: 'package-lock.json',
        },
      ],
    },
  },
];

export default workspaceManagers;
