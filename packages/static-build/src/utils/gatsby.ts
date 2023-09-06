import { isErrnoException } from '@vercel/error-utils';
import fs from 'fs-extra';
import * as path from 'path';
import semver from 'semver';
import { fileExists } from './_shared';

const PLUGINS = [
  '@vercel/gatsby-plugin-vercel-analytics',
  '@vercel/gatsby-plugin-vercel-builder',
] as const;
type PluginName = typeof PLUGINS[number];

const GATSBY_CONFIG_FILE = 'gatsby-config';
const GATSBY_NODE_FILE = 'gatsby-node';

const _require: typeof require = (0, eval)('require');

const PLUGIN_PATHS: Record<PluginName, string> = {
  '@vercel/gatsby-plugin-vercel-analytics': path.dirname(
    _require.resolve(`@vercel/gatsby-plugin-vercel-analytics/package.json`)
  ),
  '@vercel/gatsby-plugin-vercel-builder': path.dirname(
    _require.resolve(`@vercel/gatsby-plugin-vercel-builder/package.json`)
  ),
};

let GLOBAL_EXIT_HANDLER: undefined | (() => void);

export async function injectPlugins(
  detectedVersion: string | null,
  dir: string
) {
  const plugins = new Set<PluginName>();

  if (detectedVersion) {
    const version = semver.coerce(detectedVersion);
    if (version && semver.satisfies(version, '>=4.0.0')) {
      plugins.add('@vercel/gatsby-plugin-vercel-builder');

      if (!GLOBAL_EXIT_HANDLER) {
        GLOBAL_EXIT_HANDLER = () => {
          cleanupGatsbyFiles(dir);
        };
        process.on('exit', GLOBAL_EXIT_HANDLER);
      }
    }
  }

  if (process.env.VERCEL_ANALYTICS_ID) {
    process.env.GATSBY_VERCEL_ANALYTICS_ID = process.env.VERCEL_ANALYTICS_ID;
    plugins.add('@vercel/gatsby-plugin-vercel-analytics');
  }

  if (plugins.size === 0) {
    return false;
  }

  let pluginsStr = 'plugin';
  if (plugins.size > 1) {
    pluginsStr += 's';
  }
  console.log(
    `Injecting Gatsby.js ${pluginsStr} ${Array.from(plugins)
      .map(p => `"${p}"`)
      .join(', ')}`
  );

  const ops = [];

  if (plugins.has('@vercel/gatsby-plugin-vercel-analytics')) {
    ops.push(
      updateGatsbyConfig(dir, ['@vercel/gatsby-plugin-vercel-analytics'])
    );
  }

  if (plugins.has('@vercel/gatsby-plugin-vercel-builder')) {
    ops.push(updateGatsbyNode(dir));
  }

  await Promise.all(ops);

  return true;
}

async function updateGatsbyConfig(dir: string, plugins: string[]) {
  const gatsbyConfigPathTs = path.join(dir, `${GATSBY_CONFIG_FILE}.ts`);
  const gatsbyConfigPathMjs = path.join(dir, `${GATSBY_CONFIG_FILE}.mjs`);
  const gatsbyConfigPathJs = path.join(dir, `${GATSBY_CONFIG_FILE}.js`);
  if (await fileExists(gatsbyConfigPathTs)) {
    await updateGatsbyConfigTs(gatsbyConfigPathTs, plugins);
  } else if (await fileExists(gatsbyConfigPathMjs)) {
    await updateGatsbyConfigMjs(gatsbyConfigPathMjs, plugins);
  } else if (await fileExists(gatsbyConfigPathJs)) {
    await updateGatsbyConfigJs(gatsbyConfigPathJs, plugins);
  } else {
    await fs.writeFile(
      gatsbyConfigPathJs,
      `${GENERATED_FILE_COMMENT}
module.exports = ${JSON.stringify({ plugins })}`
    );
  }
}

const GENERATED_FILE_COMMENT = `// This file was generated by @vercel/static-build`;

