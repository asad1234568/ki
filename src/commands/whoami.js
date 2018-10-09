#!/usr/bin/env node

// Packages
const mri = require('mri');
const chalk = require('chalk');

// Utilities
const logo = require('../util/output/logo');
const { handleError } = require('../util/error');
const getContextName = require('../util/get-context-name');

const help = () => {
  console.log(`
  ${chalk.bold(`${logo} now whoami`)}

  ${chalk.dim('Options:')}

    -h, --help                     Output usage information
    -A ${chalk.bold.underline('FILE')}, --local-config=${chalk.bold.underline(
    'FILE'
  )}   Path to the local ${'`now.json`'} file
    -Q ${chalk.bold.underline('DIR')}, --global-config=${chalk.bold.underline(
    'DIR'
  )}    Path to the global ${'`.now`'} directory
    -d, --debug                    Debug mode [off]
    -t ${chalk.bold.underline('TOKEN')}, --token=${chalk.bold.underline(
    'TOKEN'
  )}        Login token

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} Shows the currently logged in username

    ${chalk.cyan('$ now whoami')}
`);
};

// Options
let argv;

const main = async ctx => {
  argv = mri(ctx.argv.slice(2), {
    boolean: ['help', 'debug', 'all'],
    alias: {
      help: 'h',
      debug: 'd'
    }
  });

  argv._ = argv._.slice(1);

  if (argv.help || argv._[0] === 'help') {
    help();
    process.exit(0);
  }

  const debug = argv['--debug'];
  const {authConfig: { token }, config: { currentTeam }, apiUrl} = ctx;
  const {contextName} = await getContextName({ apiUrl, token, debug, currentTeam });

  await whoami(contextName);
};

module.exports = async ctx => {
  try {
    await main(ctx);
  } catch (err) {
    handleError(err);
    process.exit(1);
  }
};

async function whoami(contextName) {
  if (process.stdout.isTTY) {
    process.stdout.write('> ');
  }

  console.log(contextName);
}
