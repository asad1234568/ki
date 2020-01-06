import { intersects } from 'semver';
import boxen from 'boxen';
import { NodeVersion } from '../types';
import { NowBuildError } from '../errors';
import debug from '../debug';

const allOptions: NodeVersion[] = [
  { major: 12, range: '12.x', runtime: 'nodejs12.x' },
  { major: 10, range: '10.x', runtime: 'nodejs10.x' },
  {
    major: 8,
    range: '8.10.x',
    runtime: 'nodejs8.10',
    discontinueDate: new Date('2020-01-06'),
  },
];

const supportedOptions = allOptions.filter(o => !isDiscontinued(o));
const pleaseUse =
  'Please use one of the following `engines` in your `package.json`: ' +
  JSON.stringify(supportedOptions.map(o => o.range));
const pleaseAdd =
  'Please add "engines": { "node": "' +
  getLatestNodeVersion().range +
  '" } to your `package.json` file.';
const upstreamProvider =
  'This change is the result of a decision made by an upstream infrastructure provider (AWS).' +
  '\nRead more: https://docs.aws.amazon.com/lambda/latest/dg/runtime-support-policy.html';

export function getOldestNodeVersion(): NodeVersion {
  return allOptions[allOptions.length - 1];
}

export function getLatestNodeVersion(): NodeVersion {
  return allOptions[0];
}

export async function getSupportedNodeVersion(
  engineRange?: string,
  isAuto?: boolean
): Promise<NodeVersion> {
  let selection = getOldestNodeVersion();

  if (engineRange) {
    const found = allOptions.some(o => {
      // the array is already in order so return the first
      // match which will be the newest version of node
      selection = o;
      return intersects(o.range, engineRange);
    });
    if (!found) {
      const intro =
        isAuto || !engineRange
          ? 'This project is using an invalid version of Node.js and must be changed.'
          : 'Found `engines` in `package.json` with an invalid Node.js version range: ' +
            engineRange;
      throw new NowBuildError({
        code: 'NOW_BUILD_UTILS_NODE_VERSION_INVALID',
        message: intro + '\n' + pleaseUse,
      });
    }
  }

  if (isDiscontinued(selection)) {
    const intro =
      isAuto || !engineRange
        ? 'This project is using a discontinued version of Node.js and must be upgraded.' +
          '\n' +
          pleaseAdd
        : 'Found `engines` in `package.json` with a discontinued Node.js version range: ' +
          engineRange +
          '\n' +
          pleaseUse;
    throw new NowBuildError({
      code: 'NOW_BUILD_UTILS_NODE_VERSION_DISCONTINUED',
      message: intro + '\n' + upstreamProvider,
    });
  }

  debug(
    isAuto || !engineRange
      ? 'Using default Node.js range: ' + selection.range
      : (engineRange ? 'Found' : 'Missing') +
          ' `engines` in `package.json`, selecting range: ' +
          selection.range
  );

  if (selection.discontinueDate) {
    const d = selection.discontinueDate.toISOString().split('T')[0];
    console.warn(
      boxen(
        'NOTICE' +
          '\n' +
          `\nNode.js version ${selection.range} has reached end-of-life.` +
          `\nAs a result, deployments created on or after ${d} will fail to build.` +
          '\n' +
          (isAuto || !engineRange ? pleaseAdd : pleaseUse) +
          '\n' +
          upstreamProvider,
        { padding: 1 }
      )
    );
  }

  return selection;
}

function isDiscontinued({ discontinueDate }: NodeVersion): boolean {
  const today = Date.now();
  return discontinueDate !== undefined && discontinueDate.getTime() <= today;
}