async function updateGatsbyConfigTs(
  configPath: string,
  plugins: string[]
): Promise<void> {
  const renamedPath = `${configPath}.__vercel_builder_backup__.ts`;
  if (!(await fileExists(renamedPath))) {
    await fs.rename(configPath, renamedPath);
  }

  await fs.writeFile(
    configPath,
    `${GENERATED_FILE_COMMENT}
import userConfig from "./gatsby-config.ts.__vercel_builder_backup__.ts";
import type { PluginRef } from "gatsby";

const preferDefault = (m: any) => (m && m.default) || m;

const vercelConfig = Object.assign(
  {},
  preferDefault(userConfig)
);

if (!vercelConfig.plugins) {
  vercelConfig.plugins = [];
}

for (const plugin of ${JSON.stringify(plugins)}) {
  const hasPlugin = vercelConfig.plugins.find(
    (p: PluginRef) =>
      p && (p === plugin || p.resolve === plugin)
  );

  if (!hasPlugin) {
    vercelConfig.plugins = vercelConfig.plugins.slice();
    vercelConfig.plugins.push(plugin);
  }
}

export default vercelConfig;
`
  );
}

async function updateGatsbyConfigMjs(
  configPath: string,
  plugins: string[]
): Promise<void> {
  const renamedPath = `${configPath}.__vercel_builder_backup__.mjs`;
  if (!(await fileExists(renamedPath))) {
    await fs.rename(configPath, renamedPath);
  }

  await fs.writeFile(
    configPath,
    `${GENERATED_FILE_COMMENT}
import userConfig from "./gatsby-config.mjs.__vercel_builder_backup__.mjs";

const preferDefault = (m) => (m && m.default) || m;

const vercelConfig = Object.assign(
  {},
  preferDefault(userConfig)
);

if (!vercelConfig.plugins) {
  vercelConfig.plugins = [];
}

for (const plugin of ${JSON.stringify(plugins)}) {
  const hasPlugin = vercelConfig.plugins.find(
    (p) => p && (p === plugin || p.resolve === plugin)
  );

  if (!hasPlugin) {
    vercelConfig.plugins = vercelConfig.plugins.slice();
    vercelConfig.plugins.push(plugin);
  }
}

export default vercelConfig;
`
  );
}

async function updateGatsbyConfigJs(
  configPath: string,
  plugins: string[]
): Promise<void> {
  const renamedPath = `${configPath}.__vercel_builder_backup__.js`;
  if (!(await fileExists(renamedPath))) {
    await fs.rename(configPath, renamedPath);
  }

  await fs.writeFile(
    configPath,
    `${GENERATED_FILE_COMMENT}
const userConfig = require("./gatsby-config.js.__vercel_builder_backup__.js");

const preferDefault = m => (m && m.default) || m;

const vercelConfig = Object.assign(
  {},
  preferDefault(userConfig)
);

if (!vercelConfig.plugins) {
  vercelConfig.plugins = [];
}

for (const plugin of ${JSON.stringify(plugins)}) {
  const hasPlugin = vercelConfig.plugins.find(
    (p) => p && (p === plugin || p.resolve === plugin)
  );

  if (!hasPlugin) {
    vercelConfig.plugins = vercelConfig.plugins.slice();
    vercelConfig.plugins.push(plugin);
  }
}
module.exports = vercelConfig;
`
  );
}

async function updateGatsbyNode(dir: string) {
  const gatsbyNodePathTs = path.join(dir, `${GATSBY_NODE_FILE}.ts`);
  const gatsbyNodePathMjs = path.join(dir, `${GATSBY_NODE_FILE}.mjs`);
  const gatsbyNodePathJs = path.join(dir, `${GATSBY_NODE_FILE}.js`);
  if (await fileExists(gatsbyNodePathTs)) {
    await updateGatsbyNodeTs(gatsbyNodePathTs);
  } else if (await fileExists(gatsbyNodePathMjs)) {
    await updateGatsbyNodeMjs(gatsbyNodePathMjs);
  } else if (await fileExists(gatsbyNodePathJs)) {
    await updateGatsbyNodeJs(gatsbyNodePathJs);
  } else {
    await fs.writeFile(
      gatsbyNodePathJs,
      `${GENERATED_FILE_COMMENT}
module.exports = require('@vercel/gatsby-plugin-vercel-builder/gatsby-node.js');`
    );
  }
}

