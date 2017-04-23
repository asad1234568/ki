#!/usr/bin/env node

// Packages
const chalk = require('chalk');
const isURL = require('is-url');
const minimist = require('minimist');
const ms = require('ms');
const table = require('text-table');
const printf = require('printf');

// Ours
const cfg = require('../lib/cfg');
const { handleError, error } = require('../lib/error');
const NowScale = require('../lib/scale');
const login = require('../lib/login');
const exit = require('../lib/utils/exit');
const logo = require('../lib/utils/output/logo');
const strlen = require('../lib/strlen');
const info = require('../lib/scale-info');
const argv = minimist(process.argv.slice(2), {
  string: ['config', 'token'],
  boolean: ['help', 'debug', 'auto'],
  number: ['min', 'max'],
  alias: { help: 'h', config: 'c', debug: 'd', base64: 'b', token: 't' }
});

let id = argv._[0];
const scaleArg = argv._[1];

// Options
const help = () => {
  console.log(
    `
  ${chalk.bold(`${logo} now scale`)} ls
  ${chalk.bold(`${logo} now scale`)} <url> [min and max scale]

  ${chalk.dim('Options:')}

    -h, --help              Output usage information
    -c ${chalk.bold.underline('FILE')}, --config=${chalk.bold.underline('FILE')}  Config file
    -d, --debug             Debug mode [off]
    --min                   Minimum number of instances to be running at any given time
    --min                   Maximum number of instances to be running at any given time

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} Create an deployment with 3 instances, never sleeps:

    ${chalk.cyan('$ now scale my-deployment-ntahoeato.now.sh 3')}

  ${chalk.gray('–')} Create an automatically scaling deployment:

    ${chalk.cyan('$ now scale my-deployment-ntahoeato.now.sh --min 1 --max 5')}

  ${chalk.gray('–')} Create an automatically scaling deployment without specifying max:

    ${chalk.cyan('$ now scale my-deployment-ntahoeato.now.sh --min 1 --auto')}

  ${chalk.gray('–')} Create an automatically scaling deployment without specifying min or max:

    ${chalk.cyan('$ now scale my-deployment-ntahoeato.now.sh --auto')}

  ${chalk.gray('–')} Create an deployment that is always active and never "sleeps":

    ${chalk.cyan('$ now scale my-deployment-ntahoeato.now.sh --min 1 --max 1')}
  `
  );
};

// Options
const debug = argv.debug;
const apiUrl = argv.url || 'https://api.zeit.co';

if (argv.config) {
  cfg.setConfigFile(argv.config);
}

if (argv.help) {
  help();
  exit(0);
} else {
  const config = cfg.read();
  Promise.resolve(argv.token || config.token || login(apiUrl))
    .then(async token => {
      try {
        await run(token);
      } catch (err) {
        error(`Unknown error: ${err}\n${err.stack}`);
        process.exit(1);
      }
    })
    .catch(e => {
      error(`Authentication error – ${e.message}`);
      process.exit(1);
    });
}

async function run(token) {
  const scale = new NowScale(apiUrl, token, { debug });
  const start = Date.now();

  if (id === 'ls') {
    await list(scale);
    process.exit(0);
  } else if (id === 'info') {
    await info(scale);
    process.exit(0);
  } else if (id) {
    // Normalize URL by removing slash from the end
    if (isURL(id) && id.slice(-1) === '/') {
      id = id.slice(0, -1);
    }
  } else {
    error('Please specify a deployment: now scale <id|url>');
    help();
    exit(1);
  }

  const deployments = await scale.list();

  const match = deployments.find(d => {
    // `url` should match the hostname of the deployment
    let u = id.replace(/^https:\/\//i, '');

    if (u.indexOf('.') === -1) {
      // `.now.sh` domain is implied if just the subdomain is given
      u += '.now.sh';
    }

    return d.uid === id || d.name === id || d.url === u;
  });

  if (!match) {
    error(`Could not find any deployments matching ${id}`);
    return process.exit(1);
  }

  const { min, max, auto: _auto } = Number.isInteger(scaleArg)
    ? { min: scaleArg, max: scaleArg }
    : argv;

  // Only send a `true` auto if it was specified, otherwise send null
  const auto = _auto || null;
  if (!Number.isInteger(min) && !Number.isInteger(max) && !auto) {
    error(
      'Please specify at least one of the following flags: --min <n>, --max <n>, --auto'
    );
    help();
    exit(1);
  }

  const { max: currentMax, min: currentMin, current: currentCurrent} = match.scale;
  if (max === currentMax && min === currentMin && currentCurrent >= min && currentCurrent <= max) {
    console.log(`> Done`)
    return
  }

  if (match.state === 'FROZEN' || match.scale.current === 0) {
    console.log(`> Deployment is currently in 0 replicas, preparing deployment for scaling...`)
    await scale.unfreeze(match);
  }

  await scale.setScale(match.uid, { min, max, auto });

  const elapsed = ms(new Date() - start);

  const t = table(
    [
      ['  min', chalk.bold(min)],
      ['  max', chalk.bold(max)],
      [' auto', chalk.bold(auto === null && min !== max ? '✔' : '✖')]
    ],
    { align: ['r', 'l'], hsep: ' '.repeat(2), stringLength: strlen }
  );

  const currentReplicas = match.scale.current;
  console.log(
    `${chalk.cyan('> Configured scaling rules')} [${elapsed}]

${chalk.bold(match.url)} (${chalk.gray(currentReplicas)} ${chalk.gray('current')})
${t}
  `
  );
  await info(scale, match.url);

  scale.close();
}

async function list(scale) {
  let deployments;
  try {
    const app = argv._[1];
    deployments = await scale.list(app);
  } catch (err) {
    handleError(err);
    process.exit(1);
  }

  scale.close();

  const apps = new Map();

  for (const dep of deployments) {
    const deps = apps.get(dep.name) || [];
    apps.set(dep.name, deps.concat(dep));
  }

  const timeNow = new Date();
  const urlLength = deployments.reduce(
    (acc, i) => {
      return Math.max(acc, (i.url && i.url.length) || 0);
    },
    0
  ) + 5;

  for (const app of apps) {
    const depls = argv.all ? app[1] : app[1].slice(0, 5);
    console.log(
      `${chalk.bold(app[0])} ${chalk.gray('(' + depls.length + ' of ' + app[1].length + ' total)')}`
    );
    console.log();
    const urlSpec = `%-${urlLength}s`;
    console.log(
      printf(
        ` ${chalk.grey(urlSpec + '  %8s %8s %8s %8s %8s')}`,
        'url',
        'cur',
        'min',
        'max',
        'auto',
        'age'
      )
    );
    for (const instance of depls) {
      if (instance.scale.current > 0) {
        console.log(
          printf(
            ` %-${urlLength + 10}s %8s %8s %8s %8s %8s`,
            chalk.underline(instance.url),
            instance.scale.current,
            instance.scale.min,
            instance.scale.max,
            instance.scale.max === instance.scale.min ? '✖' : '✔',
            ms(timeNow - instance.created)
          )
        );
      } else {
        console.log(
          printf(
            ` %-${urlLength + 10}s ${chalk.gray('%8s %8s %8s %8s %8s')}`,
            chalk.underline(instance.url),
            instance.scale.current,
            instance.scale.min,
            instance.scale.max,
            instance.scale.max === instance.scale.min ? '✖' : '✔',
            ms(timeNow - instance.created)
          )
        );
      }
    }
    console.log();
  }
}

process.on('uncaughtException', err => {
  handleError(err);
  exit(1);
});