async function updateGatsbyNodeTs(configPath: string) {
  const renamedPath = `${configPath}.__vercel_builder_backup__.ts`;
  if (!(await fileExists(renamedPath))) {
    await fs.rename(configPath, renamedPath);
  }

  await fs.writeFile(
    configPath,
    `${GENERATED_FILE_COMMENT}
import type { GatsbyNode } from 'gatsby';
import * as vercelBuilder from '@vercel/gatsby-plugin-vercel-builder/gatsby-node.js';
import * as gatsbyNode from './gatsby-node.ts.__vercel_builder_backup__.ts';

export * from './gatsby-node.ts.__vercel_builder_backup__.ts';

export const onPostBuild: GatsbyNode['onPostBuild'] = async (args, options) => {
  if (typeof (gatsbyNode as any).onPostBuild === 'function') {
    await (gatsbyNode as any).onPostBuild(args, options);
  }
  await vercelBuilder.onPostBuild(args, options);
};
`
  );
}

async function updateGatsbyNodeMjs(configPath: string) {
  const renamedPath = `${configPath}.__vercel_builder_backup__.mjs`;
  if (!(await fileExists(renamedPath))) {
    await fs.rename(configPath, renamedPath);
  }

  await fs.writeFile(
    configPath,
    `${GENERATED_FILE_COMMENT}
import * as vercelBuilder from '@vercel/gatsby-plugin-vercel-builder/gatsby-node.js';
import * as gatsbyNode from './gatsby-node.mjs.__vercel_builder_backup__.mjs';

export * from './gatsby-node.mjs.__vercel_builder_backup__.mjs';

export const onPostBuild = async (args, options) => {
  if (typeof gatsbyNode.onPostBuild === 'function') {
    await gatsbyNode.onPostBuild(args, options);
  }
  await vercelBuilder.onPostBuild(args, options);
};
`
  );
}

async function updateGatsbyNodeJs(configPath: string) {
  const renamedPath = `${configPath}.__vercel_builder_backup__.js`;
  if (!(await fileExists(renamedPath))) {
    await fs.rename(configPath, renamedPath);
  }

  await fs.writeFile(
    configPath,
    `${GENERATED_FILE_COMMENT}
const vercelBuilder = require('@vercel/gatsby-plugin-vercel-builder/gatsby-node.js');
const gatsbyNode = require('./gatsby-node.js.__vercel_builder_backup__.js');

const origOnPostBuild = gatsbyNode.onPostBuild;

gatsbyNode.onPostBuild = async (args, options) => {
  if (typeof origOnPostBuild === 'function') {
    await origOnPostBuild(args, options);
  }
  await vercelBuilder.onPostBuild(args, options);
};

module.exports = gatsbyNode;
`
  );
}

// must remain sync because it's called in an exit handler
export function cleanupGatsbyFiles(dir: string) {
  try {
    const backup = '.__vercel_builder_backup__';
    const fileEndings = ['.js', '.ts', '.mjs'];

    for (const fileName of [GATSBY_CONFIG_FILE, GATSBY_NODE_FILE]) {
      for (const fileEnding of fileEndings) {
        const baseFile = `${fileName}${fileEnding}`;
        const baseFilePath = path.join(dir, baseFile);
        const backupFile = `${baseFile}${backup}${fileEnding}`;
        const backupFilePath = path.join(dir, backupFile);

        const baseFileContent = tryReadFileSync(baseFilePath);
        const backupFileContent = tryReadFileSync(backupFilePath);

        if (
          baseFileContent &&
          baseFileContent.startsWith(GENERATED_FILE_COMMENT)
        ) {
          fs.rmSync(baseFilePath);
        }

        if (backupFileContent) {
          fs.renameSync(backupFilePath, baseFilePath);
        }
      }
    }
  } catch (error) {
    console.error(error);

    if (GLOBAL_EXIT_HANDLER) {
      process.off('exit', GLOBAL_EXIT_HANDLER);
    }
  }
}

export async function createPluginSymlinks(dir: string) {
  const nodeModulesDir = path.join(dir, 'node_modules');
  await fs.ensureDir(path.join(nodeModulesDir, '@vercel'));
  await Promise.all(
    PLUGINS.map(name => fs.remove(path.join(nodeModulesDir, name)))
  );
  await Promise.all(
    PLUGINS.map(name =>
      fs.symlink(PLUGIN_PATHS[name], path.join(nodeModulesDir, name))
    )
  );
}

function tryReadFileSync(filePath: string) {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (error: unknown) {
    if (isErrnoException(error)) {
      if (error.code !== 'ENOENT') {
        console.error(error);
      }
    } else {
      console.error(error);
    }

    return undefined;
  }
}
